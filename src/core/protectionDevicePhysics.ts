// src/core/protectionDevicePhysics.ts
// ════════════════════════════════════════════════════════════════
// PROTECTION DEVICE PHYSICS — física real do dispositivo de proteção
//
// Hoje:
//   estimarTempoAtuacao: tempo = 5 + random×5 ms (estimativa grosseira)
//   I²t no faultSimulation: usa seção mínima fixa
//
// O que falta:
//   - Curvas I×t precisas por zona (térmica vs magnética)
//   - I²t let-through real por dispositivo (da curva do fabricante)
//   - Verificação térmica: I²t_dispositivo ≤ k²S² do cabo
//   - Capacidade de limitação (disjuntores limitadores de corrente)
//
// Referência:
//   IEC 60898-1 — curvas B/C/D para disjuntores residenciais
//   IEC 60947-2 — disjuntores industriais (MCCB, ACB)
//   NBR 5410 §6.2.1 — proteção de condutores por sobrecorrente
//   Formula: I²t_passante ≤ k² × S² (capacidade térmica do cabo)
//   k = 115 para Cu/PVC, 143 para Cu/XLPE, 74 para Al/PVC
// ════════════════════════════════════════════════════════════════

// ── Fatores k por isolação e material (NBR 5410 Tabela B.1) ──────
export const FATOR_K: Record<string, number> = {
  'Cu/PVC':   115,   // condutor de cobre com isolação PVC
  'Cu/XLPE':  143,   // condutor de cobre com isolação XLPE/EPR
  'Al/PVC':   74,    // condutor de alumínio com isolação PVC
  'Al/XLPE':  94,    // condutor de alumínio com isolação XLPE
  'Cu/borracha': 141,
}

// ── Capacidade térmica do cabo: I²t ≤ k²S² ───────────────────────
export function capacidadeTermica(secao_mm2: number, isolacao = 'Cu/PVC'): number {
  const k = FATOR_K[isolacao] ?? 115
  return (k * secao_mm2) ** 2  // A²s
}

// ── Curva I×t por zona (IEC 60898-1 — simplificado analítico) ────
// Para zona térmica: t ≈ A / (I/In)²  (parábola log-log)
// Para zona magnética: t = t_instant (conforme multiplicador de In)
// Os parâmetros A são derivados dos limites normativos de IEC 60898-1

// Limites da zona magnética (múltiplos de In)
export const ZONA_MAGNETICA: Record<'B'|'C'|'D', { min: number; max: number }> = {
  B: { min: 3,  max: 5  },
  C: { min: 5,  max: 10 },
  D: { min: 10, max: 20 },
}

// Tempo máximo de atuação na zona térmica (em 1h = 3600s)
// Derivado do critério IEC: a 1.45×In, deve desligar em 1h
const A_TERMICA = 3600 * (1.45 ** 2)  // ≈ 7574 A²s/In²

export function calcTempoAtuacao(
  curva:       'B' | 'C' | 'D',
  corrente_a:  number,
  in_a:        number
): { zona: 'MAGNETICA' | 'TERMICA' | 'FORA_CURVA'; tempo_ms: number; incerteza_ms: number } {
  const multiplo = corrente_a / in_a
  const zona_mag = ZONA_MAGNETICA[curva]

  if (multiplo >= zona_mag.max) {
    // Zona magnética definida: atuação instantânea
    // IEC 60898-1: t ≤ 0.1s para multiplo ≥ max
    return { zona: 'MAGNETICA', tempo_ms: 10, incerteza_ms: 5 }
  }

  if (multiplo >= zona_mag.min) {
    // Zona magnética mas com dispersão (fabricante pode variar)
    // Tempo entre 0.01s e 0.1s
    const frac = (multiplo - zona_mag.min) / (zona_mag.max - zona_mag.min)
    const t_ms = 100 - frac * 90  // 100ms → 10ms
    return { zona: 'MAGNETICA', tempo_ms: t_ms, incerteza_ms: t_ms * 0.5 }
  }

  if (multiplo >= 1.13) {
    // Zona térmica: parábola log-log
    // t = A / (I/In)² (aproximação conservadora)
    const t_s = A_TERMICA / (multiplo * multiplo)
    return { zona: 'TERMICA', tempo_ms: t_s * 1000, incerteza_ms: t_s * 1000 * 0.2 }
  }

  // Abaixo de 1.13×In: não desliga em tempo normativo
  return { zona: 'FORA_CURVA', tempo_ms: Infinity, incerteza_ms: 0 }
}

