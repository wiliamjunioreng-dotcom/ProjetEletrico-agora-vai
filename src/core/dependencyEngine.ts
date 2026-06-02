// src/core/dependencyEngine.ts
// ════════════════════════════════════════════════════════════════
// DEPENDENCY ENGINE — continuidade computacional incremental
//
// Problema: "tudo depende de tudo, rebuild global vai morrer".
//
// Hoje, mover um ponto na planta desencadeia:
//   1. pos_parametrica → recalcula
//   2. segmentoFisico  → comprimento muda
//   3. infraestrutura  → ocupação muda
//   4. rede            → segmentos mudam
//   5. condutor        → comprimento_m muda
//   6. solver          → queda de tensão muda
//   7. QD              → materiais mudam
//   8. UI              → re-renderiza
//
// Sem dependency tracking: rebuild total a cada mutação.
// Com dependency tracking: invalidar só o que mudou.
//
// OWNERSHIP (rígido — não negociável):
//   Circuito       → intenção elétrica (tipo, carga, fase)
//   Condutor       → materialização física (cabo contínuo)
//   Infraestrutura → suporte físico (eletroduto, caixa)
//   Solver         → cálculo (Iz, dU, proteção)
//   Kernel         → continuidade espacial (topologia)
//   DependencyEngine → continuidade computacional (invalidação)
//
// Implementação atual: DAG simples com dirty-flag.
// Futuro: topological sort + lazy recompute + transactions.
// ════════════════════════════════════════════════════════════════

// ── Nós de dependência ────────────────────────────────────────────
// Cada domínio é um nó no grafo de dependências
export type DomainNodeId =
  | 'GEOMETRY'        // posição de pontos, paredes, cômodos
  | 'SPATIAL'         // BuildingGraph, FaceGraph, WallGraph (derivado de GEOMETRY)
  | 'CONSTRAINTS'     // snap, validações (derivado de SPATIAL)
  | 'SEGMENTS'        // SegmentoFisico, comprimentos (derivado de SPATIAL + GEOMETRY)
  | 'INFRASTRUCTURE'  // InfraestruturaCompartilhada (derivado de SEGMENTS)
  | 'NETWORK'         // RedeInfraestrutura (derivado de INFRASTRUCTURE)
  | 'CONDUCTORS'      // CondutorContinuo (derivado de NETWORK + SEGMENTS)
  | 'SOLVER'          // pipeline NBR 5410 (derivado de CONDUCTORS)
  | 'QUANTITATIVOS'   // materiais, quantidades (derivado de SOLVER + CONDUCTORS)
  | 'UI'              // renderização (derivado de tudo)

// Grafo de dependências (DAG — directed acyclic graph)
// A → B significa: A é dependência de B (B depende de A)
export const DEPENDENCY_GRAPH: Record<DomainNodeId, DomainNodeId[]> = {
  // Fontes (sem dependências)
  GEOMETRY:       [],
  // Derivados de geometry
  SPATIAL:        ['GEOMETRY'],
  CONSTRAINTS:    ['SPATIAL'],
  SEGMENTS:       ['SPATIAL', 'GEOMETRY'],
  // Derivados de segments
  INFRASTRUCTURE: ['SEGMENTS'],
  NETWORK:        ['INFRASTRUCTURE'],
  CONDUCTORS:     ['NETWORK', 'SEGMENTS'],
  // Derivados de condutores
  SOLVER:         ['CONDUCTORS', 'GEOMETRY'],
  QUANTITATIVOS:  ['SOLVER', 'CONDUCTORS'],
  // Renderização depende de tudo
  UI:             ['GEOMETRY', 'SPATIAL', 'SOLVER', 'QUANTITATIVOS'],
}

// ── Estado de invalidação ─────────────────────────────────────────
export interface DependencyState {
  // Quais nós estão sujos (precisam ser recalculados)
  dirty: Set<DomainNodeId>
  // Timestamp da última computação de cada nó
  computed_at: Map<DomainNodeId, number>
  // Payload opcional (resultado do último cálculo)
  payload: Map<DomainNodeId, unknown>
}

export function createDependencyState(): DependencyState {
  return {
    dirty:       new Set<DomainNodeId>(),
    computed_at: new Map(),
    payload:     new Map(),
  }
}

// ── Invalidação em cascata ────────────────────────────────────────
// Quando um nó é invalidado, todos os nós que dependem dele também são
export function invalidate(
  node: DomainNodeId,
  state: DependencyState
): DomainNodeId[] {
  const afetados: DomainNodeId[] = []
  const visitados = new Set<DomainNodeId>()

  function propagarInvalidacao(n: DomainNodeId) {
    if (visitados.has(n)) return
    visitados.add(n)
    state.dirty.add(n)
    afetados.push(n)

    // Encontrar nós que dependem de n (dependentes transitivos)
    for (const [candidato, deps] of Object.entries(DEPENDENCY_GRAPH) as [DomainNodeId, DomainNodeId[]][]) {
      if (deps.includes(n)) {
        propagarInvalidacao(candidato)
      }
    }
  }

  propagarInvalidacao(node)
  return afetados
}

