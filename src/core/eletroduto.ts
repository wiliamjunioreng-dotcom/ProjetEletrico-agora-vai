// src/core/eletroduto.ts
// ════════════════════════════════════════════════════════════════
// INFRAESTRUTURA COMPARTILHADA DE ELETRODUTO
//
// Problema: cada circuito calculado como se tivesse eletroduto próprio.
// Realidade: circuitos compartilham trajetos → afetam Fa mutuamente.
//
// Consequências do compartilhamento:
//   1. Fator de agrupamento (Fa) menor → Iz' menor → seção maior
//   2. Ocupação física do eletroduto limitada (NBR 5410 §6.2.11)
//   3. Aquecimento mútuo (já modelado via Fa)
//
// Este módulo:
//   - agrupa circuitos que passam pelo mesmo eletroduto
//   - calcula Fa real do grupo
//   - verifica ocupação física
//   - retorna alertas se seções precisam ser revisadas
// ════════════════════════════════════════════════════════════════

import { getFa, AREA_INTERNA_ELETRODUTO, getDiametroExterno, getAreaExterna } from '../data/nbr5410tables'

// ── Circuito para agrupamento ─────────────────────────────────────
export interface CircuitoParaAgrupar {
  readonly id:          string
  readonly tipo:        string
  readonly secao_mm2:   number   // seção da fase (já calculada)
  readonly n_condutores: number  // total: fases + neutros + PE + retorno
  readonly comprimento_m: number
  readonly isolacao:    'PVC' | 'XLPE' | 'EPR'
}

// ── Grupo de circuitos num mesmo eletroduto ────────────────────────
export interface GrupoEletroduto {
  readonly id:            string
  readonly descricao:     string
  // Circuitos que compartilham este eletroduto
  readonly circuito_ids:  string[]
  readonly n_circuitos:   number
  // Fator de agrupamento real (NBR 5410 Tabela 42)
  readonly fa_real:       number
  // Diâmetro mínimo necessário pela ocupação
  readonly diametro_mm:   20 | 25 | 32 | 40 | 50
  // Análise de ocupação
  readonly ocupacao:      OcupacaoEletroduto
  // Circuitos que precisam de seção revisada por causa do Fa real
  readonly revisoes:      RevisaoSeção[]
}

export interface OcupacaoEletroduto {
  readonly area_condutores_mm2: number
  readonly area_eletroduto_mm2: number
  readonly taxa_ocupacao_pct:   number    // NBR: ≤ 40% para 2+ condutores
  readonly status:              'OK' | 'LIMITE' | 'EXCEDIDO'
  readonly limite_pct:          number    // 40% para ≥2 circuitos
}

export interface RevisaoSeção {
  readonly circuito_id: string
  readonly secao_atual: number
  readonly fa_anterior: number    // Fa usado no cálculo original
  readonly fa_real:     number    // Fa real (com todos os circuitos do grupo)
  readonly precisa_revisar: boolean
  readonly motivo:      string
}

// ── Fator de ocupação por número de CONDUTORES ────────────────────
// NBR 5410 §6.2.11.1.6 — a regra é por CONDUTOR, não por circuito:
//   1 condutor  → 53%
//   2 condutores → 31%
//   3 ou mais    → 40%
// BUG CORRIGIDO: a versão anterior usava nº de CIRCUITOS e retornava
// 53% para "1 circuito" — mas um circuito monofásico completo já tem
// 3 condutores (F+N+PE), cujo limite correto é 40%. O valor 53%
// (permissivo demais) só vale para 1 condutor isolado, situação que
// praticamente não ocorre em instalação predial com circuitos completos.
export function limiteOcupacaoPct(n_condutores: number): number {
  if (n_condutores <= 1) return 53
  if (n_condutores === 2) return 31
  return 40
}

// ── Calcular área total de condutores no grupo ────────────────────
export function areaCondutoresGrupo(
  circuitos: CircuitoParaAgrupar[],
  isolacao: 'PVC' | 'XLPE' = 'PVC'
): number {
  let area_total = 0
  for (const c of circuitos) {
    // Área externa de cada condutor × quantidade de condutores
    const d_ext = getDiametroExterno(c.secao_mm2, isolacao)
    if (d_ext > 0) {
      const area_unit = getAreaExterna(c.secao_mm2, isolacao)
      area_total += area_unit * c.n_condutores
    }
  }
  return Math.round(area_total * 10) / 10
}

// ── Selecionar menor diâmetro que comporta os condutores ─────────
export function diametroMinimo(
  area_condutores_mm2: number,
  n_condutores: number
): 20 | 25 | 32 | 40 | 50 {
  const ocupacao_max_pct = limiteOcupacaoPct(n_condutores)
  const diametros: (20 | 25 | 32 | 40 | 50)[] = [20, 25, 32, 40, 50]

  for (const d of diametros) {
    const area_interna = AREA_INTERNA_ELETRODUTO[d] ?? 0
    const taxa = (area_condutores_mm2 / area_interna) * 100
    if (taxa <= ocupacao_max_pct) return d
  }
  return 50  // maior disponível — pode estar excedido
}

