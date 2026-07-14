// Validação — Fator de Manutenção dinâmico, Anexo D NBR ISO/CIE 8995-1
import { describe, it, expect } from 'vitest'
import { getFatorManutencao } from '../data/nbr5410tables'
import { calcLuminotecnico } from '../core/engine'
import type { LuminoInput } from '../core/engine'

describe('getFatorManutencao — Anexo D', () => {
  it('Sem declaração → 0,80 (default histórico, cenário otimista)', () => {
    expect(getFatorManutencao(undefined)).toBe(0.80)
  })
  it('muito_limpo → 0,80', () => {
    expect(getFatorManutencao('muito_limpo')).toBe(0.80)
  })
  it('normal (escritório padrão, limpeza 3 anos) → 0,67', () => {
    expect(getFatorManutencao('normal')).toBe(0.67)
  })
  it('normal_maior_acumulo → 0,57', () => {
    expect(getFatorManutencao('normal_maior_acumulo')).toBe(0.57)
  })
  it('sujo → 0,50', () => {
    expect(getFatorManutencao('sujo')).toBe(0.50)
  })
})

describe('Integração — calcLuminotecnico com FM realista', () => {
  const base: LuminoInput = {
    area_m2: 40, pe_direito_m: 2.8, h_plano_trabalho: 0.75,
    iluminancia_lux: 500, refl_teto: 0.7, refl_parede: 0.5, refl_piso: 0.2,
    luminaria_lm: 3000, luminaria_pot_w: 30,
  }

  it('FM menor (ambiente sujo) exige MAIS luminárias que o default otimista', () => {
    const otimista = calcLuminotecnico(8, 5, base)
    const realista  = calcLuminotecnico(8, 5, { ...base, condicao_ambiente_fm: 'sujo' })
    console.log('Otimista (FM=0,80):', otimista.n_luminarias, 'luminárias')
    console.log('Realista (FM=0,50, sujo):', realista.n_luminarias, 'luminárias')
    expect(realista.n_luminarias).toBeGreaterThan(otimista.n_luminarias)
  })

  it('FM afeta diretamente o campo fm retornado', () => {
    const r = calcLuminotecnico(8, 5, { ...base, condicao_ambiente_fm: 'normal' })
    expect(r.fm).toBe(0.67)
  })
})
