// Validação — agrupamento de ILUM por grupo DECLARADO pelo engenheiro
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({
    comodos: [], circuitos_raw: [], circuitos_calc: [],
  } as any)
}

describe('Agrupamento de circuito ILUM por proximidade declarada', () => {
  beforeEach(() => resetStore())

  it('Cômodos com o MESMO grupo_circuito_ilum caem no mesmo circuito, mesmo não adjacentes na ordem de criação', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()

    // Ordem de criação PROPOSITALMENTE embaralhada em relação ao grupo:
    // Sala (grupo A) → Cozinha (sem grupo) → Quarto1 (grupo A) → Quarto2 (grupo A)
    addComodo({ nome: 'Sala', tipo: 'Social', area_m2: 20, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 150, tug_va: 600, grupo_circuito_ilum: 'Ala Social' } as any)
    addComodo({ nome: 'Cozinha', tipo: 'Cozinha', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 600 } as any)
    addComodo({ nome: 'Quarto1', tipo: 'Social', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 300, grupo_circuito_ilum: 'Ala Social' } as any)
    addComodo({ nome: 'Quarto2', tipo: 'Social', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 300, grupo_circuito_ilum: 'Ala Social' } as any)

    gerarCircuitosDeComodos()
    const { circuitos_raw } = useProjectStore.getState()
    const ilumCircs = circuitos_raw.filter(c => c.tipo === 'ILUM')

    console.log('Circuitos ILUM gerados:', ilumCircs.map(c => c.descricao))

    // Deve existir um circuito contendo Sala+Quarto1+Quarto2 (grupo "Ala Social")
    const circAlaSocial = ilumCircs.find(c => c.descricao.includes('Ala Social'))
    expect(circAlaSocial).toBeDefined()
    expect(circAlaSocial!.descricao).toContain('Sala')
    expect(circAlaSocial!.descricao).toContain('Quarto1')
    expect(circAlaSocial!.descricao).toContain('Quarto2')
    // Cozinha (sem grupo) NÃO deve estar nesse mesmo circuito
    expect(circAlaSocial!.descricao).not.toContain('Cozinha')

    // Cozinha deve ter caído no fallback automático, em circuito separado
    const circCozinha = ilumCircs.find(c => c.descricao.includes('Cozinha'))
    expect(circCozinha).toBeDefined()
    expect(circCozinha!.id).not.toBe(circAlaSocial!.id)
  })

  it('Sem nenhum grupo declarado → comportamento automático original preservado (agrupamento por ordem)', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'A', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 300 } as any)
    addComodo({ nome: 'B', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 300 } as any)
    gerarCircuitosDeComodos()
    const { circuitos_raw } = useProjectStore.getState()
    const ilumCircs = circuitos_raw.filter(c => c.tipo === 'ILUM')
    // Ambos sem grupo → devem cair no mesmo circuito automático (2 cômodos, dentro do limite de 3/800VA)
    expect(ilumCircs).toHaveLength(1)
    expect(ilumCircs[0].descricao).toContain('A')
    expect(ilumCircs[0].descricao).toContain('B')
  })
})
