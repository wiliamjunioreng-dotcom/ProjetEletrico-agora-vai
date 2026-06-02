// src/pages/PlantaBaixa.tsx — Motor gráfico Etapa 1
// Canvas SVG interativo: cômodos 2D + símbolos NBR 5444 + pan/zoom
// Separação: geometria (plantaStore) ←→ domínio elétrico (projectStore) por IDs

import { useState, useRef, useEffect, useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'
import { usePlantaStore } from '../store/plantaStore'
import { autoPlaceComo, snapToGrid } from '../core/autoplace'
import { snapInteligente, paredesdoComodo, analisarViolacoes } from '../core/constraints'
import { SIMBOLOS_NBR5444, PALETA_SIMBOLOS, COR_CIRCUITO } from '../core/nbr5444'
import { LAYERS, PRESETS } from '../core/layers'
import type { LayerId } from '../core/layers'
import { syncDomainToPlant } from '../core/sync'
import type { TipoPontoEletrico } from '../types/geometry'

// ── Constantes de renderização ────────────────────────────────────
const GRID_M = 0.25       // grid em metros (snap a 25cm)

// ── Utilitários de coordenada ──────────────────────────────────────
function toMetros(px: number, offset: number, escala: number): number {
  return (px - offset) / escala
}
function snapGrid(m: number): number {
  return Math.round(m / GRID_M) * GRID_M
}

// ── Símbolo NBR 5444 renderizado no canvas ─────────────────────────
function SimboloNoCanvas({
  tipo, x, y, escala, selecionado, circuito_tipo,
  onClick, onDoubleClick,
}: {
  tipo:          TipoPontoEletrico
  x:             number    // metros
  y:             number    // metros
  escala:        number
  selecionado:   boolean
  circuito_tipo?: string
  onClick:       (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}) {
  const sim = SIMBOLOS_NBR5444[tipo]
  if (!sim) return null

  const cx = x * escala
  const cy = y * escala
  const cor = circuito_tipo ? (COR_CIRCUITO[circuito_tipo] ?? 'currentColor') : 'currentColor'
  const scale = escala / 80  // normalizar ao tamanho padrão

  return (
    <g
      transform={`translate(${cx}, ${cy}) scale(${Math.max(0.5, scale)})`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ cursor: 'pointer' }}
      color={cor}
    >
      {/* Halo de seleção */}
      {selecionado && (
        <circle r="14" fill="rgba(20,100,200,0.15)" stroke="var(--blue)" strokeWidth="1.5" strokeDasharray="3 2" />
      )}
      {/* Símbolo */}
      <g dangerouslySetInnerHTML={{ __html: sim.path }} />
    </g>
  )
}

// ── Cômodo renderizado no canvas ───────────────────────────────────
function ComodoNoCanvas({
  comodo, escala, selecionado,
  onMouseDown, onCornerDrag,
}: {
  comodo:       any
  escala:       number
  selecionado:  boolean
  onMouseDown:  (e: React.MouseEvent) => void
  onCornerDrag: (corner: 'se', dx: number, dy: number) => void
}) {
  const x = comodo.x * escala
  const y = comodo.y * escala
  const w = comodo.largura_m * escala
  const h = comodo.altura_m  * escala

  return (
    <g onMouseDown={onMouseDown} style={{ cursor: 'move' }}>
      {/* Corpo */}
      <rect x={x} y={y} width={w} height={h}
        fill="var(--surface2)" fillOpacity={0.6}
        stroke={selecionado ? 'var(--blue)' : 'var(--border2)'}
        strokeWidth={selecionado ? 2 : 1.5}
      />
      {/* Nome */}
      <text
        x={x + w / 2} y={y + h / 2 - 6}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={Math.max(10, Math.min(14, w / 6))}
        fill="var(--text3)" fontFamily="var(--font)" fontWeight={500}
      >
        {comodo.nome}
      </text>
      <text
        x={x + w / 2} y={y + h / 2 + 8}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={Math.max(8, Math.min(11, w / 8))}
        fill="var(--text4)" fontFamily="monospace"
      >
        {comodo.largura_m.toFixed(1)}×{comodo.altura_m.toFixed(1)}m
      </text>
      {/* Handle de resize (canto SE) */}
      {selecionado && (
        <rect
          x={x + w - 6} y={y + h - 6} width={10} height={10} rx={2}
          fill="var(--blue)" style={{ cursor: 'se-resize' }}
          onMouseDown={e => {
            e.stopPropagation()
            const startX = e.clientX, startY = e.clientY
            const onMove = (ev: MouseEvent) => onCornerDrag('se', (ev.clientX - startX) / escala, (ev.clientY - startY) / escala)
            const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        />
      )}
    </g>
  )
}

// ── Painel lateral de ferramentas ──────────────────────────────────
function PainelFerramentas({
  ferramenta, tipoAtivo, onFerramenta, onTipo,
}: {
  ferramenta: string
  tipoAtivo:  TipoPontoEletrico | null
  onFerramenta: (f: any) => void
  onTipo:       (t: TipoPontoEletrico) => void
}) {
  const TOOLS = [
    { id: 'selecionar',        icon: '↖', label: 'Selecionar (S)' },
    { id: 'adicionar_comodo',  icon: '⬜', label: 'Cômodo (C)' },
    { id: 'adicionar_ponto',   icon: '⊕', label: 'Ponto elétrico (P)' },
    { id: 'adicionar_eletroduto', icon: '—', label: 'Eletroduto (E)' },
    { id: 'mover',             icon: '✥', label: 'Mover (M)' },
  ] as const

  return (
    <div style={{
      width: 220, flexShrink: 0, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 5,
      display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden',
    }}>
      {/* Ferramentas */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <div className="flabel" style={{ marginBottom: 6 }}>Ferramentas</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3 }}>
          {TOOLS.map(t => (
            <button key={t.id}
              title={t.label}
              onClick={() => onFerramenta(t.id)}
              style={{
                height: 32, border: 'none', borderRadius: 4, fontSize: 14,
                background: ferramenta === t.id ? 'var(--blue)' : 'var(--surface2)',
                color: ferramenta === t.id ? '#fff' : 'var(--text3)',
                cursor: 'pointer',
              }}
            >{t.icon}</button>
          ))}
        </div>
      </div>

      {/* Paleta de símbolos NBR 5444 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        <div className="flabel" style={{ marginBottom: 6 }}>Símbolos NBR 5444</div>
        {PALETA_SIMBOLOS.map(grupo => (
          <div key={grupo.grupo} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {grupo.grupo}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {grupo.simbolos.map(tipo => {
                const sim = SIMBOLOS_NBR5444[tipo]
                const ativo = tipoAtivo === tipo
                return (
                  <button
                    key={tipo}
                    title={sim.nome}
                    onClick={() => { onFerramenta('adicionar_ponto'); onTipo(tipo) }}
                    style={{
                      width: 36, height: 36, padding: 2,
                      border: `1px solid ${ativo ? 'var(--blue)' : 'var(--border)'}`,
                      borderRadius: 4, background: ativo ? 'var(--blue-dim)' : 'var(--surface2)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg
                      viewBox="-12 -12 24 24" width="28" height="28"
                      color={ativo ? 'var(--blue)' : 'var(--text3)'}
                    >
                      <g dangerouslySetInnerHTML={{ __html: sim.path }} />
                    </svg>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — PlantaBaixa
// ════════════════════════════════════════════════════════════════
export function PlantaBaixa() {
  const { comodos, circuitos_raw, circuitos_calc } = useProjectStore()
  const {
    planta, ferramenta, tipo_ativo, selecionados,
    setFerramenta, setTipoAtivo, setSelecionados,
    addPonto, movePonto, removePonto, updatePonto,
    addComodoGeom, updateComodoGeom, resolverPontosParametricos,
    plano_de_fundo, setPlanoFundo, setOpacidadePlano,
    pan, zoom, resetViewport, fitToContent,
    gerarGeometriaDeComodos,
  } = usePlantaStore()

  const svgRef   = useRef<SVGSVGElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart]   = useState({ x: 0, y: 0 })
  const [isDraggingPonto, setIsDraggingPonto] = useState<string | null>(null)
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 })
  const [layers,   setLayers]   = useState<Record<string, boolean>>(Object.fromEntries(Object.keys(LAYERS).map(k => [k, true])))
  const [showLayers, setShowLayers] = useState(false)
  // ── VMs por circuito_id para tooltip e heatmap ──────────────
  const vm_por_circ = useMemo(() => {
    const m = new Map<string, any>()
    circuitos_calc.forEach((c: any) => {
      if (c.resultado) m.set(c.id, c)
    })
    return m
  }, [circuitos_calc])

  // ── Paleta de cores por circuito ──────────────────────────────
  const PALETA = ['#2563eb','#16a34a','#d97706','#9333ea','#0891b2',
                  '#e11d48','#65a30d','#7c3aed','#0284c7','#15803d']
  const cor_por_circ = useMemo(() => {
    const m = new Map<string, string>()
    circuitos_raw.filter(cr => cr.tipo !== 'RESERVA').forEach((cr, i) => {
      m.set(cr.id, PALETA[i % PALETA.length])
    })
    return m
  }, [circuitos_raw])

  // ── Destaque via circuito_foco_id (da página de Auditoria) ───────
  const circuito_foco_id = useProjectStore(s => s.circuito_foco_id)
  // ── Pontos agrupados por circuito para linhas de rota ────────
  const pontos_por_circ = useMemo(() => {
    const m = new Map<string, typeof planta.pontos[0][]>()
    for (const p of planta.pontos) {
      if (!p.circuito_id) continue
      const arr = m.get(p.circuito_id) ?? []
      arr.push(p)
      m.set(p.circuito_id, arr)
    }
    return m
  }, [planta.pontos])

  const ids_destacados = useMemo(() =>
    new Set<string>(planta.pontos.filter(p => p.circuito_id === circuito_foco_id).map(p => p.id)),
    [circuito_foco_id, planta.pontos]
  )
  const [showConstraints] = useState(true)  // sempre ativo

  const [novoComodoPreview, setNovoComodoPreview] = useState<{x:number;y:number} | null>(null)

  // Dimensionar SVG ao container
  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const e = entries[0]
      setSvgSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 's' || e.key === 'S') setFerramenta('selecionar')
      if (e.key === 'c' || e.key === 'C') setFerramenta('adicionar_comodo')
      if (e.key === 'p' || e.key === 'P') setFerramenta('adicionar_ponto')
      if (e.key === 'm' || e.key === 'M') setFerramenta('mover')
      if (e.key === 'Escape') { setFerramenta('selecionar'); setSelecionados([]) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecionados.length > 0) {
        selecionados.forEach(id => removePonto(id))
        setSelecionados([])
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selecionados])

  const { viewport } = planta
  const { offset_x, offset_y, escala } = viewport

  // Converter posição do mouse em coordenadas do canvas (metros)
  function mouseToMetros(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    return {
      x: snapGrid(toMetros(px, offset_x, escala)),
      y: snapGrid(toMetros(py, offset_y, escala)),
    }
  }

  // ── Handlers de mouse no canvas ──────────────────────────────────

  function onSVGMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return

    // Pan com botão do meio ou Alt+clique
    if (e.altKey) {
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
      return
    }

    const { x, y } = mouseToMetros(e)

    if (ferramenta === 'adicionar_comodo') {
      // Adicionar cômodo em posição clicada
      addComodoGeom({
        id:        crypto.randomUUID(),
        nome:      `Cômodo ${planta.comodos.length + 1}`,
        x, y,
        largura_m: 4.0,
        altura_m:  3.0,
      })
      return
    }

    if (ferramenta === 'adicionar_ponto' && tipo_ativo) {
      // Snap inteligente: para tipos que devem ficar em parede → snap à parede
      const comodo_ativo = planta.comodos.find(cg =>
        x >= cg.x && x <= cg.x + cg.largura_m &&
        y >= cg.y && y <= cg.y + cg.altura_m
      )
      const all_paredes_snap = planta.comodos.flatMap(paredesdoComodo)
      const p_snap = snapInteligente({ x_m: x, y_m: y }, tipo_ativo, all_paredes_snap)
      // Capturar posição paramétrica quando snappou em parede
      const pos_param = p_snap.modo === 'parede' && p_snap.parede_id != null && p_snap.pos_relativa != null
        ? { parede_id: p_snap.parede_id, pos_relativa: p_snap.pos_relativa, offset_perp: 0 }
        : undefined
      addPonto({
        tipo:           tipo_ativo,
        x:              p_snap.ponto.x_m,
        y:              p_snap.ponto.y_m,
        pos_parametrica: pos_param,
        rotacao_graus:  0,
        comodo_id:      comodo_ativo?.id,
      })
      return
    }

    // Clique no vazio → desselecionar
    setSelecionados([])
  }

  function onSVGMouseMove(e: React.MouseEvent) {
    if (isPanning) {
      pan(e.clientX - panStart.x, e.clientY - panStart.y)
      setPanStart({ x: e.clientX, y: e.clientY })
      return
    }

    if (isDraggingPonto) {
      const { x, y } = mouseToMetros(e)
      movePonto(isDraggingPonto, x, y)
    }

    // Preview de novo cômodo
    if (ferramenta === 'adicionar_comodo') {
      setNovoComodoPreview(mouseToMetros(e))
    } else {
      setNovoComodoPreview(null)
    }
  }

  function onSVGMouseUp(_e: React.MouseEvent) {
    setIsPanning(false)
    setIsDraggingPonto(null)
  }

  function onSVGWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    zoom(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
  }

  // ── KPIs ──────────────────────────────────────────────────────────
  const n_comodos  = planta.comodos.length
  const n_pontos   = planta.pontos.length
  const n_ilum     = planta.pontos.filter(p => p.tipo === 'LUMINARIA' || p.tipo === 'LUMINARIA_PAREDE').length
  const n_tomadas  = planta.pontos.filter(p => p.tipo.startsWith('TUG')).length

  // ── Render ────────────────────────────────────────────────────────
  // Computar violações de constraints para todos os pontos
  const violacoes_list = analisarViolacoes(
    planta.pontos,
    planta.comodos.flatMap(paredesdoComodo),
    planta.comodos
  )
  const violacoes_map = new Map(violacoes_list.map(v => [v.ponto_id, v.resultados[0]]))

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Planta Baixa Elétrica</div>
        <div className="page-sub">
          Motor gráfico Etapa 1 · Posicionamento manual · Símbolos NBR 5444 · Pan/zoom · Snap 25cm
        </div>
      </div>
      <div className="page-actions">
        {comodos.length > 0 && planta.comodos.length === 0 && (
          <button className="btn primary" onClick={() => gerarGeometriaDeComodos(comodos)}>
            ⊕ Gerar cômodos ({comodos.length})
          </button>
        )}
        {planta.comodos.length > 0 && (
          <button className="btn" title="Sincronizar: domínio elétrico → planta"
            onClick={() => {
              const result = syncDomainToPlant({
                circuitos: circuitos_raw,
                nos:       [],  // rede.nos quando disponível
                pontos:    planta.pontos,
                comodos:   planta.comodos,
              })
              result.remover.forEach(id => removePonto(id))
              result.atualizar.forEach(({ id, partial }) => updatePonto(id, partial))
              // criar não disponível diretamente — seria via addPonto no loop
            }}>
            ↻ Sincronizar
          </button>
        )}
        {planta.comodos.length > 0 && (
          <button className="btn" title="Sugerir pontos por NBR 5410 §9.5 (confirme depois)"
            onClick={() => {
              const jaTemPontos = planta.pontos.length > 0
              if (jaTemPontos && !confirm('Já existem pontos. Adicionar sugestões mesmo assim?')) return
              planta.comodos.forEach(cg => {
                autoPlaceComo(cg).forEach(s => {
                  addPonto({
                    tipo:          s.tipo,
                    x:             snapToGrid(s.x),
                    y:             snapToGrid(s.y),
                    rotacao_graus: 0,
                    comodo_id:     cg.id,
                    circuito_id:   undefined,
                  })
                })
              })
            }}>
            ⚡ Auto-posicionar NBR
          </button>
        )}
        <label className="btn" title="Importar planta como fundo (calibrável)" style={{ cursor: 'pointer' }}>
          📎 Importar planta
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = ev => {
                const data_url = ev.target?.result as string
                setPlanoFundo({
                  id: crypto.randomUUID(), tipo: 'imagem',
                  data_url, calibrado: false, escala_px_m: null,
                  offset_x_m: 0, offset_y_m: 0,
                  opacidade: 0.40, travado: false,
                })
              }
              reader.readAsDataURL(file)
            }} />
        </label>
        {plano_de_fundo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 9, color: 'var(--text4)' }}>Opac.</label>
            <input type="range" min={0} max={1} step={0.05}
              value={plano_de_fundo.opacidade}
              style={{ width: 60 }}
              onChange={e => setOpacidadePlano(parseFloat(e.target.value))} />
            <button className="btn ghost" style={{ fontSize: 9, height: 22 }}
              onClick={() => setPlanoFundo(null)}>✕</button>
          </div>
        )}
        <button className="btn" onClick={fitToContent} title="Fit to content (F)">⊞ Ajustar</button>
        <button className="btn" onClick={resetViewport} title="Reset zoom">1:1</button>
        <div style={{ position: 'relative' }}>
          <button className="btn" onClick={() => setShowLayers(!showLayers)}>☰ Camadas</button>
          {showLayers && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '8px 10px', minWidth: 200,
              boxShadow: 'var(--sh-md)', marginTop: 4,
            }}>
              <div style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>
                Camadas visíveis
              </div>
              {/* Presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {Object.entries(PRESETS).map(([nome, preset]) => (
                  <button key={nome} className="btn ghost" style={{ height: 22, fontSize: 9, padding: '0 6px' }}
                    onClick={() => setLayers({ ...preset })}>
                    {nome}
                  </button>
                ))}
              </div>
              {/* Layer toggles */}
              {Object.values(LAYERS).map(layer => (
                <label key={layer.id} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '3px 0', cursor: 'pointer', fontSize: 11,
                }}>
                  <input type="checkbox" checked={layers[layer.id as LayerId]}
                    onChange={e => setLayers(l => ({ ...l, [layer.id]: e.target.checked }))} />
                  <span style={{
                    width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                    background: layer.cor,
                  }} />
                  <span style={{ color: 'var(--text)' }}>{layer.nome}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)', padding: '0 4px' }}>
          {Math.round(escala)}px/m
        </span>
      </div>
    </div>

    {/* KPIs */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className="kpi info">
        <div className="kpi-lbl">Cômodos</div>
        <div className="kpi-val">{n_comodos}</div>
        <div className="kpi-unit">na planta</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Pontos elétricos</div>
        <div className="kpi-val">{n_pontos}</div>
        <div className="kpi-unit">posicionados</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Luminárias</div>
        <div className="kpi-val">{n_ilum}</div>
        <div className="kpi-unit">pontos de luz</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Tomadas</div>
        <div className="kpi-val">{n_tomadas}</div>
        <div className="kpi-unit">TUG na planta</div>
      </div>
      <div className="kpi" style={{ fontSize: 9 }}>
        <div className="kpi-lbl">Ferramenta ativa</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--mono)', lineHeight: 1, marginTop: 3 }}>
          {ferramenta === 'selecionar' ? 'SELECT'
           : ferramenta === 'adicionar_comodo' ? 'CÔMODO'
           : ferramenta === 'adicionar_ponto' ? (tipo_ativo ?? 'PONTO')
           : ferramenta === 'mover' ? 'MOVER' : ferramenta.toUpperCase()}
        </div>
        <div className="kpi-unit">S/C/P/M = atalhos</div>
      </div>
    </div>

    {/* Layout principal */}
    <div style={{ flex: 1, display: 'flex', gap: 8, padding: 8, overflow: 'hidden', minHeight: 0 }}>

      {/* Painel lateral */}
      <PainelFerramentas
        ferramenta={ferramenta}
        tipoAtivo={tipo_ativo}
        onFerramenta={setFerramenta}
        onTipo={setTipoAtivo}
      />

      {/* Canvas SVG */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <svg
          ref={svgRef}
          width={svgSize.w} height={svgSize.h}
          onMouseDown={onSVGMouseDown}
          onMouseMove={onSVGMouseMove}
          onMouseUp={onSVGMouseUp}
          onMouseLeave={onSVGMouseUp}
          onWheel={onSVGWheel}
          style={{
            cursor: isPanning ? 'grabbing'
              : ferramenta === 'adicionar_comodo' || ferramenta === 'adicionar_ponto' ? 'crosshair'
              : 'default',
            display: 'block',
          }}
        >
          {/* Grupo de conteúdo com offset do viewport */}
          <g transform={`translate(${offset_x}, ${offset_y})`}>

            {/* Plano de fundo (imagem/PDF calibrada) */}
            {plano_de_fundo?.data_url && (
              <image
                href={plano_de_fundo.data_url}
                x={(plano_de_fundo.offset_x_m ?? 0) * escala}
                y={(plano_de_fundo.offset_y_m ?? 0) * escala}
                opacity={plano_de_fundo.opacidade ?? 0.4}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            )}

            {/* Grid de fundo (25cm) */}
            <defs>
              <pattern id="grid25cm" width={escala * GRID_M} height={escala * GRID_M} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${escala * GRID_M} 0 L 0 0 0 ${escala * GRID_M}`}
                  fill="none" stroke="var(--border)" strokeWidth="0.5" opacity={0.5}
                />
              </pattern>
              <pattern id="grid1m" width={escala} height={escala} patternUnits="userSpaceOnUse">
                <rect width={escala} height={escala}
                  fill="url(#grid25cm)" stroke="var(--border2)" strokeWidth="0.8" opacity={0.3} />
              </pattern>
            </defs>
            <rect x={-offset_x} y={-offset_y} width={svgSize.w} height={svgSize.h}
              fill="url(#grid1m)" />

            {/* Cômodos */}
            {planta.comodos.map(c => (
              <ComodoNoCanvas
                key={c.id}
                comodo={c}
                escala={escala}
                selecionado={selecionados.includes(c.id)}
                onMouseDown={(ev) => {
                  if (ferramenta === 'selecionar') {
                    setSelecionados(selecionados.includes(c.id) ? selecionados.filter(id => id !== c.id) : [c.id])
                  }
                  // Arrastar cômodo
                  if (ferramenta === 'mover') {
                    const startX = ev.clientX, startY = ev.clientY
                    const origX = c.x, origY = c.y
                    const onMove = (ev: MouseEvent) => {
                      const dx = (ev.clientX - startX) / escala
                      const dy = (ev.clientY - startY) / escala
                      updateComodoGeom(c.id, {
                        x: snapGrid(origX + dx),
                        y: snapGrid(origY + dy),
                      })
                    }
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                      // Recalcular posições de pontos paramétricos após mover cômodo
                      const novas_paredes = planta.comodos.flatMap(paredesdoComodo)
                      resolverPontosParametricos(novas_paredes)
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }
                }}
                onCornerDrag={(_corner, dx, dy) => {
                  updateComodoGeom(c.id, {
                    largura_m: Math.max(1, snapGrid(c.largura_m + dx)),
                    altura_m:  Math.max(1, snapGrid(c.altura_m  + dy)),
                  })
                  // Recalcular posições de pontos paramétricos após resize
                  const novas_paredes = planta.comodos.flatMap(paredesdoComodo)
                  resolverPontosParametricos(novas_paredes)
                }}
              />
            ))}

            {/* Preview de novo cômodo */}
            {novoComodoPreview && ferramenta === 'adicionar_comodo' && (
              <rect
                x={novoComodoPreview.x * escala} y={novoComodoPreview.y * escala}
                width={4 * escala} height={3 * escala}
                fill="var(--blue-dim)" stroke="var(--blue)" strokeWidth={1.5} strokeDasharray="5 3"
                opacity={0.7} style={{ pointerEvents: 'none' }}
              />
            )}

            {/* ── Heatmap de densidade de circuitos por cômodo ── */}
            {planta.comodos.map(comodo => {
              // Contar circuitos distintos com pontos neste cômodo
              const circs_no_comodo = new Set(
                planta.pontos
                  .filter(p => p.comodo_id === comodo.id && p.circuito_id)
                  .map(p => p.circuito_id!)
              )
              const n = circs_no_comodo.size
              if (n === 0) return null
              // Ocupação: 1-2 circuitos=ok, 3-4=atenção, 5+=saturado
              const cor = n >= 5 ? '#ef4444' : n >= 3 ? '#f59e0b' : '#22c55e'
              const opa = n >= 5 ? 0.18 : n >= 3 ? 0.12 : 0.06
              const x = comodo.x * escala
              const y = comodo.y * escala
              const w = comodo.largura_m * escala
              const h = comodo.altura_m  * escala
              return (
                <g key={`hm-${comodo.id}`} style={{ pointerEvents:'none' }}>
                  <rect x={x} y={y} width={w} height={h}
                    fill={cor} fillOpacity={opa}
                    stroke={cor} strokeWidth={n >= 3 ? 2 : 1}
                    strokeOpacity={n >= 3 ? 0.5 : 0.2}
                    rx={2}
                  />
                  {n >= 3 && (
                    <text x={x+4} y={y+12} fontSize={9}
                      fill={cor} fontFamily="var(--mono)" fontWeight={700}
                      style={{ pointerEvents:'none' }}>
                      {n}✕
                    </text>
                  )}
                </g>
              )
            })}

            {/* ── Rotas dos circuitos ───────────────────────── */}
            {[...pontos_por_circ.entries()].map(([circ_id, pts]) => {
              if (pts.length < 2) return null
              const cor = cor_por_circ.get(circ_id) ?? '#94a3b8'
              const vm  = vm_por_circ.get(circ_id) as any
              const secao = vm?.resultado?.secao_mm2 ?? 2.5
              const espessura = secao >= 6 ? 2.5 : secao >= 4 ? 2.0 : secao >= 2.5 ? 1.5 : 1.0
              const em_foco   = circ_id === circuito_foco_id
              const pts_sorted = [...pts].sort((a, b) => {
                // Ordenar por posição relativa (aproximação do trajeto)
                const distA = Math.sqrt(a.x*a.x + a.y*a.y)
                const distB = Math.sqrt(b.x*b.x + b.y*b.y)
                return distA - distB
              })
              const points = pts_sorted.map(p => `${p.x * escala},${p.y * escala}`).join(' ')
              return (
                <polyline key={`rota-${circ_id}`}
                  points={points}
                  fill="none"
                  stroke={cor}
                  strokeWidth={em_foco ? espessura * 2.5 : espessura}
                  strokeOpacity={em_foco ? 0.85 : 0.3}
                  strokeDasharray={em_foco ? undefined : '4 3'}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ pointerEvents:'none' }}
                />
              )
            })}

            {/* Pontos elétricos */}
            {planta.pontos.map(p => {
              const circ = circuitos_raw.find(c => c.id === p.circuito_id)
              const violacao = violacoes_map.get(p.id)
              return (
                <g key={p.id}>
                  {/* Anel de violação — vermelho se constraint violada */}
                  {violacao && !violacao.valido && showConstraints && (
                    <circle
                      cx={p.x * escala} cy={p.y * escala}
                      r={14 * Math.max(0.5, escala / 80)}
                      fill="none"
                      stroke="var(--red)"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      opacity={0.7}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                {/* Hover técnico */}
                {(() => {
                  const vm_circ = p.circuito_id ? vm_por_circ.get(p.circuito_id) as any : null
                  if (!vm_circ?.resultado) return null
                  const r = vm_circ.resultado
                  const is_critico = r.comprimento_max_m != null && r.comprimento_max_m < (vm_circ.comprimento_m ?? 0)
                  return (
                    <title>
                      {`${vm_circ.numero ?? ''} ${vm_circ.descricao ?? ''}
`}
                      {`${r.secao_mm2 ?? '?'}mm² · ${r.in_disj ?? '?'}A curva ${r.curva ?? '?'}
`}
                      {`ΔU: ${r.du_pct?.toFixed(1) ?? '?'}%  Ib: ${r.ib?.toFixed(1) ?? '?'}A
`}
                      {is_critico ? `⛔ Proteção: limite ${r.comprimento_max_m?.toFixed(0)}m` : `✓ Proteção OK`}
                    </title>
                  )
                })()}
                <SimboloNoCanvas
                  tipo={p.tipo}
                  x={p.x} y={p.y}
                  escala={escala}
                  selecionado={selecionados.includes(p.id)}
                  circuito_tipo={circ?.tipo}
                  onClick={e => {
                    e.stopPropagation()
                    if (ferramenta === 'selecionar') {
                      setSelecionados(selecionados.includes(p.id)
                        ? selecionados.filter(id => id !== p.id)
                        : e.shiftKey ? [...selecionados, p.id] : [p.id]
                      )
                    }
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    if (confirm(`Remover ${SIMBOLOS_NBR5444[p.tipo]?.nome ?? p.tipo}?`)) {
                      removePonto(p.id)
                      setSelecionados(selecionados.filter(id => id !== p.id))
                    }
                  }}
                />
                </g>
              )
            })}

            {/* ── Overlay de circuito selecionado ──────────────── */}
            {circuito_foco_id && planta.pontos
              .filter(p => ids_destacados.has(p.id))
              .map(p => {
                const cx = p.x * escala
                const cy = p.y * escala
                const r  = 18 * Math.max(0.5, escala / 80)
                return (
                  <circle key={`hl-${p.id}`}
                    cx={cx} cy={cy} r={r}
                    fill="var(--blue)" opacity={0.25}
                    stroke="var(--blue)" strokeWidth={2} strokeDasharray="4 2"
                    style={{ pointerEvents:'none' }}
                  />
                )
              })
            }

            {/* Heatmap: TODO integrar quando circuitos calculados forem acessíveis */}

            {/* Preview de posição do cursor quando adicionando ponto */}
            {ferramenta === 'adicionar_ponto' && tipo_ativo && novoComodoPreview && (() => {
              const sim = SIMBOLOS_NBR5444[tipo_ativo]
              if (!sim) return null
              return (
                <g
                  transform={`translate(${novoComodoPreview.x * escala}, ${novoComodoPreview.y * escala}) scale(${Math.max(0.5, escala/80)})`}
                  color="var(--blue)" opacity={0.6} style={{ pointerEvents: 'none' }}
                >
                  <g dangerouslySetInnerHTML={{ __html: sim.path }} />
                </g>
              )
            })()}
          </g>
        </svg>

        {/* Instruções contextuais */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          display: 'flex', gap: 8, pointerEvents: 'none',
        }}>
          {selecionados.length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '4px 10px', fontSize: 10, color: 'var(--text3)',
            }}>
              {selecionados.length} selecionado(s) · Delete para remover · Esc para desselecionar
            </div>
          )}
          {ferramenta === 'adicionar_comodo' && (
            <div style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 4, padding: '4px 10px', fontSize: 10, color: 'var(--blue)' }}>
              Clique para adicionar cômodo 4×3m · Drag corner para redimensionar
            </div>
          )}
          {ferramenta === 'adicionar_ponto' && tipo_ativo && (
            <div style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 4, padding: '4px 10px', fontSize: 10, color: 'var(--blue)' }}>
              Clique para posicionar {SIMBOLOS_NBR5444[tipo_ativo]?.nome} · Double-click para remover
            </div>
          )}
        </div>

        {/* Régua de escala */}
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '3px 8px', fontSize: 9,
          color: 'var(--text4)', fontFamily: 'var(--mono)',
          pointerEvents: 'none',
        }}>
          <svg width={escala * 2 + 20} height={16} style={{ display: 'block' }}>
            <line x1="5" y1="8" x2={5 + escala * 2} y2="8" stroke="currentColor" strokeWidth="1.5" />
            <line x1="5" y1="4" x2="5" y2="12" stroke="currentColor" strokeWidth="1.5" />
            <line x1={5 + escala * 2} y1="4" x2={5 + escala * 2} y2="12" stroke="currentColor" strokeWidth="1.5" />
            <text x={5 + escala} y="16" textAnchor="middle" fontSize="8" fill="currentColor">2m</text>
          </svg>
        </div>
      </div>

      {/* Painel direito — inspetor de seleção */}
      {selecionados.length > 0 && (
        <div style={{
          width: 180, flexShrink: 0, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 5, padding: 10,
          display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto',
        }}>
          <div className="flabel">Inspetor</div>
          {selecionados.map(id => {
            const ponto = planta.pontos.find(p => p.id === id)
            if (!ponto) return null
            const sim = SIMBOLOS_NBR5444[ponto.tipo]
            return (
              <div key={id} style={{ background: 'var(--surface2)', padding: 8, borderRadius: 4, fontSize: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{sim?.nome ?? ponto.tipo}</div>
                <div className="fgroup">
                  <label className="flabel" style={{ fontSize: 8.5 }}>X (m)</label>
                  <input className="finput" type="number" value={ponto.x} step={0.25} style={{ height: 24, fontSize: 10 }}
                    onChange={e => updatePonto(id, { x: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="fgroup" style={{ marginTop: 4 }}>
                  <label className="flabel" style={{ fontSize: 8.5 }}>Y (m)</label>
                  <input className="finput" type="number" value={ponto.y} step={0.25} style={{ height: 24, fontSize: 10 }}
                    onChange={e => updatePonto(id, { y: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="fgroup" style={{ marginTop: 4 }}>
                  <label className="flabel" style={{ fontSize: 8.5 }}>Circuito</label>
                  <select className="fselect" style={{ height: 24, fontSize: 9 }}
                    value={ponto.circuito_id ?? ''}
                    onChange={e => updatePonto(id, { circuito_id: e.target.value || undefined })}>
                    <option value="">— nenhum —</option>
                    {circuitos_raw.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.tipo} · {c.descricao.slice(0, 20)}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn danger" style={{ marginTop: 6, height: 24, width: '100%', fontSize: 10 }}
                  onClick={() => { removePonto(id); setSelecionados(selecionados.filter(s => s !== id)) }}>
                  Remover
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  </>)
}
