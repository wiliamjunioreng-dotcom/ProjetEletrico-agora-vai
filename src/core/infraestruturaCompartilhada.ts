// src/core/infraestruturaCompartilhada.ts
// ════════════════════════════════════════════════════════════════
// INFRAESTRUTURA COMPARTILHADA DO EDIFÍCIO
//
// Este módulo une o que antes estava fragmentado:
//   eletroduto.ts      → agrupamento de circuitos
//   infraestrutura.ts  → ocupação por cômodo
//   segmentoFisico.ts  → segmento por face
//   grupoInstalacao.ts → caixa compartilhada
//
// InfraestruturaCompartilhada é o modelo unificado que responde:
//   "Dado o conjunto de circuitos e a topologia espacial,
//    quais são os eletrodutos físicos, quais circuitos passam
//    em cada um, qual a ocupação real, quais caixas existem?"
//
// Isso é o que diferencia:
//   "calcular cabo por circuito"  (o que havia antes)
//   de:
//   "modelar instalação construtiva real"  (o que este módulo faz)
// ════════════════════════════════════════════════════════════════

import type { ArestaFace } from './faceGraph'
import type { ConductorSegmento, OcupacaoSegmento } from './segmentoFisico'
import type { GrupoInstalacao } from './grupoInstalacao'
import { buildSegmentoFisico } from './segmentoFisico'

// ── Eletroduto físico compartilhado ──────────────────────────────
// Um trecho de eletroduto real, com todos os circuitos que passam por ele
export interface EletrodutoFisico {
  readonly id:           string
  // Localização espacial
  readonly face_id:      string
  readonly parede_id:    string
  readonly comprimento_m: number
  readonly altura_m:     number        // centro do eletroduto em relação ao piso
  // Circuitos que passam
  readonly circuito_ids: readonly string[]
  // Condutores reais (todos os cabos no tubo)
  readonly condutores:   readonly ConductorSegmento[]
  // Ocupação calculada
  readonly ocupacao:     OcupacaoSegmento
  // Curvas e transições
  readonly curva_entrada?: ArestaFace  // dobra no início (canto de parede)
  readonly curva_saida?:   ArestaFace  // dobra no fim
}

// ── Caixa física do grupo ────────────────────────────────────────
export interface CaixaFisica {
  readonly id:          string
  readonly grupo_id:    string         // GrupoInstalacao que originou esta caixa
  readonly face_id:     string
  readonly parede_id:   string
  readonly pos_relativa: number        // 0-1 na parede
  readonly altura_m:    number
  readonly tipo:        '4x2' | '4x4' | 'octogonal' | 'passagem'
  // Circuitos que chegam nesta caixa
  readonly circuito_ids: readonly string[]
  // Eletrodutos conectados a esta caixa
  readonly eletroduto_ids: readonly string[]
}

// ── InfraestruturaCompartilhada — o modelo unificado ─────────────
export interface InfraestruturaCompartilhada {
  // Eletrodutos físicos por face (agrupados por trajeto compartilhado)
  readonly eletrodutos:  readonly EletrodutoFisico[]
  // Caixas físicas (uma por grupo de instalação)
  readonly caixas:       readonly CaixaFisica[]
  // Avisos normativos
  readonly avisos:       readonly AvisoInfra[]
  // Quantitativo total
  readonly quant:        QuantInfra
}

export interface AvisoInfra {
  readonly tipo:          'OCUPACAO_EXCEDIDA' | 'FA_CRITICO' | 'CAIXA_CHEIA' | 'DERIVACAO_FALTANDO'
  readonly entidade_id:   string
  readonly descricao:     string
  readonly acao:          string
}

export interface QuantInfra {
  // Eletrodutos por diâmetro (metros com +10% folga)
  readonly eletrodutos: { diametro_mm: number; metros: number; barras_3m: number }[]
  // Cabos por seção e função (metros)
  readonly cabos:       { secao_mm2: number; funcao: string; metros: number }[]
  // Caixas por tipo (quantidade)
  readonly caixas:      { tipo: string; qtd: number }[]
  // Curvas 90°
  readonly curvas_90:   number
  // Fa médio do projeto
  readonly fa_medio:    number
}

// ── Inputs para construir a infraestrutura ────────────────────────
export interface InputCircuito {
  readonly id:         string
  readonly descricao:  string
  readonly tipo:       string
  readonly secao_mm2:  number
  readonly n_fases:    1 | 2 | 3
  readonly comprimento_m: number
  readonly comodo_id?: string
  readonly face_ids?:  string[]  // faces do trajeto (do FaceGraph)
}

export interface InputFace {
  readonly id:          string
  readonly parede_id:   string
  readonly comprimento_m: number
  readonly comodo_id:   string
}

