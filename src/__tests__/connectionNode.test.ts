// src/__tests__/connectionNode.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildConnectionNode, buildConnectionNetwork,
  condutoresTermino, condutoresDeriv, condutoresContinuidade,
  trajetoriaCondutor, verificarCircuito, n_circuitos,
} from '../core/connectionNode'


// ── Fixtures de condutores ────────────────────────────────────────
const fase_c1   = { condutor_id:'cond-f1',  circuito_id:'c1', funcao:'fase'    as const, secao_mm2:2.5, cor:'preto' }
const neutro_c1 = { condutor_id:'cond-n1',  circuito_id:'c1', funcao:'neutro'  as const, secao_mm2:2.5, cor:'azul'  }
const pe_c1     = { condutor_id:'cond-pe1', circuito_id:'c1', funcao:'terra'   as const, secao_mm2:2.5, cor:'verde' }
const ret_c1    = { condutor_id:'cond-r1',  circuito_id:'c1', funcao:'retorno' as const, secao_mm2:1.5, cor:'vermelho' }

describe('buildConnectionNode — topologia interna', () => {

  it('ponto_consumo: condutores que chegam → papel=termino', () => {
    const node = buildConnectionNode('n1','ponto_consumo',
      [fase_c1, neutro_c1, pe_c1, ret_c1], [], [], [], undefined, 'ponto-abc'
    )
    const terminos = condutoresTermino(node)
    expect(terminos).toHaveLength(4)
    expect(terminos.every(c => c.papel === 'termino')).toBe(true)
  })

  it('passagem: condutor que entra e sai → papel=continuidade', () => {
    const node = buildConnectionNode('n1','passagem',
      [fase_c1], [fase_c1], ['elet-in'], ['elet-out']
    )
    const cont = condutoresContinuidade(node)
    expect(cont).toHaveLength(1)
    expect(cont[0].papel).toBe('continuidade')
  })

  it('derivacao: condutor que só sai → papel=derivacao', () => {
    const fase_c2 = { condutor_id:'cond-f2', circuito_id:'c2', funcao:'fase' as const, secao_mm2:2.5, cor:'preto' }
    const node = buildConnectionNode('n1','derivacao',
      [fase_c1],           // entra: c1
      [fase_c1, fase_c2],  // sai: c1 continua, c2 deriva
      [], []
    )
    const deriv = condutoresDeriv(node)
    expect(deriv).toHaveLength(1)
    expect(deriv[0].condutor_id).toBe('cond-f2')
  })

  it('n_circuitos: conta circuitos distintos no nó', () => {
    const fase_c2 = { condutor_id:'cond-f2', circuito_id:'c2', funcao:'fase' as const, secao_mm2:2.5, cor:'preto' }
    const node = buildConnectionNode('n1','caixa',
      [fase_c1, fase_c2], [], [], []
    )
    expect(n_circuitos(node)).toBe(2)
  })
})

describe('buildConnectionNode — verificação normativa', () => {

  it('sem PE: gera aviso PE_FALTANDO (erro NBR)', () => {
    const node = buildConnectionNode('n1','ponto_consumo',
      [fase_c1, neutro_c1],  // sem PE!
      [], [], [], undefined, 'p1'
    )
    const erros = node.avisos.filter(a => a.tipo === 'PE_FALTANDO')
    expect(erros).toHaveLength(1)
    expect(erros[0].severidade).toBe('erro')
  })

  it('com todos os condutores: sem avisos', () => {
    const node = buildConnectionNode('n1','ponto_consumo',
      [fase_c1, neutro_c1, pe_c1],  // F + N + PE completo
      [], [], []
    )
    const erros = node.avisos.filter(a => a.severidade === 'erro')
    expect(erros).toHaveLength(0)
  })

  it('TUG completo (F+N+PE): sem avisos', () => {
    const node = buildConnectionNode('n1','ponto_consumo',
      [fase_c1, neutro_c1, pe_c1], [], [], []
    )
    expect(node.avisos.filter(a => a.severidade === 'erro')).toHaveLength(0)
  })
})

