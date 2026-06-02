// src/core/loadElectricalBehavior.ts
// ════════════════════════════════════════════════════════════════
// LOAD ELECTRICAL BEHAVIOR — comportamento elétrico real da carga
//
// Hoje: inrush = multiplicador estático (ex: 8×In).
// Problema real: 8×In por 2ms ≠ 8×In por 200ms.
//
// A curva IEC 60898-1 é tempo×corrente.
// Para saber se o disjuntor dispara, precisamos comparar:
//   - quanto tempo a corrente de inrush dura
//   - qual é o tempo mínimo de atuação da curva para essa corrente
//
// Se t_inrush < t_atuacao → o disjuntor NÃO dispara (inrush passa)
// Se t_inrush > t_atuacao → o disjuntor DISPARA (problema!)
//
// Comportamentos reais modelados:
//   LED driver capacitivo:   pico alto (15×In), curto (< 1ms)
//   Fluorescente (reator):   inrush moderado (5×In), curto (2–5ms)
//   Motor DOL:               inrush alto (8×In), longo (200–500ms)
//   Compressor inverter:     inrush controlado (3×In), longo (500ms)
//   Fonte chaveada:          pico alto (15×In), muito curto (<1ms)
//   Transformador toroidal:  inrush muito alto (20×In), decai em 100ms
// ════════════════════════════════════════════════════════════════

// ── Comportamento elétrico de uma carga ──────────────────────────
export type TipoComportamento =
  | 'RESISTIVO'        // sem inrush (chuveiro, forno)
  | 'LED_DRIVER'       // pico capacitivo muito curto
  | 'FLUORESCENTE'     // inrush de reator
  | 'MOTOR_DOL'        // partida direta — longo e alto
  | 'MOTOR_SOFT'       // partida suave — longo e controlado
  | 'MOTOR_INVERTER'   // inversor de frequência — sem inrush real
  | 'COMPRESSOR'       // compressor convencional
  | 'TRAFO_TOROIDAL'   // transformador toroidal — inrush altíssimo inicial
  | 'FONTE_CHAVEADA'   // fonte comutada — pico capacitivo

export interface LoadElectricalBehavior {
  readonly tipo:              TipoComportamento
  readonly descricao:         string
  // Corrente nominal de operação
  readonly in_operacao_a:     number    // corrente em regime permanente
  // Inrush
  readonly inrush_mult:       number    // multiplicador de In (pico de inrush)
  readonly inrush_duracao_ms: number    // duração do pico (ms)
  // Para o disjuntor: I²t de inrush
  readonly inrush_i2t:        number    // I² × t (A²·s)
  // Curva sugerida (baseada no inrush real)
  readonly curva_sugerida:    'B' | 'C' | 'D'
  // Justificativa física
  readonly justificativa:     string
  // Risco de disparo intempestivo com cada curva
  readonly risco_curva_B:     'ALTO' | 'MEDIO' | 'BAIXO' | 'SEM_RISCO'
  readonly risco_curva_C:     'ALTO' | 'MEDIO' | 'BAIXO' | 'SEM_RISCO'
  readonly risco_curva_D:     'ALTO' | 'MEDIO' | 'BAIXO' | 'SEM_RISCO'
}

