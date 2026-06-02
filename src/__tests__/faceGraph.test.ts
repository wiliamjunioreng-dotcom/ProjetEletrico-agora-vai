// src/__tests__/faceGraph.test.ts
// Testes do FaceGraph — rede navegável de superfícies

import { describe, it, expect } from 'vitest'
import { buildBuildingGraph } from '../core/buildingGraph'
import { buildFaceGraph, facesAdjacentes, caminhoFaces, facesDoComodo, verificarFaceGraph } from '../core/faceGraph'
import type { ComodoGeometria } from '../types/geometry'

// ── Fixture: um cômodo retangular (sala 4×3m) ────────────────────
function sala(): ComodoGeometria {
  const [vNO,vNE,vSE,vSO] = ['vno','vne','vse','vso']
  const [pN,pL,pS,pO]     = ['pn', 'pl', 'ps', 'po']
  return {
    id:'S', nome:'Sala', x:0, y:0, largura_m:4, altura_m:3,
    paredes: [
      { id:pN, comodo_id:'S', orientacao:'N',
        inicio:{x:0,y:0}, fim:{x:4,y:0}, espessura_m:0.15,
        tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vNO, vertice_fim_id:vNE,
        adjacencias_inicio:[pO], adjacencias_fim:[pL] },
      { id:pL, comodo_id:'S', orientacao:'L',
        inicio:{x:4,y:0}, fim:{x:4,y:3}, espessura_m:0.15,
        tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vNE, vertice_fim_id:vSE,
        adjacencias_inicio:[pN], adjacencias_fim:[pS] },
      { id:pS, comodo_id:'S', orientacao:'S',
        inicio:{x:4,y:3}, fim:{x:0,y:3}, espessura_m:0.15,
        tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSE, vertice_fim_id:vSO,
        adjacencias_inicio:[pL], adjacencias_fim:[pO] },
      { id:pO, comodo_id:'S', orientacao:'O',
        inicio:{x:0,y:3}, fim:{x:0,y:0}, espessura_m:0.15,
        tipo:'alvenaria', ponto_ids:[],
        vertice_inicio_id:vSO, vertice_fim_id:vNO,
        adjacencias_inicio:[pS], adjacencias_fim:[pN] },
    ],
    aberturas:[],
  }
}

describe('FaceGraph — rede navegável de superfícies', () => {

  it('sala retangular: 4 faces no FaceGraph (uma por parede)', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    const faces_da_sala = facesDoComodo('S', fg)
    expect(faces_da_sala).toHaveLength(4)
  })

  it('cada face tem exatamente 2 adjacências (num retângulo fechado)', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    for (const [fid] of fg.faces) {
      const adj = facesAdjacentes(fid, fg)
      expect(adj).toHaveLength(2)
    }
  })

  it('FaceGraph tem 4 arestas (um canto por par de paredes)', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    expect(fg.arestas.size).toBe(4)
  })

  it('face N é adjacente à face L (canto NE)', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)

    // Encontrar a face da parede N (do lado da sala S)
    const face_N = [...fg.faces.values()].find(f => {
      const p = bg.paredes.get(f.parede_id)
      return p?.orientacao === 'N' && f.comodo_id === 'S'
    })
    expect(face_N).toBeDefined()

    const adj = facesAdjacentes(face_N!.id, fg)
    const orientacoes_adj = adj.map(f => bg.paredes.get(f.parede_id)?.orientacao)
    // Face N deve ser adjacente a L e O (pelos cantos NE e NO)
    expect(orientacoes_adj).toContain('L')
    expect(orientacoes_adj).toContain('O')
  })

  it('caminhoFaces: N→S encontrado passando por L ou O', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)

    const face_N = [...fg.faces.values()].find(f =>
      bg.paredes.get(f.parede_id)?.orientacao === 'N' && f.comodo_id === 'S'
    )!
    const face_S = [...fg.faces.values()].find(f =>
      bg.paredes.get(f.parede_id)?.orientacao === 'S' && f.comodo_id === 'S'
    )!

    const caminho = caminhoFaces(face_N.id, face_S.id, fg)
    expect(caminho.length).toBeGreaterThan(0)
    expect(caminho[0]).toBe(face_N.id)
    expect(caminho[caminho.length - 1]).toBe(face_S.id)
  })

  it('caminhoFaces: face N→N retorna caminho de 1 elemento (mesma face)', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    const face_N = [...fg.faces.values()].find(f =>
      bg.paredes.get(f.parede_id)?.orientacao === 'N' && f.comodo_id === 'S'
    )!
    const caminho = caminhoFaces(face_N.id, face_N.id, fg)
    expect(caminho).toEqual([face_N.id])
  })

  it('verificarFaceGraph: grafo bem-formado sem inconsistências', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    const problemas = verificarFaceGraph(fg)
    expect(problemas).toHaveLength(0)
  })

  it('arestas têm ângulo ~90° (canto interno de retângulo)', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    for (const [, aresta] of fg.arestas) {
      // Cantos de retângulo = 90°
      expect(aresta.angulo_graus).toBeCloseTo(90, 0)
    }
  })

  it('adjacência é bidirecional: se A→B então B→A', () => {
    const bg = buildBuildingGraph([sala()])
    const fg = buildFaceGraph(bg)
    for (const [fid] of fg.faces) {
      const adj = facesAdjacentes(fid, fg)
      for (const face_adj of adj) {
        const adj_reverso = facesAdjacentes(face_adj.id, fg)
        const ids_reverso = adj_reverso.map(f => f.id)
        expect(ids_reverso).toContain(fid)
      }
    }
  })
})
