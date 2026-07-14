// Validação — bug do contador de fase compartilhado (T sub-representada)
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore, fasesParaTipo } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({
    comodos: [], circuitos_raw: [], circuitos_calc: [],
    projeto: { ...useProjectStore.getState().projeto, sistema: 'Trifasico' },
  } as any)
}

describe('fasesParaTipo — fonte única, sem array duplicado', () => {
  it('Bifásico monofásica → R,S (não mais R,S,R com peso duplo pra R)', () => {
    const f = fasesParaTipo('monofasica', 'Bifasico')
    expect(f).toEqual(['R', 'S'])
  })
  it('Trifásico monofásica → R,S,T completo', () => {
    const f = fasesParaTipo('monofasica', 'Trifasico')
    expect(f).toEqual(['R', 'S', 'T'])
  })
})

describe('Fase T não é mais sub-representada — sistema Trifásico', () => {
  beforeEach(resetStore)

  it('Muitos circuitos ILUM automáticos (misturados com TUE trifásico no meio) → T aparece na proporção esperada', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()

    // Cria 9 cômodos simples com ILUM automático — sem cargas manuais,
    // agrupados de 3 em 3 → deve gerar 3 circuitos ILUM automáticos
    for (let i = 1; i <= 9; i++) {
      addComodo({
        nome: `Sala ${i}`, tipo: 'Social', area_m2: 10, perimetro_m: 14,
        pe_direito_m: 2.8, ilum_va: 100, tug_va: 300,
      } as any)
    }

    gerarCircuitosDeComodos()
    const ilumCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'ILUM')
    console.log('Fases ILUM geradas:', ilumCircs.map(c => c.fase))

    const fasesUsadas = new Set(ilumCircs.map(c => c.fase))
    // Com 3+ circuitos ILUM automáticos rotacionando por R/S/T, espera-se
    // ver as 3 fases representadas (não só R e S)
    expect(fasesUsadas.has('T')).toBe(true)
  })

  it('TUG automático também rotaciona corretamente por T (contador isolado do ILUM)', () => {
    const { addComodo, gerarCircuitosDeComodos } = useProjectStore.getState()
    for (let i = 1; i <= 6; i++) {
      addComodo({
        nome: `Quarto ${i}`, tipo: 'Social', area_m2: 10, perimetro_m: 14,
        pe_direito_m: 2.8, ilum_va: 100, tug_va: 300,
      } as any)
    }
    gerarCircuitosDeComodos()
    const tugCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'TUG')
    console.log('Fases TUG geradas:', tugCircs.map(c => c.fase))
    const fasesUsadas = new Set(tugCircs.map(c => c.fase))
    expect(fasesUsadas.has('T')).toBe(true)
  })

  it('Regressão do bug: um TUE trifásico intercalado não desalinha os ILUM manuais seguintes', () => {
    const { addComodo, addCargaManual, gerarCircuitosDeComodos } = useProjectStore.getState()

    // Cria um cômodo com: 1 TUE trifásico (consome fasesDisp de tamanho 1),
    // seguido de várias ILUM manuais em cômodos diferentes — no bug antigo,
    // o TUE trifásico "comia" um passo do contador compartilhado e
    // desalinhava a rotação R/S/T dos ILUM seguintes.
    addComodo({ nome: 'Oficina', tipo: 'Garagem', area_m2: 20, perimetro_m: 20, pe_direito_m: 3, ilum_va: 0, tug_va: 0 } as any)
    const oficinaId = useProjectStore.getState().comodos[0].id
    addCargaManual(oficinaId, { tipo: 'TUE', descricao: 'Motor trifásico', potencia_va: 3000, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0 } as any)

    for (let i = 1; i <= 6; i++) {
      addComodo({ nome: `Ambiente ${i}`, tipo: 'Social', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
      const id = useProjectStore.getState().comodos[useProjectStore.getState().comodos.length - 1].id
      addCargaManual(id, { tipo: 'ILUM', descricao: `Luz ${i}`, potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    }

    gerarCircuitosDeComodos()
    const ilumCircs = useProjectStore.getState().circuitos_raw.filter(c => c.tipo === 'ILUM')
    console.log('Fases ILUM (com TUE trifásico intercalado):', ilumCircs.map(c => c.fase))
    const fasesUsadas = new Set(ilumCircs.map(c => c.fase))
    expect(fasesUsadas.has('T')).toBe(true)
    expect(fasesUsadas.has('S')).toBe(true)
  })
})