// ── Banco de comportamentos por tipo ─────────────────────────────
// Baseado em dados de campo e literatura técnica
// Referência: IEC TR 60865, Schneider Electric "Electrical Installation Guide"
export const COMPORTAMENTOS: Record<TipoComportamento, Omit<LoadElectricalBehavior, 'in_operacao_a' | 'inrush_i2t'>> = {
  RESISTIVO: {
    tipo: 'RESISTIVO', descricao: 'Carga resistiva pura (chuveiro, forno, aquecedor)',
    inrush_mult: 1.5, inrush_duracao_ms: 5,
    curva_sugerida: 'B',
    justificativa: 'Sem inrush real. Corrente de regime desde o primeiro ciclo. Curva B oferece máxima seletividade.',
    risco_curva_B: 'SEM_RISCO', risco_curva_C: 'SEM_RISCO', risco_curva_D: 'BAIXO',
  },
  LED_DRIVER: {
    tipo: 'LED_DRIVER', descricao: 'Driver LED com estágio capacitivo',
    inrush_mult: 15, inrush_duracao_ms: 0.5,   // pico < 1ms (capacitores de filtro)
    curva_sugerida: 'C',
    justificativa: 'Pico capacitivo até 15×In porém dura < 1ms. A curva não atua em <1ms — o pico passa sem disparar. Curva C adequada.',
    risco_curva_B: 'BAIXO', risco_curva_C: 'SEM_RISCO', risco_curva_D: 'SEM_RISCO',
  },
  FLUORESCENTE: {
    tipo: 'FLUORESCENTE', descricao: 'Lâmpada fluorescente com reator eletromagnético',
    inrush_mult: 7, inrush_duracao_ms: 3,
    curva_sugerida: 'C',
    justificativa: 'Inrush do reator 5–8×In por 2–5ms. Curva B pode disparar (zona magnética 3×In). Curva C adequada.',
    risco_curva_B: 'MEDIO', risco_curva_C: 'SEM_RISCO', risco_curva_D: 'SEM_RISCO',
  },
  MOTOR_DOL: {
    tipo: 'MOTOR_DOL', descricao: 'Motor com partida direta (Direct On Line)',
    inrush_mult: 8, inrush_duracao_ms: 300,    // 0.3s — longo!
    curva_sugerida: 'D',
    justificativa: 'Inrush 6–10×In por 200–500ms. Zona magnética da curva C começa em 5×In → risco de disparo. Curva D (10–20×In) necessária.',
    risco_curva_B: 'ALTO', risco_curva_C: 'MEDIO', risco_curva_D: 'SEM_RISCO',
  },
  MOTOR_SOFT: {
    tipo: 'MOTOR_SOFT', descricao: 'Motor com partida suave (soft-starter)',
    inrush_mult: 3, inrush_duracao_ms: 2000,   // longo mas controlado
    curva_sugerida: 'C',
    justificativa: 'Partida suave limita inrush a 2–3×In. Mesmo sendo longo (1–3s), corrente na zona térmica apenas. Curva C adequada.',
    risco_curva_B: 'BAIXO', risco_curva_C: 'SEM_RISCO', risco_curva_D: 'SEM_RISCO',
  },
  MOTOR_INVERTER: {
    tipo: 'MOTOR_INVERTER', descricao: 'Motor com inversor de frequência (VFD)',
    inrush_mult: 1.8, inrush_duracao_ms: 100,
    curva_sugerida: 'C',
    justificativa: 'VFD controla a tensão de partida. Inrush < 2×In. Curva B ou C adequadas.',
    risco_curva_B: 'SEM_RISCO', risco_curva_C: 'SEM_RISCO', risco_curva_D: 'BAIXO',
  },
  COMPRESSOR: {
    tipo: 'COMPRESSOR', descricao: 'Compressor de ar condicionado convencional',
    inrush_mult: 6, inrush_duracao_ms: 400,
    curva_sugerida: 'C',
    justificativa: 'Inrush 5–8×In por 300–500ms. Curva C (5–10×In) na limite — verificar se 6×In > 5×In_mag. Considerar D se houver disparos.',
    risco_curva_B: 'ALTO', risco_curva_C: 'BAIXO', risco_curva_D: 'SEM_RISCO',
  },
  TRAFO_TOROIDAL: {
    tipo: 'TRAFO_TOROIDAL', descricao: 'Transformador toroidal (HiFi, impressora 3D)',
    inrush_mult: 20, inrush_duracao_ms: 50,   // pico altíssimo mas decai
    curva_sugerida: 'D',
    justificativa: 'Inrush inicial até 20×In por 50ms. Curvas B e C disparam quase certamente. Curva D (10–20×In) necessária.',
    risco_curva_B: 'ALTO', risco_curva_C: 'ALTO', risco_curva_D: 'BAIXO',
  },
  FONTE_CHAVEADA: {
    tipo: 'FONTE_CHAVEADA', descricao: 'Fonte de alimentação comutada (PC, TV, carregadores)',
    inrush_mult: 15, inrush_duracao_ms: 0.5,
    curva_sugerida: 'C',
    justificativa: 'Similar ao LED driver: pico capacitivo altíssimo mas < 1ms. O disjuntor não atua em tempo tão curto. Curva C adequada.',
    risco_curva_B: 'BAIXO', risco_curva_C: 'SEM_RISCO', risco_curva_D: 'SEM_RISCO',
  },
}

export function buildLoadBehavior(
  tipo:         TipoComportamento,
  in_operacao_a: number
): LoadElectricalBehavior {
  const base = COMPORTAMENTOS[tipo]
  const inrush_a = in_operacao_a * base.inrush_mult
  const inrush_i2t = (inrush_a ** 2) * (base.inrush_duracao_ms / 1000)
  return { ...base, in_operacao_a, inrush_i2t: Math.round(inrush_i2t) }
}

