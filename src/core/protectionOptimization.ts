import type { MinFaultAnalysis } from './minFaultCurrentAnalysis'
// src/core/protectionOptimization.ts
// ════════════════════════════════════════════════════════════════
// PROTECTION OPTIMIZATION ENGINE
//
// O sistema já detecta: "proteção não funciona no pior caso."
// Agora ele precisa responder: "o que fazer?"
//
// Dado um circuito onde buildMinFaultAnalysis retornou
// protecao_funcional = false, este motor gera:
//   - opções de correção ordenadas por impacto e custo
//   - verificação de que cada opção resolve o problema
//   - trade-offs explícitos de cada opção
//
// Opções possíveis:
//   1. Aumentar seção do cabo (reduz Z → aumenta Icc)
//   2. Trocar curva B→C→D (reduz Ia_min → mais fácil de atuar)
//   3. Reduzir comprimento (não sempre viável, mas mais barato)
//   4. Adicionar DR de 30mA (proteção por corrente diferencial)
//   5. Dividir o circuito (menor comprimento efetivo)
//   6. Trocar para disjuntor de menor In (reduz Ia_min)
//
// Trade-offs:
//   Mais seção       → mais caro, mais espaço no eletroduto
//   Curva menor      → risco de disparo por inrush
//   Comprimento      → requer rota diferente
//   DR               → custo adicional, requer neutro segregado
//   Dividir          → mais circuitos no QD, mais disjuntores
// ════════════════════════════════════════════════════════════════

import { buildMinFaultAnalysis } from './minFaultCurrentAnalysis'



// ── Fonte externa (concessionária) ───────────────────────────────
// Parâmetros que o PROJETISTA não controla — são dados da rede
export interface FonteExterna {
  readonly tensao_nominal_v:   number         // tensão declarada pela concessionária
  readonly curto_presumido_ka: number         // corrente de curto disponível na entrada
  readonly impedancia_rede_ohm?: number       // Zeq da rede (se fornecido pelo estudo)
  readonly tipo_aterramento:   'TN-S' | 'TN-C-S' | 'TT' | 'IT'
  readonly tolerancia_tensao_min_pct: number  // ex: -10 (ANEEL Módulo 8)
  readonly concessionaria?:    string
}

// Fonte padrão (sem dados da concessionária — fonte ideal)
export const FONTE_PADRAO_BR: FonteExterna = {
  tensao_nominal_v:    220,
  curto_presumido_ka:  3,    // típico residencial (conservador)
  tipo_aterramento:    'TN-S',
  tolerancia_tensao_min_pct: -10,  // ANEEL Módulo 8
}

// ── Responsabilidade da ação ──────────────────────────────────────
// Quem pode agir para resolver o problema?
export type TipoControle =
  | 'PROJETISTA'       // ação do projetista (seção, curva, comprimento)
  | 'CONCESSIONARIA'   // requer intervenção externa (aumento de curto, padrão)
  | 'COMPARTILHADO'    // ambos precisam agir

// ── Tipo de opção de correção ─────────────────────────────────────
export type TipoCorrecao =
  | 'AUMENTAR_SECAO'     // usar cabo mais grosso
  | 'TROCAR_CURVA'       // usar curva com limiar menor (C→B, D→C)
  | 'REDUZIR_IN'         // usar disjuntor de menor corrente
  | 'ADICIONAR_DR'       // proteção diferencial (DR 30mA)
  | 'DIVIDIR_CIRCUITO'   // partir o circuito em dois menores
  | 'ENCURTAR_PERCURSO'  // rota mais curta (nem sempre viável)

// ── Opção de correção ─────────────────────────────────────────────
export interface OpcaoCorrecao {
  readonly tipo:             TipoCorrecao
  readonly descricao:        string
  readonly parametros_antes: Record<string, string | number>
  readonly parametros_depois: Record<string, string | number>
  // Responsabilidade: quem pode agir?
  readonly tipo_controle:    TipoControle
  // Verifica se esta opção realmente resolve o problema
  readonly resolve:          boolean
  readonly nova_analise?:    MinFaultAnalysis   // análise após a correção
  // Trade-offs
  readonly custo_relativo:   'BAIXO' | 'MEDIO' | 'ALTO'
  readonly complexidade:     'SIMPLES' | 'MEDIA' | 'COMPLEXA'
  readonly riscos:           string[]
  readonly prioridade:       number   // 1 = melhor opção
}

