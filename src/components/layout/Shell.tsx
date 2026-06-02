// src/components/layout/Shell.tsx — ProjetEletrico v2.0 — Industrial Precision
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useProjectStore } from '../../store/projectStore'

const NAV = [
  { group: 'Configuração' },
  { id: 'importar_dxf', label: '📐 Importar DXF', step: '0', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'projeto',       label: 'Dados do Projeto',   step: '1', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'comodos',       label: 'Previsão de Cargas', step: '2', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { group: 'Cálculo' },
  { id: 'circuitos',    label: 'Circuitos',            step: '3', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'balanceamento',label: 'Balanceamento R/S/T',  step: '4', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
  { id: 'protecao',     label: 'Proteção / IDR / DPS', step: '5', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { group: 'Entrega' },
  { id: 'auditoria',    label: '🔍 Auditoria',           step: '5b', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'qdfl',         label: 'QDFL + Memorial',      step: '6', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'unifilar',     label: 'Diagrama Unifilar',    step: '',  icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { id: 'materiais',    label: 'Lista de Materiais',   step: '',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'precos',       label: 'Preços SINAPI/SETOP',   step: '',  icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'art',          label: 'Relatório / ART',     step: '',  icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'planta',        label: 'Planta Baixa Elétrica', step: '',
    icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { id: 'eletrodutos',  label: 'Eletrodutos / NBR 5444', step: '', icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
  { id: 'luminotecnico', label: 'Luminotécnico',          step: '',  icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
]

const PASSOS_TOTAL = 6

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const {
    pagina_atual, setPagina, projeto, modificado,
    circuitos_calc, salvarJSON, carregarJSON, resetar
  } = useProjectStore()

  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [theme, setTheme]         = useState<'light' | 'dark'>(
    () => (localStorage.getItem('pe_theme') as 'light' | 'dark') ?? 'light'
  )

  // Aplicar tema ao documento root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pe_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light')
  }, [])
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save a cada 30s se houver modificações
  useEffect(() => {
    if (!modificado) return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      doSave(true)
    }, 30000)
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [modificado, projeto, circuitos_calc])

  const ci    = circuitos_calc.filter(c => c.potencia_va > 0)
  const n_ok  = ci.filter(c => c.status === 'OK').length
  const n_err = ci.filter(c => c.status === 'ERRO').length
  const iq    = ci.length > 0 ? Math.round(n_ok / ci.length * 100) : 0

  // Calcular passo atual para progress bar
  const STEP_MAP: Record<string, number> = {
    dashboard: 0, projeto: 1, comodos: 2, circuitos: 3,
    importar_dxf: 0, balanceamento: 4, protecao: 5, auditoria: 5, qdfl: 6, unifilar: 6, materiais: 6,
    luminotecnico: 2, eletrodutos: 3, planta: 3, precos: 6, art: 6
  }
  const passo_atual = STEP_MAP[pagina_atual] ?? 0
  const progress_pct = Math.round((passo_atual / PASSOS_TOTAL) * 100)

  function doSave(auto = false) {
    const json = salvarJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `${(projeto.nome || 'projeto').replace(/\s+/g, '_')}.projelec`
    if (!auto) a.click()
    URL.revokeObjectURL(a.href)
    setLastSaved(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
  }

  function handleAbrir() {
    const inp = document.createElement('input')
    inp.type   = 'file'
    inp.accept = '.projelec,.json'
    inp.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try { carregarJSON(await file.text()) }
      catch (err) { alert('Arquivo inválido: ' + (err as Error).message) }
    }
    inp.click()
  }

  function handleNovo() {
    if (modificado && !confirm('Projeto modificado. Descartar alterações?')) return
    resetar()
  }

  const iqColor = n_err > 0 ? '#da1e28' : iq >= 90 ? '#0f9d58' : '#f59e0b'

  return (
    <div className="shell">

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-brand" onClick={() => setPagina('dashboard')} style={{ cursor: 'pointer' }}>
          <div className="logo">PE</div>
          <div>
            <div className="app-name">ProjetEletrico</div>
          </div>
        </div>

        <div className="topbar-center">
          <div className="proj-chip">
            <div className={`dot ${!modificado ? 'saved' : ''}`} />
            {projeto.nome || 'Novo Projeto'}
            {modificado ? ' •' : ''}
          </div>
          {lastSaved && (
            <span style={{ fontSize: 10, color: 'var(--sb-text)', fontFamily: 'var(--mono)' }}>
              salvo {lastSaved}
            </span>
          )}
        </div>

        <div className="topbar-actions">
          <button className="tb ghost" onClick={handleNovo}>Novo</button>
          <button className="tb ghost" onClick={handleAbrir}>Abrir</button>
          <button className="tb ghost" onClick={() => doSave()}>Salvar</button>
          <button className="theme-toggle" onClick={toggleTheme}
            title={theme === 'light' ? 'Modo AutoCAD (escuro)' : 'Modo Revit (claro)'}>
            {theme === 'light' ? '◐' : '◑'}
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--sb-border)', margin: '0 2px' }} />
          <button className="tb blue" onClick={() => setPagina('qdfl')}>Exportar QDFL</button>
        </div>
      </div>

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <div className="sidebar">
        <div className="sidebar-scroll">
          {NAV.map((item, i) => {
            if ('group' in item) {
              return <div key={i} className="nav-group-label">{item.group}</div>
            }
            const active = pagina_atual === item.id
            const badge  = item.id === 'circuitos' && ci.length > 0 ? ci.length : null
            return (
              <div
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setPagina(item.id!)}
              >
                <span className="nav-step-num">{item.step}</span>
                <Icon d={item.icon!} />
                <span style={{ flex: 1, fontSize: 12.5 }}>{item.label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="progress-track">
          <div className="progress-label">
            <span>Progresso</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{passo_atual}/{PASSOS_TOTAL}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress_pct}%` }} />
          </div>
        </div>

        <div className="sb-footer">
          <div className="sb-proj-card">
            <div className="sb-proj-name">{projeto.nome || 'Novo Projeto'}</div>
            <div className="sb-proj-sub">
              {(projeto as any).concessionaria || 'CEMIG'} ·{' '}
              {(projeto as any).v_fase || 127}/{(projeto as any).v_linha || 220}V ·{' '}
              {projeto.metodo_instalacao}
            </div>
            <div className="sb-status">
              <div className="sb-dot" style={{ background: iqColor }} />
              <div className="sb-stat-txt">
                {ci.length > 0
                  ? `${ci.length} circuitos · IQ ${iq}% ${n_err > 0 ? `· ${n_err} erro(s)` : ''}`
                  : 'Motor NBR 5410 ativo'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="content">{children}</div>
    </div>
  )
}
