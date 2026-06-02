// src/core/rules/sizing.ts
// Regras NBR 5410 Capítulo 6 — Dimensionamento
import { R } from './context'
import type { ResultadoNorma } from './context'
import type { CircuitoContext, SegmentoContext } from './context'

const N6 = 'NBR 5410:2004'

// Seções mínimas — §6.2.5
export const SECAO_MIN: Readonly<Record<string, number>> = {
  ILUM: 1.5, TUG: 2.5, TUE: 2.5, GERAL: 2.5,
}

export function secaoMinima(ctx: CircuitoContext): ResultadoNorma[] {
  const norma  = `${N6} §6.2.5 — seção mínima por tipo de circuito`
  const minimo = SECAO_MIN[ctx.tipo] ?? 1.5
  if (ctx.secao_mm2 < minimo) {
    return [R.erro(
      'NBR5410.6.2.5',
      `Seção ${ctx.secao_mm2}mm² < mínimo ${minimo}mm² para ${ctx.tipo}`,
      norma, ctx.secao_mm2, minimo
    )]
  }
  return []
}

// §6.2.7.2 — Queda de tensão máxima
export function quedaTensao(ctx: CircuitoContext): ResultadoNorma[] {
  const norma   = `${N6} §6.2.7.2 — ΔU máximo (ramal + circuito ≤ 7%)`
  const du_disp = ctx.du_max_pct - ctx.du_ramal_pct

  if (ctx.du_pct > du_disp) {
    const sev = ctx.du_pct > ctx.du_max_pct ? 'erro' as const : 'aviso' as const
    return [{
      codigo: 'NBR5410.6.2.7',
      descricao: `ΔU=${ctx.du_pct.toFixed(2)}% > disponível ${du_disp.toFixed(1)}% (reserva ramal ${ctx.du_ramal_pct}%)`,
      norma, severidade: sev, valor: ctx.du_pct, limite: du_disp, conforme: false,
      acao_sugerida: 'Aumente a seção do cabo ou reduza o comprimento do circuito.',
    }]
  }
  return []
}

// §6.2.11 — Ocupação máxima de eletroduto (35%)
export function ocupacaoEletroduto(ctx: SegmentoContext): ResultadoNorma[] {
  const norma = `${N6} §6.2.11 — ocupação máxima do eletroduto = 35%`
  if (ctx.taxa_ocupacao_pct > 35) {
    return [R.erro(
      'NBR5410.6.2.11',
      `Ocupação ${ctx.taxa_ocupacao_pct.toFixed(1)}% > 35%`,
      norma, ctx.taxa_ocupacao_pct, 35
    )]
  }
  if (ctx.taxa_ocupacao_pct > 30) {
    return [R.aviso(
      'NBR5410.6.2.11',
      `Ocupação ${ctx.taxa_ocupacao_pct.toFixed(1)}% — próxima do limite (35%)`,
      norma, ctx.taxa_ocupacao_pct, 35
    )]
  }
  return []
}

// §6.5.4.7 — Reservas no QD
export function reservasQD(n_ativos: number, n_reservas: number): ResultadoNorma[] {
  const norma  = `${N6} §6.5.4.7 — circuitos de reserva no QD`
  const minimo = n_ativos <= 6  ? 2
               : n_ativos <= 12 ? 3
               : n_ativos <= 30 ? 4
               : Math.ceil(n_ativos * 0.15)

  if (n_reservas < minimo) {
    return [R.aviso(
      'NBR5410.6.5.4.7',
      `${n_reservas} reserva(s) < mínimo ${minimo} para ${n_ativos} circuitos ativos`,
      norma, n_reservas, minimo
    )]
  }
  return []
}
