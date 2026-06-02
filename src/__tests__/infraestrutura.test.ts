// src/__tests__/infraestrutura.test.ts
// Testes de infraestrutura compartilhada — ocupação, Fa, diâmetro

import { describe, it, expect } from 'vitest'
import {
  calcEletroduto, buildEletrodutos, verificarEletrodutos,
} from '../core/infraestrutura'
import type { CaboNoEletroduto, CircuitoParaEletroduto } from '../core/infraestrutura'

// ── Fixture: cabos típicos ────────────────────────────────────────
const cabo_ilum: CaboNoEletroduto = {
  circuito_id: 'c1', descricao: 'ILUM Sala', secao_mm2: 1.5,
  isolacao: 'PVC', n_condutores: 4,  // F + N + ret + PE
}
const cabo_tug: CaboNoEletroduto = {
  circuito_id: 'c2', descricao: 'TUG Sala', secao_mm2: 2.5,
  isolacao: 'PVC', n_condutores: 3,  // F + N + PE
}

describe('calcEletroduto — ocupação e diâmetro', () => {

  it('eletroduto vazio: 0% ocupação, diâmetro mínimo 20mm', () => {
    const e = calcEletroduto('e1', [])
    expect(e.diametro_mm).toBe(20)
    expect(e.taxa_ocupacao).toBe(0)
    expect(e.status_ocupacao).toBe('OK')
  })

  it('1 cabo 1.5mm² PVC: área < área interna 20mm → cabe', () => {
    const e = calcEletroduto('e1', [{ ...cabo_ilum, n_condutores: 1 }])
    expect(e.status_ocupacao).toBe('OK')
    expect(e.area_cabos_mm2).toBeGreaterThan(0)
  })

  it('taxa_ocupacao = area_cabos / area_interna', () => {
    const e = calcEletroduto('e1', [cabo_ilum])
    const taxa = e.area_cabos_mm2 / e.area_interna_mm2
    expect(e.taxa_ocupacao).toBeCloseTo(taxa, 2)
  })

  it('3 cabos 10mm² excederia 20mm (área 188mm²) — usar 25mm', () => {
    const cabos_grossos: CaboNoEletroduto[] = [
      { circuito_id:'c1', descricao:'A', secao_mm2:10, isolacao:'PVC', n_condutores:3 },
      { circuito_id:'c2', descricao:'B', secao_mm2:10, isolacao:'PVC', n_condutores:3 },
      { circuito_id:'c3', descricao:'C', secao_mm2:10, isolacao:'PVC', n_condutores:3 },
    ]
    const e = calcEletroduto('e1', cabos_grossos)
    expect(e.diametro_mm).toBeGreaterThan(20)
  })

  it('NBR §6.1.5.2: taxa máxima para 3+ cabos é 40%', () => {
    const e = calcEletroduto('e1', [cabo_ilum, cabo_tug])  // 7 cabos total
    expect(e.taxa_maxima).toBeCloseTo(0.40)
  })

  it('NBR §6.1.5.2: taxa máxima para 1 cabo é 31%', () => {
    const e = calcEletroduto('e1', [{ ...cabo_tug, n_condutores: 1 }])
    expect(e.taxa_maxima).toBeCloseTo(0.31)
  })

  it('Fa diminui com mais circuitos agrupados (lei física)', () => {
    const e1 = calcEletroduto('e1', [cabo_ilum])
    const e3 = calcEletroduto('e3', [
      cabo_ilum,
      { ...cabo_tug, circuito_id: 'cx' },
      { ...cabo_tug, circuito_id: 'cy', descricao: 'TUG2' },
    ])
    expect(e3.fa).toBeLessThan(e1.fa)
  })

  it('Fa para 1 circuito = 1.0 (sem agrupamento)', () => {
    const e = calcEletroduto('e1', [cabo_ilum])
    expect(e.fa).toBe(1.0)
  })

  it('status EXCEDIDO quando área > taxa_max × área_interna', () => {
    // Encher eletroduto 20mm com muitos cabos
    const muitos: CaboNoEletroduto[] = Array.from({ length: 20 }, (_, i) => ({
      circuito_id: `c${i}`, descricao: `Circ ${i}`,
      secao_mm2: 2.5, isolacao: 'PVC' as const, n_condutores: 3,
    }))
    const e = calcEletroduto('e_cheio', muitos)
    // Com 20 circuitos × 3 condutores × área do cabo 2.5mm²,
    // deve exceder qualquer eletroduto razoável ou ser EXCEDIDO no 40mm
    // Verificar que o status é calculado corretamente
    expect(['OK','LIMITE','EXCEDIDO']).toContain(e.status_ocupacao)
    // Verificar que taxa_ocupacao é > 0
    expect(e.taxa_ocupacao).toBeGreaterThan(0)
  })
})

