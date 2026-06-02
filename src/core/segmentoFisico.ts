// src/core/segmentoFisico.ts
// ════════════════════════════════════════════════════════════════
// SEGMENTO FÍSICO — infraestrutura compartilhada real
//
// Este é o modelo que conecta:
//   domínio elétrico  → circuitos, condutores, bitolas
//   domínio espacial  → face_id, FaceGraph, trajeto
//   modelo construtivo → ocupação, diâmetro, derivações
//
// Por que isso importa:
//   Antes: cada circuito calculava sua metragem isoladamente.
//   Agora: múltiplos circuitos compartilham o mesmo segmento físico.
//
//   Consequência real:
//   - Fa (fator agrupamento) calculado para o CONJUNTO, não por circuito
//   - Ocupação = soma de todos os cabos no mesmo tubo
//   - Diâmetro = determinado pelo conjunto, não pelo maior cabo
//   - Quantitativo = 1 eletroduto de 5m, não 3 eletrodutos de 5m sobrepostos
//
// Hierarquia:
//   TrajFisico (ponto A → ponto B)
//     └── SegmentoFisico[] (cada face percorrida no caminho)
//            ├── circuito_ids[] (quais circuitos passam aqui)
//            ├── condutores[]   (quais cabos, inferidos dos circuitos)
//            └── eletroduto     (diâmetro e ocupação calculados)
// ════════════════════════════════════════════════════════════════

import { getFa, AREA_INTERNA_ELETRODUTO, getAreaExterna } from '../data/nbr5410tables'

// ── Condutor no segmento ──────────────────────────────────────────
export interface ConductorSegmento {
  readonly circuito_id:  string
  readonly funcao:       'fase' | 'neutro' | 'terra' | 'retorno' | 'viajante'
  readonly secao_mm2:    number
  readonly isolacao:     'PVC' | 'XLPE' | 'EPR'
  readonly cor_nbr5444:  string   // NBR 5444: verde/amarelo=PE, azul=N, outros=fase/retorno
}

// ── Ocupação do eletroduto ────────────────────────────────────────
export interface OcupacaoSegmento {
  readonly area_cabos_mm2:   number
  readonly diametro_mm:      20 | 25 | 32 | 40
  readonly area_interna_mm2: number
  readonly taxa_pct:         number   // 0-100
  readonly limite_pct:       number   // NBR §6.1.5.2: 40% para 2+ cabos
  readonly status:           'OK' | 'LIMITE' | 'EXCEDIDO'
  readonly fa:               number   // fator de agrupamento NBR Tabela 42
}

// ── Derivação no segmento ────────────────────────────────────────
// Onde um ou mais circuitos entram ou saem do eletroduto
export interface Derivacao {
  readonly id:          string
  readonly pos_relativa: number     // 0=início, 1=fim do segmento
  readonly tipo:        'entrada' | 'saida' | 'passagem' | 'caixa_derivacao'
  readonly circuito_ids: string[]   // circuitos que derivam aqui
  readonly caixa_tipo:  '4x2' | '4x4' | 'octogonal' | 'passagem'
}

// ── Segmento Físico ───────────────────────────────────────────────
// Um trecho contínuo de eletroduto ao longo de UMA face
export interface SegmentoFisico {
  readonly id:           string

  // ── Localização espacial ────────────────────────────────────────
  readonly face_id:      string        // FaceParede onde corre este segmento
  readonly parede_id:    string        // ParedeGlobal correspondente
  readonly comprimento_m: number       // comprimento real deste trecho
  readonly altura_m:     number        // altura de instalação na parede/teto

  // ── Circuitos e condutores ──────────────────────────────────────
  readonly circuito_ids: readonly string[]
  readonly condutores:   readonly ConductorSegmento[]

  // ── Eletroduto ──────────────────────────────────────────────────
  readonly ocupacao:     OcupacaoSegmento

  // ── Derivações ──────────────────────────────────────────────────
  readonly derivacoes:   readonly Derivacao[]
}

// ── Trajeto Físico ────────────────────────────────────────────────
// Sequência de segmentos do ponto A até o ponto B
// (ex: do QD até uma tomada, passando por 3 faces)
export interface TrajetoFisico {
  readonly id:              string
  readonly descricao:       string
  readonly circuito_id:     string       // circuito que inicia este trajeto
  readonly segmentos:       readonly SegmentoFisico[]
  // Métricas totais
  readonly comprimento_total_m: number
  readonly n_curvas_90:         number
  readonly n_derivacoes:        number
}

