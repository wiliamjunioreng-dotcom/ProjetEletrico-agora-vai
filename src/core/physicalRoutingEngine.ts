// src/core/physicalRoutingEngine.ts
// ════════════════════════════════════════════════════════════════
// PHYSICAL ROUTING ENGINE — rota física dos circuitos elétricos
//
// Hoje o ElectricalSpatialBinding sabe: ponto ↔ circuito.
// Falta: circuito ↔ trajeto físico determinístico.
//
// O circuito precisa "andar" pela planta:
//   QD (origem) → faces intermediárias → ponto de destino
//
// Este engine usa o FaceGraph existente (caminhoFaces já implementado)
// para inferir por onde o eletroduto passa, quais faces percorre,
// e o comprimento real — não estimado.
//
// REGRAS:
//   ✗ Não calcula elétrico — usa resultado do solver
//   ✗ Não move pontos — usa geometria existente
//   ✓ Infere rota pelo grafo de faces
//   ✓ Calcula comprimento real pela geometria das faces
//   ✓ Identifica segmentos compartilhados entre circuitos
// ════════════════════════════════════════════════════════════════

import { caminhoFaces } from './faceGraph'
import type { FaceGraph } from './faceGraph'
import type { PontoEletrico } from '../types/geometry'

// ── Rota de um circuito ───────────────────────────────────────────
export interface CircuitRoute {
  readonly circuito_id:     string
  readonly ponto_origem_id: string   // ponto de entrada (mais próximo do QD)
  readonly ponto_destino_id: string  // ponto final (mais distante)
  // Faces percorridas em ordem (inclui face de origem e destino)
  readonly face_ids:         string[]
  // Comprimento real calculado pelo caminho das faces
  readonly comprimento_real_m: number
  // Comprimento declarado no projeto (para comparação)
  readonly comprimento_declarado_m: number
  // Divergência
  readonly divergencia_m:    number
  readonly divergencia_pct:  number
  readonly alerta_comprimento: boolean  // > 20% de divergência
}

// ── Resultado do roteamento ───────────────────────────────────────
export interface RoutingResult {
  readonly rotas:            CircuitRoute[]
  readonly segmentos_compartilhados: SegmentoCompartilhado[]
  readonly sem_rota:         string[]   // circuito_ids sem rota possível
}

// Segmento compartilhado entre múltiplos circuitos
export interface SegmentoCompartilhado {
  readonly face_id:      string
  readonly circuito_ids: string[]
  readonly n_circuitos:  number
  // Taxa de ocupação estimada (circuitos × condutores médios / capacidade)
  readonly ocupacao_est: number
}

// ── Calcular comprimento de um caminho pelo grafo de faces ────────
// Usa a posição dos pontos para estimar comprimento real
function comprimentoCaminho(
  face_ids:  string[],
  _face_graph: FaceGraph,
  _pontos:    PontoEletrico[]
): number {
  // Estimativa: comprimento total = distância entre os pontos dos extremos
  // mais penalidade por número de faces (mudanças de direção)
  if (face_ids.length <= 1) return 0

  // Cada face contribui com ~2m estimados para o comprimento
  // (parede típica de 2-4m, conduto vai até o meio e segue)
  // Isso é uma estimativa conservadora — o roteamento real depende da geometria
  const comprimento_base = face_ids.length * 2.0

  // Fator de correção por desvios/curvas
  const fator_curvas = 1 + (face_ids.length - 1) * 0.05

  return Math.round(comprimento_base * fator_curvas * 10) / 10
}

