// src/core/dynamicProtectionState.ts
// ════════════════════════════════════════════════════════════════
// DYNAMIC PROTECTION STATE ENGINE
//
// Pergunta que o FaultSimulationEngine deixou em aberto:
//   "como a instalação muda DURANTE a atuação da proteção?"
//
// Hoje:
//   FaultSimulationEngine identifica qual dispositivo atua.
//   Mas: zonas_perdidas = [] — a rede não muda de estado.
//
// DynamicProtectionStateEngine resolve isso:
//   1. Recebe o resultado da simulação de falta
//   2. Abre a aresta/interrupção correspondente na ElectricalNet
//   3. BFS reverso: quais nós perderam continuidade com a fonte?
//   4. Retorna: estado atual da rede + zonas desenergizadas + circuitos afetados
//
// Estados possíveis de um NetNode:
//   ENERGIZADO     → continuidade com a fonte, sem falta
//   FALTA_ATIVA    → falta presente, aguardando atuação
//   DESENERGIZADO  → isolado pela proteção (dispositivo abriu)
//   ISOLADO        → sem continuidade por design (chave aberta)
//
// Isso conecta:
//   FaultSimulationEngine (quem atua)
//   + ElectricalNet (topologia)
//   + ProtectionCoordination (sequência de proteção)
//   = Estado dinâmico real da instalação
// ════════════════════════════════════════════════════════════════

import type { ElectricalNet } from './electricalNet'
import type { ResultadoFalta } from './faultSimulation'

// ── Estado elétrico de um nó ──────────────────────────────────────
export type EstadoNo =
  | 'ENERGIZADO'     // com tensão, sem falta
  | 'FALTA_ATIVA'    // falta presente mas não isolada ainda
  | 'DESENERGIZADO'  // isolado pela atuação de proteção
  | 'ISOLADO'        // sem continuidade (chave aberta, manutenção)

// ── Snapshot do estado da rede ────────────────────────────────────
export interface NetworkSnapshot {
  readonly id:          string    // timestamp ou evento que gerou este estado
  readonly descricao:   string
  readonly estados_nos: Map<string, EstadoNo>
  readonly arestas_abertas: Set<string>  // IDs de NetEdge com ativa=false
  // Resumo
  readonly n_energizados:    number
  readonly n_desenergizados: number
  readonly n_falta_ativa:    number
  readonly circuitos_afetados: string[]  // circuito_ids que perderam energia
}

// ── Evento de atuação ─────────────────────────────────────────────
export interface EventoAtuacao {
  readonly tipo:          'ABERTURA' | 'FECHAMENTO' | 'RELIGAMENTO'
  readonly dispositivo_id: string
  readonly timestamp_ms:   number     // quando ocorreu (ms desde início da falta)
  readonly motivo:         string
}

// ── Estado dinâmico da proteção ───────────────────────────────────
export interface ProtectionState {
  // Estado atual da rede
  readonly snapshot:  NetworkSnapshot
  // Histórico de atuações
  readonly eventos:   EventoAtuacao[]
  // Falta original que iniciou a sequência
  readonly fault_id:  string
  // O sistema está estável? (proteção atuou, falta isolada)
  readonly estavel:   boolean
  // Zonas sem energia (IDs de NetNode)
  readonly zonas_sem_energia: string[]
}

// ── Construir estado inicial (tudo energizado) ────────────────────
export function buildEstadoInicial(net: ElectricalNet): NetworkSnapshot {
  const estados = new Map<string, EstadoNo>()
  for (const [id] of net.nodes) {
    estados.set(id, 'ENERGIZADO')
  }
  return {
    id: 'inicial',
    descricao: 'Estado normal — toda instalação energizada',
    estados_nos: estados,
    arestas_abertas: new Set(),
    n_energizados: net.nodes.size,
    n_desenergizados: 0,
    n_falta_ativa: 0,
    circuitos_afetados: [],
  }
}

