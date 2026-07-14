// Validação — NBR 5410 §9.1, Volumes 0-3 em locais com banheira/chuveiro
import { describe, it, expect } from 'vitest'
import { verificarVolumesBanheiro, verificarComodoNBR9 } from '../core/rules/nbr5410_s9'
import type { Comodo, CargaManual } from '../types/electrical'

function comodoBanho(cargas: Partial<CargaManual>[]): Comodo {
  return {
    id: 'b1', nome: 'Banheiro Suíte', tipo: 'Banho', area_m2: 4.5,
    perimetro_m: 9, pe_direito_m: 2.7, ilum_va: 100, tug_va: 600,
    cargas_manuais: cargas.map((c, i) => ({
      id: `c${i}`, tipo: 'TUG', descricao: 'Tomada', potencia_va: 600,
      qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 100, ...c,
    })) as CargaManual[],
    tues: [],
  } as any
}

describe('Volumes de banheiro — §9.1', () => {
  it('Tomada declarada no Volume 0 → ERRO bloqueante', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ volume_banheiro: 'V0' as any, descricao: 'Tomada dentro do box' }]))
    expect(r).toHaveLength(1)
    expect(r[0].severidade).toBe('erro')
    expect(r[0].codigo).toContain('VolumeV0')
  })

  it('Tomada declarada no Volume 1 → ERRO bloqueante', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ volume_banheiro: 'V1' as any, descricao: 'Tomada acima do chuveiro' }]))
    expect(r[0].severidade).toBe('erro')
  })

  it('Tomada (TUG) declarada no Volume 2 → ERRO (tomada padrão não permitida)', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ volume_banheiro: 'V2' as any, tipo: 'TUG', descricao: 'Tomada perto da pia' }]))
    expect(r[0].severidade).toBe('erro')
  })

  it('Tomada declarada no Volume 3 → informativo apenas, conforme', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ volume_banheiro: 'V3' as any, descricao: 'Tomada longe da banheira' }]))
    expect(r[0].severidade).toBe('info')
    expect(r[0].conforme).toBe(true)
  })

  it('Fora dos volumes (padrão) → nenhuma violação gerada', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ volume_banheiro: 'fora' as any, descricao: 'Tomada longe' }]))
    expect(r).toHaveLength(0)
  })

  it('Cômodo que NÃO é banheiro → função sempre retorna vazio, mesmo com volume declarado por engano', () => {
    const social = comodoBanho([{ volume_banheiro: 'V0' as any }])
    social.tipo = 'Social'
    expect(verificarVolumesBanheiro(social)).toHaveLength(0)
  })

  it('Integração: verificarComodoNBR9 inclui a violação de volume no resultado consolidado', () => {
    const r = verificarComodoNBR9(comodoBanho([{ volume_banheiro: 'V0' as any }]))
    expect(r.some(v => v.codigo.includes('Volume'))).toBe(true)
  })
})
