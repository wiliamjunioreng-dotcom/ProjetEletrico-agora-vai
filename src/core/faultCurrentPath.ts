// src/core/faultCurrentPath.ts
// ════════════════════════════════════════════════════════════════
// FAULT CURRENT PATH — caminho completo da corrente de falta
//
// O que existe mas fragmentado:
//   electricalNet:         topologia da rede (arestas entre bornes)
//   faultSimulation:       quem atua e em quanto tempo
//   protectionCoordination: Icu, seletividade
//
// O que falta:
//   O loop completo da corrente de falta:
//   Fonte → [caminho de fase] → Ponto de Falta → [caminho de PE] → Fonte
//
//   Isso responde:
//   - "Por onde a corrente de falta circula?"
//   - "Qual é a impedância total do loop?"
//   - "Qual dispositivo enxerga qual corrente?"
//   - "O PE tem impedância suficientemente baixa?"
//
// Referência:
//   NBR 5410 §4.3.3 — proteção contra curto-circuito
//   IEC 60364-4-41 — tempos de desligamento por sistema TN/TT
//   Formula: Ia ≤ U0 / Zs (NBR/IEC — corrente de atuação ≤ U0/Ztotal)
// ════════════════════════════════════════════════════════════════

// ── Segmento de caminho elétrico ──────────────────────────────────
export interface SegmentoCaminho {
  readonly id:           string
  readonly tipo:         'FASE' | 'PE' | 'NEUTRO'
  // Localização
  readonly de_no_id:     string     // NetNode de origem
  readonly para_no_id:   string     // NetNode de destino
  // Parâmetros físicos
  readonly secao_mm2:    number
  readonly comprimento_m: number
  readonly material:     'Cu' | 'Al'
  // Impedância calculada (Ω)
  readonly resistencia_ohm: number
  // Corrente que circula por este segmento durante a falta
  readonly corrente_a:   number
}

// ── Caminho de falta completo ─────────────────────────────────────
export interface FaultCurrentPath {
  // Identificação
  readonly circuito_id:  string
  readonly ponto_falta:  string     // ID do NetNode onde ocorre a falta

  // Caminho de ida (fonte → ponto de falta via fase)
  readonly caminho_fase:  SegmentoCaminho[]
  // Caminho de volta (ponto de falta → fonte via PE)
  readonly caminho_pe:    SegmentoCaminho[]

  // Impedância do loop (Zs = Z_fase + Z_PE)
  readonly z_fase_ohm:    number
  readonly z_pe_ohm:      number
  readonly z_total_ohm:   number   // Zs total do loop

  // Corrente de falta calculada (U0 / Zs)
  readonly tensao_uf_v:   number   // tensão fase-neutro
  readonly icc_calc_a:    number   // corrente de falta calculada pelo loop
  readonly icc_presumida_ka: number  // corrente presumida (sem PE: Icc_max)

  // Verificação NBR/IEC: Ia ≤ U0/Zs
  readonly corrente_atuacao_a: number  // corrente necessária para actuar a proteção
  readonly ia_adequada:        boolean  // icc_calc ≥ corrente_atuacao

  // Dispositivo que vê a falta (mais próximo do ponto)
  readonly dispositivo_id?: string
  readonly tempo_atuacao_ms?: number

  // Avisos
  readonly avisos: AvisoFaultPath[]
}

export interface AvisoFaultPath {
  readonly tipo:       'PE_IMPEDANCIA_ALTA' | 'ATUACAO_INCERTA' | 'CORRENTE_ABAIXO_LIMIAR' | 'PE_AUSENTE'
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso'
  readonly referencia: string
}

// ── Calcular resistência de um condutor ──────────────────────────
function calcResistencia(secao_mm2: number, comprimento_m: number, material: 'Cu'|'Al' = 'Cu'): number {
  const rho = material === 'Cu' ? 0.0172 : 0.028  // Ω·mm²/m (20°C)
  // Resistência a 70°C (temperatura de operação): +28% para PVC
  return rho * comprimento_m / secao_mm2 * 1.28
}

// ── Corrente mínima de atuação pela curva do disjuntor ────────────
function correnteAtuacaoMinima(curva: 'B'|'C'|'D', in_a: number): number {
  // Limiar mínimo da zona magnética (IEC 60898-1)
  const multiplos = { B: 3, C: 5, D: 10 }
  return in_a * (multiplos[curva] ?? 5)
}

