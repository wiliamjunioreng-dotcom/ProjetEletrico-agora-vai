// src/core/electricalNet.ts
// ════════════════════════════════════════════════════════════════
// ELECTRICAL NET — continuidade elétrica completa
//
// Problema:
//   ConnectionGraph modela dentro de uma caixa.
//   Mas a instalação tem MUITAS caixas conectadas por condutores.
//   A continuidade elétrica real atravessa todas elas.
//
// "dois fios no mesmo lugar ≠ conectados"
// "dois fios conectados ≠ continuidade garantida"
// "continuidade ≠ proteção correta"
//
// ElectricalNet modela:
//   - Nós (bornes de cada caixa)
//   - Arestas (condutores que ligam bornes de caixas diferentes)
//   - Continuidade (caminho elétrico da fonte ao consumo)
//   - Interrupções (dispositivos que podem abrir o circuito)
//   - Derivações (ramificações da mesma fase/neutro)
//
// Isso permite:
//   - rastrear se PE chega continuamente do QD ao ponto final
//   - identificar onde o neutro pode ser interrompido indevidamente
//   - verificar se DR protege todos os pontos que deve
//   - calcular queda de tensão no caminho completo
//   - verificar seletividade (qual disjuntor atua primeiro)
// ════════════════════════════════════════════════════════════════

import type { FuncaoCondutor } from './condutor'

// ── Net Node — borne numa caixa específica ────────────────────────
export interface NetNode {
  readonly id:           string   // 'caixa_id:borne_id' (único na rede)
  readonly caixa_id:     string
  readonly borne_id:     string
  readonly funcao:       FuncaoCondutor
  readonly circuito_ids: readonly string[]
  // Tipo de nó para verificação de continuidade
  readonly tipo_no:      'fonte' | 'dispositivo' | 'borne_passagem' | 'consumo' | 'derivacao'
}

// ── Net Edge — condutor que conecta dois NetNodes ─────────────────
export interface NetEdge {
  readonly id:          string
  readonly no_a:        string   // NetNode id
  readonly no_b:        string   // NetNode id
  readonly condutor_id: string
  readonly funcao:      FuncaoCondutor
  readonly secao_mm2:   number
  readonly comprimento_m: number
  // Estado da conexão
  readonly ativa:       boolean  // false se interrompida (disjuntor aberto)
}

// ── Interrupção — ponto onde o circuito pode ser aberto ───────────
export interface InterrupcaoNet {
  readonly id:           string
  readonly tipo:         'disjuntor' | 'dr' | 'fusivel' | 'chave' | 'contato'
  readonly no_anterior:  string   // NetNode antes do dispositivo
  readonly no_posterior: string   // NetNode após o dispositivo
  readonly circuito_id:  string
  readonly corrente_in:  number   // corrente nominal do dispositivo
  // Estado
  readonly fechado:      boolean  // true = circuito fechado (normal)
}

// ── ElectricalNet ─────────────────────────────────────────────────
export interface ElectricalNet {
  readonly nodes:        Map<string, NetNode>
  readonly edges:        Map<string, NetEdge>
  readonly interrupcoes: InterrupcaoNet[]
}

// ── Construir nó da rede ──────────────────────────────────────────
function netNodeId(caixa_id: string, borne_id: string): string {
  return `${caixa_id}::${borne_id}`
}

// ── Construir ElectricalNet ───────────────────────────────────────
// A partir dos eletrodutos (que conectam caixas) e condutores,
// montar o grafo de continuidade elétrica
export interface CaixaInput {
  id:          string
  tipo_caixa:  'quadro' | 'passagem' | 'instalacao'
  borne_ids:   string[]
  funcao_borne: Record<string, FuncaoCondutor>
  circuitos_borne: Record<string, string[]>
}

export interface EletrodutoInput {
  caixa_a_id:  string
  caixa_b_id:  string
  condutores:  {
    condutor_id: string
    funcao:      FuncaoCondutor
    secao_mm2:   number
    comprimento_m: number
    borne_a:     string
    borne_b:     string
    circuito_id: string
  }[]
}

