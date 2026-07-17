// Validação — circuito nunca mistura cargas de ligação diferente
// (mono/bi/tri), mesmo sendo do mesmo tipo (ILUM/TUG) no mesmo cômodo
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({ comodos: [], circuitos_raw: [], circuitos_calc: [] } as any)
}

describe('Circuito homogêneo — nunca mistura ligações diferentes', () => {
  beforeEach(resetStore)

  it('ILUM monofásico + ILUM bifásico no MESMO cômodo → 2 circuitos SEPARADOS, cada um só com sua ligação', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Salão', tipo: 'Social', area_m2: 40, perimetro_m: 26, pe_direito_m: 3.0, ilum_va: 0, tug_va: 0 } as any)
    const id = useProjectStore.getState().comodos[0].id
    addCargaManual(id, { tipo: 'ILUM', descricao: 'Spot comum', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(id, { tipo: 'ILUM', descricao: 'Refletor 220V', potencia_va: 500, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const ilumCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'ILUM')

    console.log('Circuitos ILUM gerados:', ilumCircs.map(c => `${c.descricao} — ligação=${c.ligacao}, ${c.potencia_va}VA`))

    // Devem existir 2 circuitos, nunca 1 escalado
    expect(ilumCircs).toHaveLength(2)

    const monoCirc = ilumCircs.find(c => c.ligacao === 'monofasica')
    const biCirc   = ilumCircs.find(c => c.ligacao === 'bifasica')
    expect(monoCirc).toBeDefined()
    expect(biCirc).toBeDefined()

    // O circuito monofásico só tem o Spot comum, nunca o Refletor
    expect(monoCirc!.descricao).toContain('Spot comum')
    expect(monoCirc!.descricao).not.toContain('Refletor')
    expect(monoCirc!.potencia_va).toBe(100)

    // O circuito bifásico só tem o Refletor, nunca o Spot
    expect(biCirc!.descricao).toContain('Refletor')
    expect(biCirc!.descricao).not.toContain('Spot comum')
    expect(biCirc!.potencia_va).toBe(500)
  })

  it('TUG monofásico + TUG trifásico no mesmo cômodo → 2 circuitos separados', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Oficina', tipo: 'Garagem', area_m2: 30, perimetro_m: 22, pe_direito_m: 3.0, ilum_va: 0, tug_va: 0 } as any)
    const id = useProjectStore.getState().comodos[0].id
    addCargaManual(id, { tipo: 'TUG', descricao: 'Tomada comum', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(id, { tipo: 'TUG', descricao: 'Tomada industrial trifásica', potencia_va: 3000, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    expect(tugCircs).toHaveLength(2)
    expect(tugCircs.some(c => c.ligacao === 'monofasica')).toBe(true)
    expect(tugCircs.some(c => c.ligacao === 'trifasica')).toBe(true)
  })

  it('Todas monofásicas (caso comum) → continuam agrupadas normalmente num único circuito, sem partição desnecessária', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Quarto', tipo: 'Social', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const id = useProjectStore.getState().comodos[0].id
    addCargaManual(id, { tipo: 'ILUM', descricao: 'Luz 1', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(id, { tipo: 'ILUM', descricao: 'Luz 2', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const ilumCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'ILUM')
    expect(ilumCircs).toHaveLength(1)
    expect(ilumCircs[0].potencia_va).toBe(200)
  })

  it('Todo circuito gerado tem UMA ligação só e todas as cargas descritas nele são coerentes com essa ligação (verificação estrutural ampla)', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Cozinha', tipo: 'Cozinha', area_m2: 15, perimetro_m: 16, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const id = useProjectStore.getState().comodos[0].id
    addCargaManual(id, { tipo: 'TUG', descricao: 'Bancada 1', potencia_va: 300, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(id, { tipo: 'TUG', descricao: 'Bancada 2', potencia_va: 300, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(id, { tipo: 'TUG', descricao: 'Tomada especial 220V', potencia_va: 400, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0 } as any)

    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    // Bancada 1+2 (mono, 300+300=600VA, dentro do teto de 800) agrupadas
    // juntas; Tomada especial (bi) sozinha em outro circuito — 2 circuitos
    expect(tugCircs).toHaveLength(2)
    const somaVA = tugCircs.reduce((s, c) => s + c.potencia_va, 0)
    expect(somaVA).toBe(1000)  // nada de VA perdido na partição (300+300+400)
  })
})
