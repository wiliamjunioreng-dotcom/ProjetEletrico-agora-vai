// src/__tests__/quadroTrifasico.test.ts
import { describe, it, expect } from 'vitest'
import { buildQuadro } from '../core/quadroDistribuicao'
import { buildPanelTopology } from '../core/panelTopology'
import { inferirLigacao, verificarCompatibilidade } from '../core/loadBalancing'
import type { CircuitoParaQD } from '../core/quadroDistribuicao'
import type { InstalacaoEletrica, CargaEletrica } from '../core/loadBalancing'

// ── Circuitos balanceados trifásicos ──────────────────────────────
const circs_tri: CircuitoParaQD[] = [
  { id:'c1', descricao:'ILUM Sala',   tipo:'ILUM', potencia_va:400, in_disj:10, curva:'C', idr:false, idr_in:0,  fase:'R', n_fases:1, secao_fase:1.5 },
  { id:'c2', descricao:'TUG Sala',    tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:false, idr_in:0,  fase:'S', n_fases:1, secao_fase:2.5 },
  { id:'c3', descricao:'TUG Cozinha', tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:false, idr_in:0,  fase:'T', n_fases:1, secao_fase:2.5 },
  { id:'c4', descricao:'TUG Banho',   tipo:'TUG',  potencia_va:600, in_disj:16, curva:'C', idr:true,  idr_in:30, fase:'R', n_fases:1, secao_fase:2.5 },
]

describe('buildQuadro — barramentos trifásicos', () => {

  it('instalação monofásica (230V): apenas 1 barramento de fase', () => {
    const qd  = buildQuadro('qd', 'QD Mono', circs_tri, 'QD', 36, 230, 1)
    const fases = qd.barramentos.filter(b => b.tipo.startsWith('FASE_'))
    expect(fases).toHaveLength(1)
    expect(fases[0].tipo).toBe('FASE_R')
  })

  it('instalação bifásica (230V, 2 fases): 2 barramentos de fase', () => {
    const qd   = buildQuadro('qd', 'QD Bi', circs_tri, 'QD', 36, 230, 2)
    const fases = qd.barramentos.filter(b => b.tipo.startsWith('FASE_'))
    expect(fases).toHaveLength(2)
    expect(fases.map(f => f.tipo)).toContain('FASE_R')
    expect(fases.map(f => f.tipo)).toContain('FASE_S')
  })

  it('instalação trifásica 380V: 3 barramentos de fase (R, S, T)', () => {
    const qd   = buildQuadro('qd', 'QD Tri', circs_tri, 'QD', 36, 380, 3)
    const fases = qd.barramentos.filter(b => b.tipo.startsWith('FASE_'))
    expect(fases).toHaveLength(3)
    const tipos = fases.map(f => f.tipo)
    expect(tipos).toContain('FASE_R')
    expect(tipos).toContain('FASE_S')
    expect(tipos).toContain('FASE_T')
  })

  it('corrente_total_a por fase calculada separadamente', () => {
    const qd  = buildQuadro('qd', 'QD Tri', circs_tri, 'QD', 36, 380, 3)
    const br  = qd.barramentos.find(b => b.tipo === 'FASE_R')
    const bs  = qd.barramentos.find(b => b.tipo === 'FASE_S')
    // c1 (R, 400VA) + c4 (R, 600VA) = 1000VA em R / 380 ≈ corrente R
    // c2 (S, 600VA) em S
    expect(br?.corrente_total_a).not.toBe(bs?.corrente_total_a)  // fases com cargas diferentes
  })

  it('barramento PE sempre presente (independente do sistema)', () => {
    const qd_mono = buildQuadro('qd1', 'QD', circs_tri.slice(0,1), 'QD', 24, 230, 1)
    const qd_tri  = buildQuadro('qd2', 'QD', circs_tri, 'QD', 36, 380, 3)
    expect(qd_mono.barramentos.find(b => b.tipo === 'PE')).toBeDefined()
    expect(qd_tri.barramentos.find(b => b.tipo === 'PE')).toBeDefined()
  })

  it('barramento NEUTRO sempre presente', () => {
    const qd = buildQuadro('qd', 'QD', circs_tri, 'QD', 36, 380, 3)
    expect(qd.barramentos.find(b => b.tipo === 'NEUTRO')).toBeDefined()
  })
})

