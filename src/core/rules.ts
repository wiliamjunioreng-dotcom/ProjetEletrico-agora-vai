// src/core/rules.ts
// ════════════════════════════════════════════════════════════════
// MOTOR DE REGRAS NORMATIVAS — ElectricalCodeEngine
//
// PRINCÍPIO: toda referência normativa passa por aqui.
// Nenhuma regra da NBR 5410 pode estar hardcoded em componente de UI.
// Quando a norma mudar, só este arquivo precisa mudar.
//
// NORMAS IMPLEMENTADAS:
//   NBR 5410:2004+Em1:2008 — Instalações elétricas BT
//   IEC 60898 — Disjuntores termomagnéticos
//   IEC 61008 — IDR (dispositivos diferenciais residuais)
//   IEC 60909 — Correntes de curto-circuito
//   NBR 5444 — Simbologia de instalações elétricas
//   CEMIG ND-5.1 — Fornecimento em tensão secundária
// ════════════════════════════════════════════════════════════════

// ── Tipo de resultado normativo ───────────────────────────────────
export type SeveridadeNorma = 'info' | 'aviso' | 'erro'

export interface ResultadoNorma {
  codigo:     string            // ex: 'NBR5410.5.1.3.1'
  descricao:  string
  norma:      string            // referência textual completa
  severidade: SeveridadeNorma
  valor?:     number            // valor calculado
  limite?:    number            // limite normativo
  conforme:   boolean
}

function ok(codigo: string, norma: string): ResultadoNorma {
  return { codigo, descricao: 'Conforme', norma, severidade: 'info', conforme: true }
}

function aviso(codigo: string, descricao: string, norma: string, valor?: number, limite?: number): ResultadoNorma {
  return { codigo, descricao, norma, severidade: 'aviso', valor, limite, conforme: false }
}

function erro(codigo: string, descricao: string, norma: string, valor?: number, limite?: number): ResultadoNorma {
  return { codigo, descricao, norma, severidade: 'erro', valor, limite, conforme: false }
}

// ════════════════════════════════════════════════════════════════
// REGRAS NBR 5410 — CAPÍTULO 5: PROTEÇÃO
// ════════════════════════════════════════════════════════════════

// NBR 5410 §5.1.3.1 — Tripartida: Ib ≤ In ≤ Iz'
export function regra_tripartida(ib: number, in_disj: number, iz_efetiva: number): ResultadoNorma[] {
  const resultados: ResultadoNorma[] = []
  const norma = 'NBR 5410:2004 item 5.1.3.1'

  if (ib > in_disj) {
    resultados.push(erro(
      'NBR5410.5.1.3.1.a',
      `Corrente de projeto Ib(${ib.toFixed(2)}A) > In do disjuntor (${in_disj}A) — condutor sobrecarregado`,
      norma, ib, in_disj
    ))
  }

  if (in_disj > iz_efetiva && iz_efetiva > 0) {
    resultados.push(erro(
      'NBR5410.5.1.3.1.b',
      `In do disjuntor (${in_disj}A) > Iz' do cabo (${iz_efetiva.toFixed(1)}A) — disjuntor não protege o cabo`,
      norma, in_disj, iz_efetiva
    ))
  }

  if (resultados.length === 0) resultados.push(ok('NBR5410.5.1.3.1', norma))
  return resultados
}

// NBR 5410 §5.1.3.2 — Proteção contra sobrecarga: In ≤ 1,45 × Iz nominal
export function regra_sobrecarga(in_disj: number, iz_nominal: number): ResultadoNorma {
  const norma  = 'NBR 5410:2004 item 5.1.3.2'
  const limite = 1.45 * iz_nominal
  if (in_disj > limite) {
    return aviso(
      'NBR5410.5.1.3.2',
      `In(${in_disj}A) > 1,45 × Iz(${iz_nominal}A) = ${limite.toFixed(1)}A — risco de sobrecarga lenta`,
      norma, in_disj, limite
    )
  }
  return ok('NBR5410.5.1.3.2', norma)
}

// NBR 5410 §5.1.3.6.1 — IDR obrigatório em áreas molhadas
export function regra_idr_area_molhada(descricao: string, tem_idr: boolean): ResultadoNorma {
  const norma = 'NBR 5410:2004 item 5.1.3.6.1'
  const AREAS_MOLHADAS = ['banho','lavabo','cozinha','lavanderia','servico',
    'externo','varanda','sacada','garagem','churrasq','jardim','piscina']
  const desc_lower = descricao.toLowerCase()
  const eh_molhado = AREAS_MOLHADAS.some(a => desc_lower.includes(a))

  if (eh_molhado && !tem_idr) {
    return erro(
      'NBR5410.5.1.3.6.1',
      `Circuito em área molhada ("${descricao}") sem IDR 30mA — obrigatório`,
      norma
    )
  }
  return ok('NBR5410.5.1.3.6.1', norma)
}

