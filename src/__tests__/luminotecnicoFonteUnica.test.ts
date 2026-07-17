// Validação — derivação de dimensões a partir de área+perímetro reais
// do cômodo (substitui aproximação de proporção fixa 1,4:1)
import { describe, it, expect } from 'vitest'
import { derivarDimensoes } from '../pages/Luminotecnico'

describe('derivarDimensoes — resolve comp/larg a partir de área+perímetro reais', () => {
  it('Sala 4×5m: área=20m², perímetro=18m → deriva 5×4 exatamente', () => {
    const { comp, larg } = derivarDimensoes(20, 18)
    const par = [comp, larg].sort((a, b) => a - b)
    expect(par).toEqual([4, 5])
  })

  it('Sala quadrada 6×6m: área=36m², perímetro=24m → deriva 6×6', () => {
    const { comp, larg } = derivarDimensoes(36, 24)
    expect(comp).toBeCloseTo(6, 1)
    expect(larg).toBeCloseTo(6, 1)
  })

  it('Corredor estreito 2×10m: área=20m², perímetro=24m → deriva 10×2', () => {
    const { comp, larg } = derivarDimensoes(20, 24)
    const par = [comp, larg].sort((a, b) => a - b)
    expect(par[0]).toBeCloseTo(2, 1)
    expect(par[1]).toBeCloseTo(10, 1)
  })

  it('Perímetro geometricamente impossível para a área (caso degenerado) → cai para raiz quadrada, não quebra', () => {
    const { comp, larg } = derivarDimensoes(100, 10)  // impossível: mín. perímetro p/ 100m² é 40m (quadrado)
    expect(comp).toBeCloseTo(10, 1)
    expect(larg).toBeCloseTo(10, 1)
    expect(Number.isFinite(comp)).toBe(true)
    expect(Number.isFinite(larg)).toBe(true)
  })

  it('comp × larg reproduz a área original (verificação de consistência matemática)', () => {
    const { comp, larg } = derivarDimensoes(15, 16)
    expect(comp * larg).toBeCloseTo(15, 0)
  })
})
