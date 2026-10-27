# MRT Daily — Developer Guide

How the app is built, where things are, and how to change and release it.

## Overview

- **Electron 22.3.27** with plain HTML, CSS and JavaScript. There is no framework and no build step for the UI.
  Electron 22 is the **last version that runs on Windows 7**, so do not upgrade it while the shop
  PC is on Windows 7.
- **Fully offline.** All data is one JSON file on the PC.
- There are no native modules, so it builds cleanly for 32-bit and 64-bit Windows.

## Project layout

```
package.json              scripts + electron-builder config
build/icon.ico            Windows app icon
src/
  main.js                 Electron main process: window, file save/load, backups, print, PDF
  preload.js              the only bridge between the page and Node (window.api)
  seed.json               data loaded on first start (the shop's backup of 27/10/2026)
  renderer/
    index.html            page shell: top bar, tabs, preview screen, dialog
    styles.css            screen styles (rem-based, so "Text size" scales everything)
    print.css             A4 paper styles + @media print
    i18n.js               screen language (English / Simplified Chinese): App.t, App.tx, column sub-labels
    zh.js                 the Chinese text, keyed by the English text
    calc.js               ALL arithmetic (stock + money); shared with the tests
    app.js                helpers: App.data, saving, formatting, inputs, dialogs, page switching
    print.js              print preview screen + paper layouts (stock, battery, strap, bank in, month)
    main-ui.js            start-up: tabs, text size, Ctrl+P
    pages/
      stock.js            Stock Balance tab + App.startNewDay()
      items.js            Battery and Strap tabs (same code, two lists)
      bankin.js           Bank In tab
      month.js            Month Sale tab
      settings.js         Settings tab (shop details, opening cash, old reports, backup)
    assets/               MPT logos (white for the screen, navy for paper) + icon
test/calc.test.js         checks calc.js against the October 2026 Excel sheets
test/fixtures/            the original 24/10/2026 data imported from Excel (used by the tests)
test/i18n.test.js         checks every screen text has a Chinese line (and no unused lines)
docs/                     this guide + the user guide
.github/workflows/        builds the Windows installers on every push
```

Scripts are plain `<script>` tags that share a global `App` object, plus `Calc` from `calc.js`.
ES modules are not used because they do not load from `file://` in Electron without extra setup.

## Running and testing

```bash
npm install
npm start      # opens the app
npm test       # calculation + translation tests
```

For UI work, the renderer also runs in a normal browser. Serve `src/` (for example with
`python3 -m http.server` from inside `src/`) and open `/renderer/index.html`. When `window.api`
is missing, `app.js` falls back to `localStorage` plus `../seed.json`.

## Data

The data is stored in `%APPDATA%\MPT MRT Daily\mrt-data.json`, which is Electron's `app.getPath('userData')`.

- **Saving:** the renderer calls `App.changed()` after every edit. That waits 400 ms and then sends the
  whole JSON through a synchronous IPC call (`data:save`). The main process writes `*.tmp` and then renames it,
  so a power cut cannot leave half a file.
- **Daily backups:** on each start, the file is copied to `backups/mrt-data-YYYY-MM-DD.json`. Only the newest 120 are kept.
- **Recovery:** if the main file cannot be read, the newest valid backup is loaded and the user is told.
- **Restore:** "Restore from a backup" first copies the current file to `backups/before-restore-<time>.json`.

### File format (`version: 1`)

```jsonc
{
  "version": 1,
  "settings": { "company", "outlet", "warehouseCode", "bankName", "bankAccount", "textSize": 100 },

  "stock": {
    "date": "2026-10-24",                       // date of the current report
    "watches": [                                // STOCK BAL lines, in print order
      { "id", "code": "SUB", "name": "SUBMARINE",
        "total": 71, "shop": 71,                // yesterday (shop: null = brand has no SHOP column)
        "keep", "rp",                           // watches on keep / in repair, kept by Start New Day
        "tfIn", "tfOut", "shopee", "inn",       // kept by Start New Day until the staff clears them
        "sOut",                                 // today's sales, cleared by Start New Day
        "carried": { "tfOut": 1 } },            // part of tfIn/tfOut/inn already counted in SHOP
      { "id", "code": "S-BAT", "name": "SONY BATTERY",
        "link": { "sheet": "battery", "group": "S-BAT" } }   // totals come from that group
    ],
    "battery": [ { "id", "code": "S-BAT", "name": "SONY BATTERY",
                   "items": [ { "id", "name": "SR626", "ref": "2800025",
                                "total", "tfIn", "tfOut", "inn", "out",
                                "shop": null,                 // remembered SHOP, null = same as total
                                "carried": {} } ] } ],        // as for watches
    "strap":   [ /* same shape as battery */ ],
    "notes":   [ { "id", "text", "ref" } ]      // TF IN & TF OUT & REPAIR lines
  },

  "stockHistory": { "2026-10-24": { /* a full copy of "stock" */ } },

  "money": {
    "openingBalance": 753,                      // cash not banked before the first recorded day
    "days": {
      "2026-10-18": { "sale": 700, "card": 433, "cash": 267,
                      "bankDate": "2026-10-18", "bankAmount": 350 }   // bank fields only on the
    }                                                                  // last day of a bank-in batch
  }
}
```

Empty number fields are `null`. Dates are `YYYY-MM-DD` strings and are shown as `DD/MM/YYYY`.
The main process also passes `--lang=en-GB`, so date pickers use DD/MM/YYYY.

If you change the format, bump `version` and add a migration in `main.js` `loadData()`.
Note that `looksValid()` currently accepts only `version === 1`.

