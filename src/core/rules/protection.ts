// src/core/rules/protection.ts
// Regras NBR 5410 Capítulo 5 — Proteção
import { R } from './context'
import type { ResultadoNorma } from './context'
import type { CircuitoContext } from './context'

const N5 = 'NBR 5410:2004'

// §5.1.3.1 — Tripartida: Ib ≤ In ≤ Iz'
export function tripartida(ctx: CircuitoContext): ResultadoNorma[] {
  const norma = `${N5} §5.1.3.1 — tripartida Ib ≤ In ≤ Iz'`
  const res: ResultadoNorma[] = []

  if (ctx.ib > ctx.in_disj) {
    res.push(R.erro(
      'NBR5410.5.1.3.1.a',
      `Ib(${ctx.ib.toFixed(2)}A) > In(${ctx.in_disj}A) — condutor sobrecarregado`,
      norma, ctx.ib, ctx.in_disj,
      'Aumente o disjuntor ou reduza a carga do circuito.'
    ))
  }

  if (ctx.in_disj > ctx.iz_efetiva && ctx.iz_efetiva > 0) {
    // Erro físico crítico: disjuntor maior que capacidade do cabo — o cabo vai queimar
    res.push(R.fisico(
      'NBR5410.5.1.3.1.b',
      `In(${ctx.in_disj}A) > Iz'(${ctx.iz_efetiva.toFixed(1)}A) — disjuntor não protege o cabo`,
      norma,
      'Reduza o disjuntor ou aumente a seção do cabo.',
      ctx.in_disj, ctx.iz_efetiva
    ))
  }

  return res
}

// §5.1.3.2 — Proteção contra sobrecarga: In ≤ 1,45 × Iz
// IMPORTANTE: "Iz" nesta cláusula é a capacidade de condução nas
// CONDIÇÕES REAIS DE INSTALAÇÃO (já corrigida por Ft × Fa) — a mesma
// definição usada na tripartida do §5.1.3.1. Usar iz_nominal (valor
// de tabela, antes da correção) tornaria esta verificação permissiva
// demais sempre que houver agrupamento ou temperatura ambiente acima
// de 30°C — justamente o caso comum, não a exceção.
// BUG CORRIGIDO: usava ctx.iz_nominal; correto é ctx.iz_efetiva.
export function sobrecarga(ctx: CircuitoContext): ResultadoNorma[] {
  const norma  = `${N5} §5.1.3.2 — In ≤ 1,45 × Iz'`
  const limite = 1.45 * ctx.iz_efetiva
  if (ctx.in_disj > limite) {
    return [R.aviso(
      'NBR5410.5.1.3.2',
      `In(${ctx.in_disj}A) > 1,45×Iz'(${ctx.iz_efetiva}A) = ${limite.toFixed(1)}A`,
      norma, ctx.in_disj, limite
    )]
  }
  return []
}

// §5.1.3.6.1 — IDR 30mA em áreas molhadas
import { ehAreaMolhada } from '../areaMolhada'

export function idrAreaMolhada(ctx: CircuitoContext): ResultadoNorma[] {
  const norma    = `${N5} §5.1.3.6.1 — IDR 30mA obrigatório em áreas molhadas`
  const molhado  = ehAreaMolhada(ctx.descricao)
  if (molhado && !ctx.idr) {
    return [R.erro(
      'NBR5410.5.1.3.6.1',
      `Área molhada sem IDR 30mA — "${ctx.descricao}"`,
      norma, undefined, undefined,
      'Instale um IDR 30mA neste circuito (IEC 61008).'
    )]
  }
  return []
}
