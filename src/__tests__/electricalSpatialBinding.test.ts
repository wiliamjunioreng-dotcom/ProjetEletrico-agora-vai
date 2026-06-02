// src/__tests__/electricalSpatialBinding.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildElectricalSpatialMap, pontosDoCircuito, circuitoDoPonto,
  idsDestacadosPorCircuito, auditarTrajetos, funcaoEletricaDeTipo,
} from '../core/electricalSpatialBinding'
import type { PontoEletrico } from '../types/geometry'

function ponto(id: string, tipo: PontoEletrico['tipo'], x: number, y: number, circuito_id?: string): PontoEletrico {
  return {
    id, tipo, x, y,
    rotacao_graus: 0,
    circuito_id,
  }
}

const pontos: PontoEletrico[] = [
  ponto('p1', 'TUG_BAIXA',    0, 0,   'c1'),
  ponto('p2', 'TUG_BAIXA',    3, 0,   'c1'),
  ponto('p3', 'TUG_BAIXA',    3, 2,   'c1'),
  ponto('p4', 'LUMINARIA',         1.5, 1, 'c2'),
  ponto('p5', 'INTERRUPTOR_SIMPLES', 0, 1, 'c2'),
  ponto('p6', 'TUG_BAIXA',    5, 5,   undefined),  // sem circuito
]

describe('buildElectricalSpatialMap', () => {

  it('cria binding para pontos com circuito_id', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    expect(mapa.ponto_para_circuito.size).toBe(5)  // p6 não tem circuito
  })

  it('ponto sem circuito_id não entra no mapa', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    expect(mapa.ponto_para_circuito.has('p6')).toBe(false)
  })

  it('circuito c1 tem 3 pontos', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    const binding = mapa.circuito_para_pontos.get('c1')
    expect(binding?.ponto_ids).toHaveLength(3)
    expect(binding?.ponto_ids).toContain('p1')
    expect(binding?.ponto_ids).toContain('p2')
    expect(binding?.ponto_ids).toContain('p3')
  })

  it('circuito c2 tem 2 pontos', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    const binding = mapa.circuito_para_pontos.get('c2')
    expect(binding?.ponto_ids).toHaveLength(2)
  })

  it('comprimento_planta_m calculado para c1', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    const binding = mapa.circuito_para_pontos.get('c1')
    // p1(0,0)→p2(3,0)=3m, p2(3,0)→p3(3,2)=2m → total=5m
    expect(binding?.comprimento_planta_m).toBeCloseTo(5, 0)
  })
})

describe('consultas ao mapa', () => {

  it('pontosDoCircuito: retorna os pontos do circuito', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    const pts = pontosDoCircuito('c1', mapa, pontos)
    expect(pts).toHaveLength(3)
    expect(pts.every(p => p.circuito_id === 'c1')).toBe(true)
  })

  it('circuitoDoPonto: retorna o circuito do ponto', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    expect(circuitoDoPonto('p1', mapa)).toBe('c1')
    expect(circuitoDoPonto('p4', mapa)).toBe('c2')
    expect(circuitoDoPonto('p6', mapa)).toBeNull()
  })

  it('idsDestacadosPorCircuito: retorna Set com IDs corretos', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    const ids = idsDestacadosPorCircuito('c1', mapa)
    expect(ids.has('p1')).toBe(true)
    expect(ids.has('p4')).toBe(false)  // c2, não c1
  })
})

describe('funcaoEletricaDeTipo', () => {

  it('tomada → ponto_consumo', () => {
    expect(funcaoEletricaDeTipo('TUG_BAIXA')).toBe('ponto_consumo')
  })

  it('luminaria → ponto_consumo', () => {
    expect(funcaoEletricaDeTipo('LUMINARIA')).toBe('ponto_consumo')
  })

  it('interruptor → ponto_controle', () => {
    expect(funcaoEletricaDeTipo('INTERRUPTOR_SIMPLES')).toBe('ponto_controle')
  })
})

describe('auditarTrajetos — divergência comprimento', () => {

  it('detecta circuito com comprimento muito diferente da planta', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    // c1 mede 5m na planta, mas projeto declara 10m → 100% de divergência
    const auditorias = auditarTrajetos(mapa, [
      { id: 'c1', comprimento_m: 10 },  // 5m planta vs 10m projeto → alerta
      { id: 'c2', comprimento_m: 1.8 }, // ~1.8m planta vs 1.8m projeto → ok
    ])
    expect(auditorias.some(a => a.circuito_id === 'c1')).toBe(true)
    expect(auditorias.some(a => a.circuito_id === 'c2')).toBe(false)
  })

  it('alerta somente quando divergência > 20%', () => {
    const mapa = buildElectricalSpatialMap(pontos)
    const auditorias = auditarTrajetos(mapa, [
      { id: 'c1', comprimento_m: 5.5 },  // 10% de divergência → sem alerta
    ])
    expect(auditorias).toHaveLength(0)
  })
})
