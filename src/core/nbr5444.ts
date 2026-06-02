// src/core/nbr5444.ts
// ════════════════════════════════════════════════════════════════
// SIMBOLOGIA NBR 5444 — Biblioteca de símbolos SVG
//
// Referência: ABNT NBR 5444:1989 — Símbolos gráficos para instalações elétricas prediais
// Cada símbolo é renderizado em SVG vetorial, escalonável.
//
// Convenção de tamanho:
//   - viewBox: -12 -12 24 24  (24×24 unidades, origem no centro)
//   - Escala padrão no canvas: 1 símbolo = ~0.4m real
//   - Stroke: 1.5 unidades (linha técnica)
//   - Fill: sempre explicito (nunca depende do contexto)
// ════════════════════════════════════════════════════════════════

import type { TipoPontoEletrico } from '../types/geometry'

// ── Interface de símbolo ──────────────────────────────────────────
export interface RegraInstalacao {
  // Altura padrão de instalação (metros a partir do piso)
  readonly altura_m:        number
  // Tipo de caixa de embutir compatível
  readonly caixa:           '4x2' | '4x4' | 'octogonal' | 'passagem' | 'nenhuma'
  // Este símbolo pode ser agrupado com outros na mesma caixa?
  readonly permite_agrupamento: boolean
  // Tipos de circuito compatíveis
  readonly circuitos_compativeis: string[]  // 'ILUM' | 'TUG' | 'TUE' | 'GERAL'
  // Deve ficar em parede (não no teto ou piso)?
  readonly requer_parede:   boolean
  // Distância mínima de outros pontos (m)
  readonly dist_min_m:      number
  // Anotação NBR
  readonly referencia_nbr?: string
}

export interface SimboloNBR5444 {
  readonly id:          TipoPontoEletrico
  readonly nome:        string          // nome oficial NBR 5444
  readonly descricao:   string          // descrição para tooltip
  // SVG paths/elements (sem <svg> wrapper)
  readonly path:        string
  // Ponto de conexão elétrica (relativo ao centro, unidades SVG)
  readonly conn_x:      number
  readonly conn_y:      number
  // Regras construtivas paramétricas
  readonly regras:      RegraInstalacao
}

// ── Cor padrão dos símbolos (tema claro/escuro) ───────────────────
const S  = 'currentColor'  // stroke — herda da cor do CSS
const W  = '1.5'           // strokeWidth padrão
const W2 = '2'             // strokeWidth linha de ênfase
const NONE = 'none'

