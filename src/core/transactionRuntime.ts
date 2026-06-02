// src/core/transactionRuntime.ts
// ════════════════════════════════════════════════════════════════
// TRANSACTIONAL INCREMENTAL RUNTIME
//
// Problema identificado:
//   Mover parede → 4 chamadas a recalcular() → 4 rebuilds completos.
//   "múltiplas mutações precisam ser agrupadas; invalidação
//    precisa ser controlada; recompute parcial precisa ser atômico."
//
// Solução:
//   Transaction agrupa mutações; aplica invalidação UMA vez; executa
//   recompute na ordem topológica correta; suporta rollback.
//
// Garantias:
//   1. ATOMICIDADE: todas as mutações da transação ou nenhuma
//   2. ORDEM: domínios recalculados em sequência topológica
//   3. MÍNIMO: só o que ficou dirty é recalculado
//   4. ISOLAMENTO: estado intermediário inválido não vaza
//
// Implementação atual: síncrona + in-memory snapshot para rollback.
// Futuro: assíncrona + worker thread para solver pesado.
// ════════════════════════════════════════════════════════════════

import {
  createDependencyState, applyMutation, recomputeOrder,
  markComputed,
} from './dependencyEngine'
import type { DependencyState, DomainNodeId, TipoMutacao } from './dependencyEngine'

// ── Registro de uma mutação ────────────────────────────────────────
export interface MutacaoRegistrada {
  readonly tipo:      TipoMutacao
  readonly payload:   unknown       // dados da mutação (ids, coordenadas, etc.)
  readonly timestamp: number
  readonly descricao: string        // para auditoria e debug
}

// ── Plano de recompute ────────────────────────────────────────────
// O que será recalculado após commit, em qual ordem
export interface RecomputePlan {
  readonly ordem:    DomainNodeId[]
  readonly n_dirty:  number
  readonly estimado_ms: number   // estimativa de tempo (heurística)
}

// ── Status da transação ───────────────────────────────────────────
export type TransactionStatus = 'OPEN' | 'COMMITTED' | 'ROLLED_BACK'

// ── Resultado do commit ───────────────────────────────────────────
export interface CommitResult {
  readonly sucesso:        boolean
  readonly nos_recalculados: DomainNodeId[]
  readonly tempo_ms:       number
  readonly erro?:          string
}

// ── Transaction ───────────────────────────────────────────────────
export class Transaction {
  private _mutacoes:     MutacaoRegistrada[] = []
  private _status:       TransactionStatus   = 'OPEN'
  private _dep_state:    DependencyState
  private _snapshot:     DependencyState   // para rollback

  constructor(dep_state: DependencyState) {
    this._dep_state = dep_state
    // Snapshot imutável do estado antes da transação
    this._snapshot = {
      dirty:       new Set(dep_state.dirty),
      computed_at: new Map(dep_state.computed_at),
      payload:     new Map(dep_state.payload),
    }
  }

  get status(): TransactionStatus { return this._status }
  get mutacoes(): readonly MutacaoRegistrada[] { return this._mutacoes }

  // ── Adicionar mutação ──────────────────────────────────────────
  // Não executa nada ainda — apenas registra a intenção
  add(tipo: TipoMutacao, payload: unknown = null, descricao = ''): this {
    if (this._status !== 'OPEN') {
      throw new Error(`Transação está ${this._status} — não pode adicionar mutações`)
    }
    this._mutacoes.push({
      tipo, payload,
      timestamp: Date.now(),
      descricao: descricao || tipo,
    })
    return this  // fluent API
  }

  // ── Plano de recompute (sem executar) ─────────────────────────
  // Permite visualizar o que será recalculado antes do commit
  plan(): RecomputePlan {
    if (this._mutacoes.length === 0) return { ordem: [], n_dirty: 0, estimado_ms: 0 }

    const estado_simulado = createDependencyState()
    // Copiar dirty atual
    for (const n of this._dep_state.dirty) estado_simulado.dirty.add(n)

    // Simular as mutações
    for (const m of this._mutacoes) {
      applyMutation(m.tipo, estado_simulado)
    }

    const ordem = recomputeOrder(estado_simulado)

    // Heurística de tempo: cada domínio tem custo estimado em ms
    const CUSTO_MS: Record<DomainNodeId, number> = {
      GEOMETRY:       1,   // trivial: posições
      SPATIAL:        5,   // médio: reconstruir grafos
      CONSTRAINTS:    2,   // leve: validar snaps
      SEGMENTS:       5,   // médio: comprimentos por face
      INFRASTRUCTURE: 8,   // médio: ocupação por face
      NETWORK:        10,  // médio-pesado: grafo de segmentos
      CONDUCTORS:     5,   // médio: condutores por circuito
      SOLVER:         15,  // pesado: pipeline NBR 5410 completo
      QUANTITATIVOS:  3,   // leve: somas e agregações
      UI:             20,  // pesado: re-render React
    }
    const estimado = ordem.reduce((s, n) => s + (CUSTO_MS[n] ?? 5), 0)

    return { ordem, n_dirty: estado_simulado.dirty.size, estimado_ms: estimado }
  }

