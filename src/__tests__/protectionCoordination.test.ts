// src/__tests__/protectionCoordination.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcIccPonto, verificarIcu, verificarSeletividade, buildCoordinacao,
} from '../core/protectionCoordination'
import type { DispositivoProtecao, PontoCurto } from '../core/protectionCoordination'

// ── Dispositivos de teste ─────────────────────────────────────────
const dg: DispositivoProtecao = {
  id:'DG', tipo:'DISJUNTOR', corrente_in:63, curva:'C', icu_ka:10, polo:1,
  jusante_ids:['D1','D2','D3'],
}
const d1: DispositivoProtecao = {
  id:'D1', tipo:'DISJUNTOR', corrente_in:16, curva:'C', icu_ka:6, polo:1,
  montante_id:'DG', jusante_ids:[], circuito_id:'c1',
}
const d2: DispositivoProtecao = {
  id:'D2', tipo:'DISJUNTOR', corrente_in:32, curva:'C', icu_ka:6, polo:1,
  montante_id:'DG', jusante_ids:[], circuito_id:'c2',
}
const d3_fraco: DispositivoProtecao = {
  id:'D3', tipo:'DISJUNTOR', corrente_in:16, curva:'B', icu_ka:3, polo:1,
  montante_id:'DG', jusante_ids:[], circuito_id:'c3',
}

// ── Pontos de curto ───────────────────────────────────────────────
const ponto_barra: PontoCurto   = { id:'barra', descricao:'Barra QD', icc_max_ka:8,   icc_min_ka:4,   tensao_v:220 }
const ponto_c1:    PontoCurto   = { id:'c1',    descricao:'Final C1', icc_max_ka:2.5, icc_min_ka:1.2, tensao_v:220 }
const ponto_c3:    PontoCurto   = { id:'c3',    descricao:'Final C3', icc_max_ka:4.0, icc_min_ka:2.0, tensao_v:220 }

describe('calcIccPonto — propagação de corrente de curto', () => {

  it('Icc diminui ao longo do cabo (impedância aumenta)', () => {
    const { icc_max_ka } = calcIccPonto(5, 220, 2.5, 20)
    expect(icc_max_ka).toBeLessThan(5)
  })

  it('cabo mais comprido → Icc menor', () => {
    const curto = calcIccPonto(5, 220, 2.5, 10)
    const longo = calcIccPonto(5, 220, 2.5, 50)
    expect(longo.icc_max_ka).toBeLessThan(curto.icc_max_ka)
  })

  it('cabo mais grosso → Icc maior (menor impedância)', () => {
    const fino   = calcIccPonto(5, 220, 1.5, 20)
    const grosso = calcIccPonto(5, 220, 10,  20)
    expect(grosso.icc_max_ka).toBeGreaterThan(fino.icc_max_ka)
  })

  it('Icc_min < Icc_max (pior caso térmico)', () => {
    const { icc_max_ka, icc_min_ka } = calcIccPonto(5, 220, 2.5, 20)
    expect(icc_min_ka).toBeLessThan(icc_max_ka)
  })

  it('Icc_max e Icc_min são positivos', () => {
    const r = calcIccPonto(3, 220, 2.5, 15)
    expect(r.icc_max_ka).toBeGreaterThan(0)
    expect(r.icc_min_ka).toBeGreaterThan(0)
  })
})

describe('verificarIcu — capacidade de interrupção', () => {

  it('DG 10kA: adequado para barra com Icc 8kA', () => {
    const v = verificarIcu(dg, ponto_barra)
    expect(v.adequado).toBe(true)
    expect(v.margem_ka).toBeGreaterThan(0)
  })

  it('D3 3kA: INADEQUADO para ponto com Icc 4kA', () => {
    const v = verificarIcu(d3_fraco, ponto_c3)
    expect(v.adequado).toBe(false)
    expect(v.recomendacao).toBeDefined()
    expect(v.recomendacao).toContain('Icu')
  })

  it('margem = Icu - Icc_ponto', () => {
    const v = verificarIcu(dg, ponto_barra)
    expect(v.margem_ka).toBeCloseTo(dg.icu_ka - ponto_barra.icc_max_ka, 1)
  })

  it('margem negativa quando inadequado', () => {
    const v = verificarIcu(d3_fraco, ponto_c3)
    expect(v.margem_ka).toBeLessThan(0)
  })
})

describe('verificarSeletividade — coordenação entre dispositivos', () => {

  it('DG 63A / D1 16A: ratio 3.9 → seletivo', () => {
    const v = verificarSeletividade(dg, d1)
    expect(v.seletivo).toBe(true)
  })

  it('DG 63A / D2 32A: ratio 1.97 → seletivo (≥ 1.6)', () => {
    const v = verificarSeletividade(dg, d2)
    expect(v.seletivo).toBe(true)
  })

  it('D1 16A / D2 32A (montante menor): NÃO seletivo', () => {
    const d1_como_mont: DispositivoProtecao = { ...d1, jusante_ids:['D2'] }
    const v = verificarSeletividade(d1_como_mont, d2)
    expect(v.seletivo).toBe(false)
  })

  it('seletividade total tem justificativa descritiva', () => {
    const v = verificarSeletividade(dg, d1)
    expect(v.justificativa.length).toBeGreaterThan(10)
  })

  it('sem seletividade: tipo = SEM_SELETIVIDADE', () => {
    const v = verificarSeletividade(d1, d2)  // In jusante > montante
    expect(v.tipo).toBe('SEM_SELETIVIDADE')
  })
})

describe('buildCoordinacao — análise completa', () => {

  const pontos = new Map<string, PontoCurto>([
    ['DG', ponto_barra],
    ['D1', ponto_c1],
    ['D2', { ...ponto_barra, id:'D2', icc_max_ka:3 }],
    ['D3', ponto_c3],
  ])

  it('verifica Icu de cada dispositivo', () => {
    const coord = buildCoordinacao([dg, d1, d2, d3_fraco], pontos)
    expect(coord.verificacoes_icu.length).toBe(4)
  })

  it('D3 (Icu=3kA, Icc=4kA): aparece em dispositivos inadequados', () => {
    const coord = buildCoordinacao([dg, d1, d2, d3_fraco], pontos)
    expect(coord.dispositivos_inadequados).toContain('D3')
  })

  it('DG e D1 (adequados): não aparecem em inadequados', () => {
    const coord = buildCoordinacao([dg, d1, d2, d3_fraco], pontos)
    expect(coord.dispositivos_inadequados).not.toContain('DG')
    expect(coord.dispositivos_inadequados).not.toContain('D1')
  })

  it('cascade c1: DG → D1 em ordem', () => {
    const coord = buildCoordinacao([dg, d1, d2], pontos)
    const casc_c1 = coord.cascades.find(c => c.circuito_id === 'c1')
    expect(casc_c1).toBeDefined()
    expect(casc_c1!.dispositivos[0]).toBe('DG')
    expect(casc_c1!.dispositivos[1]).toBe('D1')
  })

  it('cascade coordenado quando pares são seletivos', () => {
    const coord = buildCoordinacao([dg, d1], pontos)
    const casc = coord.cascades.find(c => c.circuito_id === 'c1')
    expect(casc?.coordenado).toBe(true)
    expect(casc?.problemas).toHaveLength(0)
  })
})
