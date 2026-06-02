// src/__tests__/properties.test.ts
// Testes baseados em PROPRIEDADES — não em casos específicos
//
// Em vez de: "para esta entrada, este resultado"
// Testa:     "para qualquer entrada válida, esta lei deve valer"
//
// Isso detecta bugs que testes de caso nunca encontram:
//   - monotonicidade violada
//   - invariantes físicos quebrados
//   - oscilação / não convergência
//   - falha não elegante em inputs extremos
//
// Referência: Property-Based Testing (QuickCheck, fast-check)

import { describe, it, expect } from 'vitest'
import { resolverCircuito } from '../core/pipeline'
import type { EntradaCircuito } from '../core/pipeline'
import { getFt, getFa, getIz, getDisjuntor } from '../data/nbr5410tables'

// ── Gerador de entradas válidas ───────────────────────────────────
const FASES  = ['R','S','T','RS','ST','RT','RST'] as const
const TIPOS  = ['ILUM','TUG','TUE'] as const
const METODOS = ['B1','B2','C','E'] as const

function entradaAleatoria(seed: number): EntradaCircuito {
  // Determinístico por seed — reproduzível
  const s = (n: number) => ((seed * 1664525 + n * 1013904223) & 0x7fffffff)
  const pick = <T>(arr: readonly T[], n: number): T => arr[s(n) % arr.length]
  const range = (min: number, max: number, n: number) =>
    min + (s(n) % (max - min + 1))

  const fase  = pick(FASES,  0)
  const tipo  = pick(TIPOS,  1)
  const v_fase = 127
  return {
    id:            `seed-${seed}`,
    descricao:     `Circuito seed ${seed}`,
    tipo,
    fase,
    potencia_va:   range(100, 8000, 2),
    potencia_real_w: undefined,
    comprimento_m: range(3, 80, 3),
    n_agrup:       range(1, 9, 4),
    v_fase,
    metodo:        pick(METODOS, 5) as any,
    isolacao:      'PVC',
    material:      'Cu',
    t_amb:         range(10, 55, 6) as number,
    du_max_pct:    4.0,
    du_ramal_pct:  0.5,
    icc_rede_ka:   3,
  }
}

// ════════════════════════════════════════════════════════════════
// PROPRIEDADE 1: MONOTONICIDADE DAS TABELAS
// Propriedades físicas das tabelas — não dependem do pipeline
// ════════════════════════════════════════════════════════════════

