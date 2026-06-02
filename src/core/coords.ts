// src/core/coords.ts
// ════════════════════════════════════════════════════════════════
// COORDINATE SYSTEM — Pipeline de transformação de coordenadas
//
// O sistema tem dois espaços distintos:
//   WorldSpace: metros — onde o domínio elétrico opera
//   CanvasSpace: pixels — onde o renderer opera
//
// NUNCA misturar os dois.
// Toda conversão deve passar por esta API.
//
// A separação resolve:
//   - zoom: WorldSpace não muda, CanvasSpace escala
//   - pan:  WorldSpace não muda, CanvasSpace translada
//   - DPI:  CanvasSpace × devicePixelRatio, WorldSpace inalterado
//   - impressão: nova escala, mesma WorldSpace
// ════════════════════════════════════════════════════════════════

export interface WorldPoint { readonly x_m: number; readonly y_m: number }
export interface CanvasPoint { readonly x_px: number; readonly y_px: number }

export interface Viewport {
  readonly escala:   number    // px/m — escala do canvas
  readonly offset_x: number   // px — deslocamento horizontal (pan)
  readonly offset_y: number   // px — deslocamento vertical (pan)
}

// ── Conversões WorldSpace ↔ CanvasSpace ──────────────────────────
export function worldToCanvas(p: WorldPoint, vp: Viewport): CanvasPoint {
  return {
    x_px: p.x_m * vp.escala + vp.offset_x,
    y_px: p.y_m * vp.escala + vp.offset_y,
  }
}

export function canvasToWorld(p: CanvasPoint, vp: Viewport): WorldPoint {
  return {
    x_m: (p.x_px - vp.offset_x) / vp.escala,
    y_m: (p.y_px - vp.offset_y) / vp.escala,
  }
}

// ── Snap em WorldSpace ────────────────────────────────────────────
// Snap no grid padrão (25cm)
export const GRID_PADRAO_M = 0.25

export function snapGrid(val_m: number, grid_m = GRID_PADRAO_M): number {
  return Math.round(val_m / grid_m) * grid_m
}

export function snapPonto(p: WorldPoint, grid_m = GRID_PADRAO_M): WorldPoint {
  return { x_m: snapGrid(p.x_m, grid_m), y_m: snapGrid(p.y_m, grid_m) }
}

// ── Snap a parede ─────────────────────────────────────────────────
// Dado um ponto no WorldSpace, encontrar o ponto mais próximo em uma parede

export interface SegmentoParede {
  p1: WorldPoint
  p2: WorldPoint
  id: string
}

export interface SnapResult {
  ponto:         WorldPoint
  parede_id?:    string
  pos_relativa?: number    // 0-1 na parede
  distancia_m:   number
  snapped:       boolean
}

export function snapParede(
  ponto: WorldPoint,
  paredes: SegmentoParede[],
  threshold_m = 0.30
): SnapResult {
  let melhor: SnapResult = { ponto, distancia_m: Infinity, snapped: false }

  for (const parede of paredes) {
    const { p1, p2 } = parede
    const dx = p2.x_m - p1.x_m
    const dy = p2.y_m - p1.y_m
    const len2 = dx * dx + dy * dy
    if (len2 < 0.0001) continue

    // Projeção do ponto na parede
    const t = Math.max(0, Math.min(1,
      ((ponto.x_m - p1.x_m) * dx + (ponto.y_m - p1.y_m) * dy) / len2
    ))
    const proj: WorldPoint = { x_m: p1.x_m + t * dx, y_m: p1.y_m + t * dy }
    const dist = Math.sqrt((ponto.x_m - proj.x_m)**2 + (ponto.y_m - proj.y_m)**2)

    if (dist < melhor.distancia_m) {
      melhor = { ponto: proj, parede_id: parede.id, pos_relativa: t, distancia_m: dist, snapped: dist < threshold_m }
    }
  }
  return melhor
}

// ── Posição paramétrica em parede ────────────────────────────────
// Futuro: ponto relativo à parede (não posição absoluta)
// PosicaoParametrica permite mover a parede e o ponto acompanha

export interface PosicaoParametrica {
  parede_id:    string
  pos_relativa: number    // 0 = início, 1 = fim da parede
  offset_perp:  number    // metros perpendicular (+ = esquerda, - = direita, 0 = eixo)
  // ID da FaceParede à qual este ponto pertence
  // Conecta PosicaoParametrica ao modelo de face do BuildingGraph
  face_id?:     string
}

// Resolver posição paramétrica → WorldPoint
export function resolverParametrica(
  pos: PosicaoParametrica,
  paredes: SegmentoParede[]
): WorldPoint | null {
  const parede = paredes.find(p => p.id === pos.parede_id)
  if (!parede) return null

  const { p1, p2 } = parede
  const dx = p2.x_m - p1.x_m
  const dy = p2.y_m - p1.y_m
  const len = Math.sqrt(dx * dx + dy * dy)

  // Ponto na parede
  const bx = p1.x_m + pos.pos_relativa * dx
  const by = p1.y_m + pos.pos_relativa * dy

  // Offset perpendicular
  if (pos.offset_perp !== 0 && len > 0.001) {
    const nx = -dy / len   // normal à parede
    const ny =  dx / len
    return {
      x_m: bx + nx * pos.offset_perp,
      y_m: by + ny * pos.offset_perp,
    }
  }

  return { x_m: bx, y_m: by }
}