// ── Resultado da otimização ───────────────────────────────────────
export interface ResultadoOtimizacao {
  readonly circuito_id:    string
  readonly problema_orig:  MinFaultAnalysis
  // Distinção: problema interno (projetista) vs externo (concessionária)
  readonly causa_interna:  boolean   // causa está no projeto (comprimento, seção)
  readonly causa_externa:  boolean   // causa está na rede (Icc baixo da concessionária)
  readonly opcoes:         OpcaoCorrecao[]
  readonly melhor_opcao?:  OpcaoCorrecao
  // Nota para memorial técnico quando causa é externa
  readonly nota_concessionaria?: string
  readonly impossivel:     boolean
  readonly motivo_impossivel?: string
}

// Seções comerciais de cabo (mm²)
const SECOES_COMERCIAIS = [1.0, 1.5, 2.5, 4.0, 6.0, 10, 16, 25, 35, 50, 70, 95] as const

// Curvas em ordem crescente de limiar de atuação magnética
const CURVAS_ORDEM: ('B' | 'C' | 'D')[] = ['B', 'C', 'D']

// ── Motor de otimização ───────────────────────────────────────────
export function otimizarProtecao(
  circuito_id:     string,
  ponto_id:        string,
  tensao_fn_v:     number,
  secao_fase_mm2:  number,
  secao_pe_mm2:    number,
  comprimento_m:   number,
  isolacao:        string,
  curva:           'B' | 'C' | 'D',
  in_a:            number,
): ResultadoOtimizacao {
  // Análise original
  const orig = buildMinFaultAnalysis(
    circuito_id, ponto_id, tensao_fn_v,
    secao_fase_mm2, secao_pe_mm2, comprimento_m, isolacao, curva, in_a
  )

  // Se já está ok, não precisa otimizar
  if (orig.protecao_funcional) {
    return {
      circuito_id, problema_orig: orig,
      causa_interna: false, causa_externa: false,
      opcoes: [], melhor_opcao: undefined, impossivel: false,
    }
  }

  const opcoes: OpcaoCorrecao[] = []
  let prio = 1

  // ── Opção 1: Aumentar seção do cabo ───────────────────────────
  const idx_atual = SECOES_COMERCIAIS.indexOf(secao_fase_mm2 as typeof SECOES_COMERCIAIS[number])
  for (let i = idx_atual + 1; i < SECOES_COMERCIAIS.length; i++) {
    const nova_secao = SECOES_COMERCIAIS[i]
    // PE: manter proporção (metade da fase, mínimo 2.5mm²)
    const nova_pe = Math.max(2.5, nova_secao / 2)
    const nova_pe_comercial = SECOES_COMERCIAIS.find(s => s >= nova_pe) ?? nova_pe

    const nova_analise = buildMinFaultAnalysis(
      circuito_id, ponto_id, tensao_fn_v,
      nova_secao, nova_pe_comercial, comprimento_m, isolacao, curva, in_a
    )

    if (nova_analise.protecao_funcional) {
      opcoes.push({
        tipo:             'AUMENTAR_SECAO',
        tipo_controle:    'PROJETISTA',
        descricao:        `Aumentar cabo de ${secao_fase_mm2}mm² para ${nova_secao}mm² (+PE ${nova_pe_comercial}mm²)`,
        parametros_antes: { secao_mm2: secao_fase_mm2, pe_mm2: secao_pe_mm2, fator: orig.fator_seguranca },
        parametros_depois: { secao_mm2: nova_secao, pe_mm2: nova_pe_comercial, fator: nova_analise.fator_seguranca },
        resolve:          true,
        nova_analise,
        custo_relativo:   nova_secao <= 4 ? 'BAIXO' : nova_secao <= 10 ? 'MEDIO' : 'ALTO',
        complexidade:     'SIMPLES',
        riscos:           ['Verificar eletroduto — cabo mais grosso pode exceder ocupação'],
        prioridade:       prio++,
      })
      break  // primeira seção que resolve é suficiente
    }
  }

  // ── Opção 2: Trocar para curva de menor limiar (D→C→B) ────────
  const idx_curva = CURVAS_ORDEM.indexOf(curva)
  for (let i = idx_curva - 1; i >= 0; i--) {
    const nova_curva = CURVAS_ORDEM[i]
    const nova_analise = buildMinFaultAnalysis(
      circuito_id, ponto_id, tensao_fn_v,
      secao_fase_mm2, secao_pe_mm2, comprimento_m, isolacao, nova_curva, in_a
    )
    const resolve = nova_analise.protecao_funcional

    // Verificar risco de inrush com a nova curva
    const risco_inrush = nova_curva === 'B'
      ? ['Curva B pode disparar em cargas com inrush moderado (LEDs, fluorescentes)']
      : []

    opcoes.push({
      tipo:             'TROCAR_CURVA',
      tipo_controle:    'PROJETISTA',
      descricao:        `Trocar disjuntor de curva ${curva} para curva ${nova_curva} — Ia_min: ${orig.ia_min_a}A → ${nova_analise.ia_min_a}A`,
      parametros_antes: { curva, ia_min: orig.ia_min_a, fator: orig.fator_seguranca },
      parametros_depois: { curva: nova_curva, ia_min: nova_analise.ia_min_a, fator: nova_analise.fator_seguranca },
      resolve,
      nova_analise: resolve ? nova_analise : undefined,
      custo_relativo:   'BAIXO',
      complexidade:     'SIMPLES',
      riscos:           risco_inrush,
      prioridade:       prio++,
    })
    if (resolve) break
  }

  // ── Opção 3: Adicionar DR 30mA ────────────────────────────────
  // DR 30mA protege contra faltas fase-terra com QUALQUER corrente ≥ 30mA
  // Resolve o problema de proteção contra choque — mas não protege o cabo térmicamente
  opcoes.push({
    tipo:             'ADICIONAR_DR',
    tipo_controle:    'PROJETISTA',
    descricao:        'Adicionar IDR 30mA — proteção contra choque elétrico independente da Icc do loop',
    parametros_antes: { protecao: `disjuntor ${in_a}A curva ${curva}`, fator: orig.fator_seguranca },
    parametros_depois: { protecao: `disjuntor ${in_a}A curva ${curva} + IDR 30mA`, fator: 'n/a (DR atua em qualquer Icc ≥ 30mA)' },
    resolve:          true,  // para proteção contra choque — mas não para sobrecorrente
    custo_relativo:   'MEDIO',
    complexidade:     'SIMPLES',
    riscos:           [
      'DR protege contra choque (30mA) mas NÃO garante proteção térmica do cabo',
      'Neutro deve ser segregado (não compartilhar com circuitos sem DR)',
      'Corrente de fuga natural pode causar disparos indevidos',
    ],
    prioridade:       prio++,
  })

  // ── Opção 4: Dividir o circuito ───────────────────────────────
  const comp_metade = comprimento_m / 2
  const analise_metade = buildMinFaultAnalysis(
    `${circuito_id}-A`, ponto_id, tensao_fn_v,
    secao_fase_mm2, secao_pe_mm2, comp_metade, isolacao, curva, Math.round(in_a / 2)
  )

  if (analise_metade.protecao_funcional) {
    opcoes.push({
      tipo:             'DIVIDIR_CIRCUITO',
      tipo_controle:    'PROJETISTA',
      descricao:        `Dividir em 2 circuitos de ${comp_metade}m cada — disjuntores ${Math.round(in_a/2)}A`,
      parametros_antes: { comprimento_m, in_a, fator: orig.fator_seguranca },
      parametros_depois: { comprimento_m: comp_metade, in_a: Math.round(in_a/2), fator: analise_metade.fator_seguranca },
      resolve:          true,
      nova_analise:     analise_metade,
      custo_relativo:   'ALTO',
      complexidade:     'COMPLEXA',
      riscos:           ['Requer 2 circuitos no QD', 'Requer ponto de derivação intermediário'],
      prioridade:       prio++,
    })
  }

  // Ordenar por prioridade
  opcoes.sort((a, b) => a.prioridade - b.prioridade)
  const melhor = opcoes.find(o => o.resolve)

  // Diagnosticar causa do problema
  // Causa interna: loop Z alto demais por comprimento ou seção
  // Causa externa: Icc da origem é insuficiente mesmo para circuito curto
  const z_equiv_curto = orig.z_total_max_ohm * (10 / comprimento_m)  // Z para 10m
  const icc_curto_10m = orig.tensao_minima_v / z_equiv_curto
  const causa_interna = icc_curto_10m >= orig.ia_min_a  // curto funciona, comprimento não
  const causa_externa = icc_curto_10m < orig.ia_min_a   // mesmo curto, Icc insuficiente

  const nota_conc = causa_externa
    ? 'A proteção funcional depende da corrente de curto disponível fornecida pela concessionária. ' +
      'Solicitar estudo de curto-circuito ou aumento de padrão de entrada.'
    : undefined

  return {
    circuito_id,
    problema_orig:      orig,
    causa_interna,
    causa_externa,
    opcoes,
    melhor_opcao:       melhor,
    nota_concessionaria: nota_conc,
    impossivel:         !melhor,
    motivo_impossivel:  !melhor ? 'Nenhuma opção automática resolve — verificar manualmente' : undefined,
  }
}
