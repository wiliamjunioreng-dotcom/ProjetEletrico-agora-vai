// src/core/quantitativos.ts
// ════════════════════════════════════════════════════════════════
// QUANTITATIVOS AUTOMÁTICOS
//
// Princípio: os quantitativos NÃO são um relatório final.
// Eles emergem do domínio spatial + elétrico.
//
// Fontes:
//   - Circuito (tipo, fase, secao, comprimento)
//   - Ponto elétrico (tipo, altura de instalação)
//   - FaceGraph (caminhos, transições, curvas)
//   - NBR 5410 (regras de circuito)
//
// Diferença para o quantitativo legado:
//   Antes: estimativas baseadas em totais de circuito
//   Agora: inferência por tipo de ponto + topologia real
// ════════════════════════════════════════════════════════════════

// ── Alturas padrão de instalação NBR 5410 ────────────────────────
// Valores em metros a partir do piso acabado
export const ALTURA_INSTALACAO_M = {
  TOMADA_BAIXA:    0.30,  // NBR 5410 §9.5.2 — residencial
  TOMADA_MEDIA:    1.10,  // bancada de cozinha
  TOMADA_ALTA:     2.00,  // ar-condicionado
  INTERRUPTOR:     1.10,  // NBR 5410 §9.5.1
  PONTO_LUZ_TETO:  2.80,  // pé-direito padrão (configurável)
  ARANDELA_PAREDE: 1.80,  // iluminação de parede
  QUADRO:          1.60,  // eixo do QD
  CHUVEIRO:        1.80,  // TUE hidráulica
}

// ── Condutores por tipo de circuito ─────────────────────────────
// Inferência das fiações necessárias (NBR 5444 + NBR 5410)
export interface ComposicaoCabo {
  readonly descricao:   string    // "F + N + PE" ou "F + N + retorno + PE"
  readonly n_condutores: number   // total de condutores
  readonly tem_retorno:  boolean  // circuito de iluminação tem retorno
  readonly tem_travamento: boolean // interruptor paralelo tem viajante
}

export function conduktoresCircuito(
  tipo: string,
  n_fases: 1 | 2 | 3,
  tem_interruptor_paralelo = false
): ComposicaoCabo {
  switch (tipo.toUpperCase()) {
    case 'ILUM':
      // Iluminação: F + N + retorno + PE (4 condutores)
      // Com paralelo: F + N + viajante1 + viajante2 + retorno + PE (6)
      if (tem_interruptor_paralelo) {
        return { descricao: 'F + N + V1 + V2 + ret + PE', n_condutores: 6, tem_retorno: true, tem_travamento: true }
      }
      return { descricao: 'F + N + retorno + PE', n_condutores: 4, tem_retorno: true, tem_travamento: false }

    case 'TUG':
      // Tomada monofásica: F + N + PE (3 condutores)
      return { descricao: 'F + N + PE', n_condutores: 3, tem_retorno: false, tem_travamento: false }

    case 'TUE':
      if (n_fases === 1) return { descricao: 'F + N + PE', n_condutores: 3, tem_retorno: false, tem_travamento: false }
      if (n_fases === 2) return { descricao: 'F1 + F2 + PE', n_condutores: 3, tem_retorno: false, tem_travamento: false }
      return { descricao: 'F1 + F2 + F3 + PE', n_condutores: 4, tem_retorno: false, tem_travamento: false }

    default:
      return { descricao: 'F + N + PE', n_condutores: 3, tem_retorno: false, tem_travamento: false }
  }
}

// ── Comprimento de cabo com verticalização ────────────────────────
// Calcula comprimento total considerando subida/descida vertical
// Modelo simplificado: QD → parede → ponto (em L invertido)
export interface SegmentoVertical {
  subida_qd_m:      number    // saída do QD → teto (ou calha)
  horizontal_m:     number    // percurso horizontal no teto
  descida_ponto_m:  number    // descida do teto → ponto de instalação
  total_m:          number
}

