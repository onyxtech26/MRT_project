# MPT MRT Daily

Offline Windows app for the **MPT (Million Precision Time) MRT outlet**. It replaces the daily
Excel files:

| Tab | Replaces | Printed |
|---|---|---|
| **Stock Balance** | `STOCK BAL` sheet | Yes (with Battery + Strap pages) |
| **Battery** | `BATTERY` sheet | Yes |
| **Strap** | `STRAP` sheet | Yes |
| **Bank In** | `BANK IN.xlsx` | Yes (bank-in slip) |
| **Month Sale** | `MONTH SALE.xlsx` | Yes |

Runs on **Windows 7, 8, 10 and 11** (32-bit and 64-bit). It uses Electron 22, the last version that
supports Windows 7. No internet is needed.

## For the manager: daily use

**Every morning, Stock Balance tab:** press the green **Start New Day** button and choose today's date.
BAL moves to TOTAL, SHOP moves to SHOP, and S.OUT / TF IN / TF OUT / IN are cleared on all 3 sheets.
(This replaces copying and pasting from right to left.)

**During the day:**
- Watches sold: type the number in the yellow **S.OUT** column. Press **Enter** to go down.
- Batteries / straps sold: type it in the yellow **OUT** column on the Battery / Strap tab.
- New stock arrived but HQ has not updated yet: type the quantity in **IN**. SHOP goes up, BAL stays the same.
  When HQ updates, change **TOTAL** to the HQ number.
- Transfers and repairs: write them under **TF IN & TF OUT & REPAIR** on the Stock Balance tab.

**Printing:** press **Print Preview**. The preview looks exactly like the paper. Then press **PRINT**,
or **Save as PDF**.

**Sales and bank in (Bank In tab):**
1. Type the date, SALE and CARD, then press **Save**. CASH is filled in for you, and you can change it.
2. The table shows all cash not banked in yet, plus the balance left over from the last bank in.
3. After going to the bank, type the bank-in date and amount, then press **Save Bank In**. LESS is
   carried to the next day automatically. You can print the slip right away.

The **Month Sale** tab fills in by itself and can be used to correct numbers.

Everything saves by itself. Use **A− / A+** at the top right to change the text size.

## The rules the app uses

- `BAL = TOTAL − S.OUT`. BAL follows HQ, so IN and TF do not change it.
- `SHOP = yesterday's SHOP + TF IN − TF OUT + IN − S.OUT`
- On the Stock Bal sheet, the R-BAT, S-BAT, LS and PS lines are added up automatically from the Battery and Strap tabs.
- `CASH = SALE − CARD` (can be changed), `TOTAL = balance from last bank in + cash since then`,
  `LESS = TOTAL − BANK IN`, and LESS becomes the next day's BAL.

These rules are checked against the October 2026 sheets in `test/calc.test.js`.

## Data and backups

Data is kept in `%APPDATA%\MPT MRT Daily\mrt-data.json`. A copy is kept every day in the `backups`
folder next to it (the last 120 days). Settings has buttons to save a backup to a pen drive and to
restore one. The first time the app starts, it loads the 24/10/2026 stock report and the
October 2026 sales from the original Excel files.

## For developers

```
npm install
npm start          # run the app
npm test           # check the calculations
npm run dist:win   # build dist/MPT-MRT-Daily-Setup-1.0.0.exe and the portable exe
```

On Linux, building needs `wine`. Every push also builds the Windows installers on GitHub Actions.
The files are under the run's **Artifacts** (workflow "Build Windows app").
