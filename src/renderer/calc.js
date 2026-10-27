/*
 * All the arithmetic of the app lives here, so it can be tested on its own
 * (see test/calc.test.js). Works in the browser (window.Calc) and in Node.
 *
 * STOCK RULES (same as the Excel sheet)
 *   BAL  = TOTAL - S.OUT
 *          (BAL follows the HQ system, which only changes when HQ updates,
 *           so IN / TF IN / TF OUT do not change BAL)
 *   SHOP = SHOP(yesterday) + TF IN - TF OUT + IN - S.OUT
 *          (SHOP is what is really inside the shop)
 *   Battery / strap items have no "yesterday shop" column on paper; when it is
 *   empty the yesterday shop is the same as TOTAL.
 *
 * MONEY RULES (same as MONTH SALE / BANK IN sheets)
 *   CASH  = SALE - CARD (filled in automatically, can be changed)
 *   TOTAL = BAL carried from last bank in + all CASH since last bank in
 *   LESS  = TOTAL - BANK IN amount   -> becomes BAL of the next day
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function n(v) {
    if (v === null || v === undefined || v === '') return 0;
    const x = Number(v);
    return isFinite(x) ? x : 0;
  }
  function has(v) {
    return v !== null && v !== undefined && v !== '';
  }
  // money rounding to 2 decimals, avoids 0.1+0.2 style noise
  function r2(x) {
    return Math.round(x * 100) / 100;
  }

  /* ---------------- stock ---------------- */

  const MOVES = ['tfIn', 'tfOut', 'inn'];

  // TF IN / TF OUT / IN stay on the sheet after "Start new day" until the staff
  // clears them (HQ has updated). They change SHOP only on the day they are typed:
  // the part already counted is remembered in row.carried. Lowering or clearing a
  // carried number changes nothing.
  function newMove(row, key) {
    const before = row.carried ? n(row.carried[key]) : 0;
    return Math.max(0, n(row[key]) - before);
  }
  // KEEP / RP / DEP are watches away from the display (on keep, in repair, on
  // deposit). Raising the number takes it off SHOP, lowering it puts it back.
  // row.carried holds the number already taken off SHOP before today.
  const AWAY = ['keep', 'rp', 'dep'];
  function awayChange(row) {
    let d = 0;
    for (const k of AWAY) d += n(row[k]) - (row.carried ? n(row.carried[k]) : 0);
    return d;
  }
  function moveChange(row) {
    return newMove(row, 'tfIn') - newMove(row, 'tfOut') + newMove(row, 'inn') - awayChange(row);
  }
  function isCarried(row, key) {
    return MOVES.includes(key) && !!row.carried && has(row[key]) && n(row[key]) > 0 && n(row[key]) <= n(row.carried[key]);
  }
  function carryMoves(row) {
    const c = {};
    for (const k of MOVES.concat(AWAY)) if (n(row[k])) c[k] = n(row[k]);
    if (Object.keys(c).length) row.carried = c;
    else delete row.carried;
  }

  function itemRow(it) {
    const total = n(it.total);
    const out = n(it.out);
    const bal = total - out;
    const prevShop = has(it.shop) ? n(it.shop) : total;
    const shop = prevShop + moveChange(it) - out;
    return { total, out, bal, shop };
  }

  function groupTotals(group) {
    const t = { total: 0, tfIn: 0, tfOut: 0, inn: 0, out: 0, bal: 0, shop: 0 };
    for (const it of group.items) {
      const r = itemRow(it);
      t.total += r.total;
      t.tfIn += n(it.tfIn);
      t.tfOut += n(it.tfOut);
      t.inn += n(it.inn);
      t.out += r.out;
      t.bal += r.bal;
      t.shop += r.shop;
    }
    return t;
  }

  function findGroup(stock, link) {
    const groups = stock[link.sheet] || [];
    return groups.find((g) => g.code === link.group) || null;
  }

  // One line of the STOCK BAL sheet, with linked battery/strap lines filled in
  function watchRow(stock, w) {
    if (w.link) {
      const g = findGroup(stock, w.link);
      const t = g ? groupTotals(g) : { total: 0, tfIn: 0, tfOut: 0, inn: 0, out: 0, bal: 0 };
      return {
        linked: true,
        total: t.total, shopPrev: null, keep: null, rp: null, dep: null,
        tfIn: t.tfIn || null, tfOut: t.tfOut || null, inn: t.inn || null, sOut: t.out || null,
        // SHOP shows only while it differs from BAL (TF IN / TF OUT / IN not yet in HQ)
        bal: t.bal, shop: g && t.shop !== t.bal ? t.shop : null,
      };
    }
    const total = n(w.total);
    const sOut = n(w.sOut);
    const tracksShop = has(w.shop);
    return {
      linked: false,
      total, shopPrev: tracksShop ? n(w.shop) : null,
      keep: w.keep, rp: w.rp, dep: w.dep, tfIn: w.tfIn, tfOut: w.tfOut, inn: w.inn, sOut: w.sOut,
      bal: total - sOut,
      shop: tracksShop ? n(w.shop) + moveChange(w) - sOut : null,
    };
  }

  function stockTotals(stock) {
    const t = { total: 0, shopPrev: 0, sOut: 0, bal: 0, shop: 0 };
    for (const w of stock.watches) {
      const r = watchRow(stock, w);
      t.total += r.total;
      t.shopPrev += n(r.shopPrev);
      t.sOut += n(r.sOut);
      t.bal += r.bal;
      if (!r.linked) t.shop += n(r.shop); // battery/strap SHOP only shows while waiting for HQ
    }
    return t;
  }

  // "Start new day": yesterday's BAL / SHOP become today's TOTAL / SHOP and
  // only S.OUT / OUT is cleared. TF IN, TF OUT, IN, KEEP, RP and DEP stay until
  // the staff clears them.
  function rollStockForward(stock, newDate) {
    const s = JSON.parse(JSON.stringify(stock));
    s.date = newDate;
    for (const w of s.watches) {
      if (w.link) continue;
      const r = watchRow(stock, w);
      w.total = r.bal;
      if (r.shop !== null) w.shop = r.shop;
      w.sOut = null;
      carryMoves(w);
    }
    for (const sheet of ['battery', 'strap']) {
      for (const g of s[sheet]) {
        for (const it of g.items) {
          const r = itemRow(it);
          it.total = r.bal;
          // remember the shop count only when it differs (stock not yet in HQ)
          it.shop = r.shop !== r.bal ? r.shop : null;
          it.out = null;
          carryMoves(it);
        }
      }
    }
    return s;
  }

  /* ---------------- money ---------------- */

  function dayCash(d) {
    if (has(d.cash)) return n(d.cash);
    return r2(n(d.sale) - n(d.card));
  }

  // Walks every recorded day in date order and works out BAL / TOTAL / LESS.
  // Returns a map date -> computed line, plus the list of bank-ins.
  function ledger(money) {
    const dates = Object.keys(money.days || {}).sort();
    const lines = {};
    const bankIns = [];
    let running = n(money.openingBalance);
    let carry = null; // BAL shown on the first day after a bank in
    let batch = [];
    for (const date of dates) {
      const d = money.days[date];
      const cash = dayCash(d);
      const line = {
        date, sale: n(d.sale), card: n(d.card), cash,
        bal: carry, total: 0, bankDate: d.bankDate || null,
        bankAmount: has(d.bankAmount) ? n(d.bankAmount) : null, less: null,
      };
      carry = null;
      running = r2(running + cash);
      line.total = running;
      batch.push(date);
      if (line.bankAmount !== null) {
        line.less = r2(running - line.bankAmount);
        const startBal = bankIns.length ? bankIns[bankIns.length - 1].less : n(money.openingBalance);
        bankIns.push({ dayDate: date, bankDate: line.bankDate, amount: line.bankAmount,
          total: running, less: line.less, days: batch, startBal });
        running = line.less;
        carry = line.less;
        batch = [];
      }
      lines[date] = line;
    }
    const lastLess = bankIns.length ? bankIns[bankIns.length - 1].less : n(money.openingBalance);
    return {
      lines, bankIns,
      pending: { days: batch, startBal: lastLess, total: running },
    };
  }

  // Data saved before KEEP / RP / DEP took watches off SHOP already had them
  // taken off by hand, so count them as already done.
  function migrate(data) {
    if (data.awayCounted) return data;
    for (const w of data.stock.watches) {
      if (w.link) continue;
      const c = Object.assign({}, w.carried);
      for (const k of AWAY) if (n(w[k])) c[k] = n(w[k]);
      if (Object.keys(c).length) w.carried = c;
    }
    data.awayCounted = true;
    return data;
  }

  return { n, has, r2, isCarried, migrate, itemRow, groupTotals, watchRow, stockTotals, rollStockForward, dayCash, ledger };
});
