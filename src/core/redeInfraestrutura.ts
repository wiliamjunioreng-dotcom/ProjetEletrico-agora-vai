// src/core/redeInfraestrutura.ts
// ════════════════════════════════════════════════════════════════
// REDE DE INFRAESTRUTURA FÍSICA
//
// InfraestruturaCompartilhada → segmentos e caixas existem, mas ISOLADOS.
//
// Problema: o eletroduto é fisicamente contínuo.
//   Segmento na face N → canto NE → Segmento na face L → derivação → Segmento final
//
// Consequências de ignorar a continuidade:
//   - ocupação calculada errada (condutores que saem no meio contam por todo o trajeto)
//   - curvas não contabilizadas (cada canto = 1 curva = custo real)
//   - puxamento máximo ignorado (limite de comprimento contínuo)
//   - quantitativo de eletroduto duplicado (segmentos independentes somados)
//
// Este módulo modela:
//   NoInfra   → ponto de conexão entre segmentos (canto, caixa, derivação)
//   RedeInfraestrutura → grafo de segmentos conectados por nós
//   OcupacaoVariavel → como a ocupação muda ao longo do eletroduto
// ════════════════════════════════════════════════════════════════

import type { OcupacaoSegmento, ConductorSegmento } from './segmentoFisico'
import { buildSegmentoFisico } from './segmentoFisico'
import type { EletrodutoFisico, CaixaFisica } from './infraestruturaCompartilhada'
import type { ArestaFace } from './faceGraph'

// ── Tipo de nó de infraestrutura ──────────────────────────────────
export type TipoNoInfra =
  | 'canto'          // dobra entre faces (transição via ArestaFace)
  | 'derivacao'      // circuito entra ou sai do eletroduto
  | 'caixa_passagem' // caixa de passagem obrigatória (puxamento)
  | 'caixa_saida'    // ponto de instalação final (tomada, lum.)
  | 'quadro'         // ponto de origem (QD)
  | 'junção'         // múltiplos eletrodutos se unem

// ── Nó de infraestrutura ─────────────────────────────────────────
// Ponto onde a topologia elétrica muda ou o eletroduto dobra
export interface NoInfra {
  readonly id:           string
  readonly tipo:         TipoNoInfra
  // Localização
  readonly face_id?:     string
  readonly parede_id?:   string
  readonly pos_m:        number   // posição ao longo da face (metros do início)
  readonly altura_m:     number
  // Conectividade
  readonly segmento_entrada_ids: readonly string[]   // segmentos que chegam
  readonly segmento_saida_ids:   readonly string[]   // segmentos que partem
  // Para derivações: quais circuitos mudam aqui
  readonly circuitos_entram?: readonly string[]
  readonly circuitos_saem?:   readonly string[]
  // Para cantos: aresta do FaceGraph
  readonly aresta_face?:      ArestaFace
  // Caixa física (se tiver)
  readonly caixa_id?:         string
}

// ── Segmento de rede ─────────────────────────────────────────────
// Trecho contínuo entre dois nós — ocup. uniforme ao longo deste trecho
export interface SegmentoRede {
  readonly id:             string
  // Geometria
  readonly face_id:        string
  readonly parede_id:      string
  readonly comprimento_m:  number
  readonly altura_m:       number
  // Conectividade
  readonly no_inicio_id:   string
  readonly no_fim_id:      string
  // Circuitos presentes NESTE trecho (pode diferir de outros trechos do mesmo eletroduto)
  readonly circuito_ids:   readonly string[]
  readonly condutores:     readonly ConductorSegmento[]
  // Ocupação calculada para este trecho específico
  readonly ocupacao:       OcupacaoSegmento
}

// ── Rede de infraestrutura ────────────────────────────────────────
export interface RedeInfraestrutura {
  readonly segmentos:  Map<string, SegmentoRede>
  readonly nos:        Map<string, NoInfra>
  // Índice auxiliar: circuito → segmentos que o contêm
  readonly circ_segs:  Map<string, string[]>  // circuito_id → segmento_ids
  // Quantitativo emergindo da rede real
  readonly quant:      QuantRede
}

