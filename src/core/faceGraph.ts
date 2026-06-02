// src/core/faceGraph.ts
// ════════════════════════════════════════════════════════════════
// FACE GRAPH — Rede navegável de superfícies
//
// Problema: FaceParede existe mas é isolada.
// Para roteamento de eletroduto, precisa saber:
//   "saindo da face N pelo canto NE, qual face continua?"
//   → Face L (parede leste, mesmo cômodo)
//
// Solução: grafo de adjacência entre faces, conectadas em vértices.
//
// Conceito central:
//   Cada face tem duas "arestas" (aresta_inicio e aresta_fim).
//   Aresta = onde a face termina e outra começa.
//   No canto de um cômodo retangular:
//     Face N termina no canto NE → Face L começa ali.
//
// Isso permite:
//   - roteamento de eletroduto ao longo de superfícies contíguas
//   - dobras em cantos (F_N → canto NE → F_L)
//   - caminhos multi-face sem "voar" pelo ar
//   - navegação espacial para autoplace
//
// Referência: half-edge data structure, IFC IfcRelConnectsPathElements
// ════════════════════════════════════════════════════════════════

import type { FaceParede, ParedeGlobal, BuildingGraph } from './buildingGraph'

// ── FaceGraph ─────────────────────────────────────────────────────
export interface FaceGraph {
  // Todas as faces do edifício
  readonly faces:    Map<string, FaceParede>
  // Arestas: onde duas faces se tocam (em um vértice)
  readonly arestas:  Map<string, ArestaFace>
  // Adjacência de faces: por face_id → lista de faces adjacentes
  readonly adj:      Map<string, string[]>  // face_id → face_id[]
}

// Tipo físico de transição entre superfícies
export type TipoTransicao =
  | 'canto_interno'    // dobra 90° para dentro do cômodo (típico)
  | 'canto_externo'    // dobra 90° para fora (convexo)
  | 'parede_plana'     // mesma parede, sem dobra (segmentos lineares)
  | 'compartilhada'    // parede entre dois cômodos
  | 'abertura'         // porta ou janela (pode ser bloqueada)

// Aresta entre duas faces — com semântica de transição física
// Determina se e como o eletroduto pode passar entre superfícies
export interface ArestaFace {
  readonly id:           string
  readonly vertice_id:   string         // vértice onde as faces se tocam
  readonly face_a:       string
  readonly face_b:       string

  // ── Geometria ─────────────────────────────────────────────────
  readonly tipo:         TipoTransicao
  readonly angulo_graus: number         // ângulo entre as paredes (90 = canto normal)

  // ── Semântica de transição para roteamento ─────────────────────
  // Pode o eletroduto dobrar aqui?
  readonly permite_eletroduto: boolean

  // Penalidade de roteamento (0 = livre, 1 = proibido)
  // Usada em Dijkstra/A* para preferir caminhos mais eficientes
  // Exemplo: canto_externo = penalidade 0.5 (curva mais difícil)
  //          abertura      = penalidade 0.8 (evitar cruzar porta)
  readonly penalidade: number          // 0.0 - 1.0

  // Tipo de curva necessária para fazer esta transição
  readonly curva_necessaria: 'joelho_90' | 'joelho_45' | 'curva_suave' | 'nenhuma' | 'impossivel'
}

// ── Construir FaceGraph a partir do BuildingGraph ─────────────────
export function buildFaceGraph(building: BuildingGraph): FaceGraph {
  const faces  = new Map<string, FaceParede>()
  const arestas = new Map<string, ArestaFace>()
  const adj    = new Map<string, string[]>()

  // Coletar todas as faces
  for (const [, parede] of building.paredes) {
    for (const face of parede.faces) {
      faces.set(face.id, face)
      adj.set(face.id, [])
    }
  }

  // Construir adjacências: faces que compartilham um vértice E mesmo cômodo
  // são adjacentes (o eletroduto pode dobrar entre elas)

  // Índice: vertice_id → parede_ids que chegam neste vértice
  const vertice_para_paredes = new Map<string, string[]>()
  for (const [, v] of building.vertices) {
    vertice_para_paredes.set(v.id, [...v.parede_ids])
  }

  // Para cada vértice, encontrar pares de faces do mesmo cômodo
  for (const [vid, v] of building.vertices) {
    const parede_ids_no_vertice = v.parede_ids

    // Para cada par de paredes que chegam neste vértice
    for (let i = 0; i < parede_ids_no_vertice.length; i++) {
      for (let j = i + 1; j < parede_ids_no_vertice.length; j++) {
        const pid_a = parede_ids_no_vertice[i]
        const pid_b = parede_ids_no_vertice[j]
        const pa = building.paredes.get(pid_a)
        const pb = building.paredes.get(pid_b)
        if (!pa || !pb) continue

        // Encontrar pares de faces do MESMO cômodo entre as duas paredes
        for (const fa of pa.faces) {
          for (const fb of pb.faces) {
            if (fa.comodo_id !== fb.comodo_id) continue  // lados diferentes
            if (fa.id === fb.id) continue

            // Calcular ângulo entre as paredes
            const angulo = calcularAngulo(pa, pb, building)

            // Criar aresta de adjacência
            const aresta_id = [fa.id, fb.id, vid].sort().join(':')
            if (!arestas.has(aresta_id)) {
              // Determinar semântica da transição
              const eh_canto = angulo <= 90
              const tipo_transicao: TipoTransicao = angulo <= 90 ? 'canto_interno'
                : angulo <= 135 ? 'canto_externo' : 'parede_plana'
              const penalidade = tipo_transicao === 'canto_interno'  ? 0.1
                               : tipo_transicao === 'canto_externo'  ? 0.4
                               : 0.0   // parede plana: sem penalidade

              const aresta: ArestaFace = {
                id:                  aresta_id,
                vertice_id:          vid,
                face_a:              fa.id,
                face_b:              fb.id,
                tipo:                tipo_transicao,
                angulo_graus:        angulo,
                permite_eletroduto:  true,  // abertura será modelada futuramente como ArestaFace especial
                penalidade,
                curva_necessaria:    eh_canto ? 'joelho_90' : 'nenhuma',
              }
              arestas.set(aresta_id, aresta)

              // Adicionar adjacência bidirecional
              adj.get(fa.id)!.push(fb.id)
              adj.get(fb.id)!.push(fa.id)
            }
          }
        }
      }
    }
  }

  return { faces, arestas, adj }
}

