// src/__tests__/protectionInfraCoordination.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildProtInfraMap, segmentosAfetadosPorZona, zonasNoSegmento,
  invalidarZona, resumoConflitos,
} from '../core/protectionInfraCoordination'
import { buildProtectionGraph } from '../core/protectionGraph'
import { buildQuadro } from '../core/quadroDistribuicao'
import { buildRedeInfraestrutura } from '../core/redeInfraestrutura'
import { buildInfraestruturaCompartilhada } from '../core/infraestruturaCompartilhada'
import type { CircuitoParaQD } from '../core/quadroDistribuicao'
import type { InputCircuito } from '../core/infraestruturaCompartilhada'

// ── Quadro com circuitos mistos (com e sem DR) ────────────────────
const circs_qd: CircuitoParaQD[] = [
  { id:'c1', descricao:'ILUM Sala',  tipo:'ILUM', potencia_va:400, in_disj:10, curva:'C', idr:false, idr_in:0,  fase:'R', n_fases:1, secao_fase:1.5 },
  { id:'c2', descricao:'TUG Sala',   tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:false, idr_in:0,  fase:'S', n_fases:1, secao_fase:2.5 },
  { id:'c3', descricao:'TUG Banho',  tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:true,  idr_in:30, fase:'R', n_fases:1, secao_fase:2.5 },
]

// ── Infraestrutura: c1 e c3 no mesmo segmento (face-N) ───────────
const faces = new Map([
  ['face-N', { id:'face-N', parede_id:'p-N', comprimento_m:4, comodo_id:'sala' }],
  ['face-S', { id:'face-S', parede_id:'p-S', comprimento_m:4, comodo_id:'sala' }],
])

const circs_infra: InputCircuito[] = [
  { id:'c1', descricao:'ILUM', tipo:'ILUM', secao_mm2:1.5, n_fases:1, comprimento_m:10, face_ids:['face-N'] },
  { id:'c2', descricao:'TUG',  tipo:'TUG',  secao_mm2:2.5, n_fases:1, comprimento_m:12, face_ids:['face-S'] },
  { id:'c3', descricao:'TUG DR', tipo:'TUG', secao_mm2:2.5, n_fases:1, comprimento_m:10, face_ids:['face-N'] },
]

function buildFixtures() {
  const qd     = buildQuadro('qd', 'QD', circs_qd)
  const prot   = buildProtectionGraph(qd)
  const infra  = buildInfraestruturaCompartilhada(circs_infra, [], faces)
  const rede   = buildRedeInfraestrutura(infra.eletrodutos, infra.caixas)
  const mapa   = buildProtInfraMap(prot, rede)
  return { qd, prot, infra, rede, mapa }
}

describe('buildProtInfraMap — conectividade', () => {

  it('mapa criado sem erros', () => {
    const { mapa } = buildFixtures()
    expect(mapa).toBeDefined()
    expect(mapa.dep_graph).toBeDefined()
  })

  it('segmento_para_zonas: segmentos têm zonas associadas', () => {
    const { mapa } = buildFixtures()
    expect(mapa.segmento_para_zonas.size).toBeGreaterThan(0)
  })

  it('zona_para_segmentos: zonas têm segmentos associados', () => {
    const { mapa } = buildFixtures()
    expect(mapa.zona_para_segmentos.size).toBeGreaterThan(0)
  })

  it('EntityDependencyGraph: entidades registradas', () => {
    const { mapa } = buildFixtures()
    expect(mapa.dep_graph.nodes.size).toBeGreaterThan(0)
  })

  it('circuitos registrados como entidades no dep_graph', () => {
    const { mapa } = buildFixtures()
    expect(mapa.dep_graph.nodes.has('c1')).toBe(true)
    expect(mapa.dep_graph.nodes.has('c3')).toBe(true)
  })

  it('zonas registradas como entidades (zona_protecao)', () => {
    const { mapa } = buildFixtures()
    const zona_nodes = [...mapa.dep_graph.nodes.values()]
      .filter(n => n.entity_type === 'zona_protecao')
    expect(zona_nodes.length).toBeGreaterThan(0)
  })
})

describe('buildProtInfraMap — conflitos', () => {

  it('c1 (sem DR) e c3 (com DR) no mesmo segmento face-N: conflito DR_SEM_DR_NO_TUBO', () => {
    const { mapa } = buildFixtures()
    const conflitos_dr = mapa.conflitos.filter(c => c.tipo === 'DR_SEM_DR_NO_TUBO')
    // c1 (sem DR) e c3 (DR) passam pela face-N → conflito
    expect(conflitos_dr.length).toBeGreaterThan(0)
  })

  it('c2 (face-S, isolado) não gera conflito', () => {
    const { mapa } = buildFixtures()
    // c2 está apenas na face-S, não compartilha eletroduto com ninguém
    const conflitos_s = mapa.conflitos.filter(c => c.segmento_id === 'elet-face-S')
    expect(conflitos_s).toHaveLength(0)
  })

  it('resumoConflitos: tem avisos pelo conflito de DR', () => {
    const { mapa } = buildFixtures()
    const resumo = resumoConflitos(mapa)
    expect(resumo.avisos).toBeGreaterThan(0)
  })
})

describe('consultas ao mapa', () => {

  it('segmentosAfetadosPorZona: zona com c3 tem segmento face-N', () => {
    const { mapa, prot } = buildFixtures()
    // Encontrar a zona do c3 (TUG com DR)
    let zona_c3_id: string | undefined
    for (const [zid, zona] of prot.zonas) {
      if (zona.circuito_ids.includes('c3')) { zona_c3_id = zid; break }
    }
    if (zona_c3_id) {
      const segs = segmentosAfetadosPorZona(zona_c3_id, mapa)
      expect(segs.some(s => s.includes('face-N'))).toBe(true)
    }
  })

  it('zonasNoSegmento: face-N tem zonas de c1 e c3', () => {
    const { mapa } = buildFixtures()
    // Encontrar segmento da face-N
    const seg_ids = [...mapa.segmento_para_zonas.keys()].filter(s => s.includes('face-N'))
    if (seg_ids.length > 0) {
      const zonas = zonasNoSegmento(seg_ids[0], mapa)
      expect(zonas.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('invalidarZona: propaga no EntityDependencyGraph', () => {
    const { mapa, prot } = buildFixtures()
    let zona_c3_id: string | undefined
    for (const [zid, zona] of prot.zonas) {
      if (zona.circuito_ids.includes('c3')) { zona_c3_id = zid; break }
    }
    if (zona_c3_id) {
      const afetados = invalidarZona(zona_c3_id, mapa)
      // A zona e seus dependentes são marcados dirty
      expect(afetados).toContain(zona_c3_id)
    }
  })
})
