// src/api.ts
// Abstração da API — funciona tanto em Electron quanto no servidor local

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI
const BASE = 'http://127.0.0.1:3847'

export const api = {
  // Salvar projeto no disco
  async saveProject(json: string, filename: string): Promise<{ ok: boolean; path?: string }> {
    if (isElectron) {
      return (window as any).electronAPI.saveProject(json, filename)
    }
    const r = await fetch(`${BASE}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json, filename }),
    })
    return r.json()
  },

  // Carregar projeto do disco
  async loadProject(filepath: string): Promise<{ ok: boolean; json?: string }> {
    if (isElectron) {
      return (window as any).electronAPI.openProject()
    }
    const r = await fetch(`${BASE}/api/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filepath }),
    })
    return r.json()
  },

  // Listar projetos salvos
  async listProjects(): Promise<{ files: Array<{ name: string; path: string; mtime: Date }> }> {
    try {
      const r = await fetch(`${BASE}/api/projects`)
      return r.json()
    } catch {
      return { files: [] }
    }
  },

  // Verifica se está rodando dentro do Electron empacotado (.exe real
  // distribuído via electron-builder) — diferente de isServerMode()
  // em exporters.ts, que checa o modo pkg+Express (porta 3847), um
  // sistema de empacotamento diferente que não é o usado pelo build
  // atual do GitHub Actions.
  isElectron,

  // Exportar QDFL como .xlsx NATIVO (via IPC + biblioteca xlsx real no
  // processo principal do Electron) — não é o fallback XML disfarçado
  // de .xls, que é frágil e pode disparar aviso de "formato não
  // corresponde" ou pior no Excel moderno.
  async exportQDFLExcel(data: {
    circuitos: any[]
    demanda: any
    projeto?: { nome?: string; projetista?: string; crea?: string }
  }): Promise<{ ok: boolean; path?: string; error?: string }> {
    if (!isElectron) return { ok: false, error: 'Exportação nativa só disponível no app Electron' }
    return (window as any).electronAPI.exportQDFL(data)
  },
}
