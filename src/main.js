// Electron main process: window, saving to disk, backups and printing.
// Everything stays on this computer - no internet is used.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = app.getPath('userData');
const DATA_FILE = path.join(DATA_DIR, 'mrt-data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 120; // about 4 months of daily copies

let win = null;

// dates in DD/MM/YYYY like in Malaysia, whatever the Windows language is
app.commandLine.appendSwitch('lang', 'en-GB');

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function looksValid(data) {
  return data && data.version === 1 && data.stock && data.money && data.settings;
}

// write to a temp file first, then rename, so a power cut never leaves half a file
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function dailyBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `mrt-data-${today()}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE, target);
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
  while (old.length > KEEP_BACKUPS) fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
}

function loadData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = readJson(DATA_FILE);
      if (looksValid(data)) return { data, firstRun: false };
    } catch (e) {
      // fall through to the newest backup
    }
    // keep the damaged file so it is never lost when the app saves again
    fs.copyFileSync(DATA_FILE, path.join(DATA_DIR, `mrt-data-damaged-${Date.now()}.json`));
    const backups = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort().reverse()
      : [];
    for (const f of backups) {
      try {
        const data = readJson(path.join(BACKUP_DIR, f));
        if (looksValid(data)) return { data, firstRun: false, restoredFrom: f };
      } catch (e) {
        // try the next one
      }
    }
  }
  return { data: readJson(path.join(__dirname, 'seed.json')), firstRun: true };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: 'MPT MRT Daily',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    backgroundColor: '#eef1f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // never open web pages inside the app
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

ipcMain.on('data:load', (e) => {
  try {
    e.returnValue = loadData();
  } catch (err) {
    e.returnValue = { error: String(err) };
  }
});

ipcMain.on('data:save', (e, text) => {
  try {
    // the app may stay open for days: make the day's backup before the first save of a new day
    try {
      dailyBackup();
    } catch (err) {
      // a failed backup must never stop the shop from working
    }
    writeAtomic(DATA_FILE, text);
    e.returnValue = { ok: true };
  } catch (err) {
    e.returnValue = { ok: false, error: String(err) };
  }
});

ipcMain.handle('print', () => new Promise((resolve) => {
  win.webContents.print({ silent: false, printBackground: true }, (ok, reason) => resolve({ ok, reason }));
}));

ipcMain.handle('pdf', async (e, suggestedName) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Save as PDF',
    defaultPath: path.join(app.getPath('desktop'), suggestedName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(res.filePath, pdf);
  shell.openPath(res.filePath);
  return { ok: true, file: res.filePath };
});

ipcMain.handle('backup:save', async () => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Save a backup copy',
    defaultPath: path.join(app.getPath('desktop'), `MRT-backup-${today()}.json`),
    filters: [{ name: 'MRT backup', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  fs.copyFileSync(DATA_FILE, res.filePath);
  return { ok: true, file: res.filePath };
});

ipcMain.handle('backup:restore', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a backup file',
    defaultPath: BACKUP_DIR,
    properties: ['openFile'],
    filters: [{ name: 'MRT backup', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  let data;
  try {
    data = readJson(res.filePaths[0]);
  } catch (err) {
    return { ok: false, error: 'This file cannot be read.' };
  }
  if (!looksValid(data)) return { ok: false, error: 'This is not an MRT backup file.' };
  // keep what we had, just in case
  if (fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `before-restore-${Date.now()}.json`));
  }
  writeAtomic(DATA_FILE, JSON.stringify(data));
  return { ok: true, data };
});

ipcMain.handle('folder:open', () => shell.openPath(DATA_DIR));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    try {
      dailyBackup();
    } catch (e) {
      // a failed backup must never stop the shop from working
    }
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
