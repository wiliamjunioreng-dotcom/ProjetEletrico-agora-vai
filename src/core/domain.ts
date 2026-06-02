// src/core/domain.ts
// ════════════════════════════════════════════════════════════════
// DOMÍNIO ELÉTRICO — Modelo mental e entidade soberana
//
// AXIOMA FUNDAMENTAL:
//   Potência flui na rede. Circuito é rótulo sobre esse fluxo.
//   Corrente é resultado da topologia, não da lista de circuitos.
//
// HIERARQUIA DE ENTIDADES:
//   RedeEletrica (soberana)
//     └── NoTopologico (ponto físico)
//     └── SegmentoEletroduto (condutor físico entre nós)
//         └── FluxoCondutor (corrente real por condutor por fase)
//     └── CircuitoLogico (rótulo sobre um caminho na rede)
//         └── Carga (ponto de consumo)
//
// ORDEM DE CÁLCULO (invariante):
//   1. Definir nós e segmentos (topologia física)
//   2. Definir cargas nos nós destino
//   3. Propagar potência pelos segmentos (de folha → raiz)
//   4. Calcular corrente em cada segmento por fase
//   5. Dimensionar condutores (bitola, disjuntor, IDR)
//   6. Verificar normas (tripartida, dU, IDR, ocupação)
//   7. Exportar (QDFL, memorial, unifilar, quantitativos)
// ════════════════════════════════════════════════════════════════

import type { RedeEletrica, SegmentoEletroduto as Segmento } from '../types/electrical'

// ── Fluxo elétrico em um segmento por fase ───────────────────────
// Resultado da propagação — não é entrada do usuário
export interface FluxoFase {
  fase:         'A' | 'B' | 'C'
  corrente_a:   number        // I = P / (V × fp × √3) ou P / V
  potencia_va:  number        // carga transportada nesta fase neste segmento
  sentido:      'carga' | 'descarga'  // fluxo normal ou retorno
}

export interface FluxoSegmento {
  segmento_id:  string
  fases:        FluxoFase[]
  corrente_max_a: number      // maior corrente entre as fases
  // Derivado — para dimensionamento
  n_condutores_carregados: number  // não conta PE, não conta neutro em TT
  potencia_total_va: number
}

// ── Propagação de potência (raiz do cálculo) ─────────────────────
// Algoritmo: DFS pós-ordem (folhas → raiz)
// Invariante: conservação de corrente nos nós
export function propagarFluxo(rede: RedeEletrica): Map<string, FluxoSegmento> {
  const resultado = new Map<string, FluxoSegmento>()

  // Construir adjacência: nó → segmentos que saem dele
  const adj = new Map<string, string[]>()
  rede.nos.forEach(n => adj.set(n.id, []))
  rede.segmentos.forEach(seg => {
    const lista = adj.get(seg.origem_no_id) ?? []
    lista.push(seg.id)
    adj.set(seg.origem_no_id, lista)
  })

  // Encontrar raiz (QD)
  const raiz = rede.nos.find(n => n.tipo === 'QD')
  if (!raiz) return resultado

  // Calcular potência total que passa por cada segmento via DFS pós-ordem
  function dfs(no_id: string, visitados: Set<string>): Map<'A'|'B'|'C', number> {
    if (visitados.has(no_id)) return new Map()
    visitados.add(no_id)

    // Cargas neste nó (potência de saída)
    const potenciasSaída = new Map<'A'|'B'|'C', number>([['A',0],['B',0],['C',0]])
    // Agregar cargas dos segmentos saindo deste nó
    const segsFilhos = (adj.get(no_id) ?? [])
      .map(sid => rede.segmentos.find(s => s.id === sid))
      .filter(Boolean) as Segmento[]

    for (const segFilho of segsFilhos) {
      // Recursão: calcular potência que vem dos filhos
      const potFilho = dfs(segFilho.destino_no_id, visitados)

      // Somar ao fluxo deste segmento
      const fluxoFases: FluxoFase[] = []
      let potTotal = 0
      let correnteMax = 0

      for (const [fase, pot] of potFilho.entries()) {
        const corrente = pot > 0 ? pot / 127 : 0  // V = 127V monofásico padrão
        fluxoFases.push({
          fase,
          corrente_a: Math.round(corrente * 100) / 100,
          potencia_va: pot,
          sentido: 'carga',
        })
        potTotal += pot
        correnteMax = Math.max(correnteMax, corrente)
        potenciasSaída.set(fase, (potenciasSaída.get(fase) ?? 0) + pot)
      }

      resultado.set(segFilho.id, {
        segmento_id: segFilho.id,
        fases: fluxoFases,
        corrente_max_a: Math.round(correnteMax * 100) / 100,
        n_condutores_carregados: fluxoFases.filter(f => f.corrente_a > 0).length,
        potencia_total_va: Math.round(potTotal),
      })
    }

    return potenciasSaída
  }

  dfs(raiz.id, new Set())
  return resultado
}

