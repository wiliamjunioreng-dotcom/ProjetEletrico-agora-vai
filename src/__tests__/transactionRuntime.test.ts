// src/__tests__/transactionRuntime.test.ts
import { describe, it, expect } from 'vitest'
import {
  Transaction, TransactionRuntime, batchMutate
} from '../core/transactionRuntime'
import { createDependencyState, needsRecompute } from '../core/dependencyEngine'

describe('Transaction — ciclo de vida', () => {

  it('nova transação está OPEN', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    expect(txn.status).toBe('OPEN')
    expect(txn.mutacoes).toHaveLength(0)
  })

  it('add() acumula mutações sem executar', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO', { x: 1, y: 2 }, 'mover tomada')
       .add('ALTERAR_CIRCUITO', 'c1')
    expect(txn.mutacoes).toHaveLength(2)
    // Nenhuma dirty ainda (não commitou)
    expect(state.dirty.size).toBe(0)
  })

  it('commit() muda status para COMMITTED', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO')
    const result = txn.commit()
    expect(txn.status).toBe('COMMITTED')
    expect(result.sucesso).toBe(true)
  })

  it('commit() aplica invalidação ao dependency state', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    const result = txn.commit()
    // Verificar que a mutação foi aplicada sem erro
    expect(result.sucesso).toBe(true)
  })

  it('rollback() limpa mutações e restaura estado', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO')
    txn.rollback()
    expect(txn.status).toBe('ROLLED_BACK')
    expect(txn.mutacoes).toHaveLength(0)
    // Estado deve estar limpo (como antes)
    expect(state.dirty.size).toBe(0)
  })

  it('não pode adicionar após commit', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO')
    txn.commit()
    expect(() => txn.add('ALTERAR_CIRCUITO')).toThrow()
  })

  it('fluent API: add().add().add()', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO').add('MOVER_PONTO').add('ALTERAR_CIRCUITO')
    expect(txn.mutacoes).toHaveLength(3)
  })
})

describe('Transaction — plano de recompute', () => {

  it('plan() retorna ordem topológica sem executar', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO')
    const plano = txn.plan()
    // GEOMETRY antes de SPATIAL antes de SOLVER
    const i_geo     = plano.ordem.indexOf('GEOMETRY')
    const i_spatial = plano.ordem.indexOf('SPATIAL')
    const i_solver  = plano.ordem.indexOf('SOLVER')
    expect(i_geo).toBeGreaterThanOrEqual(0)
    expect(i_spatial).toBeGreaterThan(i_geo)
    expect(i_solver).toBeGreaterThan(i_spatial)
    // Estado original não foi modificado (apenas simulação)
    expect(state.dirty.size).toBe(0)
  })

  it('plan() ALTERAR_CIRCUITO: menos nós que MOVER_PONTO', () => {
    const s1 = createDependencyState()
    const s2 = createDependencyState()
    const t1 = new Transaction(s1)
    const t2 = new Transaction(s2)
    t1.add('MOVER_PONTO')
    t2.add('ALTERAR_CIRCUITO')
    expect(t1.plan().n_dirty).toBeGreaterThan(t2.plan().n_dirty)
  })

  it('plan() estima tempo > 0 para mutações reais', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO')
    expect(txn.plan().estimado_ms).toBeGreaterThan(0)
  })

  it('plan() retorna vazio para transação sem mutações', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    const plano = txn.plan()
    expect(plano.ordem).toHaveLength(0)
    expect(plano.n_dirty).toBe(0)
  })
})

