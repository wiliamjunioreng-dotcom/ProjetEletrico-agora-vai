// src/core/rules/index.ts
// ════════════════════════════════════════════════════════════════
// MOTOR DE REGRAS — ponto de entrada único
//
// CONTRATO: toda referência normativa entra por aqui.
// Nenhuma regra fora deste módulo. Nenhum acesso ao store.
// ════════════════════════════════════════════════════════════════

export type { ResultadoNorma, SeveridadeNorma, CircuitoContext, SegmentoContext, ProjetoContext } from './context'
export { R, statusGeral } from './context'

export { tripartida, sobrecarga, idrAreaMolhada } from './protection'
export { secaoMinima, quedaTensao, ocupacaoEletroduto, reservasQD, SECAO_MIN } from './sizing'
export { tugCorrente, misturaIlumTug } from './terminals'

// ── Aplicar todas as regras de circuito de uma vez ────────────────
import { tripartida, sobrecarga, idrAreaMolhada } from './protection'
import { secaoMinima, quedaTensao } from './sizing'
import { tugCorrente, misturaIlumTug } from './terminals'
import type { CircuitoContext, ResultadoNorma } from './context'
import { statusGeral } from './context'

export function validarCircuito(ctx: CircuitoContext): ResultadoNorma[] {
  return [
    ...tripartida(ctx),
    ...sobrecarga(ctx),
    ...idrAreaMolhada(ctx),
    ...secaoMinima(ctx),
    ...quedaTensao(ctx),
    ...tugCorrente(ctx),
    ...misturaIlumTug(ctx),
  ]
}

export function statusCircuito(ctx: CircuitoContext): 'OK' | 'AVISO' | 'ERRO' {
  return statusGeral(validarCircuito(ctx))
}