export interface QuantRede {
  // Metros reais de eletroduto (não duplicados por compartilhamento)
  readonly eletrodutos: { diametro_mm: number; metros: number; barras_3m: number }[]
  // Cabos: metros × condutores (calculados trecho a trecho)
  readonly cabos:       { secao_mm2: number; funcao: string; metros: number; cor: string }[]
  // Curvas reais (uma por nó tipo 'canto')
  readonly curvas_90:   number
  readonly curvas_45:   number
  // Caixas
  readonly caixas:      { tipo: string; qtd: number }[]
  // Comprimento máximo de puxamento (entre caixas de passagem)
  readonly puxamento_max_m: number
  // Fa médio ponderado pelo comprimento
  readonly fa_medio:    number
  // Avisos de construtibilidade
  readonly avisos:      AvisoRede[]
}

export interface AvisoRede {
  readonly tipo:        'PUXAMENTO_EXCEDIDO' | 'CURVAS_EXCEDIDAS' | 'OCUPACAO_EXCEDIDA' | 'FA_CRITICO'
  readonly segmento_id?: string
  readonly no_id?:       string
  readonly descricao:   string
  readonly acao:        string
}

// Limites construtivos NBR / boas práticas
const PUXAMENTO_MAX_M  = 15   // NBR 5410: máx 15m entre caixas de passagem
const FA_CRITICO       = 0.65 // Fa < 0.65 → risco de sobreaquecimento

