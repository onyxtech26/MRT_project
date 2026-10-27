/* BANK IN screen: key in the day's sale, see cash not yet banked, record the bank in. */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;
  const m = App.fmtMoney;

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
      h('h1', { class: 'page-title', text: 'Bank In' }),
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
    const saveBtn = h('button', { class: 'btn big green' }, 'Save');
    let cashTouched = false;

    function load() {
      const d = money.days[date.value];
      sale.value = d ? d.sale : '';
      card.value = d ? d.card : '';
      cash.value = d ? C.dayCash(d) : '';
      cashTouched = !!d && C.has(d.cash) && C.r2(C.n(d.sale) - C.n(d.card)) !== C.n(d.cash);
      saveBtn.textContent = d ? 'Update this day' : 'Save';
      msg.textContent = d ? `This day is already saved. Change the numbers and press "Update this day".` : '';
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
      if (!date.value) return App.alert('Please choose the date', 'Choose the date of the sale first.');
      const s = readBox(sale);
      const c = readBox(card);
      const k = readBox(cash);
      if (s === undefined || c === undefined || k === undefined || s === null) {
        return App.alert('Please check the numbers', 'SALE must be filled in, and only numbers can be used.');
      }
      const old = money.days[date.value];
      const banked = L.bankIns.some((b) => b.days.includes(date.value));
      if (banked) {
        const ok = await App.confirm('This day was already banked in',
          'Changing it will also change the totals and the balance after that bank in. Continue?', 'Yes, change it');
        if (!ok) return;
      }
      money.days[date.value] = Object.assign({}, old, { sale: s, card: c || 0, cash: k === null ? C.r2(s - (c || 0)) : k });
      App.saveNow();
      App.toast(`Saved sale for ${App.fmtDate(date.value)}`);
      App.refresh();
    });

    load();
    return h('div', { class: 'card' },
      h('h2', null, h('span', { class: 'step-no', text: '1' }), "Key in the day's sale"),
      h('div', { class: 'form-row' },
        field('Date', date),
        field('SALE (RM)', sale),
        field('CARD (RM)', card),
        field('CASH (RM)', cash, 'Filled in for you (SALE − CARD)'),
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
      rows.push(h('tr', null, h('td', { colspan: 4, class: 'empty', text: 'No new sales since the last bank in.' })));
    }
    const table = h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', null, 'DATE'), h('th', null, 'SALE'), h('th', null, 'CARD'),
        h('th', { class: 'result-head' }, 'CASH'))),
      h('tbody', null, rows,
        h('tr', { class: 'subtotal' }, h('td', { colspan: 3, text: 'BALANCE (left over from last bank in)' }),
          h('td', { class: 'num', text: p.startBal ? m(p.startBal) : '~' })),
        h('tr', { class: 'total' }, h('td', { colspan: 3, text: 'TOTAL CASH TO BANK IN' }),
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
        return App.alert('Please check', 'Fill in the bank in date and the amount you banked in.');
      }
      if (!p.days.length) return App.alert('Nothing to bank in', 'Key in the sales first.');
      const lessVal = C.r2(p.total - a);
      if (lessVal < 0) {
        const sure = await App.confirm('Bank in is more than the cash',
          `You banked in RM ${m(a)} but the total cash is only RM ${m(p.total)}. Is the amount correct?`, 'Yes, it is correct');
        if (!sure) return;
      }
      const ok = await App.confirm('Save this bank in?', h('div', null,
        h('p', null, 'Bank in date: ', h('b', { text: App.fmtDate(bankDate.value) })),
        h('p', null, 'Amount banked in: ', h('b', { text: 'RM ' + m(a) })),
        h('p', null, 'LESS (goes to the next balance): ', h('b', { text: 'RM ' + m(lessVal) }))), 'Yes, save');
      if (!ok) return;
      const last = p.days[p.days.length - 1];
      Object.assign(App.data.money.days[last], { bankDate: bankDate.value, bankAmount: a });
      App.saveNow();
      App.refresh();
      const print = await App.confirm('Bank in saved', 'Do you want to print the bank in slip now?', 'Yes, print preview');
      if (print) {
        const done = C.ledger(App.data.money).bankIns.find((b) => b.dayDate === last);
        App.printBankIn(slipOf(done));
      }
    } }, 'Save Bank In');

    return h('div', null,
      h('div', { class: 'card' },
        h('div', { class: 'toolbar' },
          h('h2', { style: 'margin:0' }, h('span', { class: 'step-no', text: '2' }), 'Cash not banked in yet'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn big primary', onclick: () => App.printBankIn({
            days: p.days, startBal: p.startBal, total: p.total, bankDate: null, amount: null, less: null,
          }) }, 'Print Preview')),
        table),
      h('div', { class: 'card' },
        h('h2', null, h('span', { class: 'step-no', text: '3' }), 'After going to the bank'),
        h('div', { class: 'form-row' },
          field('Bank in date', bankDate),
          field('Amount banked in (RM)', amount),
          h('div', { class: 'field' }, h('label', { text: 'LESS (goes to next balance)' }), less),
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
        text: `${App.fmtDate(b.bankDate)}  —  RM ${m(b.amount)}   (sales ${App.fmtDateShort(b.days[0])} to ${App.fmtDateShort(b.days[b.days.length - 1])})` })));
    const undoBtn = h('button', { class: 'btn big danger', onclick: async () => {
      const b = list[0];
      const ok = await App.confirm('Undo the last bank in?',
        `This removes the bank in of RM ${m(b.amount)} on ${App.fmtDate(b.bankDate)}. The sales stay.`, 'Yes, undo', true);
      if (!ok) return;
      const d = App.data.money.days[b.dayDate];
      delete d.bankDate;
      delete d.bankAmount;
      App.saveNow();
      App.refresh();
    } }, 'Undo last bank in');
    return h('div', { class: 'card' },
      h('h2', { text: 'Past bank in slips' }),
      h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: 'Choose a bank in' }), select),
        h('button', { class: 'btn big primary', onclick: () => App.printBankIn(slipOf(list[Number(select.value)])) }, 'Print Preview'),
        undoBtn));
  }

  App.pages.bankin = { render };
})();
