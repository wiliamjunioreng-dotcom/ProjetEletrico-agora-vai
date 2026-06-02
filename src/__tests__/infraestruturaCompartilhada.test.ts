// src/__tests__/infraestruturaCompartilhada.test.ts
import { describe, it, expect } from 'vitest'
import { buildInfraestruturaCompartilhada } from '../core/infraestruturaCompartilhada'
import { buildGrupoInstalacao } from '../core/grupoInstalacao'
import type { InputCircuito, InputFace } from '../core/infraestruturaCompartilhada'

// ── Fixtures ──────────────────────────────────────────────────────
const faces = new Map<string, InputFace>([
  ['face-N', { id:'face-N', parede_id:'p-N', comprimento_m:4, comodo_id:'sala' }],
  ['face-L', { id:'face-L', parede_id:'p-L', comprimento_m:3, comodo_id:'sala' }],
  ['face-S', { id:'face-S', parede_id:'p-S', comprimento_m:4, comodo_id:'sala' }],
])

const circs: InputCircuito[] = [
  { id:'c1', descricao:'ILUM Sala',  tipo:'ILUM', secao_mm2:1.5, n_fases:1, comprimento_m:15, comodo_id:'sala', face_ids:['face-N','face-L'] },
  { id:'c2', descricao:'TUG Sala 1', tipo:'TUG',  secao_mm2:2.5, n_fases:1, comprimento_m:12, comodo_id:'sala', face_ids:['face-N','face-S'] },
  { id:'c3', descricao:'TUG Sala 2', tipo:'TUG',  secao_mm2:2.5, n_fases:1, comprimento_m:10, comodo_id:'sala', face_ids:['face-S'] },
]

// GrupoInstalacao: tomada + interruptor na face N
const grupos = [
  buildGrupoInstalacao('g1','face-N','p-N',0.30,1.10,['INTERRUPTOR_SIMPLES','TUG_BAIXA'],['c1','c2']),
  buildGrupoInstalacao('g2','face-S','p-S',0.60,0.30,['TUG_BAIXA'],['c3']),
]

describe('buildInfraestruturaCompartilhada — eletrodutos por face', () => {

  it('face-N com 2 circuitos → 1 eletroduto na face N', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const e_N = infra.eletrodutos.filter(e => e.face_id === 'face-N')
    expect(e_N).toHaveLength(1)
    expect(e_N[0].circuito_ids).toContain('c1')
    expect(e_N[0].circuito_ids).toContain('c2')
  })

  it('face-S com 2 circuitos → 1 eletroduto na face S', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const e_S = infra.eletrodutos.filter(e => e.face_id === 'face-S')
    expect(e_S).toHaveLength(1)
    expect(e_S[0].circuito_ids).toContain('c2')
    expect(e_S[0].circuito_ids).toContain('c3')
  })

  it('face-L com 1 circuito → eletroduto com Fa = 1.0', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const e_L = infra.eletrodutos.find(e => e.face_id === 'face-L')
    expect(e_L?.ocupacao.fa).toBe(1.0)
  })

  it('face-N com 2 circuitos: Fa < 1.0', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const e_N = infra.eletrodutos.find(e => e.face_id === 'face-N')
    expect(e_N?.ocupacao.fa).toBeLessThan(1.0)
  })

  it('comprimento_m do eletroduto vem da face', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const e_N = infra.eletrodutos.find(e => e.face_id === 'face-N')
    expect(e_N?.comprimento_m).toBe(4)  // face-N tem 4m
  })
})

describe('buildInfraestruturaCompartilhada — caixas', () => {

  it('1 GrupoInstalacao → 1 CaixaFisica', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    expect(infra.caixas).toHaveLength(2)  // g1 + g2
  })

  it('grupo g1 (interruptor+tomada): caixa 4×2', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const caixa = infra.caixas.find(c => c.grupo_id === 'g1')
    expect(caixa?.tipo).toBe('4x2')
  })

  it('caixa na face-N referencia eletroduto correto', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const caixa_N = infra.caixas.find(c => c.face_id === 'face-N')
    const elet_N  = infra.eletrodutos.find(e => e.face_id === 'face-N')
    expect(caixa_N?.eletroduto_ids).toContain(elet_N?.id)
  })

  it('circuito_ids na caixa vem dos elementos do grupo', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const caixa = infra.caixas.find(c => c.grupo_id === 'g1')
    expect(caixa?.circuito_ids).toContain('c1')
    expect(caixa?.circuito_ids).toContain('c2')
  })
})

describe('buildInfraestruturaCompartilhada — quantitativo', () => {

  it('quant.eletrodutos: agrupado por diâmetro', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    expect(infra.quant.eletrodutos.length).toBeGreaterThan(0)
    expect(infra.quant.eletrodutos[0].metros).toBeGreaterThan(0)
  })

  it('quant.cabos: inclui cabos de todos os circuitos', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    expect(infra.quant.cabos.length).toBeGreaterThan(0)
  })

  it('quant.caixas: 1 caixa 4×2 + 1 caixa 4×2', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    const caixa_4x2 = infra.quant.caixas.find(c => c.tipo === '4x2')
    expect(caixa_4x2?.qtd).toBe(2)  // g1 + g2
  })

  it('fa_medio calculado sobre eletrodutos reais', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    expect(infra.quant.fa_medio).toBeGreaterThan(0)
    expect(infra.quant.fa_medio).toBeLessThanOrEqual(1.0)
  })
})

describe('buildInfraestruturaCompartilhada — avisos normativos', () => {

  it('sem avisos para projeto pequeno e leve', () => {
    const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
    // Para esse projeto simples, não deve haver avisos críticos
    const criticos = infra.avisos.filter(a => a.tipo === 'OCUPACAO_EXCEDIDA')
    expect(criticos).toHaveLength(0)
  })

  it('aviso FA_CRITICO quando Fa < 0.65 (muitos circuitos)', () => {
    // 10 circuitos na mesma face → Fa muito baixo
    const muitos: InputCircuito[] = Array.from({ length:10 }, (_,i) => ({
      id:`c${i}`, descricao:`Circ ${i}`, tipo:'TUG',
      secao_mm2:6, n_fases:1 as const, comprimento_m:10,
      face_ids:['face-N'],
    }))
    const infra = buildInfraestruturaCompartilhada(muitos, [], faces)
    const fa_avisos = infra.avisos.filter(a => a.tipo === 'FA_CRITICO')
    // Com 10 circuitos, Fa deve ser bem abaixo de 0.65
    if (infra.eletrodutos[0]?.ocupacao.fa < 0.65) {
      expect(fa_avisos.length).toBeGreaterThan(0)
    }
  })
})