// ── Navegar faces ─────────────────────────────────────────────────
// Dado uma face, retornar as faces adjacentes (nas quais o eletroduto pode dobrar)
export function facesAdjacentes(face_id: string, graph: FaceGraph): FaceParede[] {
  const adj_ids = graph.adj.get(face_id) ?? []
  return adj_ids.map(id => graph.faces.get(id)).filter((f): f is FaceParede => f != null)
}

// ── Caminho entre duas faces ──────────────────────────────────────
// BFS para encontrar sequência de faces do ponto A ao ponto B
// Permite: "traçar eletroduto da tomada X até o QD Y"
export function caminhoFaces(
  face_inicio_id: string,
  face_fim_id:    string,
  graph:          FaceGraph,
  max_passos = 30
): string[] {
  if (face_inicio_id === face_fim_id) return [face_inicio_id]

  const visitados = new Set<string>()
  const fila: { id: string; caminho: string[] }[] = [
    { id: face_inicio_id, caminho: [face_inicio_id] }
  ]

  while (fila.length > 0) {
    const { id, caminho } = fila.shift()!
    if (caminho.length > max_passos) continue
    if (visitados.has(id)) continue
    visitados.add(id)

    const adj_ids = graph.adj.get(id) ?? []
    for (const adj_id of adj_ids) {
      if (adj_id === face_fim_id) return [...caminho, adj_id]
      if (!visitados.has(adj_id)) {
        fila.push({ id: adj_id, caminho: [...caminho, adj_id] })
      }
    }
  }

  return []  // sem caminho
}

// ── Faces de um cômodo ────────────────────────────────────────────
export function facesDoComodo(comodo_id: string, graph: FaceGraph): FaceParede[] {
  return [...graph.faces.values()].filter(f => f.comodo_id === comodo_id)
}

// ── Calcular ângulo entre duas paredes ────────────────────────────
// Útil para classificar canto como interno (90°) ou externo (270°)
function calcularAngulo(pa: ParedeGlobal, pb: ParedeGlobal, _building: BuildingGraph): number {
  // Vetor da parede A (início → fim)
  const ax = pa.fim.x - pa.inicio.x
  const ay = pa.fim.y - pa.inicio.y
  // Vetor da parede B (início → fim)
  const bx = pb.fim.x - pb.inicio.x
  const by = pb.fim.y - pb.inicio.y

  const len_a = Math.sqrt(ax * ax + ay * ay)
  const len_b = Math.sqrt(bx * bx + by * by)
  if (len_a < 0.001 || len_b < 0.001) return 90

  // Ângulo entre os vetores
  const cos = (ax * bx + ay * by) / (len_a * len_b)
  const angulo_rad = Math.acos(Math.max(-1, Math.min(1, cos)))
  const angulo_deg = angulo_rad * 180 / Math.PI

  // Canto interno de um cômodo retangular = 90°
  return Math.round(angulo_deg)
}

// ── Verificar FaceGraph ───────────────────────────────────────────
export interface InconsistenciaFaceGraph {
  tipo:      'face_sem_adj' | 'aresta_invalida'
  id:        string
  descricao: string
}

export function verificarFaceGraph(graph: FaceGraph): InconsistenciaFaceGraph[] {
  const problemas: InconsistenciaFaceGraph[] = []

  for (const [fid] of graph.faces) {
    const adj_ids = graph.adj.get(fid) ?? []
    // Faces que pertencem a um cômodo (não exterior) devem ter pelo menos 2 adjacências
    // (num retângulo: cada face tem 2 cantos)
    const face = graph.faces.get(fid)!
    if (face.comodo_id && adj_ids.length < 2) {
      problemas.push({
        tipo: 'face_sem_adj',
        id: fid,
        descricao: `Face ${fid} do cômodo ${face.comodo_id} tem apenas ${adj_ids.length} adjacência(s) (esperado ≥ 2)`,
      })
    }
  }

  for (const [aid, aresta] of graph.arestas) {
    if (!graph.faces.has(aresta.face_a) || !graph.faces.has(aresta.face_b)) {
      problemas.push({
        tipo: 'aresta_invalida',
        id: aid,
        descricao: `Aresta ${aid} referencia face inexistente`,
      })
    }
  }

  return problemas
}
