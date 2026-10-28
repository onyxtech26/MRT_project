/* Print preview screen and the paper layouts for every report.
   The preview screen follows the chosen language; the paper is always English (HQ format). */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;

  /* ---------- the preview screen ---------- */
  let currentDoc = null;

  // doc = { title, filename, parts: [{ label, build() -> element }] }
  function open(doc) {
    currentDoc = doc;
    doc.selected = doc.parts.map(() => true);
    document.getElementById('previewTitle').textContent = doc.title;
    const opts = document.getElementById('previewOptions');
    opts.innerHTML = '';
    if (doc.parts.length > 1) {
      opts.appendChild(h('span', { text: App.t('Pages to print:') }));
      doc.parts.forEach((p, i) => {
        const box = h('input', { type: 'checkbox' });
        box.checked = true;
        box.addEventListener('change', () => { doc.selected[i] = box.checked; draw(); });
        opts.appendChild(h('label', null, box, p.label));
      });
    }
    draw();
    document.getElementById('preview').hidden = false;
    document.getElementById('previewPrint').focus();
  }

  function draw() {
    const area = document.getElementById('printArea');
    area.innerHTML = '';
    currentDoc.parts.forEach((p, i) => {
      if (currentDoc.selected[i]) area.appendChild(p.build());
    });
    document.getElementById('previewPrint').disabled = !area.children.length;
    document.getElementById('previewPdf').disabled = !area.children.length;
  }

  function close() {
    document.getElementById('preview').hidden = true;
    document.getElementById('printArea').innerHTML = '';
    currentDoc = null;
  }

  document.getElementById('previewBack').addEventListener('click', close);
  document.getElementById('previewPrint').addEventListener('click', async () => {
    const res = await window.api.print();
    if (res && res.ok) App.toast(App.t('Sent to printer'));
    else if (res && res.reason && res.reason !== 'cancelled') App.toast(App.t('Printing failed: {reason}', { reason: res.reason }), true);
  });
  document.getElementById('previewPdf').addEventListener('click', async () => {
    const res = await window.api.savePdf(currentDoc.filename + '.pdf');
    if (res && res.ok) App.toast(App.t('PDF saved'));
  });
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('preview').hidden) return;
    if (e.key === 'Escape') close();
  });

  /* ---------- shared paper bits ---------- */
  function sheetHead(title, subtitle, rightLines) {
    const s = App.data.settings;
    return h('div', { class: 'p-head' },
      h('img', { class: 'p-logo', src: 'assets/mpt-logo-dark.png', alt: 'MPT' }),
      h('div', { class: 'p-title' },
        h('div', { class: 'p-company', text: `${s.company} — ${s.outlet}` }),
        h('div', { class: 'p-name', text: title }),
        subtitle ? h('div', { class: 'p-sub', text: subtitle }) : null),
      h('div', { class: 'p-right' }, rightLines.map((l) => h('div', null, l))));
  }
  const td = (text, cls) => h('td', { class: cls || null }, text === null || text === undefined ? '' : String(text));
  const th = (text, cls) => h('th', { class: cls || null }, text);
  const q = App.fmtQty;
  const m = App.fmtMoney;

  /* ---------- STOCK BAL ---------- */
  function stockSheet(stock) {
    const rows = stock.watches.map((w) => {
      const r = C.watchRow(stock, w);
      return h('tr', null,
        td(w.code, 'code'), td(w.name, 'left'),
        td(q(r.total), 'n'), td(q(r.shopPrev), 'n'), td(q(r.keep), 'n'), td(q(r.rp), 'n'),
        td(q(r.tfIn), 'n'), td(q(r.tfOut), 'n'), td(q(r.shopee), 'n'), td(q(r.inn), 'n'), td(q(r.sOut), 'n strong'),
        td(q(r.bal), 'n strong'), td(q(r.shop), 'n strong'));
    });
    const t = C.stockTotals(stock);
    rows.push(h('tr', { class: 'p-total' },
      td('', ''), td('TOTAL', 'left'), td(q(t.total), 'n'), td(''),
      td(''), td(''), td(''), td(''), td(''), td(''), td(q(t.sOut), 'n'), td(q(t.bal), 'n'), td('')));

    const notes = (stock.notes || []).filter((n) => (n.text || '').trim() || (n.ref || '').trim());
    return h('div', { class: 'sheet' },
      sheetHead('Product Current Balance Report - By Product Group', `(Warehouse = ${App.data.settings.outlet})`,
        [h('b', { text: 'STOCK BAL' }), `Date: ${App.fmtDate(stock.date)}`]),
      h('table', { class: 'p-table' },
        h('thead', null, h('tr', null,
          th('CODE'), th('BRAND', 'left'), th('TOTAL'), th('SHOP'), th('KEEP'), th('RP'),
          th('TF IN'), th('TF OUT'), th('SHOPEE'), th('IN'), th('S.OUT'), th('BAL'), th('SHOP'))),
        h('tbody', null, rows)),
      h('div', { class: 'p-notes' },
        h('div', { class: 'p-notes-title', text: 'TF IN & TF OUT & REPAIR' }),
        notes.length
          ? h('table', { class: 'p-table p-notes-table' }, h('tbody', null,
            notes.map((n) => h('tr', null, td(n.text, 'left'), td(n.ref, 'left ref')))))
          : h('div', { class: 'p-muted', text: '(none)' })));
  }

  /* ---------- BATTERY / STRAP ---------- */
  function itemsSheet(stock, sheetKey, title) {
    const groups = stock[sheetKey] || [];
    const body = [];
    for (const g of groups) {
      body.push(h('tr', { class: 'p-group' }, h('td', { colspan: 9, text: `${g.code} : ${g.name}` })));
      for (const it of g.items) {
        const r = C.itemRow(it);
        body.push(h('tr', null,
          td(it.name, 'left'), td(it.ref, 'code'), td(q(it.total === null ? null : r.total), 'n'),
          td(q(it.tfIn), 'n'), td(q(it.tfOut), 'n'), td(q(it.inn), 'n'), td(q(it.out), 'n strong'),
          td(it.total === null && !it.out ? '' : q(r.bal), 'n strong'),
          td(C.itemShowsShop(it) ? q(r.shop) : '', 'n strong')));
      }
      const t = C.groupTotals(g);
      body.push(h('tr', { class: 'p-subtotal' },
        td('Total', 'left'), td(''), td(q(t.total), 'n'), td(q(t.tfIn || null), 'n'), td(q(t.tfOut || null), 'n'),
        td(q(t.inn || null), 'n'), td(q(t.out), 'n'), td(q(t.bal), 'n'), td(C.groupShowsShop(g) ? q(t.shop) : '', 'n')));
    }
    return h('div', { class: 'sheet compact' },
      sheetHead('Product Current Balance Report - By Product Group',
        `${App.data.settings.outlet}:${App.data.settings.warehouseCode || App.data.settings.outlet}`,
        [h('b', { text: title }), `Date: ${App.fmtDate(stock.date)}`]),
      h('table', { class: 'p-table compact' },
        h('thead', null, h('tr', null,
          th('Product', 'left'), th('Code'), th('Total'), th('TF In'), th('TF Out'), th('In'), th('Out'),
          th('Bal'), th('Shop'))),
        h('tbody', null, body)));
  }

  App.printStock = function (stock, titleExtra) {
    stock = stock || App.data.stock;
    open({
      title: App.t('Stock Balance') + ' — ' + App.fmtDate(stock.date) + (titleExtra || ''),
      filename: `Stock Balance ${stock.date}`,
      parts: [
        { label: App.t('Stock Bal'), build: () => stockSheet(stock) },
        { label: App.t('Battery'), build: () => itemsSheet(stock, 'battery', 'BATTERY') },
        { label: App.t('Strap'), build: () => itemsSheet(stock, 'strap', 'STRAP') },
      ],
    });
  };

  /* ---------- BANK IN slip ---------- */
  // slip = { days: [dates], startBal, total, bankDate, amount, less }
  function bankSheet(slip) {
    const s = App.data.settings;
    const L = C.ledger(App.data.money).lines;
    const rows = slip.days.map((d) => {
      const l = L[d];
      return h('tr', null, td(App.fmtDate(d), 'left'), td(m(l.sale), 'n'), td(m(l.card), 'n'), td(m(l.cash), 'n strong'));
    });
    if (!rows.length) rows.push(h('tr', null, h('td', { colspan: 4, class: 'p-muted', text: 'No sales keyed in yet' })));
    const banked = slip.amount !== null && slip.amount !== undefined;
    return h('div', { class: 'sheet' },
      sheetHead('BANK IN', `${s.bankName}  ${s.bankAccount}`, [`Printed: ${App.fmtDate(App.todayIso())}`]),
      h('table', { class: 'p-table bank' },
        h('thead', null, h('tr', null, th('DATE', 'left'), th('SALE'), th('CARD'), th('CASH'))),
        h('tbody', null, rows,
          h('tr', { class: 'p-subtotal' }, h('td', { colspan: 3, class: 'left', text: 'BALANCE (from last bank in)' }),
            td(slip.startBal ? m(slip.startBal) : '~', 'n')),
          h('tr', { class: 'p-total' }, h('td', { colspan: 3, class: 'left', text: 'TOTAL CASH' }), td(m(slip.total), 'n')),
          h('tr', { class: 'p-bank' }, h('td', { colspan: 3, class: 'left' },
            'BANK IN', h('span', { class: 'p-bankdate', text: banked ? '  on  ' + App.fmtDate(slip.bankDate) : '  on  ____________' })),
          td(banked ? m(slip.amount) : '', 'n')),
          h('tr', { class: 'p-subtotal' }, h('td', { colspan: 3, class: 'left', text: 'LESS (goes to next balance)' }),
            td(banked ? (slip.less ? m(slip.less) : '~') : '', 'n')))));
  }

  App.printBankIn = function (slip) {
    const name = slip.bankDate ? `Bank In ${slip.bankDate}` : `Bank In ${App.todayIso()}`;
    open({
      title: App.t('Bank In') + (slip.bankDate ? ' — ' + App.fmtDate(slip.bankDate) : ''),
      filename: name,
      parts: [{ label: App.t('Bank In'), build: () => bankSheet(slip) }],
    });
  };

  /* ---------- MONTH SALE ---------- */
  function monthSheet(year, month) {
    const s = App.data.settings;
    const L = C.ledger(App.data.money).lines;
    const days = new Date(year, month, 0).getDate();
    const sum = { sale: 0, card: 0, cash: 0, bank: 0 };
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const l = L[iso];
      if (!l) { rows.push(h('tr', null, td(d, 'c'), td(''), td(''), td(''), td(''), td(''), td(''), td(''))); continue; }
      sum.sale += l.sale; sum.card += l.card; sum.cash += l.cash; sum.bank += l.bankAmount || 0;
      rows.push(h('tr', null, td(d, 'c'), td(m(l.sale), 'n'), td(m(l.card), 'n'), td(m(l.cash), 'n'),
        td(l.bal === null ? '' : (l.bal ? m(l.bal) : '~'), 'n'), td(m(l.total), 'n strong'),
        td(App.fmtDateShort(l.bankDate), 'c'), td(m(l.bankAmount), 'n strong')));
    }
    rows.push(h('tr', { class: 'p-total' }, td('TOTAL', 'c'), td(m(C.r2(sum.sale)), 'n'), td(m(C.r2(sum.card)), 'n'),
      td(m(C.r2(sum.cash)), 'n'), td(''), td(''), td(''), td(m(C.r2(sum.bank)), 'n')));
    return h('div', { class: 'sheet' },
      sheetHead(`MONTH SALE — ${App.MONTHS[month - 1].toUpperCase()} ${year}`, `${s.bankName}  ${s.bankAccount}`,
        [`Printed: ${App.fmtDate(App.todayIso())}`]),
      h('table', { class: 'p-table month' },
        h('thead', null, h('tr', null, th('DATE'), th('SALE'), th('CARD'), th('CASH'), th('BAL'), th('TOTAL'),
          th('DATE'), th('BANK IN'))),
        h('tbody', null, rows)));
  }

  App.printMonth = function (year, month) {
    open({
      title: App.t('Month Sale') + ' — ' + App.fmtMonth(year, month),
      filename: `Month Sale ${year}-${String(month).padStart(2, '0')}`,
      parts: [{ label: App.t('Month Sale'), build: () => monthSheet(year, month) }],
    });
  };
})();
