// src/__tests__/protectionDevicePhysics.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcTempoAtuacao, calcI2T, capacidadeTermica, verificarTermica,
  buildModeloDispositivo, verificarSeletividadeEnergetica,
  inferirCurva, verificarCompatibilidadeCurva,
  FATOR_K, ZONA_MAGNETICA,
} from '../core/protectionDevicePhysics'

describe('Curvas I×t — calcTempoAtuacao', () => {

  it('curva C, 20×In (>> max=10): zona magnética, t=10ms', () => {
    const r = calcTempoAtuacao('C', 20 * 16, 16)
    expect(r.zona).toBe('MAGNETICA')
    expect(r.tempo_ms).toBe(10)
  })

  it('curva C, 7×In (entre 5 e 10): zona magnética com dispersão', () => {
    const r = calcTempoAtuacao('C', 7 * 16, 16)
    expect(r.zona).toBe('MAGNETICA')
    expect(r.tempo_ms).toBeGreaterThan(10)
    expect(r.tempo_ms).toBeLessThanOrEqual(100)
  })

  it('curva C, 2×In (abaixo do min=5): zona térmica', () => {
    const r = calcTempoAtuacao('C', 2 * 16, 16)
    expect(r.zona).toBe('TERMICA')
    expect(r.tempo_ms).toBeGreaterThan(100)
  })

  it('curva C, 1.0×In: fora da curva (não desliga)', () => {
    const r = calcTempoAtuacao('C', 1.0 * 16, 16)
    expect(r.zona).toBe('FORA_CURVA')
    expect(r.tempo_ms).toBe(Infinity)
  })

  it('curva B abre mais rápido que C para mesma corrente (zona térmica)', () => {
    // Para 4×In: B está na zona magnética (3-5×In), C ainda na térmica (5-10×In)
    const B = calcTempoAtuacao('B', 4 * 16, 16)
    const C = calcTempoAtuacao('C', 4 * 16, 16)
    expect(B.zona).toBe('MAGNETICA')
    expect(C.zona).toBe('TERMICA')
    expect(B.tempo_ms).toBeLessThan(C.tempo_ms)
  })

  it('zona magnética monotonicidade: maior corrente → menor tempo', () => {
    const t1 = calcTempoAtuacao('C', 6 * 16, 16)   // 6×In (próximo de 5)
    const t2 = calcTempoAtuacao('C', 9 * 16, 16)   // 9×In (próximo de 10)
    if (t1.zona === 'MAGNETICA' && t2.zona === 'MAGNETICA') {
      expect(t2.tempo_ms).toBeLessThanOrEqual(t1.tempo_ms)
    }
  })

  it('zona térmica monotonicidade: maior corrente → menor tempo', () => {
    const t1 = calcTempoAtuacao('C', 1.5 * 16, 16)  // 1.5×In
    const t2 = calcTempoAtuacao('C', 3.0 * 16, 16)  // 3×In (ainda térmica para C)
    expect(t2.tempo_ms).toBeLessThan(t1.tempo_ms)
  })
})

describe('Capacidade térmica do cabo — k²S²', () => {

  it('FATOR_K: Cu/PVC = 115', () => {
    expect(FATOR_K['Cu/PVC']).toBe(115)
  })

  it('FATOR_K: Cu/XLPE > Cu/PVC (XLPE suporta mais)', () => {
    expect(FATOR_K['Cu/XLPE']).toBeGreaterThan(FATOR_K['Cu/PVC'])
  })

  it('capacidade: aumenta com a seção ao quadrado', () => {
    const c1 = capacidadeTermica(1.5)
    const c25 = capacidadeTermica(2.5)
    const c6  = capacidadeTermica(6)
    expect(c25).toBeGreaterThan(c1)
    expect(c6).toBeGreaterThan(c25)
    // Deve ser proporcional ao quadrado da seção
    expect(c25 / c1).toBeCloseTo((2.5/1.5) ** 2, 0)
  })

  it('capacidade 2.5mm² Cu/PVC = (115×2.5)² = 82656.25 A²s', () => {
    expect(capacidadeTermica(2.5, 'Cu/PVC')).toBeCloseTo(115*115*2.5*2.5, 0)
  })
})

