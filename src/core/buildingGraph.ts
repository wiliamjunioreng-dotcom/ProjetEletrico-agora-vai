// src/core/buildingGraph.ts
// ════════════════════════════════════════════════════════════════
// BUILDING GRAPH — Topologia espacial global do edifício
//
// Problema: WallGraph por cômodo é isolado.
// Duas salas vizinhas compartilham a mesma parede física —
// mas hoje criariam duas paredes independentes com IDs diferentes.
//
// Solução: grafo único do edifício que:
//   - detecta paredes compartilhadas (por coincidência geométrica)
//   - unifica vértices comuns entre cômodos adjacentes
//   - mantém ownership (quais cômodos usam qual parede)
//   - fornece navegação inter-cômodo (para roteamento de eletroduto)
//
// Referência: IFC IfcRelSpaceBoundary, CGAL arrangements
//
// Invariante fundamental:
//   "Topologia não depende da geometria instantânea"
//   (UUID de parede/vértice persiste mesmo quando geometria muda)
// ════════════════════════════════════════════════════════════════

import type { Parede, VerticeParede, ComodoGeometria } from '../types/geometry'
// WorldPoint reservado para uso futuro (paredeMaisProxima, roteamento)

// ── Face de Parede ────────────────────────────────────────────────
// Uma parede física tem duas faces: esquerda e direita (relativo ao eixo início→fim).
// Cada face pertence a um cômodo diferente (ou ao exterior).
// Pontos elétricos instalados na parede pertencem a uma face específica.
//
// Por que isso importa:
//   - Tomada do lado A (face A) ≠ tomada do lado B (face B)
//   - offset_perp positivo = face esquerda, negativo = face direita
//   - Eletrodutos percorrem a face, não a parede inteira
//   - Alturas podem diferir entre faces (ex: bancada de cozinha vs sala)
//
// Convenção de offset_perp (relativo ao eixo início→fim):
//   offset_perp > 0 → face esquerda (normal aponta para a esquerda do eixo)
//   offset_perp < 0 → face direita  (normal aponta para a direita do eixo)
//   offset_perp = 0 → eixo da parede (interruptor flush, passagem)

export type LadoFace = 'esquerda' | 'direita' | 'eixo'

export interface FaceParede {
  readonly id:         string      // UUID da face (persistente)
  readonly parede_id:  string      // parede à qual pertence
  readonly lado:       LadoFace    // qual lado físico
  readonly comodo_id?: string      // cômodo que "vê" esta face (null = exterior)
  // Pontos elétricos instalados nesta face (por IDs)
  readonly ponto_ids:  readonly string[]
  // Offset padrão para pontos nesta face (em metros)
  // Positivo para esquerda, negativo para direita
  readonly offset_m:   number      // ex: +0.075 (metade da espessura para dentro)
}

// Determinar o lado de uma face a partir do offset_perp
export function ladoDoOffset(offset_perp: number): LadoFace {
  if (offset_perp > 0.001) return 'esquerda'
  if (offset_perp < -0.001) return 'direita'
  return 'eixo'
}

// Calcular o offset padrão para uma face dado o lado e espessura
export function offsetPadrao(lado: LadoFace, espessura_m: number): number {
  if (lado === 'esquerda') return  espessura_m / 2
  if (lado === 'direita')  return -espessura_m / 2
  return 0
}

// ── BuildingGraph ─────────────────────────────────────────────────
export interface BuildingGraph {
  // Todas as paredes do edifício (sem duplicatas)
  readonly paredes:  Map<string, ParedeGlobal>
  // Todos os vértices (sem duplicatas — compartilhados entre cômodos)
  readonly vertices: Map<string, VerticeGlobal>
  // Cômodos e quais paredes os definem
  readonly comodos:  Map<string, ComodoNode>
}

// Parede no grafo global — pode pertencer a múltiplos cômodos
export interface ParedeGlobal extends Parede {
  // Cômodos que compartilham esta parede
  // len=1: parede externa (só um cômodo)
  // len=2: parede interna compartilhada (dois cômodos)
  readonly comodo_ids:   readonly string[]
  // Faces semânticas desta parede
  // Parede externa: 1 face (o cômodo interior)
  // Parede compartilhada: 2 faces (uma por cômodo)
  readonly faces:        readonly FaceParede[]
}

// Vértice no grafo global
export interface VerticeGlobal extends VerticeParede {
  // Cômodos que tocam neste vértice
  readonly comodo_ids: readonly string[]
}

// Nó de cômodo no grafo
export interface ComodoNode {
  readonly id:        string
  readonly nome:      string
  // IDs de ParedeGlobal que definem este cômodo (em ordem de perímetro)
  readonly parede_ids: readonly string[]
  // Cômodos vizinhos: aqueles que compartilham pelo menos uma parede
  readonly vizinhos:  readonly string[]
}

