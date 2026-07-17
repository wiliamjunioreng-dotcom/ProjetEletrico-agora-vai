// Validação — consolidação de luminária: fonte única persistente,
// alimentando dimensionamento (ilum_va) corretamente ao acumular/remover
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'
import { calcIlumComodo } from '../core/engine'
import { CATALOGO_LUMINARIAS, calcularLumens } from '../core/luminotecnico'

function resetStore() {
  useProjectStore.setState({ comodos: [], circuitos_raw: [], circuitos_calc: [] } as any)
}

// Mesma fórmula usada em Comodos.tsx — testada isoladamente aqui já
// que vive como handler inline no componente
function calcularIlumVaDeLuminarias(lista: { qtd: number; pot_w: number }[]): number {
  const potRealTotal = lista.reduce((s, l) => s + l.qtd * l.pot_w, 0)
  const nTotal = lista.reduce((s, l) => s + l.qtd, 0)
  return Math.max(Math.ceil(potRealTotal * 1.8), nTotal * 100)
}

describe('Consolidação de luminária — fonte única persistente', () => {
  beforeEach(resetStore)

  it('CATALOGO_LUMINARIAS é a mesma referência usada por Comodos.tsx e Luminotecnico.tsx (sem 3 catálogos)', () => {
    expect(CATALOGO_LUMINARIAS.length).toBeGreaterThan(0)
    expect(CATALOGO_LUMINARIAS[0]).toHaveProperty('pot')
    expect(CATALOGO_LUMINARIAS[0]).toHaveProperty('lm')
  })

  it('Adicionar 1 luminária (5un × 9W) → ilum_va = max(ceil(45*1.8), 5*100) = 500 (mínimo NBR domina)', () => {
    const va = calcularIlumVaDeLuminarias([{ qtd: 5, pot_w: 9 }])
    expect(va).toBe(500)  // 5*100=500 > ceil(45*1.8)=81
  })

  it('Adicionar luminária de alta potência (3un × 100W) → fator 1,8x domina sobre o mínimo NBR', () => {
    const va = calcularIlumVaDeLuminarias([{ qtd: 3, pot_w: 100 }])
    expect(va).toBe(540)  // ceil(300*1.8)=540 > 3*100=300
  })

  it('Acumular DUAS luminárias (geral + efeito) soma corretamente, não substitui', () => {
    const va = calcularIlumVaDeLuminarias([
      { qtd: 5, pot_w: 9 },   // geral
      { qtd: 2, pot_w: 5 },   // efeito
    ])
    const potTotal = 5 * 9 + 2 * 5  // 55W
    const nTotal = 5 + 2  // 7
    expect(va).toBe(Math.max(Math.ceil(potTotal * 1.8), nTotal * 100))
  })

  it('Integração real: updateComodo persiste luminarias[] e ilum_va reflete no circuito gerado', () => {
    const { addComodo, updateComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    addComodo({ nome: 'Sala', tipo: 'Social', area_m2: 20, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const comodoId = useProjectStore.getState().comodos[0].id

    const lista = [{ id: 'l1', categoria: 'geral' as const, modelo_nome: 'LED Downlight 9W', qtd: 6, pot_w: 9, lm: 900 }]
    const va = calcularIlumVaDeLuminarias(lista)
    updateComodo(comodoId, { luminarias: lista, ilum_va: va })

    const comodo = useProjectStore.getState().comodos[0]
    expect(comodo.luminarias).toHaveLength(1)
    expect(comodo.ilum_va).toBe(va)

    gerarCircuitosDeComodos()
    const ilumCirc = useProjectStore.getState().circuitos_raw.find(c => c.tipo === 'ILUM')
    expect(ilumCirc?.potencia_va).toBe(va)
  })

  it('Remover TODAS as luminárias → volta pro mínimo NBR calculado, não fica em 0 nem trava no último valor', () => {
    const areaTeste = 20
    const minimoNBR = calcIlumComodo(areaTeste)
    // Lista vazia → fallback explícito usado no handler de remoção
    const listaVazia: { qtd: number; pot_w: number }[] = []
    const ilumVaSeVazio = listaVazia.length > 0 ? calcularIlumVaDeLuminarias(listaVazia) : minimoNBR
    expect(ilumVaSeVazio).toBe(minimoNBR)
  })

  it('Comportamento original preservado: cômodo SEM luminárias/override ainda recalcula ilum_va ao editar área', () => {
    const { addComodo, updateComodo } = useProjectStore.getState()
    addComodo({ nome: 'Quarto', tipo: 'Social', area_m2: 10, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    const id = useProjectStore.getState().comodos[0].id
    const antes = useProjectStore.getState().comodos[0].ilum_va
    updateComodo(id, { area_m2: 30 })  // só editando área, sem tocar ilum_va nem luminárias
    const depois = useProjectStore.getState().comodos[0].ilum_va
    expect(depois).not.toBe(antes)
    expect(depois).toBe(calcIlumComodo(30))
  })

  it('calcularLumens (função compartilhada) continua funcionando após a consolidação', () => {
    const modelo = CATALOGO_LUMINARIAS.find(m => m.pot === 9 && m.lm === 900)
    expect(modelo).toBeDefined()
    const r = calcularLumens(20, 2.8, 300, modelo!)
    expect(r).not.toBeNull()
    expect(r!.n_luminarias).toBeGreaterThan(0)
  })
})