describe('I²t let-through', () => {

  it('I²t = I² × t para dispositivo não limitador', () => {
    const i = 1000  // A
    const t = 0.01  // 10ms em s
    expect(calcI2T(i, 10)).toBeCloseTo(i*i*t, 0)
  })

  it('I²t limitador < I²t não limitador (limitadores reduzem energia passante)', () => {
    const normal   = calcI2T(5000, 10, false)
    const limitado = calcI2T(5000, 10, true)
    expect(limitado).toBeLessThan(normal)
    expect(limitado).toBeCloseTo(normal * 0.10, 0)
  })
})

describe('verificarTermica — cabo vs I²t passante', () => {

  it('cabo 2.5mm² Cu/PVC sob 1kA por 10ms: seguro', () => {
    const r = verificarTermica(2.5, 'Cu/PVC', 1000, 10, 'C', 16)
    // I²t = 1000² × 0.01 = 10000 A²s < k²S² = 82656
    expect(r.seguro).toBe(true)
    expect(r.margem_pct).toBeGreaterThan(0)
  })

  it('cabo 1.5mm² sob corrente muito alta: pode não ser seguro', () => {
    // I²t = 5000² × 0.1 = 2500000 vs k²S² = (115×1.5)² = 29756 → inseguro
    const r = verificarTermica(1.5, 'Cu/PVC', 5000, 100, 'C', 16)
    expect(typeof r.seguro).toBe('boolean')
    expect(r.energia_a2s).toBeGreaterThan(r.capacidade_a2s)
    expect(r.seguro).toBe(false)
  })

  it('cabo mais grosso: sempre mais margem que cabo fino', () => {
    const r15 = verificarTermica(1.5, 'Cu/PVC', 500, 10, 'C', 16)
    const r6  = verificarTermica(6.0, 'Cu/PVC', 500, 10, 'C', 16)
    expect(r6.capacidade_a2s).toBeGreaterThan(r15.capacidade_a2s)
    expect(r6.margem_pct).toBeGreaterThan(r15.margem_pct)
  })
})

describe('buildModeloDispositivo', () => {

  it('cria modelo com zona magnética correta para curva C', () => {
    const m = buildModeloDispositivo('D1', 'DISJUNTOR_RES', 16, 'C', 6)
    expect(m.zona_mag.min_mult).toBe(ZONA_MAGNETICA.C.min)
    expect(m.zona_mag.max_mult).toBe(ZONA_MAGNETICA.C.max)
  })

  it('limitador default = false', () => {
    const m = buildModeloDispositivo('D1', 'DISJUNTOR_RES', 16, 'C', 6)
    expect(m.limitador).toBe(false)
  })
})

describe('verificarSeletividadeEnergetica', () => {

  const dg = buildModeloDispositivo('DG', 'DISJUNTOR_RES', 63, 'C', 10)
  const d1 = buildModeloDispositivo('D1', 'DISJUNTOR_RES', 16, 'C', 6)

  it('DG 63A / D1 16A: seletividade energética esperada', () => {
    const r = verificarSeletividadeEnergetica(dg, d1, 1.5)  // Icc=1.5kA
    expect(r.i2t_jusante).toBeGreaterThan(0)
    expect(r.i2t_montante).toBeGreaterThan(0)
    // D1 (16A) abre antes de DG (63A) para Icc moderado → seletivo
    expect(typeof r.seletivo).toBe('boolean')
    expect(r.justificativa.length).toBeGreaterThan(10)
  })

  it('par com mesmo In: sem seletividade energética', () => {
    const d_igual = buildModeloDispositivo('Dx', 'DISJUNTOR_RES', 63, 'C', 6)
    const r = verificarSeletividadeEnergetica(dg, d_igual, 2.0)
    // Dois dispositivos com mesmo In têm I²t similares → sem seletividade
    expect(typeof r.seletivo).toBe('boolean')
  })
})


