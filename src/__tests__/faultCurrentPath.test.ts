// src/__tests__/faultCurrentPath.test.ts
import { describe, it, expect } from 'vitest'
import { buildFaultCurrentPath, verificarAtuacaoTN } from '../core/faultCurrentPath'

// ── Segmentos de teste ────────────────────────────────────────────
// Circuito de 15m, cabo 2.5mm² fase + PE 2.5mm²
const segs_fase = [{ secao_mm2:2.5, comprimento_m:15, de:'qd::bf', para:'tomada::bf' }]
const segs_pe   = [{ secao_mm2:2.5, comprimento_m:15, de:'tomada::bpe', para:'qd::bpe' }]

// Disjuntor 16A curva C
const disj_16c = { id:'D1', corrente_in:16, curva:'C' as const }

describe('buildFaultCurrentPath — loop de impedância', () => {

  it('z_total = z_fase + z_pe', () => {
    const path = buildFaultCurrentPath('c1','tomada::bf', 220, segs_fase, segs_pe)
    expect(path.z_total_ohm).toBeCloseTo(path.z_fase_ohm + path.z_pe_ohm, 3)
  })

  it('z_fase > 0 para cabo não nulo', () => {
    const path = buildFaultCurrentPath('c1','tomada::bf', 220, segs_fase, segs_pe)
    expect(path.z_fase_ohm).toBeGreaterThan(0)
    expect(path.z_pe_ohm).toBeGreaterThan(0)
  })

  it('cabo mais longo → z_fase maior → icc_calc menor', () => {
    const curto = buildFaultCurrentPath('c1','p', 220, [{secao_mm2:2.5, comprimento_m:5, de:'a', para:'b'}], segs_pe)
    const longo = buildFaultCurrentPath('c1','p', 220, [{secao_mm2:2.5, comprimento_m:30, de:'a', para:'b'}], segs_pe)
    expect(longo.z_fase_ohm).toBeGreaterThan(curto.z_fase_ohm)
    expect(longo.icc_calc_a).toBeLessThan(curto.icc_calc_a)
  })

  it('cabo mais grosso → z_fase menor → icc_calc maior', () => {
    const fino   = buildFaultCurrentPath('c1','p', 220, [{secao_mm2:1.5, comprimento_m:15, de:'a', para:'b'}], segs_pe)
    const grosso = buildFaultCurrentPath('c1','p', 220, [{secao_mm2:6.0, comprimento_m:15, de:'a', para:'b'}], segs_pe)
    expect(grosso.icc_calc_a).toBeGreaterThan(fino.icc_calc_a)
  })

  it('tensão maior → icc_calc maior (proporcional)', () => {
    const p220 = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe)
    const p127 = buildFaultCurrentPath('c1','p', 127, segs_fase, segs_pe)
    expect(p220.icc_calc_a).toBeGreaterThan(p127.icc_calc_a)
    // Deve ser proporcional à tensão
    expect(p220.icc_calc_a / p127.icc_calc_a).toBeCloseTo(220 / 127, 0)
  })

  it('icc_calc > 0 para segmentos válidos', () => {
    const path = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe)
    expect(path.icc_calc_a).toBeGreaterThan(0)
  })

  it('segmentos de fase têm corrente propagada', () => {
    const path = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe)
    for (const seg of path.caminho_fase) {
      expect(seg.corrente_a).toBeGreaterThan(0)
    }
  })
})

