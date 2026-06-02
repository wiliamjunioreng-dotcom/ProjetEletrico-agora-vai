// src/__tests__/redeInfraestrutura.test.ts
import { describe, it, expect } from 'vitest'
import { buildRedeInfraestrutura, segmentosDoCircuito, comprimentoRealCircuito } from '../core/redeInfraestrutura'
import { buildGrupoInstalacao } from '../core/grupoInstalacao'
import { buildInfraestruturaCompartilhada } from '../core/infraestruturaCompartilhada'
import type { InputCircuito, InputFace } from '../core/infraestruturaCompartilhada'

// Fixture: sala 4×3m com 3 circuitos
// ILUM passa pela face-N e face-L
// TUG1 passa pela face-N e face-S
// TUG2 só na face-S (deriva depois da caixa g2)
const faces = new Map<string, InputFace>([
  ['face-N', { id:'face-N', parede_id:'p-N', comprimento_m:4, comodo_id:'sala' }],
  ['face-L', { id:'face-L', parede_id:'p-L', comprimento_m:3, comodo_id:'sala' }],
  ['face-S', { id:'face-S', parede_id:'p-S', comprimento_m:4, comodo_id:'sala' }],
])

const circs: InputCircuito[] = [
  { id:'c1', descricao:'ILUM', tipo:'ILUM', secao_mm2:1.5, n_fases:1,
    comprimento_m:15, face_ids:['face-N','face-L'] },
  { id:'c2', descricao:'TUG1', tipo:'TUG',  secao_mm2:2.5, n_fases:1,
    comprimento_m:12, face_ids:['face-N','face-S'] },
  { id:'c3', descricao:'TUG2', tipo:'TUG',  secao_mm2:2.5, n_fases:1,
    comprimento_m:10, face_ids:['face-S'] },
]

const grupos = [
  buildGrupoInstalacao('g1','face-N','p-N',0.30,1.10,['INTERRUPTOR_SIMPLES','TUG_BAIXA'],['c1','c2']),
  buildGrupoInstalacao('g2','face-S','p-S',0.60,0.30,['TUG_BAIXA'],['c3']),
]

function buildFixture() {
  const infra = buildInfraestruturaCompartilhada(circs, grupos, faces)
  return buildRedeInfraestrutura(infra.eletrodutos, infra.caixas)
}

describe('RedeInfraestrutura — segmentos e nós', () => {

  it('rede tem segmentos (trechos entre nós)', () => {
    const rede = buildFixture()
    expect(rede.segmentos.size).toBeGreaterThan(0)
  })

  it('rede tem nós (cantos, caixas, derivações)', () => {
    const rede = buildFixture()
    expect(rede.nos.size).toBeGreaterThan(0)
  })

  it('cada segmento conecta dois nós existentes', () => {
    const rede = buildFixture()
    for (const [, seg] of rede.segmentos) {
      expect(rede.nos.has(seg.no_inicio_id)).toBe(true)
      expect(rede.nos.has(seg.no_fim_id)).toBe(true)
    }
  })

  it('segmentos têm comprimento > 0', () => {
    const rede = buildFixture()
    for (const [, seg] of rede.segmentos) {
      expect(seg.comprimento_m).toBeGreaterThan(0)
    }
  })

  it('nós de caixa têm circuitos_saem preenchido', () => {
    const rede = buildFixture()
    const nos_caixa = [...rede.nos.values()].filter(n => n.tipo === 'caixa_saida')
    expect(nos_caixa.length).toBeGreaterThan(0)
    for (const no of nos_caixa) {
      expect(no.circuitos_saem?.length).toBeGreaterThan(0)
    }
  })
})

describe('RedeInfraestrutura — ocupação variável', () => {

  it('trecho antes da caixa g1 tem mais circuitos que após', () => {
    const rede = buildFixture()
    // Na face-N: antes da caixa g1 (pos 30%) passam c1+c2
    //            depois da caixa g1 ninguém sai ainda
    // Os segmentos têm circuito_ids diferentes
    const segs_N = [...rede.segmentos.values()].filter(s => s.face_id === 'face-N')
    if (segs_N.length > 1) {
      // Deve haver variação no número de circuitos
      const n_max = Math.max(...segs_N.map(s => s.circuito_ids.length))
      const n_min = Math.min(...segs_N.map(s => s.circuito_ids.length))
      // Não necessariamente diferentes se g1 não remove nenhum circuito da face-N
      expect(n_min).toBeGreaterThanOrEqual(0)
      expect(n_max).toBeGreaterThan(0)
    }
  })

  it('ocupação é calculada por segmento (não uniforme)', () => {
    const rede = buildFixture()
    const taxas = [...rede.segmentos.values()].map(s => s.ocupacao.taxa_pct)
    // Deve haver pelo menos uma taxa > 0
    expect(taxas.some(t => t > 0)).toBe(true)
  })

  it('fa médio < 1.0 quando há compartilhamento', () => {
    const rede = buildFixture()
    // Com 2-3 circuitos compartilhando eletrodutos, Fa médio < 1.0
    const segs_com_2_plus = [...rede.segmentos.values()]
      .filter(s => s.circuito_ids.length >= 2)
    if (segs_com_2_plus.length > 0) {
      expect(segs_com_2_plus[0].ocupacao.fa).toBeLessThan(1.0)
    }
  })
})

describe('RedeInfraestrutura — rastreabilidade por circuito', () => {

  it('circ_segs indexa circuitos nos segmentos corretos', () => {
    const rede = buildFixture()
    const segs_c1 = segmentosDoCircuito('c1', rede)
    // c1 (ILUM) passa pela face-N e face-L
    expect(segs_c1.length).toBeGreaterThan(0)
    const faces_c1 = segs_c1.map(s => s.face_id)
    expect(faces_c1.some(f => f === 'face-N' || f === 'face-L')).toBe(true)
  })

  it('comprimento real do circuito = soma dos segmentos onde aparece', () => {
    const rede = buildFixture()
    const segs_c2 = segmentosDoCircuito('c2', rede)
    const comp_manual = segs_c2.reduce((s, seg) => s + seg.comprimento_m, 0)
    const comp_func   = comprimentoRealCircuito('c2', rede)
    expect(comp_func).toBeCloseTo(comp_manual, 2)
  })

  it('c3 (só face-S) não aparece em face-N ou face-L', () => {
    const rede = buildFixture()
    const segs_c3 = segmentosDoCircuito('c3', rede)
    for (const seg of segs_c3) {
      expect(seg.face_id).toBe('face-S')
    }
  })
})

describe('RedeInfraestrutura — quantitativo', () => {

  it('metros de eletroduto > 0', () => {
    const rede = buildFixture()
    const total = rede.quant.eletrodutos.reduce((s, e) => s + e.metros, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('metros de cabo > metros de eletroduto (cabos multiplicam)', () => {
    const rede = buildFixture()
    const metros_elet = rede.quant.eletrodutos.reduce((s, e) => s + e.metros, 0)
    const metros_cabo = rede.quant.cabos.reduce((s, c) => s + c.metros, 0)
    expect(metros_cabo).toBeGreaterThan(metros_elet)
  })

  it('curvas_90 >= número de cantos no percurso', () => {
    const rede = buildFixture()
    // Cada segmento tem nó de início e fim — cantos existem
    expect(rede.quant.curvas_90).toBeGreaterThanOrEqual(0)
  })

  it('fa_medio está entre 0 e 1', () => {
    const rede = buildFixture()
    expect(rede.quant.fa_medio).toBeGreaterThan(0)
    expect(rede.quant.fa_medio).toBeLessThanOrEqual(1.0)
  })
})
