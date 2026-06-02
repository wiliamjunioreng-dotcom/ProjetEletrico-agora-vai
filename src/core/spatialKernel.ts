// src/core/spatialKernel.ts
// ════════════════════════════════════════════════════════════════
// SPATIAL KERNEL — núcleo espacial soberano
//
// Risco identificado: 5 grafos espaciais sem fonte de verdade única.
//
//   WallGraph        → adjacência de paredes
//   BuildingGraph    → paredes + vértices + cômodos (multi-ambiente)
//   FaceGraph        → rede de superfícies navegáveis
//   RedeInfraestrutura → segmentos + nós contínuos
//   InfraestruturaCompartilhada → eletrodutos + caixas
//
// Sem uma fachada unificada:
//   - cada módulo reconstrói o grafo que precisa do zero
//   - sem garantia de consistência entre grafos
//   - chamador precisa saber qual grafo usar para cada query
//
// SpatialKernel é a ÚNICA interface para queries espaciais.
// Internamente usa o grafo correto — o chamador não sabe qual.
//
// Contratos:
//   - Consultas → retornam dados imutáveis
//   - Mutações → via CommandPattern (futuro)
//   - Consistência → garantida pelo Kernel, não pelo chamador
//
// Implementação atual: façade simples (não caching).
// Futuro: dirty nodes + recalculate incremental.
// ════════════════════════════════════════════════════════════════

import type { ComodoGeometria } from '../types/geometry'
import type { BuildingGraph, ParedeGlobal, VerticeGlobal, ComodoNode } from './buildingGraph'
import type { FaceGraph } from './faceGraph'
import type { WallGraph } from './wallGraph'
import { buildBuildingGraph } from './buildingGraph'
import { buildFaceGraph, caminhoFaces, facesAdjacentes } from './faceGraph'
import { buildWallGraph } from './wallGraph'

// ── Estado do Kernel ──────────────────────────────────────────────
export interface SpatialKernelState {
  readonly comodos:      ComodoGeometria[]
  readonly building:     BuildingGraph
  readonly faces:        FaceGraph
  readonly wall_graphs:  Map<string, WallGraph>   // por comodo_id
}

// ── Construir o Kernel ────────────────────────────────────────────
// Ponto de entrada único: recebe cômodos, constrói todos os grafos internamente
export function buildSpatialKernel(comodos: ComodoGeometria[]): SpatialKernelState {
  const building = buildBuildingGraph(comodos)
  const faces    = buildFaceGraph(building)

  // WallGraph por cômodo (para snapping contextual por cômodo)
  const wall_graphs = new Map<string, WallGraph>()
  for (const cg of comodos) {
    wall_graphs.set(cg.id, buildWallGraph(cg))
  }

  return { comodos, building, faces, wall_graphs }
}

// ── API de consulta ───────────────────────────────────────────────
// O chamador NÃO acessa os grafos diretamente — usa essas funções.

// Parede por ID (de qualquer cômodo)
export function queryParede(id: string, kernel: SpatialKernelState): ParedeGlobal | undefined {
  return kernel.building.paredes.get(id)
}

// Vértice por ID
export function queryVertice(id: string, kernel: SpatialKernelState): VerticeGlobal | undefined {
  return kernel.building.vertices.get(id)
}

// Cômodo por ID
export function queryComodo(id: string, kernel: SpatialKernelState): ComodoNode | undefined {
  return kernel.building.comodos.get(id)
}

// Face por ID
export function queryFace(id: string, kernel: SpatialKernelState): { id: string; parede_id: string; comodo_id?: string } | undefined {
  return kernel.faces.faces.get(id)
}

// Faces adjacentes a uma face (para routing)
export function queryFacesAdjacentes(face_id: string, kernel: SpatialKernelState): ReturnType<typeof facesAdjacentes> {
  return facesAdjacentes(face_id, kernel.faces)
}

// Caminho entre duas faces (para routing de eletroduto)
export function queryRotaFaces(
  face_inicio: string,
  face_fim: string,
  kernel: SpatialKernelState
): string[] {
  return caminhoFaces(face_inicio, face_fim, kernel.faces)
}

// Todas as faces de um cômodo
export function queryFacesDoComodo(comodo_id: string, kernel: SpatialKernelState): ReturnType<typeof facesAdjacentes> {
  return [...kernel.faces.faces.values()].filter(f => f.comodo_id === comodo_id)
}

// Paredes compartilhadas entre dois cômodos
export function queryParedesCompartilhadas(
  comodo_a: string,
  comodo_b: string,
  kernel: SpatialKernelState
): ParedeGlobal[] {
  return [...kernel.building.paredes.values()].filter(p =>
    p.comodo_ids.includes(comodo_a) && p.comodo_ids.includes(comodo_b)
  )
}

// Vizinhos de um cômodo
export function queryVizinhos(comodo_id: string, kernel: SpatialKernelState): ComodoNode[] {
  const node = kernel.building.comodos.get(comodo_id)
  if (!node) return []
  return node.vizinhos.map(id => kernel.building.comodos.get(id)!).filter(Boolean)
}

// ── Verificação de consistência ───────────────────────────────────
export interface InconsistenciaKernel {
  readonly grafo:    'building' | 'face' | 'wall'
  readonly tipo:     string
  readonly descricao: string
}

export function verificarKernel(kernel: SpatialKernelState): InconsistenciaKernel[] {
  const problemas: InconsistenciaKernel[] = []

  // Verificar que cada face do FaceGraph tem parede no BuildingGraph
  for (const [fid, face] of kernel.faces.faces) {
    if (!kernel.building.paredes.has(face.parede_id)) {
      problemas.push({
        grafo: 'face',
        tipo: 'FACE_SEM_PAREDE',
        descricao: `Face ${fid} referencia parede ${face.parede_id} que não existe no BuildingGraph`,
      })
    }
  }

  // Verificar que cada cômodo do BuildingGraph tem faces no FaceGraph
  for (const [cid] of kernel.building.comodos) {
    const faces_do_comodo = queryFacesDoComodo(cid, kernel)
    if (faces_do_comodo.length === 0) {
      problemas.push({
        grafo: 'building',
        tipo: 'COMODO_SEM_FACES',
        descricao: `Cômodo ${cid} não tem faces no FaceGraph`,
      })
    }
  }

  return problemas
}
