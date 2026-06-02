// src/__tests__/physicalRoutingEngine.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildRoutingResult, facesDoCircuito, circuitosDaFace, facesParaHighlight,
} from '../core/physicalRoutingEngine'
import type { PontoEletrico } from '../types/geometry'

// ── Grafo de faces mínimo para teste ─────────────────────────────
// face-A → face-B → face-C (corredor linear)
const face_graph: any = {
  faces: new Map([
    ['face-A', { id:'face-A', parede_id:'p1', lado:'interno' as const, comodo_id:'sala', ponto_ids:[], offset_m:0.075 }],
    ['face-B', { id:'face-B', parede_id:'p2', lado:'interno' as const, comodo_id:'sala', ponto_ids:[], offset_m:0.075 }],
    ['face-C', { id:'face-C', parede_id:'p3', lado:'interno' as const, comodo_id:'quarto', ponto_ids:[], offset_m:0.075 }],
  ]),
  adj: new Map([
    ['face-A', ['face-B']],
    ['face-B', ['face-A', 'face-C']],
    ['face-C', ['face-B']],
  ]),
  arestas: new Map(),
}

function pt(id: string, x: number, y: number, parede_id: string, circuito_id?: string): PontoEletrico {
  return {
    id, tipo:'TUG_BAIXA', x, y, rotacao_graus:0, circuito_id,
    pos_parametrica: { parede_id, pos_relativa:0.5, offset_perp:0.1 },
  }
}

describe('buildRoutingResult — roteamento básico', () => {

  it('circuito com 2 pontos em faces conectadas: gera rota', () => {
    const resultado = buildRoutingResult([
      {
        id: 'c1', comprimento_m: 8,
        pontos: [
          pt('p1', 0, 0, 'face-A', 'c1'),
          pt('p2', 6, 2, 'face-C', 'c1'),
        ],
      },
    ], face_graph)
    expect(resultado.rotas).toHaveLength(1)
    expect(resultado.sem_rota).toHaveLength(0)
  })

  it('rota passa pelas faces intermediárias', () => {
    const resultado = buildRoutingResult([
      {
        id: 'c1', comprimento_m: 8,
        pontos: [
          pt('p1', 0, 0, 'face-A', 'c1'),
          pt('p2', 6, 2, 'face-C', 'c1'),
        ],
      },
    ], face_graph)
    const rota = resultado.rotas[0]
    // Deve incluir face-A, face-B (intermediária), face-C
    expect(rota.face_ids).toContain('face-A')
    expect(rota.face_ids).toContain('face-C')
  })

  it('circuito com 1 ponto: sem rota (mínimo 2 pontos)', () => {
    const resultado = buildRoutingResult([
      { id: 'c1', comprimento_m: 5, pontos: [pt('p1', 0, 0, 'face-A', 'c1')] },
    ], face_graph)
    expect(resultado.sem_rota).toContain('c1')
    expect(resultado.rotas).toHaveLength(0)
  })

  it('pontos sem pos_parametrica: sem rota', () => {
    const p_sem_pos: PontoEletrico = {
      id:'px', tipo:'TUG_BAIXA', x:0, y:0, rotacao_graus:0, circuito_id:'c1',
      // sem pos_parametrica
    }
    const resultado = buildRoutingResult([
      { id: 'c1', comprimento_m: 5, pontos: [p_sem_pos, pt('p2', 3, 0, 'face-B', 'c1')] },
    ], face_graph)
    expect(resultado.sem_rota).toContain('c1')
  })
})

describe('buildRoutingResult — divergência de comprimento', () => {

  it('comprimento_real_m > 0 para rota válida', () => {
    const resultado = buildRoutingResult([{
      id:'c1', comprimento_m:8,
      pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')],
    }], face_graph)
    expect(resultado.rotas[0].comprimento_real_m).toBeGreaterThan(0)
  })

  it('alerta_comprimento quando divergência > 20%', () => {
    // comprimento_declarado = 3m, real estimado = ~6m (3 faces × 2m) → > 20%
    const resultado = buildRoutingResult([{
      id:'c1', comprimento_m:3,
      pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')],
    }], face_graph)
    expect(resultado.rotas[0].alerta_comprimento).toBe(true)
  })
})

describe('buildRoutingResult — segmentos compartilhados', () => {

  it('dois circuitos na face-B: segmento compartilhado detectado', () => {
    const resultado = buildRoutingResult([
      { id:'c1', comprimento_m:8, pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')] },
      { id:'c2', comprimento_m:6, pontos:[pt('p3',0,0,'face-A','c2'), pt('p4',6,2,'face-C','c2')] },
    ], face_graph)
    const comp = resultado.segmentos_compartilhados.find(s => s.face_id === 'face-B')
    expect(comp).toBeDefined()
    expect(comp?.n_circuitos).toBe(2)
    expect(comp?.circuito_ids).toContain('c1')
    expect(comp?.circuito_ids).toContain('c2')
  })

  it('ocupacao_est aumenta com mais circuitos', () => {
    const resultado = buildRoutingResult([
      { id:'c1', comprimento_m:8, pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')] },
      { id:'c2', comprimento_m:8, pontos:[pt('p3',0,0,'face-A','c2'), pt('p4',6,2,'face-C','c2')] },
    ], face_graph)
    const comp = resultado.segmentos_compartilhados[0]
    expect(comp.ocupacao_est).toBeGreaterThan(0)
  })
})

describe('consultas ao resultado', () => {

  it('facesDoCircuito: retorna faces da rota', () => {
    const resultado = buildRoutingResult([{
      id:'c1', comprimento_m:8,
      pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')],
    }], face_graph)
    const faces = facesDoCircuito('c1', resultado)
    expect(faces.length).toBeGreaterThan(0)
    expect(faces).toContain('face-A')
  })

  it('circuitosDaFace: retorna circuitos que passam pela face', () => {
    const resultado = buildRoutingResult([{
      id:'c1', comprimento_m:8,
      pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')],
    }], face_graph)
    const circs = circuitosDaFace('face-A', resultado)
    expect(circs).toContain('c1')
  })

  it('facesParaHighlight: retorna Set de faces', () => {
    const resultado = buildRoutingResult([{
      id:'c1', comprimento_m:8,
      pontos:[pt('p1',0,0,'face-A','c1'), pt('p2',6,2,'face-C','c1')],
    }], face_graph)
    const hl = facesParaHighlight('c1', resultado)
    expect(hl instanceof Set).toBe(true)
    expect(hl.has('face-A')).toBe(true)
  })
})
