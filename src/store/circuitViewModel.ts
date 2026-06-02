// src/store/circuitViewModel.ts
import { otimizarProtecao } from '../core/protectionOptimization'
import type { OpcaoCorrecao } from '../core/protectionOptimization' // eslint-disable-line
// ════════════════════════════════════════════════════════════════
// CIRCUIT VIEW MODEL — Adapter Layer
//
// PRINCÍPIO: a UI nunca lê RawCircuit ou CircuitoPipelined diretamente.
//
// Motivo: RawCircuit é o domínio declarativo (o que o engenheiro definiu).
// CircuitoPipelined é o resultado do solver (o que o motor calculou).
// A UI precisa de uma representação unificada orientada à apresentação.
//
// Este módulo é o único ponto de contato entre domínio e UI.
// Se o domínio mudar, só este módulo precisa ser atualizado.
//
// Baseado em: Model-View-Presenter / MVVM pattern
// Inspirado em: como AltoQi e Eplan separam engine de UI
// ════════════════════════════════════════════════════════════════

import type { RawCircuit } from './projectStore'
import type { CircuitoPipelined } from '../core/pipeline'
import { calcularTotalCarga, lampadaParaProduto, FATORES_DIM } from '../core/carga'
import type { ItemCarga } from '../core/carga'

// ── Status visual do circuito ─────────────────────────────────────
export type CircuitStatus = 'ok' | 'aviso' | 'erro' | 'incompleto' | 'invalido'

// ── Violação formatada para a UI ──────────────────────────────────
export interface ViolacaoVM {
  readonly codigo:     string
  readonly titulo:     string
  readonly mensagem:   string
  readonly acao:       string       // O que o engenheiro deve fazer
  readonly severidade: 'fisico' | 'normativo' | 'aviso'
  readonly norma:      string
}

// ── Resultado do pipeline formatado para exibição ─────────────────
export interface ResultadoVM {
  readonly tensao_v:        number
  readonly sistema:         string    // "monofásico" | "bifásico" | "trifásico"
  readonly ib:              number
  readonly ib_str:          string    // "7.87 A"
  readonly secao_mm2:       number
  readonly secao_str:       string    // "4 mm²"
  readonly in_disj:         number
  readonly curva:           string
  readonly idr:             boolean
  readonly du_pct:          number
  readonly du_str:          string    // "2.87%"
  readonly du_limite:       number
  readonly du_ok:           boolean
  readonly iz_efetiva:      number
  readonly ft:              number
  readonly fa:              number
  readonly irc:             number
  readonly n_iteracoes:     number    // iterações de convergência dU
  // Curto-circuito (pode ser null = incompleto)
  readonly icc_max_ka:      number | null
  readonly icc_min_ka:      number | null
  readonly icc_ok:          boolean | null
  // ── Campos práticos para o engenheiro ──────────────────────────
  readonly curva_adequada:      boolean | null   // curva certa para este tipo de carga?
  readonly justificativa_curva: string | null    // por que esta curva foi sugerida
  readonly comprimento_max_m:   number | null    // limite máximo para proteção funcionar
  readonly fator_seguranca:     number | null    // Icc_min/Ia_min — quanto de margem tem
}

// ── Composição de carga ───────────────────────────────────────────
export interface ComposicaoVM {
  readonly itens:        ItemCarga[]
  readonly va_dim:       number      // total de dimensionamento
  readonly w_real:       number      // total real
  readonly n_pontos:     number      // total de pontos/unidades
  readonly composicao:   string      // "2×100VA + 1×60VA"
  readonly fator_medio:  number      // VA/W efetivo
  readonly fator_info:   string      // explicação do fator
  // Se tem composição granular ou só VA total
  readonly tem_granular: boolean
}

// ── Estado de execução simplificado ──────────────────────────────
export interface ExecucaoVM {
  readonly confianca:    'total' | 'parcial' | 'inviavel'
  readonly bloqueado:    boolean
  readonly estagios: {
    nome:    string
    status:  'concluido' | 'incompleto' | 'invalido'
    icone:   string
  }[]
}

