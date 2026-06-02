// src/core/powerDistribution.ts
// ════════════════════════════════════════════════════════════════
// POWER DISTRIBUTION ENGINE
//
// Hoje: DemandaResult é um escalar global.
// Problema: potência não se distribui uniformemente.
//   - alimentador suporta demanda real (não soma bruta)
//   - ramal tem queda própria
//   - QD tem queda interna
//   - circuito tem queda individual
//   - corrente de curto varia por ponto
//
// PowerDistributionEngine modela:
//   SistemaDeFornecimento → entrada de energia (concessionária)
//   AlimentadorSegmento   → ramal de entrada + ramal QD
//   DistribuicaoQD        → como potência se distribui no QD
//   QuedaTotal            → coordenação: ramal + QD + circuito
//
// Distinção fundamental:
//   Carga instalada ≠ Demanda da instalação
//   Demanda = carga_instalada × fator_demanda × simultaneidade
//
// Referência: NBR 5410 §5.3, ABNT NBR 14039, CEMIG ND 5.1
// ════════════════════════════════════════════════════════════════

// ── Sistema de Fornecimento ───────────────────────────────────────
// O que a concessionária fornece na entrada do imóvel
export type PadraoFornecimento =
  | 'MONO_127_220'      // monofásico 127/220V (1F+N)
  | 'BIFASICO_127_220'  // bifásico 127/220V (2F+N)
  | 'TRIFASICO_127_220' // trifásico 127/220V (3F+N)
  | 'TRIFASICO_220_380' // trifásico 220/380V (3F+N)
  | 'DELTA_220'         // delta 220V (3F s/ neutro)

export interface SistemaDeFornecimento {
  readonly padrao:         PadraoFornecimento
  readonly tensao_fn_v:    127 | 220     // fase-neutro
  readonly tensao_ff_v:    220 | 380     // fase-fase
  readonly n_fases:        1 | 2 | 3
  readonly neutro:         boolean
  // Capacidade do padrão da concessionária
  readonly capacidade_kva: number        // ex: 5, 10, 15, 25 kVA
  // Aterramento
  readonly tipo_aterramento: 'TN-S' | 'TN-C-S' | 'TT' | 'IT'
}

// Padrões predefinidos por concessionária/norma
export const PADROES_FORNECIMENTO: Record<PadraoFornecimento, Omit<SistemaDeFornecimento, 'capacidade_kva'>> = {
  MONO_127_220:      { padrao:'MONO_127_220',      tensao_fn_v:127, tensao_ff_v:220, n_fases:1, neutro:true, tipo_aterramento:'TN-S' },
  BIFASICO_127_220:  { padrao:'BIFASICO_127_220',  tensao_fn_v:127, tensao_ff_v:220, n_fases:2, neutro:true, tipo_aterramento:'TN-S' },
  TRIFASICO_127_220: { padrao:'TRIFASICO_127_220', tensao_fn_v:127, tensao_ff_v:220, n_fases:3, neutro:true, tipo_aterramento:'TN-S' },
  TRIFASICO_220_380: { padrao:'TRIFASICO_220_380', tensao_fn_v:220, tensao_ff_v:380, n_fases:3, neutro:true, tipo_aterramento:'TN-S' },
  DELTA_220:         { padrao:'DELTA_220',         tensao_fn_v:220, tensao_ff_v:220, n_fases:3, neutro:false, tipo_aterramento:'IT'  },
}

// ── Segmento de alimentador ────────────────────────────────────────
// Um trecho de cabo entre dois pontos (ex: padrão → medidor → QD)
export interface SegmentoAlimentador {
  readonly id:           string
  readonly descricao:    string    // ex: "Ramal de entrada" ou "Alimentador QD2"
  readonly comprimento_m: number
  readonly secao_mm2:    number
  readonly material:     'Cu' | 'Al'
  readonly corrente_a:   number    // corrente de projeto neste trecho
  // Queda calculada
  readonly queda_v:      number    // queda em volts
  readonly queda_pct:    number    // % da tensão nominal
}

// ── Demanda da instalação ─────────────────────────────────────────
export interface DemandaInstalacao {
  readonly carga_instalada_kva: number    // soma bruta de todos os circuitos
  readonly fator_demanda:       number    // 0.0–1.0 (NBR 5410 / CEMIG)
  readonly demanda_maxima_kva:  number    // carga_instalada × fd
  readonly corrente_demanda_a:  number    // I = demanda / (√3 × V) ou (V mono)
  // Por fase
  readonly carga_por_fase_kva: { R: number; S: number; T: number }
  readonly desequilibrio_pct:  number
  // Alimentador necessário
  readonly secao_alim_min_mm2: number    // seção mínima do alimentador
  readonly in_geral_a:         number    // corrente do DG
  readonly tipo_ligacao:       string    // ex: "trifásico 220/380V"
}

