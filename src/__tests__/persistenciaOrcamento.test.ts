// Validação — "salvar e continuar depois", incluindo dados do orçamento.
// Achado real: os itens do orçamento (com qualquer preço editado
// manualmente) viviam em useState LOCAL do componente Precos.tsx -
// nunca faziam parte do arquivo salvo, e se perdiam ao só navegar
// para outra aba e voltar. Movido para o estado global do projeto.
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/projectStore'
import type { ItemOrc } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({
    comodos: [], circuitos_raw: [], circuitos_calc: [],
    orcamento_itens: [], orcamento_estado_uf: 'MG', orcamento_desoneracao: 'nao_desonerado',
  } as any)
}

describe('Persistência do orçamento — salvar/carregar/navegar', () => {
  beforeEach(resetStore)

  it('Itens do orçamento (com preço editado manualmente) sobrevivem a salvar → carregar', () => {
    const { setOrcamentoItens, setOrcamentoEstadoUf, setOrcamentoDesoneracao, salvarJSON, carregarJSON } = useProjectStore.getState()

    const itemComEdicaoManual: ItemOrc = {
      chave: 'cabo-2.5mm', descr: 'Cabo Cu PVC 2.5mm²', qtd: 45, unidade: 'm',
      preco_mat_manual: 3.85,  // preço que o engenheiro digitou à mão, sobrepondo a tabela
      ignorar: false,
    }
    setOrcamentoItens([itemComEdicaoManual])
    setOrcamentoEstadoUf('SP')
    setOrcamentoDesoneracao('desonerado')

    const json = salvarJSON()

    // Simula "fechar o app e abrir de novo" — reseta tudo primeiro
    resetStore()
    expect(useProjectStore.getState().orcamento_itens).toHaveLength(0)

    carregarJSON(json)

    const { orcamento_itens, orcamento_estado_uf, orcamento_desoneracao } = useProjectStore.getState()
    expect(orcamento_itens).toHaveLength(1)
    expect(orcamento_itens[0].preco_mat_manual).toBe(3.85)
    expect(orcamento_itens[0].descr).toBe('Cabo Cu PVC 2.5mm²')
    expect(orcamento_estado_uf).toBe('SP')
    expect(orcamento_desoneracao).toBe('desonerado')
  })

  it('Arquivo salvo ANTES desta correção (sem campos de orçamento) ainda abre normalmente — compatibilidade retroativa', () => {
    const { carregarJSON } = useProjectStore.getState()
    const arquivoAntigo = JSON.stringify({
      _meta: { app: 'ProjetEletrico', versao: '3.0' },
      projeto: { nome: 'Projeto Antigo' },
      comodos: [], circuitos: [],
      // SEM orcamento_itens/orcamento_estado_uf/orcamento_desoneracao
    })
    expect(() => carregarJSON(arquivoAntigo)).not.toThrow()
    const { orcamento_itens, orcamento_estado_uf, orcamento_desoneracao } = useProjectStore.getState()
    expect(orcamento_itens).toEqual([])
    expect(orcamento_estado_uf).toBe('MG')
    expect(orcamento_desoneracao).toBe('nao_desonerado')
  })

  it('setOrcamentoItens aceita função de atualização (padrão prev => novo), igual setState do React', () => {
    const { setOrcamentoItens } = useProjectStore.getState()
    setOrcamentoItens([{ chave: 'a', descr: 'Item A', qtd: 1, unidade: 'un' }])
    setOrcamentoItens(prev => [...prev, { chave: 'b', descr: 'Item B', qtd: 2, unidade: 'un' }])
    const { orcamento_itens } = useProjectStore.getState()
    expect(orcamento_itens).toHaveLength(2)
    expect(orcamento_itens.map(i => i.chave)).toEqual(['a', 'b'])
  })

  it('resetar() limpa o orçamento — não vaza de um projeto pro próximo', () => {
    const { setOrcamentoItens, resetar } = useProjectStore.getState()
    setOrcamentoItens([{ chave: 'x', descr: 'Item X', qtd: 1, unidade: 'un' }])
    expect(useProjectStore.getState().orcamento_itens).toHaveLength(1)
    resetar()
    expect(useProjectStore.getState().orcamento_itens).toHaveLength(0)
  })

  it('Itens complexos (com insumo SINAPI/SETOP aninhado) sobrevivem ao round-trip JSON sem perder dado', () => {
    const { setOrcamentoItens, salvarJSON, carregarJSON } = useProjectStore.getState()
    const itemComplexo: ItemOrc = {
      chave: 'disj-25a', descr: 'Disjuntor 25A monopolar', qtd: 3, unidade: 'un',
      preco_mat_sin: 18.50,
      insumo_mat_sin: { codigo: '12345', descricao: 'Disjuntor termomagnético 25A' } as any,
      match_mat_sin: 'auto',
      preco_mo_manual: 12.00,
    }
    setOrcamentoItens([itemComplexo])
    const json = salvarJSON()
    resetStore()
    carregarJSON(json)
    const item = useProjectStore.getState().orcamento_itens[0]
    expect(item.preco_mat_sin).toBe(18.50)
    expect((item.insumo_mat_sin as any)?.codigo).toBe('12345')
    expect(item.preco_mo_manual).toBe(12.00)
  })
})
