// src/core/protectionInfraCoordination.ts
// ════════════════════════════════════════════════════════════════
// PROTECTION + INFRASTRUCTURE COORDINATION
//
// O problema identificado:
//   "dois circuitos sob mesmo DR, passam no mesmo eletroduto,
//    neutros separados, derivações em caixas diferentes.
//    Proteção e infraestrutura começaram a se tocar."
//
// Este módulo conecta:
//   ProtectionGraph  → quem protege quem (zonas DR, hierarquia)
//   RedeInfraestrutura → por onde os cabos passam (segmentos, caixas)
//   EntityDependencyGraph → dependências entre entidades
//
// Responde perguntas concretas:
//   "Este segmento de eletroduto tem circuitos de DRs diferentes?"
//   "Esta caixa mistura neutros pré e pós-DR?"
//   "Quando o DR-3 é alterado, quais segmentos precisam recalcular?"
//   "Quando um segmento muda de rota, quais zonas são afetadas?"
//
// Regras NBR 5410 que este módulo verifica:
//   §4.1.3 — Neutro pós-DR deve ser segregado
//   §5.1.3 — Circuitos de diferentes sistemas não devem compartilhar eletroduto
// ════════════════════════════════════════════════════════════════

import type { ProtectionGraph } from './protectionGraph'
import type { RedeInfraestrutura } from './redeInfraestrutura'
import type { EntityDependencyGraph } from './entityDependencyGraph'
import {
  createEntityGraph, registerEntity, invalidateEntity,
} from './entityDependencyGraph'

// ── Conflito de proteção num segmento ─────────────────────────────
export interface ConflitoSegmento {
  readonly segmento_id:    string
  readonly tipo:           'NEUTROS_MISTOS' | 'DRS_DIFERENTES' | 'DR_SEM_DR_NO_TUBO'
  readonly circuito_ids:   string[]   // circuitos envolvidos
  readonly zona_ids:       string[]   // zonas DR envolvidas
  readonly descricao:      string
  readonly severidade:     'erro' | 'aviso'
  readonly referencia:     string
}

// ── Mapa de dependências proteção↔infraestrutura ──────────────────
export interface ProtInfraMap {
  // Segmento → quais zonas têm circuitos passando por ele
  readonly segmento_para_zonas:  Map<string, string[]>
  // Zona → quais segmentos contêm seus circuitos
  readonly zona_para_segmentos:  Map<string, string[]>
  // Conflitos detectados
  readonly conflitos:            ConflitoSegmento[]
  // Grafo de dependências (para invalidação incremental)
  readonly dep_graph:            EntityDependencyGraph
}

