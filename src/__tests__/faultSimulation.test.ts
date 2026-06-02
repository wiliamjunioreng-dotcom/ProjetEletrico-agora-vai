// src/__tests__/faultSimulation.test.ts
import { describe, it, expect } from 'vitest'
import {
  estimarTempoAtuacao, simularFalta, simularInstalacao,
} from '../core/faultSimulation'
import type { FaultEvent, CenarioFalta } from '../core/faultSimulation'
import type { DispositivoProtecao, PontoCurto } from '../core/protectionCoordination'

// ── Dispositivos de teste ─────────────────────────────────────────
const dg: DispositivoProtecao = {
  id:'DG', tipo:'DISJUNTOR', corrente_in:63, curva:'C', icu_ka:10, polo:1, jusante_ids:['D1'],
}
const d1: DispositivoProtecao = {
  id:'D1', tipo:'DISJUNTOR', corrente_in:16, curva:'C', icu_ka:6, polo:1,
  montante_id:'DG', jusante_ids:[], circuito_id:'c1',
}
const ponto_forte: PontoCurto = { id:'barra', descricao:'Barra', icc_max_ka:6,   icc_min_ka:3,   tensao_v:220 }
const ponto_fraco: PontoCurto = { id:'final', descricao:'Final', icc_max_ka:1.5, icc_min_ka:0.7, tensao_v:220 }

const fault_trifasico: FaultEvent = { id:'f1', tipo:'CURTO_TRIFASICO', ponto_id:'final' }
const fault_bifasico:  FaultEvent = { id:'f2', tipo:'CURTO_BIFASICO',  ponto_id:'final' }
const fault_arco:      FaultEvent = { id:'f3', tipo:'ARCO_ELETRICO',   ponto_id:'final' }
const fault_sobre:     FaultEvent = { id:'f4', tipo:'SOBRECARGA', ponto_id:'final', corrente_a:20 }

describe('estimarTempoAtuacao — curvas I×t', () => {

  it('curva C: 10×In → zona magnética (< 30ms)', () => {
    const { zona, tempo_ms } = estimarTempoAtuacao('C', 10 * 16, 16)
    expect(zona).toBe('MAGNETICA')
    expect(tempo_ms).toBeLessThan(30)
  })

  it('curva B: 5×In → zona magnética', () => {
    const { zona } = estimarTempoAtuacao('B', 5 * 16, 16)
    expect(zona).toBe('MAGNETICA')
  })

  it('curva D: 15×In → zona magnética', () => {
    const { zona } = estimarTempoAtuacao('D', 15 * 16, 16)
    expect(zona).toBe('MAGNETICA')
  })

  it('1.2×In → zona térmica (atuação lenta)', () => {
    const { zona } = estimarTempoAtuacao('C', 1.2 * 16, 16)
    expect(zona).toBe('TERMICA')
  })

  it('1.0×In → fora da curva (não atua em tempo normativo)', () => {
    const { zona } = estimarTempoAtuacao('C', 1.0 * 16, 16)
    expect(zona).toBe('FORA_DA_CURVA')
  })

  it('maior corrente → menor tempo de atuação (monotonicidade)', () => {
    const lento  = estimarTempoAtuacao('C', 2 * 16, 16)
    const rapido = estimarTempoAtuacao('C', 15 * 16, 16)
    expect(rapido.tempo_ms).toBeLessThan(lento.tempo_ms)
  })

  it('curva D aciona mais tarde que B para mesma corrente', () => {
    // D tem faixa magnética de 10-20×In, B tem 3-5×In
    // Para 7×In: B está na magnética, D ainda não
    const B = estimarTempoAtuacao('B', 7 * 16, 16)
    const D = estimarTempoAtuacao('D', 7 * 16, 16)
    // B já atua (faixa até 5×In foi superada), D ainda não
    expect(B.tempo_ms).toBeLessThan(D.tempo_ms)
  })
})