## Business rules (`calc.js`)

> **Golden rule (from the shop owner): a number changes SHOP when it is keyed in — once, never again.**
> Every KEEP / RP / TF IN / TF OUT / SHOPEE / IN on the sheet is counted once. After Start New Day it stays on the sheet
> but is not counted again (`carried`). Never assume a number was "already taken off by hand": an earlier version did
> that for KEEP / RP and the owner rejected it. `test/calc.test.js` checks this.

**Stock**

| | Rule |
|---|---|
| Watch BAL | `TOTAL − S.OUT`. BAL follows HQ, so TF and IN do not change it. |
| Watch SHOP | `SHOP + new(TF IN) − new(TF OUT) − new(SHOPEE) + new(IN) − Δ(KEEP+RP) − S.OUT` (blank if the brand has no SHOP) |
| Item BAL | `TOTAL − OUT` |
| Item SHOP | `(shop ?? TOTAL) + new(TF IN) − new(TF OUT) + new(IN) − OUT` |
| KEEP / RP | `SHOP −= x − carried.x` for each: raising takes watches off SHOP, lowering puts them back. `Calc.migrate` removes, once, the "already counted" KEEP / RP markers an earlier version wrote (`awayCounted`), so those numbers deduct like keyed-in ones (`keyedRule` marks it done) |
| `new(x)` | `max(0, x − carried.x)`: only the amount typed since the last Start New Day. Lowering or clearing a kept number changes nothing. |
| Linked line | sums of that battery or strap group; SHOP only while the group SHOP differs from its BAL, otherwise empty |
| Start New Day (`rollStockForward`) | watch: `total ← BAL`, `shop ← SHOP`; item: `total ← BAL`, `shop ← SHOP` only if it differs from BAL; **only S.OUT / OUT cleared**; TF IN / TF OUT / SHOPEE / IN kept and recorded in `carried` (shown grey); KEEP/RP kept; the old report goes to `stockHistory`. The new date is always today's computer date; refused if the report is already for today (a report with a later date is moved back to today). There is no undo: staff fix mistakes by editing the numbers |

**Money** (`ledger`) walks every day in date order:

- `cash` = the stored cash, or `sale − card` if none is stored
- `running += cash`; `TOTAL = running`
- on a day with `bankAmount`: `LESS = running − bankAmount`, `running = LESS`, and the next day shows `BAL = LESS`
- `pending` = days since the last bank in (shown on the Bank In tab)

`test/calc.test.js` checks these rules against the real October 2026 sheets: every daily TOTAL,
the BAL carry-overs, SUBMARINE's BAL 70 / SHOP 69, and the stock total of 1990. Run it after any change to `calc.js`.

## Screen language (English / 中文)

- `settings.lang` is `'en'` or `'zh'`. It is switched with the top-bar button or in Settings (`App.setLanguage`).
- In code, write the **English text** and wrap it: `App.t('Save')`, or `App.tx('Press **Enter** to go down')` for
  text with bold parts. Use `{name}` for values: `App.t('Saved sale for {date}', { date })`. In page files these are
  usually the local `t(...)` / `tx(...)`.
- Keys must be plain quoted strings (not template literals), so the test can find them.
- Add the Chinese line to `src/renderer/zh.js`. `npm test` fails if a screen text has no Chinese line, if
  `{placeholders}` don't match, or if `zh.js` has unused lines.
- Words in `index.html` use `data-i18n="..."` / `data-i18n-title="..."`.
- Column codes (TOTAL, SHOP, S.OUT …) stay in English to match the HQ report. `App.th('TOTAL')` adds a small
  Chinese word under them in Chinese mode.
- Printouts (`print.js` paper layouts) stay in English on purpose; only the preview screen's buttons are translated.

## Printing

`print.js` builds `.sheet` elements into `#printArea` inside the preview screen.
`print.css` hides the rest of the app under `@media print`, so the system print dialog
(`webContents.print`) and **Save as PDF** (`webContents.printToPDF`, `preferCSSPageSize`) print only the sheets.
Each sheet is one A4 portrait page. The battery and strap sheets use the `compact` class so that
about 55 rows fit on one page. If the lists grow a lot, check the page count in Print Preview → Save as PDF.

## Building the Windows installer

```bash
npm run dist:win     # NSIS installer + portable exe, both containing 32-bit and 64-bit
```

The output goes to `dist/`:

- `MPT-MRT-Daily-Setup-<version>.exe` is the installer. It picks 32-bit or 64-bit by itself and creates a desktop icon called "MRT Daily".
- `MPT-MRT-Daily-Portable-<version>.exe` runs without installing.

On Linux, electron-builder needs **wine** (to stamp the icon into the exe).
**GitHub Actions** (`.github/workflows/build-windows.yml`) builds on `windows-latest` for every push
and attaches the two `.exe` files as the **MPT-MRT-Daily-Windows** artifact on the run page.
The exe files (about 130 MB) are deliberately kept out of git.

**To release a new version:** bump `"version"` in `package.json`, push, and download the artifact.
Installing a new version over the old one keeps the data, because it lives in `%APPDATA%`, not in the program folder.

## Security notes

The window uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and a strict CSP.
Navigation and pop-up windows are blocked. The page can only reach the functions in `preload.js`.

## Known gaps / ideas

- There is no one-click undo after removing a brand or item (only the daily backups).
- Linked lines (LS, PS, R-BAT, S-BAT) can be removed from the Stock Bal list, and there is no button to re-add only the link.
- There is no Excel export yet.
- The app has not yet been tested on a real Windows 7 PC.
