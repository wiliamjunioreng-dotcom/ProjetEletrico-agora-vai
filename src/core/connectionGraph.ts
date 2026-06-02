// src/core/connectionGraph.ts
// ════════════════════════════════════════════════════════════════
// CONNECTION GRAPH — mini-grafo elétrico interno da caixa
//
// Problema:
//   "chegar na caixa" ≠ "estar eletricamente conectado"
//
//   Hoje: condutores chegam ao ConnectionNode com papéis.
//   Mas: dois condutores de neutro podem estar em bornes diferentes
//        ou no mesmo borne — o sistema ainda não sabe.
//
// Borne = conjunto de condutores eletricamente unidos num ponto físico.
//   Ex: borne_neutro = {neutro_c1, neutro_c2, neutro_c3}
//       borne_fase_R = {fase_c1}   ← apenas um circuito aqui
//       borne_PE     = {pe_c1, pe_c2, pe_c3}  ← barramento PE
//
// ConnectionGraph modela:
//   - Bornes: quais condutores estão eletricamente unidos
//   - Arestas: quais bornes se conectam (ex: barramento → saída)
//   - Verificação: curto-circuito potencial, compartilhamento indevido
//
// Isso permite:
//   - saber se neutro de c1 e c2 estão no mesmo borne (compartilhado)
//   - verificar se PE está barrado (barramento de terra)
//   - detectar mistura de circuitos no mesmo borne (risco)
//   - calcular corrente por borne (soma das correntes dos circuitos)
//   - gerar esquema de ligação interno (memorial)
//
// Referência:
//   NBR 5410 §6.2.12 — dispositivos de conexão
//   NBR 5410 §6.1.4 — identificação de condutores
// ════════════════════════════════════════════════════════════════

import type { FuncaoCondutor } from './condutor'

// ── Tipo de borne ─────────────────────────────────────────────────
export type TipoBorne =
  | 'fase'           // borne de fase (R, S ou T)
  | 'neutro'         // borne de neutro
  | 'terra'          // borne de PE/barramento de terra
  | 'retorno'        // borne de retorno (iluminação)
  | 'viajante'       // borne de viajante (interruptor paralelo)
  | 'entrada'        // borne de entrada de alimentação
  | 'barramento'     // barramento (QD — une múltiplos bornes)

// Fase (para bornes de fase)
export type FaseRST = 'R' | 'S' | 'T' | null

// ── Borne ─────────────────────────────────────────────────────────
// Conjunto de condutores eletricamente unidos no mesmo ponto físico
export interface Borne {
  readonly id:          string
  readonly tipo:        TipoBorne
  readonly fase?:       FaseRST        // para bornes de fase: qual fase
  readonly label:       string         // ex: "N" ou "PE" ou "F-R-C01"
  // Condutores unidos neste borne
  readonly condutor_ids: readonly string[]   // IDs de CondutorContinuo
  readonly circuito_ids: readonly string[]   // circuitos representados
  // Capacidade e ocupação do borne
  readonly n_max_fios:  number         // máximo de fios para este tipo (ex: 3 para borne Wago)
  readonly n_fios:      number         // fios presentes
  readonly ocupacao_pct: number        // n_fios / n_max_fios × 100
  // Aviso de compartilhamento indevido
  readonly compartilhamento_ok: boolean   // false = risco de mistura
}

// ── Aresta no grafo interno ───────────────────────────────────────
// Conexão entre dois bornes (ex: alimentação → saída)
export interface ArestaInterna {
  readonly id:        string
  readonly borne_a:   string   // ID do Borne
  readonly borne_b:   string   // ID do Borne
  readonly tipo:      'direta' | 'chave' | 'protecao'  // como estão conectados
  readonly condutores_conectados: readonly string[]    // condutores que fazem a ponte
}

// ── ConnectionGraph ───────────────────────────────────────────────
export interface ConnectionGraph {
  // Bornes (nós do mini-grafo)
  readonly bornes:  Map<string, Borne>
  // Arestas entre bornes
  readonly arestas: ArestaInterna[]
  // Avisos de compatibilidade
  readonly avisos:  AvisoInterno[]
}

