// src/core/faultSimulation.ts
// ════════════════════════════════════════════════════════════════
// FAULT SIMULATION ENGINE
//
// Pergunta: "o que acontece DURANTE a falta?"
//
// Hoje o sistema sabe:
//   - onde a falta acontece (topologia ElectricalNet)
//   - qual Icc está disponível (protectionCoordination)
//   - quais dispositivos existem e sua capacidade (quadroDistribuicao)
//
// FaultSimulationEngine simula a sequência real:
//   1. Falta ocorre num ponto específico (curto, sobrecarga, fuga)
//   2. Corrente de falta flui pela topologia (BFS reverso)
//   3. Cada dispositivo no caminho "vê" uma corrente
//   4. O dispositivo com menor tempo de atuação abre primeiro
//   5. A falta é isolada — o que permanece energizado?
//
// Modela:
//   - atuação magnética (instantânea, zona magnética)
//   - atuação térmica (retardada, zona térmica)
//   - seletividade temporal (qual abre antes?)
//   - zonas desenergizadas (o que o cliente perde?)
//   - energia let-through (I²t que chega ao cabo)
//
// Referência:
//   NBR 5410 §4.3.3 — proteção contra curto-circuito
//   IEC 60898-1 — curvas B/C/D (tempos de atuação)
//   IEC 60947-2 — disjuntores industriais
// ════════════════════════════════════════════════════════════════

import type { DispositivoProtecao, PontoCurto } from './protectionCoordination'

// ── Tipo de falta elétrica ────────────────────────────────────────
export type TipoFalta =
  | 'CURTO_TRIFASICO'    // maior corrente, pior para capacidade de interrupção
  | 'CURTO_BIFASICO'     // ~87% do trifásico
  | 'CURTO_FASE_TERRA'   // depende do sistema (TN-S vs TT)
  | 'SOBRECARGA'         // corrente acima do nominal mas abaixo do Icc
  | 'CORRENTE_FUGA'      // corrente diferencial (para DR)
  | 'ARCO_ELETRICO'      // corrente mais baixa, tempo mais longo

// ── Evento de falta ───────────────────────────────────────────────
export interface FaultEvent {
  readonly id:           string
  readonly tipo:         TipoFalta
  readonly ponto_id:     string    // NetNode onde ocorre a falta
  // Corrente de falta aplicada (A)
  // Se null: calcular a partir do Icc disponível no ponto
  readonly corrente_ka?: number
  // Para sobrecarga e fuga: valor fixo
  readonly corrente_a?:  number
  // Resistência de arco (aumenta para arco elétrico)
  readonly r_arco_ohm?:  number
}

// ── Visão de um dispositivo durante a falta ───────────────────────
// Cada dispositivo no caminho entre a falta e a fonte "vê" a corrente
export interface VisaoFalta {
  readonly dispositivo_id: string
  readonly corrente_ka:    number   // corrente de falta que passa por este dispositivo
  // Zona de atuação
  readonly zona:           'MAGNETICA' | 'TERMICA' | 'FORA_DA_CURVA' | 'NAO_ATUA'
  readonly tempo_atuacao_ms: number   // estimativa de tempo de atuação
  // O dispositivo atua?
  readonly atua:           boolean
  readonly motivo_nao_atua?: string  // se não atua, por quê
}

// ── Tempos de atuação por curva (IEC 60898-1) ────────────────────
// Zona magnética: atuação instantânea (< 10ms)
// Zona térmica:  atuação retardada (conforme tabela)
// Faixa de corrente de atuação magnética (em múltiplos de In):
const FAIXA_MAGNETICA: Record<'B'|'C'|'D', [number, number]> = {
  B: [3, 5],    // 3In a 5In
  C: [5, 10],   // 5In a 10In
  D: [10, 20],  // 10In a 20In
}

export function estimarTempoAtuacao(
  curva:      'B'|'C'|'D',
  corrente_a: number,
  in_a:       number
): { zona: VisaoFalta['zona']; tempo_ms: number } {
  const multiplo = corrente_a / in_a
  const [min_mag, max_mag] = FAIXA_MAGNETICA[curva]

  if (multiplo >= max_mag) {
    // Zona magnética: atuação instantânea (< 10ms para residencial)
    return { zona: 'MAGNETICA', tempo_ms: 5 + Math.random() * 5 }
  }
  if (multiplo >= min_mag) {
    // Transição: zona magnética mas com dispersão
    return { zona: 'MAGNETICA', tempo_ms: 10 + Math.random() * 20 }
  }
  if (multiplo >= 1.13) {
    // Zona térmica: curva tempo × corrente (aproximação)
    // Quanto mais próximo de In, mais lento
    const tempo_base = 3600 / (multiplo * multiplo)  // simplificação da curva
    return { zona: 'TERMICA', tempo_ms: Math.min(tempo_base * 1000, 3600000) }
  }
  // Abaixo de 1.13×In: não atua dentro do tempo normativo
  return { zona: 'FORA_DA_CURVA', tempo_ms: Infinity }
}

