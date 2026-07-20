// Validação — "Salvar" de verdade (sobrescreve o mesmo arquivo, sem
// reabrir diálogo) via IPC nativo do Electron, com fallback seguro
// fora dele. Ambiente de teste é 'node' — Electron real não pode ser
// simulado aqui; o handler main.js foi verificado por leitura direta
// (dialog.showSaveDialog/showOpenDialog + fs.writeFileSync/readFileSync
// + backup .bak automático antes de sobrescrever).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('api.overwriteProject / loadProject — comportamento fora do Electron', () => {
  beforeAll(() => {
    ;(globalThis as any).window = {}
  })
  afterAll(() => {
    delete (globalThis as any).window
  })

  it('overwriteProject sem Electron cai pro saveProject (nunca lança exceção)', async () => {
    const { api } = await import('../api')
    expect(api.isElectron).toBe(false)
    // saveProject fora do Electron tenta fetch a um servidor local que
    // não está rodando neste teste — deve rejeitar/retornar erro
    // graciosamente, nunca travar o processo
    await expect(api.overwriteProject('{}', '/tmp/x.projelec', 'x.projelec')).resolves.toBeDefined()
  })

  it('loadProject sem Electron não lança exceção mesmo com caminho vazio', async () => {
    const { api } = await import('../api')
    await expect(api.loadProject('')).resolves.toBeDefined()
  })
})

describe('marcarSalvo — rastreia o caminho do arquivo pra permitir sobrescrita direta', () => {
  it('marcarSalvo grava o caminho e zera a flag de modificado', async () => {
    const { useProjectStore } = await import('../store/projectStore')
    useProjectStore.setState({ arquivo_path: null, modificado: true } as any)
    useProjectStore.getState().marcarSalvo('/home/usuario/MeuProjeto.projelec')
    const { arquivo_path, modificado } = useProjectStore.getState()
    expect(arquivo_path).toBe('/home/usuario/MeuProjeto.projelec')
    expect(modificado).toBe(false)
  })

  it('resetar() limpa o caminho salvo — novo projeto não sobrescreve o anterior por engano', async () => {
    const { useProjectStore } = await import('../store/projectStore')
    useProjectStore.getState().marcarSalvo('/home/usuario/ProjetoAntigo.projelec')
    expect(useProjectStore.getState().arquivo_path).toBe('/home/usuario/ProjetoAntigo.projelec')
    useProjectStore.getState().resetar()
    expect(useProjectStore.getState().arquivo_path).toBeNull()
  })
})
