/* STOCK BAL screen + "Start new day" (shared by the Battery and Strap screens). */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;
  const q = App.fmtQty;
  let editMode = false;

  /* ---------- start new day ---------- */
  // The new report date is always the computer's date and it can be done once a
  // day, so pressing the button again cannot jump ahead or clear today's sales.
  // Old days are kept in stockHistory. Mistakes are fixed by editing the numbers.
  App.startNewDay = async function () {
    const stock = App.data.stock;
    const today = App.todayIso();
    if (stock.date === today) {
      await App.alert("Today's report is already open", `The stock report is already for today, ${App.fmtDateLong(today)}. Just key in the sales.`);
      return;
    }
    const future = stock.date > today;
    const gap = future ? 0 : Math.round((new Date(today) - new Date(stock.date)) / 86400000) - 1;
    const body = h('div', null,
      h('p', null, 'New report date: ', h('b', { text: App.fmtDateLong(today) }), ' (today).'),
      future ? h('p', null, h('b', { text: `The current report has a later date (${App.fmtDate(stock.date)}). ` }),
        'Please check that the computer\'s date is correct before you continue.') : null,
      h('p', null, 'The report for ', h('b', { text: App.fmtDateLong(stock.date) }), ' will be kept, so you can print it again later.'),
      gap > 0 ? h('p', null, `(No report for the ${gap} day${gap > 1 ? 's' : ''} in between, e.g. shop closed.)`) : null,
      h('p', null, 'On all 3 sheets (Stock Bal, Battery, Strap):'),
      h('ul', null,
        h('li', null, 'BAL goes to TOTAL'),
        h('li', null, 'SHOP goes to SHOP'),
        h('li', null, 'S.OUT (and OUT) is cleared'),
        h('li', null, 'TF IN, TF OUT, IN, KEEP, RP and DEP stay — clear them yourself when HQ has updated')));
    const ok = await App.confirm('Start a new day?', body, 'Yes, start new day');
    if (!ok || App.data.stock.date === App.todayIso()) return;
    App.data.stockHistory = App.data.stockHistory || {};
    App.data.stockHistory[stock.date] = JSON.parse(JSON.stringify(stock));
    App.data.stock = C.rollStockForward(stock, today);
    App.saveNow();
    App.refresh();
    App.toast('New day started: ' + App.fmtDate(today));
  };

  // The green button on the Stock, Battery and Strap tabs
  App.newDayButton = function () {
    const open = App.data.stock.date === App.todayIso();
    return h('button', {
      class: open ? 'btn big done' : 'btn big green', onclick: App.startNewDay,
      title: open ? "The report is already for today" : 'Start the report for today',
    }, open ? "✔ Today's report is open" : 'Start New Day');
  };

  /* ---------- the screen ---------- */
  function render(main) {
    const data = App.data;
    const stock = data.stock;

    main.appendChild(h('div', { class: 'toolbar' },
      h('h1', { class: 'page-title', text: 'Stock Balance' }),
      h('span', { class: 'date-chip', text: App.fmtDateLong(stock.date) }),
      h('span', { class: 'spacer' }),
      App.newDayButton(),
      h('button', { class: 'btn big primary', onclick: () => App.printStock() }, 'Print Preview')));

    main.appendChild(App.staleNote() || h('span'));
    main.appendChild(h('div', { class: 'help' },
      'Key in the number of watches ', h('b', { text: 'sold today' }), ' in the yellow ', h('b', { text: 'S.OUT' }),
      ' column. ', h('b', { text: 'BAL' }), ' and ', h('b', { text: 'SHOP' }),
      ' (green) are worked out for you. Press ', h('b', { text: 'Enter' }), ' to go to the next line. ',
      'Battery and strap lines come from the Battery and Strap tabs.', h('br'),
      'TF IN, TF OUT and IN stay after Start New Day. ', h('span', { class: 'carried-key', text: 'Grey' }),
      ' numbers are from an earlier day and are already counted in SHOP. Clear them when HQ has updated.'));

    const outs = []; // cells to refresh when a number changes
    const body = h('tbody');
    stock.watches.forEach((w, idx) => body.appendChild(watchLine(stock, w, idx, outs)));

    const totalCells = {
      total: h('td', { class: 'num' }), shopPrev: h('td', { class: 'num' }),
      sOut: h('td', { class: 'num' }), bal: h('td', { class: 'num calc' }), shop: h('td', { class: 'num calc' }),
    };
    body.appendChild(h('tr', { class: 'total' },
      h('td', { colspan: editMode ? 3 : 2, text: 'TOTAL' }), totalCells.total, totalCells.shopPrev,
      h('td'), h('td'), h('td'), h('td'), h('td'), h('td'), totalCells.sOut, totalCells.bal, totalCells.shop));

    const table = h('table', { class: 'grid' },
      h('thead', null,
        h('tr', { class: 'group-head' },
          h('th', { colspan: editMode ? 3 : 2 }, ''), h('th', { colspan: 2 }, 'YESTERDAY'),
          h('th', { colspan: 7 }, 'TODAY'), h('th', { colspan: 2, class: 'result-head' }, 'RESULT')),
        h('tr', null,
          editMode ? h('th', null, '') : null,
          h('th', null, 'CODE'), h('th', null, 'BRAND'), h('th', null, 'TOTAL'), h('th', null, 'SHOP'),
          h('th', null, 'KEEP'), h('th', null, 'RP'), h('th', null, 'DEP'), h('th', null, 'TF IN'),
          h('th', null, 'TF OUT'), h('th', null, 'IN'), h('th', { class: 'entry-head' }, 'S.OUT'),
          h('th', { class: 'result-head' }, 'BAL'), h('th', { class: 'result-head' }, 'SHOP'))),
      body);
    const wrap = h('div', { class: 'grid-wrap' }, table);
    App.enableGridKeys(wrap);
    main.appendChild(wrap);

    function update() {
      for (const o of outs) o();
      const t = C.stockTotals(stock);
      totalCells.total.textContent = q(t.total);
      totalCells.shopPrev.textContent = q(t.shopPrev);
      totalCells.sOut.textContent = q(t.sOut);
      totalCells.bal.textContent = q(t.bal);
      totalCells.shop.textContent = q(t.shop);
    }
    App.pages.stock.update = update;
    update();

    main.appendChild(h('div', { class: 'toolbar', style: 'margin-top:0.8rem' },
      editMode ? h('button', { class: 'btn big', onclick: addBrand }, '+ Add a brand') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => { editMode = !editMode; App.refresh(); } },
        editMode ? 'Finish editing brand list' : 'Edit brand list')));

    main.appendChild(notesCard(stock));
  }

  function watchLine(stock, w, idx, outs) {
    const row = h('tr', { class: w.link ? 'linked' : null });
    const changed = () => { App.changed(); App.pages.stock.update(); };

    if (editMode) {
      row.appendChild(h('td', { style: 'white-space:nowrap' },
        h('button', { class: 'btn small', title: 'Move up', onclick: () => move(idx, -1) }, '▲'), ' ',
        h('button', { class: 'btn small', title: 'Move down', onclick: () => move(idx, 1) }, '▼'), ' ',
        h('button', { class: 'btn small danger', title: 'Remove', onclick: () => removeBrand(w) }, '✕')));
      row.appendChild(h('td', { class: 'cell-in' }, App.textInput(w.code, (v) => { w.code = v; App.changed(); }, { col: 'code' })));
      row.appendChild(h('td', { class: 'cell-in' }, App.textInput(w.name, (v) => { w.name = v; App.changed(); }, { col: 'name' })));
    } else {
      row.appendChild(h('td', { class: 'code', text: w.code }));
      row.appendChild(h('td', { class: 'name' }, w.name, w.link ? h('br') : null,
        w.link ? h('span', {
          class: 'link-note', onclick: () => App.show(w.link.sheet),
          text: `from ${w.link.sheet === 'battery' ? 'Battery' : 'Strap'} tab`,
        }) : null));
    }

    if (w.link) {
      const cells = {};
      ['total', 'shopPrev', 'keep', 'rp', 'dep', 'tfIn', 'tfOut', 'inn', 'sOut'].forEach((k) => {
        cells[k] = h('td', { class: 'num' });
        row.appendChild(cells[k]);
      });
      cells.bal = h('td', { class: 'num calc' });
      cells.shop = h('td', { class: 'num calc' });
      row.appendChild(cells.bal);
      row.appendChild(cells.shop);
      outs.push(() => {
        const r = C.watchRow(stock, w);
        for (const k in cells) cells[k].textContent = q(r[k]);
        cells.shop.classList.toggle('diff', r.shop !== null);
        cells.shop.title = r.shop !== null ? 'Waiting for HQ update (TF IN / TF OUT / IN on the tab)' : '';
      });
      return row;
    }

    const field = (key, cls) => {
      const input = App.numInput(w[key], (v) => { w[key] = v; App.markCarried(input, w, key); changed(); }, { col: key });
      App.markCarried(input, w, key);
      return h('td', { class: 'cell-in ' + (cls || '') }, input);
    };
    row.appendChild(field('total'));
    row.appendChild(field('shop'));
    row.appendChild(field('keep'));
    row.appendChild(field('rp'));
    row.appendChild(field('dep'));
    row.appendChild(field('tfIn'));
    row.appendChild(field('tfOut'));
    row.appendChild(field('inn'));
    row.appendChild(field('sOut', 'entry'));
    const bal = h('td', { class: 'num calc' });
    const shop = h('td', { class: 'num calc' });
    row.appendChild(bal);
    row.appendChild(shop);
    outs.push(() => {
      const r = C.watchRow(stock, w);
      bal.textContent = q(r.bal);
      shop.textContent = q(r.shop);
    });
    return row;
  }

  function move(idx, dir) {
    const list = App.data.stock.watches;
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    App.changed();
    App.refresh();
  }

  async function removeBrand(w) {
    const ok = await App.confirm('Remove this line?', `Remove "${w.code} ${w.name}" from the stock list?`, 'Yes, remove', true);
    if (!ok) return;
    App.data.stock.watches = App.data.stock.watches.filter((x) => x !== w);
    App.saveNow();
    App.refresh();
  }

  async function addBrand() {
    const code = h('input', { type: 'text', placeholder: 'e.g. TIS' });
    const name = h('input', { type: 'text', placeholder: 'e.g. TISSOT' });
    const total = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
    const body = h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { text: 'Code' }), code),
      h('div', { class: 'field' }, h('label', { text: 'Brand name' }), name),
      h('div', { class: 'field' }, h('label', { text: 'Quantity now' }), total));
    setTimeout(() => code.focus(), 50);
    const ok = await App.confirm('Add a brand', body, 'Add');
    if (!ok || !(code.value.trim() || name.value.trim())) return;
    const qty = App.parseNum(total.value) || 0;
    App.data.stock.watches.push({
      id: App.newId('w'), code: code.value.trim().toUpperCase(), name: name.value.trim().toUpperCase(),
      total: qty, shop: qty, keep: null, rp: null, dep: null, tfIn: null, tfOut: null, inn: null, sOut: null,
    });
    App.saveNow();
    App.refresh();
  }

  /* ---------- TF IN & TF OUT & REPAIR notes ---------- */
  function notesCard(stock) {
    stock.notes = stock.notes || [];
    const list = h('div', { class: 'notes-list' });
    const draw = () => {
      list.innerHTML = '';
      if (!stock.notes.length) list.appendChild(h('div', { class: 'empty', text: 'No notes.' }));
      stock.notes.forEach((n) => {
        const text = h('input', { class: 'note-text', type: 'text', value: n.text || '',
          placeholder: 'e.g. 24/10/26 T17251 TF OUT GPL SUBMARINE 1PC' });
        text.addEventListener('input', () => { n.text = text.value; App.changed(); });
        const ref = h('input', { class: 'note-ref', type: 'text', value: n.ref || '', placeholder: 'Ref no.' });
        ref.addEventListener('input', () => { n.ref = ref.value; App.changed(); });
        list.appendChild(h('div', { class: 'note-row' }, text, ref,
          h('button', { class: 'btn danger', title: 'Remove', onclick: () => {
            stock.notes = stock.notes.filter((x) => x !== n); App.changed(); draw();
          } }, '✕')));
      });
    };
    draw();
    return h('div', { class: 'card', style: 'margin-top:1.2rem' },
      h('h2', { text: 'TF IN & TF OUT & REPAIR (printed under the stock table)' }),
      list,
      h('div', { style: 'margin-top:0.6rem' },
        h('button', { class: 'btn', onclick: () => {
          stock.notes.push({ id: App.newId('n'), text: '', ref: '' });
          App.changed(); draw();
          const inputs = list.querySelectorAll('.note-text');
          inputs[inputs.length - 1].focus();
        } }, '+ Add a note line')));
  }

  App.pages.stock = { render };
})();