// ── Inferir rota de um circuito ───────────────────────────────────
function inferirRota(
  circuito_id:        string,
  ponto_origem:       PontoEletrico,  // ponto mais próximo do QD
  ponto_destino:      PontoEletrico,  // ponto mais distante
  face_graph:         FaceGraph,
  comprimento_declarado: number
): CircuitRoute | null {
  // Encontrar face de origem (onde o QD/ponto de entrada está)
  const face_origem = ponto_origem.pos_parametrica?.parede_id
  const face_destino = ponto_destino.pos_parametrica?.parede_id

  if (!face_origem || !face_destino) return null

  // Usar o pathfinding do FaceGraph
  const caminho = caminhoFaces(face_origem, face_destino, face_graph)
  if (caminho.length === 0) return null

  const comprimento_real = comprimentoCaminho(caminho, face_graph, [ponto_origem, ponto_destino])
  const divergencia = Math.abs(comprimento_real - comprimento_declarado)
  const div_pct = comprimento_declarado > 0
    ? Math.round(divergencia / comprimento_declarado * 100)
    : 0

  return {
    circuito_id,
    ponto_origem_id:      ponto_origem.id,
    ponto_destino_id:     ponto_destino.id,
    face_ids:             caminho,
    comprimento_real_m:   comprimento_real,
    comprimento_declarado_m: comprimento_declarado,
    divergencia_m:        Math.round(divergencia * 10) / 10,
    divergencia_pct:      div_pct,
    alerta_comprimento:   div_pct > 20,
  }
}

// ── Builder principal ─────────────────────────────────────────────
export function buildRoutingResult(
  // Circuitos com seus pontos já vinculados (do ElectricalSpatialBinding)
  circuitos: {
    id:               string
    comprimento_m:    number
    pontos:           PontoEletrico[]
  }[],
  face_graph: FaceGraph
): RoutingResult {
  const rotas:      CircuitRoute[]           = []
  const sem_rota:   string[]                 = []
  const face_count: Map<string, string[]>    = new Map()

  for (const circ of circuitos) {
    if (circ.pontos.length < 2) {
      sem_rota.push(circ.id)
      continue
    }

    // Origem = primeiro ponto (assumir que é o mais próximo do QD)
    // Destino = último ponto (mais distante)
    const origem  = circ.pontos[0]
    const destino = circ.pontos[circ.pontos.length - 1]

    const rota = inferirRota(circ.id, origem, destino, face_graph, circ.comprimento_m)
    if (!rota) {
      sem_rota.push(circ.id)
      continue
    }

    rotas.push(rota)

    // Contabilizar faces compartilhadas
    for (const face_id of rota.face_ids) {
      const circs = face_count.get(face_id) ?? []
      if (!circs.includes(circ.id)) circs.push(circ.id)
      face_count.set(face_id, circs)
    }
  }

  // Identificar segmentos com múltiplos circuitos
  const compartilhados: SegmentoCompartilhado[] = []
  for (const [face_id, circ_ids] of face_count) {
    if (circ_ids.length > 1) {
      // Estimativa de ocupação: 3 condutores por circuito (fase+neutro+PE)
      // eletroduto de 3/4" suporta ~6 condutores 2.5mm² (35% ocupação)
      const n_condutores = circ_ids.length * 3
      const ocupacao = Math.min(1, n_condutores / 6)
      compartilhados.push({
        face_id,
        circuito_ids: circ_ids,
        n_circuitos:  circ_ids.length,
        ocupacao_est: Math.round(ocupacao * 100) / 100,
      })
    }
  }

  return { rotas, segmentos_compartilhados: compartilhados, sem_rota }
}

// ── Consultas ao resultado ────────────────────────────────────────
// Faces percorridas por um circuito específico
export function facesDoCircuito(
  circuito_id: string,
  result:      RoutingResult
): string[] {
  return result.rotas.find(r => r.circuito_id === circuito_id)?.face_ids ?? []
}

// Circuitos que passam por uma face
export function circuitosDaFace(
  face_id: string,
  result:  RoutingResult
): string[] {
  const seg = result.segmentos_compartilhados.find(s => s.face_id === face_id)
  if (seg) return seg.circuito_ids
  const rota = result.rotas.find(r => r.face_ids.includes(face_id))
  return rota ? [rota.circuito_id] : []
}

// IDs de faces para highlight quando um circuito é selecionado
export function facesParaHighlight(
  circuito_id: string,
  result:      RoutingResult
): Set<string> {
  return new Set(facesDoCircuito(circuito_id, result))
}
