// src/__tests__/condutorEKernel.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildCondutoresCircuito, verificarCondutores, resumoCompra,
  COR_NBR5410, roloComercial,
} from '../core/condutor'
import type { CircuitoParaCondutores } from '../core/condutor'
import {
  buildSpatialKernel, queryParede, queryFacesDoComodo,
  queryRotaFaces, queryVizinhos, verificarKernel,
} from '../core/spatialKernel'
import type { ComodoGeometria } from '../types/geometry'

// ── Fixture: dois quartos lado a lado ─────────────────────────────
function quartoA(): ComodoGeometria {
  const [vNO,vNE,vSE,vSO] = ['a-vno','a-vne','a-vse','a-vso']
  const [pN,pL,pS,pO]     = ['a-pn','a-pl','a-ps','a-po']
  return {
    id:'A', nome:'Sala', x:0, y:0, largura_m:4, altura_m:3,
    paredes:[
      {id:pN,comodo_id:'A',orientacao:'N',inicio:{x:0,y:0},fim:{x:4,y:0},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vNO,vertice_fim_id:vNE,adjacencias_inicio:[pO],adjacencias_fim:[pL]},
      {id:pL,comodo_id:'A',orientacao:'L',inicio:{x:4,y:0},fim:{x:4,y:3},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vNE,vertice_fim_id:vSE,adjacencias_inicio:[pN],adjacencias_fim:[pS]},
      {id:pS,comodo_id:'A',orientacao:'S',inicio:{x:4,y:3},fim:{x:0,y:3},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vSE,vertice_fim_id:vSO,adjacencias_inicio:[pL],adjacencias_fim:[pO]},
      {id:pO,comodo_id:'A',orientacao:'O',inicio:{x:0,y:3},fim:{x:0,y:0},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vSO,vertice_fim_id:vNO,adjacencias_inicio:[pS],adjacencias_fim:[pN]},
    ],
    aberturas:[],
  }
}

function quartoB(): ComodoGeometria {
  const [vNO,vNE,vSE,vSO] = ['b-vno','b-vne','b-vse','b-vso']
  const [pN,pL,pS,pO]     = ['b-pn','b-pl','b-ps','b-po']
  return {
    id:'B', nome:'Quarto', x:4, y:0, largura_m:3, altura_m:3,
    paredes:[
      {id:pN,comodo_id:'B',orientacao:'N',inicio:{x:4,y:0},fim:{x:7,y:0},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vNO,vertice_fim_id:vNE,adjacencias_inicio:[pO],adjacencias_fim:[pL]},
      {id:pL,comodo_id:'B',orientacao:'L',inicio:{x:7,y:0},fim:{x:7,y:3},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vNE,vertice_fim_id:vSE,adjacencias_inicio:[pN],adjacencias_fim:[pS]},
      {id:pS,comodo_id:'B',orientacao:'S',inicio:{x:7,y:3},fim:{x:4,y:3},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vSE,vertice_fim_id:vSO,adjacencias_inicio:[pL],adjacencias_fim:[pO]},
      {id:pO,comodo_id:'B',orientacao:'O',inicio:{x:4,y:3},fim:{x:4,y:0},espessura_m:0.15,tipo:'alvenaria',ponto_ids:[],vertice_inicio_id:vSO,vertice_fim_id:vNO,adjacencias_inicio:[pS],adjacencias_fim:[pN]},
    ],
    aberturas:[],
  }
}