describe('ConnectionNetwork — rastreabilidade por condutor', () => {

  function buildTestNetwork() {
    // Topologia: QD → caixa_A → caixa_B (ponto de consumo)
    const nodeQD = buildConnectionNode('qd','quadro',
      [], [fase_c1, neutro_c1, pe_c1], [], ['elet-qd-a']
    )
    const nodeA = buildConnectionNode('caixa-a','passagem',
      [fase_c1, neutro_c1, pe_c1],  // entrada
      [fase_c1, neutro_c1, pe_c1],  // saída (continua)
      ['elet-qd-a'], ['elet-a-b']
    )
    const nodeB = buildConnectionNode('ponto-b','ponto_consumo',
      [fase_c1, neutro_c1, pe_c1], [], ['elet-a-b'], [],
      undefined, 'ponto-abc'
    )
    return buildConnectionNetwork([nodeQD, nodeA, nodeB])
  }

  it('trajetoriaCondutor: fase c1 passa por 3 nós', () => {
    const net = buildTestNetwork()
    const traj = trajetoriaCondutor('cond-f1', net)
    expect(traj.length).toBe(3)
  })

  it('verificarCircuito: completo quando termina em ponto_consumo', () => {
    const net = buildTestNetwork()
    const result = verificarCircuito('c1', net)
    expect(result.completo).toBe(true)
    expect(result.terminados).toBeGreaterThan(0)
  })

  it('verificarCircuito: incompleto quando condutor não chega', () => {
    // Circuito c99 não existe na rede
    const net = buildTestNetwork()
    const result = verificarCircuito('c99', net)
    expect(result.completo).toBe(false)
    expect(result.avisos.length).toBeGreaterThan(0)
  })

  it('condutor_index: cada condutor indexado nos nós corretos', () => {
    const net = buildTestNetwork()
    const nodes_fase = net.condutor_index.get('cond-f1') ?? []
    expect(nodes_fase).toContain('qd')
    expect(nodes_fase).toContain('caixa-a')
    expect(nodes_fase).toContain('ponto-b')
  })
})

describe('ConnectionNode — interruptor paralelo (three-way)', () => {

  // Topologia: QD → Int.A (viajante1 + viajante2 + fase) → Int.B → Luminária
  // Int.A recebe a fase do QD e manda viajantes para Int.B
  // Int.B recebe viajantes e manda retorno para a luminária
  // NBR: condutores entre os interruptores = F (ou ret) + V1 + V2 + PE

  const viat1 = { condutor_id:'v1', circuito_id:'c1', funcao:'viajante' as const, secao_mm2:1.5, cor:'amarelo' }
  const viat2 = { condutor_id:'v2', circuito_id:'c1', funcao:'viajante' as const, secao_mm2:1.5, cor:'cinza'   }

  it('nó entre interruptores: viajantes são derivações', () => {
    // Int.A: fase entra, viajantes saem
    const nodeA = buildConnectionNode('int-a','caixa',
      [fase_c1, pe_c1],      // entrada: fase + PE
      [viat1, viat2, pe_c1], // saída: viajantes + PE (fase termina aqui)
      [], []
    )
    // viajantes são novos (saem sem entrar) → derivação
    const deriv = condutoresDeriv(nodeA)
    expect(deriv.map(d => d.condutor_id)).toContain('v1')
    expect(deriv.map(d => d.condutor_id)).toContain('v2')
  })

  it('luminária: retorno termina aqui', () => {
    const nodeLum = buildConnectionNode('lum','ponto_consumo',
      [ret_c1, neutro_c1, pe_c1], [], [], [],
      undefined, 'ponto-lum'
    )
    const terminos = condutoresTermino(nodeLum)
    expect(terminos.map(t => t.funcao)).toContain('retorno')
    expect(terminos.map(t => t.funcao)).toContain('neutro')
    expect(terminos.map(t => t.funcao)).toContain('terra')
  })
})
