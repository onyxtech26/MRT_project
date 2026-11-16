// The only bridge between the screen and the computer's files.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.sendSync('data:load'),
  save: (text) => ipcRenderer.sendSync('data:save', text),
  print: () => ipcRenderer.invoke('print'),
  savePdf: (name, folder) => ipcRenderer.invoke('pdf', name, folder),
  backupSave: (folder) => ipcRenderer.invoke('backup:save', folder),
  chooseFolder: (title) => ipcRenderer.invoke('folder:choose', title),
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
  openDataFolder: () => ipcRenderer.invoke('folder:open'),
});