// ── I²t let-through por dispositivo ──────────────────────────────
// Energia que "passa" pelo dispositivo antes de interromper a corrente
// Para disjuntores residenciais IEC 60898-1:
//   Zona magnética: I²t ≈ Icc² × t_inst (≈ 10ms)
//   Zona térmica:   I²t = ∫I²dt ≈ I² × t (conservador)
// Disjuntores limitadores: I²t << Icc² × t (limitam o pico)
export function calcI2T(
  corrente_a:   number,
  tempo_ms:     number,
  limitador?:   boolean  // true = disjuntor limitador de corrente
): number {
  if (limitador) {
    // Disjuntores limitadores reduzem I²t em até 90% (IEC 60947-2)
    return corrente_a ** 2 * (tempo_ms / 1000) * 0.10
  }
  return corrente_a ** 2 * (tempo_ms / 1000)
}

// ── Verificação térmica completa ──────────────────────────────────
export interface VerificacaoTermica {
  readonly secao_mm2:      number
  readonly isolacao:       string
  readonly k_fator:        number
  readonly capacidade_a2s: number    // k²S²
  readonly energia_a2s:    number    // I²t passante
  readonly seguro:         boolean   // energia ≤ capacidade
  readonly margem_pct:     number    // % de margem disponível
  // Para o pior caso (corrente máxima, tempo mínimo do dispositivo)
  readonly pior_caso_ok:   boolean
}

export function verificarTermica(
  secao_mm2:   number,
  isolacao:    string,
  corrente_a:  number,
  tempo_ms:    number,
  curva:       'B'|'C'|'D',
  in_a:        number
): VerificacaoTermica {
  const capacidade = capacidadeTermica(secao_mm2, isolacao)
  const energia    = calcI2T(corrente_a, tempo_ms)

  // Pior caso: corrente de pico × tempo máximo da zona magnética
  const zona = ZONA_MAGNETICA[curva]
  const icc_pico_worst = in_a * zona.min  // corrente mínima da zona mag
  const t_worst_ms     = 100              // tempo máximo da zona mag
  const energia_worst  = calcI2T(icc_pico_worst, t_worst_ms)

  const k = FATOR_K[isolacao] ?? 115
  const margem = energia > 0 ? Math.round((1 - energia / capacidade) * 100) : 100

  return {
    secao_mm2,
    isolacao,
    k_fator:       k,
    capacidade_a2s: Math.round(capacidade),
    energia_a2s:    Math.round(energia),
    seguro:         energia <= capacidade,
    margem_pct:     margem,
    pior_caso_ok:   energia_worst <= capacidade,
  }
}

// ── Modelo físico do dispositivo ──────────────────────────────────
export interface ModeloDispositivo {
  readonly id:          string
  readonly tipo:        'DISJUNTOR_RES' | 'DISJUNTOR_IND' | 'FUSIVEL_gG' | 'FUSIVEL_aM'
  readonly corrente_in: number
  readonly curva:       'B'|'C'|'D'|'gG'|'aM'
  readonly icu_ka:      number
  // Características físicas
  readonly limitador:   boolean   // disjuntor limitador de corrente?
  readonly polo:        1|2|3
  // Tempo de atuação nas zonas
  readonly zona_mag:    { min_mult: number; max_mult: number; t_max_ms: number }
  readonly zona_term:   { t_em_1_13in_ms: number }
  // I²t máximo de passante (do catálogo, se disponível)
  readonly i2t_max_a2s?: number
}

export function buildModeloDispositivo(
  id:          string,
  tipo:        ModeloDispositivo['tipo'],
  in_a:        number,
  curva:       'B'|'C'|'D',
  icu_ka:      number,
  polo:        1|2|3 = 1,
  limitador = false
): ModeloDispositivo {
  const zona_mag = ZONA_MAGNETICA[curva]
  const t_1_13   = A_TERMICA / (1.13 * 1.13) * 1000  // ms para 1.13×In

  return {
    id, tipo, corrente_in: in_a, curva, icu_ka, limitador, polo,
    zona_mag: { min_mult: zona_mag.min, max_mult: zona_mag.max, t_max_ms: 100 },
    zona_term: { t_em_1_13in_ms: t_1_13 },
  }
}

