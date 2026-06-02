// src/core/wallGraph.ts
// ════════════════════════════════════════════════════════════════
// WALL GRAPH — Topologia de paredes
//
// Problema: paredes isoladas não sabem quem as conecta.
// Solução: grafo de adjacência onde vértices persistem
//   independente da geometria.
//
// Isso permite:
//   - roteamento de eletroduto ao longo de paredes contíguas
//   - snapping inteligente em cantos
//   - constraints de continuidade (eletroduto não pode "voar" entre paredes)
//   - propagação de informações elétricas pela topologia
//
// Referência: CGAL HalfEdge, IFC IfcRelConnectsPathElements
// ════════════════════════════════════════════════════════════════

import type { Parede, VerticeParede, ComodoGeometria } from '../types/geometry'
import type { WorldPoint } from './coords'

// ── WallGraph ─────────────────────────────────────────────────────
export interface WallGraph {
  readonly paredes:   Map<string, Parede>          // id → Parede
  readonly vertices:  Map<string, VerticeParede>   // id → VerticeParede
}

// ── Construir WallGraph de um cômodo ─────────────────────────────
// Para um retângulo: 4 paredes, 4 vértices, cada vértice conecta 2 paredes
export function buildWallGraph(cg: ComodoGeometria): WallGraph {
  const paredes  = new Map<string, Parede>()
  const vertices = new Map<string, VerticeParede>()

  // Carregar paredes — já têm vertice_ids e adjacências declaradas
  for (const p of cg.paredes) {
    paredes.set(p.id, p)
  }

  // Construir VerticeParede a partir dos IDs declarados nas paredes
  // Se parede já tem vertice_inicio_id/vertice_fim_id → usar esses IDs
  // Caso contrário → derivar da geometria (compatibilidade)
  const TOLERANCIA_M = 0.01

  function registrarVertice(id: string | undefined, pos: { x: number; y: number }, parede_id: string): string {
    // Se ID foi declarado explicitamente, usar ele
    if (id) {
      const existente = vertices.get(id)
      if (existente) {
        const ids = existente.parede_ids.includes(parede_id)
          ? existente.parede_ids
          : [...existente.parede_ids, parede_id]
        vertices.set(id, { ...existente, parede_ids: ids })
      } else {
        vertices.set(id, { id, pos, parede_ids: [parede_id] })
      }
      return id
    }
    // Fallback geométrico: agrupar por posição
    for (const [vid, v] of vertices) {
      if (Math.abs(v.pos.x - pos.x) < TOLERANCIA_M && Math.abs(v.pos.y - pos.y) < TOLERANCIA_M) {
        const ids = v.parede_ids.includes(parede_id) ? v.parede_ids : [...v.parede_ids, parede_id]
        vertices.set(vid, { ...v, parede_ids: ids })
        return vid
      }
    }
    const vid = crypto.randomUUID()
    vertices.set(vid, { id: vid, pos, parede_ids: [parede_id] })
    return vid
  }

  for (const p of cg.paredes) {
    registrarVertice(p.vertice_inicio_id, p.inicio, p.id)
    registrarVertice(p.vertice_fim_id,    p.fim,    p.id)
  }

  return { paredes, vertices }
}

// ── Navegar continuidade ──────────────────────────────────────────
// Dado uma parede e uma direção, encontrar a próxima parede conectada
export function proximaParede(
  parede_id:  string,
  extremo:    'inicio' | 'fim',
  graph:      WallGraph
): Parede | null {
  const parede = graph.paredes.get(parede_id)
  if (!parede) return null

  // Usar adjacências já declaradas — O(1), sem precisar do grafo de vértices
  const adj_ids = extremo === 'inicio' ? parede.adjacencias_inicio : parede.adjacencias_fim
  if (adj_ids.length === 0) return null

  // Retornar a primeira adjacente (sem lógica de curvatura por ora)
  return graph.paredes.get(adj_ids[0]) ?? null
}

