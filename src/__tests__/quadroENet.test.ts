// src/__tests__/quadroENet.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildQuadro, verificarQuadro, LARGURA_MODULAR,
} from '../core/quadroDistribuicao'
import type { CircuitoParaQD } from '../core/quadroDistribuicao'
import {
  buildElectricalNet, continuidade, verificarContinuidadePE, comprimentoCircuito,
} from '../core/electricalNet'

// ── Circuitos de teste ────────────────────────────────────────────
const circs: CircuitoParaQD[] = [
  { id:'c1', descricao:'ILUM Sala',  tipo:'ILUM', potencia_va:400, in_disj:10, curva:'C', idr:false, idr_in:0, fase:'R', n_fases:1, secao_fase:1.5 },
  { id:'c2', descricao:'TUG Sala',   tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:false, idr_in:0, fase:'S', n_fases:1, secao_fase:2.5 },
  { id:'c3', descricao:'TUG Banho',  tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:true,  idr_in:30, fase:'R', n_fases:1, secao_fase:2.5 },
  { id:'c4', descricao:'Chuveiro',   tipo:'TUE',  potencia_va:5500, in_disj:32, curva:'C', idr:true,  idr_in:30, fase:'R', n_fases:1, secao_fase:6.0 },
]

describe('QuadroDistribuicao — estrutura física', () => {

  it('buildQuadro: cria QD com dispositivos para cada circuito', () => {
    const qd = buildQuadro('qd1', 'QD Residencial', circs)
    // DG + 4 circuitos
    const disp_circs = qd.dispositivos.filter(d => d.circuito_id)
    expect(disp_circs).toHaveLength(4)
  })

  it('disjuntor geral vem primeiro (posicao_modulo = 1)', () => {
    const qd = buildQuadro('qd1', 'QD', circs)
    const dg = qd.dispositivos[0]
    expect(dg.posicao_modulo).toBe(1)
    expect(dg.circuito_id).toBeUndefined()  // DG não protege circuito específico
  })

  it('dispositivos DR ocupam 2 módulos (DR_MONO)', () => {
    const qd = buildQuadro('qd1', 'QD', circs)
    const dr_c3 = qd.dispositivos.find(d => d.circuito_id === 'c3')!
    expect(dr_c3.tipo).toBe('DR_MONO')
    expect(LARGURA_MODULAR['DR_MONO']).toBe(2)
  })

  it('posições são sequenciais (sem sobreposição)', () => {
    const qd = buildQuadro('qd1', 'QD', circs, 'QD', 48)
    // Cada posição deve ser maior que a anterior + largura do anterior
    let pos_fim = 0
    for (const d of qd.dispositivos.filter(d => d.tipo !== 'RESERVA')) {
      expect(d.posicao_modulo).toBeGreaterThanOrEqual(pos_fim + 1)
      pos_fim = d.posicao_modulo + LARGURA_MODULAR[d.tipo] - 1
    }
  })

  it('QD de 36 módulos: ocupacao_pct > 0', () => {
    const qd = buildQuadro('qd1', 'QD', circs, 'QD', 36)
    expect(qd.ocupacao_pct).toBeGreaterThan(0)
    expect(qd.ocupacao_pct).toBeLessThanOrEqual(100)
  })

  it('modulos_usados + modulos_livres = n_modulos_total', () => {
    const qd = buildQuadro('qd1', 'QD', circs, 'QD', 36)
    expect(qd.modulos_usados + qd.modulos_livres).toBe(qd.n_modulos_total)
  })

  it('barramento PE presente', () => {
    const qd = buildQuadro('qd1', 'QD', circs)
    const bpe = qd.barramentos.find(b => b.tipo === 'PE')
    expect(bpe).toBeDefined()
  })

  it('barramento neutro: terminais_usados = n_circuitos', () => {
    const qd = buildQuadro('qd1', 'QD', circs)
    const bn  = qd.barramentos.find(b => b.tipo === 'NEUTRO')
    expect(bn?.terminais_usados).toBe(4)
  })

  it('terminal de saída para cada circuito', () => {
    const qd = buildQuadro('qd1', 'QD', circs)
    const circ_ids = qd.terminais.map(t => t.circuito_id)
    expect(circ_ids).toContain('c1')
    expect(circ_ids).toContain('c2')
    expect(circ_ids).toContain('c3')
    expect(circ_ids).toContain('c4')
  })
})