// ════════════════════════════════════════════════════════════════
// REGRAS NBR 5410 — CAPÍTULO 6: DIMENSIONAMENTO
// ════════════════════════════════════════════════════════════════

// NBR 5410 §6.2.5 — Seção mínima por tipo de circuito
export const SECAO_MINIMA_NBR: Record<string, number> = {
  ILUM: 1.5,   // mm²
  TUG:  2.5,
  TUE:  2.5,
  GERAL: 2.5,
}

export function regra_secao_minima(tipo: string, secao_mm2: number): ResultadoNorma {
  const norma  = 'NBR 5410:2004 item 6.2.5'
  const minimo = SECAO_MINIMA_NBR[tipo] ?? 1.5
  if (secao_mm2 < minimo) {
    return erro(
      'NBR5410.6.2.5',
      `Seção ${secao_mm2}mm² < mínimo (${minimo}mm²) para circuito ${tipo}`,
      norma, secao_mm2, minimo
    )
  }
  return ok('NBR5410.6.2.5', norma)
}

// NBR 5410 §6.2.7 — Queda de tensão máxima
export function regra_queda_tensao(
  du_pct: number, du_max_pct: number, du_ramal_pct: number
): ResultadoNorma {
  const norma    = 'NBR 5410:2004 item 6.2.7.2'
  const du_disp  = du_max_pct - du_ramal_pct
  const limite   = du_max_pct  // total do ramal + circuito = 7% max

  if (du_pct > du_disp) {
    const sev = du_pct > limite ? 'erro' : 'aviso'
    return {
      codigo: 'NBR5410.6.2.7',
      descricao: `ΔU=${du_pct.toFixed(2)}% > disponível (${du_disp.toFixed(1)}%) — reserva do ramal: ${du_ramal_pct}%`,
      norma, severidade: sev, valor: du_pct, limite: du_disp, conforme: false,
    }
  }
  return ok('NBR5410.6.2.7', norma)
}

// NBR 5410 §6.2.11 — Ocupação máxima de eletroduto (35%)
export function regra_ocupacao_eletroduto(taxa_pct: number): ResultadoNorma {
  const norma = 'NBR 5410:2004 item 6.2.11'
  if (taxa_pct > 35) {
    return erro(
      'NBR5410.6.2.11',
      `Ocupação ${taxa_pct.toFixed(1)}% > 35% — eletroduto subdimensionado`,
      norma, taxa_pct, 35
    )
  }
  if (taxa_pct > 30) {
    return aviso(
      'NBR5410.6.2.11',
      `Ocupação ${taxa_pct.toFixed(1)}% — próxima do limite (35%)`,
      norma, taxa_pct, 35
    )
  }
  return ok('NBR5410.6.2.11', norma)
}

// ════════════════════════════════════════════════════════════════
// REGRAS NBR 5410 — CAPÍTULO 9: CIRCUITOS TERMINAIS
// ════════════════════════════════════════════════════════════════

// NBR 5410 §9.5.2.1 — Mínimo de pontos de iluminação
export function regra_ilum_minimo(area_m2: number, ilum_va: number): ResultadoNorma {
  const norma   = 'NBR 5410:2004 item 9.5.2.1'
  const n_pontos_min = area_m2 <= 6 ? 1 : Math.ceil(area_m2 / 6)
  const minimo  = n_pontos_min * 100  // 100VA por ponto

  if (ilum_va < minimo) {
    return aviso(
      'NBR5410.9.5.2.1',
      `Carga de iluminação (${ilum_va}VA) < mínimo normativo (${minimo}VA para ${area_m2}m²)`,
      norma, ilum_va, minimo
    )
  }
  return ok('NBR5410.9.5.2.1', norma)
}

// NBR 5410 §9.5.2.2 — Corrente de TUG com 2,5mm²: máximo recomendado 10A
export function regra_tug_corrente(ib: number, secao_mm2: number): ResultadoNorma {
  const norma = 'NBR 5410:2004 item 9.5.2.2'
  if (secao_mm2 <= 2.5 && ib > 10) {
    return aviso(
      'NBR5410.9.5.2.2',
      `Ib=${ib.toFixed(1)}A > 10A em TUG 2,5mm² — considerar desmembrar o circuito`,
      norma, ib, 10
    )
  }
  return ok('NBR5410.9.5.2.2', norma)
}