// ── CircuitViewModel — o que a UI consome ─────────────────────────
export interface CircuitViewModel {
  // Identidade
  readonly id:           string
  readonly numero:       string      // "C01"
  readonly descricao:    string
  readonly tipo:         string
  readonly fase:         string

  // Parâmetros editáveis (para os inputs)
  readonly params: {
    readonly comprimento_m: number
    readonly potencia_va:   number
    readonly n_agrup:       number
    readonly tipo:          string
    readonly fase:          string
    readonly ligacao:       string   // monofasica | bifasica | trifasica
  }

  // Composição de cargas
  readonly composicao:   ComposicaoVM

  // Status geral
  readonly status:       CircuitStatus
  readonly status_label: string      // "OK" | "AVISO" | "ERRO" | "Dados ausentes"
  readonly css_class:    string      // 'pipeline-ok' | 'pipeline-aviso' | etc.

  // Violações com ações
  readonly violacoes:    ViolacaoVM[]

  // Resultado do pipeline (null se SEM_DADOS)
  readonly resultado:    ResultadoVM | null

  // Execução do pipeline
  readonly execucao:     ExecucaoVM

  // Resumo em linguagem natural (para o card fechado)
  readonly resumo:       string

  // Comprimento do circuito (para comparar com comprimento_max_m)
  readonly comprimento_m: number

  // Sugestões de correção (quando proteção não funcional)
  readonly sugestoes_correcao: OpcaoCorrecao[]

  // Flag para ordenação
  readonly prioridade:   number      // 0=erro, 1=aviso, 2=ok, 3=incompleto
}

// ── Funções auxiliares ────────────────────────────────────────────
function mapStatus(p: CircuitoPipelined | undefined, potencia_va: number): CircuitStatus {
  if (!p || potencia_va <= 0) return 'incompleto'
  if (p.julgamento.bloqueado) return 'invalido'
  if (p.execution.confianca === 'inviavel') return 'invalido'
  if (p.julgamento.status === 'ERRO')  return 'erro'
  if (p.julgamento.status === 'AVISO') return 'aviso'
  if (p.execution.confianca === 'parcial') return 'incompleto'
  return 'ok'
}

function statusLabel(s: CircuitStatus): string {
  return { ok: 'OK', aviso: 'AVISO', erro: 'ERRO', incompleto: 'Aguardando', invalido: 'INVIÁVEL' }[s]
}

function statusCss(s: CircuitStatus): string {
  return { ok: 'pipeline-ok', aviso: 'pipeline-aviso', erro: 'pipeline-invalido',
           incompleto: 'pipeline-incompleto', invalido: 'pipeline-invalido' }[s]
}

function statusPrioridade(s: CircuitStatus): number {
  return { erro: 0, invalido: 0, aviso: 1, ok: 2, incompleto: 3 }[s]
}

function tituloViolacao(codigo: string): string {
  if (codigo.includes('5.1.3.1.b')) return 'Disjuntor não protege o cabo'
  if (codigo.includes('5.1.3.1.a')) return 'Corrente excede capacidade do disjuntor'
  if (codigo.includes('5.1.3.2'))   return 'Sobrecarga lenta possível'
  if (codigo.includes('5.1.3.6'))   return 'IDR obrigatório em área molhada'
  if (codigo.includes('6.2.5'))     return 'Seção abaixo do mínimo normativo'
  if (codigo.includes('6.2.7'))     return 'Queda de tensão acima do limite'
  if (codigo.includes('6.5.4.7'))   return 'Reservas insuficientes no QD'
  if (codigo.includes('9.5.2.2'))   return 'Corrente elevada para TUG 2,5mm²'
  if (codigo.includes('9.5.3.3'))   return 'Mistura ILUM+TUG fora do limite'
  if (codigo.includes('SECAO'))     return 'Seção fisicamente inviável'
  return 'Violação normativa'
}

