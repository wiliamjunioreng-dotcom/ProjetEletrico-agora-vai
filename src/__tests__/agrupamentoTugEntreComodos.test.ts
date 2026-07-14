// Validação — agrupamento de TUG entre cômodos DIFERENTES via rótulo declarado
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({ comodos: [], circuitos_raw: [], circuitos_calc: [] } as any)
}

describe('Agrupamento de TUG entre cômodos — rótulo declarado', () => {
  beforeEach(resetStore)

  it('3 cômodos com o MESMO grupo_circuito_tug (dentro do teto de 800VA) → 1 único circuito TUG agrupado', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Quarto 1', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 200, grupo_circuito_tug: 'Ala Quartos' } as any)
    addComodo({ nome: 'Quarto 2', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 200, grupo_circuito_tug: 'Ala Quartos' } as any)
    addComodo({ nome: 'Quarto 3', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 200, grupo_circuito_tug: 'Ala Quartos' } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    expect(tugCircs).toHaveLength(1)
    expect(tugCircs[0].potencia_va).toBe(600)
    expect(tugCircs[0].descricao).toContain('Ala Quartos')
  })

  it('Grupo que excede 800VA se divide em mais de 1 circuito (mesmo teto do ILUM)', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Quarto 1', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 300, grupo_circuito_tug: 'Ala Quartos' } as any)
    addComodo({ nome: 'Quarto 2', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 300, grupo_circuito_tug: 'Ala Quartos' } as any)
    addComodo({ nome: 'Quarto 3', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 300, grupo_circuito_tug: 'Ala Quartos' } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    expect(tugCircs).toHaveLength(2)
    const totalVA = tugCircs.reduce((s, c) => s + c.potencia_va, 0)
    expect(totalVA).toBe(900)  // nada perdido, só dividido em 2 circuitos
  })

  it('Sem rótulo → comportamento original preservado (1 circuito TUG por cômodo)', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Sala', tipo: 'Social', area_m2: 20, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 0, tug_va: 600 } as any)
    addComodo({ nome: 'Cozinha', tipo: 'Cozinha', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 1800 } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    expect(tugCircs).toHaveLength(2)
  })

  it('Cômodos com rótulos DIFERENTES nunca se misturam', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Quarto 1', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 300, grupo_circuito_tug: 'Ala A' } as any)
    addComodo({ nome: 'Quarto 2', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 300, grupo_circuito_tug: 'Ala B' } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    expect(tugCircs).toHaveLength(2)
    expect(tugCircs.find(c => c.descricao.includes('Ala A'))).toBeDefined()
    expect(tugCircs.find(c => c.descricao.includes('Ala B'))).toBeDefined()
  })
})