// ── Resultado da simulação de falta ──────────────────────────────
export interface ResultadoFalta {
  readonly fault_id:           string
  readonly tipo:               TipoFalta
  readonly ponto_id:           string
  // Dispositivo que abriu (isolou a falta)
  readonly dispositivo_atuou_id?: string
  // Tempo até isolamento (ms)
  readonly tempo_isolamento_ms:  number | null
  // O dispositivo certo atuou? (seletividade)
  readonly seletivo:            boolean
  // Dispositivos que atuaram indevidamente (abriram mas não deveriam)
  readonly atuacoes_indevidas:  string[]
  // Zonas desenergizadas após o isolamento
  readonly zonas_perdidas:      string[]  // IDs de NetNode que ficam sem energia
  // Energia let-through (I²t) que passou pelo cabo até o isolamento
  readonly energia_let_through_a2s: number
  // Visão de cada dispositivo no caminho da falta
  readonly visoes:              VisaoFalta[]
  // Avisos
  readonly avisos:              AvisoFalta[]
}

export interface AvisoFalta {
  readonly tipo:       'CORRENTE_EXCEDE_ICU' | 'SEM_ATUACAO' | 'ATUACAO_INDEVIDA' |
                       'ENERGIA_EXCESSIVA'   | 'CABO_INSUFICIENTE'
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso'
}

