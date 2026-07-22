// Validação — bug real achado construindo o Memorial de Cálculo com
// Fórmulas: quando a tripartida (In <= Iz') forçava a seção a subir
// MAIS do que o laço de ΔU já exigia, du_calc ficava parado no valor
// da seção MENOR anterior, nunca recalculado pra seção final. Como
// seção maior sempre dá ΔU menor, isso reportava ΔU% PIOR do que o
// real — podia até marcar "EXCEDE" um circuito que na seção final
// estava conforme.
import { describe, it, expect } from 'vitest'
import { dimensionarCircuito } from '../core/engine'

describe('du_calc não fica desatualizado quando tripartida força seção maior', () => {
  it('Circuito onde tripartida escalona além do que ΔU exigia — du_calc reflete a seção FINAL', () => {
    // Cenário real que expôs o bug: chuveiro bifásico 7500VA/220V,
    // comprimento curto (ΔU não seria o fator limitante sozinho),
    // mas a corrente alta força um disjuntor cuja Iz' só é atendida
    // numa seção maior — tripartida escalona além do que ΔU pedia.
    const r = dimensionarCircuito({
      id: 'x', descricao: 'Chuveiro elétrico 7500W', tipo: 'TUE',
      fase: 'RS', potencia_va: 7500, comprimento_m: 8,
      n_agrup: 1, v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
      t_amb: 30, du_max: 4, du_ramal: 0.5,
    } as any)

    // A seção final adotada e o du_calc reportado devem ser
    // CONSISTENTES entre si — recalculando ΔU manualmente com a
    // seção final, o resultado deve bater com r.du_calc armazenado
    const rho_t = 0.0172 * (1 + 0.00393 * (70 - 20))
    const duEsperado = (2 * rho_t * 8 * r.ib) / (r.secao_fase * r.tensao_v) * 100

    expect(r.du_calc).toBeCloseTo(duEsperado, 2)
  })

  it('Verificação direta: du_calc nunca corresponde a uma seção MENOR que a seção_fase final', () => {
    const r = dimensionarCircuito({
      id: 'y', descricao: 'Forno elétrico trifásico', tipo: 'TUE',
      fase: 'RST', potencia_va: 6500, comprimento_m: 12,
      n_agrup: 1, v_fase: 127, metodo: 'B1', isolacao: 'PVC', material: 'Cu',
      t_amb: 30, du_max: 4, du_ramal: 0.5,
    } as any)
    const rho_t = 0.0172 * (1 + 0.00393 * (70 - 20))
    const duComSecaoFinal = (Math.sqrt(3) * rho_t * 12 * r.ib) / (r.secao_fase * r.tensao_v) * 100
    expect(r.du_calc).toBeCloseTo(duComSecaoFinal, 2)
  })
})
