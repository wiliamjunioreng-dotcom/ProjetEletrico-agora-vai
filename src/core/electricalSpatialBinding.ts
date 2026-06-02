// src/core/electricalSpatialBinding.ts
// ════════════════════════════════════════════════════════════════
// ELECTRICAL SPATIAL BINDING — vinculação determinística
//
// O sistema tem:
//   - Domínio elétrico: circuitos, cargas, segmentos, condutores
//   - Domínio espacial: pontos, paredes, faces, coordenadas
//
// O que falta: ownership explícito entre eles.
//   ponto ↔ circuito ↔ segmento ↔ trajeto ↔ proteção
//
// Este módulo cria e mantém esse vínculo.
//
// REGRAS:
//   1. Vínculo é criado, não calculado — é dado do projeto
//   2. Vínculo é bidirecional — circuito sabe seus pontos,
//      ponto sabe seu circuito
//   3. Vínculo é estável — sobrevive a mudanças geométricas
//   4. Vínculo é explícito — nunca inferido por proximidade
// ════════════════════════════════════════════════════════════════

import type { PontoEletrico, TipoPontoEletrico } from '../types/geometry'

// ── Função elétrica de um ponto ───────────────────────────────────
// Um ponto não é apenas um símbolo — tem função elétrica real
export type FuncaoEletrica =
  | 'ponto_consumo'   // tomada, luminária, equipamento
  | 'ponto_controle'  // interruptor, dimmer, botoeira
  | 'ponto_passagem'  // caixa de passagem (sem carga)
  | 'ponto_derivacao' // junção de circuitos
  | 'ponto_entrada'   // entrada do circuito no ambiente

// ── Binding: ponto → circuito ─────────────────────────────────────
export interface PontoCircuitoBinding {
  readonly ponto_id:       string
  readonly circuito_id:    string
  readonly funcao:         FuncaoEletrica
  // Posição na ordem do circuito (0 = mais próximo do QD)
  readonly ordem_no_circuito?: number
}

// ── Binding: circuito → pontos ────────────────────────────────────
export interface CircuitoPontosBinding {
  readonly circuito_id:    string
  readonly ponto_ids:      string[]
  readonly ponto_entrada?: string   // primeiro ponto (mais próximo do QD)
  readonly ponto_final?:   string   // último ponto (mais distante)
  // Comprimento estimado do trajeto pela planta
  readonly comprimento_planta_m?: number
}

// ── Mapa de binding do projeto ────────────────────────────────────
export interface ElectricalSpatialMap {
  // Consulta por ponto → circuito
  readonly ponto_para_circuito: Map<string, PontoCircuitoBinding>
  // Consulta por circuito → pontos
  readonly circuito_para_pontos: Map<string, CircuitoPontosBinding>
}

// ── Criar binding a partir dos dados existentes ───────────────────
// Usa o circuito_id que JÁ EXISTE em PontoEletrico
export function buildElectricalSpatialMap(
  pontos: PontoEletrico[]
): ElectricalSpatialMap {
  const ponto_para_circ = new Map<string, PontoCircuitoBinding>()
  const circ_para_pontos = new Map<string, CircuitoPontosBinding>()

  for (const ponto of pontos) {
    if (!ponto.circuito_id) continue

    // Determinar função elétrica pelo tipo do símbolo
    const funcao = funcaoEletricaDeTipo(ponto.tipo)

    // Binding ponto → circuito
    ponto_para_circ.set(ponto.id, {
      ponto_id:    ponto.id,
      circuito_id: ponto.circuito_id,
      funcao,
    })

    // Binding circuito → pontos
    const existing = circ_para_pontos.get(ponto.circuito_id)
    if (existing) {
      circ_para_pontos.set(ponto.circuito_id, {
        ...existing,
        ponto_ids: [...existing.ponto_ids, ponto.id],
      })
    } else {
      circ_para_pontos.set(ponto.circuito_id, {
        circuito_id: ponto.circuito_id,
        ponto_ids:   [ponto.id],
      })
    }
  }

  // Calcular comprimento estimado por trajeto (distância total dos pontos)
  for (const [circ_id, binding] of circ_para_pontos) {
    const pts = binding.ponto_ids.map(id => pontos.find(p => p.id === id)!).filter(Boolean)
    if (pts.length >= 2) {
      let comprimento = 0
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i-1].x
        const dy = pts[i].y - pts[i-1].y
        comprimento += Math.sqrt(dx*dx + dy*dy)
      }
      circ_para_pontos.set(circ_id, {
        ...binding,
        comprimento_planta_m: Math.round(comprimento * 10) / 10,
      })
    }
  }

  return {
    ponto_para_circuito:  ponto_para_circ,
    circuito_para_pontos: circ_para_pontos,
  }
}

