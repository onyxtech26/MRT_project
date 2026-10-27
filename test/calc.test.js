const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../src/renderer/calc.js');
const seed = require('../src/seed.json');

test('watch line follows the Excel sheet (SUBMARINE 24/10)', () => {
  const sub = seed.stock.watches.find((w) => w.code === 'SUB');
  const r = Calc.watchRow(seed.stock, sub);
  assert.strictEqual(r.bal, 70);
  assert.strictEqual(r.shop, 69);
});

test('linked battery / strap lines take totals from their sheets', () => {
  const s = seed.stock;
  const row = (code) => Calc.watchRow(s, s.watches.find((w) => w.code === code));
  assert.deepStrictEqual([row('S-BAT').total, row('S-BAT').sOut, row('S-BAT').bal], [590, 5, 585]);
  assert.deepStrictEqual([row('R-BAT').total, row('R-BAT').bal], [85, 84]);
  assert.strictEqual(row('LS').total, 217);
  assert.strictEqual(row('PS').total, 81);
  assert.strictEqual(Calc.stockTotals(s).total, 1990);
});

test('battery IN raises SHOP but not BAL until HQ updates', () => {
  const it = { total: 100, inn: 20 };
  assert.deepStrictEqual(Calc.itemRow(it), { total: 100, out: 0, bal: 100, shop: 120 });
  // next day: HQ still not updated -> shop is remembered
  const stock = { watches: [], strap: [], battery: [{ code: 'S-BAT', items: [it] }] };
  const next = Calc.rollStockForward(stock, '2026-10-25');
  const it2 = next.battery[0].items[0];
  assert.strictEqual(it2.total, 100);
  assert.strictEqual(it2.inn, 20); // IN stays until the staff clears it
  assert.strictEqual(Calc.itemRow(it2).shop, 120); // ...but is not counted twice
  // one sold
  it2.out = 1;
  assert.deepStrictEqual(Calc.itemRow(it2), { total: 100, out: 1, bal: 99, shop: 119 });
  // HQ updates: staff types the HQ total and clears IN -> SHOP does not move
  it2.total = 119;
  it2.inn = null;
  assert.deepStrictEqual(Calc.itemRow(it2), { total: 119, out: 1, bal: 118, shop: 119 });
});

test('new day copies BAL->TOTAL and SHOP->SHOP and clears only S.OUT', () => {
  const next = Calc.rollStockForward(seed.stock, '2026-10-25');
  const sub = next.watches.find((w) => w.code === 'SUB');
  assert.deepStrictEqual([sub.total, sub.shop, sub.sOut, sub.tfOut], [70, 69, null, 1]);
  // the kept TF OUT is not taken off SHOP again
  assert.deepStrictEqual([Calc.watchRow(next, sub).bal, Calc.watchRow(next, sub).shop], [70, 69]);
  assert.strictEqual(Calc.isCarried(sub, 'tfOut'), true);
  const caes = next.watches.find((w) => w.code === 'CAES');
  assert.strictEqual(caes.keep, 1);
  const sr621 = next.battery[1].items.find((i) => i.name === 'SR621');
  assert.deepStrictEqual([sr621.total, sr621.out, sr621.shop], [122, null, null]);
  assert.strictEqual(next.date, '2026-10-25');
  assert.strictEqual(seed.stock.date, '2026-10-24'); // original untouched
});

test('month sale ledger matches the October sheet', () => {
  const L = Calc.ledger(seed.money);
  const totals = Object.fromEntries(Object.values(L.lines).map((l) => [Number(l.date.slice(8)), l.total]));
  assert.deepStrictEqual(totals, {
    1: 1043, 2: 270, 3: 662, 4: 1086, 5: 198, 6: 673, 7: 873, 8: 1053, 9: 1253, 10: 193,
    11: 387, 12: 105, 13: 105, 14: 105, 15: 453, 16: 25, 17: 85, 18: 352, 19: 362, 20: 385,
    21: 600, 22: 725, 23: 97, 24: 192,
  });
  assert.strictEqual(L.lines['2026-10-02'].bal, 3);
  assert.strictEqual(L.lines['2026-10-05'].bal, 0);
  assert.strictEqual(L.lines['2026-10-03'].bal, null);
  assert.deepStrictEqual(L.pending.days, ['2026-10-23', '2026-10-24']);
  assert.strictEqual(L.pending.startBal, 0);
  assert.strictEqual(L.pending.total, 192);
  const b = L.bankIns.find((x) => x.dayDate === '2026-10-18');
  assert.deepStrictEqual([b.total, b.amount, b.less, b.startBal], [352, 350, 2, 0]);
});

test('cash defaults to sale - card', () => {
  assert.strictEqual(Calc.dayCash({ sale: 1253.8, card: 861.8 }), 392);
  assert.strictEqual(Calc.dayCash({ sale: 313, card: 216, cash: 95 }), 95);
});

