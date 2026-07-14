// Validação — §6.2.5.6.1, fator 0,86 por 3ª harmônica em trifásico c/ neutro
import { describe, it, expect } from 'vitest'
import { getFatorHarmonica } from '../data/nbr5410tables'
import { dimensionarCircuito } from '../core/engine'
import type { CircuitInput } from '../core/engine'

describe('getFatorHarmonica — §6.2.5.6.1', () => {
  it('Sem declaração → fator neutro (1.0)', () => {
    expect(getFatorHarmonica(undefined, 'RST')).toBe(1.0)
  })
  it('Trifásico com 20% de 3ª harmônica (>15%) → 0,86', () => {
    expect(getFatorHarmonica(20, 'RST')).toBe(0.86)
  })
  it('Trifásico com 10% (≤15%) → sem correção', () => {
    expect(getFatorHarmonica(10, 'RST')).toBe(1.0)
  })
  it('Monofásico (R) mesmo com harmônica alta → NÃO aplica (regra é para RST)', () => {
    expect(getFatorHarmonica(50, 'R')).toBe(1.0)
  })
  it('Bifásico (RS) mesmo com harmônica alta → NÃO aplica', () => {
    expect(getFatorHarmonica(50, 'RS')).toBe(1.0)
  })
})

describe('Integração — dimensionarCircuito com harmônica alta', () => {
  const base: CircuitInput = {
    id: 'x', descricao: 'Alimentador iluminação LED prédio', potencia_va: 15000,
    fase: 'RST', comprimento_m: 30, n_agrup: 1, tipo: 'GERAL',
    v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
    t_amb: 30, du_max: 4, du_ramal: 0.5,
  }

  it('Circuito trifásico com harmônica alta exige seção IGUAL OU MAIOR (nunca menor) que sem declarar', () => {
    // O fator 0,86 reduz a capacidade efetiva do cabo — o sistema deve
    // compensar subindo a seção automaticamente (mesmo mecanismo de
    // escalonamento já usado para ΔU e tripartida), nunca aceitar uma
    // seção menor. Esta é a verificação de segurança real: o resultado
    // final nunca fica mais permissivo por causa da harmônica.
    const sem = dimensionarCircuito(base)
    const com = dimensionarCircuito({ ...base, terceira_harmonica_pct: 30 })
    console.log('Seção sem harmônica:', sem.secao_fase, 'mm² (Iz-ef=', sem.iz_efetiva, ')')
    console.log('Seção com 30% harmônica:', com.secao_fase, 'mm² (Iz-ef=', com.iz_efetiva, ')')
    expect(com.secao_fase).toBeGreaterThanOrEqual(sem.secao_fase)
  })

  // Nota: uma segunda verificação tentando isolar o fator "puro" via
  // override_secao_mm2 foi descartada — o override não impede o
  // escalonamento interno de rodar primeiro com valores diferentes de
  // seção em cada caso, então não isola de fato a mesma base de
  // comparação. O efeito direto da fórmula já está coberto pelos
  // testes unitários de getFatorHarmonica() acima; o teste de
  // integração relevante é o de cima (seção final nunca diminui).
})
