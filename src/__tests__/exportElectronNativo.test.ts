// Validação — comportamento defensivo do export nativo Electron
// Ambiente de teste é 'node' (sem window/DOM) — testamos o wrapper
// via globalThis simulado, não um Electron real (impossível aqui).
// A correção completa (main.js + preload.js) foi verificada por
// leitura direta do código: contextBridge expõe exportQDFL corretamente,
// e o handler usa a biblioteca xlsx real para gerar .xlsx nativo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('api.exportQDFLExcel — comportamento defensivo sem Electron', () => {
  beforeAll(() => {
    ;(globalThis as any).window = {}
  })
  afterAll(() => {
    delete (globalThis as any).window
  })

  it('isElectron é false quando window.electronAPI não existe — não lança exceção', async () => {
    const { api } = await import('../api')
    expect(api.isElectron).toBe(false)
  })

  it('exportQDFLExcel retorna erro claro (ok:false) fora do Electron, nunca lança exceção', async () => {
    const { api } = await import('../api')
    const r = await api.exportQDFLExcel({ circuitos: [], demanda: null })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