describe('Propriedade: monotonicidade das tabelas físicas', () => {

  const SECOES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240]
  const TEMPS  = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]

  it('[Iz] seção maior → Iz maior ou igual (B1, 2 cond, Cu, PVC)', () => {
    // Para todo S2 > S1: Iz(S2) >= Iz(S1)
    for (let i = 0; i < SECOES.length - 1; i++) {
      const iz1 = getIz(SECOES[i],   'B1', 2, 'Cu', 'PVC')
      const iz2 = getIz(SECOES[i+1], 'B1', 2, 'Cu', 'PVC')
      expect(iz2).toBeGreaterThanOrEqual(iz1)
    }
  })

  it('[Iz] seção maior → Iz maior ou igual (B1, 3 cond, Cu, PVC)', () => {
    for (let i = 0; i < SECOES.length - 1; i++) {
      const iz1 = getIz(SECOES[i],   'B1', 3, 'Cu', 'PVC')
      const iz2 = getIz(SECOES[i+1], 'B1', 3, 'Cu', 'PVC')
      expect(iz2).toBeGreaterThanOrEqual(iz1)
    }
  })

  it('[Ft] temperatura maior → fator menor (PVC degrada com calor)', () => {
    // Para todo T2 > T1: Ft(T2) <= Ft(T1)
    for (let i = 0; i < TEMPS.length - 1; i++) {
      const ft1 = getFt(TEMPS[i],   'PVC')
      const ft2 = getFt(TEMPS[i+1], 'PVC')
      expect(ft2).toBeLessThanOrEqual(ft1 + 0.001)
    }
  })

  it('[Ft] temperatura de referência (30°C) → Ft = 1,000', () => {
    expect(getFt(30, 'PVC')).toBe(1.0)
    expect(getFt(30, 'XLPE')).toBe(1.0)
  })

  it('[Fa] mais circuitos → fator menor (mais agrupamento = mais calor)', () => {
    const agrupamentos = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (let i = 0; i < agrupamentos.length - 1; i++) {
      const fa1 = getFa(agrupamentos[i])
      const fa2 = getFa(agrupamentos[i+1])
      expect(fa2).toBeLessThanOrEqual(fa1  + 0.001)
    }
  })

  it('[Fa] 1 circuito → Fa = 1,000 (sem derating)', () => {
    expect(getFa(1)).toBe(1.0)
  })

  it('[Fa] valores sempre positivos (nunca zero ou negativo)', () => {
    for (let n = 1; n <= 20; n++) {
      expect(getFa(n)).toBeGreaterThan(0)
    }
  })

  it('[Disj] série crescente — cada valor é maior que o anterior', () => {
    const SERIE = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250]
    for (let i = 0; i < SERIE.length - 1; i++) {
      expect(SERIE[i+1]).toBeGreaterThan(SERIE[i])
    }
  })

  it('[Disj] resultado sempre ≥ Ib (tripartida garantida pela seleção)', () => {
    const ibs = [1, 2.5, 5, 7.87, 10, 15, 23.6, 25, 32, 40, 63, 80, 100]
    for (const ib of ibs) {
      const in_disj = getDisjuntor(ib)
      expect(in_disj).toBeGreaterThanOrEqual(ib)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// PROPRIEDADE 2: INVARIANTES DO PIPELINE
// O pipeline nunca pode violar estes invariantes físicos
// ════════════════════════════════════════════════════════════════

describe('Propriedade: invariantes físicos do pipeline', () => {

  // Testar 50 entradas aleatórias determinísticas
  const N_SEEDS = 50

  it('[Tripartida] In_disj >= Ib para toda entrada válida', () => {
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const e = entradaAleatoria(seed)
      if (e.potencia_va <= 0) continue
      const r = resolverCircuito(e)
      expect(r.protecao.in_disj).toBeGreaterThanOrEqual(r.corrente.ib)
    }
  })

  it('[Iz física] Iz efetiva >= Ib para toda entrada (cabo suporta a corrente)', () => {
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const e = entradaAleatoria(seed)
      if (e.potencia_va <= 0) continue
      const r = resolverCircuito(e)
      // Iz' = Iz × Ft × Fa — deve ser ≥ Ib (pipeline garante seção suficiente)
      expect(r.secao.iz_efetiva).toBeGreaterThanOrEqual(r.corrente.ib - 0.1)
    }
  })

  it('[Corrente positiva] Ib >= 0 para toda entrada', () => {
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const r = resolverCircuito(entradaAleatoria(seed))
      expect(r.corrente.ib).toBeGreaterThanOrEqual(0)
    }
  })

  it('[Seção positiva] secao_final > 0 para circuito com carga', () => {
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const e = entradaAleatoria(seed)
      if (e.potencia_va <= 0) continue
      const r = resolverCircuito(e)
      expect(r.secao.secao_final).toBeGreaterThan(0)
    }
  })

  it('[Monotonicidade seção] secao_queda >= secao_iz (dU nunca reduz seção)', () => {
    // A convergência de dU só pode aumentar a seção, nunca diminuir
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const e = entradaAleatoria(seed)
      if (e.potencia_va <= 0 || e.comprimento_m <= 0) continue
      const r = resolverCircuito(e)
      expect(r.queda.secao_final).toBeGreaterThanOrEqual(r.secao.secao_final)
    }
  })

  it('[Convergência] pipeline sempre converge (nunca retorna convergiu=false)', () => {
    // Com as seções comerciais disponíveis (até 240mm²), sempre deve convergir
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const e = entradaAleatoria(seed)
      if (e.potencia_va <= 0 || e.comprimento_m <= 0) continue
      const r = resolverCircuito(e)
      expect(r.queda.convergiu).toBe(true)
    }
  })

  it('[Determinismo] 5 execuções com mesma seed → resultado idêntico', () => {
    for (let seed = 0; seed < 10; seed++) {
      const e = entradaAleatoria(seed)
      const ref = resolverCircuito(e)
      for (let i = 0; i < 4; i++) {
        const r = resolverCircuito(e)
        expect(r.corrente.ib).toBe(ref.corrente.ib)
        expect(r.secao.secao_final).toBe(ref.secao.secao_final)
        expect(r.queda.du_pct).toBe(ref.queda.du_pct)
        expect(r.protecao.in_disj).toBe(ref.protecao.in_disj)
      }
    }
  })
})

