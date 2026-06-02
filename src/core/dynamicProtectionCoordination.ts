// src/core/dynamicProtectionCoordination.ts
// ════════════════════════════════════════════════════════════════
// DYNAMIC PROTECTION COORDINATION
//
// O que existe mas fragmentado:
//   protectionDevicePhysics: calcTempoAtuacao, calcI2T (por dispositivo, isolado)
//   faultSimulation:         simularFalta (sequência temporal)
//   protectionCoordination:  verificarSeletividade (por par estático)
//
// O que falta:
//   Cascata energética: I²t acumulado na cadeia
//
//   Quando o disjuntor D1 (jusante) abre em t_jus:
//   - I²t total visto pelo DG (montante) até t_jus = ?
//   - Esse I²t ≥ energia mínima para DG atuar?
//   - Se sim: DG abre também → sem seletividade (cascata indesejada)
//   - Se não: apenas D1 abriu → seletividade confirmada
//
// Sequência do cálculo:
//   1. Corrente de falta no ponto (do FaultCurrentPath)
//   2. Tempo de atuação do jusante (do DevicePhysics)
//   3. I²t passante do jusante = Icc² × t_jus
//   4. Esse I²t ≥ limiar térmico do montante?
//   5. Se sim: cascata. Se não: seletividade.
//
// Referência:
//   IEC 60947-2 §E.6 — coordination by energy discrimination
//   IEC 60364-4-43 §434 — selectivity
// ════════════════════════════════════════════════════════════════

import type { ModeloDispositivo } from './protectionDevicePhysics'
import {
  calcTempoAtuacao, calcI2T, verificarTermica,
} from './protectionDevicePhysics'

// ── Resultado de atuação de um dispositivo na cascata ─────────────
export interface AtuacaoCascata {
  readonly dispositivo_id:   string
  readonly corrente_in:      number
  readonly curva:            'B'|'C'|'D'
  readonly icc_a:            number       // corrente de falta que vê
  // Timing
  readonly zona:             'MAGNETICA'|'TERMICA'|'FORA_CURVA'
  readonly tempo_ms:         number       // tempo de atuação
  // Energia
  readonly i2t_a2s:          number       // I²t que passa antes de abrir
  // Impacto sobre o cabo
  readonly cabo_seguro:      boolean
  readonly cabo_secao_mm2?:  number
  // Estado final
  readonly atuou:            boolean
}

// ── Resultado da análise de cascata ──────────────────────────────
export interface ResultadoCascata {
  // Dispositivo(s) que atuaram
  readonly primeiro_atuou:   string       // ID do dispositivo
  readonly tempo_first_ms:   number
  // Atuações de cada dispositivo na cadeia (do mais próximo ao mais distante)
  readonly atuacoes:         AtuacaoCascata[]
  // Seletividade dinâmica
  readonly seletivo:         boolean      // apenas o primeiro atuou?
  readonly atuacoes_indevidas: string[]   // dispositivos que atuaram sem dever
  // I²t acumulado
  readonly i2t_total_a2s:    number       // energia total até o primeiro abrir
  readonly i2t_em_cascata:   number       // energia que subiu para montante
  // Aviso de cascata
  readonly avisos:           AvisoCascata[]
}

export interface AvisoCascata {
  readonly tipo:       'CASCATA_INDESEJADA' | 'CABO_EM_RISCO' | 'SELETIVIDADE_MARGINAL'
  readonly disps:      string[]   // dispositivos envolvidos
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso'
}

