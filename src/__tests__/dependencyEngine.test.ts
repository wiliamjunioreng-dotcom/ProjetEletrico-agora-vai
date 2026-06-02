// src/__tests__/dependencyEngine.test.ts
import { describe, it, expect } from 'vitest'
import {
  createDependencyState, invalidate, markComputed, needsRecompute,
  recomputeOrder, applyMutation, statusGrafo, DEPENDENCY_GRAPH,
} from '../core/dependencyEngine'

describe('DependencyEngine — grafo de dependências', () => {

  it('nó fonte GEOMETRY não tem dependências', () => {
    expect(DEPENDENCY_GRAPH['GEOMETRY']).toHaveLength(0)
  })

  it('SPATIAL depende de GEOMETRY', () => {
    expect(DEPENDENCY_GRAPH['SPATIAL']).toContain('GEOMETRY')
  })

  it('SOLVER depende transitivamente de GEOMETRY (via CONDUCTORS)', () => {
    // SOLVER → CONDUCTORS → NETWORK → INFRASTRUCTURE → SEGMENTS → GEOMETRY
    const deps_solver = DEPENDENCY_GRAPH['SOLVER']
    // direto: CONDUCTORS e GEOMETRY
    expect(deps_solver).toContain('CONDUCTORS')
  })

  it('grafo é acíclico (DAG)', () => {
    // Verificar que nenhum nó aparece como sua própria dependência transitiva
    function temCiclo(node: string, caminho: Set<string>): boolean {
      if (caminho.has(node)) return true
      const deps = (DEPENDENCY_GRAPH as Record<string, string[]>)[node] ?? []
      const novo = new Set(caminho)
      novo.add(node)
      return deps.some(d => temCiclo(d, novo))
    }
    const todos = Object.keys(DEPENDENCY_GRAPH)
    for (const n of todos) {
      expect(temCiclo(n, new Set())).toBe(false)
    }
  })
})

describe('DependencyEngine — invalidação em cascata', () => {

  it('invalidar GEOMETRY marca SPATIAL como sujo', () => {
    const state = createDependencyState()
    invalidate('GEOMETRY', state)
    expect(state.dirty.has('SPATIAL')).toBe(true)
  })

  it('invalidar GEOMETRY cascateia até SOLVER e UI', () => {
    const state = createDependencyState()
    const afetados = invalidate('GEOMETRY', state)
    expect(afetados).toContain('SOLVER')
    expect(afetados).toContain('UI')
    expect(afetados).toContain('QUANTITATIVOS')
  })

  it('invalidar ALTERAR_CIRCUITO NÃO afeta GEOMETRY (domínio separado)', () => {
    const state = createDependencyState()
    invalidate('SOLVER', state)
    // GEOMETRY não deve estar sujo (invalidação não vai "para cima")
    expect(state.dirty.has('GEOMETRY')).toBe(false)
    expect(state.dirty.has('SPATIAL')).toBe(false)
  })

  it('markComputed remove o nó do conjunto sujo', () => {
    const state = createDependencyState()
    invalidate('GEOMETRY', state)
    expect(needsRecompute('GEOMETRY', state)).toBe(true)
    markComputed('GEOMETRY', state, { resultado: 'ok' })
    expect(needsRecompute('GEOMETRY', state)).toBe(false)
  })

  it('payload é armazenado ao marcar computado', () => {
    const state = createDependencyState()
    markComputed('SOLVER', state, { dU: 2.3 })
    expect(state.payload.get('SOLVER')).toEqual({ dU: 2.3 })
  })
})

describe('DependencyEngine — ordem de recálculo', () => {

  it('recomputeOrder: GEOMETRY antes de SPATIAL antes de SOLVER', () => {
    const state = createDependencyState()
    invalidate('GEOMETRY', state)
    const ordem = recomputeOrder(state)

    const i_geo    = ordem.indexOf('GEOMETRY')
    const i_spatial = ordem.indexOf('SPATIAL')
    const i_solver  = ordem.indexOf('SOLVER')

    expect(i_geo).toBeGreaterThanOrEqual(0)
    expect(i_spatial).toBeGreaterThan(i_geo)
    expect(i_solver).toBeGreaterThan(i_spatial)
  })

  it('recomputeOrder: UI sempre por último', () => {
    const state = createDependencyState()
    invalidate('GEOMETRY', state)
    const ordem = recomputeOrder(state)
    const i_ui = ordem.indexOf('UI')
    expect(i_ui).toBe(ordem.length - 1)
  })

  it('recomputeOrder vazio quando nada está sujo', () => {
    const state = createDependencyState()
    expect(recomputeOrder(state)).toHaveLength(0)
  })
})

describe('DependencyEngine — mutações', () => {

  it('MOVER_PONTO invalida GEOMETRY → cadeia completa', () => {
    const state = createDependencyState()
    const ordem = applyMutation('MOVER_PONTO', state)
    expect(ordem).toContain('GEOMETRY')
    expect(ordem).toContain('SPATIAL')
    expect(ordem).toContain('SOLVER')
    expect(ordem).toContain('UI')
  })

  it('ALTERAR_CIRCUITO invalida apenas SOLVER em diante (não rebuilda geometria)', () => {
    const state = createDependencyState()
    applyMutation('ALTERAR_CIRCUITO', state)
    // Geometria e spatial não devem estar sujos
    expect(state.dirty.has('GEOMETRY')).toBe(false)
    expect(state.dirty.has('SPATIAL')).toBe(false)
    // Solver e quantitativos devem estar sujos
    expect(state.dirty.has('SOLVER')).toBe(true)
    expect(state.dirty.has('QUANTITATIVOS')).toBe(true)
  })

  it('ALTERAR_SECAO invalida CONDUCTORS → SOLVER → QUANTITATIVOS', () => {
    const state = createDependencyState()
    applyMutation('ALTERAR_SECAO', state)
    expect(state.dirty.has('CONDUCTORS')).toBe(true)
    expect(state.dirty.has('SOLVER')).toBe(true)
    expect(state.dirty.has('QUANTITATIVOS')).toBe(true)
    // Geometry e Spatial não afetados
    expect(state.dirty.has('GEOMETRY')).toBe(false)
  })

  it('MOVER_PONTO requer mais recálculos que ALTERAR_CIRCUITO', () => {
    const s1 = createDependencyState()
    const s2 = createDependencyState()
    const ordem_mover = applyMutation('MOVER_PONTO', s1)
    const ordem_circ  = applyMutation('ALTERAR_CIRCUITO', s2)
    expect(ordem_mover.length).toBeGreaterThan(ordem_circ.length)
  })

  it('statusGrafo retorna todos os nós com estado correto', () => {
    const state = createDependencyState()
    invalidate('GEOMETRY', state)
    const status = statusGrafo(state)
    const geo_status = status.find(s => s.node === 'GEOMETRY')
    expect(geo_status?.dirty).toBe(true)
    expect(geo_status?.computed_at).toBeNull()
  })
})