// ── Dimensionamento por segmento (pós-propagação) ─────────────────
// Cada segmento dimensiona seus condutores com base no fluxo real
export interface DimensionamentoSegmento {
  segmento_id:  string
  secao_mm2:    number        // bitola calculada
  in_disj_a:    number        // disjuntor selecionado
  curva:        'B'|'C'|'D'
  idr:          boolean
  du_pct:       number        // queda de tensão neste segmento
  du_acum_pct:  number        // queda acumulada desde a raiz
  fa:           number        // fator de agrupamento
  ft:           number        // fator de temperatura
  iz_efetiva:   number        // Iz × Ft × Fa
  status:       'OK'|'LIMITE'|'ERRO'
  violacoes:    string[]
}

// ── Invariantes do domínio (nunca violar) ─────────────────────────
// Se qualquer invariante for violado, o modelo está inconsistente

export function verificarInvariantes(rede: RedeEletrica): string[] {
  const erros: string[] = []

  // 1. Deve existir exatamente um QD
  const qds = rede.nos.filter(n => n.tipo === 'QD')
  if (qds.length === 0) erros.push('INVARIANTE: Rede sem Quadro de Distribuição (QD)')
  if (qds.length > 1)  erros.push('INVARIANTE: Mais de um QD — apenas um permitido por rede')

  // 2. Todos os segmentos devem ter nós existentes
  const nosIds = new Set(rede.nos.map(n => n.id))
  rede.segmentos.forEach(seg => {
    if (!nosIds.has(seg.origem_no_id))
      erros.push(`INVARIANTE: Segmento "${seg.nome}" tem origem inválida`)
    if (!nosIds.has(seg.destino_no_id))
      erros.push(`INVARIANTE: Segmento "${seg.nome}" tem destino inválido`)
    if (seg.origem_no_id === seg.destino_no_id)
      erros.push(`INVARIANTE: Segmento "${seg.nome}" conecta nó a si mesmo`)
  })

  // 3. Segmentos não podem criar ciclos (a rede elétrica é uma árvore/DAG)
  // Verificação simples via DFS de detecção de ciclo
  const visitados = new Set<string>()
  const emStack   = new Set<string>()
  const adj = new Map<string, string[]>()
  rede.nos.forEach(n => adj.set(n.id, []))
  rede.segmentos.forEach(seg => {
    const l = adj.get(seg.origem_no_id) ?? []; l.push(seg.destino_no_id)
    adj.set(seg.origem_no_id, l)
  })

  function temCiclo(no: string): boolean {
    visitados.add(no); emStack.add(no)
    for (const viz of adj.get(no) ?? []) {
      if (!visitados.has(viz) && temCiclo(viz)) return true
      if (emStack.has(viz)) return true
    }
    emStack.delete(no)
    return false
  }
  rede.nos.forEach(n => {
    if (!visitados.has(n.id) && temCiclo(n.id))
      erros.push('INVARIANTE: Ciclo detectado na rede — rede elétrica deve ser acíclica (árvore)')
  })

  return erros
}