// ── Construir BuildingGraph a partir de múltiplos cômodos ─────────
// Detecta paredes compartilhadas e unifica vértices comuns.
// Tolerância: 1cm para considerar dois pontos como o mesmo.

const TOLERANCIA_M = 0.01

function pontosMesmo(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < TOLERANCIA_M && Math.abs(a.y - b.y) < TOLERANCIA_M
}

function paredeMesma(a: Parede, b: Parede): boolean {
  // Duas paredes são a mesma se têm os mesmos extremos (em qualquer sentido)
  return (pontosMesmo(a.inicio, b.inicio) && pontosMesmo(a.fim, b.fim)) ||
         (pontosMesmo(a.inicio, b.fim)    && pontosMesmo(a.fim, b.inicio))
}


// Auxiliar de módulo para registrar vértice — sem closure problemática
function _regVertex(
  vertices: Map<string, VerticeGlobal>,
  vid:      string | undefined,
  pos:      { x: number; y: number },
  parede_id: string,
  comodo_id: string
): void {
  if (vid && vertices.has(vid)) {
    const v = vertices.get(vid)!
    vertices.set(vid, {
      ...v,
      parede_ids: v.parede_ids.includes(parede_id) ? v.parede_ids : [...v.parede_ids, parede_id],
      comodo_ids: v.comodo_ids.includes(comodo_id)  ? v.comodo_ids : [...v.comodo_ids, comodo_id],
    })
    return
  }
  // Verificar por posição geométrica (fallback para paredes sem vertice_id declarado)
  for (const [evid, ev] of vertices) {
    const dx = Math.abs(ev.pos.x - pos.x)
    const dy = Math.abs(ev.pos.y - pos.y)
    if (dx < 0.01 && dy < 0.01) {
      vertices.set(evid, {
        ...ev,
        parede_ids: ev.parede_ids.includes(parede_id) ? ev.parede_ids : [...ev.parede_ids, parede_id],
        comodo_ids: ev.comodo_ids.includes(comodo_id)  ? ev.comodo_ids : [...ev.comodo_ids, comodo_id],
      })
      return
    }
  }
  // Novo vértice
  const novo_id = vid ?? crypto.randomUUID()
  vertices.set(novo_id, { id: novo_id, pos, parede_ids: [parede_id], comodo_ids: [comodo_id] })
}

export function buildBuildingGraph(comodos: ComodoGeometria[]): BuildingGraph {
  const paredes  = new Map<string, ParedeGlobal>()
  const vertices = new Map<string, VerticeGlobal>()
  const comodo_nodes = new Map<string, ComodoNode>()

  // Mapa: parede_id local → parede_id global (para deduplicação)
  const id_map = new Map<string, string>()

  // ── 1. Registrar todas as paredes — deduplicar compartilhadas ────
  for (const cg of comodos) {
    const parede_ids_globais: string[] = []

    for (const p of cg.paredes) {
      // Verificar se esta parede já existe no grafo global (compartilhada)
      let global_id: string | null = null

      for (const [gid, gp] of paredes) {
        if (paredeMesma(p, gp)) {
          global_id = gid
          break
        }
      }

      if (global_id) {
        // Parede compartilhada: adicionar este cômodo ao ownership + nova face
        const gp = paredes.get(global_id)!
        if (!gp.comodo_ids.includes(cg.id)) {
          // Determinar lado: a face nova pertence ao lado oposto da face existente
          const lado: LadoFace = gp.faces.some(f => f.lado === 'esquerda') ? 'direita' : 'esquerda'
          const nova_face: FaceParede = {
            id:        crypto.randomUUID(),
            parede_id: global_id,
            lado,
            comodo_id: cg.id,
            ponto_ids: [],
            offset_m:  offsetPadrao(lado, gp.espessura_m),
          }
          paredes.set(global_id, {
            ...gp,
            comodo_ids: [...gp.comodo_ids, cg.id],
            faces:      [...gp.faces, nova_face],
          })
        }
        id_map.set(p.id, global_id)
        parede_ids_globais.push(global_id)
      } else {
        // Nova parede — registrar no grafo global com face inicial
        const face_inicial: FaceParede = {
          id:        crypto.randomUUID(),
          parede_id: p.id,
          lado:      'esquerda',   // primeira face = lado esquerdo (relativo ao início→fim)
          comodo_id: cg.id,
          ponto_ids: [],
          offset_m:  offsetPadrao('esquerda', p.espessura_m),
        }
        const nova: ParedeGlobal = { ...p, comodo_ids: [cg.id], faces: [face_inicial] }
        paredes.set(p.id, nova)
        id_map.set(p.id, p.id)
        parede_ids_globais.push(p.id)
      }
    }

    // ── 2. Registrar/atualizar vértices ───────────────────────────
    for (const p of cg.paredes) {
      const gpid = id_map.get(p.id) ?? p.id
      _regVertex(vertices, p.vertice_inicio_id, p.inicio, gpid, cg.id)
      _regVertex(vertices, p.vertice_fim_id,    p.fim,    gpid, cg.id)
    }

    // ── 3. Detectar vizinhos (cômodos que compartilham parede) ────
    const vizinhos = new Set<string>()
    for (const gid of parede_ids_globais) {
      const gp = paredes.get(gid)
      if (gp && gp.comodo_ids.length > 1) {
        gp.comodo_ids.filter(id => id !== cg.id).forEach(id => vizinhos.add(id))
      }
    }

    comodo_nodes.set(cg.id, {
      id:         cg.id,
      nome:       cg.nome,
      parede_ids: parede_ids_globais,
      vizinhos:   [...vizinhos],
    })
  }

  // ── 4. Atualizar vizinhos depois que todos os cômodos foram processados
  for (const [cid, node] of comodo_nodes) {
    const vizinhos = new Set<string>()
    for (const gid of node.parede_ids) {
      const gp = paredes.get(gid)
      if (gp && gp.comodo_ids.length > 1) {
        gp.comodo_ids.filter(id => id !== cid).forEach(id => vizinhos.add(id))
      }
    }
    if (vizinhos.size !== node.vizinhos.length) {
      comodo_nodes.set(cid, { ...node, vizinhos: [...vizinhos] })
    }
  }

  return { paredes, vertices, comodos: comodo_nodes }
}

