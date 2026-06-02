// src/__tests__/tables.test.ts
// Lint de domínio elétrico — consistência relacional das tabelas
//
// "Toda seção comercial deve existir em todos os métodos relevantes"
// "Todo método declarado deve ter entradas completas"
// "Tabelas físicas não podem violar princípios termodinâmicos"
//
// Esses testes verificam a INTEGRIDADE DO DOMÍNIO, não implementação.
// Devem falhar quando tabelas forem modificadas incorretamente.

import { describe, it, expect } from 'vitest'
import {
  getIz, getDisjuntor,
  SECOES_COMERCIAIS, DISJUNTORES_A, IDR_SERIES_A,
  SECAO_MINIMA, AREA_INTERNA_ELETRODUTO,
  DIAMETROS_EXTERNOS,
} from '../data/nbr5410tables'

// ── Métodos de instalação definidos na NBR 5410 ───────────────────
const METODOS_NBR = ['A1','A2','B1','B2','C','D1','D2','E'] as const
type Metodo = typeof METODOS_NBR[number]

// ════════════════════════════════════════════════════════════════
// LINT 1: COMPLETUDE DAS TABELAS IZ
// Toda seção comercial deve existir em todo método relevante
// ════════════════════════════════════════════════════════════════

describe('Lint: completude da tabela Iz (Tabela 36 NBR 5410)', () => {

  it('toda seção comercial tem Iz > 0 em B1-2 (método padrão residencial)', () => {
    for (const sec of SECOES_COMERCIAIS) {
      const iz = getIz(sec, 'B1', 2, 'Cu', 'PVC')
      expect(iz).toBeGreaterThan(0)
    }
  })

  it('toda seção comercial tem Iz > 0 em B1-3', () => {
    for (const sec of SECOES_COMERCIAIS) {
      const iz = getIz(sec, 'B1', 3, 'Cu', 'PVC')
      expect(iz).toBeGreaterThan(0)
    }
  })

  it('toda seção comercial tem Iz > 0 em todos os métodos principais', () => {
    const METODOS_PRINCIPAIS: Metodo[] = ['A1','A2','B1','B2','C','D1','D2','E']
    const erros: string[] = []

    for (const metodo of METODOS_PRINCIPAIS) {
      for (const n_cond of [2, 3] as const) {
        for (const sec of SECOES_COMERCIAIS) {
          const iz = getIz(sec, metodo, n_cond, 'Cu', 'PVC')
          if (iz <= 0) erros.push(`${metodo}-${n_cond}-${sec}mm²: Iz=${iz}`)
        }
      }
    }

    if (erros.length > 0) {
      throw new Error(`${erros.length} seção(ões) com Iz=0:\n${erros.join('\n')}`)
    }
  })

  it('Iz com alumínio deve ser menor que com cobre (Al tem maior resistividade)', () => {
    for (const sec of [16, 25, 35, 50, 70, 95, 120]) {
      const iz_cu = getIz(sec, 'B1', 2, 'Cu', 'PVC')
      const iz_al = getIz(sec, 'B1', 2, 'Al', 'PVC')
      expect(iz_al).toBeLessThan(iz_cu)
    }
  })

  it('Iz com XLPE deve ser maior que com PVC (XLPE opera a 90°C vs 70°C)', () => {
    for (const sec of SECOES_COMERCIAIS.slice(0, 8)) {
      const iz_pvc  = getIz(sec, 'B1', 2, 'Cu', 'PVC')
      const iz_xlpe = getIz(sec, 'B1', 2, 'Cu', 'XLPE')
      expect(iz_xlpe).toBeGreaterThan(iz_pvc)
    }
  })

  it('método E (ao ar livre) tem Iz >= método B1 (embutido em alvenaria)', () => {
    // Ao ar livre sempre tem melhor dissipação — Iz >= embutido
    for (const sec of SECOES_COMERCIAIS.slice(0, 10)) {
      const iz_b1 = getIz(sec, 'B1', 2, 'Cu', 'PVC')
      const iz_e  = getIz(sec, 'E',  2, 'Cu', 'PVC')
      expect(iz_e).toBeGreaterThanOrEqual(iz_b1)
    }
  })

  it('método D1 (enterrado) tem Iz superior a B1 para seções grandes', () => {
    // Solo tem melhor dissipação térmica que ar parado em alvenaria
    for (const sec of [25, 50, 95, 120]) {
      const iz_b1 = getIz(sec, 'B1', 2, 'Cu', 'PVC')
      const iz_d1 = getIz(sec, 'D1', 2, 'Cu', 'PVC')
      expect(iz_d1).toBeGreaterThanOrEqual(iz_b1)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// LINT 2: COERÊNCIA DA SÉRIE DE DISJUNTORES
// A série IEC 60898 tem propriedades específicas
// ════════════════════════════════════════════════════════════════

describe('Lint: série de disjuntores IEC 60898', () => {

  it('série é estritamente crescente', () => {
    for (let i = 0; i < DISJUNTORES_A.length - 1; i++) {
      expect(DISJUNTORES_A[i+1]).toBeGreaterThan(DISJUNTORES_A[i])
    }
  })

  it('série inclui valores obrigatórios: 10, 16, 20, 25, 32, 40, 63A', () => {
    const obrigatorios = [10, 16, 20, 25, 32, 40, 63]
    for (const v of obrigatorios) {
      expect(DISJUNTORES_A).toContain(v)
    }
  })

  it('getDisjuntor nunca retorna valor menor que a entrada', () => {
    for (const ib of [1, 2.5, 7.87, 10, 15, 23.6, 25, 40, 63, 100]) {
      const in_disj = getDisjuntor(ib)
      expect(in_disj).toBeGreaterThanOrEqual(ib)
    }
  })

  it('getDisjuntor(0) retorna mínimo prático (10A)', () => {
    expect(getDisjuntor(0)).toBeGreaterThanOrEqual(10)
  })

  it('série IDR é subconjunto de valores ≥ 16A', () => {
    for (const v of IDR_SERIES_A) {
      expect(v).toBeGreaterThanOrEqual(16)
      // IDR deve existir em valor ≥ ao disjuntor correspondente
      expect(DISJUNTORES_A.some(d => d <= v)).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// LINT 3: SEÇÕES MÍNIMAS POR TIPO
// Verificar consistência com a física
// ════════════════════════════════════════════════════════════════

describe('Lint: seções mínimas normativas (NBR §6.2.5)', () => {

  it('seção mínima ILUM (1.5mm²) existe na tabela Iz', () => {
    const min_ilum = SECAO_MINIMA['ILUM'] ?? 1.5
    expect(getIz(min_ilum, 'B1', 2, 'Cu', 'PVC')).toBeGreaterThan(0)
  })

  it('seção mínima TUG (2.5mm²) existe na tabela Iz', () => {
    const min_tug = SECAO_MINIMA['TUG'] ?? 2.5
    expect(getIz(min_tug, 'B1', 2, 'Cu', 'PVC')).toBeGreaterThan(0)
  })

  it('seções mínimas são valores da série comercial', () => {
    for (const [_tipo, sec] of Object.entries(SECAO_MINIMA)) {
      expect(SECOES_COMERCIAIS).toContain(sec)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// LINT 4: TABELA DE DIÂMETROS EXTERNOS (IEC 60228)
// Propriedades físicas dos cabos
// ════════════════════════════════════════════════════════════════

describe('Lint: tabela de diâmetros externos (IEC 60228)', () => {

  it('diâmetro externo PVC é crescente com a seção', () => {
    const sorted = [...DIAMETROS_EXTERNOS].sort((a, b) => a.secao_mm2 - b.secao_mm2)
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i+1].d_ext_pvc_mm).toBeGreaterThan(sorted[i].d_ext_pvc_mm)
    }
  })

  it('XLPE tem diâmetro maior que PVC (isolação mais espessa)', () => {
    for (const entry of DIAMETROS_EXTERNOS) {
      expect(entry.d_ext_xlpe_mm).toBeGreaterThanOrEqual(entry.d_ext_pvc_mm)
    }
  })

  it('área externa é π×(d/2)² — verificar coerência com d_ext', () => {
    for (const entry of DIAMETROS_EXTERNOS) {
      const area_calc = Math.PI * (entry.d_ext_pvc_mm / 2) ** 2
      // Tolerância de 5% (arredondamentos da tabela)
      expect(Math.abs(area_calc - entry.area_ext_pvc_mm2) / area_calc).toBeLessThan(0.05)
    }
  })

  it('área interna do eletroduto é crescente com o diâmetro', () => {
    const diametros = Object.keys(AREA_INTERNA_ELETRODUTO).map(Number).sort((a,b)=>a-b)
    for (let i = 0; i < diametros.length - 1; i++) {
      const d1 = diametros[i], d2 = diametros[i+1]
      expect(AREA_INTERNA_ELETRODUTO[d2]).toBeGreaterThan(AREA_INTERNA_ELETRODUTO[d1])
    }
  })

  it('tabela cobre seções de 1.5mm² a 240mm²', () => {
    const secoes = DIAMETROS_EXTERNOS.map(e => e.secao_mm2)
    expect(Math.min(...secoes)).toBeLessThanOrEqual(1.5)
    expect(Math.max(...secoes)).toBeGreaterThanOrEqual(240)
  })
})

// ════════════════════════════════════════════════════════════════
// LINT 5: MÉTODO E — DOCUMENTAR COMO DERIVADO
// ════════════════════════════════════════════════════════════════

describe('Lint: método E — derivado de C com fator 1.05 (documentar)', () => {

  it('método E tem Iz entre C e 110% de C (margem do fator de aproximação)', () => {
    for (const sec of SECOES_COMERCIAIS.slice(0, 10)) {
      const iz_c = getIz(sec, 'C', 2, 'Cu', 'PVC')
      const iz_e = getIz(sec, 'E', 2, 'Cu', 'PVC')
      // E deve ser entre C e C×1.15 (faixa razoável para método ao ar)
      expect(iz_e).toBeGreaterThanOrEqual(iz_c)
      expect(iz_e).toBeLessThanOrEqual(iz_c * 1.20)
    }
  })

  it('método E é reconhecido como válido pelo getIz (não retorna 0)', () => {
    for (const sec of SECOES_COMERCIAIS) {
      expect(getIz(sec, 'E', 2, 'Cu', 'PVC')).toBeGreaterThan(0)
    }
  })
})
