// electron/main.js — ProjetEletrico v2.0
// CommonJS puro — NÃO pode ser ESM ("type":"module" removido do package.json)
'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let win = null

function createWindow() {
  win = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        1100,
    minHeight:       700,
    title:           'ProjetEletrico',
    backgroundColor: '#1b2a3b',
    show:            false,  // mostrar só quando pronto
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  // Carregar a UI
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Produção: carregar index.html do dist/
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Mostrar janela quando UI estiver pronta (sem flash branco)
  win.once('ready-to-show', () => win.show())

  // Links externos no browser do sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => { win = null })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (!win) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Salvar projeto ───────────────────────────────────────
ipcMain.handle('save-project', async (_, { json, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultName || 'projeto.projelec',
    filters: [
      { name: 'ProjetEletrico', extensions: ['projelec'] },
      { name: 'JSON',           extensions: ['json'] },
    ],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, json, 'utf-8')
  return { ok: true, path: filePath }
})

// ── IPC: Abrir projeto ────────────────────────────────────────
ipcMain.handle('open-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    filters: [
      { name: 'ProjetEletrico', extensions: ['projelec', 'json'] },
    ],
    properties: ['openFile'],
  })
  if (canceled || !filePaths.length) return { ok: false }
  const json = fs.readFileSync(filePaths[0], 'utf-8')
  return { ok: true, json, path: filePaths[0] }
})

// ── IPC: Exportar QDFL.xlsx ───────────────────────────────────
ipcMain.handle('export-qdfl', async (_, { data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: 'QDFL.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (canceled || !filePath) return { ok: false }

  try {
    const XLSX = require('xlsx')
    const wb   = XLSX.utils.book_new()

    const rows = data.circuitos.map((c, i) => ({
      'N':          i + 1,
      'Descricao':  c.descricao,
      'Tipo':       c.tipo,
      'Fase':       c.fase,
      'V':          c.tensao_v,
      'Ib(A)':      c.ib,
      'Ft':         c.ft,
      'Fa':         c.fa,
      'Secao(mm2)': c.secao_fase,
      'PE(mm2)':    c.secao_pe,
      'In(A)':      c.in_disj,
      "Iz'(A)":     c.iz_efetiva,
      'dU(%)':      c.du_calc,
      'Status':     c.status,
      'IDR':        c.idr ? '30mA' : '-',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      {wch:4},{wch:40},{wch:6},{wch:6},{wch:6},
      {wch:8},{wch:6},{wch:6},{wch:10},{wch:8},
      {wch:8},{wch:8},{wch:7},{wch:8},{wch:6},
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'QDFL')

    if (data.demanda) {
      const dem = XLSX.utils.aoa_to_sheet([
        ['CI (kW)', 'FD', 'Demanda (kW)', 'In geral (A)', 'Tipo CEMIG', 'QD posicoes'],
        [data.demanda.ci_kw, data.demanda.fd, data.demanda.dem_kw,
         data.demanda.in_geral, data.demanda.tipo_ligacao_cemig, data.demanda.n_total_qd],
      ])
      XLSX.utils.book_append_sheet(wb, dem, 'Demanda')
    }

    XLSX.writeFile(wb, filePath)
    return { ok: true, path: filePath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── IPC: Info ─────────────────────────────────────────────────
ipcMain.handle('get-app-info', () => ({
  version:  app.getVersion(),
  electron: process.versions.electron,
  node:     process.versions.node,
  platform: process.platform,
}))
