// src/core/minFaultCurrentAnalysis.ts
// ════════════════════════════════════════════════════════════════
// MINIMUM FAULT CURRENT ANALYSIS
//
// O sistema até agora calculava Icc NOMINAL (condições ideais).
// Problema real: proteção deve funcionar no PIOR CENÁRIO.
//
// Piores casos que reduzem Icc:
//   1. Cabo quente (máxima temperatura → máxima resistência)
//   2. Final de linha (máximo comprimento → máxima impedância)
//   3. Tensão mínima (tolerância -10% da concessionária)
//   4. Falta fase-terra (em vez de fase-fase: menor tensão de loop)
//   5. Resistência de contato (falta de alta impedância)
//
// O critério IEC 60364-4-41 (NBR 5410 §4.1.1):
//   Sistema TN: Ia ≤ U0 / Zs
//   Onde Ia = corrente de atuação MÍNIMA do dispositivo
//   E Zs = impedância MÁXIMA do loop (pior caso)
//
// Se Icc_minimo < Ia_minimo → proteção pode NÃO atuar!
// Isso é um risco real de segurança elétrica.
//
// Referência:
//   IEC 60364-4-41 §411.4.4 — sistema TN
//   NBR 5410 §4.1.1 — proteção contra choque elétrico por desligamento
//   IEC 60898-1 Tabela 1 — tempos máximos de desligamento
// ════════════════════════════════════════════════════════════════

// ── Fatores de pior caso ──────────────────────────────────────────
// Resistividade do cobre a diferentes temperaturas
// ρ(T) = ρ20 × [1 + α(T - 20)]
// ρ20 = 0.0172 Ω·mm²/m, α = 0.00393 /°C
export function resistividadeCobre(temp_c: number): number {
  return 0.0172 * (1 + 0.00393 * (temp_c - 20))
}

// Temperaturas de operação por tipo de isolação (NBR 5410 Tabela 4)
export const TEMP_OPERACAO: Record<string, number> = {
  'PVC':  70,   // °C — temperatura máxima normal de operação
  'XLPE': 90,   // °C
  'EPR':  90,   // °C
  'borracha': 85,
}

// Tolerância de tensão da concessionária (ANEEL Módulo 8)
export const TOLERANCIA_TENSAO = {
  MIN_PCT: -10,   // -10% da tensão nominal
  MAX_PCT: +5,    // +5% da tensão nominal
}

// ── Resistência do condutor no pior caso térmico ──────────────────
export function resistenciaPiorCaso(
  secao_mm2:    number,
  comprimento_m: number,
  isolacao = 'PVC',
  material:     'Cu' | 'Al' = 'Cu'
): number {
  const temp = TEMP_OPERACAO[isolacao] ?? 70
  const rho  = material === 'Cu'
    ? resistividadeCobre(temp)
    : resistividadeCobre(temp) * (0.028 / 0.0172)  // Al relativo ao Cu
  return rho * comprimento_m / secao_mm2
}

// ── Análise de corrente mínima de falta ──────────────────────────
export interface MinFaultAnalysis {
  // Identificação
  readonly circuito_id:   string
  readonly ponto_id:      string

  // Parâmetros de pior caso
  readonly tensao_nominal_v:  number
  readonly tensao_minima_v:   number   // U0 × (1 - 10%)
  readonly temp_cabo_c:       number   // temperatura do cabo no pior caso

  // Impedâncias de pior caso
  readonly z_fase_max_ohm:    number   // resistência máxima da fase (cabo quente)
  readonly z_pe_max_ohm:      number   // resistência máxima do PE
  readonly z_total_max_ohm:   number   // Zs máximo

  // Corrente mínima de falta
  readonly icc_min_a:         number   // = U0_min / Zs_max
  // Para comparação: Icc nominal (condições ideais)
  readonly icc_nominal_a:     number

  // Corrente mínima de atuação do dispositivo
  readonly ia_min_a:          number   // = fator × In do disjuntor (zona magnética)
  readonly curva:             'B' | 'C' | 'D'
  readonly in_a:              number

  // VEREDICTO: a proteção funciona no pior caso?
  readonly protecao_funcional: boolean
  readonly fator_seguranca:    number   // icc_min / ia_min (deve ser ≥ 1)

  // Tempos de desligamento
  readonly tempo_max_s:        number   // limite IEC (0.4s residencial)
  readonly dentro_limite:      boolean

  // Avisos
  readonly avisos:             AvisoMFA[]
}

export interface AvisoMFA {
  readonly tipo:       'CORRENTE_INSUFICIENTE' | 'FATOR_BAIXO' | 'PROTECAO_INCERTA' | 'PE_SUBDIMENSIONADO'
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso'
  readonly referencia: string
  readonly acao?:      string
}

// Corrente mínima de atuação na zona magnética (pior caso = limiar inferior)
function iaMinimo(curva: 'B'|'C'|'D', in_a: number): number {
  const fatores = { B: 3, C: 5, D: 10 }
  return in_a * (fatores[curva] ?? 5)
}

