/* MONTH SALE screen: the whole month like the Excel sheet, can be corrected here. */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;
  const m = App.fmtMoney;
  const t = App.t;
  const tx = App.tx;
  let year = null;
  let month = null;

  function iso(d) {
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function render(main) {
    if (year === null) {
      const t = App.todayIso().split('-').map(Number);
      year = t[0];
      month = t[1];
    }
    const money = App.data.money;
    const go = (dir) => {
      month += dir;
      if (month < 1) { month = 12; year--; }
      if (month > 12) { month = 1; year++; }
      App.refresh();
    };

    main.appendChild(h('div', { class: 'toolbar' },
      h('h1', { class: 'page-title', text: t('Month Sale') }),
      h('button', { class: 'btn big', onclick: () => go(-1) }, '◀'),
      h('span', { class: 'date-chip', style: 'min-width:13rem;text-align:center', text: App.fmtMonth(year, month) }),
      h('button', { class: 'btn big', onclick: () => go(1) }, '▶'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn big primary', onclick: () => App.printMonth(year, month) }, t('Print Preview'))));

    main.appendChild(h('div', { class: 'help' },
      tx('This page fills in by itself from the **Bank In** tab. You can also correct any number here. **BAL** and **TOTAL** are worked out for you. To remove a day, clear its SALE, CARD and CASH.')));

    const days = new Date(year, month, 0).getDate();
    const outs = [];
    const body = h('tbody');
    const today = App.todayIso();
    for (let d = 1; d <= days; d++) body.appendChild(dayRow(money, iso(d), d, outs, today));

    const sums = { sale: h('td', { class: 'num' }), card: h('td', { class: 'num' }), cash: h('td', { class: 'num' }), bank: h('td', { class: 'num' }) };
    body.appendChild(h('tr', { class: 'total' }, h('td', { text: t('TOTAL') }), sums.sale, sums.card, sums.cash,
      h('td'), h('td'), h('td'), sums.bank));

    const wrap = h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null,
        App.th('DATE'), App.th('SALE', { class: 'entry-head' }), App.th('CARD', { class: 'entry-head' }),
        App.th('CASH', { class: 'entry-head' }), App.th('BAL', { class: 'result-head' }),
        App.th('TOTAL', { class: 'result-head' }), App.th('BANK IN DATE'), App.th('BANK IN (RM)'))),
      body));
    App.enableGridKeys(wrap);
    main.appendChild(wrap);

    function update() {
      const L = C.ledger(money).lines;
      const s = { sale: 0, card: 0, cash: 0, bank: 0 };
      for (let d = 1; d <= days; d++) {
        const l = L[iso(d)];
        if (!l) continue;
        s.sale += l.sale; s.card += l.card; s.cash += l.cash; s.bank += l.bankAmount || 0;
      }
      for (const k in s) sums[k].textContent = m(C.r2(s[k]));
      outs.forEach((o) => o(L));
    }
    update();
    page.update = update;

    main.appendChild(h('div', { class: 'help', style: 'margin-top:1rem' },
      tx('Cash balance before the first day in this book: **RM {amount}** (can be changed in Settings).', { amount: m(money.openingBalance) })));
  }

  function dayRow(money, date, d, outs, today) {
    const rec = () => money.days[date];
    const ensure = () => {
      if (!money.days[date]) money.days[date] = { sale: 0, card: 0, cash: 0 };
      return money.days[date];
    };
    // drop the day when everything is cleared
    const tidy = () => {
      const r = money.days[date];
      if (r && !r.sale && !r.card && !r.cash && !C.has(r.bankAmount)) delete money.days[date];
    };
    const changed = () => { tidy(); App.changed(); page.update(); };

    const r = rec();
    const cashInput = App.numInput(r ? C.dayCash(r) : null, (v) => { ensure().cash = v === null ? 0 : v; changed(); }, { col: 'cash' });
    const setSaleCard = (key, v) => {
      const x = ensure();
      const wasAuto = C.r2(C.n(x.sale) - C.n(x.card)) === C.dayCash(x);
      x[key] = v === null ? 0 : v;
      if (wasAuto) {
        x.cash = C.r2(C.n(x.sale) - C.n(x.card));
        cashInput.value = x.cash || x.sale || x.card ? String(x.cash) : '';
      }
      changed();
    };
    const bankDateInput = App.dateInput(r ? r.bankDate : null, (v) => {
      const x = ensure();
      if (v) x.bankDate = v; else delete x.bankDate;
      changed();
    }, { col: 'bankDate' });
    const bal = h('td', { class: 'num calc' });
    const total = h('td', { class: 'num calc' });
    outs.push((L) => {
      const l = L[date];
      bal.textContent = !l || l.bal === null ? '' : (l.bal ? m(l.bal) : '~');
      total.textContent = l ? m(l.total) : '';
    });

    return h('tr', { class: (date === today ? 'today ' : '') + (r && C.has(r.bankAmount) ? 'banked' : '') },
      h('td', { class: 'name', style: 'text-align:center', text: d }),
      h('td', { class: 'cell-in entry' }, App.numInput(r ? r.sale : null, (v) => setSaleCard('sale', v), { col: 'sale' })),
      h('td', { class: 'cell-in entry' }, App.numInput(r ? r.card : null, (v) => setSaleCard('card', v), { col: 'card' })),
      h('td', { class: 'cell-in entry' }, cashInput),
      bal, total,
      h('td', { class: 'cell-in' }, bankDateInput),
      h('td', { class: 'cell-in' }, App.numInput(r && C.has(r.bankAmount) ? r.bankAmount : null, (v) => {
        const x = ensure();
        if (v === null) delete x.bankAmount;
        else {
          x.bankAmount = v;
          // the date box may have been filled first, before the day had a record
          if (!x.bankDate) x.bankDate = bankDateInput.value || date;
        }
        changed();
      }, { col: 'bankAmount' })));
  }

  const page = { render };
  App.pages.month = page;
})();
