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
}