function mapViolacao(v: { codigo: string; descricao: string; norma: string; severidade: string; valor?: number; limite?: number; acao_sugerida?: string }): ViolacaoVM {
  return {
    codigo:     v.codigo,
    titulo:     tituloViolacao(v.codigo),
    mensagem:   v.descricao,
    acao:       v.acao_sugerida ?? 'Verifique os parâmetros do circuito.',
    severidade: v.severidade === 'fisico_critico' ? 'fisico'
              : v.severidade === 'erro' ? 'normativo' : 'aviso',
    norma:      v.norma,
  }
}

// ── Build do CircuitViewModel ─────────────────────────────────────
// Função pura: mesma entrada → mesmo ViewModel (determinístico)
export function buildCircuitViewModel(
  raw: RawCircuit,
  pipeline: CircuitoPipelined | undefined,
  numero: number,
  du_max_pct: number
): CircuitViewModel {

  // 1. Composição de cargas
  const lampadas = raw.lampadas ?? []
  let composicao: ComposicaoVM

  if (lampadas.length > 0) {
    const itens: ItemCarga[] = lampadas.map(l => lampadaParaProduto(l))
    const total = calcularTotalCarga(itens)
    const fator_info = lampadas[0]?.pot_dim_w
      ? `Fator fornecido: ${(lampadas[0].pot_dim_w / lampadas[0].pot_w).toFixed(2)} (origem: projetista)`
      : `Fator padrão: ${FATORES_DIM.LED_DRIVER.valor} — ${FATORES_DIM.LED_DRIVER.nota}`

    composicao = {
      itens,
      va_dim:      total.va_dim,
      w_real:      total.w_real,
      n_pontos:    total.itens,
      composicao:  total.composicao,
      fator_medio: total.fator_efetivo,
      fator_info,
      tem_granular: true,
    }
  } else {
    // Sem composição granular — usar VA total diretamente
    composicao = {
      itens:       [],
      va_dim:      raw.potencia_va ?? 0,
      w_real:      raw.potencia_real_w ?? 0,
      n_pontos:    0,
      composicao:  raw.potencia_va ? `${raw.potencia_va}VA` : '—',
      fator_medio: 1,
      fator_info:  'Potência declarada diretamente em VA (sem composição granular)',
      tem_granular: false,
    }
  }

  // 2. Status
  const status = mapStatus(pipeline, raw.potencia_va ?? 0)

  // 3. Violações
  const violacoes = (pipeline?.julgamento.violacoes ?? []).map(mapViolacao)

  // 4. Resultado (null = sem dados)
  let resultado: ResultadoVM | null = null
  if (pipeline && (raw.potencia_va ?? 0) > 0) {
    const p = pipeline

    resultado = {
      tensao_v:    p.tensao.tensao_v,
      sistema:     p.tensao.n_fases === 1 ? 'monofásico' : p.tensao.n_fases === 2 ? 'bifásico' : 'trifásico',
      ib:          p.corrente.ib,
      ib_str:      `${p.corrente.ib.toFixed(2)} A`,
      secao_mm2:   p.julgamento.secao_consolidada || p.queda.secao_final,
      secao_str:   `${p.julgamento.secao_consolidada || p.queda.secao_final} mm²`,
      in_disj:     p.protecao.in_disj,
      curva:       p.protecao.curva,
      idr:         p.protecao.idr,
      du_pct:      p.queda.du_pct,
      du_str:      `${p.queda.du_pct.toFixed(2)}%`,
      du_limite:   du_max_pct,
      du_ok:       p.queda.du_pct <= du_max_pct,
      iz_efetiva:  p.queda.iz_efetiva_final,
      ft:          p.fatores.ft,
      fa:          p.fatores.fa,
      irc:         p.fatores.irc,
      n_iteracoes: p.queda.iteracoes.length,
      icc_max_ka:  p.curto?.icc_max_ka ?? null,
      icc_min_ka:  p.curto?.icc_min_ka ?? null,
      icc_ok:      p.curto?.ok_atuacao ?? null,
      curva_adequada:      p.protecao.curva_adequada ?? null,
      justificativa_curva: p.protecao.justificativa_curva ?? null,
      comprimento_max_m:   p.curto?.comprimento_max_m ?? null,
      fator_seguranca:     p.curto?.fator_seguranca ?? null,
    }
  }

  // 5. Execução
  let execucao: ExecucaoVM = {
    confianca: 'total',
    bloqueado: false,
    estagios: [],
  }
  if (pipeline) {
    execucao = {
      confianca: pipeline.execution.confianca,
      bloqueado: pipeline.julgamento.bloqueado,
      estagios: Object.entries(pipeline.execution.stages).map(([nome, status]) => ({
        nome,
        status: status as any,
        icone: status === 'concluido' ? '✓' : status === 'invalido' ? '✗' : '…',
      })),
    }
  }

  // 6. Resumo em linguagem natural
  function buildResumo(): string {
    if (!resultado) {
      return raw.comprimento_m ? 'Preencha a potência do circuito.' : 'Preencha potência e comprimento.'
    }
    const idr_txt = resultado.idr ? ' + IDR 30mA' : ''
    const conf_tag = execucao.confianca === 'parcial' ? ' [dados parciais]'
                   : execucao.confianca === 'inviavel' ? ' [inviável]' : ''
    if (status === 'ok') {
      return `Cabo ${resultado.secao_str} · Disj. ${resultado.in_disj}A${resultado.curva}${idr_txt} · Ib=${resultado.ib_str} · ΔU=${resultado.du_str}${conf_tag}`
    }
    return `Cabo ${resultado.secao_str} · Disj. ${resultado.in_disj}A · Ib=${resultado.ib_str} · ΔU=${resultado.du_str} · ${violacoes.length} prob.${conf_tag}`
  }

  // Calcular sugestões de correção se proteção não funcional
  let sugestoes_correcao: OpcaoCorrecao[] = []
  if (resultado?.comprimento_max_m != null && resultado.comprimento_max_m < (raw.comprimento_m ?? 0)) {
    const opt = otimizarProtecao(
      raw.id, 'final',
      resultado.tensao_v,
      resultado.secao_mm2, resultado.secao_mm2,
      raw.comprimento_m ?? 0, 'PVC',
      (resultado.curva ?? 'C') as 'B'|'C'|'D',
      resultado.in_disj ?? 16,
    )
    sugestoes_correcao = opt.opcoes.filter(o => o.resolve && o.tipo_controle === 'PROJETISTA')
  }

  return {
    id:          raw.id,
    numero:      `C${String(numero).padStart(2, '0')}`,
    descricao:   raw.descricao,
    tipo:        raw.tipo,
    fase:        raw.fase,
    comprimento_m: raw.comprimento_m ?? 0,
    params: {
      comprimento_m: raw.comprimento_m ?? 0,
      potencia_va:   raw.potencia_va ?? 0,
      n_agrup:       raw.n_agrup ?? 1,
      tipo:          raw.tipo,
      fase:          raw.fase,
      ligacao:       raw.ligacao ?? 'monofasica',
    },
    composicao,
    status,
    status_label: statusLabel(status),
    css_class:    statusCss(status),
    violacoes,
    resultado,
    execucao,
    resumo:       buildResumo(),
    sugestoes_correcao,
    prioridade:   statusPrioridade(status),
  }
}

// ── Hook para gerar todos os ViewModels de uma vez ────────────────
// Usa o pipeline pré-computado do solver ou calcula inline
export function buildAllViewModels(
  circuitos_raw: RawCircuit[],
  pipelineMap: Map<string, CircuitoPipelined>,
  du_max_pct: number
): CircuitViewModel[] {
  return circuitos_raw
    .filter(r => r.tipo !== 'RESERVA')
    .map((raw, idx) => buildCircuitViewModel(
      raw,
      pipelineMap.get(raw.id),
      idx + 1,
      du_max_pct
    ))
    .sort((a, b) => a.prioridade - b.prioridade)
}