// ── Marcar nó como computado ──────────────────────────────────────
export function markComputed(
  node:    DomainNodeId,
  state:   DependencyState,
  payload?: unknown
): void {
  state.dirty.delete(node)
  state.computed_at.set(node, Date.now())
  if (payload !== undefined) state.payload.set(node, payload)
}

// ── Verificar se um nó precisa recalcular ─────────────────────────
export function needsRecompute(node: DomainNodeId, state: DependencyState): boolean {
  return state.dirty.has(node)
}

// ── Ordem topológica de recálculo ────────────────────────────────
// Retorna a ordem em que os nós sujos devem ser recalculados
// para respeitar as dependências (deps antes de dependentes)
export function recomputeOrder(state: DependencyState): DomainNodeId[] {
  const sujos  = [...state.dirty]
  if (sujos.length === 0) return []

  // Ordenação topológica (Kahn's algorithm)
  const in_degree = new Map<DomainNodeId, number>()
  const all_nodes = Object.keys(DEPENDENCY_GRAPH) as DomainNodeId[]

  for (const n of all_nodes) in_degree.set(n, 0)
  for (const [node, deps] of Object.entries(DEPENDENCY_GRAPH) as [DomainNodeId, DomainNodeId[]][]) {
    for (const _dep of deps) {
      in_degree.set(node, (in_degree.get(node) ?? 0) + 1)
    }
  }

  const queue = all_nodes.filter(n => (in_degree.get(n) ?? 0) === 0)
  const ordem: DomainNodeId[] = []

  while (queue.length > 0) {
    const n = queue.shift()!
    if (state.dirty.has(n)) ordem.push(n)

    for (const [candidato, deps] of Object.entries(DEPENDENCY_GRAPH) as [DomainNodeId, DomainNodeId[]][]) {
      if (deps.includes(n)) {
        const novo = (in_degree.get(candidato) ?? 1) - 1
        in_degree.set(candidato, novo)
        if (novo === 0) queue.push(candidato)
      }
    }
  }

  return ordem
}

// ── Grafo de mutações conhecidas ──────────────────────────────────
// Mapeamento: "que tipo de mutação invalida quais domínios"
export type TipoMutacao =
  | 'MOVER_PONTO'          // ponto elétrico moveu
  | 'ADICIONAR_PONTO'      // novo ponto adicionado
  | 'REMOVER_PONTO'        // ponto removido
  | 'MOVER_COMODO'         // cômodo moveu
  | 'REDIMENSIONAR_COMODO' // cômodo redimensionado
  | 'ALTERAR_CIRCUITO'     // tipo/fase/carga de circuito mudou
  | 'ASSOCIAR_CIRCUITO'    // ponto associado a circuito
  | 'ALTERAR_SECAO'        // seção de cabo recalculada
  | 'REBUILD_TOTAL'        // recalcular tudo

export const MUTACAO_INVALIDA: Record<TipoMutacao, DomainNodeId[]> = {
  MOVER_PONTO:          ['GEOMETRY'],
  ADICIONAR_PONTO:      ['GEOMETRY'],
  REMOVER_PONTO:        ['GEOMETRY'],
  MOVER_COMODO:         ['GEOMETRY'],
  REDIMENSIONAR_COMODO: ['GEOMETRY'],
  ALTERAR_CIRCUITO:     ['SOLVER'],  // geometria não muda, só o cálculo
  ASSOCIAR_CIRCUITO:    ['SEGMENTS', 'CONDUCTORS'],
  ALTERAR_SECAO:        ['CONDUCTORS'],
  REBUILD_TOTAL:        ['GEOMETRY'],  // invalida tudo em cascata
}

// ── Aplicar mutação ───────────────────────────────────────────────
// Retorna lista de domínios afetados em ordem de recálculo
export function applyMutation(
  mutacao: TipoMutacao,
  state:   DependencyState
): DomainNodeId[] {
  const raizes = MUTACAO_INVALIDA[mutacao]
  const afetados = new Set<DomainNodeId>()

  for (const raiz of raizes) {
    for (const n of invalidate(raiz, state)) {
      afetados.add(n)
    }
  }

  return recomputeOrder(state)
}

// ── Visualizar estado do grafo ────────────────────────────────────
export function statusGrafo(state: DependencyState): {
  node:       DomainNodeId
  dirty:      boolean
  computed_at: string | null
}[] {
  const all = Object.keys(DEPENDENCY_GRAPH) as DomainNodeId[]
  return all.map(node => ({
    node,
    dirty: state.dirty.has(node),
    computed_at: state.computed_at.has(node)
      ? new Date(state.computed_at.get(node)!).toISOString()
      : null,
  }))
}
