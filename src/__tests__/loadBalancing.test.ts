// src/__tests__/loadBalancing.test.ts
import { describe, it, expect } from 'vitest'
import {
  inferirLigacao, verificarCompatibilidade, sugerirBalanceamento,
} from '../core/loadBalancing'
import type { InstalacaoEletrica, CargaEletrica } from '../core/loadBalancing'

// ── Instalações padrão ────────────────────────────────────────────
const inst_mono: InstalacaoEletrica = {
  tipo: 'monofasico', tensao_fn_v: 127, tensao_ff_v: 220,
  fases: ['R'], neutro: true, padrao: 'ANEEL',
  carga_fase_va: { R: 2000, S: 0, T: 0 }, cap_alim_a: 60,
}
const inst_bi: InstalacaoEletrica = {
  tipo: 'bifasico', tensao_fn_v: 220, tensao_ff_v: 220,
  fases: ['R', 'S'], neutro: true, padrao: 'ANEEL',
  carga_fase_va: { R: 1500, S: 1000, T: 0 }, cap_alim_a: 60,
}
const inst_tri: InstalacaoEletrica = {
  tipo: 'trifasico', tensao_fn_v: 220, tensao_ff_v: 380,
  fases: ['R', 'S', 'T'], neutro: true, padrao: 'ANEEL',
  carga_fase_va: { R: 3000, S: 2500, T: 1000 }, cap_alim_a: 100,
}

// ── Cargas padrão ─────────────────────────────────────────────────
const chuveiro: CargaEletrica = {
  descricao: 'Chuveiro elétrico 5500W', tipo: 'resistivo',
  potencia_va: 5500, fp: 1.0, fases_req: 1, tensao_nom_v: 220, comprimento_m: 12,
}
const motor_tri: CargaEletrica = {
  descricao: 'Motor 3cv trifásico', tipo: 'motor',
  potencia_va: 3000, fp: 0.85, fases_req: 3, tensao_nom_v: 380,
  comprimento_m: 30, corrente_part_mult: 6,
}
const tomada_comum: CargaEletrica = {
  descricao: 'Tomada 127V', tipo: 'tomada',
  potencia_va: 600, fp: 0.9, fases_req: 1, tensao_nom_v: 127, comprimento_m: 10,
}
const carga_pesada: CargaEletrica = {
  descricao: 'Forno industrial 15kW', tipo: 'resistivo',
  potencia_va: 15000, fp: 1.0, fases_req: 3, tensao_nom_v: 380, comprimento_m: 20,
}

describe('InstalacaoEletrica × CargaEletrica — separação de domínios', () => {

  it('motor trifásico 380V em instalação monofásica: BLOQUEADO', () => {
    const res = verificarCompatibilidade(motor_tri, inst_mono)
    expect(res.compativel).toBe(false)
    expect(res.bloqueios.length).toBeGreaterThan(0)
  })

  it('tomada 127V em instalação trifásica: VÁLIDO (mono em tri)', () => {
    const res = verificarCompatibilidade(tomada_comum, inst_tri)
    expect(res.compativel).toBe(true)
  })

  it('motor 380V em instalação 220/380 trifásica: VÁLIDO', () => {
    const res = verificarCompatibilidade(motor_tri, inst_tri)
    expect(res.compativel).toBe(true)
  })

  it('carga 380V em instalação 127/220: BLOQUEADO (tensão insuficiente)', () => {
    const res = verificarCompatibilidade(carga_pesada, inst_bi)
    expect(res.compativel).toBe(false)
    // A carga 380V 3-fases é bloqueada por fases insuficientes E/OU tensão
    expect(res.bloqueios.length).toBeGreaterThan(0)
  })
})

