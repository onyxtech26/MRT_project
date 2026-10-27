/* BANK IN screen: key in the day's sale, see cash not yet banked, record the bank in. */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;
  const m = App.fmtMoney;
  const t = App.t;
  const tx = App.tx;

  function field(label, input, hint) {
    return h('div', { class: 'field' }, h('label', { text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);
  }
  function moneyBox(value) {
    return h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off',
      value: value === null || value === undefined ? '' : String(value), style: 'width:10rem' });
  }
  function readBox(box) {
    const v = App.parseNum(box.value);
    box.classList.toggle('bad', v === undefined);
    return v;
  }

  function render(main) {
    const money = App.data.money;
    const L = C.ledger(money);

    main.appendChild(h('div', { class: 'toolbar' },
      h('h1', { class: 'page-title', text: t('Bank In') }),
      h('span', { class: 'date-chip', text: `${App.data.settings.bankName}  ${App.data.settings.bankAccount}` })));

    main.appendChild(saleCard(money, L));
    main.appendChild(pendingCard(L));
    main.appendChild(pastCard(L));
  }

  /* ---------- 1. the day's sale ---------- */
  function saleCard(money, L) {
    const date = h('input', { type: 'date', value: App.todayIso() });
    const sale = moneyBox();
    const card = moneyBox();
    const cash = moneyBox();
    const msg = h('div', { class: 'hint', style: 'margin-top:0.6rem;font-size:1rem' });
    const saveBtn = h('button', { class: 'btn big green' }, t('Save'));
    let cashTouched = false;

    function load() {
      const d = money.days[date.value];
      sale.value = d ? d.sale : '';
      card.value = d ? d.card : '';
      cash.value = d ? C.dayCash(d) : '';
      cashTouched = !!d && C.has(d.cash) && C.r2(C.n(d.sale) - C.n(d.card)) !== C.n(d.cash);
      saveBtn.textContent = d ? t('Update this day') : t('Save');
      msg.textContent = d ? t('This day is already saved. Change the numbers and press "Update this day".') : '';
      [sale, card, cash].forEach((b) => b.classList.remove('bad'));
    }
    function autoCash() {
      if (cashTouched) return;
      const s = readBox(sale);
      const c = readBox(card);
      if (s === undefined || c === undefined || (s === null && c === null)) { cash.value = ''; return; }
      cash.value = C.r2(C.n(s) - C.n(c));
    }
    date.addEventListener('change', load);
    sale.addEventListener('input', autoCash);
    card.addEventListener('input', autoCash);
    cash.addEventListener('input', () => { cashTouched = cash.value.trim() !== ''; readBox(cash); });
    [sale, card, cash].forEach((b) => b.addEventListener('focus', () => b.select()));
    // Enter moves to the next box, then saves
    const order = [sale, card, cash, saveBtn];
    order.slice(0, 3).forEach((b, i) => b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); order[i + 1].focus(); }
    }));

    saveBtn.addEventListener('click', async () => {
      if (!date.value) return App.alert(t('Please choose the date'), t('Choose the date of the sale first.'));
      const s = readBox(sale);
      const c = readBox(card);
      const k = readBox(cash);
      if (s === undefined || c === undefined || k === undefined || s === null) {
        return App.alert(t('Please check the numbers'), t('SALE must be filled in, and only numbers can be used.'));
      }
      const old = money.days[date.value];
      const banked = L.bankIns.some((b) => b.days.includes(date.value));
      if (banked) {
        const ok = await App.confirm(t('This day was already banked in'),
          t('Changing it will also change the totals and the balance after that bank in. Continue?'), t('Yes, change it'));
        if (!ok) return;
      }
      money.days[date.value] = Object.assign({}, old, { sale: s, card: c || 0, cash: k === null ? C.r2(s - (c || 0)) : k });
      App.saveNow();
      App.toast(t('Saved sale for {date}', { date: App.fmtDate(date.value) }));
      App.refresh();
    });

    load();
    return h('div', { class: 'card' },
      h('h2', null, h('span', { class: 'step-no', text: '1' }), t("Key in the day's sale")),
      h('div', { class: 'form-row' },
        field(t('Date'), date),
        field(t('SALE (RM)'), sale),
        field(t('CARD (RM)'), card),
        field(t('CASH (RM)'), cash, t('Filled in for you (SALE − CARD)')),
        saveBtn),
      msg);
  }

  /* ---------- 2 + 3. cash not banked yet & record the bank in ---------- */
  function pendingCard(L) {
    const p = L.pending;
    const rows = p.days.map((d) => {
      const l = L.lines[d];
      return h('tr', null, h('td', { class: 'name', text: App.fmtDateLong(d) }),
        h('td', { class: 'num', text: m(l.sale) }), h('td', { class: 'num', text: m(l.card) }),
        h('td', { class: 'num calc', text: m(l.cash) }));
    });
    if (!rows.length) {
      rows.push(h('tr', null, h('td', { colspan: 4, class: 'empty', text: t('No new sales since the last bank in.') })));
    }
    const table = h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null, App.th('DATE'), App.th('SALE'), App.th('CARD'),
        App.th('CASH', { class: 'result-head' }))),
      h('tbody', null, rows,
        h('tr', { class: 'subtotal' }, h('td', { colspan: 3, text: t('BALANCE (left over from last bank in)') }),
          h('td', { class: 'num', text: p.startBal ? m(p.startBal) : '~' })),
        h('tr', { class: 'total' }, h('td', { colspan: 3, text: t('TOTAL CASH TO BANK IN') }),
          h('td', { class: 'num calc', text: m(p.total) })))));

    const bankDate = h('input', { type: 'date', value: App.todayIso() });
    const amount = moneyBox(p.total);
    const less = h('input', { type: 'text', class: 'less', readonly: true, tabindex: '-1', style: 'width:10rem' });
    const showLess = () => {
      const a = readBox(amount);
      less.value = a === undefined || a === null ? '—' : 'RM ' + m(C.r2(p.total - a));
    };
    amount.addEventListener('input', showLess);
    amount.addEventListener('focus', () => amount.select());
    showLess();

    const saveBtn = h('button', { class: 'btn big green', onclick: async () => {
      const a = readBox(amount);
      if (!bankDate.value || a === undefined || a === null) {
        return App.alert(t('Please check'), t('Fill in the bank in date and the amount you banked in.'));
      }
      if (!p.days.length) return App.alert(t('Nothing to bank in'), t('Key in the sales first.'));
      const lessVal = C.r2(p.total - a);
      if (lessVal < 0) {
        const sure = await App.confirm(t('Bank in is more than the cash'),
          t('You banked in RM {a} but the total cash is only RM {total}. Is the amount correct?', { a: m(a), total: m(p.total) }),
          t('Yes, it is correct'));
        if (!sure) return;
      }
      const ok = await App.confirm('Save this bank in?', h('div', null,
        h('p', null, tx('Bank in date: **{date}**', { date: App.fmtDate(bankDate.value) })),
        h('p', null, tx('Amount banked in: **RM {a}**', { a: m(a) })),
        h('p', null, tx('LESS (goes to the next balance): **RM {less}**', { less: m(lessVal) }))), t('Yes, save'));
      if (!ok) return;
      const last = p.days[p.days.length - 1];
      Object.assign(App.data.money.days[last], { bankDate: bankDate.value, bankAmount: a });
      App.saveNow();
      App.refresh();
      const print = await App.confirm(t('Bank in saved'), t('Do you want to print the bank in slip now?'), t('Yes, print preview'));
      if (print) {
        const done = C.ledger(App.data.money).bankIns.find((b) => b.dayDate === last);
        App.printBankIn(slipOf(done));
      }
    } }, t('Save Bank In'));

    return h('div', null,
      h('div', { class: 'card' },
        h('div', { class: 'toolbar' },
          h('h2', { style: 'margin:0' }, h('span', { class: 'step-no', text: '2' }), t('Cash not banked in yet')),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn big primary', onclick: () => App.printBankIn({
            days: p.days, startBal: p.startBal, total: p.total, bankDate: null, amount: null, less: null,
          }) }, t('Print Preview'))),
        table),
      h('div', { class: 'card' },
        h('h2', null, h('span', { class: 'step-no', text: '3' }), t('After going to the bank')),
        h('div', { class: 'form-row' },
          field(t('Bank in date'), bankDate),
          field(t('Amount banked in (RM)'), amount),
          h('div', { class: 'field' }, h('label', { text: t('LESS (goes to next balance)') }), less),
          saveBtn)));
  }

  function slipOf(b) {
    return { days: b.days, startBal: b.startBal, total: b.total, bankDate: b.bankDate, amount: b.amount, less: b.less };
  }

  /* ---------- past bank ins ---------- */
  function pastCard(L) {
    const list = L.bankIns.slice().reverse();
    if (!list.length) return h('div');
    const select = h('select', { style: 'min-width:26rem' },
      list.map((b, i) => h('option', { value: i,
        text: t('{date}  —  RM {amount}   (sales {from} to {to})', {
          date: App.fmtDate(b.bankDate), amount: m(b.amount),
          from: App.fmtDateShort(b.days[0]), to: App.fmtDateShort(b.days[b.days.length - 1]),
        }) })));
    const undoBtn = h('button', { class: 'btn big danger', onclick: async () => {
      const b = list[0];
      const ok = await App.confirm(t('Undo the last bank in?'),
        t('This removes the bank in of RM {amount} on {date}. The sales stay.', { amount: m(b.amount), date: App.fmtDate(b.bankDate) }),
        t('Yes, undo'), true);
      if (!ok) return;
      const d = App.data.money.days[b.dayDate];
      delete d.bankDate;
      delete d.bankAmount;
      App.saveNow();
      App.refresh();
    } }, t('Undo last bank in'));
    return h('div', { class: 'card' },
      h('h2', { text: t('Past bank in slips') }),
      h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: t('Choose a bank in') }), select),
        h('button', { class: 'btn big primary', onclick: () => App.printBankIn(slipOf(list[Number(select.value)])) }, t('Print Preview')),
        undoBtn));
  }

  App.pages.bankin = { render };
})();
