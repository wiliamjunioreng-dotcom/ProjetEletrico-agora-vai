// Validação — Tabela 49, Uc mínimo do DPS por esquema de aterramento
import { describe, it, expect } from 'vitest'
import { getUcMinimoDPS, ligacoesDPSAplicaveis } from '../data/nbr5410tables'

describe('getUcMinimoDPS — Tabela 49', () => {
  it('Exemplo do usuário: TN-S 127/220V — fase-PE e fase-neutro = 140V, neutro-PE = 127V', () => {
    const faseNeutro = getUcMinimoDPS('fase-neutro', 'TN-S', 127, 220)
    const fasePE      = getUcMinimoDPS('fase-pe', 'TN-S', 127, 220)
    const neutroPE     = getUcMinimoDPS('neutro-pe', 'TN-S', 127, 220)
    expect(faseNeutro.uc_minimo_v).toBe(140)
    expect(fasePE.uc_minimo_v).toBe(140)
    expect(neutroPE.uc_minimo_v).toBe(127)
  })

  it('TT: mesmo comportamento de TN-S para fase-neutro e fase-PE', () => {
    expect(getUcMinimoDPS('fase-neutro', 'TT', 127, 220).uc_minimo_v).toBe(140)
    expect(getUcMinimoDPS('fase-pe', 'TT', 127, 220).uc_minimo_v).toBe(140)
  })

  it('IT: fase-PE usa tensão de LINHA (U), não 1,1×Uo — diferente de TT/TN-S', () => {
    const r = getUcMinimoDPS('fase-pe', 'IT', 127, 220)
    expect(r.uc_minimo_v).toBe(220)
  })

  it('TN-C: fase-neutro e fase-PE NÃO se aplicam (não tem condutor separado)', () => {
    expect(getUcMinimoDPS('fase-neutro', 'TN-C', 127, 220).aplicavel).toBe(false)
    expect(getUcMinimoDPS('fase-pe', 'TN-C', 127, 220).aplicavel).toBe(false)
  })

  it('TN-C: fase-PEN se aplica, 1,1×Uo', () => {
    const r = getUcMinimoDPS('fase-pen', 'TN-C', 127, 220)
    expect(r.aplicavel).toBe(true)
    expect(r.uc_minimo_v).toBe(140)
  })

  it('TN-S: fase-PEN NÃO se aplica (não usa condutor PEN)', () => {
    expect(getUcMinimoDPS('fase-pen', 'TN-S', 127, 220).aplicavel).toBe(false)
  })

  it('TN-C-S tratado como TN-S (interpretação prática documentada)', () => {
    const tncs = getUcMinimoDPS('fase-pe', 'TN-C-S', 127, 220)
    const tns  = getUcMinimoDPS('fase-pe', 'TN-S', 127, 220)
    expect(tncs.uc_minimo_v).toBe(tns.uc_minimo_v)
  })

  it('ligacoesDPSAplicaveis: TN-C só lista fase-pen', () => {
    expect(ligacoesDPSAplicaveis('TN-C')).toEqual(['fase-pen'])
  })

  it('ligacoesDPSAplicaveis: TN-S lista as 3 ligações normais (sem PEN)', () => {
    const l = ligacoesDPSAplicaveis('TN-S')
    expect(l).toContain('fase-neutro')
    expect(l).toContain('fase-pe')
    expect(l).toContain('neutro-pe')
    expect(l).not.toContain('fase-pen')
  })
})
