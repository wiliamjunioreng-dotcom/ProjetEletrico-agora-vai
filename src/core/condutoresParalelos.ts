// src/core/condutoresParalelos.ts
// ════════════════════════════════════════════════════════════════
// CONDUTORES EM PARALELO — NBR 5410:2004 Anexo D
//
// Quando um único condutor seria inviável (ex: mais espesso que a
// maior seção comercial disponível, 240mm² neste sistema), a norma
// permite dividir a fase em N condutores em paralelo, desde que:
//   D.1 — mesma seção nominal em todos os condutores do paralelo
//   D.1 — mesmo comprimento (dentro de tolerância prática)
//   D.1 — mesmo material e isolação
//   D.1 — nenhuma derivação intermediária em condutor isolado
//
// Verificação de proteção (§5.1.3.1 estendido para paralelo):
//   Ib ≤ In ≤ Σ Izk
// onde Σ Izk é a SOMA das capacidades individuais de cada condutor
// do grupo — não a capacidade de um condutor multiplicada
// ingenuamente, porque cada condutor do grupo pode estar sujeito a
// fatores de agrupamento diferentes entre si (Tabela 42) dependendo
// de como estão dispostos fisicamente.
// ════════════════════════════════════════════════════════════════

import { getIz, SECOES_COMERCIAIS } from '../data/nbr5410tables'
import type { MetodoInstalacao, MaterialCabo, IsolacaoCabo } from '../types/electrical'

// ── Entrada: um condutor individual dentro do paralelo ────────────
export interface CondutorParalelo {
  readonly id:          string
  readonly secao_mm2:   number
  readonly n_agrup:     number   // circuitos agrupados junto a ESTE condutor específico
  readonly ft:          number   // fator de temperatura aplicável a este condutor
}

export interface GrupoParaleloInput {
  readonly n_condutores:   number          // quantos condutores em paralelo compõem a fase
  readonly secao_mm2:      number          // seção nominal — DEVE ser igual em todos (D.1)
  readonly comprimento_m:  number          // comprimento — DEVE ser igual em todos (D.1)
  readonly metodo:         MetodoInstalacao
  readonly material:       MaterialCabo
  readonly isolacao:       IsolacaoCabo
  readonly n_cond_por_circuito: 2 | 3
  readonly ib:             number          // corrente de projeto do circuito (A) — total, não por condutor
  readonly in_disj:        number          // disjuntor já selecionado para o circuito
  // Fatores de agrupamento por condutor — quando os condutores paralelos
  // estão em eletrodutos DIFERENTES (prática recomendada para reduzir Fa),
  // cada um pode ter um n_agrup próprio. Se omitido, assume mesmo Fa para todos.
  readonly ft_por_condutor?: number[]
  readonly fa_por_condutor?: number[]
}

export interface ResultadoParalelo {
  readonly n_condutores:      number
  readonly secao_mm2:         number
  readonly iz_individual:     number      // Iz nominal de 1 condutor (tabela)
  readonly iz_efetiva_por_condutor: number[]  // Iz' de cada condutor, após seu próprio Ft×Fa
  readonly soma_iz_efetiva:   number      // Σ Izk — o que a norma exige comparar com In
  readonly ib_por_condutor:   number      // corrente que CADA condutor efetivamente conduz (Ib/n, idealizado)
  readonly tripartida_ok:     boolean     // Ib ≤ In ≤ ΣIzk
  readonly in_max_permitido:  number      // = soma_iz_efetiva (o limite superior de In)
  readonly violacoes:         string[]
  readonly recomendacao?:     string
}

