// src/core/rules/terminals.ts
// Regras NBR 5410 Capítulo 9 — Circuitos terminais
import { R } from './context'
import type { ResultadoNorma } from './context'
import type { CircuitoContext } from './context'

const N9 = 'NBR 5410:2004'

// §9.5.2.1 — REMOVIDA (não wire sem antes conferir):
// Esta função existia aqui com uma fórmula própria (ceil(área/6)×100VA)
// que DIVERGE da fórmula correta já verificada contra o texto da norma
// e implementada em engine.ts→calcIlumComodo() (100 + floor((área-6)/4)×60).
// Exemplo da divergência: para 16m², esta função dava 300VA; a fórmula
// correta dá 220VA. Nunca foi chamada por validarCircuito() nem por
// nenhuma página — ficou órfã. Removida em vez de conectada para não
// introduzir uma violação normativa INCORRETA na tela do engenheiro.
// Se uma verificação de ILUM mínima por circuito fizer falta no futuro,
// implementar reaproveitando calcIlumComodo() como fonte de verdade,
// não recriando a fórmula aqui.

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