// ── Caminho ao longo de paredes ───────────────────────────────────
// Encontrar sequência de paredes que formam um percurso contíguo
// Útil para roteamento de eletroduto
export function caminhoParedes(
  parede_inicio_id: string,
  parede_fim_id:    string,
  graph:            WallGraph,
  max_passos = 20
): string[] {
  // BFS simples no grafo de paredes
  const visitados = new Set<string>()
  const fila: { id: string; caminho: string[] }[] = [{ id: parede_inicio_id, caminho: [parede_inicio_id] }]

  while (fila.length > 0 && fila[0].caminho.length <= max_passos) {
    const { id, caminho } = fila.shift()!
    if (id === parede_fim_id) return caminho
    if (visitados.has(id)) continue
    visitados.add(id)

    const parede = graph.paredes.get(id)
    if (!parede) continue

    const adjacentes = [...parede.adjacencias_inicio, ...parede.adjacencias_fim]
    for (const adj_id of adjacentes) {
      if (!visitados.has(adj_id)) {
        fila.push({ id: adj_id, caminho: [...caminho, adj_id] })
      }
    }
  }

  return []  // sem caminho encontrado
}

// ── Encontrar parede por posição ─────────────────────────────────
// Dado um WorldPoint, encontrar a parede mais próxima no grafo
export function paredeMaisProxima(
  ponto:   WorldPoint,
  graph:   WallGraph,
  threshold_m = 0.50
): { parede: Parede; distancia_m: number } | null {
  let melhor: { parede: Parede; distancia_m: number } | null = null

  for (const [, parede] of graph.paredes) {
    const { inicio, fim } = parede
    const dx = fim.x - inicio.x
    const dy = fim.y - inicio.y
    const len2 = dx * dx + dy * dy
    if (len2 < 0.0001) continue

    const t = Math.max(0, Math.min(1,
      ((ponto.x_m - inicio.x) * dx + (ponto.y_m - inicio.y) * dy) / len2
    ))
    const proj_x = inicio.x + t * dx
    const proj_y = inicio.y + t * dy
    const dist = Math.sqrt((ponto.x_m - proj_x)**2 + (ponto.y_m - proj_y)**2)

    if (dist < threshold_m && (!melhor || dist < melhor.distancia_m)) {
      melhor = { parede, distancia_m: dist }
    }
  }

  return melhor
}

// ── Verificar consistência do grafo ──────────────────────────────
export interface InconsistenciaWallGraph {
  tipo:      'parede_sem_vertice' | 'vertice_sem_parede' | 'adjacencia_invalida'
  id:        string
  descricao: string
}

export function verificarGrafo(graph: WallGraph): InconsistenciaWallGraph[] {
  const problemas: InconsistenciaWallGraph[] = []

  for (const [pid, parede] of graph.paredes) {
    if (!parede.vertice_inicio_id || !graph.vertices.has(parede.vertice_inicio_id)) {
      problemas.push({ tipo: 'parede_sem_vertice', id: pid, descricao: `Parede ${pid} sem vértice de início` })
    }
    if (!parede.vertice_fim_id || !graph.vertices.has(parede.vertice_fim_id)) {
      problemas.push({ tipo: 'parede_sem_vertice', id: pid, descricao: `Parede ${pid} sem vértice de fim` })
    }
    for (const adj_id of [...parede.adjacencias_inicio, ...parede.adjacencias_fim]) {
      if (!graph.paredes.has(adj_id)) {
        problemas.push({ tipo: 'adjacencia_invalida', id: pid, descricao: `Adjacência ${adj_id} não existe no grafo` })
      }
    }
  }

  for (const [vid, vertice] of graph.vertices) {
    for (const pid of vertice.parede_ids) {
      if (!graph.paredes.has(pid)) {
        problemas.push({ tipo: 'vertice_sem_parede', id: vid, descricao: `Vértice ${vid} referencia parede ${pid} inexistente` })
      }
    }
  }

  return problemas
}
