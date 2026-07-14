// Validação — consolidação do sistema de carga manual (fim da duplicação
// TUE isolado vs carga manual genérica) + agrupamento por natureza
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({ comodos: [], circuitos_raw: [], circuitos_calc: [] } as any)
}

describe('Agrupamento por natureza — ILUM/TUG acoplados, TUE sempre individual', () => {
  beforeEach(() => resetStore())

  it('2 ILUM manuais no mesmo cômodo → 1 único circuito agrupado', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Sala', tipo: 'Social', area_m2: 20, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const { comodos } = useProjectStore.getState()
    const salaId = comodos[0].id
    addCargaManual(salaId, { tipo: 'ILUM', descricao: 'Spot 1', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(salaId, { tipo: 'ILUM', descricao: 'Spot 2', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const ilumCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'ILUM')
    expect(ilumCircs).toHaveLength(1)
    expect(ilumCircs[0].potencia_va).toBe(200)
    expect(ilumCircs[0].descricao).toContain('Spot 1')
    expect(ilumCircs[0].descricao).toContain('Spot 2')
  })

  it('3 TUG manuais no mesmo cômodo → 1 único circuito agrupado (soma VA)', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Cozinha', tipo: 'Cozinha', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const salaId = useProjectStore.getState().comodos[0].id
    addCargaManual(salaId, { tipo: 'TUG', descricao: 'Tomada 1', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(salaId, { tipo: 'TUG', descricao: 'Tomada 2', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(salaId, { tipo: 'TUG', descricao: 'Tomada 3', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    expect(tugCircs).toHaveLength(1)
    expect(tugCircs[0].potencia_va).toBe(300)
  })

  it('2 TUE manuais no mesmo cômodo → 2 circuitos SEPARADOS (nunca agrupados)', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Área Serviço', tipo: 'Lavanderia', area_m2: 6, perimetro_m: 10, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const salaId = useProjectStore.getState().comodos[0].id
    addCargaManual(salaId, { tipo: 'TUE', descricao: 'Máquina de lavar', potencia_va: 1800, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)
    addCargaManual(salaId, { tipo: 'TUE', descricao: 'Secadora', potencia_va: 2200, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'resistivo' } as any)

    gerarCircuitosDeComodos()
    const tueCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUE')
    expect(tueCircs).toHaveLength(2)
  })

  it('TUE com tipo_carga="motor" via carga manual injeta a dica de curva na descrição (mesmo padrão do array tues[] legado)', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Garagem', tipo: 'Garagem', area_m2: 15, perimetro_m: 16, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const salaId = useProjectStore.getState().comodos[0].id
    addCargaManual(salaId, { tipo: 'TUE', descricao: 'Motor portão', potencia_va: 750, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)

    gerarCircuitosDeComodos()
    const tueCirc = useProjectStore.getState().circuitos_raw.find(c => c.tipo === 'TUE')
    expect(tueCirc?.descricao).toContain('(motor)')
  })

  it('Fase bifásica declarada numa carga do grupo ILUM força o circuito INTEIRO a ser bifásico', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Salão', tipo: 'Social', area_m2: 40, perimetro_m: 30, pe_direito_m: 3.0, ilum_va: 0, tug_va: 0 } as any)
    const salaId = useProjectStore.getState().comodos[0].id
    addCargaManual(salaId, { tipo: 'ILUM', descricao: 'Spot comum', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(salaId, { tipo: 'ILUM', descricao: 'Refletor 220V', potencia_va: 500, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const ilumCirc = useProjectStore.getState().circuitos_raw.find(c => c.tipo === 'ILUM')
    expect(ilumCirc?.ligacao).toBe('bifasica')
  })
})
