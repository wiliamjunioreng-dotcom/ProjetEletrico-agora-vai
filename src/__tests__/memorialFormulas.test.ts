// Validação — dados pré-calculados para o Memorial de Cálculo com
// Fórmulas usam as funções REAIS do motor (nbr5410tables.ts), não
// uma reimplementação paralela que poderia divergir.
import { describe, it, expect } from 'vitest'
import { prepararDadosMemorialFormulas } from '../core/memorialFormulas'
import { getIz, getFt } from '../data/nbr5410tables'

describe('prepararDadosMemorialFormulas — tabelas batem com o motor real', () => {
  const projeto = { metodo_instalacao: 'B1', isolacao: 'PVC', material_cabo: 'Cu', t_amb: 30, fp_global: 0.92, du_max_pct: 4, du_ramal_pct: 0.5 }

  it('Tabela de Iz (2 condutores) reproduz EXATAMENTE getIz() do motor, seção a seção', () => {
    const dados = prepararDadosMemorialFormulas([], [], projeto)
    for (const linha of dados.tabelaIz2cond) {
      const valorReal = getIz(linha.secao, 'B1', 2, 'Cu', 'PVC')
      expect(linha.iz).toBe(Math.max(0, valorReal))
    }
  })

  it('Tabela de Iz (3 condutores) também reproduz o motor real', () => {
    const dados = prepararDadosMemorialFormulas([], [], projeto)
    for (const linha of dados.tabelaIz3cond) {
      const valorReal = getIz(linha.secao, 'B1', 3, 'Cu', 'PVC')
      expect(linha.iz).toBe(Math.max(0, valorReal))
    }
  })

  it('Ft calculado bate com getFt() real do motor', () => {
    const dados = prepararDadosMemorialFormulas([], [], projeto)
    expect(dados.parametros.ft_calculado).toBe(getFt(30, 'PVC'))
  })

  it('Tabela de disjuntores é a série normativa completa (15 valores)', () => {
    const dados = prepararDadosMemorialFormulas([], [], projeto)
    expect(dados.tabelaDisjuntores).toEqual([6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250])
  })

  it('Linhas de circuito ativas (potência>0) viram uma linha do memorial cada, com dados corretos', () => {
    const circuitosCalc: any[] = [
      { id: 'c1', descricao: 'ILUM: Sala', tipo: 'ILUM', potencia_va: 200, tensao_v: 127, secao_fase: 1.5, curva: 'B', idr: false },
      { id: 'c2', descricao: 'TUE: Chuveiro', tipo: 'TUE', potencia_va: 7500, tensao_v: 220, secao_fase: 6, curva: 'C', idr: true },
      { id: 'reserva', descricao: 'Reserva', tipo: 'RESERVA', potencia_va: 0, tensao_v: 0, secao_fase: 0, curva: 'C', idr: false },
    ]
    const circuitosRaw: any[] = [
      { id: 'c1', descricao: 'ILUM: Sala', tipo: 'ILUM', ligacao: 'monofasica', potencia_va: 200, comprimento_m: 15, n_agrup: 2 },
      { id: 'c2', descricao: 'TUE: Chuveiro', tipo: 'TUE', ligacao: 'bifasica', potencia_va: 7500, comprimento_m: 8, n_agrup: 1 },
    ]
    const dados = prepararDadosMemorialFormulas(circuitosCalc, circuitosRaw, projeto)
    // RESERVA (potencia_va=0) não deve virar linha do memorial
    expect(dados.linhas).toHaveLength(2)
    expect(dados.linhas[0].descricao).toBe('ILUM: Sala')
    expect(dados.linhas[0].n_fases).toBe(1)
    expect(dados.linhas[0].n_cond).toBe(2)  // monofásico puro — único caso de 2 condutores
    expect(dados.linhas[0].n_agrupados).toBe(2)
    expect(dados.linhas[1].descricao).toBe('TUE: Chuveiro')
    expect(dados.linhas[1].n_fases).toBe(2)  // bifásica = 2 condutores PARA QUEDA DE TENSÃO
    expect(dados.linhas[1].n_cond).toBe(3)   // MAS 3 condutores PARA TABELA DE AMPACIDADE —
    // achado real auditando o primeiro arquivo gerado: são conceitos
    // diferentes, o motor trata bifásico como trifásico aqui
    expect(dados.linhas[1].idr).toBe(true)
  })
})
