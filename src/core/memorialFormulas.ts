// src/core/memorialFormulas.ts
// ════════════════════════════════════════════════════════════════
// Prepara os dados para o "Memorial de Cálculo com Fórmulas" — um
// Excel onde as células fazem a MESMA conta que o motor, com fórmula
// de verdade (não valor estático), pra quem quiser uma segunda
// opinião ou auditar como cada número saiu.
//
// Estratégia: as tabelas de referência (Iz por seção, disjuntores
// padrão) são PRÉ-CALCULADAS aqui usando as funções REAIS do motor
// (nbr5410tables.ts) — garante exatidão sem precisar reimplementar
// a lógica de múltiplas dimensões (método×material×isolação) como
// fórmula genérica no Excel. As fórmulas da planilha então fazem só
// busca simples (VLOOKUP) + aritmética direta contra essas tabelas —
// isso SIM é fácil de auditar visualmente numa célula do Excel.
//
// O que vira fórmula de verdade: Ib, Irc, Iz efetiva, ΔU%, seção do
// PE — pura física/tabela, sem ambiguidade.
// O que fica como valor calculado + explicação ao lado (não fórmula):
// curva do disjuntor e necessidade de DR — são decisões por palavra-
// chave na descrição/tipo da carga; forçar isso em fórmula de Excel
// ficaria uma cascata de SE() ilegível, o oposto do objetivo de
// auditoria clara.
// ════════════════════════════════════════════════════════════════
import { getIz, getFt, getFa, DISJUNTORES_A, SECOES_COMERCIAIS } from '../data/nbr5410tables'
import type { CircuitResult } from './engine'

export interface LinhaMemorial {
  n: number
  descricao: string
  tipo: string
  ligacao: string
  n_fases: 1 | 2 | 3
  n_cond: 2 | 3
  potencia_va: number
  tensao_v: number
  comprimento_m: number
  n_agrupados: number
  secao_adotada: number
  curva_disjuntor: string
  idr: boolean
  idr_motivo: string
}

export interface DadosMemorialFormulas {
  parametros: {
    metodo_instalacao: string
    isolacao: string
    material: string
    t_amb: number
    fp: number
    du_max_pct: number
    du_ramal_pct: number
    ft_calculado: number
  }
  tabelaIz2cond: { secao: number; iz: number }[]   // monofásico/bifásico — 2 condutores carregados
  tabelaIz3cond: { secao: number; iz: number }[]   // trifásico — 3 condutores carregados
  tabelaFa: { n: number; fator: number }[]
  tabelaDisjuntores: number[]
  linhas: LinhaMemorial[]
}

function nFasesDeLigacao(ligacao?: string): 1 | 2 | 3 {
  if (ligacao === 'trifasica') return 3
  if (ligacao === 'bifasica') return 2
  return 1
}

// IMPORTANTE: n_cond (condutores CARREGADOS, usado pra escolher a
// tabela de ampacidade/Iz) é um conceito DIFERENTE de n_fases (usado
// no fator √3-vs-2 da queda de tensão) — o motor real trata bifásico
// IGUAL trifásico aqui (3 condutores), só monofásico puro é 2. Achado
// nesta sessão comparando o Excel gerado contra o app real: usar
// n_fases (que dá 2 pra bifásico) nesse lugar gerava Iz errado —
// exatamente o tipo de coisa que essa planilha de auditoria deveria
// pegar. Replica getNCond() do motor exatamente, não a distinção de
// n_fases que serve pra outra conta.
function nCondDeLigacao(ligacao?: string): 2 | 3 {
  return ligacao === 'monofasica' || !ligacao ? 2 : 3
}

export function prepararDadosMemorialFormulas(
  circuitosCalc: CircuitResult[],
  circuitosRaw: { id: string; descricao: string; tipo: string; ligacao?: string; potencia_va: number; comprimento_m: number; n_agrup: number }[],
  projeto: { metodo_instalacao?: string; isolacao?: string; material_cabo?: string; t_amb?: number; fp_global?: number; du_max_pct?: number; du_ramal_pct?: number },
): DadosMemorialFormulas {
  const metodo   = (projeto.metodo_instalacao || 'B1') as any
  const isolacao = (projeto.isolacao || 'PVC') as any
  const material = (projeto.material_cabo || 'Cu') as any
  const t_amb    = projeto.t_amb ?? 30
  const fp       = projeto.fp_global ?? 0.92

  // Tabelas de Iz — usa a função REAL do motor, para cada seção
  // comercial, nos dois casos de número de condutores carregados
  const tabelaIz2cond = SECOES_COMERCIAIS.map(secao => ({
    secao, iz: Math.max(0, getIz(secao, metodo, 2, material, isolacao)),
  }))
  const tabelaIz3cond = SECOES_COMERCIAIS.map(secao => ({
    secao, iz: Math.max(0, getIz(secao, metodo, 3, material, isolacao)),
  }))

  const tabelaFa = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, fator: getFa(i + 1) }))

  const ft_calculado = getFt(t_amb, isolacao)

  const porId = new Map(circuitosRaw.map(r => [r.id, r]))
  const linhas: LinhaMemorial[] = circuitosCalc
    .filter(c => c.potencia_va > 0)
    .map((c, i) => {
      const raw = porId.get(c.id)
      return {
        n: i + 1,
        descricao: c.descricao,
        tipo: c.tipo,
        ligacao: raw?.ligacao || 'monofasica',
        n_fases: nFasesDeLigacao(raw?.ligacao),
        n_cond: nCondDeLigacao(raw?.ligacao),
        potencia_va: c.potencia_va,
        tensao_v: c.tensao_v,
        comprimento_m: raw?.comprimento_m ?? 0,
        n_agrupados: raw?.n_agrup ?? 1,
        secao_adotada: c.secao_fase,
        curva_disjuntor: c.curva,
        idr: c.idr,
        idr_motivo: c.idr ? 'Área molhada ou equipamento de risco (tomada/TUE) — NBR 5410' : '—',
      }
    })

  return {
    parametros: {
      metodo_instalacao: metodo, isolacao, material, t_amb, fp,
      du_max_pct: projeto.du_max_pct ?? 4, du_ramal_pct: projeto.du_ramal_pct ?? 0.5,
      ft_calculado,
    },
    tabelaIz2cond, tabelaIz3cond, tabelaFa,
    tabelaDisjuntores: DISJUNTORES_A,
    linhas,
  }
}
