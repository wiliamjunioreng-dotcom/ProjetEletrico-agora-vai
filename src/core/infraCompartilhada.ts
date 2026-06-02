// src/core/infraCompartilhada.ts
// ════════════════════════════════════════════════════════════════
// INFRAESTRUTURA COMPARTILHADA DO EDIFÍCIO
//
// Este é o módulo de convergência de toda a arquitetura espacial.
//
// Problema: três módulos independentes (eletroduto.ts, infraestrutura.ts,
// segmentoFisico.ts) computam ocupação/agrupamento sem se falar.
//
// Solução: uma entidade única que representa TODA a infraestrutura
// física do edifício — onde cada eletroduto sabe quais circuitos
// carrega, com ocupação real e Fa calculado sobre o conjunto.
//
// Relação com outros módulos:
//   InfraestruturaCompartilhada usa SegmentoFisico (por face)
//   usa GrupoInstalacao (caixas compartilhadas)
//   usa BuildingGraph (topologia de paredes)
//   usa FaceGraph (navegabilidade de superfícies)
//   produz quantitativos reais (metragem, diâmetros, caixas)
//
// Invariante fundamental:
//   "Ocupação = soma de TODOS os cabos que passam pelo segmento"
//   — não por circuito, mas pelo conjunto
// ════════════════════════════════════════════════════════════════

import { getFa, AREA_INTERNA_ELETRODUTO, getAreaExterna } from '../data/nbr5410tables'
import type { GrupoInstalacao } from './grupoInstalacao'
import type { TrajetoFisico, SegmentoFisico, ConductorSegmento } from './segmentoFisico'

// ── Caixa de derivação/passagem ───────────────────────────────────
// Ponto onde circuitos divergem ou se unem na infraestrutura
export interface CaixaDerivacao {
  readonly id:           string
  readonly tipo:         'passagem' | 'derivacao' | 'grupo'
  readonly face_id:      string
  readonly pos_relativa: number       // 0-1 na face
  readonly altura_m:     number
  // Segmentos que chegam e saem desta caixa
  readonly segmento_ids: readonly string[]
  // Circuitos que derivam aqui (entram ou saem)
  readonly circuito_ids: readonly string[]
  // Se tipo='grupo': o GrupoInstalacao correspondente
  readonly grupo_id?:    string
}

// ── Segmento compartilhado (abstração de múltiplos circuitos) ─────
// Representa um trecho de eletroduto onde N circuitos coexistem
export interface TrechoCompartilhado {
  readonly id:           string
  readonly face_id:      string
  readonly parede_id:    string
  readonly comprimento_m: number
  readonly altura_m:     number
  // Todos os circuitos que passam por este trecho
  readonly circuito_ids: readonly string[]
  // Todos os condutores (de todos os circuitos)
  readonly condutores:   readonly ConductorSegmento[]
  // Ocupação do conjunto (não por circuito)
  readonly area_cabos_mm2:   number
  readonly diametro_mm:      20 | 25 | 32 | 40
  readonly area_interna_mm2: number
  readonly taxa_pct:         number
  readonly limite_pct:       number
  readonly status:           'OK' | 'LIMITE' | 'EXCEDIDO'
  // Fa do conjunto (NBR Tabela 42)
  readonly fa:               number
  // N° de curvas ao final deste trecho (dobras)
  readonly n_curvas:         number
}

// ── InfraestruturaCompartilhada — modelo completo ─────────────────
export interface InfraestruturaCompartilhada {
  readonly id:       string
  // Todos os trechos físicos do edifício (por face)
  readonly trechos:  ReadonlyMap<string, TrechoCompartilhado>   // face_id → trecho
  // Caixas (passagem, derivação, grupos de instalação)
  readonly caixas:   readonly CaixaDerivacao[]
  // Trajetos dos circuitos (do QD ao ponto)
  readonly trajetos: readonly TrajetoFisico[]
  // Estatísticas globais
  readonly stats:    InfraStats
}

export interface InfraStats {
  readonly n_trechos:         number
  readonly n_circuitos:       number
  readonly metros_total:      number
  readonly fa_medio:          number
  readonly ocupacao_media_pct: number
  readonly trechos_excedidos: number
  readonly n_caixas_4x2:      number
  readonly n_caixas_4x4:      number
  readonly n_caixas_octogonais: number
}