// ── Simular uma falta ─────────────────────────────────────────────
// Recebe a falta, a topologia de proteção, e os pontos de Icc
export function simularFalta(
  fault:        FaultEvent,
  ponto_curto:  PontoCurto,
  // Cadeia de dispositivos do jusante ao montante (ordem de proteção)
  // O primeiro é o mais próximo da falta, o último é a fonte
  cadeia:       DispositivoProtecao[],
): ResultadoFalta {
  const avisos:  AvisoFalta[] = []
  const visoes:  VisaoFalta[] = []

  // Corrente de falta efetiva
  const icc_a: number =
    fault.tipo === 'SOBRECARGA'     ? (fault.corrente_a ?? 0)
    : fault.tipo === 'CORRENTE_FUGA' ? (fault.corrente_a ?? 0.03)
    : fault.tipo === 'ARCO_ELETRICO' ? ponto_curto.icc_min_ka * 1000 * 0.3  // 30% do Icc_min
    : fault.tipo === 'CURTO_BIFASICO' ? ponto_curto.icc_max_ka * 1000 * 0.866
    : ponto_curto.icc_max_ka * 1000  // trifásico ou fase-terra: Icc_max

  // ── Avaliar cada dispositivo na cadeia ────────────────────────
  let primeiro_atuou: { idx: number; disp: DispositivoProtecao; tempo_ms: number } | null = null

  for (let i = 0; i < cadeia.length; i++) {
    const disp = cadeia[i]

    // Verificar Icu
    if (icc_a / 1000 > disp.icu_ka) {
      avisos.push({
        tipo: 'CORRENTE_EXCEDE_ICU', severidade: 'erro',
        descricao: `Dispositivo ${disp.id}: Icc=${(icc_a/1000).toFixed(1)}kA > Icu=${disp.icu_ka}kA — destruição potencial`,
      })
    }

    // Tempo de atuação
    const curva = (disp.curva === 'gG' || disp.curva === 'aM') ? 'C' : disp.curva
    const { zona, tempo_ms } = estimarTempoAtuacao(curva, icc_a, disp.corrente_in)
    const atua = zona === 'MAGNETICA' || zona === 'TERMICA'

    visoes.push({
      dispositivo_id:    disp.id,
      corrente_ka:       icc_a / 1000,
      zona,
      tempo_atuacao_ms:  isFinite(tempo_ms) ? tempo_ms : 1e9,
      atua,
      motivo_nao_atua:   !atua ? `Corrente ${(icc_a).toFixed(0)}A = ${(icc_a/disp.corrente_in).toFixed(1)}×In — fora da curva` : undefined,
    })

    if (atua && primeiro_atuou === null) {
      primeiro_atuou = { idx: i, disp, tempo_ms }
    }
  }

  // ── Avaliar seletividade ──────────────────────────────────────
  // Seletivo = apenas o primeiro dispositivo atuou (o mais próximo da falta)
  const atuacoes_indevidas: string[] = []
  if (primeiro_atuou !== null) {
    for (let i = primeiro_atuou.idx + 1; i < cadeia.length; i++) {
      const v = visoes[i]
      if (v.atua && v.tempo_atuacao_ms < primeiro_atuou.tempo_ms * 2) {
        // Dispositivo à montante atua quase ao mesmo tempo → sem seletividade
        atuacoes_indevidas.push(cadeia[i].id)
        avisos.push({
          tipo: 'ATUACAO_INDEVIDA', severidade: 'aviso',
          descricao: `Dispositivo ${cadeia[i].id} atua junto com ${primeiro_atuou.disp.id} (${v.tempo_atuacao_ms.toFixed(0)}ms vs ${primeiro_atuou.tempo_ms.toFixed(0)}ms)`,
        })
      }
    }
  } else {
    avisos.push({
      tipo: 'SEM_ATUACAO', severidade: 'erro',
      descricao: `Nenhum dispositivo na cadeia atua para corrente de ${(icc_a/1000).toFixed(1)}kA — falta não isolada!`,
    })
  }

  // ── Energia let-through (I²t) ─────────────────────────────────
  // I²t = corrente² × tempo de atuação
  // Critério: deve ser menor que a capacidade térmica do cabo (k²S²)
  const tempo_atu_s = (primeiro_atuou?.tempo_ms ?? 0) / 1000
  const energy_a2s  = (icc_a ** 2) * tempo_atu_s

  if (energy_a2s > 0) {
    const k_cobre = 115  // PVC/Cu: k=115 (NBR 5410)
    // Verificar para a menor seção na cadeia (pior caso)
    const secao_min = Math.min(
      ...cadeia.map(d => d.circuito_id ? 2.5 : 16)  // simplificação
    )
    const capacidade_termica = (k_cobre * secao_min) ** 2
    if (energy_a2s > capacidade_termica) {
      avisos.push({
        tipo: 'ENERGIA_EXCESSIVA', severidade: 'erro',
        descricao: `I²t=${energy_a2s.toExponential(2)} A²s > k²S²=${capacidade_termica.toExponential(2)} — cabo pode danificar`,
      })
    }
  }

  return {
    fault_id:                 fault.id,
    tipo:                     fault.tipo,
    ponto_id:                 fault.ponto_id,
    dispositivo_atuou_id:     primeiro_atuou?.disp.id,
    tempo_isolamento_ms:      isFinite(primeiro_atuou?.tempo_ms ?? Infinity)
                              ? primeiro_atuou?.tempo_ms ?? null : null,
    seletivo:                 atuacoes_indevidas.length === 0,
    atuacoes_indevidas,
    zonas_perdidas:           [],  // populado pelo chamador com base na topologia
    energia_let_through_a2s:  Math.round(energy_a2s),
    visoes,
    avisos,
  }
}

// ── Simular múltiplas faltas na instalação ────────────────────────
export interface CenarioFalta {
  readonly falta:    FaultEvent
  readonly ponto:    PontoCurto
  readonly cadeia:   DispositivoProtecao[]
}

export function simularInstalacao(
  cenarios: CenarioFalta[]
): { resultados: ResultadoFalta[]; resumo: ResumoSimulacao } {
  const resultados = cenarios.map(c => simularFalta(c.falta, c.ponto, c.cadeia))

  const sem_atuacao    = resultados.filter(r => !r.dispositivo_atuou_id).length
  const sem_seletividade = resultados.filter(r => !r.seletivo).length
  const icu_insuficiente = resultados.filter(r => r.avisos.some(a => a.tipo === 'CORRENTE_EXCEDE_ICU')).length

  return {
    resultados,
    resumo: {
      total_cenarios:    cenarios.length,
      faltou_sem_atuacao:     sem_atuacao,
      faltou_sem_seletividade: sem_seletividade,
      dispositivos_subdimensionados: icu_insuficiente,
      coordenacao_ok:    sem_atuacao === 0 && sem_seletividade === 0 && icu_insuficiente === 0,
    },
  }
}

export interface ResumoSimulacao {
  readonly total_cenarios:               number
  readonly faltou_sem_atuacao:           number
  readonly faltou_sem_seletividade:      number
  readonly dispositivos_subdimensionados: number
  readonly coordenacao_ok:               boolean
}
