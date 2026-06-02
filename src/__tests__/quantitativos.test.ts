// src/__tests__/quantitativos.test.ts
import { describe, it, expect } from 'vitest'
import {
  conduktoresCircuito, comprimentoComVertical, caixaPorTipoPonto,
  calcQuantCircuito, calcResumoMateriais
} from '../core/quantitativos'

describe('Condutores por tipo de circuito', () => {
  it('ILUM monofásico: F + N + retorno + PE = 4 condutores', () => {
    const c = conduktoresCircuito('ILUM', 1)
    expect(c.n_condutores).toBe(4)
    expect(c.tem_retorno).toBe(true)
    expect(c.descricao).toContain('retorno')
  })

  it('ILUM com paralelo: adiciona 2 viajantes = 6 condutores', () => {
    const c = conduktoresCircuito('ILUM', 1, true)
    expect(c.n_condutores).toBe(6)
    expect(c.tem_travamento).toBe(true)
  })

  it('TUG monofásico: F + N + PE = 3 condutores', () => {
    const c = conduktoresCircuito('TUG', 1)
    expect(c.n_condutores).toBe(3)
    expect(c.tem_retorno).toBe(false)
  })

  it('TUE bifásico: F1 + F2 + PE = 3 condutores', () => {
    const c = conduktoresCircuito('TUE', 2)
    expect(c.n_condutores).toBe(3)
    expect(c.descricao).toContain('F1')
    expect(c.descricao).toContain('F2')
  })

  it('TUE trifásico: F1+F2+F3+PE = 4 condutores', () => {
    const c = conduktoresCircuito('TUE', 3)
    expect(c.n_condutores).toBe(4)
  })
})

describe('Comprimento com verticalização', () => {
  it('tomada baixa (0.30m) em pe-direito 2.80m: subida + horizontal + descida', () => {
    const seg = comprimentoComVertical(10, 1.60, 2.80, 0.30)
    // subida_qd = 2.80 - 1.60 = 1.20m
    // descida = 2.80 - 0.30 = 2.50m
    // total = 1.20 + 10 + 2.50 = 13.70m
    expect(seg.subida_qd_m).toBeCloseTo(1.20)
    expect(seg.descida_ponto_m).toBeCloseTo(2.50)
    expect(seg.total_m).toBeCloseTo(13.70)
  })

  it('interruptor (1.10m): descida menor que tomada baixa', () => {
    const seg_int  = comprimentoComVertical(10, 1.60, 2.80, 1.10)
    const seg_tug  = comprimentoComVertical(10, 1.60, 2.80, 0.30)
    expect(seg_int.descida_ponto_m).toBeLessThan(seg_tug.descida_ponto_m)
  })

  it('iluminação (teto 2.80m): descida ≈ 0', () => {
    const seg = comprimentoComVertical(10, 1.60, 2.80, 2.80)
    expect(seg.descida_ponto_m).toBeCloseTo(0)
  })
})

describe('Caixas por tipo de ponto', () => {
  it('LUMINARIA → octogonal', () => expect(caixaPorTipoPonto('LUMINARIA')).toBe('octogonal'))
  it('INTERRUPTOR_SIMPLES → 4x2', () => expect(caixaPorTipoPonto('INTERRUPTOR_SIMPLES')).toBe('4x2'))
  it('TUG_BAIXA → 4x2', () => expect(caixaPorTipoPonto('TUG_BAIXA')).toBe('4x2'))
  it('TUE → 4x4', () => expect(caixaPorTipoPonto('TUE')).toBe('4x4'))
})

describe('Quantitativo completo de circuito', () => {
  const circ_ilum = { id:'c1', descricao:'ILUM Sala', tipo:'ILUM', comprimento_m: 15, n_fases: 1 as const }
  const circ_tug  = { id:'c2', descricao:'TUG Sala',  tipo:'TUG',  comprimento_m: 12, n_fases: 1 as const }

  it('ILUM: metros_cabo = comprimento_total × 4 condutores', () => {
    const q = calcQuantCircuito(circ_ilum, { secao_fase: 1.5 })
    expect(q.metros_cabo).toBeGreaterThan(circ_ilum.comprimento_m * 4)  // inclui vertical
    expect(q.metros_cabo).toBe(q.comprimento.total_m * 4)
  })

  it('TUG: diâmetro eletroduto ≤ 2.5mm² → 20mm', () => {
    const q = calcQuantCircuito(circ_tug, { secao_fase: 2.5 })
    expect(q.diametro_eletroduto).toBe(20)
  })

  it('TUG 6mm²: diâmetro → 25mm', () => {
    const q = calcQuantCircuito(circ_tug, { secao_fase: 6 })
    expect(q.diametro_eletroduto).toBe(25)
  })

  it('metros_cabo > comprimento_declarado (verticalização aumenta o cabo)', () => {
    const q = calcQuantCircuito(circ_ilum, { secao_fase: 1.5 })
    expect(q.metros_cabo).toBeGreaterThan(circ_ilum.comprimento_m)
  })
})

describe('Resumo de materiais', () => {
  it('agrupar circuitos por seção e composição', () => {
    const q1 = calcQuantCircuito({ id:'c1', descricao:'A', tipo:'ILUM', comprimento_m:10 }, { secao_fase:1.5 })
    const q2 = calcQuantCircuito({ id:'c2', descricao:'B', tipo:'ILUM', comprimento_m:12 }, { secao_fase:1.5 })
    const resumo = calcResumoMateriais([q1, q2])
    expect(resumo.cabos).toHaveLength(1)  // mesmo secao+composicao
    expect(resumo.cabos[0].n_circuitos).toBe(2)
  })

  it('eletrodutos arredondados para cima com 10% de folga', () => {
    const q = calcQuantCircuito({ id:'c1', descricao:'A', tipo:'TUG', comprimento_m:10 }, { secao_fase:2.5 })
    const resumo = calcResumoMateriais([q])
    const raw_metros = q.metros_eletroduto
    const com_folga  = Math.ceil(raw_metros * 1.10)
    expect(resumo.eletrodutos[0].metros_total).toBe(com_folga)
  })

  it('caixas: ILUM gera octogonal, TUG gera 4x2', () => {
    const q_ilum = calcQuantCircuito({ id:'c1', descricao:'A', tipo:'ILUM', comprimento_m:10 }, {})
    const q_tug  = calcQuantCircuito({ id:'c2', descricao:'B', tipo:'TUG',  comprimento_m:10 }, {})
    const resumo = calcResumoMateriais([q_ilum, q_tug])
    const tipos  = resumo.caixas.map(c => c.tipo)
    expect(tipos).toContain('octogonal')
    expect(tipos).toContain('4x2')
  })
})