// ── Aplicar resultado de falta → novo snapshot ────────────────────
// Abre a aresta do dispositivo que atuou e propaga a desenergização
export function aplicarFalta(
  snapshot_anterior: NetworkSnapshot,
  net:              ElectricalNet,
  resultado:        ResultadoFalta,
  // Mapeamento: dispositivo_id → aresta(s) que ele protege
  disp_para_arestas: Map<string, string[]>
): { snapshot: NetworkSnapshot; eventos: EventoAtuacao[] } {
  const eventos: EventoAtuacao[] = []
  const arestas_abertas = new Set(snapshot_anterior.arestas_abertas)
  const estados = new Map(snapshot_anterior.estados_nos)

  // 1. Marcar nó da falta como FALTA_ATIVA
  if (estados.has(resultado.ponto_id)) {
    estados.set(resultado.ponto_id, 'FALTA_ATIVA')
  }

  // 2. Se algum dispositivo atuou: abrir sua(s) aresta(s)
  if (resultado.dispositivo_atuou_id) {
    const arestas_disp = disp_para_arestas.get(resultado.dispositivo_atuou_id) ?? []
    for (const aresta_id of arestas_disp) {
      arestas_abertas.add(aresta_id)
    }
    eventos.push({
      tipo:            'ABERTURA',
      dispositivo_id:  resultado.dispositivo_atuou_id,
      timestamp_ms:    resultado.tempo_isolamento_ms ?? 0,
      motivo:          `Corrente de falta: ${resultado.visoes[0]?.corrente_ka.toFixed(1) ?? '?'}kA`,
    })
  }

  // 3. BFS: encontrar nós sem continuidade com a fonte
  // Fonte = nós com tipo_no === 'fonte'
  const fontes = [...net.nodes.values()]
    .filter(n => n.tipo_no === 'fonte')
    .map(n => n.id)

  const alcancados = _bfsArestas(fontes, net, arestas_abertas)

  // 4. Atualizar estados dos nós
  let n_energiz = 0, n_desener = 0, n_falta = 0
  const circuitos_afetados: string[] = []

  for (const [nid, no] of net.nodes) {
    const estado_atual = estados.get(nid)
    if (estado_atual === 'FALTA_ATIVA') {
      n_falta++
    } else if (alcancados.has(nid)) {
      estados.set(nid, 'ENERGIZADO')
      n_energiz++
    } else {
      estados.set(nid, 'DESENERGIZADO')
      n_desener++
      // Registrar circuito afetado
      for (const cid of no.circuito_ids) {
        if (!circuitos_afetados.includes(cid)) circuitos_afetados.push(cid)
      }
    }
  }

  return {
    snapshot: {
      id:               `apos-${resultado.fault_id}`,
      descricao:        resultado.dispositivo_atuou_id
                        ? `Após atuação de ${resultado.dispositivo_atuou_id}`
                        : 'Falta ativa — sem isolamento',
      estados_nos:      estados,
      arestas_abertas,
      n_energizados:    n_energiz,
      n_desenergizados: n_desener,
      n_falta_ativa:    n_falta,
      circuitos_afetados,
    },
    eventos,
  }
}