  // ── Commit ────────────────────────────────────────────────────
  // Aplica todas as mutações, calcula invalidações, retorna plano de recompute
  commit(
    executor?: Partial<Record<DomainNodeId, () => void>>
  ): CommitResult {
    if (this._status !== 'OPEN') {
      return { sucesso: false, nos_recalculados: [], tempo_ms: 0,
        erro: `Transação está ${this._status}` }
    }

    const t_inicio = Date.now()
    const nos_exec: DomainNodeId[] = []

    try {
      // 1. Aplicar todas as mutações ao dependency state real
      for (const m of this._mutacoes) {
        applyMutation(m.tipo, this._dep_state)
      }

      // 2. Calcular ordem de recompute
      const ordem = recomputeOrder(this._dep_state)

      // 3. Executar recomputes na ordem topológica (se executor fornecido)
      for (const no of ordem) {
        const fn = executor?.[no]
        if (fn) {
          fn()
          nos_exec.push(no)
        }
        markComputed(no, this._dep_state)
      }

      this._status = 'COMMITTED'
      return {
        sucesso:            true,
        nos_recalculados:   nos_exec,
        tempo_ms:           Date.now() - t_inicio,
      }
    } catch (err) {
      // Em caso de erro: rollback automático
      this.rollback()
      return {
        sucesso: false, nos_recalculados: [], tempo_ms: Date.now() - t_inicio,
        erro: String(err),
      }
    }
  }

  // ── Rollback ──────────────────────────────────────────────────
  // Restaura o estado de dependência ao snapshot anterior ao início da transação
  rollback(): void {
    if (this._status === 'COMMITTED') return  // não pode reverter o já commitado

    // Restaurar snapshot
    this._dep_state.dirty.clear()
    for (const n of this._snapshot.dirty) this._dep_state.dirty.add(n)
    this._dep_state.computed_at.clear()
    for (const [k, v] of this._snapshot.computed_at) this._dep_state.computed_at.set(k, v)
    this._dep_state.payload.clear()
    for (const [k, v] of this._snapshot.payload) this._dep_state.payload.set(k, v)

    this._mutacoes   = []
    this._status     = 'ROLLED_BACK'
  }
}

// ── TransactionRuntime ────────────────────────────────────────────
// Singleton que gerencia o estado de dependência e cria transações
export class TransactionRuntime {
  private _dep_state = createDependencyState()
  private _history:   { txn: Transaction; ts: number }[] = []

  // Começar uma nova transação
  begin(): Transaction {
    const txn = new Transaction(this._dep_state)
    this._history.push({ txn, ts: Date.now() })
    return txn
  }

  // Executar uma única mutação atômica (shortcut para commit imediato)
  mutate(
    tipo:       TipoMutacao,
    payload:    unknown = null,
    executor?:  Partial<Record<DomainNodeId, () => void>>
  ): CommitResult {
    const txn = this.begin()
    txn.add(tipo, payload, tipo)
    return txn.commit(executor)
  }

  // Estado atual de dependência
  get state(): DependencyState { return this._dep_state }

  // Histórico de transações (para auditoria e debug)
  get history() { return [...this._history] }

  // Limpar histórico (para testes)
  clearHistory() { this._history = [] }
}

// ── Instância global do runtime (para uso nos stores) ────────────
export const globalRuntime = new TransactionRuntime()

// ── Helper: agrupar múltiplas mutações em uma transação ──────────
// Uso: batchMutate(runtime, [['MOVER_PONTO', p], ['ALTERAR_CIRCUITO', c]])
export function batchMutate(
  runtime:   TransactionRuntime,
  mutacoes:  [TipoMutacao, unknown?, string?][],
  executor?: Partial<Record<DomainNodeId, () => void>>
): CommitResult {
  const txn = runtime.begin()
  for (const [tipo, payload, desc] of mutacoes) {
    txn.add(tipo, payload ?? null, desc ?? tipo)
  }
  return txn.commit(executor)
}
