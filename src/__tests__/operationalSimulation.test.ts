// src/__tests__/operationalSimulation.test.ts
import { describe, it, expect } from 'vitest'
import { TimelineBuilder, analisarContingencia, estadoEmT } from '../core/operationalSimulation'
import { buildElectricalNet } from '../core/electricalNet'
import { simularFalta } from '../core/faultSimulation'
import type { CaixaInput } from '../core/electricalNet'
import type { DispositivoProtecao, PontoCurto } from '../core/protectionCoordination'
import type { FaultEvent } from '../core/faultSimulation'

// ── Rede de teste ─────────────────────────────────────────────────
const caixas: CaixaInput[] = [
  { id:'qd', tipo_caixa:'quadro',
    borne_ids:['bf'], funcao_borne:{bf:'fase'}, circuitos_borne:{bf:['c1','c2']} },
  { id:'tomada-1', tipo_caixa:'instalacao',
    borne_ids:['bf'], funcao_borne:{bf:'fase'}, circuitos_borne:{bf:['c1']} },
  { id:'tomada-2', tipo_caixa:'instalacao',
    borne_ids:['bf'], funcao_borne:{bf:'fase'}, circuitos_borne:{bf:['c2']} },
]
const eletrodutos = [
  { caixa_a_id:'qd', caixa_b_id:'tomada-1',
    condutores:[{ condutor_id:'f1', funcao:'fase' as const, secao_mm2:2.5, comprimento_m:10, borne_a:'bf', borne_b:'bf', circuito_id:'c1' }] },
  { caixa_a_id:'qd', caixa_b_id:'tomada-2',
    condutores:[{ condutor_id:'f2', funcao:'fase' as const, secao_mm2:2.5, comprimento_m:10, borne_a:'bf', borne_b:'bf', circuito_id:'c2' }] },
]
const net = buildElectricalNet(caixas, eletrodutos)

const dg: DispositivoProtecao = { id:'DG', tipo:'DISJUNTOR', corrente_in:63, curva:'C', icu_ka:10, polo:1, jusante_ids:['D1','D2'] }
const d1: DispositivoProtecao = { id:'D1', tipo:'DISJUNTOR', corrente_in:16, curva:'C', icu_ka:6, polo:1, montante_id:'DG', jusante_ids:[], circuito_id:'c1' }
const d2: DispositivoProtecao = { id:'D2', tipo:'DISJUNTOR', corrente_in:16, curva:'C', icu_ka:6, polo:1, montante_id:'DG', jusante_ids:[], circuito_id:'c2' }

const ponto1: PontoCurto = { id:'tomada-1::bf', descricao:'T1', icc_max_ka:1.5, icc_min_ka:0.8, tensao_v:220 }
const ponto2: PontoCurto = { id:'tomada-2::bf', descricao:'T2', icc_max_ka:1.5, icc_min_ka:0.8, tensao_v:220 }
const fault1: FaultEvent  = { id:'f1', tipo:'CURTO_TRIFASICO', ponto_id:'tomada-1::bf' }
const fault2: FaultEvent  = { id:'f2', tipo:'CURTO_TRIFASICO', ponto_id:'tomada-2::bf' }

const disp_arestas = new Map([
  ['D1', ['edge-f1']],
  ['D2', ['edge-f2']],
  ['DG', ['edge-f1','edge-f2']],
])

describe('TimelineBuilder — linha do tempo', () => {

  it('estado inicial: todos os nós energizados', () => {
    const tl = new TimelineBuilder(net, disp_arestas)
    const timeline = tl.build('t1', 'Teste vazio')
    expect(timeline.eventos).toHaveLength(0)
    expect(timeline.estado_atual.n_energizados).toBe(net.nodes.size)
  })

  it('adicionar falta aumenta n_faltas', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1)
    const tl_data = tl.build('t1', 'Uma falta')
    expect(tl_data.n_faltas).toBe(1)
  })

  it('após falta e religamento: sequência de eventos', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 0)
       .religar('D1', 5000)
    const tl_data = tl.build('t1', 'Falta + religamento')
    expect(tl_data.n_religamentos).toBe(1)
    const n_events = tl_data.eventos.filter(e => e.tipo === 'FALTA' || e.tipo === 'RELIGAMENTO').length
    expect(n_events).toBeGreaterThanOrEqual(2)
  })

  it('duas faltas sequenciais', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const r2 = simularFalta(fault2, ponto2, [d2, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 0).adicionarFalta(r2, 1000)
    const tl_data = tl.build('t1', 'Duas faltas')
    expect(tl_data.n_faltas).toBe(2)
  })

  it('t_total_ms acumula delay entre eventos', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 1000).religar('D1', 5000)
    const tl_data = tl.build('t1', 'T')
    expect(tl_data.t_total_ms).toBeGreaterThanOrEqual(6000)
  })

  it('disponibilidade_pct entre 0 e 100', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 0).religar('D1', 10000)
    const tl_data = tl.build('t1', 'T')
    expect(tl_data.disponibilidade_pct).toBeGreaterThanOrEqual(0)
    expect(tl_data.disponibilidade_pct).toBeLessThanOrEqual(100)
  })

  it('eventos em ordem cronológica', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const r2 = simularFalta(fault2, ponto2, [d2, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 100).adicionarFalta(r2, 200)
    const tl_data = tl.build('t1', 'T')
    const ts = tl_data.eventos.map(e => e.t_ms)
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThanOrEqual(ts[i-1])
    }
  })
})

describe('analisarContingencia — análise N-1', () => {

  it('retorna análise para cada dispositivo', () => {
    const hierarquia = new Map([['D1','DG'], ['D2','DG'], ['DG', null]])
    const disp_nos   = new Map([['D1',['tomada-1::bf']], ['D2',['tomada-2::bf']], ['DG',[]]])
    const analise    = analisarContingencia(['D1','D2','DG'], hierarquia, disp_nos)
    expect(analise).toHaveLength(3)
  })

  it('D1 tem backup=DG → backup_adequado=true', () => {
    const hierarquia = new Map<string, string|null>([['D1','DG']])
    const disp_nos   = new Map([['D1',['tomada-1::bf']]])
    const analise    = analisarContingencia(['D1'], hierarquia, disp_nos)
    expect(analise[0].backup_id).toBe('DG')
    expect(analise[0].backup_adequado).toBe(true)
  })

  it('DG sem backup → backup_adequado=false', () => {
    const hierarquia = new Map<string, string|null>([['DG', null]])
    const disp_nos   = new Map<string, string[]>([['DG', []]])
    const analise    = analisarContingencia(['DG'], hierarquia, disp_nos)
    expect(analise[0].backup_adequado).toBe(false)
  })
})

describe('estadoEmT — estado em instante específico', () => {

  it('retorna null antes do primeiro evento', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 1000)
    const tl_data = tl.build('t1', 'T')
    const estado = estadoEmT(tl_data, 500)  // antes do evento
    expect(estado).toBeNull()
  })

  it('retorna snapshot do último evento até t', () => {
    const r1 = simularFalta(fault1, ponto1, [d1, dg])
    const tl  = new TimelineBuilder(net, disp_arestas)
    tl.adicionarFalta(r1, 0).religar('D1', 5000)
    const tl_data = tl.build('t1', 'T')
    // Em t=2500ms (após falta, antes do religamento)
    const estado = estadoEmT(tl_data, 2500)
    expect(estado).not.toBeNull()
  })
})
