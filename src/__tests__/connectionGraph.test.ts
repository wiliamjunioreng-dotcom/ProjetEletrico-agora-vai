// src/__tests__/connectionGraph.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildConnectionGraph, correnteBorne, esquemaLigacao, verificarCompatibilidade,
} from '../core/connectionGraph'
import type { CondutorInput } from '../core/connectionGraph'

// ── Fixtures ──────────────────────────────────────────────────────
const c1_fase:   CondutorInput = { condutor_id:'f1',  circuito_id:'c1', funcao:'fase',   fase:'R', secao_mm2:2.5 }
const c1_neutro: CondutorInput = { condutor_id:'n1',  circuito_id:'c1', funcao:'neutro', secao_mm2:2.5 }
const c1_pe:     CondutorInput = { condutor_id:'pe1', circuito_id:'c1', funcao:'terra',  secao_mm2:2.5 }
const c2_fase:   CondutorInput = { condutor_id:'f2',  circuito_id:'c2', funcao:'fase',   fase:'S', secao_mm2:2.5 }
const c2_neutro: CondutorInput = { condutor_id:'n2',  circuito_id:'c2', funcao:'neutro', secao_mm2:2.5 }
const c2_pe:     CondutorInput = { condutor_id:'pe2', circuito_id:'c2', funcao:'terra',  secao_mm2:2.5 }

describe('buildConnectionGraph — bornes', () => {

  it('cada função tem pelo menos 1 borne', () => {
    const g = buildConnectionGraph([c1_fase, c1_neutro, c1_pe])
    expect(g.bornes.size).toBe(3)  // fase, neutro, terra
  })

  it('neutros de circuitos diferentes → mesmo borne (compartilhamento permitido)', () => {
    const g = buildConnectionGraph([c1_neutro, c2_neutro])
    // Ambos têm funcao='neutro' → agrupados na mesma chave 'neutro'
    const borne_neutro = g.bornes.get('neutro')
    expect(borne_neutro?.condutor_ids).toContain('n1')
    expect(borne_neutro?.condutor_ids).toContain('n2')
    expect(borne_neutro?.compartilhamento_ok).toBe(true)
  })

  it('PEs de circuitos diferentes → mesmo borne (barramento PE)', () => {
    const g = buildConnectionGraph([c1_pe, c2_pe])
    const borne_pe = g.bornes.get('terra')
    expect(borne_pe?.condutor_ids).toHaveLength(2)
    expect(borne_pe?.compartilhamento_ok).toBe(true)
  })

  it('fases de circuitos diferentes → bornes SEPARADOS (por circuito)', () => {
    const g = buildConnectionGraph([c1_fase, c2_fase])
    // c1 fase R e c2 fase S → bornes diferentes
    expect(g.bornes.size).toBe(2)
    // Verificar que cada um é de um circuito diferente
    const circ_ids = [...g.bornes.values()].flatMap(b => b.circuito_ids)
    expect(circ_ids).toContain('c1')
    expect(circ_ids).toContain('c2')
  })

  it('borne de neutro: label = "N"', () => {
    const g = buildConnectionGraph([c1_neutro])
    const borne = g.bornes.get('neutro')
    expect(borne?.label).toBe('N')
  })

  it('borne de PE: label = "PE"', () => {
    const g = buildConnectionGraph([c1_pe])
    const borne = g.bornes.get('terra')
    expect(borne?.label).toBe('PE')
  })

  it('ocupacao_pct calculada corretamente', () => {
    // Borne neutro: capacidade 4 fios, 2 presentes → 50%
    const g = buildConnectionGraph([c1_neutro, c2_neutro])
    const borne = g.bornes.get('neutro')
    expect(borne?.ocupacao_pct).toBe(50)   // 2/4 × 100
  })
})

