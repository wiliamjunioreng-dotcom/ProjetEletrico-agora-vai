// Validação — faseDefault() agora balanceia, não fixa sempre em R
import { describe, it, expect } from 'vitest'
import { faseDefault, fasesParaTipo } from '../store/projectStore'

describe('faseDefault — balanceamento ativo por fases já em uso', () => {
  it('Sem circuitos existentes → primeira disponível (comportamento inicial preservado)', () => {
    expect(faseDefault('monofasica', 'Trifasico')).toBe('R')
  })

  it('R já usada 2x, S 1x, T 0x → escolhe T (a menos usada), não R sempre', () => {
    const fase = faseDefault('monofasica', 'Trifasico', ['R', 'R', 'S'])
    expect(fase).toBe('T')
  })

  it('Simula criação manual sucessiva de 6 circuitos — todas as 3 fases aparecem', () => {
    let fases: any[] = []
    for (let i = 0; i < 6; i++) {
      const f = faseDefault('monofasica', 'Trifasico', fases)
      fases.push(f)
    }
    console.log('Fases de 6 circuitos manuais sucessivos:', fases)
    expect(new Set(fases).has('T')).toBe(true)
    expect(new Set(fases).has('S')).toBe(true)
    expect(new Set(fases).has('R')).toBe(true)
  })

  it('Empate → primeira disponível na ordem (comportamento determinístico)', () => {
    const fase = faseDefault('monofasica', 'Trifasico', ['R', 'S', 'T'])
    expect(fase).toBe('R')  // todas empatadas em 1, pega a primeira
  })
})
