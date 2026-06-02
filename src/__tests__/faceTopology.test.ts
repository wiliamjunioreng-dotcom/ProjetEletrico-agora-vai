// src/__tests__/faceTopology.test.ts
// Testes de Face Topology — superfícies semânticas de parede

import { describe, it, expect } from 'vitest'
import { buildBuildingGraph, paredensCompartilhadas, ladoDoOffset, offsetPadrao } from '../core/buildingGraph'
import type { ComodoGeometria } from '../types/geometry'

// Reutilizar fixture dos dois quartos
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
      { id:pO, comodo_id:'B', orientacao:'O',
        inicio:{x:4,y:3}, fim:{x:4,y:0},
        espessura_m:0.15, tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSO, vertice_fim_id:vNO,
        adjacencias_inicio:[pS], adjacencias_fim:[pN] },
    ],
    aberturas:[],
  }
}

describe('Face Topology — superfícies semânticas de parede', () => {

  // ── Helpers de lado ──────────────────────────────────────────────
  it('ladoDoOffset: positivo = esquerda', () => {
    expect(ladoDoOffset(0.075)).toBe('esquerda')
  })

  it('ladoDoOffset: negativo = direita', () => {
    expect(ladoDoOffset(-0.075)).toBe('direita')
  })

  it('ladoDoOffset: zero = eixo', () => {
    expect(ladoDoOffset(0)).toBe('eixo')
    expect(ladoDoOffset(0.0001)).toBe('eixo')  // tolerância
  })

  it('offsetPadrao: parede de 15cm → esquerda = +7.5cm', () => {
    expect(offsetPadrao('esquerda', 0.15)).toBeCloseTo(0.075)
  })

  it('offsetPadrao: parede de 15cm → direita = -7.5cm', () => {
    expect(offsetPadrao('direita', 0.15)).toBeCloseTo(-0.075)
  })

  it('offsetPadrao: eixo = 0', () => {
    expect(offsetPadrao('eixo', 0.15)).toBe(0)
  })

  // ── Faces no grafo ───────────────────────────────────────────────
  it('parede externa de A: 1 face (do lado do cômodo A)', () => {
    const g = buildBuildingGraph([quartoA()])
    const pN = g.paredes.get('a-pn')
    expect(pN?.faces).toHaveLength(1)
    expect(pN?.faces[0].comodo_id).toBe('A')
  })

  it('parede compartilhada A+B: 2 faces (uma por cômodo)', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const comp = paredensCompartilhadas('A', 'B', g)
    expect(comp[0].faces).toHaveLength(2)
  })

  it('face A da parede compartilhada: comodo_id = A', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const comp = paredensCompartilhadas('A', 'B', g)
    const face_A = comp[0].faces.find(f => f.comodo_id === 'A')
    expect(face_A).toBeDefined()
  })

  it('face B da parede compartilhada: comodo_id = B', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const comp = paredensCompartilhadas('A', 'B', g)
    const face_B = comp[0].faces.find(f => f.comodo_id === 'B')
    expect(face_B).toBeDefined()
  })

  it('faces de uma parede compartilhada são em lados opostos', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const comp = paredensCompartilhadas('A', 'B', g)
    const lados = comp[0].faces.map(f => f.lado)
    // Uma face é esquerda, outra é direita (lados opostos)
    expect(lados).toContain('esquerda')
    expect(lados).toContain('direita')
  })

  it('face tem UUID persistente (não derivado da geometria)', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    for (const [, p] of g.paredes) {
      for (const f of p.faces) {
        expect(f.id).toBeTruthy()
        expect(f.id.length).toBeGreaterThan(10)  // UUID, não número
        // ID não deve ser derivado da posição geométrica
        expect(f.id).not.toContain('0,0')
        expect(f.id).not.toContain('4,3')
      }
    }
  })

  it('face tem offset correto: espessura 15cm → offset ±7.5cm', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    const comp = paredensCompartilhadas('A', 'B', g)
    for (const f of comp[0].faces) {
      expect(Math.abs(f.offset_m)).toBeCloseTo(0.075)
    }
  })

  it('ponto_ids vazio em face nova (sem pontos instalados)', () => {
    const g = buildBuildingGraph([quartoA(), quartoB()])
    for (const [, p] of g.paredes) {
      for (const f of p.faces) {
        expect(f.ponto_ids).toHaveLength(0)
      }
    }
  })
})
