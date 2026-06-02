// src/core/rules/terminals.ts
// Regras NBR 5410 Capítulo 9 — Circuitos terminais
import { R } from './context'
import type { ResultadoNorma } from './context'
import type { CircuitoContext } from './context'

const N9 = 'NBR 5410:2004'

// §9.5.2.1 — Mínimo de iluminação (100VA/ponto)
export function iluminacaoMinima(area_m2: number, ilum_va: number): ResultadoNorma[] {
  const norma      = `${N9} §9.5.2.1 — 100VA por ponto de iluminação`
  const n_min      = area_m2 <= 6 ? 1 : Math.ceil(area_m2 / 6)
  const va_min     = n_min * 100
  if (ilum_va < va_min) {
    return [R.aviso(
      'NBR5410.9.5.2.1',
      `ILUM ${ilum_va}VA < mínimo ${va_min}VA para ${area_m2}m² (${n_min} ponto(s) × 100VA)`,
      norma, ilum_va, va_min
    )]
  }
  return []
}

// §9.5.2.2 — TUG 2,5mm²: Ib > 10A → sugerir desmembramento
export function tugCorrente(ctx: CircuitoContext): ResultadoNorma[] {
  const norma = `${N9} §9.5.2.2 — corrente de TUG com 2,5mm²`
  if (ctx.tipo === 'TUG' && ctx.secao_mm2 <= 2.5 && ctx.ib > 10) {
    return [R.aviso(
      'NBR5410.9.5.2.2',
      `Ib=${ctx.ib.toFixed(1)}A > 10A em TUG 2,5mm² — considerar desmembrar em dois circuitos`,
      norma, ctx.ib, 10
    )]
  }
  return []
}

// §9.5.3.3 — Mistura ILUM+TUG: Ib ≤ 16A
export function misturaIlumTug(ctx: CircuitoContext): ResultadoNorma[] {
  const norma   = `${N9} §9.5.3.3 — mistura ILUM+TUG permitida apenas se Ib ≤ 16A`
  const desc    = ctx.descricao.toUpperCase()
  const mistura = desc.includes('ILUM') && desc.includes('TUG')
  if (mistura && ctx.ib > 16) {
    return [R.erro(
      'NBR5410.9.5.3.3',
      `Mistura ILUM+TUG com Ib=${ctx.ib.toFixed(1)}A > 16A — circuitos obrigatoriamente separados`,
      norma, ctx.ib, 16
    )]
  }
  return []
}
