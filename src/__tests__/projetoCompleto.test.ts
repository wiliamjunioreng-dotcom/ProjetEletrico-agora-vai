// VALIDAÇÃO FINAL INTEGRADA — projeto residencial completo de ponta a ponta
import { describe, it, expect } from 'vitest'
import { calcIlumComodo, dimensionarCircuito, calcularDemanda } from '../core/engine'
import { resolverCircuito } from '../core/pipeline'
import { getFa } from '../data/nbr5410tables'
import type { CircuitInput, CircuitResult } from '../core/engine'

const CFG = { v_fase: 127, metodo: 'B1', isolacao: 'PVC' as const, material: 'Cu' as const,
              t_amb: 30, du_max: 4, du_ramal: 0.5 }

describe('PROJETO COMPLETO — Residência térrea 70m²', () => {
  it('§9.5.2.1 ILUM sala 16m² → 280VA', () => expect(calcIlumComodo(16)).toBe(280))
  it('§9.5.2.1 ILUM banheiro 4m² → 100VA', () => expect(calcIlumComodo(4)).toBe(100))

  const circuitos: { input: CircuitInput; verifica: (r: CircuitResult) => void }[] = [
    { input: { id:'c1', descricao:'ILUM Geral', potencia_va:780, fase:'R',
        comprimento_m:15, n_agrup:3, tipo:'ILUM', ...CFG } as CircuitInput,
      verifica: r => {
        expect(r.ib).toBeCloseTo(780/127, 1)
        expect(r.curva).toBe('C')
        expect(r.in_disj).toBeLessThanOrEqual(r.iz_efetiva)
      } },
    { input: { id:'c2', descricao:'TUG Cozinha e Área de Serviço', potencia_va:2100, fase:'S',
        comprimento_m:12, n_agrup:3, tipo:'TUG', ...CFG } as CircuitInput,
      verifica: r => {
        expect(r.idr).toBe(true)  // área molhada COM acento
        expect(r.in_disj).toBeLessThanOrEqual(r.iz_efetiva)
      } },
    { input: { id:'c3', descricao:'TUE Chuveiro 5500W', potencia_va:5500, fase:'RS',
        comprimento_m:10, n_agrup:1, tipo:'TUE', ...CFG } as CircuitInput,
      verifica: r => {
        expect(r.tensao_v).toBeCloseTo(220, 0)
        expect(r.ib).toBeCloseTo(25, 0)
        expect(r.secao_fase).toBeGreaterThanOrEqual(4)
        expect(r.idr).toBe(true)  // GAP CORRIGIDO: equipamento implica local molhado
      } },
    { input: { id:'c4', descricao:'TUE Ar-condicionado Quarto 1', potencia_va:1400, fase:'RT',
        comprimento_m:14, n_agrup:1, tipo:'TUE', ...CFG } as CircuitInput,
      verifica: r => {
        expect(r.tensao_v).toBeCloseTo(220, 0)
        expect(r.in_disj).toBeLessThanOrEqual(r.iz_efetiva)
      } },
  ]

  for (const { input, verifica } of circuitos) {
    it(`engine.ts: ${input.descricao}`, () => { verifica(dimensionarCircuito(input)) })
    it(`pipeline.ts: ${input.descricao} — CONSISTENTE`, () => {
      const r1 = dimensionarCircuito(input)
      const r2 = resolverCircuito({ ...input, du_max_pct: CFG.du_max, du_ramal_pct: CFG.du_ramal,
        icc_rede_ka: 5, v_linha_ref: 220 } as any)
      expect(r2.julgamento?.secao_consolidada).toBe(r1.secao_fase)
      expect(r2.protecao?.in_disj).toBe(r1.in_disj)
      expect(r2.protecao?.curva).toBe(r1.curva)
    })
  }

  it('Demanda bifásica: CI≈9,8kW → fd 0,87 → DG correto', () => {
    const calc = circuitos.map(c => dimensionarCircuito(c.input))
    const dem = calcularDemanda(calc, 127, 0.92, 'Bifasico')
    expect(dem.ci_kw).toBeCloseTo(9.78, 1)
    expect(dem.fd).toBeCloseTo(0.87, 2)
    expect(dem.in_geral).toBeGreaterThanOrEqual(dem.i_dem)
  })

  it('Tabela 42: degraus exatos', () => {
    expect(getFa(9)).toBe(0.50); expect(getFa(11)).toBe(0.50)
    expect(getFa(12)).toBe(0.45); expect(getFa(17)).toBe(0.41); expect(getFa(25)).toBe(0.38)
  })
})