// ── Função elétrica por tipo de símbolo ───────────────────────────
export function funcaoEletricaDeTipo(tipo: TipoPontoEletrico): FuncaoEletrica {
  const controles: TipoPontoEletrico[] = [
    'INTERRUPTOR_SIMPLES', 'INTERRUPTOR_PARALELO', 'INTERRUPTOR_INTERMEDIARIO',
  ]
  const passagens: TipoPontoEletrico[] = ['CAIXA_PASSAGEM', 'CAIXA_DERIVACAO']
  if (controles.includes(tipo))  return 'ponto_controle'
  if (passagens.includes(tipo))  return 'ponto_passagem'
  return 'ponto_consumo'
}

// ── Consultas ao mapa ─────────────────────────────────────────────
// Todos os pontos de um circuito
export function pontosDoCircuito(
  circuito_id: string,
  mapa: ElectricalSpatialMap,
  pontos: PontoEletrico[]
): PontoEletrico[] {
  const binding = mapa.circuito_para_pontos.get(circuito_id)
  if (!binding) return []
  return binding.ponto_ids
    .map(id => pontos.find(p => p.id === id))
    .filter(Boolean) as PontoEletrico[]
}

// Circuito de um ponto
export function circuitoDoPonto(
  ponto_id: string,
  mapa: ElectricalSpatialMap
): string | null {
  return mapa.ponto_para_circuito.get(ponto_id)?.circuito_id ?? null
}

// Pontos para destacar quando um circuito é selecionado
export function idsDestacadosPorCircuito(
  circuito_id: string,
  mapa: ElectricalSpatialMap
): Set<string> {
  const binding = mapa.circuito_para_pontos.get(circuito_id)
  return new Set(binding?.ponto_ids ?? [])
}

// Comprimento medido na planta vs comprimento declarado no circuito
// Diferença grande sugere que a rota real é mais longa que o estimado
export interface AuditoriaTrajeto {
  readonly circuito_id:         string
  readonly comprimento_planta_m: number  // medido pelas distâncias dos pontos
  readonly comprimento_circ_m:   number  // declarado no projeto
  readonly divergencia_m:        number  // diferença
  readonly divergencia_pct:      number  // % relativa
  readonly alerta:               boolean // divergência > 20%
}

export function auditarTrajetos(
  mapa:      ElectricalSpatialMap,
  circuitos: { id: string; comprimento_m: number }[]
): AuditoriaTrajeto[] {
  const resultado: AuditoriaTrajeto[] = []
  for (const circ of circuitos) {
    const binding = mapa.circuito_para_pontos.get(circ.id)
    const comp_planta = binding?.comprimento_planta_m ?? 0
    if (comp_planta === 0) continue

    const div = Math.abs(comp_planta - circ.comprimento_m)
    const div_pct = circ.comprimento_m > 0 ? div / circ.comprimento_m * 100 : 0

    resultado.push({
      circuito_id:          circ.id,
      comprimento_planta_m: comp_planta,
      comprimento_circ_m:   circ.comprimento_m,
      divergencia_m:        Math.round(div * 10) / 10,
      divergencia_pct:      Math.round(div_pct),
      alerta:               div_pct > 20,  // > 20% de divergência
    })
  }
  return resultado.filter(a => a.alerta)
}