export interface AvisoInterno {
  readonly tipo:       'COMPARTILHAMENTO_INDEVIDO' | 'BORNE_CHEIO' | 'MISTURA_FASES' |
                       'NEUTRO_COMPARTILHADO'      | 'PE_NAO_BARRADO' | 'BORNE_VAZIO'
  readonly borne_id?:  string
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso' | 'info'
}

// ── Construir ConnectionGraph ─────────────────────────────────────
// A partir de condutores que chegam ao nó, montar os bornes e o grafo interno
export interface CondutorInput {
  readonly condutor_id:  string
  readonly circuito_id:  string
  readonly funcao:       FuncaoCondutor
  readonly fase?:        FaseRST
  readonly secao_mm2:    number
}

// Capacidade padrão de bornes por tipo (fios que cabem no borne)
const CAPACIDADE_BORNE: Record<TipoBorne, number> = {
  fase:       2,   // borne simples: entrada + saída (ou só entrada)
  neutro:     4,   // borne de neutro: múltiplos circuitos podem compartilhar
  terra:      6,   // barramento PE: vários circuitos
  retorno:    2,
  viajante:   2,
  entrada:    1,
  barramento: 12,
}

// Condutores que podem compartilhar borne (NBR 5410 §6.1.4)
// Fase: apenas condutores do MESMO circuito
// Neutro: condutores de circuitos do MESMO QD (compartilhamento permitido com cuidado)
// PE: sempre barrado (todos compartilham)
const COMPARTILHAMENTO_PERMITIDO: Record<TipoBorne, 'mesmo_circuito' | 'mesmo_qd' | 'todos'> = {
  fase:       'mesmo_circuito',
  neutro:     'mesmo_qd',
  terra:      'todos',
  retorno:    'mesmo_circuito',
  viajante:   'mesmo_circuito',
  entrada:    'mesmo_circuito',
  barramento: 'todos',
}

export function buildConnectionGraph(
  condutores: CondutorInput[],
  agrupar_por_funcao = true
): ConnectionGraph {
  const bornes = new Map<string, Borne>()
  const arestas: ArestaInterna[] = []
  const avisos: AvisoInterno[] = []

  // ── Agrupar condutores em bornes ──────────────────────────────
  // Estratégia padrão: um borne por função (neutros juntos, PEs juntos, fases separadas)
  const agrupamento = new Map<string, CondutorInput[]>()

  for (const c of condutores) {
    let chave: string
    if (agrupar_por_funcao) {
      // Fases: uma chave por circuito (fases de circuitos diferentes → bornes separados)
      chave = c.funcao === 'fase'
        ? `fase-${c.circuito_id}-${c.fase ?? 'R'}`
        : c.funcao === 'viajante'
        ? `viajante-${c.circuito_id}`
        : c.funcao   // neutro, terra, retorno: todos juntos
    } else {
      chave = `${c.funcao}-${c.circuito_id}`
    }
    const lista = agrupamento.get(chave) ?? []
    lista.push(c)
    agrupamento.set(chave, lista)
  }

  // ── Criar Borne para cada grupo ───────────────────────────────
  for (const [chave, conds] of agrupamento) {
    const primeiro = conds[0]
    const tipo: TipoBorne = primeiro.funcao === 'fase'   ? 'fase'
                          : primeiro.funcao === 'neutro' ? 'neutro'
                          : primeiro.funcao === 'terra'  ? 'terra'
                          : primeiro.funcao === 'retorno' ? 'retorno'
                          : primeiro.funcao === 'viajante' ? 'viajante'
                          : 'entrada'

    const n_max = CAPACIDADE_BORNE[tipo]
    const n     = conds.length
    const circ_ids = [...new Set(conds.map(c => c.circuito_id))]

    // Verificar compartilhamento
    const perm = COMPARTILHAMENTO_PERMITIDO[tipo]
    const compartilhamento_ok =
      perm === 'todos'           ? true
      : perm === 'mesmo_circuito' ? circ_ids.length <= 1
      : true  // 'mesmo_qd' — aceitamos por ora

    const label = tipo === 'fase'    ? `F${primeiro.fase ?? 'R'}-${primeiro.circuito_id.slice(-4)}`
                : tipo === 'neutro'  ? 'N'
                : tipo === 'terra'   ? 'PE'
                : tipo === 'retorno' ? `RET-${primeiro.circuito_id.slice(-4)}`
                : tipo === 'viajante'? `V-${primeiro.circuito_id.slice(-4)}`
                : chave

    const borne: Borne = {
      id:            chave,
      tipo,
      fase:          primeiro.fase ?? null,
      label,
      condutor_ids:  conds.map(c => c.condutor_id),
      circuito_ids:  circ_ids,
      n_max_fios:    n_max,
      n_fios:        n,
      ocupacao_pct:  Math.round(n / n_max * 100),
      compartilhamento_ok,
    }
    bornes.set(chave, borne)

    // Gerar avisos
    if (!compartilhamento_ok) {
      avisos.push({
        tipo: 'COMPARTILHAMENTO_INDEVIDO', borne_id: chave, severidade: 'erro',
        descricao: `Borne "${label}": fases de circuitos distintos no mesmo borne — risco de curto`,
      })
    }
    if (n > n_max) {
      avisos.push({
        tipo: 'BORNE_CHEIO', borne_id: chave, severidade: 'erro',
        descricao: `Borne "${label}": ${n} fios mas capacidade é ${n_max} — usar borne maior`,
      })
    }
    if (n === 0) {
      avisos.push({
        tipo: 'BORNE_VAZIO', borne_id: chave, severidade: 'info',
        descricao: `Borne "${label}" sem condutores`,
      })
    }
  }

  // ── Verificar barramento PE ───────────────────────────────────
  const borne_pe = bornes.get('terra')
  if (!borne_pe && condutores.some(c => c.funcao !== 'terra')) {
    avisos.push({
      tipo: 'PE_NAO_BARRADO', severidade: 'aviso',
      descricao: 'Nenhum barramento de PE encontrado nesta caixa',
    })
  }

  return { bornes, arestas, avisos }
}