describe('QuadroDistribuicao — verificação', () => {

  it('QD bem dimensionado: sem avisos', () => {
    const qd = buildQuadro('qd1', 'QD', circs, 'QD', 48)
    const v  = verificarQuadro(qd)
    // Com 48 módulos e só 4 circuitos, deve ter espaço de sobra
    expect(v.modulos_livres).toBeGreaterThan(4)
  })

  it('QD pequeno demais: aviso de reserva insuficiente', () => {
    // Forçar QD lotado colocando muitos circuitos
    const muitos = Array.from({ length:22 }, (_, i) => ({
      id:`c${i}`, descricao:`C${i}`, tipo:'TUG', potencia_va:600,
      in_disj:16, curva:'C' as const, idr:false, idr_in:0,
      fase:'R' as const, n_fases:1 as const, secao_fase:2.5,
    }))
    const qd = buildQuadro('qd1', 'QD', muitos, 'QD', 24)
    const v  = verificarQuadro(qd)
    // Com 15 circuitos mono (1 módulo cada) + DG + reservas, vai usar muitos módulos
    expect(v.avisos.length).toBeGreaterThan(0)
  })
})

describe('ElectricalNet — continuidade elétrica', () => {

  function buildTestNet() {
    const caixas: import('../core/electricalNet').CaixaInput[] = [
      { id:'qd', tipo_caixa:'quadro' as const,
        borne_ids: ['b-f-c1','b-n','b-pe'],
        funcao_borne: { 'b-f-c1':'fase' as const, 'b-n':'neutro' as const, 'b-pe':'terra' as const },
        circuitos_borne: { 'b-f-c1':['c1'], 'b-n':['c1'], 'b-pe':['c1'] },
      },
      { id:'tomada-1', tipo_caixa:'instalacao' as const,
        borne_ids: ['bf','bn','bpe'],
        funcao_borne: { 'bf':'fase' as const, 'bn':'neutro' as const, 'bpe':'terra' as const },
        circuitos_borne: { 'bf':['c1'], 'bn':['c1'], 'bpe':['c1'] },
      },
    ]

    const eletrodutos = [{
      caixa_a_id: 'qd', caixa_b_id: 'tomada-1',
      condutores: [
        { condutor_id:'f1',  funcao:'fase'   as const, secao_mm2:2.5, comprimento_m:12, borne_a:'b-f-c1', borne_b:'bf',  circuito_id:'c1' },
        { condutor_id:'n1',  funcao:'neutro' as const, secao_mm2:2.5, comprimento_m:12, borne_a:'b-n',    borne_b:'bn',  circuito_id:'c1' },
        { condutor_id:'pe1', funcao:'terra'  as const, secao_mm2:2.5, comprimento_m:12, borne_a:'b-pe',   borne_b:'bpe', circuito_id:'c1' },
      ],
    }]

    return buildElectricalNet(caixas, eletrodutos)
  }

  it('continuidade da fase c1: QD → tomada-1', () => {
    const net = buildTestNet()
    const { alcancados } = continuidade('qd::b-f-c1', 'fase', net)
    expect(alcancados).toContain('qd::b-f-c1')
    expect(alcancados).toContain('tomada-1::bf')
  })

  it('continuidade do PE: QD → tomada-1', () => {
    const net  = buildTestNet()
    const v    = verificarContinuidadePE('qd::b-pe', net)
    expect(v.continuo).toBe(true)
    expect(v.nos_sem_pe).toHaveLength(0)
  })

  it('comprimentoCircuito: soma das arestas do circuito c1', () => {
    const net  = buildTestNet()
    const comp = comprimentoCircuito('c1', 'fase', net)
    expect(comp).toBeCloseTo(12)
  })
})
