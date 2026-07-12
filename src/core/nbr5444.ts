// src/core/nbr5444.ts
// ════════════════════════════════════════════════════════════════
// SIMBOLOGIA NBR 5444 — Geometria extraída dos DXFs de referência
//   doc1 = biblioteca_simbolos.dxf
//   doc2 = PRJ_ELE_CASA_00.dxf
//
// Referência: ABNT NBR 5444:1989 — Símbolos gráficos para instalações elétricas prediais
// ════════════════════════════════════════════════════════════════

import type { TipoPontoEletrico } from '../types/geometry'

// ── Interfaces preservadas (compatibilidade com grupoInstalacao.ts) ──

export interface RegraInstalacao {
  readonly altura_m:             number
  readonly caixa:                '4x2' | '4x4' | 'octogonal' | 'passagem' | 'nenhuma'
  readonly permite_agrupamento:  boolean
  readonly circuitos_compativeis: string[]
  readonly requer_parede:        boolean
  readonly dist_min_m:           number
  readonly referencia_nbr?:      string
}

export interface SimboloNBR5444 {
  readonly id:          TipoPontoEletrico
  readonly nome:        string
  readonly descricao:   string
  readonly path:        string    // SVG gerado das DrawOps
  readonly conn_x:      number
  readonly conn_y:      number
  readonly regras:      RegraInstalacao
}

// ── DrawOps — geometria DXF normalizada ──────────────────────────

