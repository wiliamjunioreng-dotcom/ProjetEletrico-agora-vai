// Validação — NBR 13570, locais de afluência de público
import { describe, it, expect } from 'vitest'
import { verificarComodoNBR13570, verificarCircuitosILUM13570 } from '../core/rules/nbr13570'
import type { Comodo, CargaManual } from '../types/electrical'

function comodoPublico(area_m2: number, afluencia: boolean, cargas: Partial<CargaManual>[]): Comodo {
  return {
    id: 'c1', nome: 'Salão de Festas', tipo: 'Social', area_m2,
    perimetro_m: 40, pe_direito_m: 3.0, ilum_va: 0, tug_va: 0,
    afluencia_publico: afluencia,
    cargas_manuais: cargas.map((c, i) => ({
      id: `c${i}`, tipo: 'ILUM', descricao: 'Circuito ILUM', potencia_va: 300,
      qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 100, ...c,
    })) as CargaManual[],
    tues: [],
  } as any
}

describe('NBR 13570 §4.10.1 — mínimo 2 circuitos ILUM em >100m²', () => {
  it('Área >100m², afluência pública, só 1 circuito ILUM declarado → ERRO', () => {
    const r = verificarCircuitosILUM13570(comodoPublico(150, true, [{}]))
    expect(r).toHaveLength(1)
    expect(r[0].severidade).toBe('erro')
  })

  it('Área >100m², afluência pública, 2 circuitos ILUM declarados → conforme, sem erro', () => {
    const r = verificarCircuitosILUM13570(comodoPublico(150, true, [{}, {}]))
    expect(r).toHaveLength(0)
  })

  it('Área ≤100m² → regra não se aplica mesmo com afluência pública', () => {
    const r = verificarCircuitosILUM13570(comodoPublico(80, true, [{}]))
    expect(r).toHaveLength(0)
  })

  it('Área >100m² mas SEM marcar afluência pública → regra não se aplica', () => {
    const r = verificarCircuitosILUM13570(comodoPublico(150, false, [{}]))
    expect(r).toHaveLength(0)
  })

  it('Área >100m², afluência pública, MAS sem cargas manuais declaradas → não verifica (limitação de arquitetura documentada)', () => {
    const r = verificarCircuitosILUM13570(comodoPublico(150, true, []))
    expect(r).toHaveLength(0)
  })
})

describe('NBR 13570 — nota de cabeamento LSZH', () => {
  it('Afluência pública gera nota informativa sobre LSZH', () => {
    const r = verificarComodoNBR13570(comodoPublico(50, true, []))
    const lszh = r.find(v => v.codigo.includes('LSZH'))
    expect(lszh).toBeDefined()
    expect(lszh?.severidade).toBe('info')
  })

  it('Sem afluência pública → nenhuma verificação NBR 13570 dispara', () => {
    const r = verificarComodoNBR13570(comodoPublico(150, false, [{}]))
    expect(r).toHaveLength(0)
  })
})