// NBR 5410 §9.5.3.3 — Mistura ILUM+TUG: Ib ≤ 16A em habitações
export function regra_mistura_ilum_tug(descricao: string, ib: number): ResultadoNorma {
  const norma = 'NBR 5410:2004 item 9.5.3.3'
  const tem_ilum = descricao.toUpperCase().includes('ILUM')
  const tem_tug  = descricao.toUpperCase().includes('TUG')

  if (tem_ilum && tem_tug && ib > 16) {
    return erro(
      'NBR5410.9.5.3.3',
      `Mistura ILUM+TUG com Ib=${ib.toFixed(1)}A > 16A — circuitos obrigatoriamente separados`,
      norma, ib, 16
    )
  }
  return ok('NBR5410.9.5.3.3', norma)
}

// ════════════════════════════════════════════════════════════════
// REGRAS NBR 5410 — §6.5.4.7: RESERVAS DO QD
// ════════════════════════════════════════════════════════════════

export function calcularReservasQD(n_ativos: number): number {
  if (n_ativos <= 6)  return 2
  if (n_ativos <= 12) return 3
  if (n_ativos <= 30) return 4
  return Math.ceil(n_ativos * 0.15)
}

export function regra_reservas_qd(n_ativos: number, n_reservas: number): ResultadoNorma {
  const norma   = 'NBR 5410:2004 item 6.5.4.7'
  const minimo  = calcularReservasQD(n_ativos)
  if (n_reservas < minimo) {
    return aviso(
      'NBR5410.6.5.4.7',
      `QD com ${n_reservas} reserva(s) < mínimo (${minimo}) para ${n_ativos} circuitos ativos`,
      norma, n_reservas, minimo
    )
  }
  return ok('NBR5410.6.5.4.7', norma)
}

// ════════════════════════════════════════════════════════════════
// REGRAS CEMIG ND-5.1 — DEMANDA
// ════════════════════════════════════════════════════════════════

// Fator de demanda CEMIG por faixa de potência instalada
export function getFatorDemandaCEMIG(ci_kw: number): number {
  if (ci_kw <= 0)   return 1.0
  if (ci_kw <= 2)   return 1.0
  if (ci_kw <= 3)   return 0.90
  if (ci_kw <= 4)   return 0.87
  if (ci_kw <= 5)   return 0.84
  if (ci_kw <= 6)   return 0.80
  if (ci_kw <= 7)   return 0.78
  if (ci_kw <= 8)   return 0.76
  if (ci_kw <= 9)   return 0.74
  if (ci_kw <= 10)  return 0.72
  if (ci_kw <= 12)  return 0.70
  if (ci_kw <= 15)  return 0.68
  if (ci_kw <= 20)  return 0.65
  if (ci_kw <= 25)  return 0.62
  if (ci_kw <= 30)  return 0.60
  return 0.55  // > 30kW
}

// ════════════════════════════════════════════════════════════════
// APLICAÇÃO DE TODAS AS REGRAS (ponto de entrada único)
// ════════════════════════════════════════════════════════════════

export interface InputRegras {
  tipo:        string       // ILUM | TUG | TUE
  descricao:   string
  ib:          number
  in_disj:     number
  iz_nominal:  number
  iz_efetiva:  number
  secao_mm2:   number
  du_pct:      number
  du_max_pct:  number
  du_ramal_pct:number
  idr:         boolean
}

export function aplicarTodasRegras(input: InputRegras): ResultadoNorma[] {
  return [
    ...regra_tripartida(input.ib, input.in_disj, input.iz_efetiva),
    regra_sobrecarga(input.in_disj, input.iz_nominal),
    regra_secao_minima(input.tipo, input.secao_mm2),
    regra_queda_tensao(input.du_pct, input.du_max_pct, input.du_ramal_pct),
    regra_idr_area_molhada(input.descricao, input.idr),
    regra_tug_corrente(input.ib, input.secao_mm2),
    regra_mistura_ilum_tug(input.descricao, input.ib),
  ].filter(r => !r.conforme)  // só retorna violações
}

// Status geral de um conjunto de resultados
export function statusGeral(resultados: ResultadoNorma[]): 'OK'|'AVISO'|'ERRO' {
  if (resultados.some(r => r.severidade === 'erro'))  return 'ERRO'
  if (resultados.some(r => r.severidade === 'aviso')) return 'AVISO'
  return 'OK'
}
