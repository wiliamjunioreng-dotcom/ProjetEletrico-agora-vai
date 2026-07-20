// Validação — "todo cuidado e zelo pra não corromper ou perder dados"
// Checksum de integridade + validação estrutural no arquivo salvo/carregado
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore, calcularChecksum, validarEstruturaArquivo } from '../store/projectStore'

function resetStore() {
  useProjectStore.setState({
    comodos: [], circuitos_raw: [], circuitos_calc: [],
    projeto: { ...useProjectStore.getState().projeto, nome: 'Teste Integridade' },
  } as any)
}

describe('calcularChecksum — determinístico e sensível a mudanças', () => {
  it('Mesmo texto sempre produz o mesmo checksum', () => {
    const a = calcularChecksum('{"x":1,"y":2}')
    const b = calcularChecksum('{"x":1,"y":2}')
    expect(a).toBe(b)
  })
  it('Texto diferente produz checksum diferente', () => {
    const a = calcularChecksum('{"x":1}')
    const b = calcularChecksum('{"x":2}')
    expect(a).not.toBe(b)
  })
})

describe('validarEstruturaArquivo — rejeita malformado com mensagem clara', () => {
  it('Aceita estrutura válida (retorna null = sem erro)', () => {
    expect(validarEstruturaArquivo({ projeto: {}, comodos: [], circuitos: [] })).toBeNull()
  })
  it('Rejeita se "projeto" não é objeto', () => {
    expect(validarEstruturaArquivo({ projeto: 'não é objeto' })).toContain('projeto')
  })
  it('Rejeita se "projeto" está ausente', () => {
    expect(validarEstruturaArquivo({ comodos: [] })).toContain('projeto')
  })
  it('Rejeita se "comodos" não é array (ex: virou objeto por corrupção)', () => {
    expect(validarEstruturaArquivo({ projeto: {}, comodos: { corrompido: true } })).toContain('comodos')
  })
  it('Rejeita se JSON raiz não é objeto', () => {
    expect(validarEstruturaArquivo('string qualquer')).toBeTruthy()
    expect(validarEstruturaArquivo(null)).toBeTruthy()
    expect(validarEstruturaArquivo([1,2,3])).toBeTruthy()
  })
})

describe('Round-trip salvar → carregar preserva checksum válido', () => {
  beforeEach(resetStore)

  it('Arquivo recém-salvo carrega sem nenhum aviso de integridade', () => {
    const { salvarJSON, carregarJSON } = useProjectStore.getState()
    const json = salvarJSON()
    expect(() => carregarJSON(json)).not.toThrow()
  })

  it('_meta.checksum está presente no arquivo salvo', () => {
    const { salvarJSON } = useProjectStore.getState()
    const json = salvarJSON()
    const data = JSON.parse(json)
    expect(data._meta.checksum).toBeDefined()
    expect(typeof data._meta.checksum).toBe('string')
    expect(data._meta.checksum.length).toBeGreaterThan(0)
  })
})

describe('Detecção de corrupção — arquivo adulterado é pego', () => {
  beforeEach(resetStore)

  it('JSON malformado (truncado) é rejeitado com mensagem clara, não crasha', () => {
    const { carregarJSON } = useProjectStore.getState()
    const truncado = '{"projeto": {"nome": "Teste", "sistema": "Trifas'  // cortado no meio
    expect(() => carregarJSON(truncado)).toThrow(/corrompido|inválido/i)
  })

  it('Conteúdo alterado DEPOIS de salvo (checksum não bate mais) → detecta e avisa, não carrega direto', () => {
    const { salvarJSON, carregarJSON } = useProjectStore.getState()
    const json = salvarJSON()
    const data = JSON.parse(json)
    // Simula alteração externa do arquivo — muda um valor sem recalcular o checksum
    data.projeto.nome = 'Nome adulterado externamente'
    const jsonAdulterado = JSON.stringify(data)

    expect(() => carregarJSON(jsonAdulterado)).toThrow(/AVISO_INTEGRIDADE/)
  })

  it('Com o aviso de integridade, é possível FORÇAR o carregamento mesmo assim (usuário decide, não perde o arquivo)', () => {
    const { salvarJSON, carregarJSON } = useProjectStore.getState()
    const json = salvarJSON()
    const data = JSON.parse(json)
    data.projeto.nome = 'Nome adulterado'
    const jsonAdulterado = JSON.stringify(data)

    expect(() => carregarJSON(jsonAdulterado)).toThrow()
    // Forçado (segundo parâmetro true) — não deve lançar, deve carregar mesmo com checksum divergente
    expect(() => carregarJSON(jsonAdulterado, true)).not.toThrow()
    expect(useProjectStore.getState().projeto.nome).toBe('Nome adulterado')
  })

  it('Arquivo SEM checksum (formato antigo, anterior a essa proteção) carrega normalmente, sem nenhum aviso', () => {
    const { carregarJSON } = useProjectStore.getState()
    const arquivoAntigo = JSON.stringify({
      _meta: { app: 'ProjetEletrico', versao: '3.0' },  // sem checksum
      projeto: { nome: 'Projeto Legado' },
      comodos: [], circuitos: [],
    })
    expect(() => carregarJSON(arquivoAntigo)).not.toThrow()
    expect(useProjectStore.getState().projeto.nome).toBe('Projeto Legado')
  })

  it('Reformatar o JSON (mudar espaçamento/indentação) NÃO dispara falso positivo de corrupção', () => {
    const { salvarJSON, carregarJSON } = useProjectStore.getState()
    const json = salvarJSON()
    const data = JSON.parse(json)
    // Reserializa com espaçamento diferente (simula abrir num editor e salvar) —
    // o CONTEÚDO dos campos é idêntico, só a formatação do arquivo muda
    const jsonReformatado = JSON.stringify(data)  // compacto, sem indentação
    expect(() => carregarJSON(jsonReformatado)).not.toThrow()
  })
})
