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
    // Trocado de 'xlsx' (SheetJS Community Edition) para 'exceljs' —
    // confirmado experimentalmente que a versão gratuita do xlsx
    // DESCARTA estilo de célula silenciosamente ao escrever (bold/cor/
    // borda somem, sem erro nenhum) — por isso o QDFL sempre saiu como
    // despejo de dado cru, sem nenhuma aparência de documento pronto.
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Lumen - Projeto Elétrico'
    wb.created = new Date()

    const AZUL_MARCA   = 'FF1F4E78'
    const AZUL_CLARO    = 'FFEEF4FF'
    const VERDE_OK      = 'FF157A4A'
    const VERMELHO_ERRO = 'FFC0392B'
    const CINZA_BORDA   = 'FFD0D0D0'
    const bordaFina = { style: 'thin', color: { argb: CINZA_BORDA } }

    const ws = wb.addWorksheet('QDFL', { views: [{ state: 'frozen', ySplit: 4 }] })
    const colunas = ['N','Descrição','Tipo','Fase','V','Ib(A)','Ft','Fa',
      'Seção(mm²)','PE(mm²)','In(A)',"Iz'(A)",'dU(%)','Status','IDR']
    ws.columns = [
      {wch:4},{wch:44},{wch:7},{wch:6},{wch:6},{wch:8},{wch:6},{wch:6},
      {wch:11},{wch:9},{wch:8},{wch:8},{wch:7},{wch:9},{wch:7},
    ].map((w, i) => ({ key: colunas[i], width: w.wch }))

    // Linha 1 — título com nome do projeto
    ws.mergeCells('A1:O1')
    const tituloCell = ws.getCell('A1')
    tituloCell.value = `QDFL — ${data.projeto?.nome || 'Projeto sem nome'}`
    tituloCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    tituloCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
    tituloCell.alignment = { vertical: 'middle', horizontal: 'left' }
    ws.getRow(1).height = 26

    // Linha 2 — subtítulo (projetista, CREA, data)
    ws.mergeCells('A2:O2')
    const subCell = ws.getCell('A2')
    const partes = []
    if (data.projeto?.projetista) partes.push(`Projetista: ${data.projeto.projetista}`)
    if (data.projeto?.crea) partes.push(`CREA: ${data.projeto.crea}`)
    partes.push(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`)
    subCell.value = partes.join('   ·   ')
    subCell.font = { italic: true, size: 9, color: { argb: 'FF5A5670' } }
    ws.getRow(2).height = 16

    // Linha 3 — em branco (respiro)
    ws.getRow(3).height = 4

    // Linha 4 — cabeçalho de verdade
    const headerRow = ws.getRow(4)
    colunas.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = label
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
      cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' }
      cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina }
    })
    headerRow.height = 20

    // Linhas de dado — borda em toda célula, zebra sutil, status colorido
    data.circuitos.forEach((c, i) => {
      const row = ws.getRow(5 + i)
      const valores = [
        i + 1, c.descricao, c.tipo, c.fase, c.tensao_v, c.ib, c.ft, c.fa,
        c.secao_fase, c.secao_pe, c.in_disj, c.iz_efetiva, c.du_calc,
        c.status, c.idr ? '30mA' : '-',
      ]
      valores.forEach((v, j) => {
        const cell = row.getCell(j + 1)
        cell.value = v
        cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina }
        cell.alignment = { vertical: 'middle', horizontal: j === 1 ? 'left' : 'center' }
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } }
      })
      const statusCell = row.getCell(14)
      statusCell.font = { bold: true, color: { argb: c.status === 'OK' ? VERDE_OK : VERMELHO_ERRO } }
    })

    if (data.demanda) {
      const dem = wb.addWorksheet('Demanda')
      dem.mergeCells('A1:F1')
      dem.getCell('A1').value = `Demanda — ${data.projeto?.nome || 'Projeto'}`
      dem.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
      dem.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
      dem.getRow(1).height = 24

      const demCols = ['CI (kW)', 'FD', 'Demanda (kW)', 'In geral (A)', 'Tipo CEMIG', 'QD posições']
      const demVals = [data.demanda.ci_kw, data.demanda.fd, data.demanda.dem_kw,
        data.demanda.in_geral, data.demanda.tipo_ligacao_cemig, data.demanda.n_total_qd]
      demCols.forEach((label, i) => {
        const cell = dem.getRow(3).getCell(i + 1)
        cell.value = label
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
        cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina }
        cell.alignment = { horizontal: 'center' }
        dem.getColumn(i + 1).width = 14
      })
      demVals.forEach((v, i) => {
        const cell = dem.getRow(4).getCell(i + 1)
        cell.value = v
        cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina }
        cell.alignment = { horizontal: 'center' }
      })
    }

    await wb.xlsx.writeFile(filePath)
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
