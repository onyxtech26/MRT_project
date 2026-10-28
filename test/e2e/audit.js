// Full end-to-end audit of the real Electron app: uses every screen like the
// staff would and checks the numbers. Needs Playwright and a display:
//   npm i -g playwright && xvfb-run node test/e2e/audit.js   (Linux)
// Prints PASS / FAIL per check and any JavaScript errors.
const { _electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const S = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mrt-audit-'));
const UD = path.join(S, 'audit-ud');
const results = [];
let errors = [];

function check(name, fn) {
  return fn().then(() => results.push(['PASS', name]), (e) => results.push(['FAIL', name + ' :: ' + e.message.split('\n')[0]]));
}

async function launch() {
  const app = await _electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT, '--user-data-dir=' + UD] });
  const p = await app.firstWindow();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.waitForSelector('#tabs');
  await p.waitForTimeout(300);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(1280, 900); });
  // fake the native file dialogs
  await app.evaluate(({ dialog }, dir) => {
    dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: dir + '/' + o.defaultPath.split(/[\/]/).pop() });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__restoreFile] });
  }, S);
  return { app, p };
}

const tab = (p, name) => p.click(`#tabs button[data-page="${name}"]`);
const row = (p, name) => p.locator('tr', { has: p.locator('td.name', { hasText: new RegExp('^' + name.replace(/[.()+]/g, '\\$&') + '$') }) });
const res = async (p, name) => (await row(p, name).locator('td').allInnerTexts()).slice(-2).map((x) => x.trim());
const eq = (a, b, what) => assert.deepStrictEqual(a, b, (what || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
const put = async (p, name, col, v) => { await row(p, name).locator(`input[data-col="${col}"]`).fill(String(v)); await p.waitForTimeout(60); };
const modalYes = async (p) => { await p.locator('#modalButtons button').last().click(); await p.waitForTimeout(150); };
const modalNo = async (p) => { await p.locator('#modalButtons button').first().click(); await p.waitForTimeout(150); };

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  let { app, p } = await launch();

  /* ---------- stock balance ---------- */
  await check('opens on Stock Balance with the 27/10 data', async () => {
    assert.ok((await p.textContent('.date-chip')).includes('27 October 2026'));
    eq(await res(p, 'CROCODILE WALL CLOCK'), ['20', '19']);
    eq(await res(p, 'SUBMARINE'), ['67', '67']);
  });
  await check('stock columns in the right order', async () => {
    const hd = (await p.locator('thead tr').nth(1).locator('th').allInnerTexts()).join('|');
    assert.strictEqual(hd, 'CODE|BRAND|TOTAL|SHOP|KEEP|RP|TF IN|TF OUT|SHOPEE|IN|S.OUT|BAL|SHOP');
  });
  await check('S.OUT lowers BAL and SHOP; TOTAL row follows', async () => {
    const before = (await p.locator('tr.total td').allInnerTexts()).map((x) => x.trim());
    await put(p, 'BONIA', 'sOut', 2);
    eq(await res(p, 'BONIA'), ['21', '21']);
    const after = (await p.locator('tr.total td').allInnerTexts()).map((x) => x.trim());
    assert.strictEqual(Number(after[after.length - 2]), Number(before[before.length - 2]) - 2);
    assert.strictEqual(after[after.length - 1], ''); // no SHOP total
    assert.strictEqual(after[3], '');               // no yesterday SHOP total
  });
  await check('KEEP / RP / TF IN / TF OUT / SHOPEE / IN change SHOP only', async () => {
    await put(p, 'DANIEL KLEIN', 'keep', 1);  eq(await res(p, 'DANIEL KLEIN'), ['102', '101']);
    await put(p, 'DANIEL KLEIN', 'rp', 1);    eq(await res(p, 'DANIEL KLEIN'), ['102', '100']);
    await put(p, 'MINI FOCUS', 'tfIn', 3);    eq(await res(p, 'MINI FOCUS'), ['45', '48']);
    await put(p, 'NAVI FORCE', 'tfOut', 2);   eq(await res(p, 'NAVI FORCE'), ['72', '70']);
    await put(p, 'CASIO', 'shopee', 4);       eq(await res(p, 'CASIO'), ['253', '249']);
    await put(p, 'R&E', 'inn', 5);            eq(await res(p, 'R&E'), ['26', '31']);
  });
  await check('bad input turns red and is ignored', async () => {
    await put(p, 'CHRONOTECH', 'sOut', 'abc');
    assert.ok((await row(p, 'CHRONOTECH').locator('input[data-col="sOut"]').getAttribute('class')).includes('bad'));
    eq(await res(p, 'CHRONOTECH'), ['1', '1']);
    await put(p, 'CHRONOTECH', 'sOut', '');
  });
  await check('arrow keys move between boxes', async () => {
    await row(p, 'BONIA').locator('input[data-col="keep"]').click();
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp');
    assert.strictEqual(await p.evaluate(() => document.activeElement.dataset.col), 'keep');
  });
  await check('edit brand list: add, rename, move, remove', async () => {
    await p.click('text=Edit brand list');
    await p.click('text=+ Add a brand');
    const inputs = p.locator('#modalBody input');
    await inputs.nth(0).fill('tis'); await inputs.nth(1).fill('tissot'); await inputs.nth(2).fill('5');
    await modalYes(p);
    const names = await p.locator('input[data-col="name"]').evaluateAll((els) => els.map((e) => e.value));
    assert.strictEqual(names[names.length - 1], 'TISSOT');
    const tisRow = () => p.locator('tbody tr').filter({ has: p.locator('input[data-col="name"]') }).last();
    await tisRow().locator('button[title="Move up"]').click();
    await p.waitForTimeout(100);
    const names2 = await p.locator('input[data-col="name"]').evaluateAll((els) => els.map((e) => e.value));
    assert.strictEqual(names2[names2.length - 2], 'TISSOT');
    await p.click('text=Finish editing brand list');
    eq(await res(p, 'TISSOT'), ['5', '5']);
    await p.click('text=Edit brand list');
    const idx = (await p.locator('input[data-col="name"]').evaluateAll((els) => els.map((e) => e.value))).indexOf('TISSOT');
    await p.locator('tbody tr').filter({ has: p.locator('input[data-col="name"]') }).nth(idx).locator('button[title="Remove"]').click(); await modalYes(p);
    await p.click('text=Finish editing brand list');
    assert.strictEqual(await row(p, 'TISSOT').count(), 0);
  });
  await check('notes: add and remove a line', async () => {
    const n0 = await p.locator('.note-row').count();
    await p.click('text=+ Add a note line');
    await p.locator('.note-text').last().fill('27/10/26 TEST NOTE');
    assert.strictEqual(await p.locator('.note-row').count(), n0 + 1);
    await p.locator('.note-row').last().locator('button').click();
    assert.strictEqual(await p.locator('.note-row').count(), n0);
  });

  /* ---------- battery / strap ---------- */
  await check('battery OUT and IN; linked line on Stock Bal follows', async () => {
    await tab(p, 'battery');
    await put(p, 'SR621', 'out', 2);
    eq(await res(p, 'SR621'), ['118', '']); // SHOP empty: no TF / IN
    await put(p, 'SR626', 'inn', 20);
    eq(await res(p, 'SR626'), ['91', '111']);
    assert.strictEqual(await p.locator('tr.total').count(), 0); // no grand total
    await tab(p, 'stock');
    const sb = (await p.locator('tr.linked', { hasText: 'SONY BATTERY' }).locator('td').allInnerTexts()).map((x) => x.trim());
    eq(sb.slice(-2), ['568', '588'], 'SONY line');
  });
  await check('battery edit list: add item, add group (shows on Stock Bal), remove group', async () => {
    await tab(p, 'battery');
    await p.click('text=Edit list (add / remove items)');
    await p.click('text=+ Add an item to SONY BATTERY');
    let inp = p.locator('#modalBody input');
    await inp.nth(0).fill('sr999'); await inp.nth(1).fill('2899999'); await inp.nth(2).fill('7');
    await modalYes(p);
    await p.click('text=+ Add a new group');
    inp = p.locator('#modalBody input');
    await inp.nth(0).fill('m-bat'); await inp.nth(1).fill('maxell battery');
    await modalYes(p);
    await p.click('text=Finish editing list');
    eq(await res(p, 'SR999'), ['7', '']);
    await tab(p, 'stock');
    assert.strictEqual(await p.locator('tr.linked', { hasText: 'MAXELL BATTERY' }).count(), 1);
    await tab(p, 'battery');
    await p.click('text=Edit list (add / remove items)');
    await p.locator('tr.group', { hasText: 'Group code' }).last().locator('text=Remove group').click(); await modalYes(p);
    const names = await p.locator('input[data-col="name"]').evaluateAll((els) => els.map((e) => e.value));
    await p.locator('tbody tr').filter({ has: p.locator('input[data-col="name"]') }).nth(names.indexOf('SR999')).locator('button[title="Remove"]').click();
    await modalYes(p);
    await p.click('text=Finish editing list');
    assert.strictEqual(await row(p, 'SR999').count(), 0, 'SR999 removed');
    await tab(p, 'stock');
    assert.strictEqual(await p.locator('tr.linked', { hasText: 'MAXELL BATTERY' }).count(), 0);
  });
  await check('strap OUT works', async () => {
    await tab(p, 'strap');
    await put(p, 'HLS69-18', 'out', 1);
    eq(await res(p, 'HLS69-18'), ['37', '']);
  });

  /* ---------- printing ---------- */
  async function pdfPages() {
    const b64 = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })).toString('base64'));
    const f = path.join(S, 'audit.pdf');
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    const txt = require('child_process').execSync(`pdfinfo ${f}`).toString();
    return Number(/Pages:\s+(\d+)/.exec(txt)[1]);
  }
  await check('stock print preview: 3 A4 pages, one per sheet', async () => {
    await tab(p, 'stock');
    await p.click('text=Print Preview');
    assert.strictEqual(await p.locator('#printArea .sheet').count(), 3);
    assert.strictEqual(await pdfPages(), 3);
    const txt = await p.textContent('#printArea');
    assert.ok(!txt.includes('Grand Total') && !txt.includes('Prepared by') && txt.includes('SHOPEE') && !txt.includes('DEP'));
    await p.locator('#previewOptions input').nth(1).uncheck();
    assert.strictEqual(await p.locator('#printArea .sheet').count(), 2);
    await p.click('#previewBack');
  });

  /* ---------- start new day ---------- */
  await check('Start New Day: once a day; rolls numbers; kept numbers not counted twice', async () => {
    // pretend the report is from yesterday; the new day must be today's computer date
    await p.evaluate(() => { App.data.stock.date = App.addDays(App.todayIso(), -1); App.show('stock'); });
    const today = await p.evaluate(() => App.fmtDateLong(App.todayIso()));
    await p.click('button:has-text("Start New Day")'); await modalYes(p);
    assert.strictEqual(await p.textContent('.date-chip'), today);
    assert.strictEqual((await p.locator('.toolbar .btn.big').first().textContent()).includes("Today's report is open"), true);
    eq(await res(p, 'BONIA'), ['21', '21']);
    assert.strictEqual(await row(p, 'BONIA').locator('input[data-col="sOut"]').inputValue(), '');
    eq(await res(p, 'DANIEL KLEIN'), ['102', '100']); // KEEP 1 + RP 1 not taken off again
    eq(await res(p, 'CASIO'), ['253', '249']);       // SHOPEE 4 kept, not again
    assert.ok((await row(p, 'CASIO').locator('input[data-col="shopee"]').getAttribute('class')).includes('carried'));
    await p.locator('.toolbar .btn.big').first().click();
    assert.strictEqual(await p.textContent('#modalTitle'), "Today's report is already open"); await modalYes(p);
    assert.strictEqual(await p.textContent('.date-chip'), today);
  });
  await check('HQ update: type TOTAL and clear TF OUT -> SHOP unchanged', async () => {
    await put(p, 'NAVI FORCE', 'total', 70);
    await put(p, 'NAVI FORCE', 'tfOut', '');
    eq(await res(p, 'NAVI FORCE'), ['70', '70']);
  });
  await check('old report can be printed from Settings', async () => {
    await tab(p, 'settings');
    await p.locator('.card', { hasText: 'Old stock reports' }).locator('button', { hasText: 'Print Preview' }).click();
    const yesterday = await p.evaluate(() => App.fmtDate(App.addDays(App.todayIso(), -1)));
    assert.ok((await p.textContent('#previewTitle')).includes(yesterday));
    await p.click('#previewBack');
  });

  /* ---------- bank in ---------- */
  await check('bank in: key in sale, cash auto, update, bank in, LESS, slip, undo', async () => {
    await tab(p, 'bankin');
    const c1 = p.locator('.card').nth(0).locator('input');
    await c1.nth(1).fill('500'); await c1.nth(2).fill('320');
    assert.strictEqual(await c1.nth(3).inputValue(), '180');
    await p.locator('.card').nth(0).locator('button', { hasText: 'Save' }).click(); await p.waitForTimeout(150);
    assert.strictEqual((await p.locator('tr.total td').last().textContent()).trim(), '285'); // 105 + 180
    // update the same day
    await p.locator('.card').nth(0).locator('input').nth(1).fill('520');
    await p.locator('.card').nth(0).locator('button', { hasText: 'Update this day' }).click(); await p.waitForTimeout(150);
    assert.strictEqual((await p.locator('tr.total td').last().textContent()).trim(), '305');
    // bank in more than the cash -> warning, say no
    const c3 = p.locator('.card').nth(2).locator('input');
    await c3.nth(1).fill('400');
    await p.click('text=Save Bank In');
    assert.strictEqual(await p.textContent('#modalTitle'), 'Bank in is more than the cash'); await modalNo(p);
    await c3.nth(1).fill('300');
    assert.strictEqual(await c3.nth(2).inputValue(), 'RM 5');
    await p.click('text=Save Bank In'); await modalYes(p); // confirm
    await modalYes(p); // print preview
    assert.ok((await p.textContent('#printArea')).includes('300'));
    assert.strictEqual(await pdfPages(), 1);
    await p.click('#previewBack');
    assert.ok((await p.textContent('.card >> nth=1')).includes('No new sales since the last bank in.'));
    assert.strictEqual((await p.locator('tr.subtotal td').last().textContent()).trim(), '5');
    await p.click('text=Undo last bank in'); await modalYes(p);
    assert.strictEqual((await p.locator('tr.total td').last().textContent()).trim(), '305');
  });

  /* ---------- month sale ---------- */
  await check('month sale: totals, edit, bank date before amount, clear a day, print', async () => {
    await tab(p, 'month');
    assert.ok((await p.textContent('.date-chip')).includes('October 2026'));
    const r1 = (await p.locator('tbody tr').nth(0).locator('td').allInnerTexts()).map((x) => x.trim());
    assert.strictEqual(r1[5], '1,043');
    const day = (d) => p.locator('tbody tr').nth(d - 1);
    // day 28 empty: bank date first, then amount
    await day(28).locator('input[data-col="sale"]').fill('100');
    await day(28).locator('input[data-col="card"]').fill('40');
    assert.strictEqual(await day(28).locator('input[data-col="cash"]').inputValue(), '60');
    await day(28).locator('input[data-col="bankDate"]').fill('2026-10-29');
    await day(28).locator('input[data-col="bankDate"]').dispatchEvent('change');
    await day(28).locator('input[data-col="bankAmount"]').fill('365');
    await p.waitForTimeout(100);
    const rec = await p.evaluate(() => App.data.money.days['2026-10-28']);
    assert.strictEqual(rec.bankDate, '2026-10-29');
    // clear the day again
    await day(28).locator('input[data-col="bankAmount"]').fill('');
    for (const c of ['sale', 'card', 'cash']) await day(28).locator(`input[data-col="${c}"]`).fill('');
    await p.waitForTimeout(100);
    assert.strictEqual(await p.evaluate(() => '2026-10-28' in App.data.money.days), false);
    await p.click('button:has-text("◀")'); assert.ok((await p.textContent('.date-chip')).includes('September 2026'));
    await p.click('button:has-text("▶")');
    await p.click('text=Print Preview'); assert.strictEqual(await pdfPages(), 1); await p.click('#previewBack');
  });

  /* ---------- settings, language, text size ---------- */
  await check('settings: opening cash changes the totals', async () => {
    await tab(p, 'settings');
    const box = p.locator('.card', { hasText: 'Opening cash' }).locator('input');
    await box.fill('763'); await p.waitForTimeout(100);
    await tab(p, 'month');
    assert.strictEqual((await p.locator('tbody tr').nth(0).locator('td').allInnerTexts())[5].trim(), '1,053');
    await tab(p, 'settings');
    await p.locator('.card', { hasText: 'Opening cash' }).locator('input').fill('753');
  });
  await check('Chinese and back; text size', async () => {
    await p.click('#langToggle'); await p.waitForTimeout(150);
    assert.strictEqual((await p.locator('#tabs button').first().textContent()), '库存结余');
    for (const t of ['stock', 'battery', 'strap', 'bankin', 'month', 'settings']) await tab(p, t);
    await p.click('#langToggle'); await p.waitForTimeout(150);
    assert.strictEqual((await p.locator('#tabs button').first().textContent()), 'Stock Balance');
    const fs1 = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    await p.click('#textBigger');
    const fs2 = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    assert.notStrictEqual(fs1, fs2);
    await p.click('#textSmaller');
  });
  await check('backup save writes a file', async () => {
    await tab(p, 'settings');
    await p.click('text=Save a backup copy…'); await p.waitForTimeout(300);
    const f = fs.readdirSync(S).find((x) => x.startsWith('MRT-backup-'));
    assert.ok(f, 'no backup file');
    global.backupFile = path.join(S, f);
  });

  await p.waitForTimeout(600);
  await app.close();

  /* ---------- restart: data kept, daily backup ---------- */
  ({ app, p } = await launch());
  await check('after restart everything is still there', async () => {
    eq(await res(p, 'BONIA'), ['21', '21']);
    eq(await res(p, 'NAVI FORCE'), ['70', '70']);
    assert.ok(fs.readdirSync(path.join(UD, 'backups')).some((x) => x.startsWith('mrt-data-')));
  });
  await check('restore from a backup file', async () => {
    const src = global.backupFile;
    const d = JSON.parse(fs.readFileSync(src, 'utf8'));
    d.stock.watches.find((w) => w.code === 'BN').total = 99;
    const alt = path.join(S, 'restore-me.json');
    fs.writeFileSync(alt, JSON.stringify(d));
    await app.evaluate((_, f) => { globalThis.__restoreFile = f; }, alt);
    await tab(p, 'settings');
    await p.click('text=Restore from a backup…'); await modalYes(p); await p.waitForTimeout(300);
    await tab(p, 'stock');
    assert.strictEqual(await row(p, 'BONIA').locator('input[data-col="total"]').inputValue(), '99');
    assert.ok(fs.readdirSync(path.join(UD, 'backups')).some((x) => x.startsWith('before-restore-')));
  });
  await p.waitForTimeout(500);
  await app.close();

  /* ---------- damaged data file ---------- */
  fs.writeFileSync(path.join(UD, 'mrt-data.json'), '{ this is broken');
  ({ app, p } = await launch());
  await check('damaged data file: opens newest backup, keeps the damaged copy', async () => {
    assert.strictEqual(await p.textContent('#modalTitle'), 'Data was recovered');
    await modalYes(p);
    assert.ok(fs.readdirSync(UD).some((x) => x.startsWith('mrt-data-damaged-')));
  });
  await app.close();

  console.log(results.map((r) => r.join('  ')).join('\n'));
  console.log('\nJS errors:', errors.length ? errors : 'none');
  console.log(`\n${results.filter((r) => r[0] === 'PASS').length} passed, ${results.filter((r) => r[0] === 'FAIL').length} failed`);
})();
