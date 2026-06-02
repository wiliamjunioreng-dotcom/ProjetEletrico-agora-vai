// src/__tests__/eletroduto.test.ts — API correta do eletroduto.ts

import { describe, it, expect } from 'vitest'
import {
  buildGrupoEletroduto, agruparAutomatico, limiteOcupacaoPct,
} from '../core/eletroduto'
import type { CircuitoParaAgrupar } from '../core/eletroduto'
import { getAreaExterna } from '../data/nbr5410tables'

const circ_ilum: CircuitoParaAgrupar = { id:'c1', tipo:'ILUM', secao_mm2:1.5, n_condutores:4, comprimento_m:15, isolacao:'PVC' }
const circ_tug: CircuitoParaAgrupar  = { id:'c2', tipo:'TUG',  secao_mm2:2.5, n_condutores:3, comprimento_m:12, isolacao:'PVC' }

describe('Seção transversal de cabos', () => {
  it('condutor 2.5mm² PVC: área > 0', () => {
    expect(getAreaExterna(2.5, 'PVC')).toBeGreaterThan(15)
  })
  it('XLPE tem área > PVC', () => {
    expect(getAreaExterna(6, 'XLPE')).toBeGreaterThan(getAreaExterna(6, 'PVC'))
  })
  it('área aumenta com seção (monotonicidade)', () => {
    expect(getAreaExterna(4, 'PVC')).toBeGreaterThan(getAreaExterna(2.5, 'PVC'))
    expect(getAreaExterna(10, 'PVC')).toBeGreaterThan(getAreaExterna(4, 'PVC'))
  })
})

describe('buildGrupoEletroduto — 1 circuito', () => {
  it('1 circuito: Fa = 1.0', () => {
    const g = buildGrupoEletroduto('e1', 'Sala', [circ_ilum])
    expect(g.fa_real).toBe(1.0)
  })
  it('1 circuito: status OK', () => {
    const g = buildGrupoEletroduto('e1', 'Sala', [circ_ilum])
    expect(g.ocupacao.status).toBe('OK')
  })
  it('diâmetro ≥ 20mm', () => {
    const g = buildGrupoEletroduto('e1', 'Sala', [circ_ilum])
    expect(g.ocupacao.status !== 'EXCEDIDO' ? 'ok' : 'err').toBe('ok')
  })
})

describe('buildGrupoEletroduto — múltiplos circuitos', () => {
  it('3 circuitos: Fa < 1.0 (agrupamento reduz capacidade)', () => {
    const circs = [circ_ilum, circ_tug, { ...circ_tug, id:'c3', descricao:'TUG2' }]
    const g = buildGrupoEletroduto('e1', 'Sala', circs)
    expect(g.fa_real).toBeLessThan(1.0)
  })
  it('mais circuitos → Fa menor (monotonicidade)', () => {
    const g1 = buildGrupoEletroduto('e1', 'A', [circ_ilum])
    const g3 = buildGrupoEletroduto('e3', 'A', [circ_ilum, circ_tug, { ...circ_tug, id:'c3' }])
    expect(g3.fa_real).toBeLessThan(g1.fa_real)
  })
  it('taxa de ocupação > 0 com cabos', () => {
    const g = buildGrupoEletroduto('e1', 'Sala', [circ_ilum, circ_tug])
    expect(g.ocupacao.taxa_ocupacao_pct).toBeGreaterThan(0)
  })
})

describe('limiteOcupacaoPct', () => {
  it('1 circuito: limite 53% (NBR §6.1.5.2)', () => expect(limiteOcupacaoPct(1)).toBe(53))
  it('2+ circuitos: limite 40%', () => expect(limiteOcupacaoPct(2)).toBe(40))
  it('3+ cabos: limite 40%', () => {
    expect(limiteOcupacaoPct(3)).toBe(40)
    expect(limiteOcupacaoPct(10)).toBe(40)
  })
})

describe('agruparAutomatico', () => {
  it('≤ 6 circuitos: agrupados em 1 grupo', () => {
    const circs = [circ_ilum, circ_tug, { ...circ_tug, id:'c3', isolacao:'PVC' as const }]
    const grupos = agruparAutomatico(circs, 6)
    expect(grupos).toHaveLength(1)
  })
  it('7 circuitos com max=6: divididos em 2 grupos', () => {
    const circs = Array.from({ length: 7 }, (_, i) => ({ ...circ_tug, id: `c${i}` }))
    const grupos = agruparAutomatico(circs, 6)
    expect(grupos).toHaveLength(2)
  })
})
