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
  assert.strictEqual(it2.inn, null);
  assert.strictEqual(Calc.itemRow(it2).shop, 120);
  // one sold
  it2.out = 1;
  assert.deepStrictEqual(Calc.itemRow(it2), { total: 100, out: 1, bal: 99, shop: 119 });
});

test('new day copies BAL->TOTAL and SHOP->SHOP and clears movements', () => {
  const next = Calc.rollStockForward(seed.stock, '2026-10-25');
  const sub = next.watches.find((w) => w.code === 'SUB');
  assert.deepStrictEqual([sub.total, sub.shop, sub.sOut, sub.tfOut], [70, 69, null, null]);
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