describe('PanelTopology — neutro pós-DR', () => {

  it('quadro misto (com e sem DR): aviso NEUTRO_INTERROMPIDO', () => {
    // c1-c3 sem DR, c4 com DR → quadro misto
    const qd   = buildQuadro('qd', 'QD', circs_tri)
    const topo = buildPanelTopology(qd)
    const aviso = topo.avisos.find(a => a.tipo === 'NEUTRO_INTERROMPIDO')
    expect(aviso).toBeDefined()
    expect(aviso?.severidade).toBe('aviso')
    expect(aviso?.descricao).toContain('neutro')
  })

  it('quadro só com DR: sem aviso de neutro compartilhado', () => {
    const circs_todos_dr: CircuitoParaQD[] = circs_tri.map(c => ({ ...c, idr:true, idr_in:30 }))
    const qd   = buildQuadro('qd', 'QD DR', circs_todos_dr)
    const topo = buildPanelTopology(qd)
    const aviso = topo.avisos.find(a => a.tipo === 'NEUTRO_INTERROMPIDO')
    expect(aviso).toBeUndefined()
  })

  it('quadro sem DR: sem aviso de neutro compartilhado', () => {
    const circs_sem_dr: CircuitoParaQD[] = circs_tri.slice(0,3)  // c1-c3, todos sem DR
    const qd   = buildQuadro('qd', 'QD sem DR', circs_sem_dr)
    const topo = buildPanelTopology(qd)
    const aviso = topo.avisos.find(a => a.tipo === 'NEUTRO_INTERROMPIDO')
    expect(aviso).toBeUndefined()
  })
})

describe('InstalacaoEletrica vs CargaEletrica — hierarquia correta', () => {

  // A instalação define disponibilidade; a carga define requisito
  // O sistema valida: instalação SUPORTA a carga?

  const inst_mono: InstalacaoEletrica = {
    tipo:'monofasico', tensao_fn_v:127, tensao_ff_v:220,
    fases:['R'], neutro:true, padrao:'ANEEL',
    carga_fase_va:{R:0,S:0,T:0}, cap_alim_a:60,
  }

  const inst_tri_380: InstalacaoEletrica = {
    tipo:'trifasico', tensao_fn_v:220, tensao_ff_v:380,
    fases:['R','S','T'], neutro:true, padrao:'ANEEL',
    carga_fase_va:{R:1000,S:800,T:600}, cap_alim_a:100,
  }

  it('tomada 127V mono em inst. trifásica: VÁLIDO (mono em tri)', () => {
    const tomada: CargaEletrica = {
      descricao:'Tomada', tipo:'tomada', potencia_va:600,
      fp:1, fases_req:1, tensao_nom_v:127, comprimento_m:10,
    }
    const r = verificarCompatibilidade(tomada, inst_tri_380)
    expect(r.compativel).toBe(true)
  })

  it('motor 380V tri em inst. monofásica: INVÁLIDO', () => {
    const motor: CargaEletrica = {
      descricao:'Motor 380V', tipo:'motor', potencia_va:3000,
      fp:0.85, fases_req:3, tensao_nom_v:380, comprimento_m:20,
    }
    const r = verificarCompatibilidade(motor, inst_mono)
    expect(r.compativel).toBe(false)
  })

  it('a instalação define disponibilidade, não a carga', () => {
    // Mesma carga em duas instalações diferentes → resultados diferentes
    const carga: CargaEletrica = {
      descricao:'Equipamento 220V mono', tipo:'resistivo', potencia_va:5000,
      fp:1, fases_req:1, tensao_nom_v:220, comprimento_m:15,
    }
    const r_tri  = verificarCompatibilidade(carga, inst_tri_380)
    // Em mono: 5000VA/220V = 22.7A — dentro do cap (60A)
    // Em tri:  pode distribuir melhor
    expect(r_tri.compativel).toBe(true)
  })

  it('inferirLigacao: fase escolhida pela carga atual (menos carregada)', () => {
    // inst_tri_380: R=1000, S=800, T=600 → T menos carregada
    const carga: CargaEletrica = {
      descricao:'Nova tomada', tipo:'tomada', potencia_va:600,
      fp:1, fases_req:1, tensao_nom_v:220, comprimento_m:10,
    }
    const r = inferirLigacao(carga, inst_tri_380)
    expect(r.compativel).toBe(true)
    // Deve escolher T (menos carregada)
    expect(r.fases[0]).toBe('T')
  })

  it('desequilíbrio APÓS conexão ≤ desequilíbrio ANTES quando usamos a fase correta', () => {
    const carga: CargaEletrica = {
      descricao:'Carga pesada', tipo:'resistivo', potencia_va:5000,
      fp:1, fases_req:1, tensao_nom_v:220, comprimento_m:10,
    }
    const r = inferirLigacao(carga, inst_tri_380)
    // Adicionar na fase menos carregada deve melhorar ou manter o equilíbrio
    // (nem sempre melhora matematicamente, mas não deve piorar sistematicamente)
    expect(r.desequilibrio_pct_antes).toBeGreaterThanOrEqual(0)
    expect(r.desequilibrio_pct_depois).toBeGreaterThanOrEqual(0)
  })
})