// ── Análise de seletividade por energia ───────────────────────────
// Dois dispositivos são seletivos em energia se:
//   I²t_jusante_max < I²t_montante_min
// (o jusante limita mais energia que o montante começa a atuar)
export interface SeletividadeEnergetica {
  readonly seletivo:       boolean
  readonly tipo:           'TOTAL' | 'PARCIAL' | 'SEM_SELETIVIDADE'
  readonly i2t_jusante:    number   // energia máxima que passa pelo jusante
  readonly i2t_montante:   number   // energia mínima para montante atuar
  readonly justificativa:  string
}

export function verificarSeletividadeEnergetica(
  montante: ModeloDispositivo,
  jusante:  ModeloDispositivo,
  icc_ka:   number            // corrente de curto disponível no ponto
): SeletividadeEnergetica {
  const icc_a = icc_ka * 1000
  // I²t máximo que o jusante deixa passar (zona magnética — pior caso)
  const t_jus = calcTempoAtuacao(jusante.curva as 'B'|'C'|'D', icc_a, jusante.corrente_in)
  const i2t_jus = calcI2T(icc_a, t_jus.tempo_ms, jusante.limitador)

  // I²t mínimo para o montante começar a atuar (zona térmica — limiar)
  const i_mont_lim = montante.corrente_in * 1.13
  const t_mont = calcTempoAtuacao(montante.curva as 'B'|'C'|'D', i_mont_lim, montante.corrente_in)
  const i2t_mont = calcI2T(i_mont_lim, t_mont.tempo_ms)

  const seletivo = i2t_jus < i2t_mont
  const tipo: SeletividadeEnergetica['tipo'] =
    seletivo ? 'TOTAL' : 'SEM_SELETIVIDADE'

  return {
    seletivo,
    tipo,
    i2t_jusante:  Math.round(i2t_jus),
    i2t_montante: Math.round(i2t_mont),
    justificativa: seletivo
      ? `I²t_jusante (${i2t_jus.toExponential(1)}) < I²t_montante (${i2t_mont.toExponential(1)}) — seletividade energética`
      : `I²t_jusante (${i2t_jus.toExponential(1)}) ≥ I²t_montante (${i2t_mont.toExponential(1)}) — montante pode atuar antes`,
  }
}


// ── Inferência de curva por tipo de carga ────────────────────────
// A curva do disjuntor deve ser compatível com a corrente de partida
// da carga que ele protege. Regra prática:
//
//   ILUM (reatores):   inrush 5–8×In → curva C
//   TUG (uso geral):   inrush até 10×In (eletrônica) → curva C
//   TUE resistivo:     sem inrush → curva B ou C (B para máx seletividade)
//   TUE motor <3kW:    inrush 5–6×In → curva C
//   TUE motor >3kW DOL: inrush 8–12×In → curva D
//   TUE compressor AC:  inrush 4–8×In → curva C (inverter) ou D (convencional)
//
// O engenheiro decide; o sistema SUGERE.

export interface SugestaCurva {
  readonly curva:           'B' | 'C' | 'D'
  readonly justificativa:   string
  readonly inrush_multiplo: [number, number]   // faixa estimada de inrush [min, max]
  readonly alternativa?:    'B' | 'C' | 'D'   // outra opção válida
  readonly nota?:           string
}

