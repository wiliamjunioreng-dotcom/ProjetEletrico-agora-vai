// electron/preload.js — CommonJS
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron:   true,
  saveProject:  (json, defaultName) => ipcRenderer.invoke('save-project', { json, defaultName }),
  openProject:  ()                  => ipcRenderer.invoke('open-project'),
  exportQDFL:   (data)              => ipcRenderer.invoke('export-qdfl', { data }),
  getAppInfo:   ()                  => ipcRenderer.invoke('get-app-info'),
})
