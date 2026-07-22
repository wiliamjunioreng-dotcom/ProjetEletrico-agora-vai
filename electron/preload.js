// electron/preload.js — CommonJS
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron:   true,
  saveProject:  (json, defaultName) => ipcRenderer.invoke('save-project', { json, defaultName }),
  overwriteProject: (json, filePath) => ipcRenderer.invoke('overwrite-project', { json, filePath }),
  openProject:  ()                  => ipcRenderer.invoke('open-project'),
  exportQDFL:   (data)              => ipcRenderer.invoke('export-qdfl', { data }),
  exportMemorialFormulas: (dados, nomeProjeto) => ipcRenderer.invoke('export-memorial-formulas', { dados, nomeProjeto }),
  getAppInfo:   ()                  => ipcRenderer.invoke('get-app-info'),
})
