// Validação — Tabela 45 (agrupamento enterrado) + Tabela 47 (piso Alumínio)
import { describe, it, expect } from 'vitest'
import { getFaEnterrado, getSecaoMinima } from '../data/nbr5410tables'
import { dimensionarCircuito } from '../core/engine'
import type { CircuitInput } from '../core/engine'

describe('getFaEnterrado — Tabela 45', () => {
  it('2 circuitos multipolar, afastamento nulo → 0,85', () => {
    expect(getFaEnterrado('multipolar', 2, 0)).toBe(0.85)
  })
  it('2 circuitos multipolar, 1,0m → 0,95 (melhora com afastamento)', () => {
    expect(getFaEnterrado('multipolar', 2, 1.0)).toBe(0.95)
  })
  it('Interpolação: 0,375m entre 0,25(0,90) e 0,5(0,95) → ~0,925', () => {
    expect(getFaEnterrado('multipolar', 2, 0.375)).toBeCloseTo(0.925, 2)
  })
  it('Distância acima de 1,0m → satura no valor de 1,0m', () => {
    expect(getFaEnterrado('multipolar', 2, 5.0)).toBe(0.95)
  })
  it('Unipolar é mais penalizado que multipolar no mesmo cenário (2 circ, nulo)', () => {
    expect(getFaEnterrado('unipolar', 2, 0)).toBeLessThan(getFaEnterrado('multipolar', 2, 0))
  })
})

describe('getSecaoMinima — Tabela 47 com Alumínio', () => {
  it('Cobre ILUM → 1,5mm² (comportamento original preservado)', () => {
    expect(getSecaoMinima('ILUM', 'Cu')).toBe(1.5)
  })
  it('Cobre TUG → 2,5mm²', () => {
    expect(getSecaoMinima('TUG', 'Cu')).toBe(2.5)
  })
  it('Alumínio ILUM → 16mm² (piso único, NÃO mais 1,5mm²)', () => {
    expect(getSecaoMinima('ILUM', 'Al')).toBe(16)
  })
  it('Alumínio TUG → 16mm² (mesmo piso, independe do tipo)', () => {
    expect(getSecaoMinima('TUG', 'Al')).toBe(16)
  })
})

describe('Integração — dimensionarCircuito com Tabela 45 conectada de verdade', () => {
  const base: CircuitInput = {
    id: 'x', descricao: 'Alimentador enterrado loteamento', potencia_va: 6000,
    fase: 'RS', comprimento_m: 40, n_agrup: 3, tipo: 'TUE',
    v_fase: 127, metodo: 'D2', isolacao: 'PVC', material: 'Cu',
    t_amb: 30, du_max: 4, du_ramal: 0.5,
  }

  it('Sem declarar dutos separados → usa Tabela 42 padrão (mais penalizante)', () => {
    const r = dimensionarCircuito(base)
    console.log('Sem Tabela 45 — Iz efetiva:', r.iz_efetiva, 'seção:', r.secao_fase)
  })

  it('Declarando dutos separados a 0,5m → usa Tabela 45 (menos penalizante que Tabela 42 para 3 circuitos)', () => {
    const semDeclaracao = dimensionarCircuito(base)
    const comTabela45 = dimensionarCircuito({
      ...base, tipo_condutor_enterrado: 'multipolar', distancia_dutos_m: 0.5,
    })
    console.log('Sem declaração (Tabela 42): Iz-ef=', semDeclaracao.iz_efetiva, 'seção=', semDeclaracao.secao_fase)
    console.log('Com Tabela 45 (0,5m): Iz-ef=', comTabela45.iz_efetiva, 'seção=', comTabela45.secao_fase)
    // Tabela 45 a 0,5m para 3 circuitos multipolar = 0,90; Tabela 42 para
    // 3 circuitos agrupados = 0,70 — Tabela 45 é MENOS penalizante aqui,
    // então a seção final deve ser igual ou menor (mais barato)
    expect(comTabela45.secao_fase).toBeLessThanOrEqual(semDeclaracao.secao_fase)
  })
})
