// src/__tests__/protectionOptimization.test.ts
import { describe, it, expect } from 'vitest'
import { otimizarProtecao } from '../core/protectionOptimization'
import { comprimentoMaximo } from '../core/minFaultCurrentAnalysis'

// Circuito problemático: longo demais para o disjuntor atuar
function circuitoProblematico() {
  // 1.5mm²/220V/curva C/16A → comprimento limite ≈ 50m
  // Usar 80m → falha
  const lim = comprimentoMaximo(1.5, 1.5, 220, 'PVC', 'C', 16)
  return {
    comprimento: lim.comprimento_max_m + 20,  // além do limite
    tensao: 220, secao_fase: 1.5, secao_pe: 1.5,
    isolacao: 'PVC', curva: 'C' as const, in_a: 16,
  }
}

describe('otimizarProtecao — circuito já correto', () => {

  it('circuito OK: retorna sem opções de correção', () => {
    const r = otimizarProtecao('c1','p1', 220, 2.5, 2.5, 20, 'PVC', 'C', 16)
    expect(r.opcoes).toHaveLength(0)
    expect(r.impossivel).toBe(false)
  })
})

describe('otimizarProtecao — circuito problemático', () => {

  it('retorna opções de correção', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    expect(r.opcoes.length).toBeGreaterThan(0)
    expect(r.problema_orig.protecao_funcional).toBe(false)
  })

  it('ao menos uma opção resolve o problema', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    const resolve = r.opcoes.filter(o => o.resolve)
    expect(resolve.length).toBeGreaterThan(0)
  })

  it('melhor_opcao está definida', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    expect(r.melhor_opcao).toBeDefined()
    expect(r.melhor_opcao?.resolve).toBe(true)
  })

  it('opção AUMENTAR_SECAO: nova_analise mostra protecao_funcional=true', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    const opt = r.opcoes.find(o => o.tipo === 'AUMENTAR_SECAO')
    if (opt?.nova_analise) {
      expect(opt.nova_analise.protecao_funcional).toBe(true)
      expect(opt.nova_analise.icc_min_a).toBeGreaterThan(opt.nova_analise.ia_min_a)
    }
  })

  it('opção ADICIONAR_DR sempre presente (resolve por corrente diferencial)', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    const dr = r.opcoes.find(o => o.tipo === 'ADICIONAR_DR')
    expect(dr).toBeDefined()
    expect(dr?.resolve).toBe(true)
    // DR tem riscos documentados
    expect(dr?.riscos.length).toBeGreaterThan(0)
  })

  it('opção TROCAR_CURVA: se curva D → sugere curva C ou B', () => {
    // Criar circuito com curva D que falha
    const lim_d = comprimentoMaximo(1.5, 1.5, 220, 'PVC', 'D', 16)
    const r = otimizarProtecao('c1','p1', 220, 1.5, 1.5,
      lim_d.comprimento_max_m + 5, 'PVC', 'D', 16)
    const opt = r.opcoes.find(o => o.tipo === 'TROCAR_CURVA')
    if (opt) {
      // Curva sugerida deve ser menor que D
      const nova_curva = opt.parametros_depois['curva'] as string
      expect(['B','C']).toContain(nova_curva)
    }
  })

  it('opções ordenadas por prioridade crescente', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    for (let i = 1; i < r.opcoes.length; i++) {
      expect(r.opcoes[i].prioridade).toBeGreaterThan(r.opcoes[i-1].prioridade)
    }
  })

  it('opção AUMENTAR_SECAO tem novo cabo maior que o atual', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    const opt = r.opcoes.find(o => o.tipo === 'AUMENTAR_SECAO')
    if (opt) {
      const secao_depois = Number(opt.parametros_depois['secao_mm2'])
      expect(secao_depois).toBeGreaterThan(p.secao_fase)
    }
  })

  it('opção mais barata é TROCAR_CURVA ou AUMENTAR_SECAO pequena', () => {
    const p = circuitoProblematico()
    const r = otimizarProtecao('c1','p1', p.tensao, p.secao_fase, p.secao_pe,
      p.comprimento, p.isolacao, p.curva, p.in_a)
    const que_resolve = r.opcoes.filter(o => o.resolve)
    const custos = que_resolve.map(o => o.custo_relativo)
    // Deve ter pelo menos uma opção 'BAIXO' ou 'MEDIO'
    expect(custos.some(c => c === 'BAIXO' || c === 'MEDIO')).toBe(true)
  })
})