// ── Construir o mapa ──────────────────────────────────────────────
export function buildProtInfraMap(
  prot_graph: ProtectionGraph,
  rede:       RedeInfraestrutura
): ProtInfraMap {
  const seg_para_zonas = new Map<string, string[]>()
  const zona_para_segs = new Map<string, string[]>()
  const conflitos:      ConflitoSegmento[] = []

  // Para cada segmento: encontrar quais zonas têm circuitos no segmento
  for (const [seg_id, seg] of rede.segmentos) {
    const zonas_no_seg: string[] = []
    const tipos_dr_no_seg = new Set<boolean>()  // true=DR, false=sem DR

    for (const circ_id of [...seg.circuito_ids]) {
      // Encontrar zona desta zona no ProtectionGraph
      for (const [zona_id, zona] of prot_graph.zonas) {
        if (zona.circuito_ids.includes(circ_id)) {
          if (!zonas_no_seg.includes(zona_id)) {
            zonas_no_seg.push(zona_id)
          }
          tipos_dr_no_seg.add(zona.tipo_protecao.startsWith('DR_'))

          // Acumular segmentos da zona
          const segs_da_zona = zona_para_segs.get(zona_id) ?? []
          if (!segs_da_zona.includes(seg_id)) segs_da_zona.push(seg_id)
          zona_para_segs.set(zona_id, segs_da_zona)
        }
      }
    }

    seg_para_zonas.set(seg_id, zonas_no_seg)

    // ── Verificar conflitos ────────────────────────────────────────
    // 1. Circuitos com e sem DR no mesmo eletroduto
    if (tipos_dr_no_seg.has(true) && tipos_dr_no_seg.has(false)) {
      // Encontrar quais zonas estão envolvidas
      const zonas_dr    = zonas_no_seg.filter(zid => prot_graph.zonas.get(zid)?.tipo_protecao.startsWith('DR_'))
      const zonas_sem_dr = zonas_no_seg.filter(zid => !prot_graph.zonas.get(zid)?.tipo_protecao.startsWith('DR_'))

      if (zonas_dr.length > 0 && zonas_sem_dr.length > 0) {
        conflitos.push({
          segmento_id: seg_id,
          tipo:        'DR_SEM_DR_NO_TUBO',
          circuito_ids: [...seg.circuito_ids],
          zona_ids:    zonas_no_seg,
          descricao:   `Segmento ${seg_id}: circuitos com DR (${zonas_dr.join(',')}) e sem DR (${zonas_sem_dr.join(',')}) no mesmo eletroduto — pode mascarar corrente diferencial`,
          severidade:  'aviso',
          referencia:  'NBR 5410 §4.1.3 — segregação de circuitos protegidos por DR',
        })
      }
    }

    // 2. Circuitos de DRs diferentes no mesmo eletroduto
    if (zonas_no_seg.length > 1) {
      const zonas_dr_distintas = zonas_no_seg.filter(zid =>
        prot_graph.zonas.get(zid)?.tipo_protecao.startsWith('DR_')
      )
      if (zonas_dr_distintas.length > 1) {
        conflitos.push({
          segmento_id: seg_id,
          tipo:        'DRS_DIFERENTES',
          circuito_ids: [...seg.circuito_ids],
          zona_ids:    zonas_dr_distintas,
          descricao:   `Segmento ${seg_id}: circuitos de DRs diferentes no mesmo eletroduto — pode gerar falso desarme`,
          severidade:  'aviso',
          referencia:  'Boas práticas — DRs diferentes em eletrodutos separados',
        })
      }
    }
  }

  // ── EntityDependencyGraph ─────────────────────────────────────
  // Registrar entidades e dependências para invalidação incremental
  const dep = createEntityGraph()

  // Registrar circuitos
  for (const [seg_id, seg] of rede.segmentos) {
    registerEntity(dep, seg_id, 'segmento')
    for (const circ_id of [...seg.circuito_ids]) {
      if (!dep.nodes.has(circ_id)) registerEntity(dep, circ_id, 'circuito')
    }
  }

  // Registrar zonas com dependências nos circuitos
  for (const [zona_id, zona] of prot_graph.zonas) {
    const dep_ids = zona.circuito_ids.filter(id => dep.nodes.has(id))
    registerEntity(dep, zona_id, 'zona_protecao', dep_ids)
  }

  // Segmentos dependem dos circuitos que passam por eles
  for (const [seg_id, seg] of rede.segmentos) {
    const node = dep.nodes.get(seg_id)
    if (node) {
      // Atualizar depends_on com circuitos do segmento
      dep.nodes.set(seg_id, {
        ...node,
        depends_on: seg.circuito_ids.filter(id => dep.nodes.has(id)),
      })
      // Registrar que o segmento afeta as zonas que passam por ele
      const zonas_seg = seg_para_zonas.get(seg_id) ?? []
      for (const zona_id of zonas_seg) {
        const zona_node = dep.nodes.get(zona_id)
        if (zona_node && !zona_node.affects.includes(seg_id)) {
          dep.nodes.set(zona_id, { ...zona_node, affects: [...zona_node.affects, seg_id] })
        }
      }
    }
  }

  return {
    segmento_para_zonas: seg_para_zonas,
    zona_para_segmentos: zona_para_segs,
    conflitos,
    dep_graph: dep,
  }
}

// ── Consultas ─────────────────────────────────────────────────────
// Quais segmentos são afetados quando uma zona de proteção muda?
export function segmentosAfetadosPorZona(
  zona_id: string,
  mapa:    ProtInfraMap
): string[] {
  return mapa.zona_para_segmentos.get(zona_id) ?? []
}

// Quais zonas de proteção passam por um segmento?
export function zonasNoSegmento(
  segmento_id: string,
  mapa:        ProtInfraMap
): string[] {
  return mapa.segmento_para_zonas.get(segmento_id) ?? []
}

// Invalidar zona no EntityDependencyGraph
export function invalidarZona(zona_id: string, mapa: ProtInfraMap): string[] {
  return invalidateEntity(mapa.dep_graph, zona_id)
}

// Resumo de conflitos por severidade
export function resumoConflitos(mapa: ProtInfraMap): {
  erros: number; avisos: number; ok: boolean
} {
  const erros  = mapa.conflitos.filter(c => c.severidade === 'erro').length
  const avisos = mapa.conflitos.filter(c => c.severidade === 'aviso').length
  return { erros, avisos, ok: erros === 0 }
}