export function comprimentoComVertical(
  comprimento_horizontal_m: number,
  altura_qd_m    = ALTURA_INSTALACAO_M.QUADRO,
  pe_direito_m   = 2.80,
  altura_ponto_m = ALTURA_INSTALACAO_M.TOMADA_BAIXA
): SegmentoVertical {
  // Eletroduto sobe do QD até o teto/calha, percorre horizontalmente, desce ao ponto
  const subida_qd     = pe_direito_m - altura_qd_m    // QD → teto
  const descida_ponto = pe_direito_m - altura_ponto_m  // teto → ponto

  const total = subida_qd + comprimento_horizontal_m + descida_ponto
  return {
    subida_qd_m:     Math.round(subida_qd     * 100) / 100,
    horizontal_m:    comprimento_horizontal_m,
    descida_ponto_m: Math.round(descida_ponto * 100) / 100,
    total_m:         Math.round(total         * 100) / 100,
  }
}

// ── Caixas por tipo de ponto ──────────────────────────────────────
export type TipoCaixa = 'octogonal' | '4x2' | '4x4' | 'condulete'

export function caixaPorTipoPonto(tipo: string): TipoCaixa {
  switch (tipo.toUpperCase()) {
    case 'LUMINARIA':         return 'octogonal'   // ponto de luz no teto
    case 'LUMINARIA_PAREDE':  return '4x2'
    case 'INTERRUPTOR_SIMPLES':
    case 'INTERRUPTOR_PARALELO':
    case 'INTERRUPTOR_INTERMEDIARIO': return '4x2'
    case 'TUG_BAIXA':
    case 'TUG_MEDIA':
    case 'TUG_ALTA':          return '4x2'
    case 'TUE':               return '4x4'
    case 'QD':                return '4x4'
    case 'CAIXA_PASSAGEM':    return '4x4'
    default:                   return '4x2'
  }
}

// ── Quantitativo completo de um circuito ─────────────────────────
export interface QuantCircuito {
  readonly id:          string
  readonly descricao:   string
  readonly tipo:        string
  // Cabos
  readonly cabo_secao:  number
  readonly composicao:  ComposicaoCabo
  readonly metros_cabo: number        // metros_circuito × n_condutores
  readonly comprimento: SegmentoVertical
  // Eletroduto
  readonly diametro_eletroduto: 20 | 25 | 32 | 40  // mm
  readonly metros_eletroduto:   number
  // Caixa no ponto final
  readonly caixa:       TipoCaixa
  readonly n_curvas:    number        // estimativa de curvas 90° no percurso
}

export function calcQuantCircuito(raw: {
  id: string
  descricao: string
  tipo: string
  comprimento_m?: number
  n_fases?: 1 | 2 | 3
}, calc: {
  secao_fase?: number
  in_disj?: number
}): QuantCircuito {
  const comp_h     = raw.comprimento_m ?? 0
  const n_fases    = (raw.n_fases ?? 1) as 1 | 2 | 3
  const secao      = calc.secao_fase ?? 2.5

  // Composição de condutores
  const composicao = conduktoresCircuito(raw.tipo, n_fases)

  // Altura do ponto de instalação por tipo
  const altura_ponto =
    raw.tipo === 'ILUM'   ? ALTURA_INSTALACAO_M.PONTO_LUZ_TETO  :
    raw.tipo === 'TUG'    ? ALTURA_INSTALACAO_M.TOMADA_BAIXA     :
    raw.tipo === 'TUE'    ? ALTURA_INSTALACAO_M.CHUVEIRO         :
    ALTURA_INSTALACAO_M.TOMADA_BAIXA

  const comprimento = comprimentoComVertical(comp_h, 1.60, 2.80, altura_ponto)

  // Metros de cabo = comprimento total × n_condutores
  const metros_cabo = Math.round(comprimento.total_m * composicao.n_condutores * 100) / 100

  // Diâmetro do eletroduto por seção
  const diametro_eletroduto: 20 | 25 | 32 | 40 =
    secao <= 2.5 ? 20 :
    secao <= 10  ? 25 :
    secao <= 25  ? 32 : 40

  // Estimativa de curvas: 2 por circuito (uma na saída do QD, uma no ponto)
  const n_curvas = 2

  return {
    id:                 raw.id,
    descricao:          raw.descricao,
    tipo:               raw.tipo,
    cabo_secao:         secao,
    composicao,
    metros_cabo,
    comprimento,
    diametro_eletroduto,
    metros_eletroduto:  Math.round(comprimento.total_m * 100) / 100,
    caixa:              caixaPorTipoPonto(
      raw.tipo === 'ILUM' ? 'LUMINARIA' :
      raw.tipo === 'TUG'  ? 'TUG_BAIXA' :
      raw.tipo === 'TUE'  ? 'TUE' :
      raw.tipo
    ),
    n_curvas,
  }
}

