// src/components/layout/Shell.tsx — Lumen: Projeto Elétrico
// Layout fiel ao LumenSolar (mesma empresa): sidebar de altura total
// com stepper numerado para o fluxo principal + lista de ferramentas
// de apoio, sem topbar separada — barra de ações fica local ao conteúdo.
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useProjectStore } from '../../store/projectStore'

// ── Fluxo principal — mesmos 5 passos já estabelecidos no roteiro
// do Dashboard, agora também representados no stepper da sidebar ──
const FLUXO_PRINCIPAL = [
  { id: 'projeto',   label: 'Dados do Projeto' },
  { id: 'comodos',   label: 'Cômodos e Cargas' },
  { id: 'circuitos', label: 'Circuitos' },
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'qdfl',      label: 'Emissão (QDFL)' },
]

// ── Verificações técnicas — afetam a CORREÇÃO do projeto (proteção,
// ocupação de eletroduto, balanço de fases), mas não são etapa
// obrigatória sequencial porque dependem de decisão de engenharia,
// não de um número mínimo de circuitos cadastrados. Vale revisar
// antes de emitir, mas a ordem entre elas não importa. ────────────
const VERIFICACOES = [
  { id: 'protecao',      label: 'Proteção / IDR / DPS', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'eletrodutos',   label: 'Eletrodutos',          icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
  { id: 'balanceamento', label: 'Balanceamento R/S/T',  icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
  { id: 'luminotecnico', label: 'Luminotécnico',        icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
]

// ── Documentos e referência — não recalculam nada do projeto, só
// GERAM saída (diagrama, lista, orçamento) ou servem de CONSULTA
// (símbolos). Puramente opcionais, usados quando o projeto pede. ──
const DOCUMENTOS = [
  { id: 'unifilar',   label: 'Diagrama Unifilar',   icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { id: 'materiais',  label: 'Lista de Materiais',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'precos',     label: 'Preços SINAPI/SETOP', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'art',        label: 'Relatório / ART',      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'simbologia', label: 'Legenda NBR 5444',     icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s4.332.477 5.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
]

// Mapeia páginas que "pertencem" a um passo do fluxo principal, mesmo
// quando não são clicadas diretamente (ex: circuitos conta como passo 3)
const STEP_MAP: Record<string, number> = {
  dashboard: 0, projeto: 1, comodos: 2, circuitos: 3,
  auditoria: 4, qdfl: 5,
  // ferramentas de apoio não avançam o stepper — ficam no passo atual
  balanceamento: 3, protecao: 3, eletrodutos: 3, luminotecnico: 2,
  unifilar: 5, materiais: 5, precos: 5, art: 5, simbologia: 0,
}

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pe_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light')
  }, [])
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!modificado) return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => { doSave(true) }, 30000)
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [modificado, projeto, circuitos_calc])

  const ci    = circuitos_calc.filter(c => c.potencia_va > 0)
  const n_ok  = ci.filter(c => c.status === 'OK').length
  const n_err = ci.filter(c => c.status === 'ERRO').length
  const iq    = ci.length > 0 ? Math.round(n_ok / ci.length * 100) : 0

  const passo_atual = STEP_MAP[pagina_atual] ?? 0

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

  const iqColor = n_err > 0 ? 'var(--red)' : iq >= 90 ? 'var(--green)' : 'var(--amber)'

  return (
    <div className="shell">

      {/* ── Sidebar — altura total, sem topbar separada ───────────── */}
      <div className="sidebar">

        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}
            onClick={() => setPagina('dashboard')}>
            <div className="sidebar-logo-badge">L</div>
            <div>
              <div className="sidebar-logo-text-main">LUMEN</div>
              <div className="sidebar-logo-text-sub">PROJETO ELÉTRICO</div>
            </div>
          </div>
          <button onClick={toggleTheme}
            title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
            style={{
              width: 26, height: 26, borderRadius: 'var(--r)', flexShrink: 0,
              border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.045)',
              color: 'var(--sb-text)', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {theme === 'light' ? '◐' : '◑'}
          </button>
        </div>

        {/* Stepper do fluxo principal */}
        <div className="stepper">
          <div className="stepper-line-bg" style={{ height: `calc(100% - 40px)` }} />
          <div className="stepper-line-fill" style={{
            height: `${(Math.min(passo_atual, FLUXO_PRINCIPAL.length) / FLUXO_PRINCIPAL.length) * 100}%`,
          }} />
          {FLUXO_PRINCIPAL.map((step, idx) => {
            const stepNum = idx + 1
            const done    = stepNum < passo_atual
            const current = stepNum === passo_atual || (pagina_atual === step.id)
            const estado  = current ? 'current' : done ? 'done' : 'future'
            return (
              <div key={step.id} className="stepper-item" onClick={() => setPagina(step.id as any)}>
                <div className={`stepper-circle ${estado}`}>
                  {done ? '✓' : stepNum}
                </div>
                <span className={`stepper-label ${estado}`}>{step.label}</span>
              </div>
            )
          })}
        </div>

        {/* Ferramentas de apoio — não sequenciais */}
        <div className="sidebar-tools">
          <div className="sidebar-tools-label" title="Não recalculam nada sozinhas — ajudam a revisar decisões de engenharia que o fluxo principal não força numa ordem fixa">
            Verificações técnicas
          </div>
          {VERIFICACOES.map(item => {
            const active = pagina_atual === item.id
            const badge  = item.id === 'balanceamento' && ci.length > 0 ? ci.length : null
            return (
              <div key={item.id} className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setPagina(item.id as any)}>
                <Icon d={item.icon} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </div>
            )
          })}

          <div className="sidebar-tools-label" title="Não mudam nenhum cálculo — só geram um documento de saída ou servem de consulta">
            Documentos e referência
          </div>
          {DOCUMENTOS.map(item => {
            const active = pagina_atual === item.id
            return (
              <div key={item.id} className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setPagina(item.id as any)}>
                <Icon d={item.icon} />
                <span style={{ flex: 1 }}>{item.label}</span>
              </div>
            )
          })}
        </div>

        {/* Rodapé — status do projeto + ações de arquivo */}
        <div className="sidebar-footer">
          <div className="sb-proj-card">
            <div className="sb-proj-name">{projeto.nome || 'Novo Projeto'}</div>
            <div className="sb-proj-sub">
              {(projeto as any).concessionaria || 'CEMIG'} ·{' '}
              {(projeto as any).v_fase || 127}/{(projeto as any).v_linha || 220}V
            </div>
            <div className="sb-status">
              <div className="sb-dot" style={{ background: iqColor }} />
              <div className="sb-stat-txt">
                {ci.length > 0
                  ? `${ci.length} circuitos · IQ ${iq}%${n_err > 0 ? ` · ${n_err} erro(s)` : ''}`
                  : 'Motor NBR 5410 ativo'}
              </div>
            </div>
          </div>
          {/* Ações de arquivo — agrupadas num só lugar, não espalhadas
              pela tela toda. lastSaved mostrado aqui, junto da ação que
              o gerou, não numa segunda barra em cima do conteúdo. */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="sb-config-btn" style={{ flex: 1 }} onClick={handleAbrir}>Abrir</button>
            <button className="sb-config-btn" style={{ flex: 1 }} onClick={() => doSave()}>Salvar</button>
          </div>
          <button className="sb-config-btn" style={{ marginTop: 6 }} onClick={handleNovo}>
            <span>+</span> Novo projeto
          </button>
          {lastSaved && (
            <div style={{ fontSize: 9.5, color: 'var(--sb-label)', marginTop: 6, textAlign: 'center', fontFamily: 'var(--mono)' }}>
              salvo às {lastSaved}
            </div>
          )}
        </div>
      </div>

      {/* ── Content — cada página traz seu próprio page-header; o Shell
          não empilha nenhuma barra em cima dele. ────────────────── */}
      <div className="content">
        {children}
      </div>
    </div>
  )
}