// ── Cálculo de ocupação ───────────────────────────────────────────
// NBR 5410 §6.1.5.2: ≤ 40% para 2+ cabos; ≤ 53% para 1 cabo
function calcOcupacao(condutores: ConductorSegmento[]): OcupacaoSegmento {
  let area_total = 0
  let n_cabos    = 0

  for (const cond of condutores) {
    const area = getAreaExterna(cond.secao_mm2, cond.isolacao) ?? 0
    area_total += area
    n_cabos++
  }

  const n_circ   = new Set(condutores.map(c => c.circuito_id)).size
  const limite   = n_cabos <= 1 ? 53 : 40
  const fa       = getFa(n_circ)

  // Diâmetro mínimo que comporta a ocupação
  const diametros = [20, 25, 32, 40] as const
  let diam: 20 | 25 | 32 | 40 = 40
  for (const d of diametros) {
    const area_int = AREA_INTERNA_ELETRODUTO[d] ?? 0
    if (area_int > 0 && (area_total / area_int * 100) <= limite) {
      diam = d
      break
    }
  }

  const area_int = AREA_INTERNA_ELETRODUTO[diam]
  const taxa     = area_int > 0 ? area_total / area_int * 100 : 0

  return {
    area_cabos_mm2:   Math.round(area_total * 10) / 10,
    diametro_mm:      diam,
    area_interna_mm2: area_int,
    taxa_pct:         Math.round(taxa * 10) / 10,
    limite_pct:       limite,
    status: taxa > limite       ? 'EXCEDIDO'
          : taxa > limite * 0.85 ? 'LIMITE' : 'OK',
    fa,
  }
}

// ── Inferir condutores de um circuito ────────────────────────────
// Baseado no tipo e ligação do circuito
function condutoresDoCircuito(
  circuito_id: string,
  tipo: string,
  secao_mm2: number,
  n_fases: 1 | 2 | 3,
  isolacao: 'PVC' | 'XLPE' | 'EPR' = 'PVC'
): ConductorSegmento[] {
  const conds: ConductorSegmento[] = []

  const fase  = (i: number) => ({
    circuito_id, funcao: 'fase' as const, secao_mm2, isolacao,
    cor_nbr5444: i === 0 ? 'preto' : i === 1 ? 'branco' : 'vermelho',
  })
  const neutro = { circuito_id, funcao: 'neutro' as const, secao_mm2, isolacao, cor_nbr5444: 'azul_claro' }
  const terra  = { circuito_id, funcao: 'terra' as const, secao_mm2: Math.max(2.5, secao_mm2 / 2), isolacao, cor_nbr5444: 'verde_amarelo' }
  const ret    = { circuito_id, funcao: 'retorno' as const, secao_mm2, isolacao, cor_nbr5444: 'vermelho' }

  switch (tipo.toUpperCase()) {
    case 'ILUM':
      conds.push(fase(0), neutro, ret, terra)   // F + N + retorno + PE
      break
    case 'TUG':
      conds.push(fase(0), neutro, terra)         // F + N + PE
      break
    case 'TUE':
      for (let i = 0; i < n_fases; i++) conds.push(fase(i))
      if (n_fases === 1) conds.push(neutro)
      conds.push(terra)
      break
    default:
      conds.push(fase(0), neutro, terra)
  }

  return conds
}

// ── Construir SegmentoFisico ──────────────────────────────────────
export interface CircuitoNoTrajeto {
  readonly id:         string
  readonly tipo:       string
  readonly secao_mm2:  number
  readonly n_fases:    1 | 2 | 3
  readonly isolacao?:  'PVC' | 'XLPE' | 'EPR'
}

export function buildSegmentoFisico(
  id:           string,
  face_id:      string,
  parede_id:    string,
  comprimento_m: number,
  altura_m:     number,
  circuitos:    CircuitoNoTrajeto[],
  derivacoes:   Derivacao[] = []
): SegmentoFisico {
  // Inferir todos os condutores dos circuitos que passam por este segmento
  const condutores: ConductorSegmento[] = circuitos.flatMap(c =>
    condutoresDoCircuito(c.id, c.tipo, c.secao_mm2, c.n_fases, c.isolacao ?? 'PVC')
  )

  return {
    id,
    face_id,
    parede_id,
    comprimento_m,
    altura_m,
    circuito_ids: circuitos.map(c => c.id),
    condutores,
    ocupacao: calcOcupacao(condutores),
    derivacoes,
  }
}