// ── CondutorContinuo ──────────────────────────────────────────────
describe('CondutorContinuo — buildCondutoresCircuito', () => {

  const circ_ilum: CircuitoParaCondutores = {
    id:'c1', tipo:'ILUM', secao_mm2:1.5, n_fases:1, isolacao:'PVC',
    segmento_ids:['s1','s2','s3'], no_origem_id:'no-qd', no_destino_id:'no-lum',
  }

  it('ILUM: 4 condutores (F + N + retorno + PE)', () => {
    const conds = buildCondutoresCircuito(circ_ilum)
    expect(conds).toHaveLength(4)
    const funcoes = conds.map(c => c.funcao)
    expect(funcoes).toContain('fase')
    expect(funcoes).toContain('neutro')
    expect(funcoes).toContain('retorno')
    expect(funcoes).toContain('terra')
  })

  it('PE tem seção = max(2.5, secao/2) — NBR 5410 Tabela 5', () => {
    const conds = buildCondutoresCircuito({ ...circ_ilum, secao_mm2: 6 })
    const pe = conds.find(c => c.funcao === 'terra')!
    expect(pe.secao_mm2).toBeCloseTo(3)   // 6/2 = 3 > 2.5
  })

  it('PE de circuito 2.5mm² tem seção mínima 2.5mm²', () => {
    const conds = buildCondutoresCircuito({ ...circ_ilum, secao_mm2: 2.5, tipo: 'TUG' })
    const pe = conds.find(c => c.funcao === 'terra')!
    expect(pe.secao_mm2).toBe(2.5)   // max(2.5, 2.5/2) = 2.5
  })

  it('TUG: 3 condutores (F + N + PE)', () => {
    const c = buildCondutoresCircuito({ ...circ_ilum, tipo:'TUG', secao_mm2:2.5 })
    expect(c).toHaveLength(3)
    expect(c.map(x => x.funcao)).not.toContain('retorno')
  })

  it('TUE bifásico: F1 + F2 + PE = 3 condutores', () => {
    const c = buildCondutoresCircuito({ ...circ_ilum, tipo:'TUE', n_fases:2 as const })
    expect(c).toHaveLength(3)
    expect(c.filter(x => x.funcao === 'fase')).toHaveLength(2)
  })

  it('neutro tem cor azul-claro (NBR 5410 §6.1.1)', () => {
    const conds = buildCondutoresCircuito(circ_ilum)
    const neutro = conds.find(c => c.funcao === 'neutro')!
    expect(neutro.cor_nbr5410).toBe(COR_NBR5410.neutro)
    expect(neutro.cor_nbr5410).toContain('0077cc')
  })

  it('terra tem cor verde (NBR 5410 §6.1.1)', () => {
    const conds = buildCondutoresCircuito(circ_ilum)
    const pe = conds.find(c => c.funcao === 'terra')!
    expect(pe.cor_nbr5410).toBe(COR_NBR5410.terra)
    expect(pe.cor_nbr5410).toContain('44aa00')
  })

  it('todos os condutores referenciam os mesmos segmentos', () => {
    const conds = buildCondutoresCircuito(circ_ilum)
    for (const c of conds) {
      expect(c.segmento_ids).toEqual(['s1','s2','s3'])
    }
  })

  it('verificarCondutores: condutores válidos sem problemas', () => {
    const conds = buildCondutoresCircuito(circ_ilum)
    const prob = verificarCondutores(conds)
    expect(prob).toHaveLength(0)
  })

  it('roloComercial: 12m → rolo de 25m', () => {
    expect(roloComercial(12)).toBe(25)
  })
  it('roloComercial: 30m → rolo de 50m', () => {
    expect(roloComercial(30)).toBe(50)
  })
  it('roloComercial: 80m → rolo de 100m', () => {
    expect(roloComercial(80)).toBe(100)
  })
})

describe('CondutorContinuo — resumoCompra', () => {

  it('agrupa condutores com mesma seção e função', () => {
    const c1 = buildCondutoresCircuito({
      id:'c1', tipo:'TUG', secao_mm2:2.5, n_fases:1, isolacao:'PVC',
      segmento_ids:['s1'], no_origem_id:'qd', no_destino_id:'tug1',
    })
    const c2 = buildCondutoresCircuito({
      id:'c2', tipo:'TUG', secao_mm2:2.5, n_fases:1, isolacao:'PVC',
      segmento_ids:['s2'], no_origem_id:'qd', no_destino_id:'tug2',
    })
    const items = resumoCompra([...c1, ...c2])
    // 2 circuitos TUG com mesma seção → agrupa por funcao+secao+cor
    // fase + neutro + terra: 3 itens
    expect(items).toHaveLength(3)
  })
})

// ── SpatialKernel ─────────────────────────────────────────────────
describe('SpatialKernel — fachada unificada', () => {

  it('buildSpatialKernel: constrói todos os grafos internamente', () => {
    const kernel = buildSpatialKernel([quartoA(), quartoB()])
    expect(kernel.building.paredes.size).toBeGreaterThan(0)
    expect(kernel.faces.faces.size).toBeGreaterThan(0)
    expect(kernel.wall_graphs.size).toBe(2)
  })

  it('queryParede: encontra parede por ID', () => {
    const kernel = buildSpatialKernel([quartoA()])
    const p = queryParede('a-pn', kernel)
    expect(p).not.toBeNull()
    expect(p?.orientacao).toBe('N')
  })

  it('queryFacesDoComodo: retorna 4 faces para cômodo retangular', () => {
    const kernel = buildSpatialKernel([quartoA()])
    const faces = queryFacesDoComodo('A', kernel)
    expect(faces).toHaveLength(4)
  })

  it('queryVizinhos: A tem B como vizinho quando compartilham parede', () => {
    const kernel = buildSpatialKernel([quartoA(), quartoB()])
    const viz = queryVizinhos('A', kernel)
    expect(viz.map(v => v.id)).toContain('B')
  })

  it('queryRotaFaces: encontra caminho entre faces', () => {
    const kernel = buildSpatialKernel([quartoA()])
    const faces  = queryFacesDoComodo('A', kernel)
    const f0     = faces[0].id
    const f2     = faces[2]?.id
    if (f2) {
      const rota = queryRotaFaces(f0, f2, kernel)
      expect(rota.length).toBeGreaterThan(0)
    }
  })

  it('verificarKernel: grafo bem-formado sem inconsistências', () => {
    const kernel = buildSpatialKernel([quartoA(), quartoB()])
    const prob   = verificarKernel(kernel)
    expect(prob).toHaveLength(0)
  })

  it('chamador NÃO precisa saber qual grafo usar', () => {
    // O ponto arquitetural: o chamador usa apenas o kernel
    const kernel = buildSpatialKernel([quartoA()])
    // Não precisa importar buildBuildingGraph, buildFaceGraph, etc.
    const parede = queryParede('a-pn', kernel)
    const faces  = queryFacesDoComodo('A', kernel)
    expect(parede).not.toBeNull()
    expect(faces.length).toBeGreaterThan(0)
  })
})
