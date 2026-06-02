// src/core/sinapi.ts — Motor SINAPI/SETOP
// Suporte: .xlsx nativo (SheetJS) + CSV
// Separação Material vs. Mão de Obra
// Comparação SINAPI × SETOP em paralelo

import * as XLSX from 'xlsx'

// ── Tipos ─────────────────────────────────────────────────────────

export type FonteTabela    = 'SINAPI' | 'SETOP' | 'CUSTOM'
export type TipoInsumo     = 'Material' | 'Mao_de_Obra' | 'Equipamento' | 'Servico' | 'Composicao' | 'Desconhecido'
export type TipoDesonerado = 'desonerado' | 'nao_desonerado'

export interface InsumoSINAPI {
  codigo:      string
  descricao:   string
  unidade:     string
  preco:       number
  tipo:        TipoInsumo
  desonerado?: TipoDesonerado
  fonte:       FonteTabela
  estado?:     string
  mes?:        string
  ano?:        string
}

export interface TabelaPrecos {
  id:             string
  fonte:          FonteTabela
  estado?:        string
  mes?:           string
  ano?:           string
  desonerado?:    TipoDesonerado
  insumos:        InsumoSINAPI[]
  importado_em:   string
  total_material: number
  total_mo:       number
}

export interface ResultadoBusca {
  insumo: InsumoSINAPI
  score:  number
  match:  'exato' | 'alto' | 'medio' | 'baixo'
}

// ── Normalização ──────────────────────────────────────────────────

export function normalizar(t: string): string {
  return t.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

const STOPWORDS = new Set(['DE','DA','DO','EM','E','A','O','COM','PARA','OU','POR','ATE','NA','NO','AS','OS','UM','UMA','SE','QUE'])

function tokenizar(desc: string): string[] {
  return normalizar(desc).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t))
}

const ALIASES: Record<string, string[]> = {
  'CABO':       ['CABO','CONDUTOR','FIO','CABINHO'],
  'CU':         ['COBRE','CU'],
  'AL':         ['ALUMINIO','AL'],
  'PVC':        ['PVC','POLICLORETO'],
  'XLPE':       ['XLPE','EPR','BORRACHA'],
  '15':         ['1,5','1.5','15'],
  '25':         ['2,5','2.5','25'],
  'MM2':        ['MM2','MM','MILIMETROS','SECAO'],
  'DISJUNTOR':  ['DISJUNTOR','INTERRUPTOR','DISJ'],
  'IDR':        ['IDR','DR','DIFERENCIAL','RESIDUAL','DDR','RCCB'],
  'ELETRODUTO': ['ELETRODUTO','CONDUIT','TUBO','DUTO'],
  'CAIXA':      ['CAIXA','BOX'],
  'ELETRICISTA':['ELETRICISTA','INSTALADOR','MONTADOR'],
}

function expandirTokens(tokens: string[]): string[] {
  const set = new Set(tokens)
  for (const t of tokens) {
    for (const aliases of Object.values(ALIASES)) {
      if (aliases.includes(t)) aliases.forEach(a => set.add(a))
    }
  }
  return Array.from(set)
}

function calcScore(qT: string[], iT: string[]): number {
  if (!qT.length || !iT.length) return 0
  let hits = 0, partial = 0
  for (const q of qT) {
    if (iT.includes(q)) hits++
    else if (iT.some(i => i.includes(q) || q.includes(i))) partial += 0.5
  }
  const p = (hits + partial) / qT.length
  const r = (hits + partial) / iT.length
  return p + r > 0 ? Math.round(200 * p * r / (p + r)) / 100 : 0
}

// ── Busca ─────────────────────────────────────────────────────────

export function buscarPreco(
  descricao: string,
  tabela: TabelaPrecos,
  tipo?: TipoInsumo,
  limite = 5
): ResultadoBusca[] {
  const qExpand = expandirTokens(tokenizar(descricao))
  return tabela.insumos
    .filter(i => !tipo || i.tipo === tipo)
    .map(insumo => ({ insumo, score: calcScore(qExpand, tokenizar(insumo.descricao)) }))
    .filter(r => r.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(r => ({
      ...r,
      match: (r.score >= 0.8 ? 'exato' : r.score >= 0.5 ? 'alto' : r.score >= 0.3 ? 'medio' : 'baixo') as ResultadoBusca['match'],
    }))
}

// ── Classificar tipo de insumo ────────────────────────────────────

function classificarTipo(descricao: string, classe = ''): TipoInsumo {
  const d = normalizar(descricao)
  const c = normalizar(classe)

  if (c.includes('MAO') || c.includes('MO')) return 'Mao_de_Obra'
  if (c.includes('MATERIAL') || c.includes('MAT')) return 'Material'
  if (c.includes('EQUIP')) return 'Equipamento'
  if (c.includes('COMP') || c.includes('SERVIC')) return 'Composicao'

  const MO = ['ELETRICISTA','SERVENTE','PEDREIRO','ENCANADOR','AJUDANTE','MESTRE','TECNICO','INSTALADOR','MONTADOR','OFICIAL','ARMADOR']
  if (MO.some(k => d.includes(k))) return 'Mao_de_Obra'

  const MAT = ['CABO','CONDUTOR','FIO','DISJUNTOR','IDR','ELETRODUTO','CAIXA','TOMADA','INTERRUPTOR','LUMINARIA','QUADRO','QD','FITA','CONECTOR','TERMINAL','BARRAMENTO']
  if (MAT.some(k => d.includes(k))) return 'Material'

  return 'Desconhecido'
}

// ── Helpers comuns ────────────────────────────────────────────────

function limparPreco(v: unknown): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') {
    const s = v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }
  return 0
}

function detectarCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex(h => normalizar(h).includes(normalizar(c)))
    if (idx >= 0) return idx
  }
  return -1
}

// ── Parser XLSX (SheetJS) ─────────────────────────────────────────

export interface ParseResult {
  ok:      boolean
  tabela?: TabelaPrecos
  erros?:  string[]
  avisos?: string[]
  total?:  number
}

export async function parsearXLSX(
  buffer: ArrayBuffer,
  fonte: FonteTabela = 'SINAPI',
  estado = 'MG',
  desonerado: TipoDesonerado = 'nao_desonerado'
): Promise<ParseResult> {
  const erros: string[] = []
  const avisos: string[] = []
  const insumos: InsumoSINAPI[] = []
  let mes = '', ano = ''

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  } catch (e) {
    return { ok: false, erros: ['Arquivo XLSX invalido: ' + String(e)] }
  }

  // Selecionar abas a processar
  let abasLer: string[]
  const todosNomes = wb.SheetNames

  if (fonte === 'SINAPI') {
    // Formato 2025: tentar aba com nome do estado primeiro
    const abaEstado = todosNomes.find(n =>
      n.toUpperCase() === estado ||
      normalizar(n).startsWith('INSUMO') ||
      normalizar(n).includes(estado)
    )
    abasLer = abaEstado ? [abaEstado] : todosNomes.slice(0, 4)
    if (!abaEstado) avisos.push(`Aba do estado ${estado} nao localizada — processando primeiras abas`)
  } else {
    abasLer = todosNomes.slice(0, 4)
  }

  for (const nomAba of abasLer) {
    const ws = wb.Sheets[nomAba]
    if (!ws) continue

    const dados = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })
    if (dados.length < 3) { avisos.push(`Aba "${nomAba}" vazia`); continue }

    // Detectar cabeçalho
    let idxH = -1, cCod = -1, cDesc = -1, cUnit = -1, cPreco = -1, cTipo = -1

    for (let i = 0; i < Math.min(10, dados.length); i++) {
      const row = (dados[i] as unknown[]).map(v => String(v))
      const d   = detectarCol(row, ['DESCRICAO','DESC','DENOMINACAO','NOME'])
      const p   = detectarCol(row, ['PRECO','VALOR','CUSTO','UNITARIO','UNIT'])
      if (d >= 0 && p >= 0) {
        idxH = i; cDesc = d; cPreco = p
        cCod   = detectarCol(row, ['CODIGO','COD','ITEM','ID'])
        cUnit  = detectarCol(row, ['UNIDADE','UNID','UN','UND'])
        cTipo  = detectarCol(row, ['TIPO','CLASSE','CATEGORIA','GRUPO'])
        // Extrair mes/ano
        const txt = row.join(' ')
        const m = txt.match(/(\d{2})[\/-](\d{4})/)
        if (m) { mes = m[1]; ano = m[2] }
        break
      }
    }

    if (idxH < 0) { avisos.push(`Aba "${nomAba}": cabecalho nao detectado`); continue }

    let nInv = 0
    for (let i = idxH + 1; i < dados.length; i++) {
      const row  = dados[i] as unknown[]
      const desc = String(row[cDesc] || '').trim()
      const preco = limparPreco(row[cPreco])
      if (!desc || desc.length < 3) continue
      if (preco < 0 || isNaN(preco)) { nInv++; continue }
      const cls = cTipo >= 0 ? String(row[cTipo] || '') : ''
      insumos.push({
        codigo:    cCod >= 0 ? String(row[cCod] || i).trim() : String(i),
        descricao: desc,
        unidade:   cUnit >= 0 ? String(row[cUnit] || 'un').trim() : 'un',
        preco,
        tipo:      classificarTipo(desc, cls),
        desonerado,
        fonte,
        estado,
        mes,
        ano,
      })
    }
    if (nInv > 0) avisos.push(`Aba "${nomAba}": ${nInv} linhas ignoradas (preco invalido)`)
  }

  if (!insumos.length) return { ok: false, erros: [...erros, 'Nenhum insumo importado — verifique o formato'], avisos }

  const tabela: TabelaPrecos = {
    id: fonte, fonte, estado, mes, ano, desonerado, insumos,
    importado_em:   new Date().toISOString(),
    total_material: insumos.filter(i => i.tipo === 'Material').length,
    total_mo:       insumos.filter(i => i.tipo === 'Mao_de_Obra').length,
  }

  return { ok: true, tabela, total: insumos.length, erros, avisos }
}

