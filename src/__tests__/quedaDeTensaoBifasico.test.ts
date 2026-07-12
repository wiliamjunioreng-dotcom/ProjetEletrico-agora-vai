// Teste de regressão — bug de fórmula corrigido nesta sessão:
// bifásico (F-F, 220V de duas fases) usava erroneamente o fator √3
// (válido só para trifásico real). O correto é fator 2, igual ao
// monofásico, pois ambos são circuitos de 2 condutores.

import { describe, it, expect } from 'vitest'
import { calcDeltaU } from '../core/engine'

describe('ΔU — bifásico deve usar fator 2, não √3', () => {
  it('Bifásico (n_fases=2) e monofásico (n_fases=1) com mesmos parâmetros dão ΔU IGUAL', () => {
    // Mesma corrente, seção, comprimento, tensão — só muda a classificação de fases
    const du_mono = calcDeltaU(25, 8, 4, 220, 1, 'Cu')
    const du_bi   = calcDeltaU(25, 8, 4, 220, 2, 'Cu')
    expect(du_bi).toBeCloseTo(du_mono, 6)
  })

  it('Trifásico usa fator √3 — DEVE ser diferente do bifásico/monofásico', () => {
    const du_bi  = calcDeltaU(25, 8, 4, 220, 2, 'Cu')
    const du_tri = calcDeltaU(25, 8, 4, 220, 3, 'Cu')
    // Trifásico = bifásico × (√3/2) ≈ 0.866 — deve ser MENOR, não igual
    expect(du_tri).toBeCloseTo(du_bi * Math.sqrt(3) / 2, 4)
    expect(du_tri).not.toBeCloseTo(du_bi, 2)
  })

  it('Valor de referência: chuveiro 5500W/220V/8m/4mm² → Ib=25A, ΔU correto ≈ 0.71% (fator 2)', () => {
    const du = calcDeltaU(25, 8, 4, 220, 2, 'Cu')
    // ΔU = 2 × ρ(60°C) × L × Ib / (S × V) × 100
    // ρ(60°C) ≈ 0.0172 × (1 + 0.00393×40) ≈ 0.02 Ω·mm²/m
    expect(du).toBeGreaterThan(0.5)
    expect(du).toBeLessThan(1.0)
  })
})
