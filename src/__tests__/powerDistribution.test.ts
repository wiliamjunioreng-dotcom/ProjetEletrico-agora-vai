// src/__tests__/powerDistribution.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcFatorDemanda, calcDemanda, buildPowerDistribution,
  PADROES_FORNECIMENTO,
} from '../core/powerDistribution'
import type { SistemaDeFornecimento } from '../core/powerDistribution'

const sistema_tri: SistemaDeFornecimento = {
  ...PADROES_FORNECIMENTO.TRIFASICO_220_380,
  capacidade_kva: 15,
}
const sistema_mono: SistemaDeFornecimento = {
  ...PADROES_FORNECIMENTO.MONO_127_220,
  capacidade_kva: 5,
}

const circs_tri = [
  { id:'c1', potencia_va:400,  fase:'R' as const, corrente_a:1.8, secao_mm2:1.5, comprimento_m:15 },
  { id:'c2', potencia_va:600,  fase:'S' as const, corrente_a:2.7, secao_mm2:2.5, comprimento_m:12 },
  { id:'c3', potencia_va:5500, fase:'R' as const, corrente_a:25,  secao_mm2:6.0, comprimento_m:10 },
]

describe('calcFatorDemanda — NBR 5410', () => {
  it('≤ 3 kVA: fd = 1.0', () => expect(calcFatorDemanda(2.5)).toBe(1.0))
  it('5 kVA: fd = 0.9', () => expect(calcFatorDemanda(5)).toBe(0.90))
  it('10 kVA: fd = 0.8', () => expect(calcFatorDemanda(10)).toBe(0.80))
  it('30 kVA: fd = 0.65', () => expect(calcFatorDemanda(30)).toBe(0.65))
  it('50 kVA: fd = 0.6', () => expect(calcFatorDemanda(50)).toBe(0.60))
  it('fd monotonicidade: maior carga → fd menor', () => {
    expect(calcFatorDemanda(20)).toBeLessThan(calcFatorDemanda(5))
  })
})

describe('calcDemanda — instalação trifásica', () => {
  it('demanda_maxima < carga_instalada (fator < 1)', () => {
    const d = calcDemanda(circs_tri, sistema_tri)
    expect(d.demanda_maxima_kva).toBeLessThan(d.carga_instalada_kva)
  })
  it('corrente_demanda > 0', () => {
    const d = calcDemanda(circs_tri, sistema_tri)
    expect(d.corrente_demanda_a).toBeGreaterThan(0)
  })
  it('in_geral: padrão comercial ≥ corrente_demanda × 1.25', () => {
    const d = calcDemanda(circs_tri, sistema_tri)
    expect(d.in_geral_a).toBeGreaterThanOrEqual(d.corrente_demanda_a * 1.25 - 1)
  })
  it('tipo_ligacao: descreve corretamente o sistema', () => {
    const d = calcDemanda(circs_tri, sistema_tri)
    expect(d.tipo_ligacao).toContain('trifásico')
    expect(d.tipo_ligacao).toContain('380')
  })
  it('secao_alim_min_mm2 > 0', () => {
    const d = calcDemanda(circs_tri, sistema_tri)
    expect(d.secao_alim_min_mm2).toBeGreaterThan(0)
  })
  it('desequilíbrio: R muito carregada → deseq > 0', () => {
    const d = calcDemanda(circs_tri, sistema_tri)
    // c1 + c3 = 5900VA em R, c2 = 600VA em S → desequilíbrio alto
    expect(d.desequilibrio_pct).toBeGreaterThan(0)
  })
})

describe('calcDemanda — monofásico', () => {
  const circs_mono = [
    { id:'c1', potencia_va:400, fase:'R' as const, corrente_a:3.1, secao_mm2:1.5, comprimento_m:15 },
    { id:'c2', potencia_va:600, fase:'R' as const, corrente_a:4.7, secao_mm2:2.5, comprimento_m:12 },
  ]
  it('tipo_ligacao = monofásico', () => {
    const d = calcDemanda(circs_mono, sistema_mono)
    expect(d.tipo_ligacao).toContain('monofásico')
  })
  it('corrente calculada pela tensão monofásica (127V)', () => {
    const d = calcDemanda(circs_mono, sistema_mono)
    // I = demanda_kva × 1000 / 127
    const esperado = d.demanda_maxima_kva * 1000 / 127
    expect(d.corrente_demanda_a).toBeCloseTo(esperado, 1)
  })
})

describe('buildPowerDistribution — sistema completo', () => {
  it('avisos quando demanda excede capacidade do padrão', () => {
    // capacidade = 5kVA mas carga = 6.5kVA → deve alertar
    const d = buildPowerDistribution(circs_tri, sistema_mono, 10, 6)
    const alerta = d.avisos.find(a => a.tipo === 'DEMANDA_EXCEDE_PADRAO')
    expect(alerta).toBeDefined()
    expect(alerta?.severidade).toBe('erro')
  })
  it('alimentador subdimensionado gera aviso', () => {
    // ramal 1.5mm² para instalação 6.5kVA é muito pequeno
    const d = buildPowerDistribution(circs_tri, sistema_tri, 20, 1.5)
    const alerta = d.avisos.find(a => a.tipo === 'ALIMENTADOR_SUBDIMENSIONADO')
    expect(alerta).toBeDefined()
  })
  it('quedas coordenadas: tem uma por circuito', () => {
    const d = buildPowerDistribution(circs_tri, sistema_tri, 10, 10)
    expect(d.quedas).toHaveLength(circs_tri.length)
  })
  it('SistemaDeFornecimento preservado no resultado', () => {
    const d = buildPowerDistribution(circs_tri, sistema_tri, 10, 10)
    expect(d.sistema.padrao).toBe('TRIFASICO_220_380')
    expect(d.sistema.n_fases).toBe(3)
  })
  it('PADROES_FORNECIMENTO: todos os padrões têm campos corretos', () => {
    const padroes = Object.values(PADROES_FORNECIMENTO)
    for (const p of padroes) {
      expect(p.tensao_fn_v).toBeGreaterThan(0)
      expect(p.tensao_ff_v).toBeGreaterThan(0)
      expect(p.n_fases).toBeGreaterThanOrEqual(1)
    }
  })
})