// ── Parser CSV (fallback) ─────────────────────────────────────────

export function parsearCSV(
  conteudo: string,
  fonte: FonteTabela = 'SINAPI',
  estado = 'MG',
  desonerado: TipoDesonerado = 'nao_desonerado'
): ParseResult {
  const insumos: InsumoSINAPI[] = []
  const avisos: string[] = []
  const linhas = conteudo.split('\n').map(l => l.trim()).filter(Boolean)
  if (linhas.length < 2) return { ok: false, erros: ['Arquivo CSV vazio'] }

  const sep = linhas[0].includes('\t') ? '\t' : linhas[0].includes(';') ? ';' : ','
  let idxH = -1, cCod = -1, cDesc = -1, cUnit = -1, cPreco = -1, cTipo = -1
  let mes = '', ano = ''

  for (let i = 0; i < Math.min(10, linhas.length); i++) {
    const cols = linhas[i].split(sep).map(c => c.replace(/"/g, '').trim())
    const d = detectarCol(cols, ['DESCRICAO','DESC','DENOMINACAO'])
    const p = detectarCol(cols, ['PRECO','VALOR','CUSTO','UNITARIO'])
    if (d >= 0 && p >= 0) {
      idxH = i; cDesc = d; cPreco = p
      cCod  = detectarCol(cols, ['CODIGO','COD'])
      cUnit = detectarCol(cols, ['UNIDADE','UNID','UN'])
      cTipo = detectarCol(cols, ['TIPO','CLASSE','CATEGORIA'])
      const m = linhas[i].match(/(\d{2})\/(\d{4})/)
      if (m) { mes = m[1]; ano = m[2] }
      break
    }
  }

  if (idxH < 0) { idxH = 0; cCod = 0; cDesc = 1; cUnit = 2; cPreco = 3; avisos.push('Cabecalho nao detectado — colunas padrao') }

  for (let i = idxH + 1; i < linhas.length; i++) {
    const cols  = linhas[i].split(sep).map(c => c.replace(/"/g, '').trim())
    const desc  = cols[cDesc]?.trim() || ''
    const preco = limparPreco(cols[cPreco])
    if (!desc || desc.length < 3 || preco < 0 || isNaN(preco)) continue
    const cls = cTipo >= 0 ? cols[cTipo] || '' : ''
    insumos.push({
      codigo:    cCod >= 0 ? cols[cCod] || String(i) : String(i),
      descricao: desc,
      unidade:   cUnit >= 0 ? cols[cUnit] || 'un' : 'un',
      preco,
      tipo:      classificarTipo(desc, cls),
      desonerado,
      fonte,
      estado,
      mes,
      ano,
    })
  }

  if (!insumos.length) return { ok: false, erros: ['Nenhum insumo importado'] }

  const tabela: TabelaPrecos = {
    id: fonte, fonte, estado, mes, ano, desonerado, insumos,
    importado_em:   new Date().toISOString(),
    total_material: insumos.filter(i => i.tipo === 'Material').length,
    total_mo:       insumos.filter(i => i.tipo === 'Mao_de_Obra').length,
  }
  return { ok: true, tabela, total: insumos.length, avisos }
}

// ── Persistência ──────────────────────────────────────────────────

const LS_KEY = (id: string) => `projeletrico:tab_${id.toLowerCase()}`

export function salvarTabela(tabela: TabelaPrecos): void {
  try {
    localStorage.setItem(LS_KEY(tabela.id), JSON.stringify({ ...tabela, insumos: tabela.insumos.slice(0, 60000) }))
  } catch { /* quota */ }
}

export function carregarTabela(id: string): TabelaPrecos | null {
  try {
    const raw = localStorage.getItem(LS_KEY(id))
    return raw ? JSON.parse(raw) as TabelaPrecos : null
  } catch { return null }
}

export function limparTabela(id: string): void {
  localStorage.removeItem(LS_KEY(id))
}