// ── Verificação principal — Anexo D ───────────────────────────────
export function verificarCondutoresParalelos(input: GrupoParaleloInput): ResultadoParalelo {
  const violacoes: string[] = []

  // D.1 — regras de igualdade (sempre reforçadas; o formulário força
  // seção e comprimento únicos por construção do tipo, mas a
  // verificação fica explícita aqui para rastreabilidade no memorial)
  if (input.n_condutores < 2) {
    violacoes.push('Grupo com menos de 2 condutores não é "paralelo" — configuração inválida')
  }
  if (!SECOES_COMERCIAIS.includes(input.secao_mm2)) {
    violacoes.push(`Seção ${input.secao_mm2}mm² não é uma bitola comercial válida`)
  }

  // Iz individual (nominal, tabela) — igual para todos por definição (D.1)
  const iz_individual = getIz(input.secao_mm2, input.metodo, input.n_cond_por_circuito, input.material, input.isolacao)

  const n = input.n_condutores
  const fts = input.ft_por_condutor ?? Array(n).fill(1.0)
  const fas = input.fa_por_condutor ?? Array(n).fill(1.0)

  if (fts.length !== n || fas.length !== n) {
    violacoes.push('Número de fatores Ft/Fa informados não corresponde ao número de condutores')
  }

  const iz_efetiva_por_condutor = Array.from({ length: n }, (_, i) => {
    const ft = fts[i] ?? 1.0
    const fa = fas[i] ?? 1.0
    return Math.round(iz_individual * ft * fa * 10) / 10
  })

  const soma_iz_efetiva = Math.round(iz_efetiva_por_condutor.reduce((s, v) => s + v, 0) * 10) / 10

  // Corrente idealizada por condutor (assume divisão igual — na prática
  // pode haver leve desbalanceamento por diferença de impedância entre
  // percursos, mas a norma não exige medir isso em projeto, só em campo)
  const ib_por_condutor = Math.round((input.ib / n) * 100) / 100

  // A verificação que a norma exige: Ib ≤ In ≤ Σ Izk
  const ib_ok = input.ib <= input.in_disj
  const in_ok = input.in_disj <= soma_iz_efetiva
  const tripartida_ok = ib_ok && in_ok

  if (!ib_ok) {
    violacoes.push(`Ib(${input.ib.toFixed(1)}A) > In(${input.in_disj}A) — disjuntor subdimensionado para a carga`)
  }
  if (!in_ok) {
    violacoes.push(`In(${input.in_disj}A) > ΣIzk(${soma_iz_efetiva.toFixed(1)}A) — a soma das capacidades dos condutores em paralelo não sustenta o disjuntor escolhido`)
  }

  // Verificação de desbalanceamento entre condutores (informativa —
  // grande diferença de Fa entre condutores do mesmo grupo indica que
  // eles estão em condições de instalação muito diferentes, o que foge
  // do espírito do Anexo D de "condutores equivalentes")
  const fa_min = Math.min(...fas)
  const fa_max = Math.max(...fas)
  let recomendacao: string | undefined
  if (fa_max - fa_min > 0.15) {
    recomendacao = 'Fatores de agrupamento muito diferentes entre os condutores do paralelo — considere redistribuir os eletrodutos para equalizar as condições de instalação, ou o condutor mais penalizado vira o gargalo real do grupo.'
  }

  return {
    n_condutores: n,
    secao_mm2: input.secao_mm2,
    iz_individual,
    iz_efetiva_por_condutor,
    soma_iz_efetiva,
    ib_por_condutor,
    tripartida_ok,
    in_max_permitido: soma_iz_efetiva,
    violacoes,
    recomendacao,
  }
}

// ── Helper: quando faz sentido sugerir paralelo? ──────────────────
// A norma não obriga um gatilho automático — mas na prática, quando
// a seção mínima calculada já bate na maior bitola comercial (240mm²)
// e ainda assim não satisfaz Iz, só o paralelo resolve.
export function precisaCondutorParalelo(irc_necessario: number, metodo: MetodoInstalacao, material: MaterialCabo, isolacao: IsolacaoCabo, n_cond: 2 | 3): boolean {
  const maior_secao = SECOES_COMERCIAIS[SECOES_COMERCIAIS.length - 1]  // 240mm²
  const iz_maximo_disponivel = getIz(maior_secao, metodo, n_cond, material, isolacao)
  return iz_maximo_disponivel > 0 && irc_necessario > iz_maximo_disponivel
}

// ── Sugestão de configuração — quantos condutores em paralelo? ────
// Busca a menor combinação (n condutores × seção) que satisfaz Irc,
// preferindo MENOS condutores com seção maior (mais barato em conexões,
// menos pontos de falha) antes de sugerir mais condutores finos.
export function sugerirConfiguracaoParalela(
  irc_necessario: number,
  metodo: MetodoInstalacao,
  material: MaterialCabo,
  isolacao: IsolacaoCabo,
  n_cond: 2 | 3,
  max_condutores = 4
): { n_condutores: number; secao_mm2: number; iz_total: number } | null {
  for (let n = 2; n <= max_condutores; n++) {
    for (const secao of SECOES_COMERCIAIS) {
      const iz_unit = getIz(secao, metodo, n_cond, material, isolacao)
      if (iz_unit <= 0) continue
      const iz_total = iz_unit * n
      if (iz_total >= irc_necessario) {
        return { n_condutores: n, secao_mm2: secao, iz_total: Math.round(iz_total * 10) / 10 }
      }
    }
  }
  return null  // nem com 4 condutores de 240mm² resolve — situação excepcional
}