// ── Construir trajeto físico completo ─────────────────────────────
// A partir de uma sequência de face_ids (do FaceGraph),
// constrói os segmentos físicos com os circuitos que compartilham o trajeto
export function buildTrajetoFisico(
  id:          string,
  descricao:   string,
  circuito_id: string,
  face_ids:    string[],   // sequência do caminhoFaces()
  face_comprimentos: Record<string, number>,   // comprimento de cada face
  face_paredes: Record<string, string>,         // parede de cada face
  circuitos_no_trajeto: CircuitoNoTrajeto[],
  altura_m: number
): TrajetoFisico {
  const segmentos: SegmentoFisico[] = face_ids.map((face_id, idx) => {
    const comp = face_comprimentos[face_id] ?? 1.0
    const pid  = face_paredes[face_id] ?? ''
    return buildSegmentoFisico(
      `${id}-seg-${idx}`,
      face_id,
      pid,
      comp,
      altura_m,
      circuitos_no_trajeto
    )
  })

  const n_curvas   = Math.max(0, face_ids.length - 1)  // dobra a cada mudança de face
  const n_deriv    = segmentos.reduce((s, seg) => s + seg.derivacoes.length, 0)
  const comp_total = segmentos.reduce((s, seg) => s + seg.comprimento_m, 0)

  return {
    id,
    descricao,
    circuito_id,
    segmentos,
    comprimento_total_m: Math.round(comp_total * 100) / 100,
    n_curvas_90:         n_curvas,
    n_derivacoes:        n_deriv,
  }
}

// ── Resumo de quantitativos dos trajetos ──────────────────────────
export interface QuantSegmentos {
  readonly eletrodutos: {
    diametro_mm: 20 | 25 | 32 | 40
    metros:      number
    barras_3m:   number
  }[]
  readonly cabos: {
    secao_mm2: number
    isolacao:  string
    metros:    number
    funcao:    string
  }[]
  readonly curvas_90: number
  readonly fa_medio:  number
}

export function quantSegmentos(trajetos: TrajetoFisico[]): QuantSegmentos {
  const elet_map = new Map<number, number>()   // diâmetro → metros
  const cabo_map = new Map<string, number>()   // 'secao:isolacao:funcao' → metros
  let   n_curvas = 0
  let   fa_sum   = 0
  let   fa_n     = 0

  for (const traj of trajetos) {
    n_curvas += traj.n_curvas_90

    for (const seg of traj.segmentos) {
      // Eletroduto
      const d = seg.ocupacao.diametro_mm
      elet_map.set(d, (elet_map.get(d) ?? 0) + seg.comprimento_m)

      // Cabos (cada condutor × comprimento do segmento)
      for (const cond of seg.condutores) {
        const key = `${cond.secao_mm2}:${cond.isolacao}:${cond.funcao}`
        cabo_map.set(key, (cabo_map.get(key) ?? 0) + seg.comprimento_m)
      }

      // Fa médio
      fa_sum += seg.ocupacao.fa
      fa_n++
    }
  }

  const eletrodutos = [...elet_map.entries()]
    .map(([d, m]) => ({
      diametro_mm: d as 20 | 25 | 32 | 40,
      metros:      Math.ceil(m * 1.10),   // +10% folga
      barras_3m:   Math.ceil(m * 1.10 / 3),
    }))
    .sort((a, b) => a.diametro_mm - b.diametro_mm)

  const cabos = [...cabo_map.entries()].map(([key, metros]) => {
    const [secao, isolacao, funcao] = key.split(':')
    return {
      secao_mm2: Number(secao),
      isolacao,
      metros:    Math.ceil(metros * 1.10),
      funcao,
    }
  }).sort((a, b) => a.secao_mm2 - b.secao_mm2)

  return {
    eletrodutos,
    cabos,
    curvas_90: n_curvas,
    fa_medio:  fa_n > 0 ? Math.round(fa_sum / fa_n * 100) / 100 : 1.0,
  }
}
