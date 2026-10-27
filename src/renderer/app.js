/* Shared helpers: data, saving, formatting, building screens, dialogs. */
(function () {
  'use strict';

  // When opened outside the app (e.g. in a normal browser for testing) keep data in the browser.
  if (!window.api) {
    window.api = {
      load() {
        const saved = localStorage.getItem('mrt-data');
        if (saved) return { data: JSON.parse(saved) };
        const x = new XMLHttpRequest();
        x.open('GET', '../seed.json', false);
        x.send();
        return { data: JSON.parse(x.responseText), firstRun: true };
      },
      save(text) { localStorage.setItem('mrt-data', text); return { ok: true }; },
      print() { window.print(); return Promise.resolve({ ok: true }); },
      savePdf() { window.print(); return Promise.resolve({ ok: true }); },
      backupSave() { return Promise.resolve({ ok: false }); },
      backupRestore() { return Promise.resolve({ ok: false }); },
      openDataFolder() { return Promise.resolve(); },
    };
  }

  const App = {};
  window.App = App;

  /* ---------- data & saving ---------- */
  const loaded = window.api.load();
  if (loaded.error) {
    document.body.innerHTML = '<h1 style="padding:2rem;color:#b42318">Cannot open the data file.<br>' +
      'Please call for help.</h1><pre style="padding:2rem">' + loaded.error + '</pre>';
    throw new Error(loaded.error);
  }
  App.data = loaded.data;
  App.firstRun = !!loaded.firstRun;
  App.restoredFrom = loaded.restoredFrom || null;

  let saveTimer = null;
  function setStatus(text, error) {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', !!error);
  }
  App.saveNow = function () {
    clearTimeout(saveTimer);
    saveTimer = null;
    const res = window.api.save(JSON.stringify(App.data));
    if (res && res.ok) setStatus('✔ Saved');
    else setStatus('NOT SAVED!', true);
    return res;
  };
  App.changed = function () {
    setStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(App.saveNow, 400);
  };
  window.addEventListener('beforeunload', () => {
    if (saveTimer) App.saveNow();
  });
  App.replaceData = function (data) {
    App.data = data;
    App.saveNow();
  };

  App.newId = function (prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  };

  /* ---------- dates & numbers ---------- */
  const pad = (x) => String(x).padStart(2, '0');
  App.todayIso = function () {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  App.fmtDate = function (iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  App.fmtDateShort = function (iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  App.MONTHS = MONTHS;
  App.fmtDateLong = function (iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
  };
  App.addDays = function (iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  // whole numbers stay whole (1,043); cents only when there are cents (1,253.80)
  App.fmtMoney = function (v) {
    if (v === null || v === undefined || v === '') return '';
    const x = Number(v);
    const whole = Math.abs(x - Math.round(x)) < 0.005;
    return x.toLocaleString('en-US', {
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    });
  };
  App.fmtQty = function (v) {
    if (v === null || v === undefined || v === '') return '';
    return String(Number(v));
  };
  // '' -> null, '12' -> 12, 'abc' -> undefined (means "not a number")
  App.parseNum = function (text) {
    const t = String(text).replace(/,/g, '').replace(/^RM/i, '').trim();
    if (t === '' || t === '~' || t === '-') return null;
    if (!/^-?\d*\.?\d+$/.test(t)) return undefined;
    return Number(t);
  };

  /* ---------- building elements ---------- */
  App.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  };
  const h = App.h;

  // A number box inside a table. onValue(number|null) is called on every valid keystroke.
  App.numInput = function (value, onValue, opts) {
    opts = opts || {};
    const input = h('input', {
      class: 'cell' + (opts.cls ? ' ' + opts.cls : ''),
      type: 'text', inputmode: 'decimal', autocomplete: 'off',
      'data-col': opts.col || null,
      value: value === null || value === undefined ? '' : String(value),
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => {
      const v = App.parseNum(input.value);
      input.classList.toggle('bad', v === undefined);
      if (v !== undefined) onValue(v);
    });
    return input;
  };

  // Grey = a TF IN / TF OUT / IN number kept from an earlier day (already counted in SHOP)
  App.markCarried = function (input, row, key) {
    const c = window.Calc.isCarried(row, key);
    input.classList.toggle('carried', c);
    input.title = c ? 'Kept from an earlier day (already counted in SHOP). Clear it when HQ has updated.' : '';
  };

  App.textInput = function (value, onValue, opts) {
    opts = opts || {};
    const input = h('input', {
      class: 'cell text' + (opts.cls ? ' ' + opts.cls : ''), type: 'text',
      'data-col': opts.col || null, value: value || '', placeholder: opts.placeholder || null,
    });
    input.addEventListener('input', () => onValue(input.value));
    return input;
  };

  App.dateInput = function (value, onValue, opts) {
    opts = opts || {};
    const input = h('input', {
      class: 'cell date', type: 'date', 'data-col': opts.col || null, value: value || '',
    });
    const mark = () => input.classList.toggle('empty', !input.value);
    mark();
    input.addEventListener('change', () => { mark(); onValue(input.value || null); });
    return input;
  };

  // Enter / arrow keys move up and down a column, like Excel.
  App.enableGridKeys = function (container) {
    container.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !t.dataset.col) return;
      let dir = 0;
      if (e.key === 'Enter') dir = e.shiftKey ? -1 : 1;
      else if (e.key === 'ArrowDown') dir = 1;
      else if (e.key === 'ArrowUp') dir = -1;
      if (!dir || t.type === 'date' && e.key !== 'Enter') return;
      const all = Array.from(container.querySelectorAll(`input[data-col="${t.dataset.col}"]`));
      const next = all[all.indexOf(t) + dir];
      e.preventDefault();
      if (next) next.focus();
    });
  };

  // A yellow note when the stock report is for an earlier day
  App.staleNote = function () {
    const date = App.data.stock.date;
    const today = App.todayIso();
    if (date === today) return null;
    if (date > today) {
      return h('div', { class: 'help warn' },
        h('b', { text: `This report is for ${App.fmtDateLong(date)}, which is later than today (${App.fmtDate(today)}).` }),
        ' Check the computer\'s date and time. When the date is right, press ', h('b', { text: 'Start New Day' }),
        ' to change the report to today.');
    }
    return h('div', { class: 'help warn' },
      h('b', { text: `This report is for ${App.fmtDateLong(date)}.` }),
      ' If you are starting today\'s work, press the green ', h('b', { text: 'Start New Day' }), ' button first.');
  };

  /* ---------- dialogs ---------- */
  App.dialog = function (title, body, buttons) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal');
      document.getElementById('modalTitle').textContent = title;
      const bodyEl = document.getElementById('modalBody');
      bodyEl.innerHTML = '';
      if (typeof body === 'string') bodyEl.appendChild(h('p', { text: body }));
      else bodyEl.appendChild(body);
      const btnBox = document.getElementById('modalButtons');
      btnBox.innerHTML = '';
      buttons.forEach((b) => {
        btnBox.appendChild(h('button', {
          class: 'btn big ' + (b.cls || ''),
          onclick: () => { modal.hidden = true; resolve(b.value); },
        }, b.label));
      });
      modal.hidden = false;
      const last = btnBox.lastChild;
      if (last) last.focus();
    });
  };
  App.confirm = function (title, body, yesLabel, danger) {
    return App.dialog(title, body, [
      { label: 'No, go back', value: false },
      { label: yesLabel || 'Yes', value: true, cls: danger ? 'danger' : 'primary' },
    ]);
  };
  App.alert = function (title, body) {
    return App.dialog(title, body, [{ label: 'OK', value: true, cls: 'primary' }]);
  };

  let toastTimer = null;
  App.toast = function (text, error) {
    const t = document.getElementById('toast');
    t.textContent = text;
    t.classList.toggle('error', !!error);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  };

  /* ---------- pages ---------- */
  App.pages = {};
  App.current = null;
  App.show = function (name, opts) {
    const page = App.pages[name];
    if (!page) return;
    App.current = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
    const main = document.getElementById('page');
    main.innerHTML = '';
    page.render(main, opts || {});
    main.scrollTop = 0;
  };
  App.refresh = function () {
    if (App.current) App.show(App.current);
  };
})();
