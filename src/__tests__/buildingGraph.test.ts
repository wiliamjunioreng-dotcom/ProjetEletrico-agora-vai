// src/__tests__/buildingGraph.test.ts
// Testes do BuildingGraph — topologia global multiambiente

import { describe, it, expect } from 'vitest'
import { buildBuildingGraph, paredensCompartilhadas, comodoVizinhos, caminhoCômodos, verificarBuilding } from '../core/buildingGraph'
import type { ComodoGeometria } from '../types/geometry'

// ── Fixture: dois quartos lado a lado compartilhando a parede L do quarto A ──
// Quarto A: (0,0) → (4,3)  — paredes N,L,S,O
// Quarto B: (4,0) → (3,3)  — parede O de B = parede L de A (mesma geometria)
//
//  +--A--+--B--+
//  |     |     |
//  +-----+-----+
//
// A.parede_L: inicio=(4,0), fim=(4,3)
// B.parede_O: inicio=(4,3), fim=(4,0)   ← sentido inverso, mesma parede física

function quartoA(): ComodoGeometria {
  const [vNO,vNE,vSE,vSO] = ['a-vno','a-vne','a-vse','a-vso']
  const [pN,pL,pS,pO]     = ['a-pn', 'a-pl', 'a-ps', 'a-po']
  return {
    id:'A', nome:'Quarto A', x:0, y:0, largura_m:4, altura_m:3,
    paredes: [
      { id:pN, comodo_id:'A', orientacao:'N',
        inicio:{x:0,y:0}, fim:{x:4,y:0},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vNO, vertice_fim_id:vNE,
        adjacencias_inicio:[pO], adjacencias_fim:[pL] },
      { id:pL, comodo_id:'A', orientacao:'L',
        inicio:{x:4,y:0}, fim:{x:4,y:3},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vNE, vertice_fim_id:vSE,
        adjacencias_inicio:[pN], adjacencias_fim:[pS] },
      { id:pS, comodo_id:'A', orientacao:'S',
        inicio:{x:4,y:3}, fim:{x:0,y:3},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSE, vertice_fim_id:vSO,
        adjacencias_inicio:[pL], adjacencias_fim:[pO] },
      { id:pO, comodo_id:'A', orientacao:'O',
        inicio:{x:0,y:3}, fim:{x:0,y:0},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSO, vertice_fim_id:vNO,
        adjacencias_inicio:[pS], adjacencias_fim:[pN] },
    ],
    aberturas:[],
  }
}

function quartoB(): ComodoGeometria {
  const [vNO,vNE,vSE,vSO] = ['b-vno','b-vne','b-vse','b-vso']
  // Parede O de B é geometricamente igual à parede L de A (sentido inverso)
  const [pN,pL,pS,pO] = ['b-pn','b-pl','b-ps','b-po']
  return {
    id:'B', nome:'Quarto B', x:4, y:0, largura_m:3, altura_m:3,
    paredes: [
      { id:pN, comodo_id:'B', orientacao:'N',
        inicio:{x:4,y:0}, fim:{x:7,y:0},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vNO, vertice_fim_id:vNE,
        adjacencias_inicio:[pO], adjacencias_fim:[pL] },
      { id:pL, comodo_id:'B', orientacao:'L',
        inicio:{x:7,y:0}, fim:{x:7,y:3},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vNE, vertice_fim_id:vSE,
        adjacencias_inicio:[pN], adjacencias_fim:[pS] },
      { id:pS, comodo_id:'B', orientacao:'S',
        inicio:{x:7,y:3}, fim:{x:4,y:3},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSE, vertice_fim_id:vSO,
        adjacencias_inicio:[pL], adjacencias_fim:[pO] },
      // Parede O de B: inicio=(4,3), fim=(4,0) — sentido INVERSO da parede L de A
      { id:pO, comodo_id:'B', orientacao:'O',
        inicio:{x:4,y:3}, fim:{x:4,y:0},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSO, vertice_fim_id:vNO,
        adjacencias_inicio:[pS], adjacencias_fim:[pN] },
    ],
    aberturas:[],
  }
}

