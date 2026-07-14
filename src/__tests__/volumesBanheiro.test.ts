// Validação — NBR 5410 §9.1, Volumes 0-3 em locais com banheira/chuveiro
// Abordagem por DISTÂNCIA NUMÉRICA (m), não categoria de volume —
// o engenheiro informa a medida bruta, o motor classifica sozinho.
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

describe('Volumes de banheiro — §9.1 (por distância numérica)', () => {
  it('TUG a 0,30m (< 0,60m) → ERRO bloqueante', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ distancia_box_m: 0.30, tipo: 'TUG', descricao: 'Tomada perto do box' }]))
    expect(r).toHaveLength(1)
    expect(r[0].severidade).toBe('erro')
  })

  it('TUG exatamente a 0,60m → NÃO bloqueia (limite é exclusivo abaixo)', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ distancia_box_m: 0.60, tipo: 'TUG', descricao: 'Tomada na fronteira' }]))
    expect(r.every(v => v.severidade !== 'erro')).toBe(true)
  })

  it('TUG a 1,50m (entre 0,60 e 3,00m) → informativo, exige DR (já garantido)', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ distancia_box_m: 1.5, descricao: 'Tomada Volume 3' }]))
    expect(r[0].severidade).toBe('info')
    expect(r[0].conforme).toBe(true)
  })

  it('TUG a 4,00m (> 3,00m) → nenhuma violação/nota gerada', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ distancia_box_m: 4.0, descricao: 'Tomada longe' }]))
    expect(r).toHaveLength(0)
  })

  it('TUE (chuveiro) a 0,10m → NÃO bloqueia — é o equipamento esperado ali', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ distancia_box_m: 0.10, tipo: 'TUE', descricao: 'Chuveiro elétrico' }]))
    expect(r.every(v => v.severidade !== 'erro')).toBe(true)
    expect(r[0].severidade).toBe('info')
  })

  it('ILUM a 0,30m → AVISO (não bloqueia) — depende de altura, não pedida ao usuário', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ distancia_box_m: 0.30, tipo: 'ILUM', descricao: 'Arandela' }]))
    expect(r[0].severidade).toBe('aviso')
    expect(r[0].descricao).toContain('2,25m')
  })

  it('Sem distância declarada (undefined) → nenhuma verificação (comportamento anterior preservado)', () => {
    const r = verificarVolumesBanheiro(comodoBanho([{ descricao: 'Tomada sem info' }]))
    expect(r).toHaveLength(0)
  })

  it('Cômodo que NÃO é banheiro → função sempre retorna vazio', () => {
    const social = comodoBanho([{ distancia_box_m: 0.1 }])
    social.tipo = 'Social'
    expect(verificarVolumesBanheiro(social)).toHaveLength(0)
  })

  it('Integração: verificarComodoNBR9 inclui a violação no resultado consolidado', () => {
    const r = verificarComodoNBR9(comodoBanho([{ distancia_box_m: 0.2 }]))
    expect(r.some(v => v.codigo.includes('TomadaProxima'))).toBe(true)
  })
})
