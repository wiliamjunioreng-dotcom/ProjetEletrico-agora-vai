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
  // Mesma proteção do overwrite-project — se já existe um arquivo
  // nesse caminho (usuário escolheu sobrescrever algo existente pelo
  // próprio diálogo do SO), guarda a versão anterior em .bak antes.
  if (fs.existsSync(filePath)) {
    try { fs.copyFileSync(filePath, filePath + '.bak') } catch { /* não bloqueia o salvamento por isso */ }
  }
  fs.writeFileSync(filePath, json, 'utf-8')
  return { ok: true, path: filePath }
})

// ── IPC: Sobrescrever projeto (Salvar de verdade, sem reabrir
// diálogo — igual Ctrl+S no Excel sobrescreve o mesmo arquivo).
// Cuidado extra: antes de sobrescrever, copia o conteúdo ATUAL do
// arquivo para um .bak — se a escrita nova falhar ou ficar
// incompleta por qualquer motivo (queda de energia, disco cheio),
// a versão anterior boa não é destruída junto.
ipcMain.handle('overwrite-project', async (_, { json, filePath }) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + '.bak')
    }
    fs.writeFileSync(filePath, json, 'utf-8')
    return { ok: true, path: filePath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
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

// ── IPC: Exportar Memorial de Cálculo COM FÓRMULAS ─────────────
// "Segunda opinião" — planilha onde as células fazem a MESMA conta
// que o motor, com fórmula de verdade, consultando tabelas reais da
// norma embutidas na própria planilha. As tabelas de referência
// (Iz por seção, Fa por agrupamento, disjuntores padrão) vêm PRÉ-
// CALCULADAS pelo motor real (nbr5410tables.ts, no processo de
// renderização) — aqui só monta as fórmulas que fazem busca simples
// contra elas. Curva do disjuntor e DR ficam como valor calculado +
// explicação ao lado (decisão por palavra-chave, forçar isso em
// fórmula ficaria uma cascata de SE() ilegível — o oposto do
// objetivo de auditoria clara que essa planilha existe pra servir).
ipcMain.handle('export-memorial-formulas', async (_, { dados, nomeProjeto }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: `Memorial_Formulas_${(nomeProjeto || 'projeto').replace(/\s+/g, '_')}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (canceled || !filePath) return { ok: false }

  try {
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Lumen - Projeto Elétrico'
    wb.created = new Date()

    const AZUL_MARCA = 'FF1F4E78'
    const AZUL_CLARO = 'FFEEF4FF'
    const AMARELO_INPUT = 'FFFFF9E6'   // destaca visualmente quais células são EDITÁVEIS
    const bordaFina = { style: 'thin', color: { argb: 'FFD0D0D0' } }
    const headerStyle = (cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
      cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    }

    // ── Aba 1: Parâmetros ─────────────────────────────────────
    const wsParam = wb.addWorksheet('Parâmetros')
    wsParam.mergeCells('A1:B1')
    wsParam.getCell('A1').value = `Parâmetros do Projeto — ${nomeProjeto || 'Projeto'}`
    wsParam.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    wsParam.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
    wsParam.getRow(1).height = 24
    wsParam.columns = [{ width: 32 }, { width: 16 }]

    const p = dados.parametros
    const paramRows = [
      ['Método de instalação (NBR 5410 Tabela 36)', p.metodo_instalacao],
      ['Isolação do cabo', p.isolacao],
      ['Material do condutor', p.material],
      ['Temperatura ambiente (°C)', p.t_amb],
      ['Fator de potência adotado', p.fp],
      ['ΔU máximo admissível (%)', p.du_max_pct],
      ['ΔU já consumido no ramal de entrada (%)', p.du_ramal_pct],
      ['Ft — fator de correção de temperatura (Tabela 40)', p.ft_calculado],
    ]
    paramRows.forEach(([label, val], i) => {
      const r = wsParam.getRow(3 + i)
      r.getCell(1).value = label
      r.getCell(2).value = val
      r.getCell(1).font = { color: { argb: 'FF5A5670' } }
      r.getCell(2).font = { bold: true }
    })

    // ── Aba 2: Tabelas de Referência ──────────────────────────
    const wsTab = wb.addWorksheet('Tabelas de Referência')
    wsTab.columns = [
      { width: 12 }, { width: 14 }, { width: 3 },
      { width: 12 }, { width: 14 }, { width: 3 },
      { width: 12 }, { width: 8 }, { width: 3 },
      { width: 16 },
    ]
    const cab = ['Seção (mm²)', 'Iz — 2 cond. (A)', '', 'Seção (mm²)', 'Iz — 3 cond. (A)', '', 'N agrupados', 'Fa', '', 'Disjuntores padrão (A)']
    cab.forEach((txt, i) => {
      if (!txt) return
      const cell = wsTab.getRow(1).getCell(i + 1)
      cell.value = txt
      headerStyle(cell)
    })
    wsTab.getRow(1).height = 20

    dados.tabelaIz2cond.forEach((row, i) => {
      wsTab.getRow(2 + i).getCell(1).value = row.secao
      wsTab.getRow(2 + i).getCell(2).value = row.iz
    })
    dados.tabelaIz3cond.forEach((row, i) => {
      wsTab.getRow(2 + i).getCell(4).value = row.secao
      wsTab.getRow(2 + i).getCell(5).value = row.iz
    })
    dados.tabelaFa.forEach((row, i) => {
      wsTab.getRow(2 + i).getCell(7).value = row.n
      wsTab.getRow(2 + i).getCell(8).value = row.fator
    })
    dados.tabelaDisjuntores.forEach((val, i) => {
      wsTab.getRow(2 + i).getCell(10).value = val
    })

    // Named ranges — deixam as fórmulas do Memorial legíveis
    // (=VLOOKUP(secao,TabIz2Cond,2) em vez de referência de célula crua)
    const nLinhasIz = dados.tabelaIz2cond.length
    const nLinhasFa = dados.tabelaFa.length
    const nLinhasDisj = dados.tabelaDisjuntores.length
    wb.definedNames.add(`'Tabelas de Referência'!$A$2:$B$${1 + nLinhasIz}`, 'TabIz2Cond')
    wb.definedNames.add(`'Tabelas de Referência'!$D$2:$E$${1 + nLinhasIz}`, 'TabIz3Cond')
    wb.definedNames.add(`'Tabelas de Referência'!$G$2:$H$${1 + nLinhasFa}`, 'TabFa')
    wb.definedNames.add(`'Tabelas de Referência'!$J$2:$J$${1 + nLinhasDisj}`, 'TabDisjuntores')

    // ── Aba 3: Memorial de Cálculo ─────────────────────────────
    const ws = wb.addWorksheet('Memorial de Cálculo', { views: [{ state: 'frozen', ySplit: 4, xSplit: 3 }] })
    ws.mergeCells('A1:X1')
    ws.getCell('A1').value = `Memorial de Cálculo — ${nomeProjeto || 'Projeto'} — células com fórmula, consulte/altere livremente`
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MARCA } }
    ws.getRow(1).height = 24
    ws.mergeCells('A2:X2')
    ws.getCell('A2').value = `Emitido em ${new Date().toLocaleDateString('pt-BR')} · Células em amarelo são as entradas — mude qualquer uma e as fórmulas recalculam sozinhas`
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF5A5670' } }
    ws.getRow(3).height = 4

    // Layout de colunas — "N cond." é uma coluna PRÓPRIA, separada de
    // "Ligação": achado auditando o primeiro arquivo gerado (comparei
    // valor a valor contra o app real, não assumi que bateria): o
    // motor trata bifásico IGUAL trifásico para fins de tabela de
    // ampacidade (3 condutores carregados), mas usa fator 2 (não √3)
    // no cálculo de queda de tensão — são conceitos diferentes que
    // este arquivo tratava como um só antes da correção. Deixar
    // "N cond." visível e explícito é mais auditável do que esconder
    // essa distinção dentro de uma fórmula.
    const colunas = [
      'N', 'Descrição', 'Tipo', 'Ligação', 'N cond.', 'Potência (VA)', 'Tensão (V)',
      'Comprimento (m)', 'N.Agrup', 'Seção adotada (mm²)',
      'Ib (A)', 'Ft', 'Fa', 'Irc (A)', 'Iz nominal (A)', 'Iz efetiva (A)',
      'Status Iz', 'ΔU (%)', 'Status ΔU', 'In disjuntor (A)', 'Status Tripartida',
      'Seção PE (mm²)', 'Curva', 'DR',
    ]
    const larguras = [4, 34, 7, 11, 8, 11, 9, 11, 8, 11, 8, 6, 6, 8, 10, 10, 12, 8, 12, 11, 14, 9, 7, 6]
    ws.columns = larguras.map(w => ({ width: w }))
    const headerRow = ws.getRow(4)
    colunas.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = label
      headerStyle(cell)
    })
    headerRow.height = 30

    const rho = dados.parametros.material === 'Al' ? 0.0282 : 0.0172
    const rho_t = (rho * (1 + 0.00393 * (70 - 20))).toFixed(6)

    dados.linhas.forEach((l, i) => {
      const R = 5 + i
      const row = ws.getRow(R)
      const set = (col, val, isInput = false) => {
        const cell = row.getCell(col)
        cell.value = val
        cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina }
        cell.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'center' }
        if (isInput) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO_INPUT } }
        else if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } }
      }

      // Entradas — amarelo, editáveis
      set(1, l.n)
      set(2, l.descricao)
      set(3, l.tipo)
      set(4, l.ligacao, true)
      set(5, l.n_cond, true)
      set(6, l.potencia_va, true)
      set(7, l.tensao_v, true)
      set(8, l.comprimento_m, true)
      set(9, l.n_agrupados, true)
      set(10, l.secao_adotada, true)

      // Ib = Potência/Tensão — SEM fator de potência nem √3 aqui: a
      // tensão já vem RESOLVIDA corretamente (127V mono, 220V bi/tri,
      // com o √3 já embutido na escolha de qual tensão usar — ver
      // getTensaoCircuito() no motor real). Fórmula de livro-texto
      // teria sido ERRADA aqui; conferido contra o código real antes
      // de escrever, não assumido.
      set(11, { formula: `F${R}/G${R}`, result: null })
      set(12, { formula: `Parâmetros!$B$10`, result: dados.parametros.ft_calculado })
      set(13, { formula: `VLOOKUP(I${R},TabFa,2,FALSE)`, result: null })
      set(14, { formula: `K${R}/(L${R}*M${R})`, result: null })
      // Iz nominal — usa a coluna N COND (não "ligação=trifásica"),
      // exatamente como o motor real decide qual tabela consultar
      set(15, { formula: `IF(E${R}=3,VLOOKUP(J${R},TabIz3Cond,2,FALSE),VLOOKUP(J${R},TabIz2Cond,2,FALSE))`, result: null })
      set(16, { formula: `O${R}*L${R}*M${R}`, result: null })
      set(17, { formula: `IF(P${R}>=N${R},"OK","INSUFICIENTE")`, result: null })
      // ΔU — fator √3 pra trifásico, 2 pra mono/bifásico (mesma regra
      // corrigida no motor: bifásico é 2 condutores pra queda de
      // tensão, mesmo usando a tabela de 3 condutores pra ampacidade
      // — são contas diferentes, cada uma com sua própria regra)
      set(18, { formula: `IF(AND(H${R}>0,J${R}>0),(IF(D${R}="trifasica",SQRT(3),2)*${rho_t}*H${R}*K${R})/(J${R}*G${R})*100,0)`, result: null })
      set(19, { formula: `IF(R${R}<=(Parâmetros!$B$8-Parâmetros!$B$9),"OK","EXCEDE")`, result: null })
      // Disjuntor — piso prático de 10A (evita 6A em circuito de uso
      // geral), igual getDisjuntor(ib, in_min=10) do motor real —
      // achado auditando o primeiro arquivo: sem o MAX(10,...), ILUM/
      // TUG de potência baixa saíam com 6A no Excel e 10A no app.
      set(20, { formula: `MAX(10,INDEX(TabDisjuntores,MATCH(TRUE,INDEX(TabDisjuntores>=K${R},0),0)))`, result: null })
      set(21, { formula: `IF(T${R}<=P${R},"OK","In > Iz' — subir seção")`, result: null })
      set(22, { formula: `IF(J${R}<=16,J${R},IF(J${R}<=35,16,MAX(J${R}/2,16)))`, result: null })
      set(23, l.curva_disjuntor)
      set(24, l.idr ? 'SIM' : 'não')
    })

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
