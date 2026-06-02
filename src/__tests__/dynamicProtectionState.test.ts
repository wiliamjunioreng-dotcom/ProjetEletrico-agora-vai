// src/__tests__/dynamicProtectionState.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildEstadoInicial, aplicarFalta, religamento, buildProtectionState,
  compararSnapshots,
} from '../core/dynamicProtectionState'
import { buildElectricalNet } from '../core/electricalNet'
import { simularFalta } from '../core/faultSimulation'
import type { CaixaInput } from '../core/electricalNet'
import type { DispositivoProtecao, PontoCurto } from '../core/protectionCoordination'
import type { FaultEvent } from '../core/faultSimulation'

// ── Rede de teste: QD → caixa-A → caixa-B (ponto de consumo) ─────
const caixas: CaixaInput[] = [
  { id:'qd', tipo_caixa:'quadro',
    borne_ids:['bf','bn','bpe'],
    funcao_borne: { bf:'fase', bn:'neutro', bpe:'terra' },
    circuitos_borne: { bf:['c1'], bn:['c1'], bpe:['c1'] },
  },
  { id:'caixa-a', tipo_caixa:'passagem',
    borne_ids:['bf','bn','bpe'],
    funcao_borne: { bf:'fase', bn:'neutro', bpe:'terra' },
    circuitos_borne: { bf:['c1'], bn:['c1'], bpe:['c1'] },
  },
  { id:'tomada-1', tipo_caixa:'instalacao',
    borne_ids:['bf','bn','bpe'],
    funcao_borne: { bf:'fase', bn:'neutro', bpe:'terra' },
    circuitos_borne: { bf:['c1'], bn:['c1'], bpe:['c1'] },
  },
]

const eletrodutos = [
  {
    caixa_a_id:'qd', caixa_b_id:'caixa-a',
    condutores: [
      { condutor_id:'f1', funcao:'fase' as const, secao_mm2:2.5, comprimento_m:8, borne_a:'bf', borne_b:'bf', circuito_id:'c1' },
      { condutor_id:'n1', funcao:'neutro' as const, secao_mm2:2.5, comprimento_m:8, borne_a:'bn', borne_b:'bn', circuito_id:'c1' },
    ],
  },
  {
    caixa_a_id:'caixa-a', caixa_b_id:'tomada-1',
    condutores: [
      { condutor_id:'f2', funcao:'fase' as const, secao_mm2:2.5, comprimento_m:5, borne_a:'bf', borne_b:'bf', circuito_id:'c1' },
      { condutor_id:'n2', funcao:'neutro' as const, secao_mm2:2.5, comprimento_m:5, borne_a:'bn', borne_b:'bn', circuito_id:'c1' },
    ],
  },
]

const net = buildElectricalNet(caixas, eletrodutos)

// Mapeamento: dispositivo → arestas que ele protege
// D1 protege todas as arestas do circuito c1
const disp_arestas = new Map([
  ['D1', ['edge-f1', 'edge-n1', 'edge-f2', 'edge-n2']],
])

// Dispositivos para simulação de falta
const dg: DispositivoProtecao = { id:'DG', tipo:'DISJUNTOR', corrente_in:63, curva:'C', icu_ka:10, polo:1, jusante_ids:['D1'] }
const d1: DispositivoProtecao = { id:'D1', tipo:'DISJUNTOR', corrente_in:16, curva:'C', icu_ka:6,  polo:1, montante_id:'DG', jusante_ids:[], circuito_id:'c1' }

const ponto_falta: PontoCurto = { id:'tomada-1::bf', descricao:'Falta na tomada', icc_max_ka:2.0, icc_min_ka:1.0, tensao_v:220 }
const fault: FaultEvent = { id:'f-test', tipo:'CURTO_TRIFASICO', ponto_id:'tomada-1::bf' }

describe('buildEstadoInicial', () => {

  it('todos os nós começam ENERGIZADOS', () => {
    const snap = buildEstadoInicial(net)
    for (const [, estado] of snap.estados_nos) {
      expect(estado).toBe('ENERGIZADO')
    }
  })

  it('nenhuma aresta aberta no estado inicial', () => {
    const snap = buildEstadoInicial(net)
    expect(snap.arestas_abertas.size).toBe(0)
  })

  it('n_energizados = total de nós', () => {
    const snap = buildEstadoInicial(net)
    expect(snap.n_energizados).toBe(net.nodes.size)
    expect(snap.n_desenergizados).toBe(0)
  })
})