export function buildElectricalNet(
  caixas:     CaixaInput[],
  eletrodutos: EletrodutoInput[],
): ElectricalNet {
  const nodes        = new Map<string, NetNode>()
  const edges        = new Map<string, NetEdge>()
  const interrupcoes: InterrupcaoNet[] = []

  // Registrar nós a partir das caixas
  for (const caixa of caixas) {
    const tipo_no: NetNode['tipo_no'] =
      caixa.tipo_caixa === 'quadro'     ? 'fonte'
      : caixa.tipo_caixa === 'passagem'  ? 'borne_passagem'
      : 'consumo'

    for (const borne_id of caixa.borne_ids) {
      const nid = netNodeId(caixa.id, borne_id)
      nodes.set(nid, {
        id:           nid,
        caixa_id:     caixa.id,
        borne_id,
        funcao:       caixa.funcao_borne[borne_id] ?? 'fase',
        circuito_ids: caixa.circuitos_borne[borne_id] ?? [],
        tipo_no,
      })
    }
  }

  // Registrar arestas a partir dos eletrodutos
  for (const elet of eletrodutos) {
    for (const cond of elet.condutores) {
      const eid = `edge-${cond.condutor_id}`
      const no_a = netNodeId(elet.caixa_a_id, cond.borne_a)
      const no_b = netNodeId(elet.caixa_b_id, cond.borne_b)
      edges.set(eid, {
        id:            eid,
        no_a,
        no_b,
        condutor_id:   cond.condutor_id,
        funcao:        cond.funcao,
        secao_mm2:     cond.secao_mm2,
        comprimento_m: cond.comprimento_m,
        ativa:         true,
      })
    }
  }

  return { nodes, edges, interrupcoes }
}

// ── Trajetória de continuidade ────────────────────────────────────
// Encontrar todos os caminhos elétricos de um nó fonte até todos os consumos
// BFS no grafo de arestas ativas
export function continuidade(
  no_origem_id: string,
  funcao:       FuncaoCondutor,
  net:          ElectricalNet
): { alcancados: string[]; interrompidos: string[] } {
  const alcancados:    string[] = []
  const interrompidos: string[] = []
  const visitados = new Set<string>()
  const fila: string[] = [no_origem_id]

  while (fila.length > 0) {
    const nid = fila.shift()!
    if (visitados.has(nid)) continue
    visitados.add(nid)
    alcancados.push(nid)

    // Encontrar arestas ativas conectadas a este nó com a funcao correta
    for (const [, edge] of net.edges) {
      if (edge.funcao !== funcao) continue
      if (!edge.ativa) {
        interrompidos.push(edge.no_a === nid ? edge.no_b : edge.no_a)
        continue
      }
      const vizinho = edge.no_a === nid ? edge.no_b
                    : edge.no_b === nid ? edge.no_a
                    : null
      if (vizinho && !visitados.has(vizinho)) {
        fila.push(vizinho)
      }
    }
  }

  return { alcancados, interrompidos }
}

// ── Verificar continuidade do PE ─────────────────────────────────
// PE deve ser contínuo e ininterruptível (NBR 5410 §6.1.3)
export interface VerificacaoPE {
  readonly continuo:    boolean
  readonly nos_sem_pe:  string[]  // nós de consumo sem PE chegando
  readonly avisos:      string[]
}

export function verificarContinuidadePE(
  no_qd_id: string,
  net:      ElectricalNet
): VerificacaoPE {
  const { alcancados } = continuidade(no_qd_id, 'terra', net)
  const avisos: string[] = []

  // Nós de consumo com função 'terra' — são os bornes PE dos pontos finais
  const consumos = [...net.nodes.values()].filter(n => n.tipo_no === 'consumo' && n.funcao === 'terra')
  const nos_sem_pe = consumos
    .filter(n => !alcancados.includes(n.id))
    .map(n => n.id)

  if (nos_sem_pe.length > 0) {
    avisos.push(`${nos_sem_pe.length} ponto(s) de consumo sem continuidade de PE — NBR 5410 §6.1.3`)
  }

  // Verificar se existe interrupção no PE (proibido pela norma)
  const interrupcoes_pe = net.interrupcoes.filter(i => {
    const no = net.nodes.get(i.no_anterior)
    return no?.funcao === 'terra'
  })
  if (interrupcoes_pe.length > 0) {
    avisos.push(`${interrupcoes_pe.length} interrupção(ões) no condutor PE — PROIBIDO pela NBR 5410 §6.1.3`)
  }

  return { continuo: nos_sem_pe.length === 0, nos_sem_pe, avisos }
}

// ── Comprimento total do circuito ─────────────────────────────────
// Soma os comprimentos das arestas de um circuito específico
export function comprimentoCircuito(
  circuito_id: string,
  funcao:      FuncaoCondutor,
  net:         ElectricalNet
): number {
  let total = 0
  for (const [, edge] of net.edges) {
    if (edge.funcao !== funcao) continue
    // Verificar se este condutor pertence ao circuito
    const no_a = net.nodes.get(edge.no_a)
    const no_b = net.nodes.get(edge.no_b)
    const pertence_a = no_a?.circuito_ids.includes(circuito_id) ?? false
    const pertence_b = no_b?.circuito_ids.includes(circuito_id) ?? false
    if (pertence_a && pertence_b) {
      total += edge.comprimento_m
    }
  }
  return total
}