// ── Biblioteca de símbolos NBR 5444 ──────────────────────────────
export const SIMBOLOS_NBR5444: Record<TipoPontoEletrico, SimboloNBR5444> = {

  // ── Ponto de luz (luminária no teto) ───────────────────────────
  // NBR 5444: círculo com cruz interna
  LUMINARIA: {
    id: 'LUMINARIA', nome: 'Ponto de luz',
    descricao: 'Luminária de teto (ponto de luz)',
    path: `
      <circle cx="0" cy="0" r="9" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-6" y1="0" x2="6" y2="0" stroke="${S}" strokeWidth="${W}" />
      <line x1="0" y1="-6" x2="0" y2="6" stroke="${S}" strokeWidth="${W}" />
    `,
    conn_x: 0, conn_y: -9,
    regras: {
      altura_m: 2.80, caixa: 'octogonal', permite_agrupamento: false,
      circuitos_compativeis: ['ILUM'], requer_parede: false, dist_min_m: 0.15,
      referencia_nbr: 'NBR 5444 — Ponto de luz no teto',
    },
  },

  // ── Luminária de parede (arandela) ────────────────────────────
  LUMINARIA_PAREDE: {
    id: 'LUMINARIA_PAREDE', nome: 'Ponto de luz — parede',
    descricao: 'Arandela ou luminária de parede',
    path: `
      <circle cx="0" cy="0" r="9" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-6" y1="0" x2="6" y2="0" stroke="${S}" strokeWidth="${W}" />
      <line x1="0" y1="-6" x2="0" y2="6" stroke="${S}" strokeWidth="${W}" />
      <line x1="0" y1="9" x2="0" y2="12" stroke="${S}" strokeWidth="${W2}" />
    `,
    conn_x: 0, conn_y: 12,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Interruptor simples ────────────────────────────────────────
  // NBR 5444: círculo sólido + linha diagonal com tick
  INTERRUPTOR_SIMPLES: {
    id: 'INTERRUPTOR_SIMPLES', nome: 'Interruptor simples',
    descricao: 'Interruptor simples (1 via)',
    path: `
      <circle cx="0" cy="0" r="4" fill="${S}" />
      <line x1="0" y1="0" x2="10" y2="-10" stroke="${S}" strokeWidth="${W2}" />
      <line x1="8" y1="-12" x2="12" y2="-8" stroke="${S}" strokeWidth="${W}" />
    `,
    conn_x: 0, conn_y: 4,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Interruptor paralelo (three-way) ──────────────────────────
  INTERRUPTOR_PARALELO: {
    id: 'INTERRUPTOR_PARALELO', nome: 'Interruptor paralelo',
    descricao: 'Interruptor paralelo — 2 teclas (two-way)',
    path: `
      <circle cx="0" cy="0" r="4" fill="${S}" />
      <line x1="0" y1="0" x2="10" y2="-10" stroke="${S}" strokeWidth="${W2}" />
      <line x1="8" y1="-12" x2="12" y2="-8" stroke="${S}" strokeWidth="${W}" />
      <line x1="6" y1="-14" x2="10" y2="-10" stroke="${S}" strokeWidth="${W}" />
    `,
    conn_x: 0, conn_y: 4,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Interruptor intermediário ─────────────────────────────────
  INTERRUPTOR_INTERMEDIARIO: {
    id: 'INTERRUPTOR_INTERMEDIARIO', nome: 'Interruptor intermediário',
    descricao: 'Interruptor intermediário — 4 vias',
    path: `
      <circle cx="0" cy="0" r="4" fill="${S}" />
      <line x1="0" y1="0" x2="10" y2="-10" stroke="${S}" strokeWidth="${W2}" />
      <line x1="8" y1="-12" x2="12" y2="-8" stroke="${S}" strokeWidth="${W}" />
      <line x1="6" y1="-14" x2="10" y2="-10" stroke="${S}" strokeWidth="${W}" />
      <line x1="4" y1="-16" x2="8" y2="-12" stroke="${S}" strokeWidth="${W}" />
    `,
    conn_x: 0, conn_y: 4,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Tomada uso geral — baixa (0.30m) ──────────────────────────
  // NBR 5444: semicírculo + barras verticais
  TUG_BAIXA: {
    id: 'TUG_BAIXA', nome: 'TUG — baixa (0.30m)',
    descricao: 'Tomada 2P+T — instalação baixa (0.30m) — NBR 5410',
    path: `
      <path d="M -8 0 A 8 8 0 0 1 8 0" stroke="${S}" strokeWidth="${W2}" fill="${NONE}" />
      <line x1="0" y1="0" x2="0" y2="10" stroke="${S}" strokeWidth="${W}" />
      <line x1="-4" y1="-5" x2="-4" y2="-1" stroke="${S}" strokeWidth="${W2}" />
      <line x1="4" y1="-5" x2="4" y2="-1" stroke="${S}" strokeWidth="${W2}" />
    `,
    conn_x: 0, conn_y: 10,
    regras: {
      altura_m: 0.30, caixa: '4x2', permite_agrupamento: true,
      circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15,
      referencia_nbr: 'NBR 5410 §9.5.2.2 | NBR 5444 — Tomada baixa',
    },
  },

  // ── Tomada uso geral — média (1.10m) ──────────────────────────
  TUG_MEDIA: {
    id: 'TUG_MEDIA', nome: 'TUG — média (1.10m)',
    descricao: 'Tomada 2P+T — instalação média (1.10m)',
    path: `
      <path d="M -8 0 A 8 8 0 0 1 8 0" stroke="${S}" strokeWidth="${W2}" fill="${NONE}" />
      <line x1="0" y1="0" x2="0" y2="10" stroke="${S}" strokeWidth="${W}" />
      <line x1="-4" y1="-5" x2="-4" y2="-1" stroke="${S}" strokeWidth="${W2}" />
      <line x1="4" y1="-5" x2="4" y2="-1" stroke="${S}" strokeWidth="${W2}" />
      <text x="9" y="4" fontSize="6" fill="${S}" fontFamily="monospace">M</text>
    `,
    conn_x: 0, conn_y: 10,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Tomada uso geral — alta (2.0m) ────────────────────────────
  TUG_ALTA: {
    id: 'TUG_ALTA', nome: 'TUG — alta (2.0m)',
    descricao: 'Tomada 2P+T — instalação alta (2.0m) — cozinha, bancada',
    path: `
      <path d="M -8 0 A 8 8 0 0 1 8 0" stroke="${S}" strokeWidth="${W2}" fill="${NONE}" />
      <line x1="0" y1="0" x2="0" y2="10" stroke="${S}" strokeWidth="${W}" />
      <line x1="-4" y1="-5" x2="-4" y2="-1" stroke="${S}" strokeWidth="${W2}" />
      <line x1="4" y1="-5" x2="4" y2="-1" stroke="${S}" strokeWidth="${W2}" />
      <text x="9" y="4" fontSize="6" fill="${S}" fontFamily="monospace">A</text>
    `,
    conn_x: 0, conn_y: 10,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Tomada uso específico (TUE) ────────────────────────────────
  TUE: {
    id: 'TUE', nome: 'TUE — Tomada uso específico',
    descricao: 'Tomada de uso específico (equipamento dedicado)',
    path: `
      <rect x="-9" y="-9" width="18" height="18" rx="2"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-5" y1="-4" x2="-5" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <line x1="5" y1="-4" x2="5" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <circle cx="0" cy="4" r="2" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
    `,
    conn_x: 0, conn_y: 9,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  TUE_MONOFASICO: {
    id: 'TUE_MONOFASICO', nome: 'TUE monofásico',
    descricao: 'TUE monofásico 2P+T (127V/220V)',
    path: `
      <rect x="-9" y="-9" width="18" height="18" rx="2"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-5" y1="-4" x2="-5" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <line x1="5" y1="-4" x2="5" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <circle cx="0" cy="4" r="2" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <text x="-4" y="-2" fontSize="5" fill="${S}" fontFamily="monospace">1F</text>
    `,
    conn_x: 0, conn_y: 9,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  TUE_BIFASICO: {
    id: 'TUE_BIFASICO', nome: 'TUE bifásico',
    descricao: 'TUE bifásico 3P+T (220V)',
    path: `
      <rect x="-9" y="-9" width="18" height="18" rx="2"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-5" y1="-4" x2="-5" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <line x1="0" y1="-5" x2="0" y2="1" stroke="${S}" strokeWidth="${W2}" />
      <line x1="5" y1="-4" x2="5" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <circle cx="0" cy="5" r="2" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <text x="-4" y="-2" fontSize="5" fill="${S}" fontFamily="monospace">2F</text>
    `,
    conn_x: 0, conn_y: 9,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  TUE_TRIFASICO: {
    id: 'TUE_TRIFASICO', nome: 'TUE trifásico',
    descricao: 'TUE trifásico 4P+T (380V)',
    path: `
      <rect x="-9" y="-9" width="18" height="18" rx="2"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-6" y1="-4" x2="-6" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <line x1="0" y1="-5" x2="0" y2="1" stroke="${S}" strokeWidth="${W2}" />
      <line x1="6" y1="-4" x2="6" y2="2" stroke="${S}" strokeWidth="${W2}" />
      <circle cx="0" cy="5" r="2" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <text x="-4" y="-2" fontSize="5" fill="${S}" fontFamily="monospace">3F</text>
    `,
    conn_x: 0, conn_y: 9,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Quadro de distribuição ─────────────────────────────────────
  QD: {
    id: 'QD', nome: 'Quadro de distribuição',
    descricao: 'Quadro de distribuição (QD) — ponto de origem dos circuitos',
    path: `
      <rect x="-10" y="-12" width="20" height="24" rx="1"
        stroke="${S}" strokeWidth="${W2}" fill="${NONE}" />
      <rect x="-7" y="-9" width="14" height="18" rx="1"
        stroke="${S}" strokeWidth="0.8" fill="${NONE}" />
      <line x1="-5" y1="-6" x2="5" y2="-6" stroke="${S}" strokeWidth="${W}" />
      <line x1="-5" y1="-2" x2="5" y2="-2" stroke="${S}" strokeWidth="${W}" />
      <line x1="-5" y1="2" x2="5" y2="2" stroke="${S}" strokeWidth="${W}" />
      <line x1="-5" y1="6" x2="5" y2="6" stroke="${S}" strokeWidth="${W}" />
    `,
    conn_x: 0, conn_y: -12,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Caixa de passagem ─────────────────────────────────────────
  CAIXA_PASSAGEM: {
    id: 'CAIXA_PASSAGEM', nome: 'Caixa de passagem',
    descricao: 'Caixa de passagem — junção de eletrodutos',
    path: `
      <rect x="-8" y="-8" width="16" height="16" rx="1"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" strokeDasharray="3 2" />
      <line x1="-5" y1="-5" x2="5" y2="5" stroke="${S}" strokeWidth="0.8" />
      <line x1="5" y1="-5" x2="-5" y2="5" stroke="${S}" strokeWidth="0.8" />
    `,
    conn_x: 0, conn_y: 0,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Caixa de derivação ────────────────────────────────────────
  CAIXA_DERIVACAO: {
    id: 'CAIXA_DERIVACAO', nome: 'Caixa de derivação',
    descricao: 'Caixa de derivação — ponto de ramificação de circuitos',
    path: `
      <circle cx="0" cy="0" r="9"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" strokeDasharray="4 2" />
      <circle cx="0" cy="0" r="3" fill="${S}" />
    `,
    conn_x: 0, conn_y: 0,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Campainha ─────────────────────────────────────────────────
  CAMPAINHA: {
    id: 'CAMPAINHA', nome: 'Campainha',
    descricao: 'Campainha elétrica / interfone',
    path: `
      <path d="M -8 4 Q 0 -10 8 4" stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <line x1="-8" y1="4" x2="8" y2="4" stroke="${S}" strokeWidth="${W2}" />
      <circle cx="0" cy="7" r="2" fill="${S}" />
    `,
    conn_x: 0, conn_y: 4,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Sensor de presença ────────────────────────────────────────
  SENSOR_PRESENCA: {
    id: 'SENSOR_PRESENCA', nome: 'Sensor de presença',
    descricao: 'Sensor de presença / movimento',
    path: `
      <path d="M -7 7 Q -10 0 0 -10 Q 10 0 7 7 Z"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <circle cx="0" cy="0" r="3" fill="${S}" />
      <line x1="-9" y1="7" x2="9" y2="7" stroke="${S}" strokeWidth="${W}" />
    `,
    conn_x: 0, conn_y: 7,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },

  // ── Ponto de dados/telefone ───────────────────────────────────
  DADOS_TELEFONE: {
    id: 'DADOS_TELEFONE', nome: 'Dados / Telefone',
    descricao: 'Ponto de dados (RJ-45) ou telefone (RJ-11)',
    path: `
      <rect x="-9" y="-6" width="18" height="12" rx="2"
        stroke="${S}" strokeWidth="${W}" fill="${NONE}" />
      <text x="0" y="4" textAnchor="middle" fontSize="8" fill="${S}" fontFamily="monospace" fontWeight="700">D</text>
    `,
    conn_x: 0, conn_y: 6,
    regras: { altura_m: 1.10, caixa: '4x2', permite_agrupamento: true, circuitos_compativeis: ['TUG'], requer_parede: true, dist_min_m: 0.15 },
  },
}

// ── Cores por tipo de circuito (para colorir no canvas) ───────────
export const COR_CIRCUITO: Record<string, string> = {
  ILUM:  '#0d7a47',   // verde — iluminação
  TUG:   '#1464c8',   // azul — tomadas gerais
  TUE:   '#c87014',   // âmbar — uso específico
  GERAL: '#5b21b6',   // roxo — circuito geral
}

// ── Grupos de símbolos para a paleta da UI ────────────────────────
export const PALETA_SIMBOLOS: { grupo: string; simbolos: TipoPontoEletrico[] }[] = [
  {
    grupo: 'Iluminação',
    simbolos: ['LUMINARIA', 'LUMINARIA_PAREDE'],
  },
  {
    grupo: 'Interruptores',
    simbolos: ['INTERRUPTOR_SIMPLES', 'INTERRUPTOR_PARALELO', 'INTERRUPTOR_INTERMEDIARIO'],
  },
  {
    grupo: 'Tomadas (TUG)',
    simbolos: ['TUG_BAIXA', 'TUG_MEDIA', 'TUG_ALTA'],
  },
  {
    grupo: 'Uso Específico (TUE)',
    simbolos: ['TUE_MONOFASICO', 'TUE_BIFASICO', 'TUE_TRIFASICO'],
  },
  {
    grupo: 'Infraestrutura',
    simbolos: ['QD', 'CAIXA_PASSAGEM', 'CAIXA_DERIVACAO'],
  },
  {
    grupo: 'Outros',
    simbolos: ['CAMPAINHA', 'SENSOR_PRESENCA', 'DADOS_TELEFONE'],
  },
]