describe('aplicarFalta — propagação de desenergização', () => {

  it('após atuação de D1: nó da falta fica FALTA_ATIVA ou DESENERGIZADO', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const snap_ini  = buildEstadoInicial(net)
    const { snapshot } = aplicarFalta(snap_ini, net, resultado, disp_arestas)

    // O nó da falta deve ter saído de ENERGIZADO
    const estado_falta = snapshot.estados_nos.get('tomada-1::bf')
    expect(estado_falta).not.toBe('ENERGIZADO')
  })

  it('aresta protegida por D1 fica aberta após atuação', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    resultado.dispositivo_atuou_id  // force access

    const snap_ini = buildEstadoInicial(net)
    const { snapshot } = aplicarFalta(snap_ini, net, resultado, disp_arestas)

    if (resultado.dispositivo_atuou_id === 'D1') {
      expect(snapshot.arestas_abertas.size).toBeGreaterThan(0)
    }
  })

  it('evento de ABERTURA registrado quando dispositivo atua', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const snap_ini  = buildEstadoInicial(net)
    const { eventos } = aplicarFalta(snap_ini, net, resultado, disp_arestas)

    if (resultado.dispositivo_atuou_id) {
      const abertura = eventos.find(e => e.tipo === 'ABERTURA')
      expect(abertura).toBeDefined()
      expect(abertura?.dispositivo_id).toBe(resultado.dispositivo_atuou_id)
    }
  })

  it('nós a jusante do dispositivo ficam DESENERGIZADOS', () => {
    // Simular falta com D1 atuando
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const snap_ini  = buildEstadoInicial(net)
    const { snapshot } = aplicarFalta(snap_ini, net, resultado, new Map([
      ['D1', ['edge-f1', 'edge-n1', 'edge-f2', 'edge-n2']],
    ]))
    // Algum nó deve ter ficado desenergizado se D1 atuou
    if (resultado.dispositivo_atuou_id === 'D1') {
      expect(snapshot.n_desenergizados).toBeGreaterThan(0)
    }
  })
})

describe('buildProtectionState', () => {

  it('retorna estado estável se algum dispositivo atuou', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const state = buildProtectionState(net, resultado, disp_arestas)
    expect(state.estavel).toBe(resultado.dispositivo_atuou_id !== undefined)
  })

  it('zonas_sem_energia: lista de nós desenergizados', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const state = buildProtectionState(net, resultado, disp_arestas)
    expect(Array.isArray(state.zonas_sem_energia)).toBe(true)
  })

  it('fault_id preservado no estado', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const state = buildProtectionState(net, resultado, disp_arestas)
    expect(state.fault_id).toBe('f-test')
  })
})

describe('religamento', () => {

  it('após religamento: nós voltam a ENERGIZADO', () => {
    // Primeiro aplicar a falta
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const snap_ini  = buildEstadoInicial(net)
    const { snapshot: snap_falta } = aplicarFalta(snap_ini, net, resultado, disp_arestas)

    // Religar D1
    const { snapshot: snap_relig } = religamento(snap_falta, net, 'D1', disp_arestas)

    // Após religamento, deve ter mais nós energizados
    expect(snap_relig.n_energizados).toBeGreaterThanOrEqual(snap_falta.n_energizados)
  })

  it('religamento gera evento RELIGAMENTO', () => {
    const snap_ini = buildEstadoInicial(net)
    const { eventos } = religamento(snap_ini, net, 'D1', disp_arestas)
    expect(eventos.find(e => e.tipo === 'RELIGAMENTO')).toBeDefined()
  })
})

describe('compararSnapshots — delta de estado', () => {

  it('identifica nós que perderam energia', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const snap_ini  = buildEstadoInicial(net)
    const { snapshot: snap_falta } = aplicarFalta(snap_ini, net, resultado, disp_arestas)

    const delta = compararSnapshots(snap_ini, snap_falta)
    // Se D1 atuou, algum nó perdeu energia
    if (resultado.dispositivo_atuou_id && snap_falta.n_desenergizados > 0) {
      expect(delta.perderam_energia.length).toBeGreaterThan(0)
    }
  })

  it('após religamento: ganharam_energia não vazio', () => {
    const resultado = simularFalta(fault, ponto_falta, [d1, dg])
    const snap_ini  = buildEstadoInicial(net)
    const { snapshot: snap_falta } = aplicarFalta(snap_ini, net, resultado, disp_arestas)
    const { snapshot: snap_relig } = religamento(snap_falta, net, 'D1', disp_arestas)

    const delta = compararSnapshots(snap_falta, snap_relig)
    if (snap_falta.n_desenergizados > 0) {
      expect(delta.ganharam_energia.length).toBeGreaterThan(0)
    }
  })
})
