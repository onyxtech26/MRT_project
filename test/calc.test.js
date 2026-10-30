const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../src/renderer/calc.js');
const seed = require('./fixtures/oct24-seed.json');

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

test('KEEP / RP stay on new day', () => {
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

test('KEEP / RP take watches off SHOP once (every number on the sheet counts as keyed in)', () => {
  const data = Calc.migrate(JSON.parse(JSON.stringify({ stock: seed.stock })));
  const s = data.stock;
  const row = (code) => s.watches.find((w) => w.code === code);
  const r = (code) => Calc.watchRow(s, row(code));
  // KEEP 1 / RP 1 from the sheet are taken off SHOP once
  assert.deepStrictEqual([r('CAES').bal, r('CAES').shop], [55, 53]);
  assert.deepStrictEqual([r('CR-WC').bal, r('CR-WC').shop], [21, 19]);
  assert.deepStrictEqual([r('JBV').bal, r('JBV').shop], [75, 73]);
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
  // kept KEEP numbers are not shown grey (only TF IN / TF OUT / SHOPEE / IN are)
  assert.strictEqual(Calc.isCarried(next.watches.find((w) => w.code === 'CAES'), 'keep'), false);
});

test('old "already counted" KEEP / RP markers are removed once', () => {
  const data = JSON.parse(JSON.stringify({ stock: seed.stock }));
  const cr = data.stock.watches.find((w) => w.code === 'CR-WC');
  cr.carried = { keep: 1 };
  data.awayCounted = true; // written by the earlier version
  Calc.migrate(data);
  assert.strictEqual(Calc.watchRow(data.stock, cr).shop, 19); // KEEP 1 now deducts
  assert.strictEqual(data.awayCounted, undefined);
  // running it again changes nothing
  cr.carried = { keep: 1 };
  Calc.migrate(data);
  assert.deepStrictEqual(cr.carried, { keep: 1 });
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
    assert.deepStrictEqual(show('CAES'), [55, 53, 55, 53], day); // KEEP 1 taken off once
    assert.deepStrictEqual(show('JBV'), [75, 73, 75, 73], day);  // RP 1 taken off once
  }
});

test('SHOPEE works like TF OUT: taken off SHOP once, clearing changes nothing', () => {
  const stock = { watches: [{ code: 'X', total: 10, shop: 10, shopee: 2 }], battery: [], strap: [] };
  const w = stock.watches[0];
  assert.deepStrictEqual([Calc.watchRow(stock, w).bal, Calc.watchRow(stock, w).shop], [10, 8]);
  const next = Calc.rollStockForward(stock, '2026-10-28');
  const w2 = next.watches[0];
  assert.deepStrictEqual([w2.shop, w2.shopee, Calc.watchRow(next, w2).shop], [8, 2, 8]);
  assert.strictEqual(Calc.isCarried(w2, 'shopee'), true); // shown grey
  w2.total = 8; // HQ updated
  w2.shopee = null;
  assert.deepStrictEqual([Calc.watchRow(next, w2).bal, Calc.watchRow(next, w2).shop], [8, 8]);
});

test('starting data is the 27/10/2026 backup', () => {
  const start = Calc.migrate(JSON.parse(JSON.stringify(require('../src/seed.json'))));
  const s = start.stock;
  const r = (code) => Calc.watchRow(s, s.watches.find((w) => w.code === code));
  assert.strictEqual(s.date, '2026-10-27');
  assert.deepStrictEqual([r('SUB').bal, r('SUB').shop], [67, 67]);
  assert.deepStrictEqual([r('CR-WC').bal, r('CR-WC').shop], [20, 19]); // KEEP 1 deducts
  assert.deepStrictEqual([r('JBV').bal, r('JBV').shop], [75, 73]);     // RP 1 deducts
  assert.deepStrictEqual([r('CAES').bal, r('CAES').shop], [54, 53]);
  assert.strictEqual(Calc.stockTotals(s).total, 1953);
  assert.ok(s.watches.every((w) => !('dep' in w)));
  assert.strictEqual(Calc.ledger(start.money).pending.total, 105);
});

test('battery / strap SHOP shows only with a TF IN, TF OUT or IN', () => {
  assert.strictEqual(Calc.itemShowsShop({ total: 10, out: 2 }), false);
  assert.strictEqual(Calc.itemShowsShop({ total: 10, inn: 20 }), true);
  assert.strictEqual(Calc.itemShowsShop({ total: 10, tfOut: 1 }), true);
  assert.strictEqual(Calc.itemShowsShop({ total: 10, tfIn: null, inn: '' }), false);
  assert.strictEqual(Calc.groupShowsShop({ items: [{ total: 1 }, { total: 2, tfIn: 1 }] }), true);
  assert.strictEqual(Calc.groupShowsShop({ items: [{ total: 1 }, { total: 2, out: 1 }] }), false);
});

test('after clearing a grey TF OUT, a new 1 on the same day deducts at once', () => {
  let s = { watches: [{ code: 'X', total: 111, shop: 111, tfOut: 1 }], battery: [], strap: [] };
  s = Calc.rollStockForward(s, '2026-10-30');
  const w = s.watches[0];
  const shop = () => Calc.watchRow(s, w).shop;
  assert.strictEqual(shop(), 110);       // old 1 waiting for HQ (grey)
  Calc.setMove(w, 'tfOut', null);        // HQ confirms: clear it
  w.total = 110;
  assert.deepStrictEqual([Calc.watchRow(s, w).bal, shop()], [110, 110]); // clearing changes nothing
  Calc.setMove(w, 'tfOut', 1);           // a new transfer the same day
  assert.strictEqual(shop(), 109);
  Calc.setMove(w, 'tfOut', 2);
  assert.strictEqual(shop(), 108);
  // lowering a grey 2 to 1 (HQ updated one of them) changes nothing, then 2 again is a new one
  let t = { watches: [{ code: 'Y', total: 10, shop: 10, tfOut: 2 }], battery: [], strap: [] };
  t = Calc.rollStockForward(t, '2026-10-30');
  const y = t.watches[0];
  assert.strictEqual(Calc.watchRow(t, y).shop, 8);
  Calc.setMove(y, 'tfOut', 1);
  assert.strictEqual(Calc.watchRow(t, y).shop, 8);
  Calc.setMove(y, 'tfOut', 2);
  assert.strictEqual(Calc.watchRow(t, y).shop, 7);
});

test('battery IN works the same way', () => {
  let s = { watches: [], strap: [], battery: [{ code: 'S-BAT', items: [{ total: 100, inn: 20 }] }] };
  s = Calc.rollStockForward(s, '2026-10-30');
  const it = s.battery[0].items[0];
  assert.strictEqual(Calc.itemRow(it).shop, 120);
  it.total = 120;
  Calc.setMove(it, 'inn', null);          // HQ updated
  assert.strictEqual(Calc.itemRow(it).shop, 120);
  Calc.setMove(it, 'inn', 5);             // new stock the same day
  assert.strictEqual(Calc.itemRow(it).shop, 125);
});