// ── Construir grupo de eletroduto ─────────────────────────────────
export function buildGrupoEletroduto(
  grupo_id: string,
  descricao: string,
  circuitos: CircuitoParaAgrupar[]
): GrupoEletroduto {
  if (circuitos.length === 0) throw new Error('Grupo vazio')

  const n = circuitos.length
  const fa_real = getFa(n)

  // Área física dos condutores
  const area_condutores = areaCondutoresGrupo(circuitos)

  // Total de CONDUTORES no eletroduto (a regra de ocupação da norma
  // é por condutor, não por circuito — §6.2.11.1.6)
  const n_condutores_total = circuitos.reduce((s, c) => s + c.n_condutores, 0)

  // Diâmetro mínimo
  const diametro = diametroMinimo(area_condutores, n_condutores_total)
  const area_eletroduto = AREA_INTERNA_ELETRODUTO[diametro] ?? 0
  const taxa = area_eletroduto > 0 ? (area_condutores / area_eletroduto) * 100 : 999
  const limite = limiteOcupacaoPct(n_condutores_total)

  const ocupacao: OcupacaoEletroduto = {
    area_condutores_mm2: area_condutores,
    area_eletroduto_mm2: area_eletroduto,
    taxa_ocupacao_pct:   Math.round(taxa * 10) / 10,
    status:              taxa > limite ? 'EXCEDIDO' : taxa > limite * 0.9 ? 'LIMITE' : 'OK',
    limite_pct:          limite,
  }

  // Verificar se circuitos precisam de revisão de seção
  // (foram calculados com Fa diferente do real)
  const revisoes: RevisaoSeção[] = circuitos.map(c => {
    // Estimar o Fa que foi usado originalmente (n_agrup declarado pelo engenheiro)
    // Sem informação do Fa original, comparar com Fa=1.0 (sem agrupamento)
    const fa_anterior = 1.0  // assumir que foi calculado sem agrupamento
    const precisa = fa_real < fa_anterior * 0.95  // diferença > 5%

    return {
      circuito_id:      c.id,
      secao_atual:      c.secao_mm2,
      fa_anterior,
      fa_real,
      precisa_revisar:  precisa,
      motivo:           precisa
        ? `Fa real (${fa_real.toFixed(2)}) < Fa original (${fa_anterior.toFixed(2)}) — verificar se seção ${c.secao_mm2}mm² ainda suporta Irc corrigida`
        : 'Seção OK com Fa real do grupo',
    }
  })

  return {
    id:           grupo_id,
    descricao,
    circuito_ids: circuitos.map(c => c.id),
    n_circuitos:  n,
    fa_real,
    diametro_mm:  diametro,
    ocupacao,
    revisoes,
  }
}

// ── Agrupamento automático por tipo de circuito ───────────────────
// Heurística: circuitos do mesmo tipo e cômodo compartilham eletroduto
// (fundação para agrupamento por FaceGraph no futuro)
export function agruparAutomatico(
  circuitos: CircuitoParaAgrupar[],
  max_por_grupo = 6  // NBR 5410: máx 6 para Fa sem degradação severa
): GrupoEletroduto[] {
  const grupos: GrupoEletroduto[] = []

  // Agrupar: até max_por_grupo circuitos por eletroduto
  // Estratégia simples: ordenar por seção (maiores primeiro) e agrupar
  const ordenados = [...circuitos].sort((a, b) => b.secao_mm2 - a.secao_mm2)
  let grupo_atual: CircuitoParaAgrupar[] = []
  let grupo_idx = 0

  for (const c of ordenados) {
    grupo_atual.push(c)

    if (grupo_atual.length >= max_por_grupo) {
      grupos.push(buildGrupoEletroduto(
        `G${String(++grupo_idx).padStart(2,'0')}`,
        `Grupo ${grupo_idx} (${grupo_atual.length} circuitos)`,
        [...grupo_atual]
      ))
      grupo_atual = []
    }
  }

  // Último grupo (pode ser menor)
  if (grupo_atual.length > 0) {
    grupos.push(buildGrupoEletroduto(
      `G${String(++grupo_idx).padStart(2,'0')}`,
      `Grupo ${grupo_idx} (${grupo_atual.length} circuito${grupo_atual.length > 1 ? 's' : ''})`,
      [...grupo_atual]
    ))
  }

  return grupos
}

// ── Resumo de infraestrutura ──────────────────────────────────────
export interface ResumoInfraestrutura {
  grupos:         GrupoEletroduto[]
  n_revisoes:     number       // circuitos que precisam rever seção
  status_geral:   'OK' | 'ATENÇÃO' | 'CRÍTICO'
  eletrodutos:    {            // resumo por diâmetro
    diametro_mm: number
    qtd_grupos:  number
    descricao:   string
  }[]
}

export function resumoInfraestrutura(grupos: GrupoEletroduto[]): ResumoInfraestrutura {
  const n_revisoes = grupos.reduce((s, g) =>
    s + g.revisoes.filter(r => r.precisa_revisar).length, 0)

  const n_excedidos = grupos.filter(g => g.ocupacao.status === 'EXCEDIDO').length

  const elet_map = new Map<number, number>()
  for (const g of grupos) {
    elet_map.set(g.diametro_mm, (elet_map.get(g.diametro_mm) ?? 0) + 1)
  }

  return {
    grupos,
    n_revisoes,
    status_geral: n_excedidos > 0 ? 'CRÍTICO' : n_revisoes > 0 ? 'ATENÇÃO' : 'OK',
    eletrodutos: [...elet_map.entries()].map(([d, qtd]) => ({
      diametro_mm: d,
      qtd_grupos:  qtd,
      descricao:   `Eletroduto ⌀${d}mm — ${qtd} grupo(s)`,
    })).sort((a, b) => a.diametro_mm - b.diametro_mm),
  }
}