// ── Construtor do TrechoCompartilhado ─────────────────────────────
function buildTrecho(
  id:           string,
  face_id:      string,
  parede_id:    string,
  comprimento_m: number,
  altura_m:     number,
  segmentos:    SegmentoFisico[],   // segmentos que contribuem para este trecho
  n_curvas = 0
): TrechoCompartilhado {
  // Unir todos os condutores de todos os segmentos neste trecho
  const todos_condutores = segmentos.flatMap(s => s.condutores)
  const circ_ids = [...new Set(segmentos.flatMap(s => [...s.circuito_ids]))]

  // Calcular área total real
  let area_total = 0
  for (const cond of todos_condutores) {
    area_total += getAreaExterna(cond.secao_mm2, cond.isolacao) ?? 0
  }

  const n_cabos  = todos_condutores.length
  const n_circ   = circ_ids.length
  const limite   = n_cabos <= 1 ? 53 : 40
  const fa       = getFa(n_circ)

  // Diâmetro mínimo para a ocupação real
  const diams = [20, 25, 32, 40] as const
  let diam: 20 | 25 | 32 | 40 = 40
  for (const d of diams) {
    const area_int = AREA_INTERNA_ELETRODUTO[d] ?? 0
    if (area_int > 0 && (area_total / area_int * 100) <= limite) {
      diam = d; break
    }
  }

  const area_int = AREA_INTERNA_ELETRODUTO[diam]
  const taxa     = area_int > 0 ? area_total / area_int * 100 : 0

  return {
    id, face_id, parede_id, comprimento_m, altura_m,
    circuito_ids:    circ_ids,
    condutores:      todos_condutores,
    area_cabos_mm2:  Math.round(area_total * 10) / 10,
    diametro_mm:     diam,
    area_interna_mm2: area_int,
    taxa_pct:        Math.round(taxa * 10) / 10,
    limite_pct:      limite,
    status: taxa > limite       ? 'EXCEDIDO'
          : taxa > limite * 0.85 ? 'LIMITE' : 'OK',
    fa,
    n_curvas,
  }
}

// ── Builder principal ─────────────────────────────────────────────
// Constrói a InfraestruturaCompartilhada a partir dos trajetos
// dos circuitos e dos grupos de instalação
export function buildInfraestruturaCompartilhada(
  trajetos:  TrajetoFisico[],
  grupos:    GrupoInstalacao[] = [],
  id        = 'infra-edificio'
): InfraestruturaCompartilhada {

  // 1. Agrupar segmentos de todos os trajetos por face_id
  //    Múltiplos circuitos podem compartilhar a mesma face
  const seg_por_face = new Map<string, SegmentoFisico[]>()

  for (const traj of trajetos) {
    for (const seg of traj.segmentos) {
      const lista = seg_por_face.get(seg.face_id) ?? []
      lista.push(seg)
      seg_por_face.set(seg.face_id, lista)
    }
  }

  // 2. Construir TrechoCompartilhado por face
  const trechos = new Map<string, TrechoCompartilhado>()
  let trecho_idx = 0

  for (const [face_id, segs] of seg_por_face) {
    // Comprimento = max dos segmentos nesta face (a face tem um comprimento fixo)
    const comp = Math.max(...segs.map(s => s.comprimento_m))
    const alt  = segs[0]?.altura_m ?? 0.30
    const pid  = segs[0]?.parede_id ?? ''

    // N° de curvas = max das dobras nesta face (entre trajetos)
    const n_curvas = Math.max(...trajetos.map(t => {
      const idx = t.segmentos.findIndex(s => s.face_id === face_id)
      return idx > 0 ? 1 : 0   // simplificado: 1 curva se não é o primeiro segmento
    }))

    const trecho = buildTrecho(
      `tr-${trecho_idx++}`, face_id, pid, comp, alt, segs, n_curvas
    )
    trechos.set(face_id, trecho)
  }

  // 3. Construir caixas de derivação dos grupos
  const caixas: CaixaDerivacao[] = grupos.map((g, i) => ({
    id:           `cx-grupo-${i}`,
    tipo:         'grupo',
    face_id:      g.face_id,
    pos_relativa: g.pos_relativa,
    altura_m:     g.altura_m,
    segmento_ids: [],   // a ser preenchido pelo routing futuro
    circuito_ids: g.elementos.map(e => e.circuito_id ?? '').filter(Boolean),
    grupo_id:     g.id,
  }))

  // 4. Calcular estatísticas
  const arr = [...trechos.values()]
  const metros_total = arr.reduce((s, t) => s + t.comprimento_m, 0)
  const fa_medio     = arr.length > 0
    ? arr.reduce((s, t) => s + t.fa, 0) / arr.length : 1.0
  const ocp_media    = arr.length > 0
    ? arr.reduce((s, t) => s + t.taxa_pct, 0) / arr.length : 0

  const stats: InfraStats = {
    n_trechos:           trechos.size,
    n_circuitos:         new Set(trajetos.map(t => t.circuito_id)).size,
    metros_total:        Math.round(metros_total * 100) / 100,
    fa_medio:            Math.round(fa_medio * 100) / 100,
    ocupacao_media_pct:  Math.round(ocp_media * 10) / 10,
    trechos_excedidos:   arr.filter(t => t.status === 'EXCEDIDO').length,
    n_caixas_4x2:        grupos.filter(g => g.caixa === '4x2').length,
    n_caixas_4x4:        grupos.filter(g => g.caixa === '4x4').length,
    n_caixas_octogonais: 0,  // luminárias: calculado por tipo de grupo
  }

  return { id, trechos, caixas, trajetos, stats }
}