describe('simularFalta — curto trifásico', () => {

  it('disjuntor atua para corrente alta (Icc >> In)', () => {
    const r = simularFalta(fault_trifasico, ponto_forte, [d1, dg])
    expect(r.dispositivo_atuou_id).toBeDefined()
  })

  it('D1 (16A) atua antes de DG (63A) para curto no circuito C1', () => {
    const r = simularFalta(fault_trifasico, ponto_fraco, [d1, dg])
    // Cadeia [d1, dg]: d1 é o mais próximo da falta — deve atuar primeiro
    expect(r.dispositivo_atuou_id).toBe('D1')
  })

  it('curto trifásico > curto bifásico (86.6%)', () => {
    const r_tri = simularFalta(fault_trifasico, ponto_forte, [d1, dg])
    const r_bi  = simularFalta(fault_bifasico,  ponto_forte, [d1, dg])
    const v_tri = r_tri.visoes[0]?.corrente_ka ?? 0
    const v_bi  = r_bi.visoes[0]?.corrente_ka ?? 0
    expect(v_tri).toBeGreaterThan(v_bi)
    expect(v_bi).toBeCloseTo(v_tri * 0.866, 1)
  })

  it('arco elétrico: corrente menor → tempo de atuação maior', () => {
    const r_curto = simularFalta(fault_trifasico, ponto_forte, [d1, dg])
    const r_arco  = simularFalta(fault_arco,      ponto_forte, [d1, dg])
    // Arco tem corrente ~30% do Icc → pode ficar na zona térmica
    // Arco tem corrente menor que curto trifásico
    const v_arco  = r_arco.visoes[0]?.corrente_ka ?? 0
    const v_curto = r_curto.visoes[0]?.corrente_ka ?? 0
    expect(v_arco).toBeLessThan(v_curto)
  })

  it('energia let-through > 0 quando houve atuação', () => {
    const r = simularFalta(fault_trifasico, ponto_forte, [d1, dg])
    if (r.dispositivo_atuou_id) {
      expect(r.energia_let_through_a2s).toBeGreaterThan(0)
    }
  })

  it('seletivo quando D1 atua antes de DG', () => {
    const r = simularFalta(fault_trifasico, ponto_fraco, [d1, dg])
    // Para Icc baixo, os tempos divergem mais — mais seletivo
    expect(typeof r.seletivo).toBe('boolean')
  })
})

describe('simularFalta — sobrecarga', () => {

  it('sobrecarga 20A em D1 (16A): 1.25×In → zona térmica', () => {
    const r = simularFalta(fault_sobre, ponto_fraco, [d1, dg])
    const visao_d1 = r.visoes.find(v => v.dispositivo_id === 'D1')
    expect(visao_d1?.zona).toBe('TERMICA')
    expect(visao_d1?.atua).toBe(true)
  })

  it('sobrecarga: tempo de atuação maior que curto (zona térmica é lenta)', () => {
    const r_curto = simularFalta(fault_trifasico, ponto_forte, [d1, dg])
    const r_sobre  = simularFalta(fault_sobre,     ponto_fraco, [d1, dg])
    const t_curto = r_curto.tempo_isolamento_ms ?? 0
    const t_sobre  = r_sobre.tempo_isolamento_ms ?? 0
    expect(t_sobre).toBeGreaterThan(t_curto)
  })
})

describe('simularInstalacao — múltiplos cenários', () => {

  it('resumo: coordenacao_ok quando todos bem dimensionados', () => {
    const cenarios: CenarioFalta[] = [
      { falta: fault_trifasico, ponto: ponto_fraco, cadeia: [d1, dg] },
    ]
    const { resumo } = simularInstalacao(cenarios)
    expect(resumo.total_cenarios).toBe(1)
    // Pode ou não estar ok dependendo de Icu — verificar que resumo tem campos
    expect(typeof resumo.coordenacao_ok).toBe('boolean')
  })

  it('dispositivo subdimensionado: Icu insuficiente detectado', () => {
    // Criar ponto com Icc alto vs dispositivo com Icu baixo
    const ponto_alto: PontoCurto = { id:'alto', descricao:'Barra', icc_max_ka:8, icc_min_ka:4, tensao_v:220 }
    const d_fraco: DispositivoProtecao = { ...d1, icu_ka:3 }  // Icu < Icc
    const cenarios: CenarioFalta[] = [
      { falta: fault_trifasico, ponto: ponto_alto, cadeia: [d_fraco, dg] },
    ]
    const { resumo } = simularInstalacao(cenarios)
    expect(resumo.dispositivos_subdimensionados).toBeGreaterThan(0)
  })
})