// ── Construir RedeInfraestrutura ─────────────────────────────────
// A partir dos eletrodutos físicos e caixas de InfraestruturaCompartilhada,
// constrói a rede de grafos com nós e segmentos conectados.
export function buildRedeInfraestrutura(
  eletrodutos: readonly EletrodutoFisico[],
  caixas:      readonly CaixaFisica[],
): RedeInfraestrutura {
  const segmentos  = new Map<string, SegmentoRede>()
  const nos        = new Map<string, NoInfra>()
  const circ_segs  = new Map<string, string[]>()

  // Índice: caixa por face_id para encontrar nós de derivação
  const caixas_por_face = new Map<string, CaixaFisica[]>()
  for (const c of caixas) {
    const lista = caixas_por_face.get(c.face_id) ?? []
    lista.push(c)
    caixas_por_face.set(c.face_id, lista)
  }

  // Para cada eletroduto: criar nó de início, nó de fim, e segmentos internos
  for (const elet of eletrodutos) {
    // Nó de início do eletroduto
    const no_ini_id = `no-ini-${elet.id}`
    if (!nos.has(no_ini_id)) {
      nos.set(no_ini_id, {
        id: no_ini_id, tipo: 'canto',
        face_id: elet.face_id, parede_id: elet.parede_id,
        pos_m: 0, altura_m: elet.altura_m,
        segmento_entrada_ids: [],
        segmento_saida_ids:   [],
      })
    }

    // Caixas na face: cada caixa é um nó de derivação
    const caixas_nesta_face = (caixas_por_face.get(elet.face_id) ?? [])
      .sort((a, b) => a.pos_relativa - b.pos_relativa)

    // Calcular posição absoluta das caixas (metros)
    const posicoes_caixas = caixas_nesta_face.map(c => ({
      caixa: c,
      pos_m: c.pos_relativa * elet.comprimento_m,
    }))

    // Criar nós de derivação nas caixas
    for (const { caixa, pos_m } of posicoes_caixas) {
      const no_id = `no-caixa-${caixa.id}`
      nos.set(no_id, {
        id:         no_id,
        tipo:       'caixa_saida',
        face_id:    elet.face_id,
        parede_id:  elet.parede_id,
        pos_m,
        altura_m:   caixa.altura_m,
        segmento_entrada_ids: [],
        segmento_saida_ids:   [],
        circuitos_saem: caixa.circuito_ids,
        caixa_id:   caixa.id,
      })
    }

    // Nó de fim do eletroduto
    const no_fim_id = `no-fim-${elet.id}`
    nos.set(no_fim_id, {
      id: no_fim_id, tipo: 'canto',
      face_id: elet.face_id, parede_id: elet.parede_id,
      pos_m: elet.comprimento_m, altura_m: elet.altura_m,
      segmento_entrada_ids: [],
      segmento_saida_ids:   [],
    })

    // Criar segmentos entre nós (trechos com ocupação uniforme)
    // Ordenar nós por posição
    const nos_ordenados = [
      { id: no_ini_id, pos_m: 0 },
      ...posicoes_caixas.map(({ caixa, pos_m }) => ({ id: `no-caixa-${caixa.id}`, pos_m })),
      { id: no_fim_id, pos_m: elet.comprimento_m },
    ]

    // Rastrear quais circuitos estão presentes em cada trecho
    // Circuitos que terminam numa caixa saem do conjunto após aquela posição
    let circs_ativos = [...elet.circuito_ids]

    for (let i = 0; i < nos_ordenados.length - 1; i++) {
      const no_a = nos_ordenados[i]
      const no_b = nos_ordenados[i + 1]
      const comp_trecho = no_b.pos_m - no_a.pos_m

      // Remover circuitos que saem no nó A
      const no_a_obj = nos.get(no_a.id)
      if (no_a_obj?.circuitos_saem) {
        circs_ativos = circs_ativos.filter(id => !no_a_obj.circuitos_saem!.includes(id))
      }

      if (comp_trecho <= 0 || circs_ativos.length === 0) continue

      // Construir o segmento com os circuitos ativos neste trecho
      const seg_id = `seg-${elet.id}-${i}`
      const seg_fisico = buildSegmentoFisico(
        seg_id, elet.face_id, elet.parede_id,
        comp_trecho, elet.altura_m,
        circs_ativos.map(id => ({
          id,
          tipo:      'TUG',  // simplificação — idealmente vem do InputCircuito
          secao_mm2: 2.5,    // simplificação — idealmente vem do InputCircuito
          n_fases:   1 as const,
        }))
      )

      const seg_rede: SegmentoRede = {
        id:            seg_id,
        face_id:       elet.face_id,
        parede_id:     elet.parede_id,
        comprimento_m: comp_trecho,
        altura_m:      elet.altura_m,
        no_inicio_id:  no_a.id,
        no_fim_id:     no_b.id,
        circuito_ids:  circs_ativos,
        condutores:    seg_fisico.condutores,
        ocupacao:      seg_fisico.ocupacao,
      }
      segmentos.set(seg_id, seg_rede)

      // Índice circuito → segmentos
      for (const cid of circs_ativos) {
        const lista = circ_segs.get(cid) ?? []
        lista.push(seg_id)
        circ_segs.set(cid, lista)
      }
    }
  }

  // Calcular quantitativo real
  const quant = calcQuantRede(segmentos, nos, caixas)

  return { segmentos, nos, circ_segs, quant }
}

