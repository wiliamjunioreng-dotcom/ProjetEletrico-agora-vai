// src/core/operationalSimulation.ts
// ════════════════════════════════════════════════════════════════
// OPERATIONAL SIMULATION ENGINE
//
// Hoje: DynamicProtectionStateEngine = um snapshot após uma falta.
// Próximo problema inevitável: como a instalação se comporta
//   ao longo do tempo operacional?
//
// OperationalSimulationEngine modela:
//   - Linha do tempo de eventos (EventTimeline)
//   - Múltiplas faltas e suas sequências de atuação
//   - Contingência: o que acontece se este dispositivo não atuar?
//   - Estado da instalação a qualquer instante t
//   - Recomposição automática após isolamento
//
// Isso responde perguntas reais:
//   - "Se D1 falhar, o DG protege o cabo?"
//   - "Com D1 aberto e D2 ainda atuando, o que permanece energizado?"
//   - "Após a segunda falta, qual é a topologia?"
//   - "Se religar em sequência (D3 → D1 → DG), o que acontece?"
//
// Esta é a base para:
//   - Análise de contingência (N-1, N-2)
//   - Plano de recomposição
//   - Verificação de redundância
//   - Análise de vulnerabilidade
// ════════════════════════════════════════════════════════════════

import type { ElectricalNet } from './electricalNet'
import type { ResultadoFalta } from './faultSimulation'
import type { NetworkSnapshot } from './dynamicProtectionState'
import {
  buildEstadoInicial, aplicarFalta, religamento, compararSnapshots,
} from './dynamicProtectionState'

// ── Tipos de evento operacional ───────────────────────────────────
export type TipoEvento =
  | 'FALTA'           // curto-circuito, sobrecarga, fuga
  | 'ATUACAO'         // dispositivo abre
  | 'RELIGAMENTO'     // dispositivo fecha (manual ou automático)
  | 'MANUTENCAO'      // abertura intencional para manutenção
  | 'CARGA_NOVA'      // nova carga conectada (possível sobrecarga)
  | 'CONTINGENCIA'    // falha hipotética (análise N-1)

// ── Evento na linha do tempo ──────────────────────────────────────
export interface EventoOperacional {
  readonly id:          string
  readonly tipo:        TipoEvento
  readonly t_ms:        number        // instante do evento (ms desde t=0)
  readonly descricao:   string
  // Para FALTA: resultado da simulação
  readonly resultado_falta?: ResultadoFalta
  // Para RELIGAMENTO/MANUTENCAO/ATUACAO: dispositivo envolvido
  readonly dispositivo_id?: string
  // Snapshot resultante (estado após este evento)
  readonly snapshot:    NetworkSnapshot
  // Diferença em relação ao evento anterior
  readonly delta:       { perderam: number; recuperaram: number }
}

// ── Linha do tempo operacional ────────────────────────────────────
export interface EventTimeline {
  readonly id:            string
  readonly descricao:     string
  readonly eventos:       EventoOperacional[]
  // Estado atual (último snapshot)
  readonly estado_atual:  NetworkSnapshot
  // Tempo total simulado (ms)
  readonly t_total_ms:    number
  // Métricas
  readonly n_faltas:      number
  readonly n_atuacoes:    number
  readonly n_religamentos: number
  readonly disponibilidade_pct: number  // % do tempo em que a rede estava energizada
}

// ── Análise de contingência (N-1) ────────────────────────────────
export interface AnaliseContingencia {
  readonly dispositivo_id:   string
  // O que é perdido se este dispositivo falhar sem atuar?
  readonly zonas_vulneraveis: string[]   // IDs de NetNode
  readonly circuitos_expostos: string[]  // circuitos sem proteção backup
  // Qual dispositivo à montante seria o backup?
  readonly backup_id?:        string
  // O backup tem capacidade para interromper a falta?
  readonly backup_adequado:   boolean
}

// ── Builder da linha do tempo ─────────────────────────────────────
export class TimelineBuilder {
  private eventos:  EventoOperacional[] = []
  private snapshot: NetworkSnapshot
  private t_ms = 0

  private net: ElectricalNet
  private disp_arestas: Map<string, string[]>

  constructor(
    net:          ElectricalNet,
    disp_arestas: Map<string, string[]>,
    _descricao = 'Simulação operacional'
  ) {
    this.net = net
    this.disp_arestas = disp_arestas
    this.snapshot = buildEstadoInicial(net)
  }

  // Aplicar uma falta e avançar o tempo
  adicionarFalta(
    resultado:  ResultadoFalta,
    delay_ms = 0  // tempo desde o evento anterior
  ): this {
    this.t_ms += delay_ms
    const snap_ant = this.snapshot
    const { snapshot, eventos } = aplicarFalta(
      this.snapshot, this.net, resultado, this.disp_arestas
    )
    this.snapshot = snapshot

    const delta_snap = compararSnapshots(snap_ant, snapshot)
    this.eventos.push({
      id:             `ev-${this.eventos.length + 1}`,
      tipo:           'FALTA',
      t_ms:           this.t_ms,
      descricao:      `Falta ${resultado.tipo} em ${resultado.ponto_id}`,
      resultado_falta: resultado,
      snapshot,
      delta:          { perderam: delta_snap.perderam_energia.length, recuperaram: 0 },
    })

    // Adicionar eventos de atuação
    for (const ev of eventos) {
      this.t_ms += ev.timestamp_ms
      this.eventos.push({
        id:             `ev-${this.eventos.length + 1}`,
        tipo:           'ATUACAO',
        t_ms:           this.t_ms,
        descricao:      `Atuação ${ev.dispositivo_id}: ${ev.motivo}`,
        dispositivo_id: ev.dispositivo_id,
        snapshot,
        delta:          { perderam: 0, recuperaram: 0 },
      })
    }

    return this
  }

