// src/core/autoplace.ts
// ════════════════════════════════════════════════════════════════
// AUTO-PLACEMENT — Posicionamento inteligente de pontos elétricos
//
// Baseado em:
//   - NBR 5410:2004 §9.5 — Circuitos terminais
//   - Boas práticas de projeto residencial (CEMIG/PROCEL)
//   - Geometria do cômodo (largura × altura, paredes, portas)
//
// Resultado: sugestões de posição, não imposição
// O engenheiro confirma ou ajusta
// ════════════════════════════════════════════════════════════════

import type { ComodoGeometria } from '../types/geometry'
import type { TipoPontoEletrico } from '../types/geometry'

// ── Ponto sugerido ────────────────────────────────────────────────
export interface PontoSugerido {
  tipo:       TipoPontoEletrico
  x:          number          // metros — relativo ao cânvas
  y:          number          // metros — relativo ao cânvas
  descricao:  string          // ex: "TUG — parede S, centro"
  regra?:     string          // ex: "NBR 5410 §9.5.2.2 — 1 tomada/5m perímetro"
  circuito_sugerido?: string  // tipo de circuito sugerido
}

// ── NBR 5410 §9.5.2.2: n° mínimo de TUG por perímetro ───────────
export function calcNTugMinimo(perimetro_m: number): number {
  return Math.ceil(perimetro_m / 5)
}

// ── Distribuir TUGs no perímetro de um cômodo ─────────────────────
// Regra NBR 5410 §9.5.2.2: 1 TUG a cada 5m de perímetro
// Altura padrão TUG: 0.30m do piso (baixa) ou 1.10m (média bancada)
export function autoPlaceTUG(cg: ComodoGeometria, tipo: 'TUG_BAIXA' | 'TUG_MEDIA' = 'TUG_BAIXA'): PontoSugerido[] {
  const { x, y, largura_m, altura_m } = cg
  const n = Math.max(calcNTugMinimo(2 * (largura_m + altura_m)), 1)
  const pontos: PontoSugerido[] = []

  // Distribuir ao longo das paredes com espaçamento uniforme
  const perimetro = 2 * (largura_m + altura_m)
  const espc = perimetro / n
  const MARGEM = 0.40  // metros da quina

  let pos = MARGEM  // posição acumulada no perímetro
  for (let i = 0; i < n; i++) {
    const { px, py } = perimeterToXY(pos, x, y, largura_m, altura_m)
    pontos.push({
      tipo,
      x:  Math.round(px * 100) / 100,
      y:  Math.round(py * 100) / 100,
      descricao: `TUG ${i+1} — ${cg.nome}`,
      regra: 'NBR 5410 §9.5.2.2 — 1 tomada por 5m de perímetro',
      circuito_sugerido: 'TUG',
    })
    pos = (pos + espc) % perimetro
  }
  return pontos
}

// ── Posicionar luminárias no cômodo ───────────────────────────────
// Regra: iluminação central ou em grade para áreas grandes
export function autoPlaceLuminaria(cg: ComodoGeometria): PontoSugerido[] {
  const { x, y, largura_m, altura_m } = cg
  const area = largura_m * altura_m
  const pontos: PontoSugerido[] = []

  if (area <= 9) {
    // Luminária central
    pontos.push({
      tipo: 'LUMINARIA',
      x: x + largura_m / 2,
      y: y + altura_m / 2,
      descricao: `Luminária central — ${cg.nome}`,
      regra: 'Cômodo ≤ 9m² — luminária única centralizada',
      circuito_sugerido: 'ILUM',
    })
  } else {
    // Grade de luminárias
    const nx = Math.ceil(Math.sqrt(area / 9))
    const ny = Math.ceil(area / (nx * 9))
    const dx = largura_m / nx
    const dy = altura_m / ny
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        pontos.push({
          tipo: 'LUMINARIA',
          x: x + (i + 0.5) * dx,
          y: y + (j + 0.5) * dy,
          descricao: `Luminária ${i + j*nx + 1} — ${cg.nome}`,
          regra: `Grade ${nx}×${ny} para ${area.toFixed(0)}m²`,
          circuito_sugerido: 'ILUM',
        })
      }
    }
  }
  return pontos
}

// ── Posicionar interruptores ──────────────────────────────────────
// Regra: próximo à porta, 1.10m do piso, lado de abertura
export function autoPlaceInterruptor(cg: ComodoGeometria): PontoSugerido[] {
  const { x, y, altura_m } = cg
  const pontos: PontoSugerido[] = []

  // Sem dados de porta: colocar no canto inferior esquerdo (convencional)
  const n_lum = cg.largura_m * cg.altura_m > 9 ? 2 : 1  // paralelo se múltiplas lum.
  const tipo: TipoPontoEletrico = n_lum > 1 ? 'INTERRUPTOR_PARALELO' : 'INTERRUPTOR_SIMPLES'

  pontos.push({
    tipo,
    x: x + 0.20,       // 20cm da parede esquerda
    y: y + altura_m - 0.20,  // 20cm da parede inferior (próximo à porta convencional)
    descricao: `Interruptor — ${cg.nome}`,
    regra: 'Posição convencional: 1,10m do piso, ao lado da abertura da porta',
    circuito_sugerido: 'ILUM',
  })
  return pontos
}

// ── Gerar todos os pontos sugeridos para um cômodo ────────────────
export function autoPlaceComo(cg: ComodoGeometria): PontoSugerido[] {
  return [
    ...autoPlaceLuminaria(cg),
    ...autoPlaceInterruptor(cg),
    ...autoPlaceTUG(cg),
  ]
}

// ── Helper: converter posição no perímetro em XY ─────────────────
function perimeterToXY(
  pos: number, x: number, y: number, w: number, h: number
): { px: number; py: number } {
  const OFFSET = 0.15  // metros da parede (espessura simbólica)

  // Percorrer perímetro no sentido horário: Norte → Leste → Sul → Oeste
  if (pos <= w) {
    return { px: x + pos,   py: y + OFFSET }            // Norte
  } else if (pos <= w + h) {
    return { px: x + w - OFFSET, py: y + (pos - w) }   // Leste
  } else if (pos <= 2*w + h) {
    return { px: x + (2*w + h - pos), py: y + h - OFFSET } // Sul (invertido)
  } else {
    return { px: x + OFFSET, py: y + (2*w + 2*h - pos) }   // Oeste (invertido)
  }
}

// ── Snap ao grid ──────────────────────────────────────────────────
// Snapping para múltiplos de resolucao_m (padrão: 0.10m = 10cm)
export function snapToGrid(val: number, resolucao_m = 0.10): number {
  return Math.round(val / resolucao_m) * resolucao_m
}

export function snapPonto(x: number, y: number, res = 0.10): { x: number; y: number } {
  return { x: snapToGrid(x, res), y: snapToGrid(y, res) }
}

// ── Snap a pontos existentes ──────────────────────────────────────
export function snapToPonto(
  x: number, y: number,
  pontos: { x: number; y: number }[],
  threshold = 0.25   // metros — raio de snap
): { x: number; y: number; snapped: boolean } {
  for (const p of pontos) {
    const dist = Math.sqrt((x - p.x)**2 + (y - p.y)**2)
    if (dist < threshold) return { x: p.x, y: p.y, snapped: true }
  }
  return { x, y, snapped: false }
}