// ── Construir InfraestruturaCompartilhada ─────────────────────────
export function buildInfraestruturaCompartilhada(
  circuitos:  InputCircuito[],
  grupos:     GrupoInstalacao[],
  faces:      Map<string, InputFace>
): InfraestruturaCompartilhada {

  // 1. Agrupar circuitos por face (compartilham eletroduto)
  //    Circuitos que passam pela mesma face = mesmo eletroduto
  const face_to_circs = new Map<string, InputCircuito[]>()

  for (const circ of circuitos) {
    const face_ids = circ.face_ids ?? (circ.comodo_id ? [`face-${circ.comodo_id}`] : [])
    for (const fid of face_ids) {
      const lista = face_to_circs.get(fid) ?? []
      lista.push(circ)
      face_to_circs.set(fid, lista)
    }
  }

  // 2. Construir EletrodutoFisico para cada face com circuitos
  const eletrodutos: EletrodutoFisico[] = []

  for (const [face_id, circs] of face_to_circs) {
    const face = faces.get(face_id)
    if (!face) continue

    // Inferir condutores de todos os circuitos
    const seg = buildSegmentoFisico(
      `elet-${face_id}`,
      face_id,
      face.parede_id,
      face.comprimento_m,
      0.30,   // altura padrão — será refinada pelo GrupoInstalacao
      circs.map(c => ({
        id: c.id, tipo: c.tipo,
        secao_mm2: c.secao_mm2,
        n_fases:   c.n_fases,
      }))
    )

    eletrodutos.push({
      id:            `elet-${face_id}`,
      face_id,
      parede_id:     face.parede_id,
      comprimento_m: face.comprimento_m,
      altura_m:      0.30,
      circuito_ids:  circs.map(c => c.id),
      condutores:    seg.condutores,
      ocupacao:      seg.ocupacao,
    })
  }

  // 3. Construir CaixaFisica para cada GrupoInstalacao
  const caixas: CaixaFisica[] = grupos.map(g => ({
    id:           `caixa-${g.id}`,
    grupo_id:     g.id,
    face_id:      g.face_id,
    parede_id:    g.parede_id,
    pos_relativa: g.pos_relativa,
    altura_m:     g.altura_m,
    tipo:         g.caixa,
    circuito_ids: g.elementos.map(e => e.circuito_id).filter((id): id is string => !!id),
    eletroduto_ids: eletrodutos
      .filter(e => e.face_id === g.face_id)
      .map(e => e.id),
  }))

  // 4. Gerar avisos normativos
  const avisos: AvisoInfra[] = []

  for (const e of eletrodutos) {
    if (e.ocupacao.status === 'EXCEDIDO') {
      avisos.push({
        tipo:        'OCUPACAO_EXCEDIDA',
        entidade_id: e.id,
        descricao:   `Eletroduto na face ${e.face_id}: ${e.ocupacao.taxa_pct.toFixed(0)}% > ${e.ocupacao.limite_pct}%`,
        acao:        `Aumentar para ⌀${e.ocupacao.diametro_mm + 5}mm ou dividir em dois eletrodutos`,
      })
    }
    if (e.ocupacao.fa < 0.65) {
      avisos.push({
        tipo:        'FA_CRITICO',
        entidade_id: e.id,
        descricao:   `Fa=${e.ocupacao.fa.toFixed(2)} — ${e.circuito_ids.length} circuitos agrupados reduzem Iz' severamente`,
        acao:        'Dividir em dois eletrodutos (máx 6 circuitos por eletroduto)',
      })
    }
  }

  // 5. Quantitativo agregado
  const quant = calcQuantInfra(eletrodutos, caixas)

  return { eletrodutos, caixas, avisos, quant }
}

// ── Quantitativo agregado ─────────────────────────────────────────
function calcQuantInfra(
  eletrodutos: EletrodutoFisico[],
  caixas:      CaixaFisica[]
): QuantInfra {
  // Eletrodutos por diâmetro
  const elet_map = new Map<number, number>()
  for (const e of eletrodutos) {
    const d = e.ocupacao.diametro_mm
    elet_map.set(d, (elet_map.get(d) ?? 0) + e.comprimento_m)
  }

  // Cabos por seção e função
  const cabo_map = new Map<string, number>()
  for (const e of eletrodutos) {
    for (const c of e.condutores) {
      const key = `${c.secao_mm2}:${c.funcao}`
      cabo_map.set(key, (cabo_map.get(key) ?? 0) + e.comprimento_m)
    }
  }

  // Caixas por tipo
  const caixa_map = new Map<string, number>()
  for (const c of caixas) {
    caixa_map.set(c.tipo, (caixa_map.get(c.tipo) ?? 0) + 1)
  }

  // Fa médio
  const fa_sum = eletrodutos.reduce((s, e) => s + e.ocupacao.fa, 0)
  const fa_med = eletrodutos.length > 0 ? fa_sum / eletrodutos.length : 1.0

  // Curvas: estimativa de 2 por eletroduto
  const curvas = eletrodutos.length * 2

  return {
    eletrodutos: [...elet_map.entries()].map(([d, m]) => ({
      diametro_mm: d,
      metros:      Math.ceil(m * 1.10),
      barras_3m:   Math.ceil(m * 1.10 / 3),
    })).sort((a, b) => a.diametro_mm - b.diametro_mm),

    cabos: [...cabo_map.entries()].map(([key, metros]) => {
      const [secao, funcao] = key.split(':')
      return { secao_mm2: Number(secao), funcao, metros: Math.ceil(metros * 1.10) }
    }).sort((a, b) => a.secao_mm2 - b.secao_mm2),

    caixas: [...caixa_map.entries()].map(([tipo, qtd]) => ({ tipo, qtd })),
    curvas_90: curvas,
    fa_medio:  Math.round(fa_med * 100) / 100,
  }
}

// ── Verificar consistência ────────────────────────────────────────
export function verificarInfrastrutura(infra: InfraestruturaCompartilhada): AvisoInfra[] {
  return [...infra.avisos]  // avisos já calculados no build
}