test('kept TF / IN numbers: only new amounts change SHOP', () => {
  const stock = { watches: [{ code: 'X', total: 10, shop: 10, tfOut: 1 }], battery: [], strap: [] };
  let day = Calc.rollStockForward(stock, '2026-10-25');
  const w = day.watches[0];
  assert.deepStrictEqual([w.total, w.shop, w.tfOut], [10, 9, 1]);
  assert.strictEqual(Calc.watchRow(day, w).shop, 9);
  // two more go out today: 1 -> 3, only the 2 new ones count
  w.tfOut = 3;
  assert.strictEqual(Calc.watchRow(day, w).shop, 7);
  assert.strictEqual(Calc.isCarried(w, 'tfOut'), false);
  // next day nothing is counted again
  day = Calc.rollStockForward(day, '2026-10-26');
  const w2 = day.watches[0];
  assert.deepStrictEqual([w2.shop, w2.tfOut, Calc.watchRow(day, w2).shop], [7, 3, 7]);
  // HQ updated: staff types the HQ total and clears TF OUT -> SHOP stays 7
  w2.total = 7;
  w2.tfOut = null;
  assert.deepStrictEqual([Calc.watchRow(day, w2).bal, Calc.watchRow(day, w2).shop], [7, 7]);
  // after the next new day nothing is remembered any more
  day = Calc.rollStockForward(day, '2026-10-27');
  assert.strictEqual(day.watches[0].carried, undefined);
});

test('KEEP / RP / DEP stay on new day', () => {
  const next = Calc.rollStockForward(seed.stock, '2026-10-25');
  assert.strictEqual(next.watches.find((w) => w.code === 'JBV').rp, 1);
  assert.strictEqual(next.watches.find((w) => w.code === 'CR-WC').keep, 1);
});

test('Stock Bal battery/strap line: SHOP shows only while waiting for HQ', () => {
  const stock = JSON.parse(JSON.stringify(seed.stock));
  const row = () => Calc.watchRow(stock, stock.watches.find((w) => w.code === 'S-BAT'));
  assert.strictEqual(row().shop, null);
  const sr621 = stock.battery[1].items.find((i) => i.name === 'SR621');
  sr621.tfOut = 1;
  assert.deepStrictEqual([row().bal, row().shop], [585, 584]);
  const before = Calc.stockTotals(seed.stock).shop;
  assert.strictEqual(Calc.stockTotals(stock).shop, before); // SHOP total is watches only
  // HQ updated: total changed, TF OUT cleared -> empty again
  sr621.total = 124;
  sr621.tfOut = null;
  assert.deepStrictEqual([row().bal, row().shop], [584, null]);
});

test('KEEP / RP / DEP take watches off SHOP, once', () => {
  const data = Calc.migrate(JSON.parse(JSON.stringify({ stock: seed.stock })));
  const s = data.stock;
  const row = (code) => s.watches.find((w) => w.code === code);
  const r = (code) => Calc.watchRow(s, row(code));
  // already taken off by hand on the 24/10 sheet -> not again
  assert.deepStrictEqual([r('CAES').bal, r('CAES').shop], [55, 54]);
  assert.deepStrictEqual([r('JBV').bal, r('JBV').shop], [75, 74]);
  // a BONIA goes on keep today: SHOP 24 -> 23, BAL stays 24
  row('BN').keep = 1;
  assert.deepStrictEqual([r('BN').bal, r('BN').shop], [24, 23]);
  // next day it is not taken off again
  const next = Calc.rollStockForward(s, '2026-10-25');
  const bn = next.watches.find((w) => w.code === 'BN');
  assert.deepStrictEqual([bn.shop, bn.keep, Calc.watchRow(next, bn).shop], [23, 1, 23]);
  // customer cancels the keep: back on display
  bn.keep = null;
  assert.strictEqual(Calc.watchRow(next, bn).shop, 24);
  // or the customer collects and pays: keep cleared + S.OUT 1 -> SHOP stays 23, BAL 23
  bn.sOut = 1;
  assert.deepStrictEqual([Calc.watchRow(next, bn).bal, Calc.watchRow(next, bn).shop], [23, 23]);
  // kept KEEP numbers are not shown grey (only TF IN / TF OUT / IN are)
  assert.strictEqual(Calc.isCarried(next.watches.find((w) => w.code === 'CAES'), 'keep'), false);
});

test('migrate runs once', () => {
  const data = Calc.migrate(JSON.parse(JSON.stringify({ stock: seed.stock })));
  data.stock.watches.find((w) => w.code === 'BN').keep = 2;
  Calc.migrate(data);
  assert.strictEqual(Calc.watchRow(data.stock, data.stock.watches.find((w) => w.code === 'BN')).shop, 22);
});

test('several new days in a row never take TF OUT / KEEP / RP off again', () => {
  let data = Calc.migrate(JSON.parse(JSON.stringify({ stock: seed.stock })));
  let s = data.stock;
  const show = (code) => {
    const w = s.watches.find((x) => x.code === code);
    const r = Calc.watchRow(s, w);
    return [w.total, w.shop, r.bal, r.shop];
  };
  assert.deepStrictEqual(show('SUB'), [71, 71, 70, 69]); // 24/10: TF OUT 1, S.OUT 1
  for (const day of ['2026-10-25', '2026-10-26', '2026-10-27']) {
    s = Calc.rollStockForward(s, day);
    assert.deepStrictEqual(show('SUB'), [70, 69, 70, 69], day);  // TF OUT 1 still there, not taken off again
    assert.deepStrictEqual(show('CAES'), [55, 54, 55, 54], day); // KEEP 1
    assert.deepStrictEqual(show('JBV'), [75, 74, 75, 74], day);  // RP 1
  }
});
