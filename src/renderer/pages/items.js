/* BATTERY and STRAP screens (same layout, different list). */
(function () {
  'use strict';
  const h = App.h;
  const C = window.Calc;
  const q = App.fmtQty;
  const t = App.t;
  const tx = App.tx;
  const editing = { battery: false, strap: false };

  function makePage(sheet, title, soldHelp) { // title / soldHelp: functions, so they follow the language
    function render(main) {
      const stock = App.data.stock;
      const groups = stock[sheet];
      const edit = editing[sheet];

      main.appendChild(h('div', { class: 'toolbar' },
        h('h1', { class: 'page-title', text: title() }),
        h('span', { class: 'date-chip', text: App.fmtDateLong(stock.date) }),
        h('span', { class: 'spacer' }),
        App.newDayButton(),
        h('button', { class: 'btn big primary', onclick: () => App.printStock() }, t('Print Preview'))));

      main.appendChild(App.staleNote() || h('span'));
      main.appendChild(h('div', { class: 'help' },
        soldHelp(), h('br'),
        tx('**New stock arrived but HQ has not updated yet?** Key the quantity in **IN**. SHOP goes up, BAL stays the same. The IN number stays on the next days ({grey}, already counted in SHOP). When HQ updates, change **TOTAL** to the HQ number and clear **IN**.',
          { grey: h('span', { class: 'carried-key', text: t('grey') }) })));

      const outs = [];
      const body = h('tbody');
      const cols = edit ? 10 : 9;
      groups.forEach((g, gi) => {
        body.appendChild(h('tr', { class: 'group' }, h('td', { colspan: cols },
          edit ? groupEditor(g, gi) : `${g.name}  (${g.code})`)));
        g.items.forEach((it, idx) => body.appendChild(itemLine(g, it, idx, outs, edit)));
        if (edit) {
          body.appendChild(h('tr', null, h('td', { colspan: cols },
            h('button', { class: 'btn', onclick: () => addItem(g) }, t('+ Add an item to {name}', { name: g.name })))));
        }
        const sub = subtotalRow(g, outs, edit);
        body.appendChild(sub);
      });

      const table = h('table', { class: 'grid' },
        h('thead', null, h('tr', null,
          edit ? h('th', null, '') : null,
          App.th('PRODUCT'), App.th('CODE'), App.th('TOTAL'), App.th('TF IN'),
          App.th('TF OUT'), App.th('IN'), App.th('OUT', { class: 'entry-head' }),
          App.th('BAL', { class: 'result-head' }), App.th('SHOP', { class: 'result-head' }))),
        body);
      const wrap = h('div', { class: 'grid-wrap' }, table);
      App.enableGridKeys(wrap);
      main.appendChild(wrap);

      page.update = () => outs.forEach((o) => o());
      page.update();

      main.appendChild(h('div', { class: 'toolbar', style: 'margin-top:0.8rem' },
        edit ? h('button', { class: 'btn big', onclick: () => addGroup(sheet) }, t('+ Add a new group')) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => { editing[sheet] = !edit; App.refresh(); } },
          edit ? t('Finish editing list') : t('Edit list (add / remove items)'))));
    }

    function itemLine(g, it, idx, outs, edit) {
      const row = h('tr');
      if (edit) {
        row.appendChild(h('td', { style: 'white-space:nowrap' },
          h('button', { class: 'btn small', title: t('Move up'), onclick: () => moveItem(g, idx, -1) }, '▲'), ' ',
          h('button', { class: 'btn small', title: t('Move down'), onclick: () => moveItem(g, idx, 1) }, '▼'), ' ',
          h('button', { class: 'btn small danger', title: t('Remove'), onclick: () => removeItem(g, it) }, '✕')));
        row.appendChild(h('td', { class: 'cell-in' }, App.textInput(it.name, (v) => { it.name = v; App.changed(); }, { col: 'name' })));
        row.appendChild(h('td', { class: 'cell-in' }, App.textInput(it.ref, (v) => { it.ref = v; App.changed(); }, { col: 'ref' })));
      } else {
        row.appendChild(h('td', { class: 'name', text: it.name }));
        row.appendChild(h('td', { class: 'code', text: it.ref }));
      }
      const field = (key, cls) => {
        const input = App.numInput(it[key], (v) => {
          C.setMove(it, key, v); App.markCarried(input, it, key); App.changed(); page.update();
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
        // empty unless there is a TF IN / TF OUT / IN on this item
        const show = C.itemShowsShop(it);
        shop.textContent = show ? q(r.shop) : '';
        shop.classList.toggle('diff', show && r.shop !== r.bal);
        shop.title = show && r.shop !== r.bal ? App.t('SHOP is different from BAL (waiting for HQ update)') : '';
      });
      return row;
    }

    function totalsRow(cls, label, getTotals, outs, edit, showShop) {
      const cells = {};
      ['total', 'tfIn', 'tfOut', 'inn', 'out'].forEach((k) => { cells[k] = h('td', { class: 'num' }); });
      cells.bal = h('td', { class: 'num calc' });
      cells.shop = h('td', { class: 'num calc' });
      outs.push(() => {
        const tot = getTotals();
        for (const k in cells) cells[k].textContent = (k === 'total' || k === 'bal' || tot[k]) ? q(tot[k]) : '';
        cells.shop.textContent = showShop() ? q(tot.shop) : '';
      });
      return h('tr', { class: cls }, h('td', { colspan: edit ? 3 : 2, text: label }),
        cells.total, cells.tfIn, cells.tfOut, cells.inn, cells.out, cells.bal, cells.shop);
    }
    function subtotalRow(g, outs, edit) {
      return totalsRow('subtotal', t('Total {name}', { name: g.name }), () => C.groupTotals(g), outs, edit,
        () => C.groupShowsShop(g));
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
      return h('span', null, t('Group code'), ' ', code, '  ', t('name'), ' ', name, '  ',
        h('button', { class: 'btn small danger', onclick: () => removeGroup(gi) }, t('Remove group')));
    }

    function moveItem(g, idx, dir) {
      const j = idx + dir;
      if (j < 0 || j >= g.items.length) return;
      [g.items[idx], g.items[j]] = [g.items[j], g.items[idx]];
      App.changed();
      App.refresh();
    }
    async function removeItem(g, it) {
      const ok = await App.confirm(t('Remove this item?'),
        t('Remove "{item}" from {group}?', { item: it.name, group: g.name }), t('Yes, remove'), true);
      if (!ok) return;
      g.items = g.items.filter((x) => x !== it);
      App.saveNow();
      App.refresh();
    }
    async function addItem(g) {
      const name = h('input', { type: 'text', placeholder: t('e.g. {x}', { x: 'SR626' }) });
      const ref = h('input', { type: 'text', placeholder: t('e.g. {x}', { x: '2800025' }) });
      const total = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
      setTimeout(() => name.focus(), 50);
      const ok = await App.confirm(t('Add to {group}', { group: g.name }), h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: t('Product') }), name),
        h('div', { class: 'field' }, h('label', { text: t('Code no.') }), ref),
        h('div', { class: 'field' }, h('label', { text: t('Quantity now') }), total)), t('Add'));
      if (!ok || !name.value.trim()) return;
      g.items.push({ id: App.newId('i'), name: name.value.trim().toUpperCase(), ref: ref.value.trim(),
        total: App.parseNum(total.value) || 0, tfIn: null, tfOut: null, inn: null, out: null, shop: null });
      App.saveNow();
      App.refresh();
    }
    async function removeGroup(gi) {
      const g = App.data.stock[sheet][gi];
      const ok = await App.confirm(t('Remove the whole group?'),
        t('Remove "{group}" and all {n} items inside it?', { group: g.name, n: g.items.length }), t('Yes, remove group'), true);
      if (!ok) return;
      App.data.stock[sheet].splice(gi, 1);
      App.data.stock.watches = App.data.stock.watches.filter((w) => !(w.link && w.link.sheet === sheet && w.link.group === g.code));
      App.saveNow();
      App.refresh();
    }
    async function addGroup() {
      const code = h('input', { type: 'text', placeholder: t('e.g. {x}', { x: 'M-BAT' }) });
      const name = h('input', { type: 'text', placeholder: t('e.g. {x}', { x: 'MAXELL BATTERY' }) });
      setTimeout(() => code.focus(), 50);
      const ok = await App.confirm(t('Add a new group'), h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: t('Code') }), code),
        h('div', { class: 'field' }, h('label', { text: t('Name') }), name)), t('Add'));
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

  App.pages.battery = makePage('battery', () => t('Battery'),
    () => tx('Key in the number of batteries **sold today** in the yellow **OUT** column.'));
  App.pages.strap = makePage('strap', () => t('Strap'),
    () => tx('Key in the number of straps **sold today** in the yellow **OUT** column.'));
})();
