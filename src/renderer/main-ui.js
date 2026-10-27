/* Starts the app: tabs, text size, keyboard shortcuts. */
(function () {
  'use strict';
  const s = App.data.settings;

  document.getElementById('outletName').textContent = `${s.outlet} OUTLET`;
  let shownDay = App.todayIso();
  const showToday = () => { document.getElementById('todayText').textContent = 'Today: ' + App.fmtDateLong(App.todayIso()); };
  showToday();
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

  App.show('stock');
  if (App.firstRun) App.saveNow();
  if (App.restoredFrom) {
    App.alert('Data was recovered', `The data file was damaged, so the app opened the backup "${App.restoredFrom}". Please check today's numbers.`);
  }
})();