// ── Simular cascata de proteção ───────────────────────────────────
// Dado uma corrente de falta e a cadeia de dispositivos (jusante → montante),
// calcular quais atuam, em qual ordem, e quanto I²t passa
export function simularCascata(
  icc_a:   number,
  cadeia:  ModeloDispositivo[],
  cabos?:  { secao_mm2: number; isolacao?: string }[]  // cabo por trecho
): ResultadoCascata {
  const atuacoes:  AtuacaoCascata[] = []
  const avisos:    AvisoCascata[]   = []

  // ── 1. Calcular atuação de cada dispositivo ───────────────────
  for (let i = 0; i < cadeia.length; i++) {
    const disp  = cadeia[i]
    const curva = disp.curva as 'B'|'C'|'D'
    const { zona, tempo_ms } = calcTempoAtuacao(curva, icc_a, disp.corrente_in)
    const i2t  = calcI2T(icc_a, tempo_ms, disp.limitador)

    const cabo = cabos?.[i]
    let cabo_seguro = true
    if (cabo) {
      const v = verificarTermica(cabo.secao_mm2, cabo.isolacao ?? 'Cu/PVC', icc_a, tempo_ms, curva, disp.corrente_in)
      cabo_seguro = v.seguro
      if (!cabo_seguro) {
        avisos.push({
          tipo: 'CABO_EM_RISCO', disps: [disp.id],
          descricao: `Cabo ${cabo.secao_mm2}mm² após ${disp.id}: I²t=${v.energia_a2s.toExponential(1)} > k²S²=${v.capacidade_a2s.toExponential(1)}`,
          severidade: 'erro',
        })
      }
    }

    atuacoes.push({
      dispositivo_id:  disp.id,
      corrente_in:     disp.corrente_in,
      curva:           curva,
      icc_a,
      zona,
      tempo_ms:        isFinite(tempo_ms) ? tempo_ms : 1e9,
      i2t_a2s:         isFinite(tempo_ms) ? i2t : 0,
      cabo_seguro,
      cabo_secao_mm2:  cabo?.secao_mm2,
      atuou:           zona === 'MAGNETICA' || zona === 'TERMICA',
    })
  }

  // ── 2. Determinar quem abriu primeiro ─────────────────────────
  const que_atuaram = atuacoes.filter(a => a.atuou).sort((a, b) => a.tempo_ms - b.tempo_ms)
  const primeiro    = que_atuaram[0]

  if (!primeiro) {
    return {
      primeiro_atuou: '', tempo_first_ms: Infinity,
      atuacoes, seletivo: false,
      atuacoes_indevidas: [],
      i2t_total_a2s: 0, i2t_em_cascata: 0,
      avisos: [...avisos, {
        tipo: 'CASCATA_INDESEJADA', disps: cadeia.map(d => d.id),
        descricao: 'Nenhum dispositivo atuou — falta não isolada!',
        severidade: 'erro',
      }],
    }
  }

  // ── 3. Verificar cascata ───────────────────────────────────────
  // Seletivo = apenas o primeiro atuou.
  // Cascata = montante também atua porque:
  //   I²t_montante(até t_jusante) ≥ limiar térmico do montante
  const atuacoes_indevidas: string[] = []
  let i2t_cascata = 0

  for (const atu of atuacoes) {
    if (atu.dispositivo_id === primeiro.dispositivo_id) continue
    if (!atu.atuou) continue

    // O dispositivo à montante acumula I²t até o jusante abrir
    const i2t_ate_t_jus = calcI2T(icc_a, primeiro.tempo_ms, false)
    // multiplo_mont calculado via calcTempoAtuacao
    const { zona: zona_mont } = calcTempoAtuacao(atu.curva, icc_a, atu.corrente_in)

    // Se o montante também está na zona de atuação antes do jusante abrir
    if (zona_mont !== 'FORA_CURVA' && atu.tempo_ms <= primeiro.tempo_ms * 2) {
      atuacoes_indevidas.push(atu.dispositivo_id)
      i2t_cascata += i2t_ate_t_jus

      avisos.push({
        tipo: 'CASCATA_INDESEJADA',
        disps: [primeiro.dispositivo_id, atu.dispositivo_id],
        descricao: `${atu.dispositivo_id} (${atu.corrente_in}A) atua junto com ${primeiro.dispositivo_id} (${primeiro.corrente_in}A): t_mont=${atu.tempo_ms.toFixed(0)}ms vs t_jus=${primeiro.tempo_ms.toFixed(0)}ms`,
        severidade: 'aviso',
      })
    }
  }

  // ── 4. Seletividade marginal (tempos próximos) ─────────────────
  if (que_atuaram.length >= 2) {
    const delta_t = que_atuaram[1].tempo_ms - que_atuaram[0].tempo_ms
    if (delta_t < 20 && atuacoes_indevidas.length === 0) {
      avisos.push({
        tipo: 'SELETIVIDADE_MARGINAL',
        disps: [que_atuaram[0].dispositivo_id, que_atuaram[1].dispositivo_id],
        descricao: `Margem de ${delta_t.toFixed(1)}ms entre ${que_atuaram[0].dispositivo_id} e ${que_atuaram[1].dispositivo_id} — seletividade marginal`,
        severidade: 'aviso',
      })
    }
  }

  return {
    primeiro_atuou:    primeiro.dispositivo_id,
    tempo_first_ms:    primeiro.tempo_ms,
    atuacoes,
    seletivo:          atuacoes_indevidas.length === 0,
    atuacoes_indevidas,
    i2t_total_a2s:     Math.round(primeiro.i2t_a2s),
    i2t_em_cascata:    Math.round(i2t_cascata),
    avisos,
  }
}

// ── Análise completa de uma instalação ────────────────────────────
export interface AnaliseCoordinacaoDinamica {
  readonly cenarios:    { icc_a: number; resultado: ResultadoCascata }[]
  readonly seletivos:   number   // % de cenários seletivos
  readonly criticos:    { icc_a: number; motivo: string }[]
}

export function analisarCoordinacaoDinamica(
  correntes_teste: number[],  // correntes de falta a testar
  cadeia:          ModeloDispositivo[],
  cabos?:          { secao_mm2: number; isolacao?: string }[]
): AnaliseCoordinacaoDinamica {
  const cenarios = correntes_teste.map(icc_a => ({
    icc_a,
    resultado: simularCascata(icc_a, cadeia, cabos),
  }))

  const n_seletivos = cenarios.filter(c => c.resultado.seletivo).length
  const criticos    = cenarios
    .filter(c => !c.resultado.seletivo || c.resultado.avisos.some(a => a.severidade === 'erro'))
    .map(c => ({
      icc_a:  c.icc_a,
      motivo: c.resultado.avisos[0]?.descricao ?? 'Sem seletividade',
    }))

  return {
    cenarios,
    seletivos: Math.round(n_seletivos / cenarios.length * 100),
    criticos,
  }
}