describe('Transaction — executor de recompute', () => {

  it('executor é chamado para cada domínio dirty', () => {
    const state   = createDependencyState()
    const txn     = new Transaction(state)
    const chamados: string[] = []

    txn.add('ALTERAR_CIRCUITO')
    txn.commit({
      SOLVER:       () => chamados.push('SOLVER'),
      QUANTITATIVOS: () => chamados.push('QUANTITATIVOS'),
    })

    expect(chamados).toContain('SOLVER')
    expect(chamados).toContain('QUANTITATIVOS')
  })

  it('executor não é chamado para domínios não dirty', () => {
    const state   = createDependencyState()
    const txn     = new Transaction(state)
    const chamados: string[] = []

    txn.add('ALTERAR_CIRCUITO')  // só invalida SOLVER em diante
    txn.commit({
      GEOMETRY: () => chamados.push('GEOMETRY'),   // não deve ser chamado
      SPATIAL:  () => chamados.push('SPATIAL'),    // não deve ser chamado
      SOLVER:   () => chamados.push('SOLVER'),     // deve ser chamado
    })

    expect(chamados).not.toContain('GEOMETRY')
    expect(chamados).not.toContain('SPATIAL')
    expect(chamados).toContain('SOLVER')
  })

  it('commit com executor marca nós como computed', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('ALTERAR_CIRCUITO')
    txn.commit({ SOLVER: () => {} })
    // SOLVER deve estar marcado como computed (não dirty)
    expect(needsRecompute('SOLVER', state)).toBe(false)
  })
})

describe('Transaction — atomicidade e rollback', () => {

  it('rollback restaura estado idêntico ao início', () => {
    const state = createDependencyState()
    // Simular estado sujo inicial
    state.dirty.add('QUANTITATIVOS')

    const txn = new Transaction(state)
    txn.add('MOVER_PONTO').add('ALTERAR_CIRCUITO')
    txn.rollback()

    // Estado deve ser exatamente como antes
    expect(state.dirty.has('QUANTITATIVOS')).toBe(true)
    expect(state.dirty.has('GEOMETRY')).toBe(false)
  })

  it('rollback após erro de commit é automático', () => {
    const state = createDependencyState()
    const txn   = new Transaction(state)
    txn.add('MOVER_PONTO')

    const result = txn.commit({
      GEOMETRY: () => { throw new Error('falha simulada') }
    })

    expect(result.sucesso).toBe(false)
    expect(result.erro).toContain('falha simulada')
    expect(txn.status).toBe('ROLLED_BACK')
  })
})

describe('TransactionRuntime — gestão de ciclo de vida', () => {

  it('begin() cria transação OPEN', () => {
    const runtime = new TransactionRuntime()
    const txn = runtime.begin()
    expect(txn.status).toBe('OPEN')
  })

  it('mutate() é shortcut para begin+add+commit', () => {
    const runtime = new TransactionRuntime()
    const result  = runtime.mutate('ALTERAR_CIRCUITO', 'c1')
    expect(result.sucesso).toBe(true)
  })

  it('history registra transações commitadas', () => {
    const runtime = new TransactionRuntime()
    runtime.mutate('MOVER_PONTO')
    runtime.mutate('ALTERAR_CIRCUITO')
    expect(runtime.history).toHaveLength(2)
  })

  it('batchMutate agrupa múltiplas mutações em 1 commit', () => {
    const runtime  = new TransactionRuntime()
    const chamados: string[] = []

    const result = batchMutate(
      runtime,
      [['MOVER_PONTO', null, 'move p1'], ['ALTERAR_CIRCUITO', 'c1']],
      { SOLVER: () => chamados.push('SOLVER') }
    )

    expect(result.sucesso).toBe(true)
    // Solver foi chamado apenas 1 vez (não 2), mesmo com 2 mutações
    expect(chamados.filter(x => x === 'SOLVER')).toHaveLength(1)
  })

  it('batchMutate: 1 commit para N mutações (eficiência)', () => {
    // O ponto central: 3 mutações → 1 execução de recompute
    const runtime  = new TransactionRuntime()
    let execucoes  = 0

    batchMutate(
      runtime,
      [['MOVER_PONTO'], ['MOVER_PONTO'], ['MOVER_PONTO']],
      { SOLVER: () => execucoes++ }
    )

    expect(execucoes).toBe(1)  // não 3!
  })
})
