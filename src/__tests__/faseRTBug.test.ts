// Validação — 4º caso do mesmo bug de desalinhamento de fase, achado
// pelo usuário no teste da casa completa: contador de TUE/GERAL
// compartilhado entre mono/bi/tri nunca alcançava RT
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({
    comodos: [], circuitos_raw: [], circuitos_calc: [],
    projeto: { ...useProjectStore.getState().projeto, sistema: 'Trifasico' },
  } as any)
}

describe('TUE/GERAL individuais — rotação alcança RT (não só RS/ST)', () => {
  beforeEach(resetStore)

  it('Reproduz o cenário exato da casa completa: TUE bi intercalado com TUE tri e mono → RT aparece', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()

    // Mesma sequência que expôs o bug: bi, tri, mono, bi, bi, mono
    addComodo({ nome: 'C1', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    addCargaManual(useProjectStore.getState().comodos[0].id, { tipo: 'TUE', descricao: 'AC1', potencia_va: 1200, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)

    addComodo({ nome: 'C2', tipo: 'Cozinha', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.7, ilum_va: 0, tug_va: 0 } as any)
    addCargaManual(useProjectStore.getState().comodos[1].id, { tipo: 'TUE', descricao: 'Forno', potencia_va: 6500, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0 } as any)

    addComodo({ nome: 'C3', tipo: 'Lavanderia', area_m2: 6, perimetro_m: 10, pe_direito_m: 2.7, ilum_va: 0, tug_va: 0 } as any)
    addCargaManual(useProjectStore.getState().comodos[2].id, { tipo: 'TUE', descricao: 'Máquina', potencia_va: 1500, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    addComodo({ nome: 'C4', tipo: 'Social', area_m2: 18, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    addCargaManual(useProjectStore.getState().comodos[3].id, { tipo: 'TUE', descricao: 'AC2', potencia_va: 900, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)

    addComodo({ nome: 'C5', tipo: 'Banho', area_m2: 6, perimetro_m: 10, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)
    addCargaManual(useProjectStore.getState().comodos[4].id, { tipo: 'TUE', descricao: 'Chuveiro', potencia_va: 7500, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)

    addComodo({ nome: 'C6', tipo: 'Garagem', area_m2: 20, perimetro_m: 18, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)
    addCargaManual(useProjectStore.getState().comodos[5].id, { tipo: 'TUE', descricao: 'Motor', potencia_va: 750, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const tueCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUE')
    const fasesBi = tueCircs.filter(c => c.ligacao === 'bifasica').map(c => c.fase)
    console.log('Fases dos 3 TUEs bifásicos:', fasesBi)

    // As 3 fases bifásicas (RS, ST, RT) devem estar TODAS representadas
    // entre os 3 TUEs bifásicos — antes do fix, sempre caía em RS/ST,
    // nunca RT, porque um TUE trifásico intercalado desalinhava o
    // contador compartilhado.
    expect(new Set(fasesBi)).toEqual(new Set(['RS', 'ST', 'RT']))
  })

  it('Contadores por ligação são realmente independentes — TUE trifásico não afeta a rotação dos bifásicos', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    // 3 TUEs bifásicos puros, sem nenhum tri/mono intercalado — controle
    for (let i = 1; i <= 3; i++) {
      addComodo({ nome: `Sala ${i}`, tipo: 'Social', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
      const id = useProjectStore.getState().comodos[useProjectStore.getState().comodos.length - 1].id
      addCargaManual(id, { tipo: 'TUE', descricao: `AC ${i}`, potencia_va: 1000, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)
    }
    gerarCircuitosDeComodos()
    const fasesBi = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUE').map(c => c.fase)
    expect(new Set(fasesBi)).toEqual(new Set(['RS', 'ST', 'RT']))
  })
})