// ── Corrente total por borne ──────────────────────────────────────
// Soma as correntes de todos os circuitos que contribuem para o borne
// (necessita de mapa de corrente por circuito)
export function correnteBorne(
  borne:          Borne,
  corrente_circ:  Map<string, number>   // circuito_id → corrente_A
): number {
  return borne.circuito_ids.reduce((s, cid) => s + (corrente_circ.get(cid) ?? 0), 0)
}

// ── Esquema de ligação (memorial interno) ─────────────────────────
// Retorna descrição textual do que está conectado em cada borne
export function esquemaLigacao(graph: ConnectionGraph): string {
  const linhas: string[] = []

  for (const [, borne] of graph.bornes) {
    const circs = borne.circuito_ids.join(', ')
    const status = borne.ocupacao_pct > 100 ? '⚠ CHEIO' : borne.compartilhamento_ok ? '✓' : '✗ INDEVIDO'
    linhas.push(`  ${borne.label.padEnd(20)} ${borne.n_fios}/${borne.n_max_fios} fios  [${circs}]  ${status}`)
  }

  return 'ESQUEMA DE LIGAÇÕES:\n' + linhas.join('\n')
}

// ── Verificar compatibilidade de dois circuitos na mesma caixa ────
export interface CompatibilidadeCaixa {
  compativel:  boolean
  avisos:      string[]
}

export function verificarCompatibilidade(
  circuito_a: string,
  circuito_b: string,
  graph:      ConnectionGraph
): CompatibilidadeCaixa {
  const avisos: string[] = []

  for (const [, borne] of graph.bornes) {
    const tem_a = borne.circuito_ids.includes(circuito_a)
    const tem_b = borne.circuito_ids.includes(circuito_b)

    if (tem_a && tem_b && borne.tipo === 'fase' && !borne.compartilhamento_ok) {
      avisos.push(`Borne "${borne.label}": circuitos ${circuito_a} e ${circuito_b} na mesma fase — risco de curto`)
    }
  }

  return { compativel: avisos.length === 0, avisos }
}
