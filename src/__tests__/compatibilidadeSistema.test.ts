// Validação — sistema (fases disponíveis) vs ligação da carga (fases pedidas)
import { describe, it, expect } from 'vitest'
import { sistemaSuportaLigacao, verificarCompatibilidadeSistema, fasesParaTipo } from '../store/projectStore'

describe('sistemaSuportaLigacao — carga nunca pode pedir mais fases do que existem', () => {
  it('Monofásico suporta carga monofásica', () => {
    expect(sistemaSuportaLigacao('Monofasico', 'monofasica')).toBe(true)
  })
  it('Monofásico NÃO suporta carga bifásica (só 1 fase existe)', () => {
    expect(sistemaSuportaLigacao('Monofasico', 'bifasica')).toBe(false)
  })
  it('Monofásico NÃO suporta carga trifásica', () => {
    expect(sistemaSuportaLigacao('Monofasico', 'trifasica')).toBe(false)
  })
  it('Bifásico suporta mono e bi, não tri', () => {
    expect(sistemaSuportaLigacao('Bifasico', 'monofasica')).toBe(true)
    expect(sistemaSuportaLigacao('Bifasico', 'bifasica')).toBe(true)
    expect(sistemaSuportaLigacao('Bifasico', 'trifasica')).toBe(false)
  })
  it('Trifásico suporta qualquer ligação — é o "cardápio" completo', () => {
    expect(sistemaSuportaLigacao('Trifasico', 'monofasica')).toBe(true)
    expect(sistemaSuportaLigacao('Trifasico', 'bifasica')).toBe(true)
    expect(sistemaSuportaLigacao('Trifasico', 'trifasica')).toBe(true)
  })
})

describe('verificarCompatibilidadeSistema — varredura retroativa do projeto', () => {
  it('Projeto Trifásico com cargas mono/bi/tri misturadas → nenhum problema (comportamento correto do usuário)', () => {
    const comodos = [{
      nome: 'Cozinha',
      cargas_manuais: [
        { descricao: 'Luz', fase: 'mono' as const },
        { descricao: 'Chuveiro', fase: 'bi' as const },
        { descricao: 'Motor grande', fase: 'tri' as const },
      ],
      tues: [],
    }]
    const problemas = verificarCompatibilidadeSistema(comodos, 'Trifasico')
    expect(problemas).toHaveLength(0)
  })

  it('Projeto Monofásico com uma carga bifásica cadastrada → pega o problema', () => {
    const comodos = [{
      nome: 'Banheiro',
      cargas_manuais: [{ descricao: 'Chuveiro 220V', fase: 'bi' as const }],
      tues: [],
    }]
    const problemas = verificarCompatibilidadeSistema(comodos, 'Monofasico')
    expect(problemas).toHaveLength(1)
    expect(problemas[0].carga).toBe('Chuveiro 220V')
  })

  it('Projeto Bifásico com carga trifásica declarada (ex: motor grande importado errado) → pega', () => {
    const comodos = [{
      nome: 'Área externa',
      cargas_manuais: [{ descricao: 'Bomba trifásica', fase: 'tri' as const }],
      tues: [],
    }]
    const problemas = verificarCompatibilidadeSistema(comodos, 'Bifasico')
    expect(problemas).toHaveLength(1)
  })

  it('Confirma o mental model do usuário: Trifásico não obriga tudo virar RST — mono pega 1 de 3, bi pega 1 par de 3', () => {
    expect(fasesParaTipo('monofasica', 'Trifasico')).toEqual(['R', 'S', 'T'])
    expect(fasesParaTipo('bifasica', 'Trifasico')).toEqual(['RS', 'ST', 'RT'])
    expect(fasesParaTipo('trifasica', 'Trifasico')).toEqual(['RST'])
  })
})