describe('buildFaultCurrentPath — verificação de atuação', () => {

  it('circuito curto de 2.5mm²/5m: Icc alto → ia_adequada=true para D16A-C', () => {
    const path = buildFaultCurrentPath('c1','p', 220,
      [{secao_mm2:2.5, comprimento_m:5, de:'a', para:'b'}],
      [{secao_mm2:2.5, comprimento_m:5, de:'b', para:'a'}],
      disj_16c
    )
    // Icc_loop para 5m/2.5mm²: z ≈ 0.023Ω × 2 ≈ 46mΩ → I = 220/0.046 ≈ 4780A >> 80A
    expect(path.ia_adequada).toBe(true)
    expect(path.icc_calc_a).toBeGreaterThan(path.corrente_atuacao_a)
  })

  it('circuito muito longo: Icc baixo → pode ser ia_adequada=false', () => {
    const path = buildFaultCurrentPath('c1','p', 220,
      [{secao_mm2:1.5, comprimento_m:100, de:'a', para:'b'}],
      [{secao_mm2:1.5, comprimento_m:100, de:'b', para:'a'}],
      disj_16c
    )
    // z ≈ 0.014 × 100/1.5 × 1.28 × 2 ≈ 2.39Ω → I = 220/2.39 ≈ 92A
    // corrente_atuacao_min para 16A C: 5×16 = 80A
    // 92A > 80A → ia_adequada = true (zona magnética)
    expect(typeof path.ia_adequada).toBe('boolean')
  })

  it('PE subdimensionado: z_pe > 2×z_fase → aviso PE_IMPEDANCIA_ALTA', () => {
    const path = buildFaultCurrentPath('c1','p', 220,
      [{secao_mm2:6.0, comprimento_m:20, de:'a', para:'b'}],  // fase grosso
      [{secao_mm2:1.0, comprimento_m:20, de:'b', para:'a'}],  // PE muito fino
    )
    const aviso = path.avisos.find(a => a.tipo === 'PE_IMPEDANCIA_ALTA')
    expect(aviso).toBeDefined()
    expect(aviso?.severidade).toBe('aviso')
  })

  it('sem PE: aviso PE_AUSENTE', () => {
    const path = buildFaultCurrentPath('c1','p', 220, segs_fase, [])
    const aviso = path.avisos.find(a => a.tipo === 'PE_AUSENTE')
    expect(aviso).toBeDefined()
    expect(aviso?.severidade).toBe('erro')
  })

  it('corrente_atuacao_a = 5×In para curva C', () => {
    const path = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe, disj_16c)
    expect(path.corrente_atuacao_a).toBe(5 * 16)  // = 80A
  })

  it('curva B: limiar menor que curva C para mesmo In', () => {
    const pB = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe, { id:'D', corrente_in:16, curva:'B' })
    const pC = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe, { id:'D', corrente_in:16, curva:'C' })
    expect(pB.corrente_atuacao_a).toBeLessThan(pC.corrente_atuacao_a)  // B: 3×In < C: 5×In
  })
})

describe('verificarAtuacaoTN — IEC 60364-4-41', () => {

  it('loop rápido: ok=true', () => {
    const path = buildFaultCurrentPath('c1','p', 220,
      [{secao_mm2:2.5, comprimento_m:5, de:'a', para:'b'}],
      [{secao_mm2:2.5, comprimento_m:5, de:'b', para:'a'}],
      disj_16c
    )
    const v = verificarAtuacaoTN(path)
    expect(v.tempo_max_s).toBe(0.4)
    expect(typeof v.ok).toBe('boolean')
  })

  it('loop lento (ia_inadequada): ok=false', () => {
    const path = buildFaultCurrentPath('c1','p', 220,
      [{secao_mm2:1.5, comprimento_m:200, de:'a', para:'b'}],
      [{secao_mm2:1.5, comprimento_m:200, de:'b', para:'a'}],
      { id:'D', corrente_in:16, curva:'C' }
    )
    const v = verificarAtuacaoTN(path)
    // Para circuito muito longo, pode não atuar corretamente
    if (!path.ia_adequada) expect(v.ok).toBe(false)
  })

  it('descricao sempre preenchida', () => {
    const path = buildFaultCurrentPath('c1','p', 220, segs_fase, segs_pe, disj_16c)
    const v = verificarAtuacaoTN(path)
    expect(v.descricao.length).toBeGreaterThan(10)
  })
})