// ── Religamento (restauração após falta eliminada) ────────────────
export function religamento(
  snapshot:      NetworkSnapshot,
  net:           ElectricalNet,
  dispositivo_id: string,
  disp_para_arestas: Map<string, string[]>
): { snapshot: NetworkSnapshot; eventos: EventoAtuacao[] } {
  const arestas_abertas = new Set(snapshot.arestas_abertas)
  const arestas_disp = disp_para_arestas.get(dispositivo_id) ?? []
  for (const a of arestas_disp) arestas_abertas.delete(a)

  // Recalcular nós energizados
  const fontes = [...net.nodes.values()]
    .filter(n => n.tipo_no === 'fonte').map(n => n.id)
  const alcancados = _bfsArestas(fontes, net, arestas_abertas)

  const estados = new Map<string, EstadoNo>()
  let n_energiz = 0, n_desener = 0
  const circuitos_afetados: string[] = []

  for (const [nid] of net.nodes) {
    if (alcancados.has(nid)) { estados.set(nid, 'ENERGIZADO'); n_energiz++ }
    else {
      estados.set(nid, 'DESENERGIZADO'); n_desener++
      for (const cid of net.nodes.get(nid)?.circuito_ids ?? []) {
        if (!circuitos_afetados.includes(cid)) circuitos_afetados.push(cid)
      }
    }
  }

  return {
    snapshot: {
      id: `religamento-${dispositivo_id}`,
      descricao: `Após religamento de ${dispositivo_id}`,
      estados_nos: estados, arestas_abertas,
      n_energizados: n_energiz, n_desenergizados: n_desener, n_falta_ativa: 0,
      circuitos_afetados,
    },
    eventos: [{
      tipo: 'RELIGAMENTO', dispositivo_id,
      timestamp_ms: Date.now(),
      motivo: 'Falta eliminada — religamento manual',
    }],
  }
}

// ── Construir ProtectionState completo ────────────────────────────
export function buildProtectionState(
  net:               ElectricalNet,
  resultado:         ResultadoFalta,
  disp_para_arestas: Map<string, string[]>
): ProtectionState {
  const snapshot_ini = buildEstadoInicial(net)
  const { snapshot, eventos } = aplicarFalta(snapshot_ini, net, resultado, disp_para_arestas)

  const zonas_sem_energia = [...snapshot.estados_nos.entries()]
    .filter(([, est]) => est === 'DESENERGIZADO')
    .map(([id]) => id)

  return {
    snapshot,
    eventos,
    fault_id: resultado.fault_id,
    estavel:  resultado.dispositivo_atuou_id !== undefined,
    zonas_sem_energia,
  }
}

// ── BFS por arestas ativas ────────────────────────────────────────
function _bfsArestas(
  fontes:         string[],
  net:            ElectricalNet,
  arestas_abertas: Set<string>
): Set<string> {
  const alcancados = new Set<string>(fontes)
  const fila = [...fontes]

  while (fila.length > 0) {
    const nid = fila.shift()!
    for (const [eid, edge] of net.edges) {
      if (arestas_abertas.has(eid)) continue  // aresta aberta
      const vizinho = edge.no_a === nid ? edge.no_b
                    : edge.no_b === nid ? edge.no_a
                    : null
      if (vizinho && !alcancados.has(vizinho)) {
        alcancados.add(vizinho)
        fila.push(vizinho)
      }
    }
  }
  return alcancados
}

// ── Comparar dois snapshots (what changed?) ───────────────────────
export interface DeltaEstado {
  readonly perderam_energia: string[]   // IDs de nós que ficaram sem energia
  readonly ganharam_energia: string[]   // IDs de nós que voltaram (religamento)
  readonly circuitos_perdidos: string[]
  readonly circuitos_recuperados: string[]
}

export function compararSnapshots(
  antes: NetworkSnapshot,
  depois: NetworkSnapshot
): DeltaEstado {
  const perderam = [...depois.estados_nos.entries()]
    .filter(([id, e]) => e === 'DESENERGIZADO' && antes.estados_nos.get(id) === 'ENERGIZADO')
    .map(([id]) => id)

  const ganharam = [...depois.estados_nos.entries()]
    .filter(([id, e]) => e === 'ENERGIZADO' && antes.estados_nos.get(id) === 'DESENERGIZADO')
    .map(([id]) => id)

  return {
    perderam_energia:      perderam,
    ganharam_energia:      ganharam,
    circuitos_perdidos:    depois.circuitos_afetados.filter(c => !antes.circuitos_afetados.includes(c)),
    circuitos_recuperados: antes.circuitos_afetados.filter(c => !depois.circuitos_afetados.includes(c)),
  }
}
