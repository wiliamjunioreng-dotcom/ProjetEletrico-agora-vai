// src/__tests__/minFaultCurrentAnalysis.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildMinFaultAnalysis, comprimentoMaximo,
  resistividadeCobre, TEMP_OPERACAO,
} from '../core/minFaultCurrentAnalysis'

describe('resistividadeCobre — física de temperatura', () => {

  it('resistividade a 20°C = 0.0172 Ω·mm²/m (valor de referência)', () => {
    expect(resistividadeCobre(20)).toBeCloseTo(0.0172, 4)
  })

  it('resistividade a 70°C > a 20°C (cabo quente = mais resistência)', () => {
    expect(resistividadeCobre(70)).toBeGreaterThan(resistividadeCobre(20))
  })

  it('aumento de ~28% de 20°C para 70°C', () => {
    const r20 = resistividadeCobre(20)
    const r70 = resistividadeCobre(70)
    expect(r70 / r20).toBeCloseTo(1.197, 1)  // 1 + 0.00393×50 ≈ 1.197
  })

  it('XLPE suporta temperatura maior que PVC', () => {
    expect(TEMP_OPERACAO['XLPE']).toBeGreaterThan(TEMP_OPERACAO['PVC'])
  })
})

describe('buildMinFaultAnalysis — análise de pior caso', () => {

  // Circuito de referência: 2.5mm² fase, 2.5mm² PE, 20m, PVC, curva C, 16A, 220V
  const circ_ok = () => buildMinFaultAnalysis('c1','p1', 220, 2.5, 2.5, 20, 'PVC', 'C', 16)

  it('tensao_minima_v = 220V × 0.90 = 198V', () => {
    const r = circ_ok()
    expect(r.tensao_minima_v).toBeCloseTo(198, 0)
  })

  it('z_total = z_fase + z_pe (pior caso)', () => {
    const r = circ_ok()
    expect(r.z_total_max_ohm).toBeCloseTo(r.z_fase_max_ohm + r.z_pe_max_ohm, 3)
  })

  it('icc_min < icc_nominal (pior caso é sempre menos que nominal)', () => {
    const r = circ_ok()
    expect(r.icc_min_a).toBeLessThan(r.icc_nominal_a)
  })

  it('ia_min = 5×In para curva C (IEC 60898-1)', () => {
    const r = circ_ok()
    expect(r.ia_min_a).toBe(5 * 16)  // = 80A
  })

  it('ia_min(B) < ia_min(C) < ia_min(D)', () => {
    const rB = buildMinFaultAnalysis('c1','p1', 220, 2.5, 2.5, 20, 'PVC', 'B', 16)
    const rC = buildMinFaultAnalysis('c1','p1', 220, 2.5, 2.5, 20, 'PVC', 'C', 16)
    const rD = buildMinFaultAnalysis('c1','p1', 220, 2.5, 2.5, 20, 'PVC', 'D', 16)
    expect(rB.ia_min_a).toBeLessThan(rC.ia_min_a)
    expect(rC.ia_min_a).toBeLessThan(rD.ia_min_a)
  })

  it('circuito curto (20m): proteção funcional', () => {
    const r = circ_ok()
    expect(r.protecao_funcional).toBe(true)
    expect(r.fator_seguranca).toBeGreaterThan(1.0)
  })

  it('circuito muito longo (150m): proteção pode NÃO funcionar', () => {
    // 150m de 1.5mm² para 16A curva C → Icc_min muito baixo
    const r = buildMinFaultAnalysis('c1','p1', 220, 1.5, 1.5, 150, 'PVC', 'C', 16)
    // Verificar que foi calculado sem erro — resultado depende da física
    expect(typeof r.protecao_funcional).toBe('boolean')
    expect(r.icc_min_a).toBeGreaterThan(0)
    // Circuito longo deve ter icc_min << circuito curto
    const r_curto = buildMinFaultAnalysis('c1','p1', 220, 1.5, 1.5, 20, 'PVC', 'C', 16)
    expect(r.icc_min_a).toBeLessThan(r_curto.icc_min_a)
  })

  it('proteção NÃO funcional gera aviso CORRENTE_INSUFICIENTE', () => {
    // Circuito longo de 1.5mm² forçando Icc < Ia
    // Calcular o comprimento onde isso acontece
    const lim = comprimentoMaximo(1.5, 1.5, 220, 'PVC', 'C', 16)
    const r = buildMinFaultAnalysis('c1','p1', 220, 1.5, 1.5,
      lim.comprimento_max_m + 10, 'PVC', 'C', 16)
    expect(r.protecao_funcional).toBe(false)
    const aviso = r.avisos.find(a => a.tipo === 'CORRENTE_INSUFICIENTE')
    expect(aviso).toBeDefined()
    expect(aviso?.severidade).toBe('erro')
    expect(aviso?.acao).toBeDefined()  // deve ter ação corretiva
  })

  it('PE subdimensionado: aviso quando z_pe > 1.5×z_fase', () => {
    // Fase 6mm², PE 1.0mm² → PE muito fino
    const r = buildMinFaultAnalysis('c1','p1', 220, 6.0, 1.0, 20, 'PVC', 'C', 16)
    const aviso = r.avisos.find(a => a.tipo === 'PE_SUBDIMENSIONADO')
    expect(aviso).toBeDefined()
  })

  it('fator_seguranca: icc_min / ia_min', () => {
    const r = circ_ok()
    expect(r.fator_seguranca).toBeCloseTo(r.icc_min_a / r.ia_min_a, 1)
  })
})

describe('comprimentoMaximo — comprimento limite de proteção', () => {

  it('comprimento máximo > 0', () => {
    const r = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'C', 16)
    expect(r.comprimento_max_m).toBeGreaterThan(0)
  })

  it('cabo mais grosso → comprimento máximo maior', () => {
    const r15 = comprimentoMaximo(1.5, 1.5, 220, 'PVC', 'C', 16)
    const r25 = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'C', 16)
    const r60 = comprimentoMaximo(6.0, 6.0, 220, 'PVC', 'C', 16)
    expect(r25.comprimento_max_m).toBeGreaterThan(r15.comprimento_max_m)
    expect(r60.comprimento_max_m).toBeGreaterThan(r25.comprimento_max_m)
  })

  it('curva B → comprimento máximo maior que curva C (ia_min menor)', () => {
    const rB = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'B', 16)
    const rC = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'C', 16)
    // Ia_min(B) = 3×In < Ia_min(C) = 5×In → B aceita Zs maior → mais comprimento
    expect(rB.comprimento_max_m).toBeGreaterThan(rC.comprimento_max_m)
  })

  it('curva D → comprimento máximo MENOR (ia_min maior, Zs deve ser menor)', () => {
    const rC = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'C', 16)
    const rD = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'D', 16)
    // Ia_min(D) = 10×In > Ia_min(C) = 5×In → D exige Icc maior → menos comprimento
    expect(rD.comprimento_max_m).toBeLessThan(rC.comprimento_max_m)
  })

  it('tensão maior → comprimento máximo maior (mais tensão disponível)', () => {
    const r220 = comprimentoMaximo(2.5, 2.5, 220, 'PVC', 'C', 16)
    const r127 = comprimentoMaximo(2.5, 2.5, 127, 'PVC', 'C', 16)
    expect(r220.comprimento_max_m).toBeGreaterThan(r127.comprimento_max_m)
  })
})
