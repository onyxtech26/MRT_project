/* SETTINGS: shop details, opening cash, old stock reports, backups. */
(function () {
  'use strict';
  const h = App.h;
  const t = App.t;

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
    main.appendChild(h('div', { class: 'toolbar' }, h('h1', { class: 'page-title', text: t('Settings') })));

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: t('Language') }),
      h('div', { class: 'form-row' },
        h('button', { class: 'btn big ' + (s.lang === 'zh' ? '' : 'primary'), onclick: () => App.setLanguage('en') }, 'English'),
        h('button', { class: 'btn big ' + (s.lang === 'zh' ? 'primary' : ''), onclick: () => App.setLanguage('zh') }, '中文 (简体)')),
      h('p', { class: 'hint', text: t('Printouts stay in English, the same as the HQ report.') })));

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: t('Shop details (shown on printouts)') }),
      h('div', { class: 'form-row' },
        textField(t('Company'), s, 'company', { wide: true }),
        textField(t('Outlet'), s, 'outlet', { after: App.showHeader }),
        textField(t('Warehouse code'), s, 'warehouseCode'),
        textField(t('Bank'), s, 'bankName'),
        textField(t('Bank account no.'), s, 'bankAccount'))));

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: t('Cash balance before the first day in the book') }),
      h('div', { class: 'form-row' },
        textField(t('Opening cash (RM)'), money, 'openingBalance', { number: true,
          hint: t('Cash not yet banked in before the first sale day you keyed in.') }))));

    main.appendChild(historyCard());

    main.appendChild(h('div', { class: 'card' },
      h('h2', { text: t('Backup (keep a copy on a pen drive)') }),
      h('p', { text: t('The app saves by itself after every change, and keeps a copy of each day automatically. For extra safety, save a backup copy to a pen drive once a week.') }),
      h('div', { class: 'form-row' },
        h('button', { class: 'btn big primary', onclick: async () => {
          App.saveNow();
          const r = await window.api.backupSave();
          if (r && r.ok) App.toast(t('Backup saved'));
        } }, t('Save a backup copy…')),
        h('button', { class: 'btn big danger', onclick: async () => {
          const ok = await App.confirm(t('Restore from a backup?'),
            t('Everything in the app will be replaced by the backup file you choose. (The current data is kept in the backups folder first.)'),
            t('Yes, choose a backup file'), true);
          if (!ok) return;
          const r = await window.api.backupRestore();
          if (r && r.ok) {
            App.data = r.data;
            App.applyLanguage();
            App.toast(t('Backup restored'));
          } else if (r && r.error) {
            App.alert(t('Cannot restore'), t(r.error)); // errors from main.js are listed in zh.js
          }
        } }, t('Restore from a backup…')),
        h('button', { class: 'btn big', onclick: () => window.api.openDataFolder() }, t('Open data folder')))));
  }

  function historyCard() {
    const hist = App.data.stockHistory || {};
    const dates = Object.keys(hist).sort().reverse();
    if (!dates.length) {
      return h('div', { class: 'card' }, h('h2', { text: t('Old stock reports') }),
        h('p', { class: 'empty', text: t('Old reports appear here after you press "Start New Day".') }));
    }
    const select = h('select', { style: 'min-width:22rem' },
      dates.map((d) => h('option', { value: d, text: App.fmtDateLong(d) })));
    return h('div', { class: 'card' },
      h('h2', { text: t('Old stock reports') }),
      h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { text: t('Choose a day') }), select),
        h('button', { class: 'btn big primary', onclick: () => App.printStock(hist[select.value], t(' (old report)')) }, t('Print Preview'))));
  }

  App.pages.settings = { render };
})();
