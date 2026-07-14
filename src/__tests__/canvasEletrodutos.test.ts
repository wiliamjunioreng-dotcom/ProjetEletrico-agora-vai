// Validação — novas ações do store para o canvas visual de eletrodutos
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({ rede: { nos: [], segmentos: [] } } as any)
}

describe('Canvas de eletrodutos — ações do store', () => {
  beforeEach(() => resetStore())

  it('addSegmento retorna o id do segmento criado (necessário pro canvas selecionar após desenhar)', () => {
    const { addNo, addSegmento } = useProjectStore.getState()
    addNo({ nome: 'QD', tipo: 'QD', pos_x: 0, pos_y: 0 } as any)
    addNo({ nome: 'Ponto 1', tipo: 'CAIXA_TOMADA', pos_x: 3, pos_y: 0 } as any)
    const { rede } = useProjectStore.getState()
    const id = addSegmento({
      nome: 'Teste', origem_no_id: rede.nos[0].id, destino_no_id: rede.nos[1].id,
      comprimento_m: 3, diametro_mm: 20, material: 'PVC_rigido', n_curvas_90: 0, condutores: [],
    } as any)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(useProjectStore.getState().rede.segmentos.find(s => s.id === id)).toBeDefined()
  })

  it('updateNo atualiza a posição de um nó (arrastar no canvas)', () => {
    const { addNo, updateNo } = useProjectStore.getState()
    addNo({ nome: 'QD', tipo: 'QD', pos_x: 0, pos_y: 0 } as any)
    const id = useProjectStore.getState().rede.nos[0].id
    updateNo(id, { pos_x: 5.5, pos_y: 2.3 })
    const no = useProjectStore.getState().rede.nos[0]
    expect(no.pos_x).toBe(5.5)
    expect(no.pos_y).toBe(2.3)
  })

  it('updateSegmento atualiza dados e RECALCULA a análise automaticamente', () => {
    const { addNo, addSegmento, updateSegmento } = useProjectStore.getState()
    addNo({ nome: 'QD', tipo: 'QD', pos_x: 0, pos_y: 0 } as any)
    addNo({ nome: 'P1', tipo: 'CAIXA_TOMADA', pos_x: 3, pos_y: 0 } as any)
    const { rede } = useProjectStore.getState()
    const id = addSegmento({
      nome: 'Trecho', origem_no_id: rede.nos[0].id, destino_no_id: rede.nos[1].id,
      comprimento_m: 3, diametro_mm: 16, material: 'PVC_rigido', n_curvas_90: 0, condutores: [],
    } as any)
    const antes = useProjectStore.getState().rede.segmentos.find(s => s.id === id)
    expect(antes?.analise?.taxa_ocupacao_pct).toBe(0)  // sem condutores ainda

    // Adiciona condutores via updateSegmento — análise deve recalcular sozinha
    updateSegmento(id, {
      condutores: [
        { tipo: 'FASE_A', secao_mm2: 2.5, circuito_id: '', corrente_a: 0 },
        { tipo: 'NEUTRO', secao_mm2: 2.5, circuito_id: '', corrente_a: 0 },
        { tipo: 'PE', secao_mm2: 2.5, circuito_id: '', corrente_a: 0 },
      ],
    })
    const depois = useProjectStore.getState().rede.segmentos.find(s => s.id === id)
    expect(depois?.analise?.taxa_ocupacao_pct).toBeGreaterThan(0)
    expect(depois?.condutores).toHaveLength(3)
  })

  it('updateSegmento não afeta outros segmentos', () => {
    const { addNo, addSegmento, updateSegmento } = useProjectStore.getState()
    addNo({ nome: 'QD', tipo: 'QD', pos_x: 0, pos_y: 0 } as any)
    addNo({ nome: 'P1', tipo: 'CAIXA_TOMADA', pos_x: 3, pos_y: 0 } as any)
    addNo({ nome: 'P2', tipo: 'CAIXA_TOMADA', pos_x: 6, pos_y: 0 } as any)
    const { rede } = useProjectStore.getState()
    const id1 = addSegmento({ nome: 'S1', origem_no_id: rede.nos[0].id, destino_no_id: rede.nos[1].id,
      comprimento_m: 3, diametro_mm: 20, material: 'PVC_rigido', n_curvas_90: 0, condutores: [] } as any)
    const id2 = addSegmento({ nome: 'S2', origem_no_id: rede.nos[1].id, destino_no_id: rede.nos[2].id,
      comprimento_m: 3, diametro_mm: 20, material: 'PVC_rigido', n_curvas_90: 0, condutores: [] } as any)

    updateSegmento(id1, { comprimento_m: 99 })
    const s1 = useProjectStore.getState().rede.segmentos.find(s => s.id === id1)
    const s2 = useProjectStore.getState().rede.segmentos.find(s => s.id === id2)
    expect(s1?.comprimento_m).toBe(99)
    expect(s2?.comprimento_m).toBe(3)
  })
})
