/* Starts the app: tabs, text size, keyboard shortcuts. */
(function () {
  'use strict';

  let s = App.data.settings;

  App.showHeader = function () {
    document.getElementById('outletName').textContent = App.t('{outlet} OUTLET', { outlet: s.outlet });
    document.getElementById('todayText').textContent = App.t('Today: {date}', { date: App.fmtDateLong(App.todayIso()) });
  };

  // Words that are written in index.html (tabs, top bar, preview buttons)
  function translateStatic() {
    document.documentElement.lang = window.I18N.lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = App.t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = App.t(el.dataset.i18nTitle); });
    // the button shows the language you can switch TO
    document.getElementById('langToggle').textContent = window.I18N.lang === 'zh' ? 'English' : '中文';
    App.showHeader();
  }

  // Use after App.data changes (language switch, restore from backup)
  App.applyLanguage = function () {
    s = App.data.settings;
    window.I18N.lang = s.lang === 'zh' ? 'zh' : 'en';
    translateStatic();
    applyTextSize();
    App.refresh();
  };
  App.setLanguage = function (lang) {
    App.data.settings.lang = lang;
    window.I18N.lang = lang === 'zh' ? 'zh' : 'en';
    App.saveNow(); // after the switch, so "Saved" shows in the new language
    App.applyLanguage();
  };
  document.getElementById('langToggle').addEventListener('click', () => {
    App.setLanguage(window.I18N.lang === 'zh' ? 'en' : 'zh');
  });

  let shownDay = App.todayIso();
  const showToday = App.showHeader;
  setInterval(() => {
    showToday();
    // after midnight, redraw the stock tabs so the date note and Start New Day button are up to date
    if (App.todayIso() !== shownDay) {
      shownDay = App.todayIso();
      if (['stock', 'battery', 'strap'].includes(App.current) && document.getElementById('preview').hidden &&
        document.getElementById('modal').hidden) App.refresh();
    }
  }, 60 * 1000);

  function applyTextSize() {
    document.documentElement.style.fontSize = (18 * (s.textSize || 100) / 100) + 'px';
  }
  applyTextSize();
  const size = (d) => {
    s.textSize = Math.min(150, Math.max(70, (s.textSize || 100) + d));
    applyTextSize();
    App.changed();
  };
  document.getElementById('textBigger').addEventListener('click', () => size(10));
  document.getElementById('textSmaller').addEventListener('click', () => size(-10));

  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => App.show(b.dataset.page)));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (!document.getElementById('preview').hidden) document.getElementById('previewPrint').click();
      else if (['stock', 'battery', 'strap'].includes(App.current)) App.printStock();
    }
  });

  translateStatic();
  App.show('stock');
  if (App.firstRun) App.saveNow();
  if (App.restoredFrom) {
    App.alert(App.t('Data was recovered'),
      App.t('The data file was damaged, so the app opened the backup "{file}". Please check today\'s numbers.', { file: App.restoredFrom }));
  }
})();
