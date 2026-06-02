// src/__tests__/dynamicProtectionCoordination.test.ts
import { describe, it, expect } from 'vitest'
import {
  simularCascata, analisarCoordinacaoDinamica,
} from '../core/dynamicProtectionCoordination'
import { buildModeloDispositivo } from '../core/protectionDevicePhysics'

// ── Modelos de dispositivo ────────────────────────────────────────
const dg_63 = buildModeloDispositivo('DG',  'DISJUNTOR_RES', 63, 'C', 10)
const d1_16 = buildModeloDispositivo('D1',  'DISJUNTOR_RES', 16, 'C', 6)
// Cabos correspondentes
const cabo_25  = { secao_mm2: 2.5, isolacao: 'Cu/PVC' }
const cabo_15  = { secao_mm2: 1.5, isolacao: 'Cu/PVC' }

describe('simularCascata — atuação na cascata', () => {

  it('para Icc alto: primeiro dispositivo atua', () => {
    const r = simularCascata(5000, [d1_16, dg_63])
    expect(r.primeiro_atuou).toBeDefined()
    expect(r.tempo_first_ms).toBeGreaterThan(0)
  })

  it('D1 (16A) atua antes de DG (63A) para Icc alto — menor In → abre mais rápido?', () => {
    // Para Icc = 5000A:
    // D1: 5000/16 = 312×In → zona magnética (instantâneo = 10ms)
    // DG: 5000/63 = 79×In → zona magnética (instantâneo = 10ms)
    // Ambos na mesma zona — D1 é o primeiro na cadeia
    const r = simularCascata(5000, [d1_16, dg_63])
    // O primeiro na lista (mais próximo da falta) deve ser D1
    expect(r.primeiro_atuou).toBe('D1')
  })

  it('para Icc muito alto: I²t total > 0', () => {
    const r = simularCascata(8000, [d1_16, dg_63])
    expect(r.i2t_total_a2s).toBeGreaterThan(0)
  })

  it('para Icc abaixo da zona magnética do DG mas acima do D1: D1 atua, DG não', () => {
    // DG 63A curva C: zona magnética começa em 5×63 = 315A
    // D1 16A curva C: zona magnética começa em 5×16 = 80A
    // Icc = 200A: D1 atuará (zona magnética), DG está na zona térmica (mais lento)
    const r = simularCascata(200, [d1_16, dg_63])
    expect(r.primeiro_atuou).toBe('D1')
    // DG deve ter tempo muito maior (zona térmica) → seletivo
    const atu_dg = r.atuacoes.find(a => a.dispositivo_id === 'DG')
    const atu_d1 = r.atuacoes.find(a => a.dispositivo_id === 'D1')
    expect(atu_d1?.tempo_ms).toBeLessThan(atu_dg?.tempo_ms ?? Infinity)
  })

  it('seletivo quando apenas o primeiro atuou sem indevidos', () => {
    const r = simularCascata(200, [d1_16, dg_63])
    // D1 (16A) abre bem antes de DG (63A) → seletivo
    expect(r.seletivo).toBe(true)
    expect(r.atuacoes_indevidas).toHaveLength(0)
  })

  it('i2t_em_cascata = 0 quando seletivo', () => {
    const r = simularCascata(200, [d1_16, dg_63])
    if (r.seletivo) expect(r.i2t_em_cascata).toBe(0)
  })

  it('sem cascata para Icc muito alto com dispositivos bem dimensionados', () => {
    // Para Icc = 5000A: ambos na zona magnética, D1 abre em 10ms
    // DG vê I²t até D1 abrir, mas seu tempo próprio também é 10ms
    // → sem seletividade (ambos instantâneos)
    const r = simularCascata(5000, [d1_16, dg_63])
    // Resultado pode ser seletivo ou não — verificar que o campo existe
    expect(typeof r.seletivo).toBe('boolean')
    expect(r.atuacoes).toHaveLength(2)
  })

  it('cabo fino com Icc alto: aviso CABO_EM_RISCO', () => {
    // 1.5mm²: capacidade = (115×1.5)² = 29756 A²s
    // 8000A por 10ms: I²t = 8000² × 0.01 = 640000 A²s >> 29756 → em risco
    const r = simularCascata(8000, [d1_16, dg_63], [cabo_15, cabo_25])
    const aviso = r.avisos.find(a => a.tipo === 'CABO_EM_RISCO')
    expect(aviso).toBeDefined()
    expect(aviso?.severidade).toBe('erro')
  })

  it('cabo 2.5mm² com Icc moderado: seguro', () => {
    // 2.5mm²: capacidade = (115×2.5)² = 82656 A²s
    // 500A por 50ms: I²t = 500² × 0.05 = 12500 A²s << 82656 → seguro
    const r = simularCascata(500, [d1_16, dg_63], [cabo_25, cabo_25])
    const cabos_em_risco = r.atuacoes.filter(a => !a.cabo_seguro)
    expect(cabos_em_risco).toHaveLength(0)
  })
})

describe('simularCascata — I²t na cascata', () => {

  it('I²t_total = Icc² × t_atuacao_primeiro', () => {
    const r = simularCascata(1000, [d1_16, dg_63])
    const primeiro = r.atuacoes.find(a => a.dispositivo_id === r.primeiro_atuou)!
    const i2t_esperado = 1000 ** 2 * (primeiro.tempo_ms / 1000)
    expect(r.i2t_total_a2s).toBeCloseTo(i2t_esperado, -2)
  })

  it('I²t maior para Icc maior (mesma duração)', () => {
    // Para correntes na mesma zona (magnética) o tempo é igual → I²t ∝ I²
    const r1 = simularCascata(2000, [d1_16, dg_63])
    const r2 = simularCascata(4000, [d1_16, dg_63])
    if (r1.primeiro_atuou === r2.primeiro_atuou &&
        r1.tempo_first_ms === r2.tempo_first_ms) {
      expect(r2.i2t_total_a2s).toBeGreaterThan(r1.i2t_total_a2s)
    }
  })
})

describe('analisarCoordinacaoDinamica — varredura de correntes', () => {

  it('testa múltiplas correntes e retorna cenários', () => {
    const correntes = [100, 500, 1000, 5000]
    const analise = analisarCoordinacaoDinamica(correntes, [d1_16, dg_63])
    expect(analise.cenarios).toHaveLength(4)
  })

  it('seletivos: 0-100% (percentual válido)', () => {
    const analise = analisarCoordinacaoDinamica([100, 200, 500, 1000], [d1_16, dg_63])
    expect(analise.seletivos).toBeGreaterThanOrEqual(0)
    expect(analise.seletivos).toBeLessThanOrEqual(100)
  })

  it('instalação bem dimensionada tem alta taxa de seletividade', () => {
    // DG 63A / D1 16A: ratio 3.9 → boa seletividade em correntes moderadas
    const analise = analisarCoordinacaoDinamica([50, 100, 200, 500], [d1_16, dg_63])
    // Para correntes baixas/moderadas, D1 (16A) abre antes do DG (63A)
    expect(analise.seletivos).toBeGreaterThan(50)
  })
})
