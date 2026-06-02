// src/__tests__/segmentoFisico.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildSegmentoFisico, buildTrajetoFisico, quantSegmentos,
} from '../core/segmentoFisico'
import type { CircuitoNoTrajeto } from '../core/segmentoFisico'

const circ_ilum: CircuitoNoTrajeto = { id:'c1', tipo:'ILUM', secao_mm2:1.5, n_fases:1 }
const circ_tug:  CircuitoNoTrajeto = { id:'c2', tipo:'TUG',  secao_mm2:2.5, n_fases:1 }
const circ_tue:  CircuitoNoTrajeto = { id:'c3', tipo:'TUE',  secao_mm2:4.0, n_fases:2 }

describe('buildSegmentoFisico — condutores inferidos', () => {

  it('ILUM: infere F + N + retorno + PE = 4 condutores', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum])
    expect(seg.condutores).toHaveLength(4)
    const funcoes = seg.condutores.map(c => c.funcao)
    expect(funcoes).toContain('fase')
    expect(funcoes).toContain('neutro')
    expect(funcoes).toContain('retorno')
    expect(funcoes).toContain('terra')
  })

  it('TUG: infere F + N + PE = 3 condutores', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_tug])
    expect(seg.condutores).toHaveLength(3)
    expect(seg.condutores.some(c => c.funcao === 'retorno')).toBe(false)
  })

  it('TUE bifásico: F1 + F2 + PE = 3 condutores', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,1.80,[circ_tue])
    expect(seg.condutores).toHaveLength(3)
    const fases = seg.condutores.filter(c => c.funcao === 'fase')
    expect(fases).toHaveLength(2)
  })

  it('dois circuitos: condutores de ambos presentes', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum, circ_tug])
    const circ_ids = new Set(seg.condutores.map(c => c.circuito_id))
    expect(circ_ids).toContain('c1')
    expect(circ_ids).toContain('c2')
  })

  it('face_id preservado no segmento', () => {
    const seg = buildSegmentoFisico('s1','face-norte','p1',10,0.30,[circ_ilum])
    expect(seg.face_id).toBe('face-norte')
  })
})

describe('buildSegmentoFisico — ocupação', () => {

  it('1 circuito: Fa = 1.0', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum])
    expect(seg.ocupacao.fa).toBe(1.0)
  })

  it('2 circuitos: Fa < 1.0 (agrupamento reduz capacidade)', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum, circ_tug])
    expect(seg.ocupacao.fa).toBeLessThan(1.0)
  })

  it('ocupação aumenta com mais circuitos (monotonicidade)', () => {
    const s1 = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum])
    const s2 = buildSegmentoFisico('s2','f1','p1',10,0.30,[circ_ilum, circ_tug])
    expect(s2.ocupacao.taxa_pct).toBeGreaterThan(s1.ocupacao.taxa_pct)
  })

  it('diâmetro cresce com a ocupação (monotonicidade)', () => {
    const circs_muitos: CircuitoNoTrajeto[] = Array.from({ length:12 }, (_, i) => ({
      id:`c${i}`, tipo:'TUG', secao_mm2:4, n_fases:1 as const
    }))
    const s_poucos = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_tug])
    const s_muitos = buildSegmentoFisico('s2','f1','p1',10,0.30,circs_muitos)
    expect(s_muitos.ocupacao.diametro_mm).toBeGreaterThanOrEqual(s_poucos.ocupacao.diametro_mm)
  })

  it('status OK para 1 circuito leve', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum])
    expect(seg.ocupacao.status).toBe('OK')
  })

  it('limite_pct = 40% para 2+ cabos (NBR §6.1.5.2)', () => {
    const seg = buildSegmentoFisico('s1','f1','p1',10,0.30,[circ_ilum, circ_tug])
    expect(seg.ocupacao.limite_pct).toBe(40)
  })
})

describe('buildTrajetoFisico', () => {

  it('trajeto com 3 faces: 3 segmentos', () => {
    const traj = buildTrajetoFisico(
      't1', 'TUG Sala', 'c1',
      ['f-n', 'f-l', 'f-s'],
      { 'f-n': 4, 'f-l': 3, 'f-s': 4 },
      { 'f-n': 'p-n', 'f-l': 'p-l', 'f-s': 'p-s' },
      [circ_tug], 0.30
    )
    expect(traj.segmentos).toHaveLength(3)
  })

  it('comprimento_total = soma dos segmentos', () => {
    const traj = buildTrajetoFisico(
      't1', 'TUG', 'c1',
      ['f-n', 'f-l'],
      { 'f-n': 4, 'f-l': 3 },
      { 'f-n': 'p-n', 'f-l': 'p-l' },
      [circ_tug], 0.30
    )
    expect(traj.comprimento_total_m).toBeCloseTo(7)
  })

  it('n_curvas_90 = n_faces - 1 (dobra a cada mudança de face)', () => {
    const traj = buildTrajetoFisico(
      't1', 'T', 'c1',
      ['f1','f2','f3','f4'],
      { f1:3, f2:4, f3:3, f4:3 },
      { f1:'p1', f2:'p2', f3:'p3', f4:'p4' },
      [circ_ilum], 0.30
    )
    expect(traj.n_curvas_90).toBe(3)
  })
})

describe('quantSegmentos — quantitativos dos trajetos', () => {

  it('agrupa eletrodutos por diâmetro', () => {
    const traj = buildTrajetoFisico(
      't1', 'ILUM', 'c1',
      ['f1', 'f2'],
      { f1: 5, f2: 5 },
      { f1:'p1', f2:'p2' },
      [circ_ilum], 0.30
    )
    const q = quantSegmentos([traj])
    expect(q.eletrodutos.length).toBeGreaterThan(0)
    expect(q.eletrodutos[0].metros).toBeGreaterThan(0)
  })

  it('metros com 10% de folga', () => {
    const traj = buildTrajetoFisico(
      't1', 'T', 'c1',
      ['f1'],
      { f1: 10 },
      { f1: 'p1' },
      [circ_tug], 0.30
    )
    const q = quantSegmentos([traj])
    const raw = 10  // 1 segmento de 10m
    expect(q.eletrodutos[0].metros).toBeGreaterThanOrEqual(Math.ceil(raw * 1.10))
  })

  it('fa_medio calculado sobre todos os segmentos', () => {
    const traj = buildTrajetoFisico(
      't1', 'T', 'c1',
      ['f1','f2'],
      { f1:5, f2:5 },
      { f1:'p1', f2:'p2' },
      [circ_ilum, circ_tug], 0.30
    )
    const q = quantSegmentos([traj])
    // Com 2 circuitos, Fa < 1.0
    expect(q.fa_medio).toBeLessThan(1.0)
    expect(q.fa_medio).toBeGreaterThan(0)
  })
})
