// src/core/rules/context.ts
// ════════════════════════════════════════════════════════════════
// RuleContext — contexto imutável do domínio para validação normativa
//
// CONTRATO: RuleContext é SOMENTE LEITURA.
// Nenhuma regra pode mutar qualquer campo do contexto.
// Regras recebem contexto, retornam ResultadoNorma[].
// ════════════════════════════════════════════════════════════════

// ── Resultado de uma regra normativa ─────────────────────────────
export type SeveridadeNorma =
  | 'fisico_critico'  // lei física violada — bloqueia toda decisão técnica
  | 'erro'            // regra normativa violada — bloqueia aprovação
  | 'aviso'           // atenção requerida — permite avançar com consciência
  | 'info'            // informativo — rastreabilidade apenas

export interface ResultadoNorma {
  readonly codigo:      string       // 'NBR5410.5.1.3.1.a'
  readonly descricao:   string
  readonly norma:       string       // referência textual completa
  readonly severidade:  SeveridadeNorma
  readonly valor?:      number       // valor calculado que viola
  readonly limite?:     number       // limite normativo
  readonly conforme:    boolean
  // true = erro que impede toda decisão técnica posterior (ex: Irc > Iz_max)
  readonly bloqueia_calculo?: boolean
  // Ação sugerida ao engenheiro (em linguagem natural)
  readonly acao_sugerida?: string
}

// Helpers de construção — garantem campos obrigatórios
export const R = {
  ok: (codigo: string, norma: string): ResultadoNorma =>
    ({ codigo, descricao: 'Conforme', norma, severidade: 'info', conforme: true }),

  aviso: (codigo: string, descricao: string, norma: string, valor?: number, limite?: number): ResultadoNorma =>
    ({ codigo, descricao, norma, severidade: 'aviso', valor, limite, conforme: false }),

  erro: (codigo: string, descricao: string, norma: string, valor?: number, limite?: number, acao?: string): ResultadoNorma =>
    ({ codigo, descricao, norma, severidade: 'erro', valor, limite, conforme: false, acao_sugerida: acao }),

  // Erro físico — bloqueia toda decisão técnica posterior
  fisico: (codigo: string, descricao: string, norma: string, acao: string, valor?: number, limite?: number): ResultadoNorma =>
    ({ codigo, descricao, norma, severidade: 'fisico_critico', valor, limite, conforme: false, bloqueia_calculo: true, acao_sugerida: acao }),
}

export function statusGeral(resultados: ResultadoNorma[]): 'OK' | 'AVISO' | 'ERRO' {
  // fisico_critico é mais severo que erro normativo
  if (resultados.some(r => r.severidade === 'fisico_critico')) return 'ERRO'
  if (resultados.some(r => r.severidade === 'erro'))           return 'ERRO'
  if (resultados.some(r => r.severidade === 'aviso'))          return 'AVISO'
  return 'OK'
}

// Verifica se algum resultado bloqueia toda decisão técnica
export function bloqueiaCalculo(resultados: ResultadoNorma[]): boolean {
  return resultados.some(r => r.bloqueia_calculo === true)
}

// ── Contexto imutável do circuito ────────────────────────────────
export interface CircuitoContext {
  readonly id:           string
  readonly tipo:         string         // 'ILUM' | 'TUG' | 'TUE'
  readonly descricao:    string
  readonly ib:           number         // corrente de projeto (A)
  readonly in_disj:      number         // In do disjuntor (A)
  readonly iz_nominal:   number         // Iz da tabela (A)
  readonly iz_efetiva:   number         // Iz × Ft × Fa (A)
  readonly secao_mm2:    number         // seção calculada (mm²)
  readonly du_pct:       number         // queda de tensão (%)
  readonly du_max_pct:   number         // limite do projeto (%)
  readonly du_ramal_pct: number         // reserva do ramal (%)
  readonly idr:          boolean        // tem IDR?
  readonly fase:         string
  readonly comprimento_m: number
  readonly n_agrup:      number
  readonly ft:           number
  readonly fa:           number
}

// ── Contexto imutável do segmento ────────────────────────────────
export interface SegmentoContext {
  readonly id:                  string
  readonly nome:                string
  readonly diametro_mm:         number
  readonly area_interna_mm2:    number
  readonly area_condutores_mm2: number
  readonly taxa_ocupacao_pct:   number
  // Limite de ocupação aplicável — NBR 5410 §6.2.11.1.6 varia por
  // número de condutores (53%/31%/40%), não é um valor fixo único.
  // Calculado uma única vez em topologia.ts→analisarSegmento() e
  // propagado aqui para a regra não duplicar a lógica pela 3ª vez.
  readonly limite_ocupacao_pct: number
  readonly n_circuitos:         number
  readonly fa_resultante:       number
}

// ── Contexto imutável da rede ────────────────────────────────────
export interface RedeContext {
  readonly n_nos:        number
  readonly n_segmentos:  number
  readonly tem_qd:       boolean
  readonly tem_ciclos:   boolean
}

// ── Contexto do projeto (parâmetros globais) ─────────────────────
export interface ProjetoContext {
  readonly sistema:            string
  readonly v_fase:             number
  readonly du_max_pct:         number
  readonly du_ramal_pct:       number
  readonly metodo_instalacao:  string
  readonly isolacao:           string
  readonly material_cabo:      string
  readonly t_amb:              number
  readonly aterramento:        string
}
