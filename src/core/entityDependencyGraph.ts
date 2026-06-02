// src/core/entityDependencyGraph.ts
// ════════════════════════════════════════════════════════════════
// ENTITY DEPENDENCY GRAPH — invalidação por entidade
//
// Problema do DependencyEngine atual:
//   "domínio inteiro dirty é grosseiro demais"
//   "apenas uma parede muda mas GEOMETRY inteiro fica dirty"
//
// Hoje: MOVER_PONTO → GEOMETRY dirty → rebuild de TUDO em GEOMETRY
// Futuro: MOVER_PONTO('p1') → apenas entidades que dependem de 'p1'
//
// EntityDependencyGraph rastreia dependências por entidade:
//   entity_id: 'ponto-abc123'
//   entity_type: 'ponto' | 'parede' | 'comodo' | 'circuito' | 'face'
//   dependencias: ['segmento-xyz', 'condutor-def']
//   affected_by:  ['comodo-sala', 'parede-norte']
//
// Isso permite:
//   - mover 1 ponto → invalidar apenas os segmentos daquele ponto
//   - alterar 1 circuito → invalidar apenas os condutores daquele circuito
//   - mover 1 parede → invalidar apenas as faces daquela parede
// ════════════════════════════════════════════════════════════════

// ── Tipos de entidade ─────────────────────────────────────────────
export type EntityType =
  | 'ponto'          // PontoEletrico na planta
  | 'parede'         // Parede soberana
  | 'face'           // FaceParede
  | 'comodo'         // Cômodo (geométrico ou elétrico)
  | 'circuito'       // RawCircuit / CircuitoV3
  | 'carga_manual'   // CargaManual dentro do cômodo
  | 'segmento'       // SegmentoRede
  | 'condutor'       // CondutorContinuo
  | 'grupo'          // GrupoInstalacao
  | 'eletroduto'     // EletrodutoFisico
  // ── Domínio de proteção ──────────────────────────────────────
  | 'zona_protecao'  // ZonaProtegida (DR ou disjuntor)
  | 'barramento'     // Barramento elétrico (PE, neutro, fase)
  | 'dispositivo'    // Dispositivo de proteção (disjuntor, DR, DPS)
  | 'rede_infra'     // RedeInfraestrutura (segmentos + nós)
  | 'painel'         // QuadroDistribuicao como entidade

// ── Nó de entidade ───────────────────────────────────────────────
export interface EntityNode {
  readonly entity_id:    string
  readonly entity_type:  EntityType
  // Entidades das quais esta depende (inputs)
  readonly depends_on:   readonly string[]  // entity_ids
  // Entidades que dependem desta (outputs)
  readonly affects:      readonly string[]  // entity_ids
  // Estado de invalidação
  dirty:                 boolean
  // Timestamp do último cálculo bem-sucedido
  computed_at:           number | null
}

// ── Grafo de dependências por entidade ───────────────────────────
export interface EntityDependencyGraph {
  readonly nodes: Map<string, EntityNode>
}

// ── Construir o grafo ─────────────────────────────────────────────
export function createEntityGraph(): EntityDependencyGraph {
  return { nodes: new Map() }
}

// Registrar uma entidade no grafo
export function registerEntity(
  graph:       EntityDependencyGraph,
  entity_id:   string,
  entity_type: EntityType,
  depends_on:  string[] = []
): EntityNode {
  // Criar o nó
  const node: EntityNode = {
    entity_id, entity_type, depends_on, affects: [],
    dirty: true,          // nova entidade começa dirty
    computed_at: null,
  }
  graph.nodes.set(entity_id, node)

  // Atualizar "affects" dos nós que esta entidade depende
  for (const dep_id of depends_on) {
    const dep = graph.nodes.get(dep_id)
    if (dep && !dep.affects.includes(entity_id)) {
      // affects é readonly — criar nova versão
      graph.nodes.set(dep_id, {
        ...dep,
        affects: [...dep.affects, entity_id],
      })
    }
  }

  return node
}

// ── Invalidação por entidade ──────────────────────────────────────
// Quando uma entidade muda, invalida apenas o grafo afetado por ela
export function invalidateEntity(
  graph:     EntityDependencyGraph,
  entity_id: string
): string[] {
  const afetados: string[] = []
  const visitados = new Set<string>()

  function propagar(id: string) {
    if (visitados.has(id)) return
    visitados.add(id)

    const node = graph.nodes.get(id)
    if (!node) return

    // Marcar como dirty
    graph.nodes.set(id, { ...node, dirty: true, computed_at: null })
    afetados.push(id)

    // Propagar para os que dependem desta
    for (const affected_id of node.affects) {
      propagar(affected_id)
    }
  }

  propagar(entity_id)
  return afetados
}

// ── Marcar entidade como computada ───────────────────────────────
export function markEntityComputed(graph: EntityDependencyGraph, entity_id: string): void {
  const node = graph.nodes.get(entity_id)
  if (!node) return
  graph.nodes.set(entity_id, { ...node, dirty: false, computed_at: Date.now() })
}

// ── Encontrar entidades sujas de um tipo específico ───────────────
export function dirtyEntitiesOfType(
  graph:       EntityDependencyGraph,
  entity_type: EntityType
): EntityNode[] {
  return [...graph.nodes.values()].filter(n => n.dirty && n.entity_type === entity_type)
}

// ── Ordem topológica de recompute para entidades sujas ────────────
// Garante que deps são computadas antes dos dependentes
export function entityRecomputeOrder(graph: EntityDependencyGraph): string[] {
  const dirty  = [...graph.nodes.values()].filter(n => n.dirty)
  if (dirty.length === 0) return []

  const in_degree = new Map<string, number>()
  for (const node of graph.nodes.values()) {
    in_degree.set(node.entity_id, 0)
  }
  for (const node of graph.nodes.values()) {
    for (const _dep of node.depends_on) {
      in_degree.set(node.entity_id, (in_degree.get(node.entity_id) ?? 0) + 1)
    }
  }

  const queue  = [...graph.nodes.values()]
    .filter(n => (in_degree.get(n.entity_id) ?? 0) === 0)
    .map(n => n.entity_id)
  const ordem: string[] = []

  while (queue.length > 0) {
    const id   = queue.shift()!
    const node = graph.nodes.get(id)
    if (node?.dirty) ordem.push(id)

    if (!node) continue
    for (const affected_id of node.affects) {
      const novo = (in_degree.get(affected_id) ?? 1) - 1
      in_degree.set(affected_id, novo)
      if (novo === 0) queue.push(affected_id)
    }
  }

  return ordem
}

// ── Estatísticas do grafo ─────────────────────────────────────────
export interface GraphStats {
  total:       number
  dirty:       number
  clean:       number
  por_tipo:    Record<EntityType, { total: number; dirty: number }>
}

export function graphStats(graph: EntityDependencyGraph): GraphStats {
  const total   = graph.nodes.size
  const dirty_n = [...graph.nodes.values()].filter(n => n.dirty).length
  const por_tipo: Record<string, { total: number; dirty: number }> = {}

  for (const node of graph.nodes.values()) {
    if (!por_tipo[node.entity_type]) por_tipo[node.entity_type] = { total: 0, dirty: 0 }
    por_tipo[node.entity_type].total++
    if (node.dirty) por_tipo[node.entity_type].dirty++
  }

  return {
    total, dirty: dirty_n, clean: total - dirty_n,
    por_tipo: por_tipo as Record<EntityType, { total: number; dirty: number }>,
  }
}
