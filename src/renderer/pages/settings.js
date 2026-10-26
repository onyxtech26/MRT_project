/* SETTINGS: shop details, opening cash, old stock reports, backups. */
(function () {
  'use strict';
  const h = App.h;

  function textField(label, obj, key, opts) {
    opts = opts || {};
    const input = h('input', { type: 'text', value: obj[key] === null || obj[key] === undefined ? '' : String(obj[key]),
      inputmode: opts.number ? 'decimal' : null, style: opts.wide ? 'min-width:22rem' : null });
    input.addEventListener('input', () => {
      if (opts.number) {
        const v = App.parseNum(input.value);
        input.classList.toggle('bad', v === undefined);
        if (v === undefined) return;
        obj[key] = v || 0;
      } else {
        obj[key] = input.value;
      }
      App.changed();
      if (opts.after) opts.after();
    });
    return h('div', { class: 'field' }, h('label', { text: label }), input, opts.hint ? h('span', { class: 'hint', text: opts.hint }) : null);
  }

  function render(main) {
    const s = App.data.settings;
    const money = App.data.money;
    main.appendChild(h('div', { class: 'toolbar' }, h('h1', { class: 'page-title', text: 'Settings' })));

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Shop details (shown on printouts)' }),
      h('div', { class: 'form-row' },
        textField('Company', s, 'company', { wide: true }),
        textField('Outlet', s, 'outlet', { after: () => { document.getElementById('outletName').textContent = s.outlet; } }),
        textField('Warehouse code', s, 'warehouseCode'),
        textField('Bank', s, 'bankName'),
        textField('Bank account no.', s, 'bankAccount'))));

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Cash balance before the first day in the book' }),
      h('div', { class: 'form-row' },
        textField('Opening cash (RM)', money, 'openingBalance', { number: true,
          hint: 'Cash not yet banked in before the first sale day you keyed in.' }))));

    main.appendChild(historyCard());

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Backup (keep a copy on a pen drive)' }),
      h('p', { text: 'The app saves by itself after every change, and keeps a copy of each day automatically. ' +
        'For extra safety, save a backup copy to a pen drive once a week.' }),
      h('div', { class: 'form-row' },
        h('button', { class: 'btn big primary', onclick: async () => {
          App.saveNow();
          const r = await window.api.backupSave();
          if (r && r.ok) App.toast('Backup saved');
        } }, 'Save a backup copy…'),
        h('button', { class: 'btn big danger', onclick: async () => {
          const ok = await App.confirm('Restore from a backup?',
            'Everything in the app will be replaced by the backup file you choose. (The current data is kept in the backups folder first.)',
            'Yes, choose a backup file', true);
          if (!ok) return;
          const r = await window.api.backupRestore();
          if (r && r.ok) {
            App.data = r.data;
            App.toast('Backup restored');
            App.refresh();
          } else if (r && r.error) {
            App.alert('Cannot restore', r.error);
          }
        } }, 'Restore from a backup…'),
        h('button', { class: 'btn big', onclick: () => window.api.openDataFolder() }, 'Open data folder'))));
  }

  function historyCard() {
    const hist = App.data.stockHistory || {};
    const dates = Object.keys(hist).sort().reverse();
    if (!dates.length) {
      return h('div', { class: 'card' }, h('h2', { text: 'Old stock reports' }),
        h('p', { class: 'empty', text: 'Old reports appear here after you press "Start New Day".' }));
    }
    const select = h('select', { style: 'min-width:22rem' },
      dates.map((d) => h('option', { value: d, text: App.fmtDateLong(d) })));
    return h('div', { class: 'card' },
      h('h2', { text: 'Old stock reports' }),
      h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: 'Choose a day' }), select),
        h('button', { class: 'btn big primary', onclick: () => App.printStock(hist[select.value], ' (old report)') }, 'Print Preview'),
        h('button', { class: 'btn big danger', onclick: undoNewDay }, 'Undo last "Start New Day"')));
  }

  async function undoNewDay() {
    const hist = App.data.stockHistory || {};
    const last = Object.keys(hist).sort().pop();
    if (!last) return;
    const ok = await App.confirm('Undo the last "Start New Day"?', h('div', null,
      h('p', null, 'The stock report will go back to ', h('b', { text: App.fmtDateLong(last) }), '.'),
      h('p', null, 'Anything keyed in on ', h('b', { text: App.fmtDate(App.data.stock.date) }), ' will be lost.')),
    'Yes, go back', true);
    if (!ok) return;
    App.data.stock = hist[last];
    delete hist[last];
    App.saveNow();
    App.toast('Back to ' + App.fmtDate(last));
    App.show('stock');
  }

  App.pages.settings = { render };
})();