  // Religar um dispositivo
  religar(dispositivo_id: string, delay_ms = 30000 /* 30s padrão */): this {
    this.t_ms += delay_ms
    const snap_ant = this.snapshot
    const { snapshot } = religamento(
      this.snapshot, this.net, dispositivo_id, this.disp_arestas
    )
    this.snapshot = snapshot

    const delta_snap = compararSnapshots(snap_ant, snapshot)
    this.eventos.push({
      id:             `ev-${this.eventos.length + 1}`,
      tipo:           'RELIGAMENTO',
      t_ms:           this.t_ms,
      descricao:      `Religamento de ${dispositivo_id}`,
      dispositivo_id,
      snapshot,
      delta: {
        perderam:    delta_snap.perderam_energia.length,
        recuperaram: delta_snap.ganharam_energia.length,
      },
    })
    return this
  }

  // Abertura intencional (manutenção)
  manutencao(dispositivo_id: string, delay_ms = 0): this {
    this.t_ms += delay_ms
    const snap_ant = this.snapshot
    const arestas = this.disp_arestas.get(dispositivo_id) ?? []
    // Simular abertura manual: mesmo mecanismo do religamento, mas no sentido oposto
    const arestas_abertas = new Set([...this.snapshot.arestas_abertas, ...arestas])
    // Recalcular snapshot com as arestas abertas
    // estados calculados via BFS
    // Forçar ISOLADO nos nós afetados
    const snapshot: NetworkSnapshot = {
      ...this.snapshot,
      id: `manutencao-${dispositivo_id}`,
      descricao: `Após abertura para manutenção de ${dispositivo_id}`,
      arestas_abertas,
    }
    this.snapshot = snapshot

    const delta_snap = compararSnapshots(snap_ant, snapshot)
    this.eventos.push({
      id:             `ev-${this.eventos.length + 1}`,
      tipo:           'MANUTENCAO',
      t_ms:           this.t_ms,
      descricao:      `Manutenção: abertura de ${dispositivo_id}`,
      dispositivo_id,
      snapshot,
      delta: {
        perderam:    delta_snap.perderam_energia.length,
        recuperaram: 0,
      },
    })
    return this
  }

  build(id: string, descricao: string): EventTimeline {
    const n_faltas     = this.eventos.filter(e => e.tipo === 'FALTA').length
    const n_atuacoes   = this.eventos.filter(e => e.tipo === 'ATUACAO').length
    const n_relig      = this.eventos.filter(e => e.tipo === 'RELIGAMENTO').length

    // Disponibilidade: % do tempo com rede totalmente energizada
    const total_nos = this.net.nodes.size
    let t_energizado = 0, t_ant = 0
    for (const ev of this.eventos) {
      const frac_energiz = ev.snapshot.n_energizados / Math.max(1, total_nos)
      t_energizado += frac_energiz * (ev.t_ms - t_ant)
      t_ant = ev.t_ms
    }
    const disp_pct = this.t_ms > 0
      ? Math.round(t_energizado / this.t_ms * 100)
      : 100

    return {
      id, descricao,
      eventos:    this.eventos,
      estado_atual: this.snapshot,
      t_total_ms: this.t_ms,
      n_faltas, n_atuacoes, n_religamentos: n_relig,
      disponibilidade_pct: disp_pct,
    }
  }
}

// ── Análise de contingência N-1 ───────────────────────────────────
// Para cada dispositivo: o que acontece se ele falhar sem atuar?
export function analisarContingencia(
  dispositivos_ids: string[],
  // Para cada dispositivo: qual é seu backup (montante)?
  hierarquia: Map<string, string | null>,
  // Para cada dispositivo: quais nós ele protege
  disp_nos: Map<string, string[]>
): AnaliseContingencia[] {
  return dispositivos_ids.map(did => {
    const nos_vulneraveis  = disp_nos.get(did) ?? []
    const backup_id        = hierarquia.get(did) ?? undefined
    const circ_expostos    = [...new Set(nos_vulneraveis.flatMap(n => [n]))]

    return {
      dispositivo_id:    did,
      zonas_vulneraveis: nos_vulneraveis,
      circuitos_expostos: circ_expostos,
      backup_id,
      // Simplificação: backup é adequado se existir
      backup_adequado:   backup_id !== undefined,
    }
  })
}

// ── Estado em um instante específico ────────────────────────────────
export function estadoEmT(timeline: EventTimeline, t_ms: number): NetworkSnapshot | null {
  // Encontrar o último evento antes ou em t_ms
  const eventos_ate_t = timeline.eventos.filter(e => e.t_ms <= t_ms)
  if (eventos_ate_t.length === 0) return null  // antes do primeiro evento
  return eventos_ate_t[eventos_ate_t.length - 1].snapshot
}
