// Validação — preset de seção mínima do cliente, sempre Math.max com a norma
import { describe, it, expect } from 'vitest'
import { dimensionarCircuito } from '../core/engine'
import type { CircuitInput } from '../core/engine'
import { resolverCircuito } from '../core/pipeline'

const BASE = {
  v_fase: 127, metodo: 'B1', isolacao: 'PVC' as const, material: 'Cu' as const,
  t_amb: 30, du_max: 4, du_ramal: 0.5,
}

describe('Preset de seção mínima — sempre Math.max com a norma', () => {
  it('Preset 4mm² em ILUM (norma exige só 1,5mm²) → sobe para 4mm²', () => {
    const r = dimensionarCircuito({
      id: 'x', descricao: 'ILUM Sala', potencia_va: 200, fase: 'R',
      comprimento_m: 8, n_agrup: 1, tipo: 'ILUM', ...BASE,
      secao_minima_preset_mm2: 4,
    } as CircuitInput)
    expect(r.secao_fase).toBeGreaterThanOrEqual(4)
  })

  it('Preset ABAIXO da norma (1mm² em TUG, que exige 2,5mm²) → NÃO enfraquece, mantém 2,5mm²', () => {
    const r = dimensionarCircuito({
      id: 'x', descricao: 'TUG Quarto', potencia_va: 600, fase: 'R',
      comprimento_m: 8, n_agrup: 1, tipo: 'TUG', ...BASE,
      secao_minima_preset_mm2: 1,  // tentativa de enfraquecer
    } as CircuitInput)
    expect(r.secao_fase).toBeGreaterThanOrEqual(2.5)
  })

  it('Sem preset → comportamento normal inalterado', () => {
    const r = dimensionarCircuito({
      id: 'x', descricao: 'ILUM Sala', potencia_va: 200, fase: 'R',
      comprimento_m: 8, n_agrup: 1, tipo: 'ILUM', ...BASE,
    } as CircuitInput)
    expect(r.secao_fase).toBe(1.5)
  })

  it('Consistência entre motores: engine.ts e pipeline.ts dão a mesma seção com preset ativo', () => {
    const input = {
      id: 'x', descricao: 'ILUM Corredor', potencia_va: 100, fase: 'R' as const,
      comprimento_m: 6, n_agrup: 1, tipo: 'ILUM', ...BASE,
      secao_minima_preset_mm2: 4,
    }
    const r1 = dimensionarCircuito(input as CircuitInput)
    const r2 = resolverCircuito({ ...input, du_max_pct: BASE.du_max, du_ramal_pct: BASE.du_ramal, icc_rede_ka: 5 } as any)
    expect(r2.julgamento?.secao_consolidada).toBe(r1.secao_fase)
  })
})