export function inferirCurva(
  tipo_carga: string,    // 'ILUM' | 'TUG' | 'TUE' | 'GERAL'
  subtipo?:   string,    // 'motor_dol' | 'motor_inverter' | 'resistivo' | 'ar_cond' | 'compressor'
  potencia_va?: number   // ajuda a diferenciar motores pequenos/grandes
): SugestaCurva {

  const tipo = tipo_carga.toUpperCase()

  if (tipo === 'ILUM') {
    return {
      curva: 'C',
      justificativa: 'Reatores fluorescentes e drivers LED têm inrush 5–8×In — curva C evita desarme na energização',
      inrush_multiplo: [5, 8],
      nota: 'Para LEDs puros sem reator, curva B também é aceitável',
      alternativa: 'B',
    }
  }

  if (tipo === 'TUG') {
    return {
      curva: 'C',
      justificativa: 'Tomadas de uso geral alimentam cargas diversas (eletrônica, motores pequenos). Curva C cobre inrush de até 10×In sem desarme indevido',
      inrush_multiplo: [3, 10],
    }
  }

  if (tipo === 'TUE') {
    const sub = subtipo?.toLowerCase() ?? ''
    const pot = potencia_va ?? 0

    if (sub.includes('motor') && sub.includes('dol') || (sub.includes('motor') && pot > 3000)) {
      return {
        curva: 'D',
        justificativa: 'Motor de grande porte com partida direta (DOL) tem inrush 8–12×In. Curva D evita desarme na partida',
        inrush_multiplo: [8, 12],
        alternativa: 'C',
        nota: 'Verificar seletividade com DG: In_DG / In_motor ≥ 1.6',
      }
    }

    if (sub.includes('compressor') || sub.includes('ar') || sub.includes('hvac')) {
      const e_inverter = sub.includes('inverter') || sub.includes('vrf')
      return {
        curva: e_inverter ? 'C' : 'C',
        justificativa: e_inverter
          ? 'Compressor com inversor de frequência: partida suave, inrush controlado 3–5×In → curva C'
          : 'Compressor convencional: inrush 4–8×In → curva C. Se inrush > 10×In, considerar curva D',
        inrush_multiplo: e_inverter ? [3, 5] : [4, 8],
        alternativa: e_inverter ? undefined : 'D',
      }
    }

    if (sub.includes('resistivo') || sub.includes('chuveiro') || sub.includes('forno') || sub.includes('aquecedor')) {
      return {
        curva: 'B',
        justificativa: 'Carga resistiva pura: sem inrush significativo. Curva B oferece máxima sensibilidade e melhor seletividade',
        inrush_multiplo: [1, 2],
        alternativa: 'C',
        nota: 'Curva C também é válida. B permite melhor coordenação com DG',
      }
    }

    if (sub.includes('motor') || (pot > 0 && pot <= 3000)) {
      return {
        curva: 'C',
        justificativa: 'Motor pequeno/médio (≤3kW): inrush 5–7×In em partida direta. Curva C adequada',
        inrush_multiplo: [5, 7],
        alternativa: 'D',
        nota: 'Se houver problemas de desarme na partida, considerar curva D',
      }
    }

    // TUE genérico
    return {
      curva: 'C',
      justificativa: 'TUE de uso geral: curva C como padrão. Verificar inrush específico do equipamento',
      inrush_multiplo: [5, 10],
      alternativa: 'D',
    }
  }

  // GERAL ou desconhecido
  return {
    curva: 'C',
    justificativa: 'Curva C é o padrão residencial/comercial. Cobre a maioria das cargas sem risco de desarme indevido',
    inrush_multiplo: [3, 10],
  }
}

// ── Verificar compatibilidade curva × carga ───────────────────────
// Retorna aviso se a curva escolhida pode causar problemas
export interface CompatibilidadeCurva {
  readonly compativel:   boolean
  readonly risco:        'NENHUM' | 'DESARME_PARTIDA' | 'SENSIBILIDADE_EXCESSIVA'
  readonly descricao:    string
}

export function verificarCompatibilidadeCurva(
  curva:     'B' | 'C' | 'D',
  sugestao:  SugestaCurva
): CompatibilidadeCurva {
  const [_inrush_min, inrush_max] = sugestao.inrush_multiplo
  const faixa = ZONA_MAGNETICA[curva]

  if (inrush_max > faixa.min) {
    // Inrush pode entrar na zona magnética → risco de desarme na partida
    if (curva === 'B' && inrush_max > 3) {
      return {
        compativel: false,
        risco: 'DESARME_PARTIDA',
        descricao: `Curva B (zona mag: 3–5×In): inrush estimado até ${inrush_max}×In pode causar desarme na energização`,
      }
    }
  }

  if (curva === 'D' && inrush_max < 5) {
    return {
      compativel: true,
      risco: 'SENSIBILIDADE_EXCESSIVA',
      descricao: `Curva D (zona mag: 10–20×In) para carga com inrush de ${inrush_max}×In: dispositivo pouco sensível, demora mais a atuar em sobrecarga`,
    }
  }

  return { compativel: true, risco: 'NENHUM', descricao: `Curva ${curva} compatível com perfil de carga` }
}