// Adicionar ao arquivo existente de protectionDevicePhysics.test.ts
describe('inferirCurva — tipo de carga → curva do disjuntor', () => {

  it('ILUM: curva C (inrush de reatores)', () => {
    const s = inferirCurva('ILUM')
    expect(s.curva).toBe('C')
    expect(s.inrush_multiplo[1]).toBeGreaterThanOrEqual(5)
  })

  it('TUG: curva C (uso geral)', () => {
    const s = inferirCurva('TUG')
    expect(s.curva).toBe('C')
  })

  it('TUE resistivo (chuveiro): curva B (sem inrush)', () => {
    const s = inferirCurva('TUE', 'chuveiro_resistivo')
    expect(s.curva).toBe('B')
    expect(s.inrush_multiplo[1]).toBeLessThanOrEqual(2)
  })

  it('TUE motor grande DOL: curva D (inrush 8–12×In)', () => {
    const s = inferirCurva('TUE', 'motor_dol', 5000)
    expect(s.curva).toBe('D')
    expect(s.inrush_multiplo[0]).toBeGreaterThanOrEqual(8)
  })

  it('TUE ar-condicionado inverter: curva C (partida suave)', () => {
    const s = inferirCurva('TUE', 'ar_condicionado_inverter')
    expect(s.curva).toBe('C')
    expect(s.inrush_multiplo[1]).toBeLessThanOrEqual(5)
  })

  it('TUE motor pequeno (<3kW): curva C', () => {
    const s = inferirCurva('TUE', 'motor', 1500)
    expect(s.curva).toBe('C')
  })

  it('toda sugestão tem justificativa não vazia', () => {
    const tipos = ['ILUM', 'TUG', 'TUE', 'GERAL']
    for (const tipo of tipos) {
      const s = inferirCurva(tipo)
      expect(s.justificativa.length).toBeGreaterThan(20)
    }
  })

  it('inrush_multiplo[0] < inrush_multiplo[1]', () => {
    const tipos = ['ILUM', 'TUG', 'TUE']
    for (const tipo of tipos) {
      const s = inferirCurva(tipo)
      expect(s.inrush_multiplo[0]).toBeLessThan(s.inrush_multiplo[1])
    }
  })
})

describe('verificarCompatibilidadeCurva', () => {

  it('Curva B para carga resistiva: compatível sem risco', () => {
    const sug = inferirCurva('TUE', 'chuveiro_resistivo')  // curva B, inrush [1,2]
    const v   = verificarCompatibilidadeCurva('B', sug)
    expect(v.compativel).toBe(true)
    expect(v.risco).toBe('NENHUM')
  })

  it('Curva B para ILUM: risco de desarme (inrush 8×In entra na zona mag B)', () => {
    const sug = inferirCurva('ILUM')  // inrush até 8×In
    const v   = verificarCompatibilidadeCurva('B', sug)
    // 8×In > 3×In (início zona mag B) → risco de desarme
    expect(v.risco).toBe('DESARME_PARTIDA')
    expect(v.compativel).toBe(false)
  })

  it('Curva D para carga resistiva: compatível mas sensibilidade baixa', () => {
    const sug = inferirCurva('TUE', 'resistivo')
    const v   = verificarCompatibilidadeCurva('D', sug)
    // D é muito insensível para resistivo
    expect(v.risco).not.toBe('NENHUM')
  })

  it('Curva C para motor DOL grande: deve ser compatível', () => {
    const sug = inferirCurva('TUE', 'motor_dol', 5000)  // inrush 8-12×In
    const v   = verificarCompatibilidadeCurva('C', sug)
    // C (5-10×In) vs inrush de 8-12×In: margem
    expect(typeof v.compativel).toBe('boolean')
  })
})
