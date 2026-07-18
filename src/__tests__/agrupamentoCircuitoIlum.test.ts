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

  it('DECISÃO DE DESIGN REVISADA: sem rótulo declarado, cômodos NUNCA se agrupam automaticamente entre si', () => {
    // Comportamento ANTERIOR: cômodos sem grupo_circuito_ilum ainda
    // caíam num agrupamento automático por ORDEM DE CRIAÇÃO (até 3
    // cômodos/800VA) — um fallback "de conveniência". Removido na
    // unificação do agrupamento ILUM/TUG (mesma mudança que corrigiu
    // o bug de cômodos com carga manual nunca respeitarem o rótulo
    // declarado). Ordem de criação no formulário não tem NENHUMA
    // relação com proximidade física real — agrupar por isso é uma
    // heurística arbitrária que podia juntar ILUM de dois cômodos
    // longe um do outro só porque foram cadastrados em sequência,
    // dando falsa sensação de otimização. Contradiz o princípio que
    // o próprio usuário estabeleceu: "o programa não tem visão da
    // planta, quem decide o que agrupar é o engenheiro". Sem rótulo
    // declarado agora = sem agrupamento automático, ponto — cada
    // cômodo vira seu próprio circuito, comportamento previsível.
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'A', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 300 } as any)
    addComodo({ nome: 'B', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 100, tug_va: 300 } as any)
    gerarCircuitosDeComodos()
    const { circuitos_raw } = useProjectStore.getState()
    const ilumCircs = circuitos_raw.filter(c => c.tipo === 'ILUM')
    expect(ilumCircs).toHaveLength(2)
    expect(ilumCircs.find(c => c.descricao.includes('A'))).toBeDefined()
    expect(ilumCircs.find(c => c.descricao.includes('B'))).toBeDefined()
  })

  it('NOVO: cômodo com carga manual (ex: TUE) TAMBÉM respeita o rótulo de ILUM/TUG — o bug real corrigido', () => {
    // Reproduz o achado do teste da casa completa: "Sala de Estar" e
    // "Sala de Jantar" com o MESMO grupo_circuito_ilum, mas AMBAS com
    // cargas manuais de outros tipos (TUG, TUE) — antes, isso as
    // excluía inteiramente do agrupamento por rótulo. Agora não.
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Sala Estar', tipo: 'Social', area_m2: 24, perimetro_m: 20, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Área Social' } as any)
    addComodo({ nome: 'Sala Jantar', tipo: 'Social', area_m2: 14, perimetro_m: 15, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Área Social' } as any)
    const ids = useProjectStore.getState().comodos.map(c => c.id)
    addCargaManual(ids[0], { tipo: 'ILUM', descricao: 'Plafon sala estar', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(ids[0], { tipo: 'TUE', descricao: 'AC sala', potencia_va: 1200, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(ids[1], { tipo: 'ILUM', descricao: 'Pendente jantar', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const { circuitos_raw } = useProjectStore.getState()
    const ilumCircs = circuitos_raw.filter(c => c.tipo === 'ILUM')
    // As duas ILUM (de cômodos DIFERENTES, cada um com carga manual de
    // outro tipo também) devem cair no MESMO circuito, pelo rótulo
    expect(ilumCircs).toHaveLength(1)
    expect(ilumCircs[0].descricao).toContain('Plafon sala estar')
    expect(ilumCircs[0].descricao).toContain('Pendente jantar')
    expect(ilumCircs[0].potencia_va).toBe(250)
    // TUE nunca agrupa, sempre vira seu próprio circuito
    const tueCircs = circuitos_raw.filter(c => c.tipo === 'TUE')
    expect(tueCircs).toHaveLength(1)
  })
})