// ── Construir caminho de falta ────────────────────────────────────
export function buildFaultCurrentPath(
  circuito_id:   string,
  ponto_falta:   string,
  tensao_fn_v:   number,
  // Segmentos do caminho (fornecidos pelo chamador baseado na topologia)
  segmentos_fase: { secao_mm2: number; comprimento_m: number; de: string; para: string }[],
  segmentos_pe:   { secao_mm2: number; comprimento_m: number; de: string; para: string }[],
  // Dispositivo de proteção do circuito
  dispositivo?: { id: string; corrente_in: number; curva: 'B'|'C'|'D' }
): FaultCurrentPath {
  const avisos: AvisoFaultPath[] = []

  // ── 1. Calcular segmentos com resistências ─────────────────────
  const cam_fase: SegmentoCaminho[] = segmentos_fase.map((s, i) => {
    const r = calcResistencia(s.secao_mm2, s.comprimento_m)
    return {
      id:              `fase-${i}`,
      tipo:            'FASE',
      de_no_id:        s.de,
      para_no_id:      s.para,
      secao_mm2:       s.secao_mm2,
      comprimento_m:   s.comprimento_m,
      material:        'Cu',
      resistencia_ohm: r,
      corrente_a:      0,  // calculado abaixo
    }
  })

  const cam_pe: SegmentoCaminho[] = segmentos_pe.map((s, i) => {
    const r = calcResistencia(s.secao_mm2, s.comprimento_m)
    return {
      id:              `pe-${i}`,
      tipo:            'PE',
      de_no_id:        s.de,
      para_no_id:      s.para,
      secao_mm2:       s.secao_mm2,
      comprimento_m:   s.comprimento_m,
      material:        'Cu',
      resistencia_ohm: r,
      corrente_a:      0,
    }
  })

  // ── 2. Impedâncias ──────────────────────────────────────────────
  const z_fase = cam_fase.reduce((s, seg) => s + seg.resistencia_ohm, 0)
  const z_pe   = cam_pe.reduce((s, seg) => s + seg.resistencia_ohm, 0)
  const z_total = z_fase + z_pe

  // ── 3. Corrente de falta calculada pelo loop ─────────────────────
  const icc_calc = z_total > 0 ? tensao_fn_v / z_total : 0

  // Corrente presumida (sem impedância do PE: pior caso)
  const z_fonnte_tipico = 0.02  // impedância típica da rede
  const icc_pres = tensao_fn_v / (z_fase + z_fonnte_tipico) / 1000

  // ── 4. Verificações ─────────────────────────────────────────────
  if (cam_pe.length === 0) {
    avisos.push({
      tipo: 'PE_AUSENTE', severidade: 'erro',
      descricao: 'Condutor PE não identificado no circuito — falta fase-terra não será interrompida',
      referencia: 'NBR 5410 §6.1.1',
    })
  }

  // Verificar impedância do PE (NBR: Z_PE ≤ 2 × Z_fase para garantir atuação)
  if (cam_pe.length > 0 && z_pe > z_fase * 2) {
    avisos.push({
      tipo: 'PE_IMPEDANCIA_ALTA', severidade: 'aviso',
      descricao: `Z_PE (${z_pe.toFixed(3)}Ω) > 2×Z_fase (${(z_fase*2).toFixed(3)}Ω) — PE subdimensionado pode impedir atuação rápida`,
      referencia: 'NBR 5410 §6.1.3 — seção do PE',
    })
  }

  // Verificar corrente de atuação
  let ia_adequada = true
  let corrente_atu = 0
  let tempo_ms: number | undefined

  if (dispositivo) {
    corrente_atu = correnteAtuacaoMinima(dispositivo.curva, dispositivo.corrente_in)
    ia_adequada = icc_calc >= corrente_atu
    if (!ia_adequada) {
      avisos.push({
        tipo: 'ATUACAO_INCERTA', severidade: 'erro',
        descricao: `Icc_loop (${icc_calc.toFixed(0)}A) < Ia_min (${corrente_atu.toFixed(0)}A) — proteção pode não atuar em tempo normativo`,
        referencia: 'IEC 60364-4-41 — tempos máximos de desligamento',
      })
    }
    // Estimativa de tempo (zona magnética se Icc > Ia_min)
    tempo_ms = ia_adequada ? 5 + (1 - icc_calc/corrente_atu) * 50 : undefined
  }

  // Propagar corrente nos segmentos
  const cam_fase_final: SegmentoCaminho[] = cam_fase.map(s => ({ ...s, corrente_a: icc_calc }))
  const cam_pe_final:   SegmentoCaminho[] = cam_pe.map(s => ({ ...s, corrente_a: icc_calc }))

  return {
    circuito_id,
    ponto_falta,
    caminho_fase:        cam_fase_final,
    caminho_pe:          cam_pe_final,
    z_fase_ohm:          Math.round(z_fase * 10000) / 10000,
    z_pe_ohm:            Math.round(z_pe   * 10000) / 10000,
    z_total_ohm:         Math.round(z_total * 10000) / 10000,
    tensao_uf_v:         tensao_fn_v,
    icc_calc_a:          Math.round(icc_calc),
    icc_presumida_ka:    Math.round(icc_pres * 100) / 100,
    corrente_atuacao_a:  corrente_atu,
    ia_adequada,
    dispositivo_id:      dispositivo?.id,
    tempo_atuacao_ms:    tempo_ms,
    avisos,
  }
}

// ── Verificar atuação pelo critério IEC 60364-4-41 ────────────────
// Sistema TN: tempo ≤ 0.4s para circuitos terminais (residencial)
// Condição: Icc_loop ≥ Ia_min do dispositivo
export function verificarAtuacaoTN(path: FaultCurrentPath): {
  ok: boolean; tempo_max_s: number; descricao: string
} {
  const TEMPO_MAX_TN = 0.4   // s — circuito terminal residencial
  const ok = path.ia_adequada && path.tempo_atuacao_ms !== undefined
              && path.tempo_atuacao_ms <= TEMPO_MAX_TN * 1000
  return {
    ok,
    tempo_max_s: TEMPO_MAX_TN,
    descricao: ok
      ? `Loop OK: Icc=${path.icc_calc_a}A ≥ Ia=${path.corrente_atuacao_a}A, t<${TEMPO_MAX_TN}s`
      : `Loop INSUFICIENTE: Icc=${path.icc_calc_a}A < Ia=${path.corrente_atuacao_a}A`,
  }
}
