// src/core/layers.ts
// ════════════════════════════════════════════════════════════════
// LAYER ENGINE — Camadas de visualização técnica
//
// Problema: projetar elétrico com tudo visível = poluição visual.
// Solução: cada elemento pertence a uma camada com visibilidade independente.
//
// Princípio:
//   Camada não é dado — é filtro de apresentação.
//   O domínio elétrico não sabe de camadas.
//   A engine gráfica usa camadas para decidir o que renderizar.
//
// Referência: AutoCAD layers, Revit categories, QGIS layers
// ════════════════════════════════════════════════════════════════

import type { TipoPontoEletrico } from '../types/geometry'

// ── Definição de camada ───────────────────────────────────────────
export type LayerId =
  | 'ILUMINACAO'    // luminárias, interruptores, retornos
  | 'TOMADAS'       // TUG, TUE
  | 'ELETRODUTOS'   // segmentos de eletroduto
  | 'CIRCUITOS'     // identificação e cor de circuito
  | 'CONDUTORES'    // condutores e bitolas
  | 'COTAS'         // dimensões e textos técnicos
  | 'ESTRUTURA'     // paredes, portas, janelas (referência)
  | 'QD'            // quadro de distribuição e ramal

export interface Layer {
  readonly id:       LayerId
  readonly nome:     string
  readonly cor:      string      // cor padrão dos elementos nesta camada
  readonly descricao: string
}

export const LAYERS: Record<LayerId, Layer> = {
  ILUMINACAO: {
    id: 'ILUMINACAO', nome: 'Iluminação',
    cor: '#f59e0b',
    descricao: 'Pontos de luz, luminárias, arandelas, interruptores, retornos',
  },
  TOMADAS: {
    id: 'TOMADAS', nome: 'Tomadas',
    cor: '#3b82f6',
    descricao: 'TUG (baixa, média, alta), TUE, tomadas especiais',
  },
  ELETRODUTOS: {
    id: 'ELETRODUTOS', nome: 'Eletrodutos',
    cor: '#6b7280',
    descricao: 'Traçado de eletrodutos no piso, parede e teto',
  },
  CIRCUITOS: {
    id: 'CIRCUITOS', nome: 'Identificação de circuitos',
    cor: '#8b5cf6',
    descricao: 'Labels e cores de circuito nos pontos',
  },
  CONDUTORES: {
    id: 'CONDUTORES', nome: 'Condutores',
    cor: '#10b981',
    descricao: 'Bitola, tipo e quantidade de condutores por segmento',
  },
  COTAS: {
    id: 'COTAS', nome: 'Cotas e textos',
    cor: '#64748b',
    descricao: 'Dimensões de cômodos, alturas de instalação, textos técnicos',
  },
  ESTRUTURA: {
    id: 'ESTRUTURA', nome: 'Estrutura arquitetônica',
    cor: '#334155',
    descricao: 'Paredes, portas, janelas — apenas referência',
  },
  QD: {
    id: 'QD', nome: 'Quadro / Ramal',
    cor: '#dc2626',
    descricao: 'Quadro de distribuição, ramal de entrada, DG',
  },
}

// ── Estado das camadas (ativas/inativas) ──────────────────────────
export type LayerState = Record<LayerId, boolean>

export const LAYERS_PADRAO: LayerState = {
  ILUMINACAO:  true,
  TOMADAS:     true,
  ELETRODUTOS: true,
  CIRCUITOS:   true,
  CONDUTORES:  false,   // menos verboso por padrão
  COTAS:       false,   // ativa quando precisar de cota
  ESTRUTURA:   true,
  QD:          true,
}

// ── Mapeamento TipoPontoEletrico → Layer ─────────────────────────
export function layerDoPonto(tipo: TipoPontoEletrico): LayerId {
  switch (tipo) {
    case 'LUMINARIA':
    case 'LUMINARIA_PAREDE':
    case 'INTERRUPTOR_SIMPLES':
    case 'INTERRUPTOR_PARALELO':
    case 'INTERRUPTOR_INTERMEDIARIO':
      return 'ILUMINACAO'
    case 'TUG_BAIXA':
    case 'TUG_MEDIA':
    case 'TUG_ALTA':
    case 'TUE':
      return 'TOMADAS'
    case 'QD':
    case 'CAIXA_PASSAGEM':
      return 'QD'
    default:
      return 'TOMADAS'
  }
}

// ── Checar se um ponto deve ser renderizado ───────────────────────
export function pontoVisivel(tipo: TipoPontoEletrico, layers: LayerState): boolean {
  return layers[layerDoPonto(tipo)] ?? true
}

// ── Controle de camadas — preset de visualizações típicas ─────────
export const PRESETS: Record<string, LayerState> = {
  'Completo': { ...LAYERS_PADRAO, CONDUTORES: true, COTAS: true },
  'Iluminação': { ...LAYERS_PADRAO, TOMADAS: false, ELETRODUTOS: false, CONDUTORES: false, COTAS: false },
  'Tomadas':    { ...LAYERS_PADRAO, ILUMINACAO: false, ELETRODUTOS: false, CONDUTORES: false, COTAS: false },
  'Eletrodutos':{ ...LAYERS_PADRAO, CONDUTORES: true, ILUMINACAO: false, TOMADAS: false, COTAS: false },
  'Limpo':      { ...LAYERS_PADRAO, CONDUTORES: false, COTAS: false, CIRCUITOS: false },
}