// ════════════════════════════════════════════════════════════════
// PROPRIEDADE 3: MONOTONICIDADE DO PIPELINE
// Aumentar um parâmetro nunca piora o resultado correspondente
// ════════════════════════════════════════════════════════════════

describe('Propriedade: monotonicidade do pipeline', () => {

  const BASE: EntradaCircuito = {
    id: 'mono', descricao: 'TUG Sala', tipo: 'TUG', fase: 'R',
    potencia_va: 1500, comprimento_m: 20, n_agrup: 1,
    v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
    t_amb: 30, du_max_pct: 4.0, du_ramal_pct: 0.5, icc_rede_ka: 3,
  }

  it('[Potência] potência maior → Ib maior (lei de Ohm)', () => {
    const r1 = resolverCircuito({ ...BASE, potencia_va: 1000 })
    const r2 = resolverCircuito({ ...BASE, potencia_va: 2000 })
    expect(r2.corrente.ib).toBeGreaterThan(r1.corrente.ib)
  })

  it('[Potência] potência maior → In_disj maior ou igual', () => {
    const r1 = resolverCircuito({ ...BASE, potencia_va: 500 })
    const r2 = resolverCircuito({ ...BASE, potencia_va: 3000 })
    expect(r2.protecao.in_disj).toBeGreaterThanOrEqual(r1.protecao.in_disj)
  })

  it('[Comprimento] comprimento maior → dU maior ou igual', () => {
    const r1 = resolverCircuito({ ...BASE, comprimento_m: 10 })
    const r2 = resolverCircuito({ ...BASE, comprimento_m: 40 })
    // dU proporcional ao comprimento — com mesma seção, r2 > r1
    // (pode ter mesma seção se seção não cresceu)
    expect(r2.queda.du_pct).toBeGreaterThanOrEqual(r1.queda.du_pct)
  })

  it('[Comprimento] comprimento maior → seção maior ou igual (convergência dU)', () => {
    const r1 = resolverCircuito({ ...BASE, comprimento_m: 5 })
    const r2 = resolverCircuito({ ...BASE, comprimento_m: 60 })
    expect(r2.queda.secao_final).toBeGreaterThanOrEqual(r1.queda.secao_final)
  })

  it('[Temperatura] temperatura maior → Ft menor (PVC degrada)', () => {
    const r1 = resolverCircuito({ ...BASE, t_amb: 25 })
    const r2 = resolverCircuito({ ...BASE, t_amb: 45 })
    expect(r2.fatores.ft).toBeLessThanOrEqual(r1.fatores.ft)
  })

  it('[Temperatura] temperatura maior → seção maior ou igual (mais derating)', () => {
    const r1 = resolverCircuito({ ...BASE, t_amb: 25 })
    const r2 = resolverCircuito({ ...BASE, t_amb: 50 })
    // Mais temperatura → Ft menor → Irc maior → seção maior ou igual
    expect(r2.secao.secao_final).toBeGreaterThanOrEqual(r1.secao.secao_final)
  })

  it('[Agrupamento] mais circuitos → Fa menor (mais calor compartilhado)', () => {
    const r1 = resolverCircuito({ ...BASE, n_agrup: 1 })
    const r2 = resolverCircuito({ ...BASE, n_agrup: 5 })
    expect(r2.fatores.fa).toBeLessThanOrEqual(r1.fatores.fa)
  })

  it('[Agrupamento] mais circuitos → seção maior ou igual (pior Fa → maior Irc)', () => {
    const r1 = resolverCircuito({ ...BASE, n_agrup: 1 })
    const r2 = resolverCircuito({ ...BASE, n_agrup: 9 })
    expect(r2.secao.secao_final).toBeGreaterThanOrEqual(r1.secao.secao_final)
  })

  it('[Icc rede] Icc maior → Icc_max maior (menos impedância da rede)', () => {
    const r1 = resolverCircuito({ ...BASE, icc_rede_ka: 1 })
    const r2 = resolverCircuito({ ...BASE, icc_rede_ka: 10 })
    if (r1.curto && r2.curto) {
      expect(r2.curto.icc_max_ka).toBeGreaterThan(r1.curto.icc_max_ka)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// PROPRIEDADE 4: FALHA ELEGANTE
// Inputs extremos ou inválidos não devem causar crash
// O solver deve retornar estado válido (mesmo que SEM_DADOS)
// ════════════════════════════════════════════════════════════════

describe('Propriedade: falha elegante em inputs extremos', () => {

  const BASE: EntradaCircuito = {
    id: 'edge', descricao: 'Edge case', tipo: 'TUG', fase: 'R',
    potencia_va: 1000, comprimento_m: 20, n_agrup: 1,
    v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
    t_amb: 30, du_max_pct: 4.0, du_ramal_pct: 0.5, icc_rede_ka: 3,
  }

  it('potência zero → SEM_DADOS, sem crash', () => {
    const r = resolverCircuito({ ...BASE, potencia_va: 0 })
    expect(r.julgamento.status).toBe('SEM_DADOS')
    expect(r.corrente.ib).toBe(0)
    // Sem exceção lançada
  })

  it('comprimento zero → convergiu, sem crash', () => {
    const r = resolverCircuito({ ...BASE, comprimento_m: 0 })
    expect(r.queda.convergiu).toBe(true)
    expect(r.queda.du_pct).toBe(0)
  })

  it('n_agrup extremo (100) → Fa mínimo, sem crash', () => {
    const r = resolverCircuito({ ...BASE, n_agrup: 100 })
    expect(r.fatores.fa).toBeGreaterThan(0)
    expect(r.fatores.fa).toBeLessThanOrEqual(1)
  })

  it('temperatura extrema (60°C) → Ft mínimo, sem crash', () => {
    const r = resolverCircuito({ ...BASE, t_amb: 60 })
    expect(r.fatores.ft).toBeGreaterThan(0)
    expect(r.fatores.ft).toBeLessThanOrEqual(1)
    expect(r.secao.secao_final).toBeGreaterThan(0)
  })

  it('comprimento muito longo (500m) → seção máxima, convergência', () => {
    // Com 500m pode não convergir para dU ≤ 3.5%, mas não deve crashar
    const r = resolverCircuito({ ...BASE, comprimento_m: 500, potencia_va: 500 })
    // Seja convergiu ou não, o resultado deve ser estruturalmente válido
    expect(r.secao.secao_final).toBeGreaterThan(0)
    expect(r.corrente.ib).toBeGreaterThan(0)
    expect(r.protecao.in_disj).toBeGreaterThan(0)
    // Se não convergiu, a seção está no máximo (240mm²)
    if (!r.queda.convergiu) {
      expect(r.queda.secao_final).toBe(240)
    }
  })

  it('icc_rede_ka = 0 → curto retorna null, sem crash', () => {
    const r = resolverCircuito({ ...BASE, icc_rede_ka: 0 })
    expect(r.curto).toBeNull()
  })

  it('potência altíssima (100kVA) → solver não trava', () => {
    const r = resolverCircuito({ ...BASE, potencia_va: 100000 })
    expect(r.corrente.ib).toBeGreaterThan(0)
    expect(r.secao.secao_final).toBeGreaterThan(0)
  })

  it('trace sempre presente mesmo em edge cases', () => {
    const casos = [
      { ...BASE, potencia_va: 0 },
      { ...BASE, comprimento_m: 0 },
      { ...BASE, n_agrup: 100 },
      { ...BASE, t_amb: 60 },
    ]
    for (const c of casos) {
      const r = resolverCircuito(c)
      expect(r.trace).toBeDefined()
      expect(r.trace.estagios).toHaveLength(8)
      expect(r.trace.timestamp).toBeTruthy()
    }
  })
})

// ════════════════════════════════════════════════════════════════
// PROPRIEDADE 5: CONSERVAÇÃO FÍSICA
// Leis que nunca podem ser violadas, independente da entrada
// ════════════════════════════════════════════════════════════════

describe('Propriedade: conservação física (leis imutáveis)', () => {

  it('[Energia] Ib proporcional à potência (mesma tensão)', () => {
    // Para V constante: Ib1/Ib2 = VA1/VA2
    const BASE: EntradaCircuito = {
      id: 'cons', descricao: 'TUG', tipo: 'TUG', fase: 'R',
      potencia_va: 1000, comprimento_m: 10, n_agrup: 1,
      v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
      t_amb: 30, du_max_pct: 7, du_ramal_pct: 0, icc_rede_ka: 3,
    }
    const r1 = resolverCircuito({ ...BASE, potencia_va: 1000 })
    const r2 = resolverCircuito({ ...BASE, potencia_va: 2000 })
    // Ib2 deve ser exatamente o dobro de Ib1
    expect(r2.corrente.ib).toBeCloseTo(r1.corrente.ib * 2, 1)
  })

  it('[Irc] Irc = Ib / (Ft × Fa) — identidade física', () => {
    const BASE: EntradaCircuito = {
      id: 'irc', descricao: 'TUG', tipo: 'TUG', fase: 'R',
      potencia_va: 1500, comprimento_m: 10, n_agrup: 3,
      v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
      t_amb: 40, du_max_pct: 7, du_ramal_pct: 0, icc_rede_ka: 3,
    }
    const r = resolverCircuito(BASE)
    const irc_calculado = r.corrente.ib / (r.fatores.ft * r.fatores.fa)
    expect(r.fatores.irc).toBeCloseTo(irc_calculado, 1)
  })

  it('[Tensão bifásica] V_linha = V_fase × √3 (lei dos sistemas trifásicos)', () => {
    const V_FASE = 127
    const casos = [
      { fase: 'RS', v_esperado: 220 },
      { fase: 'ST', v_esperado: 220 },
      { fase: 'RT', v_esperado: 220 },
    ]

    for (const { fase, v_esperado } of casos) {
      const e: EntradaCircuito = {
        id: 'v', descricao: 'Bifásico', tipo: 'TUE', fase,
        potencia_va: 5000, comprimento_m: 15, n_agrup: 1,
        v_fase: V_FASE, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
        t_amb: 30, du_max_pct: 7, du_ramal_pct: 0, icc_rede_ka: 3,
      }
      const r = resolverCircuito(e)
      expect(r.tensao.tensao_v).toBe(v_esperado)
    }
  })

  it('[Icc] resistência maior → Icc menor (lei de Ohm aplicada ao curto)', () => {
    // Cabo mais longo = mais resistência = Icc_min menor
    const BASE: EntradaCircuito = {
      id: 'icc', descricao: 'TUG', tipo: 'TUG', fase: 'R',
      potencia_va: 1000, comprimento_m: 10, n_agrup: 1,
      v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
      t_amb: 30, du_max_pct: 7, du_ramal_pct: 0, icc_rede_ka: 5,
    }
    const r_curto  = resolverCircuito({ ...BASE, comprimento_m: 5 })
    const r_longo  = resolverCircuito({ ...BASE, comprimento_m: 50 })

    if (r_curto.curto && r_longo.curto) {
      expect(r_longo.curto.icc_min_ka).toBeLessThan(r_curto.curto.icc_min_ka)
      expect(r_longo.curto.z_cabo_mohm).toBeGreaterThan(r_curto.curto.z_cabo_mohm)
    }
  })
})