// ── Queda de tensão coordenada ────────────────────────────────────
// Total do ramal de entrada + QD + circuito
export interface QuedaCoordinada {
  readonly circuito_id: string
  readonly queda_ramal_pct:    number    // queda no ramal de entrada
  readonly queda_qd_pct:       number    // queda interna do QD (estimada)
  readonly queda_circuito_pct: number    // queda no circuito individual
  readonly queda_total_pct:    number    // soma
  readonly dentro_limite:      boolean   // < 7% total (NBR 5410 §5.3.3)
  readonly limite_pct:         number    // 4% final, 3% intermediário...
  readonly margem_pct:         number    // quanto sobra do limite
}

// ── PowerDistributionEngine ───────────────────────────────────────
export interface DistribuicaoPotencia {
  readonly sistema:     SistemaDeFornecimento
  readonly demanda:     DemandaInstalacao
  readonly alimentador: SegmentoAlimentador
  readonly quedas:      QuedaCoordinada[]
  readonly avisos:      AvisoPDE[]
}

export interface AvisoPDE {
  readonly tipo:         'QUEDA_TOTAL' | 'ALIMENTADOR_SUBDIMENSIONADO' |
                         'DESEQUILIBRIO' | 'DEMANDA_EXCEDE_PADRAO' | 'CAPACIDADE_INSUFICIENTE'
  readonly descricao:   string
  readonly severidade:  'erro' | 'aviso'
  readonly referencia?: string   // ex: "NBR 5410 §5.3.3"
}

// ── Calcular demanda (NBR 5410 + tabelas CEMIG) ───────────────────
// Fator de demanda por potência total (NBR 5410 Tabela B.1 simplificada)
export function calcFatorDemanda(carga_total_kva: number): number {
  if (carga_total_kva <= 3)   return 1.00
  if (carga_total_kva <= 5)   return 0.90
  if (carga_total_kva <= 10)  return 0.80
  if (carga_total_kva <= 15)  return 0.75
  if (carga_total_kva <= 20)  return 0.70
  if (carga_total_kva <= 30)  return 0.65
  return 0.60   // > 30 kVA: alta instalação
}

export function calcDemanda(
  circuitos:  { id: string; potencia_va: number; fase: 'R'|'S'|'T'; fp?: number }[],
  sistema:    SistemaDeFornecimento
): DemandaInstalacao {
  // Carga instalada por fase
  const por_fase: Record<'R'|'S'|'T', number> = { R: 0, S: 0, T: 0 }
  for (const c of circuitos) {
    por_fase[c.fase] = (por_fase[c.fase] ?? 0) + c.potencia_va
  }

  const ci_va = Object.values(por_fase).reduce((s, v) => s + v, 0)
  const ci_kva = ci_va / 1000
  const fd     = calcFatorDemanda(ci_kva)
  const dem_kva = ci_kva * fd

  // Corrente de demanda
  const tensao = sistema.tensao_ff_v
  const corr_dem = sistema.n_fases >= 3
    ? dem_kva * 1000 / (Math.sqrt(3) * tensao)
    : dem_kva * 1000 / (sistema.tensao_fn_v)

  // Desequilíbrio
  const vals = Object.values(por_fase)
  const media = vals.reduce((s, v) => s + v, 0) / 3
  const deseq = media > 0 ? Math.max(...vals.map(v => Math.abs(v - media))) / media * 100 : 0

  // Seção mínima do alimentador (NBR 5410 §6.2.1 — SIMPLIFICADO)
  const secao_alim = corr_dem <= 25 ? 6 : corr_dem <= 35 ? 10 : corr_dem <= 50 ? 16
                   : corr_dem <= 70 ? 25 : corr_dem <= 95 ? 35 : 50

  // Corrente do DG: próximo padrão comercial acima de corr_dem × 1.25
  const in_calculado = corr_dem * 1.25
  const in_geral = [16,20,25,32,40,50,63,80,100,125,160,200].find(v => v >= in_calculado) ?? 200

  return {
    carga_instalada_kva: Math.round(ci_kva * 100) / 100,
    fator_demanda:       fd,
    demanda_maxima_kva:  Math.round(dem_kva * 100) / 100,
    corrente_demanda_a:  Math.round(corr_dem * 10) / 10,
    carga_por_fase_kva:  { R: por_fase.R/1000, S: por_fase.S/1000, T: por_fase.T/1000 },
    desequilibrio_pct:   Math.round(deseq),
    secao_alim_min_mm2:  secao_alim,
    in_geral_a:          in_geral,
    tipo_ligacao:        sistema.n_fases >= 3 ? `trifásico ${sistema.tensao_fn_v}/${sistema.tensao_ff_v}V`
                       : sistema.n_fases === 2 ? `bifásico ${sistema.tensao_ff_v}V`
                       : `monofásico ${sistema.tensao_fn_v}V`,
  }
}