// ── Verificar compatibilidade com disjuntor ───────────────────────
export interface CompatDispBehavior {
  readonly ok:             boolean
  readonly risco_disparo:  'ALTO' | 'MEDIO' | 'BAIXO' | 'SEM_RISCO'
  readonly razao:          string
  // Comparação temporal: inrush_duracao vs tempo de atuação do disjuntor
  readonly t_inrush_ms:    number
  readonly t_atuacao_min_ms: number  // tempo mínimo para o disjuntor atuar nessa corrente
  readonly inrush_passa:   boolean   // true = inrush acaba antes de o disjuntor atuar
}

export function verificarCompatDispositivo(
  beh:   LoadElectricalBehavior,
  curva: 'B' | 'C' | 'D',
  in_a:  number,   // corrente nominal do disjuntor
): CompatDispBehavior {
  {
    const ZONA_MAG: Record<string, [number,number]> = { B:[3,5], C:[5,10], D:[10,20] }

    const mult_inrush = beh.inrush_mult * beh.in_operacao_a / in_a
    const [min_mag] = ZONA_MAG[curva]

    // Se inrush não chega à zona magnética → sem risco
    if (mult_inrush < min_mag) {
      return {
        ok: true, risco_disparo: 'SEM_RISCO',
        razao: `Inrush de ${mult_inrush.toFixed(1)}×In_disj < ${min_mag}×In (início zona magnética curva ${curva})`,
        t_inrush_ms: beh.inrush_duracao_ms,
        t_atuacao_min_ms: 0,
        inrush_passa: true,
      }
    }

    // Inrush na zona magnética: verificar se dura mais que o tempo de atuação
    // Zona magnética: disjuntor atua em 10ms (convencional) ou 50ms (dispersão)
    const t_mag_ms = 50  // conservador: tempo máximo na zona magnética
    const inrush_passa = beh.inrush_duracao_ms < t_mag_ms

    const risco = beh.risco_curva_B === 'ALTO' && curva === 'B' ? 'ALTO'
                : beh.risco_curva_C === 'ALTO' && curva === 'C' ? 'ALTO'
                : beh.risco_curva_D === 'ALTO' && curva === 'D' ? 'ALTO'
                : beh[`risco_curva_${curva}`] as LoadElectricalBehavior['risco_curva_B']

    return {
      ok: inrush_passa || risco === 'SEM_RISCO' || risco === 'BAIXO',
      risco_disparo: risco,
      razao: inrush_passa
        ? `Inrush ${beh.inrush_duracao_ms}ms < ${t_mag_ms}ms (tempo de atuação zona mag) → inrush passa sem disparar`
        : `Inrush dura ${beh.inrush_duracao_ms}ms > ${t_mag_ms}ms → risco de disparo na zona magnética`,
      t_inrush_ms: beh.inrush_duracao_ms,
      t_atuacao_min_ms: t_mag_ms,
      inrush_passa,
    }
  }
}

// ── Inrush agregado: N cargas simultâneas ─────────────────────────
export interface AggregateInrush {
  readonly n_cargas:        number
  readonly inrush_total_a:  number    // soma dos picos simultâneos
  readonly i2t_total:       number    // I²t total (pior caso: todos simultâneos)
  readonly duracao_ms:      number    // duração do pico agregado
  // Equivalente para o disjuntor que protege o grupo
  readonly mult_efetivo:    number    // inrush_total / in_operacao_total
}

export function calcAggregateInrush(
  cargas: { comportamento: LoadElectricalBehavior; simultaneo: boolean }[]
): AggregateInrush {
  // Cargas simultâneas: inrush se soma
  // Cargas não simultâneas: pior caso individual
  const sim   = cargas.filter(c => c.simultaneo)
  const in_op_total  = cargas.reduce((s, c) => s + c.comportamento.in_operacao_a, 0)
  const inrush_total = sim.reduce((s, c) => s + c.comportamento.inrush_mult * c.comportamento.in_operacao_a, 0)
  const i2t_total    = sim.reduce((s, c) => s + c.comportamento.inrush_i2t, 0)

  // Duração: a mais longa entre as simultâneas (pior caso)
  const duracao = sim.reduce((m, c) => Math.max(m, c.comportamento.inrush_duracao_ms), 0)

  return {
    n_cargas:       cargas.length,
    inrush_total_a: Math.round(inrush_total),
    i2t_total:      Math.round(i2t_total),
    duracao_ms:     duracao,
    mult_efetivo:   in_op_total > 0 ? inrush_total / in_op_total : 0,
  }
}
