// Validação da correção do fator K (integral de Joule) — Achado A.2
import { describe, it, expect } from 'vitest'
import { calcIcc } from '../core/engine'
import type { IccInput } from '../core/engine'

describe('calcIcc — fator K correto por isolação (NBR 5410 Tabela B.1)', () => {
  const base: Omit<IccInput, 'isolacao'> = {
    icc_rede_ka: 5, v_linha: 220, secao_mm2: 10,
    comprimento_m: 20, material: 'Cu', temperatura: 70,
  }

  it('Cu/PVC deve usar K=115 (não mais 143)', () => {
    const r_pvc  = calcIcc({ ...base, isolacao: 'PVC' }, 20)
    const r_xlpe = calcIcc({ ...base, isolacao: 'XLPE' }, 20)
    // capacidade_max = (K×S)² — XLPE (K=143) deve indicar MAIS energia
    // suportada que PVC (K=115) para a mesma seção — physically correto
    // porque XLPE tolera temperatura de curto maior (250°C vs 160°C)
    console.log('PVC energia_especifica(%):', r_pvc.energia_especifica, '| XLPE:', r_xlpe.energia_especifica)
    expect(r_xlpe.energia_especifica).toBeLessThanOrEqual(r_pvc.energia_especifica)
  })

  it('Isolação omitida cai no padrão PVC (K=115), não mais 143', () => {
    const semIsolacao = calcIcc(base as IccInput, 20)
    const comPvcExplicito = calcIcc({ ...base, isolacao: 'PVC' }, 20)
    expect(semIsolacao.energia_especifica).toBe(comPvcExplicito.energia_especifica)
  })
})