// ── Calcular queda coordenada ─────────────────────────────────────
// Responsividade real: fio_ramal + QD + circuito ≤ 7% (NBR §5.3.3)
// Limite parcial: circuito ≤ 4% (residencial), ramal contribui com o restante
export function calcQuedaCoordinada(
  circuito: { id: string; corrente_a: number; secao_mm2: number; comprimento_m: number },
  alimentador: SegmentoAlimentador,
  tensao_v: number
): QuedaCoordinada {
  const LIMITE_TOTAL_PCT = 7   // NBR 5410 §5.3.3 — total ramal + circuito
  // Resistividade do cobre: 0.0172 Ω·mm²/m
  const RES_CU = 0.0172
  const queda_circ_v = (2 * (circuito.comprimento_m || 0)) * circuito.corrente_a * RES_CU / circuito.secao_mm2

  const queda_circ_pct = queda_circ_v / tensao_v * 100

  const queda_total_pct = alimentador.queda_pct + queda_circ_pct + 0.5  // 0.5% interna QD

  return {
    circuito_id:         circuito.id,
    queda_ramal_pct:     Math.round(alimentador.queda_pct * 10) / 10,
    queda_qd_pct:        0.5,
    queda_circuito_pct:  Math.round(queda_circ_pct * 10) / 10,
    queda_total_pct:     Math.round(queda_total_pct * 10) / 10,
    dentro_limite:       queda_total_pct <= LIMITE_TOTAL_PCT,
    limite_pct:          LIMITE_TOTAL_PCT,
    margem_pct:          Math.round((LIMITE_TOTAL_PCT - queda_total_pct) * 10) / 10,
  }
}

// ── BuildPowerDistribution ────────────────────────────────────────
export function buildPowerDistribution(
  circuitos:   { id: string; potencia_va: number; fase: 'R'|'S'|'T'; corrente_a: number; secao_mm2: number; comprimento_m: number }[],
  sistema:     SistemaDeFornecimento,
  comp_ramal_m: number,
  secao_ramal:  number
): DistribuicaoPotencia {
  const avisos: AvisoPDE[] = []

  // 1. Calcular demanda
  const demanda = calcDemanda(circuitos, sistema)

  // 2. Alimentador
  const RES_CU = 0.0172
  const queda_alim_v = 2 * comp_ramal_m * demanda.corrente_demanda_a * RES_CU / secao_ramal
  const queda_alim_pct = queda_alim_v / sistema.tensao_fn_v * 100
  const alimentador: SegmentoAlimentador = {
    id: 'alim-principal', descricao: 'Ramal de entrada',
    comprimento_m: comp_ramal_m,
    secao_mm2: secao_ramal,
    material: 'Cu',
    corrente_a: demanda.corrente_demanda_a,
    queda_v:  Math.round(queda_alim_v * 100) / 100,
    queda_pct: Math.round(queda_alim_pct * 10) / 10,
  }

  // 3. Quedas por circuito
  const quedas: QuedaCoordinada[] = circuitos.map(c => {
    const qv = 2 * c.comprimento_m * c.corrente_a * RES_CU / c.secao_mm2
    const qp = qv / sistema.tensao_fn_v * 100
    const total = queda_alim_pct + qp + 0.5
    return {
      circuito_id:         c.id,
      queda_ramal_pct:     queda_alim_pct,
      queda_qd_pct:        0.5,
      queda_circuito_pct:  Math.round(qp * 10) / 10,
      queda_total_pct:     Math.round(total * 10) / 10,
      dentro_limite:       total <= 7,
      limite_pct:          7,
      margem_pct:          Math.round((7 - total) * 10) / 10,
    }
  })

  // 4. Avisos
  if (demanda.desequilibrio_pct > 10) {
    avisos.push({ tipo:'DESEQUILIBRIO', severidade:'aviso',
      descricao:`Desequilíbrio de fases ${demanda.desequilibrio_pct}% > 10%`, referencia:'NBR 5410' })
  }
  if (demanda.corrente_demanda_a > sistema.capacidade_kva * 1000 / sistema.tensao_fn_v) {
    avisos.push({ tipo:'DEMANDA_EXCEDE_PADRAO', severidade:'erro',
      descricao:`Demanda ${demanda.demanda_maxima_kva.toFixed(1)}kVA > padrão ${sistema.capacidade_kva}kVA`,
      referencia:'ABNT NBR 14039' })
  }
  const quedas_excedidas = quedas.filter(q => !q.dentro_limite)
  if (quedas_excedidas.length > 0) {
    avisos.push({ tipo:'QUEDA_TOTAL', severidade:'erro',
      descricao:`${quedas_excedidas.length} circuito(s) com queda total > 7% (NBR §5.3.3)`, referencia:'NBR 5410 §5.3.3' })
  }
  if (secao_ramal < demanda.secao_alim_min_mm2) {
    avisos.push({ tipo:'ALIMENTADOR_SUBDIMENSIONADO', severidade:'erro',
      descricao:`Ramal ${secao_ramal}mm² < mínimo calculado ${demanda.secao_alim_min_mm2}mm²`, referencia:'NBR 5410 §6.2.1' })
  }

  return { sistema, demanda, alimentador, quedas, avisos }
}