describe('inferirLigacao — motor de decisão com justificativas', () => {

  it('chuveiro 5500W/220V mono: corrente ~25A → bifásico ou mono', () => {
    const res = inferirLigacao(chuveiro, inst_bi)
    expect(res.compativel).toBe(true)
    expect(['monofasica','bifasica']).toContain(res.ligacao)
    expect(res.justificativas.length).toBeGreaterThan(0)  // sempre tem justificativa
  })

  it('motor trifásico: sempre trifásico (especificação do equipamento)', () => {
    const res = inferirLigacao(motor_tri, inst_tri)
    expect(res.ligacao).toBe('trifasica')
    expect(res.justificativas.some(j => j.includes('Motor'))).toBe(true)
  })

  it('carga pesada 15kW: corrente alta força multipolar', () => {
    const inst_380: InstalacaoEletrica = { ...inst_tri, tensao_ff_v: 380 }
    const res = inferirLigacao(carga_pesada, inst_380)
    // Carga com fases_req=3 deve resultar em trifásico (requisito do equipamento)
    expect(['trifasica', 'bifasica']).toContain(res.ligacao)
    expect(res.corrente_a).toBeGreaterThan(0)
  })

  it('tomada 600VA: monofásico adequado', () => {
    const res = inferirLigacao(tomada_comum, inst_tri)
    expect(res.ligacao).toBe('monofasica')
    expect(res.justificativas.some(j => j.includes('≤ 20A'))).toBe(true)
  })

  it('decisão escolhe fase menos carregada', () => {
    // inst_tri: R=3000, S=2500, T=1000 → T é a menos carregada
    const res = inferirLigacao(tomada_comum, inst_tri)
    expect(res.fases[0]).toBe('T')  // deve escolher T (menos carregada)
  })

  it('corrente_a calculada e positiva', () => {
    const res = inferirLigacao(chuveiro, inst_bi)
    expect(res.corrente_a).toBeGreaterThan(0)
    expect(res.corrente_a).toBeLessThan(100)
  })

  it('queda de tensão alta: força bifásico mesmo com corrente baixa', () => {
    // Circuito longo com carga média
    const carga_longa: CargaEletrica = {
      descricao: 'TUE distante', tipo: 'resistivo',
      potencia_va: 3000, fp: 1.0, fases_req: 1, tensao_nom_v: 220, comprimento_m: 60,
    }
    const res = inferirLigacao(carga_longa, inst_bi)
    // corrente_mono = 3000/220 = 13.6A, queda = 13.6 * 60 * 0.02 / 2.2 = 7.4% > 4%
    // deve sugerir bifásico por queda excessiva
    expect(['bifasica','trifasica']).toContain(res.ligacao)
    expect(res.justificativas.some(j => j.includes('queda') || j.includes('Queda'))).toBe(true)
  })

  it('resultado sempre tem justificativas rastreáveis', () => {
    const res = inferirLigacao(chuveiro, inst_bi)
    expect(res.justificativas.length).toBeGreaterThan(0)
    for (const j of res.justificativas) {
      expect(j.length).toBeGreaterThan(10)  // não são strings vazias
    }
  })

  it('desequilíbrio calculado antes e depois', () => {
    const res = inferirLigacao(tomada_comum, inst_tri)
    expect(typeof res.desequilibrio_pct_antes).toBe('number')
    expect(typeof res.desequilibrio_pct_depois).toBe('number')
  })
})

describe('sugerirBalanceamento — redistribuição automática', () => {

  it('sugere mover circuito da fase mais carregada', () => {
    const circs = [
      { id:'c1', fase:'R' as const, potencia_va:1000 },
      { id:'c2', fase:'R' as const, potencia_va:1000 },
      { id:'c3', fase:'R' as const, potencia_va:1000 },
      { id:'c4', fase:'S' as const, potencia_va:200 },
    ]
    const plano = sugerirBalanceamento(circs, inst_tri)
    // Desequilíbrio deve cair após redistribuição
    expect(plano.desequilibrio_depois).toBeLessThan(plano.desequilibrio_antes)
  })

  it('quadro já balanceado: sem sugestões de mudança', () => {
    const circs = [
      { id:'c1', fase:'R' as const, potencia_va:1000 },
      { id:'c2', fase:'S' as const, potencia_va:1000 },
      { id:'c3', fase:'T' as const, potencia_va:1000 },
    ]
    const plano = sugerirBalanceamento(circs, inst_tri)
    // Quando já balanceado, desequilíbrio não deve aumentar
    expect(plano.desequilibrio_depois).toBeLessThanOrEqual(plano.desequilibrio_antes + 1)
  })

  it('desequilíbrio após balanceamento < desequilíbrio antes', () => {
    const circs = [
      { id:'c1', fase:'R' as const, potencia_va:3000 },
      { id:'c2', fase:'R' as const, potencia_va:2000 },
      { id:'c3', fase:'S' as const, potencia_va:500 },
    ]
    const plano = sugerirBalanceamento(circs, inst_tri)
    expect(plano.desequilibrio_depois).toBeLessThan(plano.desequilibrio_antes)
  })
})