// ── Resumo de materiais do projeto ───────────────────────────────
export interface ResumoMateriais {
  // Cabos agrupados por seção e composição
  cabos: {
    secao_mm2:    number
    composicao:   string
    metros_total: number
    n_circuitos:  number
  }[]
  // Eletrodutos agrupados por diâmetro
  eletrodutos: {
    diametro_mm:  20 | 25 | 32 | 40
    metros_total: number
    barras_3m:    number   // barras de 3m necessárias
    descricao:    string
  }[]
  // Caixas agrupadas por tipo
  caixas: {
    tipo:         TipoCaixa
    qtd:          number
    descricao:    string
  }[]
  // Curvas e conexões
  curvas_90: number
  // Cabos por seção (total de metros)
  metros_totais_cabo: number
}

export function calcResumoMateriais(quants: QuantCircuito[]): ResumoMateriais {
  // Cabos
  const cabos_map = new Map<string, { secao: number; comp: string; metros: number; n: number }>()
  for (const q of quants) {
    const key = `${q.cabo_secao}:${q.composicao.descricao}`
    const ex = cabos_map.get(key) ?? { secao: q.cabo_secao, comp: q.composicao.descricao, metros: 0, n: 0 }
    cabos_map.set(key, { ...ex, metros: ex.metros + q.metros_cabo, n: ex.n + 1 })
  }

  // Eletrodutos
  const elet_map = new Map<number, number>()
  for (const q of quants) {
    elet_map.set(q.diametro_eletroduto, (elet_map.get(q.diametro_eletroduto) ?? 0) + q.metros_eletroduto)
  }

  // Caixas
  const caixas_map = new Map<TipoCaixa, number>()
  for (const q of quants) {
    caixas_map.set(q.caixa, (caixas_map.get(q.caixa) ?? 0) + 1)
  }

  const curvas_90 = quants.reduce((s, q) => s + q.n_curvas, 0)

  return {
    cabos: [...cabos_map.values()].map(v => ({
      secao_mm2: v.secao, composicao: v.comp,
      metros_total: Math.ceil(v.metros * 1.10),  // +10% folga
      n_circuitos: v.n,
    })).sort((a, b) => a.secao_mm2 - b.secao_mm2),

    eletrodutos: [...elet_map.entries()].map(([d, m]) => ({
      diametro_mm: d as 20 | 25 | 32 | 40,
      metros_total: Math.ceil(m * 1.10),
      barras_3m:    Math.ceil(m * 1.10 / 3),
      descricao: `Eletroduto corrugado ⌀${d}mm`,
    })).sort((a, b) => a.diametro_mm - b.diametro_mm),

    caixas: [
      { tipo: 'octogonal' as TipoCaixa, qtd: caixas_map.get('octogonal') ?? 0, descricao: 'Caixa octogonal 4×4" — pontos de luz' },
      { tipo: '4x2'       as TipoCaixa, qtd: caixas_map.get('4x2')       ?? 0, descricao: 'Caixa 4×2" — tomadas e interruptores' },
      { tipo: '4x4'       as TipoCaixa, qtd: caixas_map.get('4x4')       ?? 0, descricao: 'Caixa 4×4" — TUE e derivações' },
    ].filter(c => c.qtd > 0),

    curvas_90,
    metros_totais_cabo: quants.reduce((s, q) => s + q.metros_cabo, 0),
  }
}
