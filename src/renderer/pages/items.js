/* BATTERY and STRAP screens (same layout, different list). */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;
  const q = App.fmtQty;
  const editing = { battery: false, strap: false };

  function makePage(sheet, title, what) {
    function render(main) {
      const stock = App.data.stock;
      const groups = stock[sheet];
      const edit = editing[sheet];

      main.appendChild(h('div', { class: 'toolbar' },
        h('h1', { class: 'page-title', text: title }),
        h('span', { class: 'date-chip', text: App.fmtDateLong(stock.date) }),
        h('span', { class: 'spacer' }),
        App.newDayButton(),
        h('button', { class: 'btn big primary', onclick: () => App.printStock() }, 'Print Preview')));

      main.appendChild(App.staleNote() || h('span'));
    main.appendChild(h('div', { class: 'help' },
        'Key in the number of ', what, ' ', h('b', { text: 'sold today' }), ' in the yellow ', h('b', { text: 'OUT' }),
        ' column.', h('br'),
        h('b', { text: 'New stock arrived but HQ has not updated yet?' }), ' Key the quantity in ', h('b', { text: 'IN' }),
        '. SHOP goes up, BAL stays the same. The IN number stays on the next days (',
        h('span', { class: 'carried-key', text: 'grey' }), ', already counted in SHOP). ',
        'When HQ updates, change ', h('b', { text: 'TOTAL' }), ' to the HQ number and clear ', h('b', { text: 'IN' }), '.'));

      const outs = [];
      const body = h('tbody');
      const cols = edit ? 10 : 9;
      groups.forEach((g, gi) => {
        body.appendChild(h('tr', { class: 'group' }, h('td', { colspan: cols },
          edit ? groupEditor(g, gi) : `${g.name}  (${g.code})`)));
        g.items.forEach((it, idx) => body.appendChild(itemLine(g, it, idx, outs, edit)));
        if (edit) {
          body.appendChild(h('tr', null, h('td', { colspan: cols },
            h('button', { class: 'btn', onclick: () => addItem(g) }, `+ Add an item to ${g.name}`))));
        }
        const sub = subtotalRow(g, outs, edit);
        body.appendChild(sub);
      });
      if (groups.length > 1) body.appendChild(grandRow(groups, outs, edit));

      const table = h('table', { class: 'grid' },
        h('thead', null, h('tr', null,
          edit ? h('th', null, '') : null,
          h('th', null, 'PRODUCT'), h('th', null, 'CODE'), h('th', null, 'TOTAL'), h('th', null, 'TF IN'),
          h('th', null, 'TF OUT'), h('th', null, 'IN'), h('th', { class: 'entry-head' }, 'OUT'),
          h('th', { class: 'result-head' }, 'BAL'), h('th', { class: 'result-head' }, 'SHOP'))),
        body);
      const wrap = h('div', { class: 'grid-wrap' }, table);
      App.enableGridKeys(wrap);
      main.appendChild(wrap);

      page.update = () => outs.forEach((o) => o());
      page.update();

      main.appendChild(h('div', { class: 'toolbar', style: 'margin-top:0.8rem' },
        edit ? h('button', { class: 'btn big', onclick: () => addGroup(sheet) }, '+ Add a new group') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => { editing[sheet] = !edit; App.refresh(); } },
          edit ? 'Finish editing list' : 'Edit list (add / remove items)')));
    }

    function itemLine(g, it, idx, outs, edit) {
      const row = h('tr');
      if (edit) {
        row.appendChild(h('td', { style: 'white-space:nowrap' },
          h('button', { class: 'btn small', title: 'Move up', onclick: () => moveItem(g, idx, -1) }, '▲'), ' ',
          h('button', { class: 'btn small', title: 'Move down', onclick: () => moveItem(g, idx, 1) }, '▼'), ' ',
          h('button', { class: 'btn small danger', title: 'Remove', onclick: () => removeItem(g, it) }, '✕')));
        row.appendChild(h('td', { class: 'cell-in' }, App.textInput(it.name, (v) => { it.name = v; App.changed(); }, { col: 'name' })));
        row.appendChild(h('td', { class: 'cell-in' }, App.textInput(it.ref, (v) => { it.ref = v; App.changed(); }, { col: 'ref' })));
      } else {
        row.appendChild(h('td', { class: 'name', text: it.name }));
        row.appendChild(h('td', { class: 'code', text: it.ref }));
      }
      const field = (key, cls) => {
        const input = App.numInput(it[key], (v) => {
          it[key] = v; App.markCarried(input, it, key); App.changed(); page.update();
        }, { col: key });
        App.markCarried(input, it, key);
        return h('td', { class: 'cell-in ' + (cls || '') }, input);
      };
      row.appendChild(field('total'));
      row.appendChild(field('tfIn'));
      row.appendChild(field('tfOut'));
      row.appendChild(field('inn'));
      row.appendChild(field('out', 'entry'));
      const bal = h('td', { class: 'num calc' });
      const shop = h('td', { class: 'num calc' });
      row.appendChild(bal);
      row.appendChild(shop);
      outs.push(() => {
        const r = C.itemRow(it);
        bal.textContent = q(r.bal);
        // SHOP shows only while it differs from BAL (TF IN / TF OUT / IN not yet in HQ)
        shop.textContent = r.shop !== r.bal ? q(r.shop) : '';
        shop.classList.toggle('diff', r.shop !== r.bal);
        shop.title = r.shop !== r.bal ? 'SHOP is different from BAL (waiting for HQ update)' : '';
      });
      return row;
    }

    function totalsRow(cls, label, getTotals, outs, edit) {
      const cells = {};
      ['total', 'tfIn', 'tfOut', 'inn', 'out'].forEach((k) => { cells[k] = h('td', { class: 'num' }); });
      cells.bal = h('td', { class: 'num calc' });
      cells.shop = h('td', { class: 'num calc' });
      outs.push(() => {
        const t = getTotals();
        for (const k in cells) cells[k].textContent = (k === 'total' || k === 'bal' || t[k]) ? q(t[k]) : '';
        cells.shop.textContent = t.shop !== t.bal ? q(t.shop) : '';
        cells.shop.classList.toggle('diff', t.shop !== t.bal);
      });
      return h('tr', { class: cls }, h('td', { colspan: edit ? 3 : 2, text: label }),
        cells.total, cells.tfIn, cells.tfOut, cells.inn, cells.out, cells.bal, cells.shop);
    }
    function subtotalRow(g, outs, edit) {
      return totalsRow('subtotal', `Total ${g.name}`, () => C.groupTotals(g), outs, edit);
    }
    function grandRow(groups, outs, edit) {
      return totalsRow('total', 'GRAND TOTAL', () => {
        const t = { total: 0, tfIn: 0, tfOut: 0, inn: 0, out: 0, bal: 0, shop: 0 };
        groups.forEach((g) => { const x = C.groupTotals(g); for (const k in t) t[k] += x[k]; });
        return t;
      }, outs, edit);
    }

    function groupEditor(g, gi) {
      const code = h('input', { type: 'text', value: g.code, style: 'width:7rem;font-size:1rem;padding:0.2rem' });
      code.addEventListener('input', () => {
        const next = code.value.trim();
        // keep the matching line on the Stock Bal sheet linked
        App.data.stock.watches.forEach((w) => {
          if (w.link && w.link.sheet === sheet && w.link.group === g.code) { w.link.group = next; w.code = next; }
        });
        g.code = next;
        App.changed();
      });
      const name = h('input', { type: 'text', value: g.name, style: 'width:18rem;font-size:1rem;padding:0.2rem' });
      name.addEventListener('input', () => { g.name = name.value; App.changed(); });
      return h('span', null, 'Group code ', code, '  name ', name, '  ',
        h('button', { class: 'btn small danger', onclick: () => removeGroup(gi) }, 'Remove group'));
    }

    function moveItem(g, idx, dir) {
      const j = idx + dir;
      if (j < 0 || j >= g.items.length) return;
      [g.items[idx], g.items[j]] = [g.items[j], g.items[idx]];
      App.changed();
      App.refresh();
    }
    async function removeItem(g, it) {
      const ok = await App.confirm('Remove this item?', `Remove "${it.name}" from ${g.name}?`, 'Yes, remove', true);
      if (!ok) return;
      g.items = g.items.filter((x) => x !== it);
      App.saveNow();
      App.refresh();
    }
    async function addItem(g) {
      const name = h('input', { type: 'text', placeholder: 'e.g. SR626' });
      const ref = h('input', { type: 'text', placeholder: 'e.g. 2800025' });
      const total = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
      setTimeout(() => name.focus(), 50);
      const ok = await App.confirm(`Add to ${g.name}`, h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: 'Product' }), name),
        h('div', { class: 'field' }, h('label', { text: 'Code no.' }), ref),
        h('div', { class: 'field' }, h('label', { text: 'Quantity now' }), total)), 'Add');
      if (!ok || !name.value.trim()) return;
      g.items.push({ id: App.newId('i'), name: name.value.trim().toUpperCase(), ref: ref.value.trim(),
        total: App.parseNum(total.value) || 0, tfIn: null, tfOut: null, inn: null, out: null, shop: null });
      App.saveNow();
      App.refresh();
    }
    async function removeGroup(gi) {
      const g = App.data.stock[sheet][gi];
      const ok = await App.confirm('Remove the whole group?',
        `Remove "${g.name}" and all ${g.items.length} items inside it?`, 'Yes, remove group', true);
      if (!ok) return;
      App.data.stock[sheet].splice(gi, 1);
      App.data.stock.watches = App.data.stock.watches.filter((w) => !(w.link && w.link.sheet === sheet && w.link.group === g.code));
      App.saveNow();
      App.refresh();
    }
    async function addGroup() {
      const code = h('input', { type: 'text', placeholder: 'e.g. M-BAT' });
      const name = h('input', { type: 'text', placeholder: 'e.g. MAXELL BATTERY' });
      setTimeout(() => code.focus(), 50);
      const ok = await App.confirm('Add a new group', h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: 'Code' }), code),
        h('div', { class: 'field' }, h('label', { text: 'Name' }), name)), 'Add');
      if (!ok || !code.value.trim()) return;
      const g = { id: App.newId('g'), code: code.value.trim().toUpperCase(), name: name.value.trim().toUpperCase(), items: [] };
      App.data.stock[sheet].push(g);
      // also show it as one line on the Stock Bal sheet
      App.data.stock.watches.push({ id: App.newId('w'), code: g.code, name: g.name, link: { sheet, group: g.code } });
      App.saveNow();
      App.refresh();
    }

    const page = { render };
    return page;
  }

  App.pages.battery = makePage('battery', 'Battery', 'batteries');
  App.pages.strap = makePage('strap', 'Strap', 'straps');
})();