describe('buildConnectionGraph — avisos normativos', () => {

  it('fases do mesmo circuito no mesmo borne: compartilhamento OK', () => {
    // F1 e F2 do mesmo circuito c1 → borne de fase só tem um circuito → ok
    const g = buildConnectionGraph([c1_fase, c1_pe])
    const erros = g.avisos.filter(a => a.tipo === 'COMPARTILHAMENTO_INDEVIDO')
    expect(erros).toHaveLength(0)
  })

  it('sem PE: aviso PE_NAO_BARRADO', () => {
    // Sem nenhum condutor de terra
    const g = buildConnectionGraph([c1_fase, c1_neutro])  // sem PE
    const aviso_pe = g.avisos.find(a => a.tipo === 'PE_NAO_BARRADO')
    expect(aviso_pe).toBeDefined()
    expect(aviso_pe?.severidade).toBe('aviso')
  })

  it('circuito completo (F+N+PE): sem avisos de erro', () => {
    const g = buildConnectionGraph([c1_fase, c1_neutro, c1_pe])
    const erros = g.avisos.filter(a => a.severidade === 'erro')
    expect(erros).toHaveLength(0)
  })

  it('borne cheio (n_fios > n_max): aviso BORNE_CHEIO', () => {
    // Borne de fase tem capacidade 2. Colocar 3 fases do mesmo circuito
    const extra: CondutorInput = { condutor_id:'f3', circuito_id:'c1', funcao:'fase', fase:'R', secao_mm2:2.5 }
    const extra2: CondutorInput = { condutor_id:'f4', circuito_id:'c1', funcao:'fase', fase:'R', secao_mm2:2.5 }
    const extra3: CondutorInput = { condutor_id:'f5', circuito_id:'c1', funcao:'fase', fase:'R', secao_mm2:2.5 }
    const g = buildConnectionGraph([c1_fase, extra, extra2, extra3])
    // borne fase-c1-R com 4 fios, capacidade 2
    const borne_cheio = g.avisos.find(a => a.tipo === 'BORNE_CHEIO')
    expect(borne_cheio).toBeDefined()
  })
})

describe('correnteBorne', () => {

  it('corrente do borne PE = soma dos circuitos no borne', () => {
    const g = buildConnectionGraph([c1_pe, c2_pe])
    const borne_pe = g.bornes.get('terra')!
    const correntes = new Map([['c1', 10], ['c2', 15]])
    const total = correnteBorne(borne_pe, correntes)
    expect(total).toBe(25)  // 10 + 15
  })

  it('corrente de borne vazio = 0', () => {
    const g = buildConnectionGraph([c1_neutro])
    const borne = g.bornes.get('neutro')!
    const total = correnteBorne(borne, new Map())
    expect(total).toBe(0)
  })
})

describe('verificarCompatibilidade', () => {

  it('dois circuitos em fases diferentes: compatíveis', () => {
    const g = buildConnectionGraph([c1_fase, c1_neutro, c1_pe, c2_fase, c2_neutro, c2_pe])
    const comp = verificarCompatibilidade('c1', 'c2', g)
    expect(comp.compativel).toBe(true)
  })
})

describe('esquemaLigacao', () => {

  it('retorna string descritiva dos bornes', () => {
    const g = buildConnectionGraph([c1_fase, c1_neutro, c1_pe])
    const esquema = esquemaLigacao(g)
    expect(esquema).toContain('ESQUEMA DE LIGAÇÕES')
    expect(esquema).toContain('N')
    expect(esquema).toContain('PE')
  })
})

describe('ConnectionGraph — interruptor paralelo (viajantes)', () => {

  // Int.A e Int.B compartilham viajantes no mesmo segmento de eletroduto
  // Mas cada viajante está no borne do seu próprio circuito (não compartilham)
  const v1: CondutorInput = { condutor_id:'v1', circuito_id:'c1', funcao:'viajante', secao_mm2:1.5 }
  const v2: CondutorInput = { condutor_id:'v2', circuito_id:'c1', funcao:'viajante', secao_mm2:1.5 }

  it('viajantes do mesmo circuito: bornes separados (V1 e V2 distintos)', () => {
    const g = buildConnectionGraph([v1, v2, c1_fase, c1_neutro, c1_pe])
    // v1 e v2 são ambos 'viajante' do circuito c1 → chave 'viajante-c1' → mesmo borne
    const borne_v = g.bornes.get('viajante-c1')
    expect(borne_v?.condutor_ids).toContain('v1')
    expect(borne_v?.condutor_ids).toContain('v2')
  })

  it('viajantes no mesmo borne: compartilhamento OK (mesmo circuito)', () => {
    const g = buildConnectionGraph([v1, v2])
    const borne_v = g.bornes.get('viajante-c1')
    expect(borne_v?.compartilhamento_ok).toBe(true)
  })
})
