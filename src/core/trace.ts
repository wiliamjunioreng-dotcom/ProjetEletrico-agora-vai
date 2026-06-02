// src/core/trace.ts
// ════════════════════════════════════════════════════════════════
// RASTREABILIDADE DO RACIOCÍNIO — Explainable Engineering
//
// Todo cálculo registra:
//   - qual fórmula foi aplicada
//   - quais valores de entrada
//   - qual resultado
//   - qual norma ou critério justifica a decisão
//   - se houve iteração, quantas e por quê
//
// Objetivo: o engenheiro consegue responder:
//   "Por que o sistema escolheu 4mm²?"
//   "Qual fator causou a queda de tensão exceder o limite?"
//   "Por que o disjuntor é 25A e não 20A?"
// ════════════════════════════════════════════════════════════════

// ── Registro de uma decisão de cálculo ───────────────────────────
export type CategoriaTrace =
  | 'fisica'        // lei física — ohm, joule, kirchhoff
  | 'criterio'      // decisão de engenharia — margem, segurança
  | 'norma'         // parâmetro normativo usado no cálculo
  | 'julgamento'    // avaliação de conformidade
  | 'iteracao'      // passo de convergência
  | 'selecao'       // seleção em tabela comercial

export interface EntradaTrace {
  readonly nome:      string          // nome da variável/resultado
  readonly formula?:  string          // fórmula aplicada (string legível)
  readonly inputs:    Record<string, number | string>  // valores de entrada
  readonly resultado: number | string // valor calculado
  readonly unidade?:  string
  readonly categoria: CategoriaTrace
  readonly norma?:    string          // ex: 'NBR 5410:2004 §6.2.7'
  readonly nota?:     string          // explicação em linguagem natural
}

// ── Traço completo de um estágio ──────────────────────────────────
export interface TracoEstagio {
  readonly estagio:   string          // ex: 'stageTensao'
  readonly ordem:     number          // posição no pipeline (1, 2, 3...)
  readonly entradas:  EntradaTrace[]
  readonly decisoes:  EntradaTrace[]  // decisões tomadas neste estágio
  readonly durada_ms?: number         // tempo de execução (opcional)
}

// ── Relatório completo de rastreabilidade ─────────────────────────
export interface RelatorioTrace {
  readonly circuito_id:   string
  readonly circuito_desc: string
  readonly timestamp:     string
  readonly estagios:      TracoEstagio[]
  // Convergência (se houver iteração)
  readonly iteracoes?:    IteracaoConvergencia[]
  readonly convergiu?:    boolean
}

export interface IteracaoConvergencia {
  readonly n:          number
  readonly secao_mm2:  number
  readonly du_pct:     number
  readonly du_disp:    number
  readonly motivo:     string        // por que precisou de outra iteração
}

// ── Builder fluente para construção de traces ─────────────────────
export class TraceBuilder {
  private readonly _estagio: string
  private readonly _ordem: number
  private readonly _entradas: EntradaTrace[] = []
  private readonly _decisoes: EntradaTrace[] = []
  private readonly _inicio: number = Date.now()

  constructor(estagio: string, ordem: number) {
    this._estagio = estagio
    this._ordem   = ordem
  }

  entrada(
    nome: string,
    resultado: number | string,
    inputs: Record<string, number | string>,
    opts?: { formula?: string; unidade?: string; norma?: string; nota?: string; categoria?: CategoriaTrace }
  ): this {
    this._entradas.push({
      nome, resultado, inputs,
      formula:   opts?.formula,
      unidade:   opts?.unidade,
      norma:     opts?.norma,
      nota:      opts?.nota,
      categoria: opts?.categoria ?? 'fisica',
    })
    return this
  }

  decisao(
    nome: string,
    resultado: number | string,
    inputs: Record<string, number | string>,
    opts?: { formula?: string; unidade?: string; norma?: string; nota?: string; categoria?: CategoriaTrace }
  ): this {
    this._decisoes.push({
      nome, resultado, inputs,
      formula:   opts?.formula,
      unidade:   opts?.unidade,
      norma:     opts?.norma,
      nota:      opts?.nota,
      categoria: opts?.categoria ?? 'criterio',
    })
    return this
  }

  build(): TracoEstagio {
    return {
      estagio:  this._estagio,
      ordem:    this._ordem,
      entradas: this._entradas,
      decisoes: this._decisoes,
      durada_ms: Date.now() - this._inicio,
    }
  }
}

// ── Formatador para exibição humana ───────────────────────────────
export function formatarTrace(rel: RelatorioTrace): string {
  const linhas: string[] = [
    `══ RACIOCÍNIO: ${rel.circuito_desc} ══`,
    `Calculado em: ${new Date(rel.timestamp).toLocaleString('pt-BR')}`,
    '',
  ]

  for (const est of rel.estagios) {
    linhas.push(`── Estágio ${est.ordem}: ${est.estagio} ──`)
    for (const e of [...est.entradas, ...est.decisoes]) {
      const origem = e.norma ? ` [${e.norma}]` : ''
      const nota   = e.nota  ? `\n   → ${e.nota}` : ''
      const inputs = Object.entries(e.inputs)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
      linhas.push(`  ${e.nome} = ${e.resultado}${e.unidade ? ' ' + e.unidade : ''}${origem}`)
      if (e.formula)  linhas.push(`   fórmula: ${e.formula} com [${inputs}]`)
      if (nota)       linhas.push(nota)
    }
    linhas.push('')
  }

  if (rel.iteracoes && rel.iteracoes.length > 0) {
    linhas.push(`── Convergência: ${rel.iteracoes.length} iteração(ões) ──`)
    rel.iteracoes.forEach(it => {
      linhas.push(`  Iter ${it.n}: ${it.secao_mm2}mm² → dU=${it.du_pct.toFixed(2)}% (disp: ${it.du_disp.toFixed(2)}%)`)
      linhas.push(`   → ${it.motivo}`)
    })
    linhas.push(`  Convergiu: ${rel.convergiu ? 'Sim' : 'Não'}`)
    linhas.push('')
  }

  return linhas.join('\n')
}

// ── Exportar trace para JSON (auditoria) ──────────────────────────
export function serializarTrace(rel: RelatorioTrace): string {
  return JSON.stringify(rel, null, 2)
}
