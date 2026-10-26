// The only bridge between the screen and the computer's files.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.sendSync('data:load'),
  save: (text) => ipcRenderer.sendSync('data:save', text),
  print: () => ipcRenderer.invoke('print'),
  savePdf: (name) => ipcRenderer.invoke('pdf', name),
  backupSave: () => ipcRenderer.invoke('backup:save'),
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
  openDataFolder: () => ipcRenderer.invoke('folder:open'),
});