type DrawOp =
  | { t: 'line';   x1: number; y1: number; x2: number; y2: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { t: 'arc';    cx: number; cy: number; r: number; a1: number; a2: number }
  | { t: 'poly';   pts: [number,number][]; closed: boolean; fill?: boolean }
  | { t: 'rect';   x: number; y: number; w: number; h: number; fill?: boolean }

const L = (x1:number,y1:number,x2:number,y2:number): DrawOp => ({t:'line',x1,y1,x2,y2})
const C = (cx:number,cy:number,r:number,fill=false): DrawOp => ({t:'circle',cx,cy,r,fill})
const A = (cx:number,cy:number,r:number,a1:number,a2:number): DrawOp => ({t:'arc',cx,cy,r,a1,a2})
const P = (pts:[number,number][],closed:boolean,fill=false): DrawOp => ({t:'poly',pts,closed,fill})
const R = (x:number,y:number,w:number,h:number,fill=false): DrawOp => ({t:'rect',x,y,w,h,fill})

// Sub-geometrias reutilizáveis
const BOX2: DrawOp[] = [R(-0.05,-0.05,0.10,0.05)]
const HASTE_INT: DrawOp[] = [L(0,0.05,0,0)]
const TRI  = (): DrawOp[] => [L(0,0.178,-0.064,0.05), L(0.064,0.05,0,0.178), L(-0.064,0.05,0.064,0.05)]
const TRIM = (): DrawOp[] => [P([[-0.064,0.05],[0,0.05],[0,0.178]],true,true)]
const TRIC = (): DrawOp[] => [P([[0,0.178],[-0.064,0.05],[0.064,0.05]],true,true)]
const TRI20: DrawOp[] = [
  P([[0.0392,0.0995],[-0.0392,0.0995],[-0.064,0.05],[0.064,0.05]],true,true),
  L(-0.0392,0.0995,0.0392,0.0995),
]

// ── Conversor DrawOps → SVG path string ──────────────────────────
// Tamanho alvo: viewBox -12 -12 24 24 (24×24 unidades, origen no centro)
// Os símbolos DXF têm bounding box variável; normalizamos para caber em ~±10u

function opsToSvg(ops: DrawOp[], size = 20): string {
  if (!ops.length) return ''
  // Calcular bounding box
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity
  const e = (x:number,y:number) => {
    if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y
  }
  for(const op of ops){
    if(op.t==='line'){e(op.x1,op.y1);e(op.x2,op.y2)}
    else if(op.t==='circle'||op.t==='arc'){e(op.cx-op.r,op.cy-op.r);e(op.cx+op.r,op.cy+op.r)}
    else if(op.t==='poly'){for(const[x,y]of op.pts)e(x,y)}
    else if(op.t==='rect'){e(op.x,op.y);e(op.x+op.w,op.y+op.h)}
  }
  const bw=maxx-minx||0.01, bh=maxy-miny||0.01
  const sc = size / Math.max(bw,bh)
  const ox = -(minx + (maxx-minx)/2) * sc   // centrar em 0
  const oy =  (miny + (maxy-miny)/2) * sc   // centrar em 0 (flip Y)

  const tx  = (x:number) => +(( x*sc + ox).toFixed(2))
  const ty  = (y:number) => +( (-y*sc + oy).toFixed(2))   // flip Y
  const rs  = (r:number) => +( (r*sc).toFixed(2))
  const sw  = 'strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"'
  const swb = 'strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"'
  const F   = 'fill="none" stroke="currentColor"'
  const FB  = 'fill="currentColor" stroke="none"'

  const parts: string[] = []
  for(const op of ops){
    if(op.t==='line'){
      if(Math.abs(op.x2-op.x1)<1e-9&&Math.abs(op.y2-op.y1)<1e-9)continue
      parts.push(`<line x1="${tx(op.x1)}" y1="${ty(op.y1)}" x2="${tx(op.x2)}" y2="${ty(op.y2)}" ${F} ${sw}/>`)
    } else if(op.t==='circle'){
      const r=rs(op.r); if(r<0.2)continue
      if(op.fill) parts.push(`<circle cx="${tx(op.cx)}" cy="${ty(op.cy)}" r="${r}" ${FB}/>`)
      else        parts.push(`<circle cx="${tx(op.cx)}" cy="${ty(op.cy)}" r="${r}" ${F} ${sw}/>`)
    } else if(op.t==='arc'){
      let diff=((op.a2-op.a1)+360)%360; if(diff<1e-4)diff=360
      const r=rs(op.r); if(r<0.2)continue
      if(diff>359.9){parts.push(`<circle cx="${tx(op.cx)}" cy="${ty(op.cy)}" r="${r}" ${F} ${sw}/>`);continue}
      const a1r=op.a1*Math.PI/180, a2r=op.a2*Math.PI/180
      // flip Y: sin inverte, cos não
      const x1s=tx(op.cx+op.r*Math.cos(a1r)), y1s=ty(op.cy+op.r*Math.sin(a1r))
      const x2s=tx(op.cx+op.r*Math.cos(a2r)), y2s=ty(op.cy+op.r*Math.sin(a2r))
      parts.push(`<path d="M ${x1s},${y1s} A ${r},${r} 0 ${diff>180?1:0},1 ${x2s},${y2s}" ${F} ${sw}/>`)
    } else if(op.t==='poly'){
      if(op.pts.length<2)continue
      const pts=op.pts.map(([x,y])=>`${tx(x)},${ty(y)}`).join(' ')
      if(op.fill) parts.push(`<polygon points="${pts}" ${FB}/>`)
      else {
        const tag=op.closed?'polygon':'polyline'
        parts.push(`<${tag} points="${pts}" ${F} ${sw}/>`)
      }
    } else if(op.t==='rect'){
      const rx=tx(op.x), ry=ty(op.y+op.h)
      const rw=+(( op.w*sc).toFixed(2)), rh=+((op.h*sc).toFixed(2))
      if(op.fill) parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" ${FB}/>`)
      else        parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" ${F} ${swb}/>`)
    }
  }
  return parts.join('\n')
}

// Regra padrão para a maioria dos símbolos
const R_PAREDE = (altura_m: number, circ: string[], ref?: string): RegraInstalacao => ({
  altura_m, caixa: '4x2', permite_agrupamento: true,
  circuitos_compativeis: circ, requer_parede: true, dist_min_m: 0.15,
  referencia_nbr: ref,
})

// ── Catálogo principal — SIMBOLOS_NBR5444 ────────────────────────
// paths gerados a partir das DrawOps DXF reais
export const SIMBOLOS_NBR5444: Record<TipoPontoEletrico, SimboloNBR5444> = {

  // ── Iluminação ──────────────────────────────────────────────────
  LUMINARIA: {
    id: 'LUMINARIA', nome: 'Ponto de luz (teto)',
    descricao: 'Luminária de teto — caixa octogonal 4×4 (NBR 5444)',
    path: opsToSvg([
      P([[-0.0845,0.035],[-0.0845,-0.035],[-0.035,-0.0845],[0.035,-0.0845],
         [0.0845,-0.035],[0.0845,0.035],[0.035,0.0845],[-0.035,0.0845]],true),
      L(0,0.0217,0,-0.0217), L(-0.0217,0,0.0217,0),
    ]),
    conn_x: 0, conn_y: -10,
    regras: { altura_m: 2.80, caixa: 'octogonal', permite_agrupamento: false,
      circuitos_compativeis: ['ILUM'], requer_parede: false, dist_min_m: 0.15,
      referencia_nbr: 'NBR 5444 — Ponto de luz no teto' },
  },

  LUMINARIA_PAREDE: {
    id: 'LUMINARIA_PAREDE', nome: 'Arandela (parede)',
    descricao: 'Ponto de iluminação na parede / arandela',
    path: opsToSvg([
      P([[0,-0.075],[0.0626,0.0334],[-0.0626,0.0334]],true),
      L(0,0.0505,0,0.1005),
      L(-0.0375,0.0538,-0.0625,0.0971),
      L(0.0375,0.0538,0.0625,0.0971),
      R(-0.075,-0.1,0.15,0.1),
    ]),
    conn_x: 0, conn_y: 10,
    regras: { altura_m: 1.80, caixa: '4x2', permite_agrupamento: false,
      circuitos_compativeis: ['ILUM'], requer_parede: true, dist_min_m: 0.15,
      referencia_nbr: 'NBR 5444 — Ponto de luz na parede' },
  },

  // ── Interruptores ───────────────────────────────────────────────
  INTERRUPTOR_SIMPLES: {
    id: 'INTERRUPTOR_SIMPLES', nome: 'Interruptor simples',
    descricao: 'Interruptor simples 1 seção h=110cm',
    path: opsToSvg([C(0,0.125,0.075), ...HASTE_INT, ...BOX2]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['ILUM'], 'NBR 5444 — Interruptor simples'),
  },

  INTERRUPTOR_PARALELO: {
    id: 'INTERRUPTOR_PARALELO', nome: 'Interruptor paralelo',
    descricao: 'Interruptor paralelo (3 vias) — two-way',
    path: opsToSvg([
      C(0,0.125,0.075),
      L(0,0.2,0,0.05),
      A(0.05,0.05,0.04,0,180),
      ...HASTE_INT, ...BOX2,
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['ILUM'], 'NBR 5444 — Interruptor paralelo'),
  },

  INTERRUPTOR_INTERMEDIARIO: {
    id: 'INTERRUPTOR_INTERMEDIARIO', nome: 'Interruptor intermediário',
    descricao: 'Interruptor de cruzamento (4 vias)',
    path: opsToSvg([
      C(0,0.125,0.075),
      L(0,0.2,0,0.125),
      L(0.065,0.0875,0,0.125),
      L(-0.065,0.0875,0,0.125),
      ...HASTE_INT, ...BOX2,
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['ILUM'], 'NBR 5444 — Interruptor intermediário'),
  },

  // ── Tomadas TUG ─────────────────────────────────────────────────
  TUG_BAIXA: {
    id: 'TUG_BAIXA', nome: 'TUG h=30cm',
    descricao: 'Tomada 2P+T 10A h=30cm — triângulo vazio',
    path: opsToSvg([...TRI(), L(0,0.05,0,0), ...BOX2]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(0.30, ['TUG'], 'NBR 5410 §9.5.2.2 | NBR 5444 — Tomada baixa'),
  },

  TUG_MEDIA: {
    id: 'TUG_MEDIA', nome: 'TUG h=80cm',
    descricao: 'Tomada 2P+T 10A h=80cm — fill meia esquerda',
    path: opsToSvg([...TRIM(), ...TRI(), L(0,0.05,0,0), ...BOX2]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(0.80, ['TUG'], 'NBR 5410 §9.5.2.2 | NBR 5444 — Tomada média'),
  },

  TUG_ALTA: {
    id: 'TUG_ALTA', nome: 'TUG h=230cm',
    descricao: 'Tomada 2P+T 10A h=230cm — triângulo cheio',
    path: opsToSvg([...TRIC(), ...TRI(), L(0,0.05,0,0), ...BOX2]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(2.00, ['TUG'], 'NBR 5444 — Tomada alta'),
  },

  // ── TUE ─────────────────────────────────────────────────────────
  TUE: {
    id: 'TUE', nome: 'TUE — Uso específico',
    descricao: 'Tomada de uso específico — ponto de força',
    path: opsToSvg([
      R(-0.05,-0.05,0.1,0.05),
      R(-0.042,0.0459,0.084,0.084),
      L(0,0.1,0,0.148), L(0,0.0757,0,0),
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['TUE'], 'NBR 5410 §9.5.4 | NBR 5444 — TUE'),
  },

  TUE_MONOFASICO: {
    id: 'TUE_MONOFASICO', nome: 'TUE monofásico 20A',
    descricao: 'TUE monofásico 2P+T 20A — trapézio',
    path: opsToSvg([...TRI20, ...TRI(), L(0,0.05,0,0), ...BOX2]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['TUE'], 'NBR 5410 §9.5.4 | NBR 5444 — TUE 20A mono'),
  },

  TUE_BIFASICO: {
    id: 'TUE_BIFASICO', nome: 'TUE bifásico',
    descricao: 'TUE bifásico 3P+T 220V — trapézio + barra',
    path: opsToSvg([
      ...TRI20, ...TRI(),
      L(-0.08,0.12,0.08,0.12),
      L(0,0.05,0,0), ...BOX2,
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['TUE'], 'NBR 5410 §9.5.4 | NBR 5444 — TUE bifásico'),
  },

  TUE_TRIFASICO: {
    id: 'TUE_TRIFASICO', nome: 'TUE trifásico',
    descricao: 'TUE trifásico 4P+T 380V — trapézio + 2 barras',
    path: opsToSvg([
      ...TRI20, ...TRI(),
      L(-0.08,0.12,0.08,0.12),
      L(-0.08,0.15,0.08,0.15),
      L(0,0.05,0,0), ...BOX2,
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.10, ['TUE'], 'NBR 5410 §9.5.4 | NBR 5444 — TUE trifásico'),
  },

  // ── Infraestrutura ──────────────────────────────────────────────
  QD: {
    id: 'QD', nome: 'Quadro de distribuição',
    descricao: 'Centro de distribuição — quadro de circuitos',
    path: opsToSvg([
      R(-0.23,-0.15,0.46,0.15),
      L(-0.2288,-0.1201,0.2305,0.0276),
      P([[-0.23,-0.1474],[-0.0024,-0.0742],[-0.23,0]],true,true),
      P([[0.23,-0.15],[0.23,0],[0.2284,0],[-0.0024,-0.0742]],true,true),
    ]),
    conn_x: 0, conn_y: 0,
    regras: { altura_m: 1.50, caixa: 'passagem', permite_agrupamento: false,
      circuitos_compativeis: ['ILUM','TUG','TUE','GERAL'], requer_parede: true,
      dist_min_m: 0.30, referencia_nbr: 'NBR 5444 — Quadro de distribuição' },
  },

  CAIXA_PASSAGEM: {
    id: 'CAIXA_PASSAGEM', nome: 'Caixa de passagem',
    descricao: 'Caixa de passagem 4×2',
    path: opsToSvg([
      R(-0.05,-0.05,0.1,0.05),
      L(-0.025,-0.025,0.025,-0.025),
    ]),
    conn_x: 0, conn_y: 0,
    regras: R_PAREDE(0.30, ['ILUM','TUG','TUE','GERAL']),
  },

  CAIXA_DERIVACAO: {
    id: 'CAIXA_DERIVACAO', nome: 'Caixa de derivação',
    descricao: 'Caixa octogonal de derivação',
    path: opsToSvg([
      P([[-0.0191,0.0462],[-0.0462,0.0191],[-0.0462,-0.0191],[-0.0191,-0.0462],
         [0.0191,-0.0462],[0.0462,-0.0191],[0.0462,0.0191],[0.0191,0.0462]],true),
    ]),
    conn_x: 0, conn_y: 0,
    regras: R_PAREDE(0.30, ['ILUM','TUG','TUE','GERAL']),
  },

  // ── Outros ──────────────────────────────────────────────────────
  CAMPAINHA: {
    id: 'CAMPAINHA', nome: 'Pulsador / Campainha',
    descricao: 'Pulsador para campainha h=120cm',
    path: opsToSvg([
      R(-0.05,-0.05,0.1,0.05),
      R(-0.047,-0.047,0.094,0.044),
      L(0,0,0,0.025),
      C(0,0.092,0.07),
      C(0,0.092,0.067),
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(1.20, ['GERAL']),
  },

  SENSOR_PRESENCA: {
    id: 'SENSOR_PRESENCA', nome: 'Sensor de presença',
    descricao: 'Sensor / interruptor de presença no teto',
    path: opsToSvg([
      P([[-0.1,-0.1],[-0.1,0.1],[0.1,0.1],[0.1,-0.1],[-0.1,-0.1]],false),
      C(0,0,0.05),
      P([[-0.1,-0.1],[-0.0692,-0.0692]],false),
      P([[0.1,-0.1],[0.0692,-0.0692]],false),
      P([[-0.1,0.1],[-0.0692,0.0692]],false),
      P([[0.1,0.1],[0.0692,0.0692]],false),
    ]),
    conn_x: 0, conn_y: -10,
    regras: { altura_m: 2.80, caixa: '4x4', permite_agrupamento: false,
      circuitos_compativeis: ['ILUM'], requer_parede: false, dist_min_m: 0.15 },
  },

  DADOS_TELEFONE: {
    id: 'DADOS_TELEFONE', nome: 'Dados / RJ45',
    descricao: 'Tomada de dados RJ45 / telefone',
    path: opsToSvg([
      C(0,0,0.05),
      P([[0.05,0],[0.3,0]],false),
      C(0.3,0,0.03,true),
    ]),
    conn_x: 0, conn_y: 5,
    regras: R_PAREDE(0.30, ['GERAL']),
  },
}

// ── Preservados (usados em outros módulos) ────────────────────────

export const COR_CIRCUITO: Record<string, string> = {
  ILUM:  '#0d7a47',
  TUG:   '#1464c8',
  TUE:   '#c87014',
  GERAL: '#5b21b6',
}

export const PALETA_SIMBOLOS: { grupo: string; simbolos: TipoPontoEletrico[] }[] = [
  { grupo: 'Iluminação',        simbolos: ['LUMINARIA', 'LUMINARIA_PAREDE'] },
  { grupo: 'Interruptores',     simbolos: ['INTERRUPTOR_SIMPLES', 'INTERRUPTOR_PARALELO', 'INTERRUPTOR_INTERMEDIARIO'] },
  { grupo: 'Tomadas (TUG)',     simbolos: ['TUG_BAIXA', 'TUG_MEDIA', 'TUG_ALTA'] },
  { grupo: 'Uso Específico',    simbolos: ['TUE', 'TUE_MONOFASICO', 'TUE_BIFASICO', 'TUE_TRIFASICO'] },
  { grupo: 'Infraestrutura',    simbolos: ['QD', 'CAIXA_PASSAGEM', 'CAIXA_DERIVACAO'] },
  { grupo: 'Outros',            simbolos: ['CAMPAINHA', 'SENSOR_PRESENCA', 'DADOS_TELEFONE'] },
]