// ── Paredes compartilhadas entre dois cômodos ─────────────────────
export function paredensCompartilhadas(
  comodo_a: string,
  comodo_b: string,
  graph: BuildingGraph
): ParedeGlobal[] {
  const resultado: ParedeGlobal[] = []
  for (const [, p] of graph.paredes) {
    if (p.comodo_ids.includes(comodo_a) && p.comodo_ids.includes(comodo_b)) {
      resultado.push(p)
    }
  }
  return resultado
}

// ── Cômodos vizinhos de um cômodo ────────────────────────────────
export function comodoVizinhos(comodo_id: string, graph: BuildingGraph): ComodoNode[] {
  const node = graph.comodos.get(comodo_id)
  if (!node) return []
  return node.vizinhos
    .map(id => graph.comodos.get(id))
    .filter((n): n is ComodoNode => n != null)
}

// ── Caminho entre dois cômodos ────────────────────────────────────
// Sequência de cômodos para ir do A ao B atravessando paredes compartilhadas
export function caminhoCômodos(
  inicio_id: string,
  fim_id:    string,
  graph:     BuildingGraph,
  max = 20
): string[] {
  if (inicio_id === fim_id) return [inicio_id]
  const visitados = new Set<string>()
  const fila: { id: string; caminho: string[] }[] = [{ id: inicio_id, caminho: [inicio_id] }]

  while (fila.length > 0) {
    const { id, caminho } = fila.shift()!
    if (caminho.length > max) continue
    if (visitados.has(id)) continue
    visitados.add(id)

    const node = graph.comodos.get(id)
    if (!node) continue

    for (const viz_id of node.vizinhos) {
      if (viz_id === fim_id) return [...caminho, viz_id]
      if (!visitados.has(viz_id)) fila.push({ id: viz_id, caminho: [...caminho, viz_id] })
    }
  }
  return []
}

// ── Verificar consistência do BuildingGraph ───────────────────────
export interface InconsistenciaBuilding {
  tipo:      'parede_sem_comodo' | 'comodo_sem_parede' | 'vertice_orfao'
  id:        string
  descricao: string
}

export function verificarBuilding(graph: BuildingGraph): InconsistenciaBuilding[] {
  const problemas: InconsistenciaBuilding[] = []

  for (const [pid, p] of graph.paredes) {
    if (p.comodo_ids.length === 0) {
      problemas.push({ tipo: 'parede_sem_comodo', id: pid,
        descricao: `Parede ${pid} sem cômodo proprietário` })
    }
  }

  for (const [cid, node] of graph.comodos) {
    for (const pid of node.parede_ids) {
      if (!graph.paredes.has(pid)) {
        problemas.push({ tipo: 'comodo_sem_parede', id: cid,
          descricao: `Cômodo ${node.nome} referencia parede ${pid} inexistente` })
      }
    }
  }

  for (const [vid, v] of graph.vertices) {
    if (v.parede_ids.length === 0) {
      problemas.push({ tipo: 'vertice_orfao', id: vid,
        descricao: `Vértice ${vid} sem paredes referenciando-o` })
    }
  }

  return problemas
}