// ── Quantitativo real da rede ────────────────────────────────────
function calcQuantRede(
  segmentos: Map<string, SegmentoRede>,
  nos:       Map<string, NoInfra>,
  caixas:    readonly CaixaFisica[]
): QuantRede {
  const elet_map  = new Map<number, number>()
  const cabo_map  = new Map<string, number>()
  const avisos: AvisoRede[] = []

  let curvas_90 = 0
  let fa_sum    = 0
  let fa_w      = 0
  let pux_max   = 0

  // Acumular por segmento
  for (const [, seg] of segmentos) {
    const d = seg.ocupacao.diametro_mm
    elet_map.set(d, (elet_map.get(d) ?? 0) + seg.comprimento_m)

    for (const cond of seg.condutores) {
      const key = `${cond.secao_mm2}:${cond.funcao}:${cond.cor_nbr5444}`
      cabo_map.set(key, (cabo_map.get(key) ?? 0) + seg.comprimento_m)
    }

    // Fa ponderado pelo comprimento
    fa_sum += seg.ocupacao.fa * seg.comprimento_m
    fa_w   += seg.comprimento_m

    // Avisos de ocupação
    if (seg.ocupacao.status === 'EXCEDIDO') {
      avisos.push({
        tipo: 'OCUPACAO_EXCEDIDA', segmento_id: seg.id,
        descricao: `Segmento ${seg.id}: ${seg.ocupacao.taxa_pct.toFixed(0)}% > ${seg.ocupacao.limite_pct}%`,
        acao: `Dividir em dois eletrodutos ou aumentar para ⌀${seg.ocupacao.diametro_mm + 5}mm`,
      })
    }
    if (seg.ocupacao.fa < FA_CRITICO) {
      avisos.push({
        tipo: 'FA_CRITICO', segmento_id: seg.id,
        descricao: `Fa=${seg.ocupacao.fa.toFixed(2)} — ${seg.circuito_ids.length} circuitos neste trecho`,
        acao: 'Dividir circuitos em eletrodutos separados',
      })
    }
  }

  // Contar curvas (nós tipo 'canto')
  for (const [, no] of nos) {
    if (no.tipo === 'canto') {
      curvas_90++   // simplificação: todos os cantos são 90° no modelo retangular
    }
  }

  // Verificar puxamento: comprimento máximo entre caixas de passagem
  // (simplificação: comprimento total por face como aproximação)
  for (const [, seg] of segmentos) {
    if (seg.comprimento_m > pux_max) pux_max = seg.comprimento_m
  }

  if (pux_max > PUXAMENTO_MAX_M) {
    avisos.push({
      tipo: 'PUXAMENTO_EXCEDIDO',
      descricao: `Trecho de ${pux_max.toFixed(1)}m sem caixa de passagem (máx recomendado: ${PUXAMENTO_MAX_M}m)`,
      acao: 'Inserir caixa de passagem 4×4" no meio do percurso',
    })
  }

  // Caixas por tipo
  const caixa_map = new Map<string, number>()
  for (const c of caixas) {
    caixa_map.set(c.tipo, (caixa_map.get(c.tipo) ?? 0) + 1)
  }

  return {
    eletrodutos: [...elet_map.entries()].map(([d, m]) => ({
      diametro_mm: d,
      metros:      Math.ceil(m * 1.10),
      barras_3m:   Math.ceil(m * 1.10 / 3),
    })).sort((a, b) => a.diametro_mm - b.diametro_mm),

    cabos: [...cabo_map.entries()].map(([key, metros]) => {
      const [secao, funcao, cor] = key.split(':')
      return { secao_mm2: Number(secao), funcao, metros: Math.ceil(metros * 1.10), cor }
    }).sort((a, b) => a.secao_mm2 - b.secao_mm2),

    curvas_90, curvas_45: 0 as number,
    caixas: [...caixa_map.entries()].map(([tipo, qtd]) => ({ tipo, qtd })),
    puxamento_max_m: Math.round(pux_max * 100) / 100,
    fa_medio: fa_w > 0 ? Math.round(fa_sum / fa_w * 100) / 100 : 1.0,
    avisos,
  }
}

// ── Segmentos de um circuito ─────────────────────────────────────
export function segmentosDoCircuito(
  circuito_id: string,
  rede:        RedeInfraestrutura
): SegmentoRede[] {
  const seg_ids = rede.circ_segs.get(circuito_id) ?? []
  return seg_ids.map(id => rede.segmentos.get(id)).filter((s): s is SegmentoRede => s != null)
}

// ── Comprimento real de um circuito ─────────────────────────────
// Soma dos comprimentos dos segmentos onde o circuito está presente
export function comprimentoRealCircuito(
  circuito_id: string,
  rede:        RedeInfraestrutura
): number {
  const segs = segmentosDoCircuito(circuito_id, rede)
  return segs.reduce((s, seg) => s + seg.comprimento_m, 0)
}