describe('BuildingGraph — topologia global multiambiente', () => {

  it('dois quartos lado a lado: paredes externas não compartilhadas', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    // A: 4 paredes, B: 4 paredes, mas L_A = O_B → 7 paredes globais
    expect(g.paredes.size).toBe(7)
  })

  it('parede compartilhada (A.pL = B.pO): detectada por coincidência geométrica', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    // Encontrar a parede que pertence a ambos
    const compartilhadas = paredensCompartilhadas('A', 'B', g)
    expect(compartilhadas).toHaveLength(1)
  })

  it('parede compartilhada tem dois comodo_ids', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const comp = paredensCompartilhadas('A', 'B', g)
    expect(comp[0].comodo_ids).toContain('A')
    expect(comp[0].comodo_ids).toContain('B')
  })

  it('cômodos vizinhos: A tem B como vizinho', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const viz = comodoVizinhos('A', g)
    expect(viz.map(v => v.id)).toContain('B')
  })

  it('cômodos vizinhos: B tem A como vizinho', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const viz = comodoVizinhos('B', g)
    expect(viz.map(v => v.id)).toContain('A')
  })

  it('caminho entre cômodos adjacentes: A→B em 2 passos', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const caminho = caminhoCômodos('A', 'B', g)
    expect(caminho).toEqual(['A', 'B'])
  })

  it('vértices compartilhados: canto NE de A = canto NO de B', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    // O vértice NE de A (pos 4,0) deve ser o mesmo que NO de B (pos 4,0)
    const vnos_no_ponto_4_0 = [...g.vertices.values()].filter(v =>
      Math.abs(v.pos.x - 4) < 0.01 && Math.abs(v.pos.y - 0) < 0.01
    )
    expect(vnos_no_ponto_4_0).toHaveLength(1)  // um único vértice
    expect(vnos_no_ponto_4_0[0].comodo_ids).toContain('A')
    expect(vnos_no_ponto_4_0[0].comodo_ids).toContain('B')
  })

  it('vértices compartilhados: canto SE de A = SO de B', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const v = [...g.vertices.values()].find(v =>
      Math.abs(v.pos.x - 4) < 0.01 && Math.abs(v.pos.y - 3) < 0.01
    )
    expect(v).toBeDefined()
    expect(v!.comodo_ids).toContain('A')
    expect(v!.comodo_ids).toContain('B')
  })

  it('grafo bem-formado: sem inconsistências', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const problemas = verificarBuilding(g)
    expect(problemas).toHaveLength(0)
  })

  it('cômodo isolado: não tem vizinhos', () => {
    const g = buildBuildingGraph([quartoA()])  // só A, sem B
    const viz = comodoVizinhos('A', g)
    expect(viz).toHaveLength(0)
  })

  it('invariante: parede compartilhada tem 1 ID no grafo global (não duplicata)', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    // A parede L de A e a parede O de B são a mesma — deve existir como 1 entrada
    let count_4_0_to_4_3 = 0
    for (const [, p] of g.paredes) {
      const e1 = (Math.abs(p.inicio.x-4)<0.01 && Math.abs(p.inicio.y-0)<0.01 &&
                  Math.abs(p.fim.x-4)<0.01   && Math.abs(p.fim.y-3)<0.01)
      const e2 = (Math.abs(p.inicio.x-4)<0.01 && Math.abs(p.inicio.y-3)<0.01 &&
                  Math.abs(p.fim.x-4)<0.01   && Math.abs(p.fim.y-0)<0.01)
      if (e1 || e2) count_4_0_to_4_3++
    }
    expect(count_4_0_to_4_3).toBe(1)  // exatamente uma parede no segmento x=4
  })
})
