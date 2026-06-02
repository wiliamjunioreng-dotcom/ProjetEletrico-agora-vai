// src/__tests__/wallGraph.test.ts
// Testes do WallGraph — topologia de paredes

import { describe, it, expect } from 'vitest'
import { buildWallGraph, proximaParede, caminhoParedes, verificarGrafo } from '../core/wallGraph'
import type { ComodoGeometria } from '../types/geometry'

// Cômodo de teste: retângulo 4×3m em (1,1)
function comodoTeste(): ComodoGeometria {
  const vNO = 'v-no', vNE = 'v-ne', vSE = 'v-se', vSO = 'v-so'
  const pN  = 'p-n',  pL  = 'p-l',  pS  = 'p-s',  pO  = 'p-o'
  return {
    id: 'c-1', nome: 'Sala', x: 1, y: 1, largura_m: 4, altura_m: 3,
    paredes: [
      { id: pN, comodo_id: 'c-1', orientacao: 'N',
        inicio: {x:1,y:1}, fim: {x:5,y:1},
        espessura_m: 0.15, tipo: 'alvenaria', ponto_ids: [],
        vertice_inicio_id: vNO, vertice_fim_id: vNE,
        adjacencias_inicio: [pO], adjacencias_fim: [pL] },
      { id: pL, comodo_id: 'c-1', orientacao: 'L',
        inicio: {x:5,y:1}, fim: {x:5,y:4},
        espessura_m: 0.15, tipo: 'alvenaria', ponto_ids: [],
        vertice_inicio_id: vNE, vertice_fim_id: vSE,
        adjacencias_inicio: [pN], adjacencias_fim: [pS] },
      { id: pS, comodo_id: 'c-1', orientacao: 'S',
        inicio: {x:5,y:4}, fim: {x:1,y:4},
        espessura_m: 0.15, tipo: 'alvenaria', ponto_ids: [],
        vertice_inicio_id: vSE, vertice_fim_id: vSO,
        adjacencias_inicio: [pL], adjacencias_fim: [pO] },
      { id: pO, comodo_id: 'c-1', orientacao: 'O',
        inicio: {x:1,y:4}, fim: {x:1,y:1},
        espessura_m: 0.15, tipo: 'alvenaria', ponto_ids: [],
        vertice_inicio_id: vSO, vertice_fim_id: vNO,
        adjacencias_inicio: [pS], adjacencias_fim: [pN] },
    ],
    aberturas: [],
  }
}

describe('WallGraph — topologia de paredes', () => {

  it('buildWallGraph: cômodo retangular tem 4 paredes e 4 vértices', () => {
    const g = buildWallGraph(comodoTeste())
    expect(g.paredes.size).toBe(4)
    expect(g.vertices.size).toBe(4)
  })

  it('cada vértice é compartilhado por exatamente 2 paredes (canto)', () => {
    const g = buildWallGraph(comodoTeste())
    for (const [, v] of g.vertices) {
      expect(v.parede_ids).toHaveLength(2)
    }
  })

  it('cada parede tem exatamente 1 adjacência em cada extremo (retângulo fechado)', () => {
    const cg = comodoTeste()
    buildWallGraph(cg)  // build para side effects (registrar vértices)
    for (const p of cg.paredes) {
      expect(p.adjacencias_inicio).toHaveLength(1)
      expect(p.adjacencias_fim).toHaveLength(1)
    }
  })

  it('proximaParede: N→fim→L (parede norte conecta com leste no vértice NE)', () => {
    const g = buildWallGraph(comodoTeste())
    const prox = proximaParede('p-n', 'fim', g)
    expect(prox?.id).toBe('p-l')
  })

  it('proximaParede: N→inicio→O (parede norte conecta com oeste no vértice NO)', () => {
    const g = buildWallGraph(comodoTeste())
    const prox = proximaParede('p-n', 'inicio', g)
    expect(prox?.id).toBe('p-o')
  })

  it('caminhoParedes: N→L encontrado em 2 passos', () => {
    const g = buildWallGraph(comodoTeste())
    const caminho = caminhoParedes('p-n', 'p-l', g)
    expect(caminho).toHaveLength(2)
    expect(caminho[0]).toBe('p-n')
    expect(caminho[1]).toBe('p-l')
  })

  it('caminhoParedes: N→S encontrado passando por L ou O', () => {
    const g = buildWallGraph(comodoTeste())
    const caminho = caminhoParedes('p-n', 'p-s', g)
    expect(caminho.length).toBeGreaterThan(0)
    expect(caminho[0]).toBe('p-n')
    expect(caminho[caminho.length - 1]).toBe('p-s')
  })

  it("verificarGrafo: grafo bem-formado não tem inconsistências", () => {
    const g = buildWallGraph(comodoTeste())
    const prob = verificarGrafo(g)
    expect(prob).toHaveLength(0)
  })

  it('adjacências formam ciclo fechado: N→L→S→O→N', () => {
    const cg = comodoTeste()
    // Verificar que percorrer as adjacências forma um ciclo
    let atual_id = 'p-n'
    const percorridos: string[] = [atual_id]
    for (let i = 0; i < 3; i++) {
      const parede = cg.paredes.find(p => p.id === atual_id)!
      atual_id = parede.adjacencias_fim[0]
      percorridos.push(atual_id)
    }
    expect(percorridos).toEqual(['p-n', 'p-l', 'p-s', 'p-o'])
    // O→início deve conectar de volta ao N
    const pO = cg.paredes.find(p => p.id === 'p-o')!
    expect(pO.adjacencias_fim[0]).toBe('p-n')
  })

  it('vértice NE: pertence a p-n e p-l', () => {
    const g = buildWallGraph(comodoTeste())
    const vne = g.vertices.get('v-ne')
    expect(vne?.parede_ids).toContain('p-n')
    expect(vne?.parede_ids).toContain('p-l')
  })
})
