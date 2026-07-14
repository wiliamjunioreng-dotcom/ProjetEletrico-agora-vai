// Validação — os 3 fatores novos (Fsolo, harmônica, Tabela 45) devem
// dar o MESMO resultado nos dois motores (engine.ts e pipeline.ts).
// Achado desta sessão: eles só tinham sido conectados em engine.ts.
import { describe, it, expect } from 'vitest'
import { dimensionarCircuito } from '../core/engine'
import type { CircuitInput } from '../core/engine'
import { resolverCircuito } from '../core/pipeline'

const BASE = {
  v_fase: 127, isolacao: 'PVC' as const, material: 'Cu' as const,
  t_amb: 30, du_max: 4, du_ramal: 0.5,
}

describe('Consistência entre motores — Fsolo, harmônica, Tabela 45', () => {
  it('Fsolo: engine.ts e pipeline.ts dão a mesma seção final (solo úmido, D2)', () => {
    const input = {
      id: 'x', descricao: 'Alimentador enterrado', potencia_va: 8000, fase: 'RS' as const,
      comprimento_m: 40, n_agrup: 1, tipo: 'TUE', metodo: 'D2', ...BASE,
      resistividade_solo_km_w: 1.0,
    }
    const r1 = dimensionarCircuito(input as CircuitInput)
    const r2 = resolverCircuito({ ...input, du_max_pct: BASE.du_max, du_ramal_pct: BASE.du_ramal, icc_rede_ka: 5 } as any)
    console.log('engine.ts:', r1.secao_fase, '| pipeline.ts:', r2.julgamento?.secao_consolidada)
    expect(r2.julgamento?.secao_consolidada).toBe(r1.secao_fase)
  })

  it('Fator harmônico: engine.ts e pipeline.ts dão a mesma seção final (trifásico, 30% harmônica)', () => {
    const input = {
      id: 'x', descricao: 'Alimentador LED prédio', potencia_va: 15000, fase: 'RST' as const,
      comprimento_m: 30, n_agrup: 1, tipo: 'GERAL', metodo: 'B1', ...BASE,
      terceira_harmonica_pct: 30,
    }
    const r1 = dimensionarCircuito(input as CircuitInput)
    const r2 = resolverCircuito({ ...input, du_max_pct: BASE.du_max, du_ramal_pct: BASE.du_ramal, icc_rede_ka: 5 } as any)
    console.log('engine.ts:', r1.secao_fase, '| pipeline.ts:', r2.julgamento?.secao_consolidada)
    expect(r2.julgamento?.secao_consolidada).toBe(r1.secao_fase)
  })

  it('Tabela 45: engine.ts e pipeline.ts dão a mesma seção final (dutos enterrados separados)', () => {
    const input = {
      id: 'x', descricao: 'Alimentador loteamento', potencia_va: 6000, fase: 'RS' as const,
      comprimento_m: 40, n_agrup: 3, tipo: 'TUE', metodo: 'D2', ...BASE,
      tipo_condutor_enterrado: 'multipolar' as const, distancia_dutos_m: 0.5,
    }
    const r1 = dimensionarCircuito(input as CircuitInput)
    const r2 = resolverCircuito({ ...input, du_max_pct: BASE.du_max, du_ramal_pct: BASE.du_ramal, icc_rede_ka: 5 } as any)
    console.log('engine.ts:', r1.secao_fase, '| pipeline.ts:', r2.julgamento?.secao_consolidada)
    expect(r2.julgamento?.secao_consolidada).toBe(r1.secao_fase)
  })
})