// ── Construir análise ─────────────────────────────────────────────
export function buildMinFaultAnalysis(
  circuito_id:   string,
  ponto_id:      string,
  tensao_fn_v:   number,
  secao_fase_mm2: number,
  secao_pe_mm2:   number,
  comprimento_m:  number,
  isolacao:       string,
  curva:          'B'|'C'|'D',
  in_a:           number,
): MinFaultAnalysis {
  const avisos: AvisoMFA[] = []

  // Tensão mínima (pior caso da rede)
  const tensao_min = tensao_fn_v * (1 + TOLERANCIA_TENSAO.MIN_PCT / 100)
  const temp       = TEMP_OPERACAO[isolacao] ?? 70

  // Resistências no pior caso (cabo quente, comprimento total)
  const z_fase = resistenciaPiorCaso(secao_fase_mm2, comprimento_m, isolacao)
  const z_pe   = resistenciaPiorCaso(secao_pe_mm2,   comprimento_m, isolacao)
  const z_total = z_fase + z_pe

  // Correntes
  const icc_min     = tensao_min / z_total
  const icc_nominal = tensao_fn_v / (
    resistenciaPiorCaso(secao_fase_mm2, comprimento_m, 'PVC') * 0.78 +  // cabo frio (20°C)
    resistenciaPiorCaso(secao_pe_mm2,   comprimento_m, 'PVC') * 0.78
  )  // 0.78 = fator de conversão PVC20°C→resistência nominal

  const ia_min = iaMinimo(curva, in_a)
  const fator  = icc_min / ia_min

  // Verificação IEC 60364-4-41 §411.4.4
  const TEMPO_MAX_TN = 0.4   // s — circuitos terminais residenciais
  const protecao_ok  = fator >= 1.0

  // Avisos
  if (!protecao_ok) {
    avisos.push({
      tipo: 'CORRENTE_INSUFICIENTE', severidade: 'erro',
      descricao: `Icc_mín (${icc_min.toFixed(0)}A) < Ia_mín (${ia_min.toFixed(0)}A) — proteção pode NÃO atuar no pior caso`,
      referencia: 'IEC 60364-4-41 §411.4.4 | NBR 5410 §4.1.1',
      acao:       `Reduzir comprimento, aumentar seção (atual: ${secao_fase_mm2}mm²), ou usar curva de menor limiar`,
    })
  } else if (fator < 1.5) {
    avisos.push({
      tipo: 'FATOR_BAIXO', severidade: 'aviso',
      descricao: `Fator de segurança ${fator.toFixed(1)} < 1.5 recomendado — margem reduzida`,
      referencia: 'Boas práticas — fator ≥ 1.5 para margem operacional',
    })
  }

  // PE subdimensionado (z_pe > z_fase): piora Icc mais do necessário
  if (z_pe > z_fase * 1.5) {
    avisos.push({
      tipo: 'PE_SUBDIMENSIONADO', severidade: 'aviso',
      descricao: `Z_PE (${z_pe.toFixed(3)}Ω) > 1.5×Z_fase — PE subdimensionado aumenta impedância do loop`,
      referencia: 'NBR 5410 Tabela 5 — seção mínima do PE',
    })
  }

  return {
    circuito_id, ponto_id,
    tensao_nominal_v:  tensao_fn_v,
    tensao_minima_v:   Math.round(tensao_min * 10) / 10,
    temp_cabo_c:       temp,
    z_fase_max_ohm:    Math.round(z_fase  * 10000) / 10000,
    z_pe_max_ohm:      Math.round(z_pe    * 10000) / 10000,
    z_total_max_ohm:   Math.round(z_total * 10000) / 10000,
    icc_min_a:         Math.round(icc_min),
    icc_nominal_a:     Math.round(icc_nominal),
    ia_min_a:          ia_min,
    curva, in_a,
    protecao_funcional: protecao_ok,
    fator_seguranca:    Math.round(fator * 100) / 100,
    tempo_max_s:        TEMPO_MAX_TN,
    dentro_limite:      protecao_ok,
    avisos,
  }
}

// ── Varredura de comprimento máximo permitido ─────────────────────
// Responde: "qual o comprimento máximo para este cabo/disjuntor?"
export function comprimentoMaximo(
  secao_fase_mm2: number,
  secao_pe_mm2:   number,
  tensao_fn_v:    number,
  isolacao:       string,
  curva:          'B'|'C'|'D',
  in_a:           number,
): { comprimento_max_m: number; icc_no_limite_a: number } {
  const tensao_min = tensao_fn_v * 0.90
  const ia_min     = iaMinimo(curva, in_a)
  const temp       = TEMP_OPERACAO[isolacao] ?? 70
  const rho_fase   = resistividadeCobre(temp) / secao_fase_mm2
  const rho_pe     = resistividadeCobre(temp) / secao_pe_mm2
  const rho_total  = rho_fase + rho_pe

  // Zs_max = U0_min / Ia_min → Comprimento = Zs_max / rho_total
  const zs_max    = tensao_min / ia_min
  const comp_max  = zs_max / rho_total

  return {
    comprimento_max_m: Math.floor(comp_max * 10) / 10,
    icc_no_limite_a:   Math.round(ia_min),
  }
}
