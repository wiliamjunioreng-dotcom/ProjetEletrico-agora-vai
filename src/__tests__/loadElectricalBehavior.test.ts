// src/__tests__/loadElectricalBehavior.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildLoadBehavior, verificarCompatDispositivo, calcAggregateInrush,
  COMPORTAMENTOS,
} from '../core/loadElectricalBehavior'

describe('LoadElectricalBehavior — banco de comportamentos', () => {

  it('todos os tipos têm inrush_duracao_ms definido', () => {
    for (const [_tipo, comp] of Object.entries(COMPORTAMENTOS)) {
      expect(comp.inrush_duracao_ms).toBeGreaterThan(0)
      expect(comp.inrush_mult).toBeGreaterThan(0)
    }
  })

  it('MOTOR_DOL tem duração MUITO maior que LED_DRIVER', () => {
    expect(COMPORTAMENTOS.MOTOR_DOL.inrush_duracao_ms).toBeGreaterThan(
      COMPORTAMENTOS.LED_DRIVER.inrush_duracao_ms * 100
    )
  })

  it('LED_DRIVER tem inrush_mult alto mas duração < 1ms', () => {
    const led = COMPORTAMENTOS.LED_DRIVER
    expect(led.inrush_mult).toBeGreaterThan(10)
    expect(led.inrush_duracao_ms).toBeLessThan(1)
  })

  it('curva sugerida por tipo: motor DOL → D, resistivo → B', () => {
    expect(COMPORTAMENTOS.MOTOR_DOL.curva_sugerida).toBe('D')
    expect(COMPORTAMENTOS.RESISTIVO.curva_sugerida).toBe('B')
    expect(COMPORTAMENTOS.FLUORESCENTE.curva_sugerida).toBe('C')
  })

  it('TRAFO_TOROIDAL: risco alto com curva B e C', () => {
    const trafo = COMPORTAMENTOS.TRAFO_TOROIDAL
    expect(trafo.risco_curva_B).toBe('ALTO')
    expect(trafo.risco_curva_C).toBe('ALTO')
    expect(trafo.risco_curva_D).not.toBe('ALTO')
  })
})

describe('buildLoadBehavior — I²t de inrush', () => {

  it('motor DOL 10A: I²t = (80A)² × 0.3s = 1920 A²s', () => {
    const beh = buildLoadBehavior('MOTOR_DOL', 10)
    // inrush_mult=8 → 80A, duracao=300ms → 0.3s
    expect(beh.inrush_i2t).toBeCloseTo(80*80*0.3, 0)
  })

  it('LED driver 1A: I²t muito baixo (pico curto)', () => {
    const beh = buildLoadBehavior('LED_DRIVER', 1)
    // inrush_mult=15 → 15A, duracao=0.5ms → 0.0005s
    const esperado = 15*15*0.0005
    expect(beh.inrush_i2t).toBeCloseTo(esperado, 0)
  })

  it('I²t(MOTOR_DOL) >> I²t(LED_DRIVER) para mesma potência', () => {
    const motor = buildLoadBehavior('MOTOR_DOL', 5)
    const led   = buildLoadBehavior('LED_DRIVER', 5)
    expect(motor.inrush_i2t).toBeGreaterThan(led.inrush_i2t * 100)
  })
})

describe('verificarCompatDispositivo — temporal', () => {

  it('LED driver: inrush passa pelo disjuntor (< 50ms de atuação)', () => {
    const beh = buildLoadBehavior('LED_DRIVER', 1)
    const r   = verificarCompatDispositivo(beh, 'C', 16)
    expect(r.inrush_passa).toBe(true)
  })

  it('Motor DOL 10A no disjuntor 16A curva C: inrush > tempo de atuação', () => {
    // Motor DOL: inrush 8×10A = 80A / 16A = 5×In (início zona mag C)
    // Duração: 300ms >> 50ms → DISPARA
    const beh = buildLoadBehavior('MOTOR_DOL', 10)
    const r   = verificarCompatDispositivo(beh, 'C', 16)
    // 80A em disjuntor 16A curva C = 5×In (exatamente no limiar)
    // Risco é MEDIO para C
    expect(['ALTO','MEDIO']).toContain(r.risco_disparo)
  })

  it('Motor DOL com curva D: sem risco (10–20×In requer muito mais)', () => {
    const beh = buildLoadBehavior('MOTOR_DOL', 10)
    const r   = verificarCompatDispositivo(beh, 'D', 16)
    expect(r.risco_disparo).toBe('SEM_RISCO')
  })

  it('Resistivo com curva B: sem risco', () => {
    const beh = buildLoadBehavior('RESISTIVO', 20)
    const r   = verificarCompatDispositivo(beh, 'B', 25)
    expect(r.risco_disparo).toBe('SEM_RISCO')
    expect(r.ok).toBe(true)
  })
})

describe('calcAggregateInrush — cargas simultâneas', () => {

  it('10 LEDs simultâneos: inrush_total = soma dos picos', () => {
    const led = buildLoadBehavior('LED_DRIVER', 0.5)  // 0.5A cada
    const grupo = Array.from({ length:10 }, () => ({ comportamento: led, simultaneo: true }))
    const agg = calcAggregateInrush(grupo)
    // 10 × 0.5A × 15×mult = 75A pico total
    expect(agg.inrush_total_a).toBe(Math.round(10 * 0.5 * 15))
    expect(agg.n_cargas).toBe(10)
  })

  it('mix simultâneo/não-simultâneo: só simultâneos somam', () => {
    const led  = buildLoadBehavior('LED_DRIVER', 0.5)
    const motor = buildLoadBehavior('MOTOR_DOL', 5)
    const grupo = [
      { comportamento: led,   simultaneo: true  },
      { comportamento: motor, simultaneo: false },  // não simultâneo
    ]
    const agg = calcAggregateInrush(grupo)
    // Só LED conta no inrush simultâneo
    expect(agg.inrush_total_a).toBeLessThan(motor.inrush_mult * motor.in_operacao_a)
  })

  it('I²t agregado: soma dos I²t individuais', () => {
    const led = buildLoadBehavior('LED_DRIVER', 1)
    const grupo = [
      { comportamento: led, simultaneo: true },
      { comportamento: led, simultaneo: true },
    ]
    const agg = calcAggregateInrush(grupo)
    expect(agg.i2t_total).toBeCloseTo(2 * led.inrush_i2t, 0)
  })

  it('duração do agregado = a mais longa entre simultâneas', () => {
    const led   = buildLoadBehavior('LED_DRIVER', 1)   // 0.5ms
    const fluor = buildLoadBehavior('FLUORESCENTE', 1) // 3ms
    const grupo = [
      { comportamento: led,   simultaneo: true },
      { comportamento: fluor, simultaneo: true },
    ]
    const agg = calcAggregateInrush(grupo)
    expect(agg.duracao_ms).toBe(fluor.inrush_duracao_ms)  // 3ms (a mais longa)
  })
})