// ── Quantitativos emergindo da infraestrutura ─────────────────────
export interface QuantInfra {
  eletrodutos: { diametro_mm: 20|25|32|40; metros: number; barras_3m: number }[]
  cabos:       { secao_mm2: number; isolacao: string; metros: number; funcao: string }[]
  caixas:      { tipo: string; qtd: number }[]
  curvas_90:   number
  fa_medio:    number
  avisos:      { trecho_id: string; descricao: string; acao: string }[]
}

export function quantInfra(infra: InfraestruturaCompartilhada): QuantInfra {
  const elet_map = new Map<number, number>()
  const cabo_map = new Map<string, number>()
  let curvas = 0
  const avisos: { trecho_id: string; descricao: string; acao: string }[] = []

  for (const [, t] of infra.trechos) {
    const m = t.comprimento_m * 1.10   // +10% folga
    elet_map.set(t.diametro_mm, (elet_map.get(t.diametro_mm) ?? 0) + m)
    curvas += t.n_curvas

    for (const cond of t.condutores) {
      const key = `${cond.secao_mm2}:${cond.isolacao}:${cond.funcao}`
      cabo_map.set(key, (cabo_map.get(key) ?? 0) + t.comprimento_m * 1.10)
    }

    if (t.status === 'EXCEDIDO') {
      avisos.push({
        trecho_id:  t.id,
        descricao: `Face ${t.face_id}: ocupação ${t.taxa_pct.toFixed(0)}% > ${t.limite_pct}%`,
        acao:      `Aumentar para ⌀${t.diametro_mm <= 32 ? t.diametro_mm + 8 : 50}mm`,
      })
    }
  }

  return {
    eletrodutos: [...elet_map.entries()]
      .map(([d, m]) => ({
        diametro_mm: d as 20|25|32|40,
        metros: Math.ceil(m),
        barras_3m: Math.ceil(m / 3),
      }))
      .sort((a, b) => a.diametro_mm - b.diametro_mm),

    cabos: [...cabo_map.entries()].map(([key, metros]) => {
      const [secao, isolacao, funcao] = key.split(':')
      return { secao_mm2: Number(secao), isolacao, metros: Math.ceil(metros), funcao }
    }).sort((a, b) => a.secao_mm2 - b.secao_mm2),

    caixas: [
      { tipo: 'Caixa 4×2"',  qtd: infra.stats.n_caixas_4x2  },
      { tipo: 'Caixa 4×4"',  qtd: infra.stats.n_caixas_4x4  },
      { tipo: 'Octogonal',   qtd: infra.stats.n_caixas_octogonais },
    ].filter(c => c.qtd > 0),

    curvas_90:  curvas,
    fa_medio:   infra.stats.fa_medio,
    avisos,
  }
}

// ── Verificar consistência ────────────────────────────────────────
export interface InconsistenciaInfra {
  tipo:        'trecho_sem_circuito' | 'ocupacao_excedida' | 'fa_critico'
  trecho_id:   string
  descricao:   string
}

export function verificarInfra(infra: InfraestruturaCompartilhada): InconsistenciaInfra[] {
  const probs: InconsistenciaInfra[] = []

  for (const [, t] of infra.trechos) {
    if (t.circuito_ids.length === 0) {
      probs.push({ tipo: 'trecho_sem_circuito', trecho_id: t.id,
        descricao: `Trecho ${t.face_id} não tem circuitos` })
    }
    if (t.status === 'EXCEDIDO') {
      probs.push({ tipo: 'ocupacao_excedida', trecho_id: t.id,
        descricao: `Trecho ${t.face_id}: ${t.taxa_pct.toFixed(0)}% > ${t.limite_pct}%` })
    }
    if (t.fa < 0.5) {
      probs.push({ tipo: 'fa_critico', trecho_id: t.id,
        descricao: `Fa=${t.fa.toFixed(2)} — ${t.circuito_ids.length} circuitos causam degradação severa` })
    }
  }

  return probs
}
