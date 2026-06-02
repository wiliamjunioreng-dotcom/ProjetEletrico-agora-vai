// src/__tests__/nbr5410_s9.test.ts
import { describe, it, expect } from 'vitest'
import {
  verificarTUGMinimas, verificarCircuitosDedicados,
  verificarILUMMinima, verificarProjetoNBR9,
} from '../core/rules/nbr5410_s9'
import type { Comodo } from '../types/electrical'

function comodo(
  tipo: Comodo['tipo'],
  area: number,
  perimetro: number,
  cargas: Partial<Comodo['cargas_manuais'][0]>[] = []
): Comodo {
  return {
    id: 'c1', nome: `${tipo} teste`, tipo, area_m2: area, perimetro_m: perimetro,
    pe_direito_m: 2.7, ilum_va: 0, tug_va: 0, tues: [],
    cargas_manuais: cargas.map((c, i) => ({
      id: `cm${i}`, tipo: 'TUG' as const, descricao: 'Tomada', potencia_va: 600,
      qtd: 1, abaixo_nbr: false, ...c,
    })) as any,
  }
}

describe('§9.6.3 — TUG mínimas por perímetro', () => {

  it('Social perímetro pequeno: min 1 TUG — 1 declarada: OK', () => {
    const c = comodo('Social', 6, 4, [{ tipo:'TUG', qtd:1 }])
    const r = verificarTUGMinimas(c)
    expect(r.every(v => v.conforme)).toBe(true)
  })

  it('Social 12m perim: min 3 TUG — apenas 1 declarada: AVISO', () => {
    const c = comodo('Social', 20, 20, [{ tipo:'TUG', qtd:1 }])
    const r = verificarTUGMinimas(c)
    const v = r.find(v => v.codigo.includes('9.6.3'))
    expect(v?.conforme).toBe(false)
    expect(v?.limite).toBe(4)  // ceil(20/5) = 4
  })

  it('Social sem cargas manuais: sem aviso (usa cálculo automático)', () => {
    const c = comodo('Social', 12, 14)  // sem cargas_manuais
    const r = verificarTUGMinimas(c)
    expect(r.filter(v => !v.conforme)).toHaveLength(0)
  })
})

describe('§9.6.3.1 — Cozinha: mínimo 3 TUGs', () => {

  it('Cozinha com 1 TUG: aviso (min 3)', () => {
    const c = comodo('Cozinha', 8, 12, [{ tipo:'TUG', qtd:1 }])
    const r = verificarTUGMinimas(c)
    const v = r.find(v => v.codigo.includes('9.6.3.1'))
    expect(v?.conforme).toBe(false)
    expect(v?.limite).toBe(3)
  })

  it('Cozinha com 3 TUGs: OK', () => {
    const c = comodo('Cozinha', 8, 12, [{ tipo:'TUG', qtd:3 }])
    const r = verificarTUGMinimas(c)
    const v = r.find(v => v.codigo.includes('9.6.3.1'))
    expect(v).toBeUndefined()
  })
})

describe('§9.6.3.2 — Banheiro: min 1 TUG se área ≥ 3m²', () => {

  it('Banheiro 4m² sem TUG: aviso', () => {
    const c = comodo('Banho', 4, 8, [{ tipo:'ILUM', qtd:1 }])
    const r = verificarTUGMinimas(c)
    const v = r.find(v => v.codigo === 'NBR5410.9.6.3.2')
    expect(v?.conforme).toBe(false)
  })

  it('Banheiro 2m²: sem obrigação de TUG', () => {
    const c = comodo('Banho', 2, 6, [{ tipo:'ILUM', qtd:1 }])
    const r = verificarTUGMinimas(c)
    const v = r.find(v => v.codigo === 'NBR5410.9.6.3.2')
    expect(v).toBeUndefined()
  })
})

describe('§9.5.4 — Circuitos dedicados', () => {

  it('Chuveiro cadastrado como TUG: aviso de circuito dedicado', () => {
    const c = comodo('Banho', 5, 9, [{
      tipo: 'TUG', descricao: 'Chuveiro elétrico 5500W', potencia_va: 5500
    }])
    const r = verificarCircuitosDedicados(c)
    expect(r.some(v => v.codigo.includes('9.5.4'))).toBe(true)
  })

  it('Ar-condicionado como TUG: aviso', () => {
    const c = comodo('Social', 20, 20, [{
      tipo: 'TUG', descricao: 'Ar-condicionado 9000 BTU', potencia_va: 900
    }])
    const r = verificarCircuitosDedicados(c)
    expect(r.some(v => v.codigo.includes('9.5.4'))).toBe(true)
  })

  it('Carga 2000VA como TUG: aviso por potência', () => {
    const c = comodo('Cozinha', 9, 12, [{
      tipo: 'TUG', descricao: 'Forno embutido', potencia_va: 2000
    }])
    const r = verificarCircuitosDedicados(c)
    expect(r.some(v => v.codigo === 'NBR5410.9.5.4')).toBe(true)
  })

  it('Chuveiro como TUE: sem aviso (correto)', () => {
    const c = comodo('Banho', 5, 9, [{
      tipo: 'TUE', descricao: 'Chuveiro elétrico', potencia_va: 5500
    }])
    const r = verificarCircuitosDedicados(c)
    // TUE já é circuito dedicado — sem aviso
    expect(r.filter(v => !v.conforme)).toHaveLength(0)
  })
})

describe('§9.6.2 — Iluminação mínima', () => {

  it('Social sem iluminação: aviso', () => {
    const c = comodo('Social', 15, 16, [{ tipo:'TUG', qtd:2 }])
    const r = verificarILUMMinima(c)
    expect(r.some(v => v.codigo === 'NBR5410.9.6.2')).toBe(true)
  })

  it('Social com iluminação: OK', () => {
    const c = comodo('Social', 15, 16, [
      { tipo:'TUG', qtd:2 },
      { tipo:'ILUM', qtd:1 },
    ])
    const r = verificarILUMMinima(c)
    expect(r.filter(v => !v.conforme)).toHaveLength(0)
  })
})

describe('verificarProjetoNBR9 — projeto completo', () => {

  it('projeto sem violações: retorna array vazio', () => {
    const comodos: Comodo[] = [
      { ...comodo('Social', 6, 4, [{ tipo:'ILUM', qtd:1 }, { tipo:'TUG', qtd:1 }]), id:'c-s1' },
      { ...comodo('Banho', 4, 8, [{ tipo:'TUG', qtd:1 }]), id:'c-b1' },
    ]
    const r = verificarProjetoNBR9(comodos)
    expect(r).toHaveLength(0)
  })

  it('projeto com violação: identifica o cômodo problemático', () => {
    const comodos: Comodo[] = [
      comodo('Social', 15, 16, [{ tipo:'TUG', qtd:1 }]),  // sem ilum + TUG insuficiente
      comodo('Cozinha', 8, 12, [{ tipo:'ILUM', qtd:1 }, { tipo:'TUG', qtd:3 }]),  // OK
    ]
    const r = verificarProjetoNBR9(comodos)
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].comodo_nome).toContain('Social')
  })
})