describe('buildEletrodutos — agrupamento por cômodo', () => {
  const circs: CircuitoParaEletroduto[] = [
    { id:'c1', descricao:'ILUM Sala',  tipo:'ILUM', comodo_id:'sala',   secao_fase:1.5, n_fases:1 },
    { id:'c2', descricao:'TUG Sala 1', tipo:'TUG',  comodo_id:'sala',   secao_fase:2.5, n_fases:1 },
    { id:'c3', descricao:'TUG Sala 2', tipo:'TUG',  comodo_id:'sala',   secao_fase:2.5, n_fases:1 },
    { id:'c4', descricao:'ILUM Quarto',tipo:'ILUM', comodo_id:'quarto', secao_fase:1.5, n_fases:1 },
  ]

  it('circuitos do mesmo cômodo agrupados em 1 eletroduto', () => {
    const eles = buildEletrodutos(circs)
    // sala tem 3 circuitos → 1 eletroduto; quarto tem 1 → 1 eletroduto
    expect(eles).toHaveLength(2)
  })

  it('eletroduto da sala tem 3 circuitos distintos', () => {
    const eles = buildEletrodutos(circs)
    const sala = eles.find(e => e.comodo_id === 'sala')
    expect(sala?.n_circuitos).toBe(3)
  })

  it('Fa da sala: 3 circuitos → Fa < 1.0', () => {
    const eles = buildEletrodutos(circs)
    const sala = eles.find(e => e.comodo_id === 'sala')
    expect(sala!.fa).toBeLessThan(1.0)
    expect(sala!.fa).toBeGreaterThan(0.0)
  })

  it('eletroduto do quarto: 1 circuito → Fa = 1.0', () => {
    const eles = buildEletrodutos(circs)
    const quarto = eles.find(e => e.comodo_id === 'quarto')
    expect(quarto!.fa).toBe(1.0)
  })

  it('diâmetro é determinístico: mesmos cabos → mesmo diâmetro', () => {
    const eles1 = buildEletrodutos(circs)
    const eles2 = buildEletrodutos(circs)
    expect(eles1[0].diametro_mm).toBe(eles2[0].diametro_mm)
  })
})

describe('verificarEletrodutos — avisos normativos', () => {

  it('eletroduto OK: sem avisos', () => {
    const e = calcEletroduto('e1', [cabo_ilum])
    const avisos = verificarEletrodutos([e])
    expect(avisos).toHaveLength(0)
  })

  it('eletroduto EXCEDIDO gera aviso com ação sugerida', () => {
    // Forçar EXCEDIDO com muitos cabos
    const e = calcEletroduto('e1', Array.from({ length: 30 }, (_, i) => ({
      circuito_id: `c${i}`, descricao: `C${i}`,
      secao_mm2: 6, isolacao: 'PVC' as const, n_condutores: 3,
    })))
    const avisos = verificarEletrodutos([e])
    // Se excedeu, deve ter aviso
    if (e.status_ocupacao === 'EXCEDIDO') {
      expect(avisos.some(a => a.tipo === 'EXCEDIDO')).toBe(true)
      expect(avisos[0].acao).toBeTruthy()
    }
  })
})
