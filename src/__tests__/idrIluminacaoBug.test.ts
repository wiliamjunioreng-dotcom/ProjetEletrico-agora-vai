// Validação — DR obrigatório é pra TOMADAS/equipamentos de risco em
// área molhada, NÃO iluminação geral. Achado ao revisar o resultado
// do teste da casa completa: "ILUM: Spots cozinha" estava pegando IDR
// só por causa do tipo do cômodo, o que a norma não exige.
import { describe, it, expect } from 'vitest'
import { ehAreaMolhada } from '../core/areaMolhada'

describe('ehAreaMolhada — ILUM não pega DR só pelo tipo do cômodo', () => {
  it('TUG em Cozinha → precisa de DR (regra correta, mantida)', () => {
    expect(ehAreaMolhada('Tomadas cozinha', 'Cozinha', 'TUG')).toBe(true)
  })
  it('ILUM em Cozinha → NÃO precisa de DR só pelo tipo do cômodo (fix)', () => {
    expect(ehAreaMolhada('Spots cozinha', 'Cozinha', 'ILUM')).toBe(false)
  })
  it('ILUM em Banheiro → também não precisa, mesma lógica', () => {
    expect(ehAreaMolhada('Plafon banheiro', 'Banho', 'ILUM')).toBe(false)
  })
  it('TUE chuveiro → continua precisando de DR mesmo sendo "equipamento", não tipo de cômodo', () => {
    expect(ehAreaMolhada('Chuveiro elétrico 7500W', undefined, 'TUE')).toBe(true)
  })
  it('ILUM com a palavra "chuveiro" na descrição (caso raro, luminária dentro do box) → ainda pega DR', () => {
    // A checagem por PALAVRA na descrição continua valendo pra QUALQUER
    // tipo — só a regra automática por TIPO DE CÔMODO é que exclui ILUM
    expect(ehAreaMolhada('Luminária embutida no box do chuveiro', 'Banho', 'ILUM')).toBe(true)
  })
  it('Sem tipoCircuito informado (compatibilidade retroativa) → mantém comportamento conservador anterior', () => {
    expect(ehAreaMolhada('Spots cozinha', 'Cozinha')).toBe(true)
  })
})
