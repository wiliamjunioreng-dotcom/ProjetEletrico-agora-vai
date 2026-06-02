// src/__tests__/panelTopology.test.ts
import { describe, it, expect } from 'vitest'
import { buildQuadro } from '../core/quadroDistribuicao'
import {
  buildPanelTopology, sequenciaCircuito, circuitoTemDR,
} from '../core/panelTopology'
import type { CircuitoParaQD } from '../core/quadroDistribuicao'

const circs: CircuitoParaQD[] = [
  { id:'c1', descricao:'ILUM Sala',   tipo:'ILUM', potencia_va:400, in_disj:10, curva:'C', idr:false, idr_in:0,  fase:'R', n_fases:1, secao_fase:1.5 },
  { id:'c2', descricao:'TUG Sala',    tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:false, idr_in:0,  fase:'S', n_fases:1, secao_fase:2.5 },
  { id:'c3', descricao:'TUG Banho',   tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:true,  idr_in:30, fase:'R', n_fases:1, secao_fase:2.5 },
  { id:'c4', descricao:'Chuveiro',    tipo:'TUE',  potencia_va:5500, in_disj:32, curva:'C', idr:true,  idr_in:30, fase:'R', n_fases:1, secao_fase:6.0 },
]

describe('PanelTopology — estrutura de nós', () => {

  it('buildPanelTopology: nós de alimentador, barramentos e dispositivos existem', () => {
    const qd   = buildQuadro('qd1', 'QD', circs, 'QD', 48)
    const topo = buildPanelTopology(qd)
    expect(topo.nodes.size).toBeGreaterThan(0)
    // Deve ter nó de alimentador
    expect(topo.nodes.has('alim')).toBe(true)
  })

  it('cada barramento tem nó correspondente', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const barr_nodes = [...topo.nodes.values()].filter(n => n.tipo === 'barramento')
    expect(barr_nodes.length).toBe(qd.barramentos.length)
  })

  it('cada circuito tem nó de terminal', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const terminals = [...topo.nodes.values()].filter(n => n.tipo === 'terminal')
    expect(terminals.length).toBe(4)
  })

  it('nós de dispositivo para cada circuito', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const disps = [...topo.nodes.values()].filter(n => n.tipo === 'dispositivo')
    // DG + 4 circuitos = 5 dispositivos
    expect(disps.length).toBe(5)
  })
})

describe('PanelTopology — arestas e sequência', () => {

  it('alimentador → DG: aresta existe', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const aresta_alim = topo.edges.find(e => e.no_a === 'alim')
    expect(aresta_alim).toBeDefined()
  })

  it('barramento → dispositivo via pente: aresta em_paralelo=true', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const pentes = topo.edges.filter(e => e.tipo === 'pente')
    expect(pentes.length).toBeGreaterThan(0)
    expect(pentes.every(e => e.em_paralelo)).toBe(true)
  })

  it('dispositivo → terminal: aresta em_paralelo=false (sequência)', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const saidas = topo.edges.filter(e => e.no_b.startsWith('term-'))
    expect(saidas.every(e => !e.em_paralelo)).toBe(true)
  })

  it('sequenciaCircuito: retorna caminho do alimentador ao terminal', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const seq  = sequenciaCircuito('c1', topo)
    expect(seq.length).toBeGreaterThan(0)
    // Último nó = terminal
    expect(seq[seq.length - 1].tipo).toBe('terminal')
    expect(seq[seq.length - 1].circuito_id).toBe('c1')
  })
})

describe('PanelTopology — grupos DR e verificações', () => {

  it('circuitos c3 e c4 (DR=true): têm nó com label incluindo DR', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    const dr_nodes = [...topo.nodes.values()].filter(n => n.label.includes('DR'))
    // c3 e c4 têm IDR → 2 nós DR
    expect(dr_nodes.length).toBe(2)
  })

  it('circuitoTemDR: c3 tem DR', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    expect(circuitoTemDR('c3', topo)).toBe(true)
  })

  it('circuitoTemDR: c1 (sem IDR) não tem DR', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    expect(circuitoTemDR('c1', topo)).toBe(false)
  })

  it('verificação: área molhada (banho) sem DR gera aviso de erro', () => {
    // c_banho_sem_dr: área molhada mas idr=false
    const circs_teste: CircuitoParaQD[] = [
      { id:'cb', descricao:'TUG Banho sem DR', tipo:'TUG', potencia_va:600,
        in_disj:16, curva:'C', idr:false, idr_in:0, fase:'R', n_fases:1, secao_fase:2.5 }
    ]
    const qd   = buildQuadro('qd1', 'QD', circs_teste)
    const topo = buildPanelTopology(qd)
    const erros_dr = topo.avisos.filter(a => a.tipo === 'SEM_DR_AREA_MOLHADA')
    expect(erros_dr.length).toBe(1)
    expect(erros_dr[0].severidade).toBe('erro')
  })

  it('verificação: circuitos corretos (área seca + DR em área molhada): sem avisos de erro', () => {
    const qd   = buildQuadro('qd1', 'QD', circs)
    const topo = buildPanelTopology(qd)
    // c3 (banho) tem IDR=true → sem aviso de área molhada
    const erros_banho = topo.avisos.filter(a =>
      a.tipo === 'SEM_DR_AREA_MOLHADA' && a.circuito_id === 'c3'
    )
    expect(erros_banho).toHaveLength(0)
  })
})
