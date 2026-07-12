// src/pages/LevantamentoIA.tsx
// ════════════════════════════════════════════════════════════════
// LEVANTAMENTO POR IA — análise de planta em imagem (PDF/foto/print)
//
// Fluxo (inspirado no padrão de levantamento assistido por IA):
//   0 · AUTOMÁTICO — IA identifica ambientes, nomes, áreas e PD
//   1 · ESCALA     — calibrar com 2 cliques sobre uma cota conhecida
//   2 · MEDIR      — demarcar perímetro real de cada ambiente
//   → importar tudo como Cômodos do projeto elétrico (§9.5.2)
//
// A IA faz o rascunho; o engenheiro faz a precisão.
// ════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'

// ── Tipos ──────────────────────────────────────────────────────
interface AmbienteIA {
  id:          string
  nome:        string
  area_ia_m2:  number          // estimativa da IA
  pe_direito:  number
  cx:          number          // posição relativa 0-1 na imagem
  cy:          number
  tipo:        string          // Social | Cozinha | Banho | ...
  // medição manual (sobrescreve a estimativa)
  perimetro_m?:   number
  lado_m?:        number
  area_medida_m2?: number
  vertices?:   { x: number; y: number }[]   // px da imagem
  confirmado:  boolean
}

type Modo = 'nenhum' | 'calibrar' | 'perimetro' | 'lado'

const TIPOS = ['Social','Cozinha','Banho','Lavanderia','Garagem','Externo'] as const

// ── Chamada de visão à API Anthropic ───────────────────────────
async function analisarPlantaIA(imgBase64: string, mediaType: string, apiKey: string): Promise<AmbienteIA[]> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imgBase64 } },
          { type: 'text', text:
`Você é um engenheiro analisando uma planta baixa arquitetônica brasileira.
Identifique TODOS os ambientes (cômodos) visíveis na planta.

Para cada ambiente, retorne:
- nome: o nome escrito na planta (ex: "SALA DE ESTAR", "SUÍTE 01"). Se não houver texto, deduza pela geometria/mobiliário (ex: "Banheiro" se tiver vaso/box)
- area_m2: a área em m² — se estiver escrita na planta (ex: "A=12,50 m²"), use o valor EXATO escrito; senão estime pela proporção
- pe_direito: se escrito na planta (ex: "PD=2,50"), use; senão 2.7
- cx, cy: posição do CENTRO do ambiente como fração da imagem (0 a 1, origem no canto superior esquerdo)
- tipo: classifique em: Social, Cozinha, Banho, Lavanderia, Garagem ou Externo

Responda APENAS com JSON válido, sem markdown, sem crases, neste formato:
{"ambientes":[{"nome":"...","area_m2":0,"pe_direito":2.7,"cx":0.5,"cy":0.5,"tipo":"Social"}]}` },
        ],
      }],
    }),
  })
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const texto = (data.content ?? []).map((b: any) => b.text ?? '').join('')
  const limpo = texto.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(limpo)
  return (parsed.ambientes ?? []).map((a: any, i: number) => ({
    id: crypto.randomUUID(),
    nome: String(a.nome ?? `Ambiente ${i + 1}`),
    area_ia_m2: Math.max(0, Number(a.area_m2) || 0),
    pe_direito: Math.max(2.2, Number(a.pe_direito) || 2.7),
    cx: Math.min(1, Math.max(0, Number(a.cx) || 0.5)),
    cy: Math.min(1, Math.max(0, Number(a.cy) || 0.5)),
    tipo: TIPOS.includes(a.tipo) ? a.tipo : 'Social',
    confirmado: true,
  }))
}

// ── Geometria ──────────────────────────────────────────────────
function shoelace(v: { x: number; y: number }[]): number {
  let a = 0
  for (let i = 0; i < v.length; i++) {
    const j = (i + 1) % v.length
    a += v[i].x * v[j].y - v[j].x * v[i].y
  }
  return Math.abs(a / 2)
}
function perimetroPoly(v: { x: number; y: number }[]): number {
  let p = 0
  for (let i = 0; i < v.length; i++) {
    const j = (i + 1) % v.length
    p += Math.hypot(v[j].x - v[i].x, v[j].y - v[i].y)
  }
  return p
}

// ════════════════════════════════════════════════════════════════
export default function LevantamentoIA() {
  const { addComodo, setPagina } = useProjectStore()

  const [img, setImg]             = useState<{ url: string; b64: string; mt: string; w: number; h: number } | null>(null)
  const [ambientes, setAmbientes] = useState<AmbienteIA[]>([])
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro]           = useState<string | null>(null)
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem('lumen_api_key') ?? '')
  const [modo, setModo]           = useState<Modo>('nenhum')
  const [selecionado, setSel]     = useState<string | null>(null)
  const [zoom, setZoom]           = useState(100)
  const [aba, setAba]             = useState<'planta' | 'tabela'>('planta')

  // calibração: 2 pontos + distância real → px por metro
  const [calibPts, setCalibPts]   = useState<{ x: number; y: number }[]>([])
  const [pxPorM, setPxPorM]       = useState<number | null>(null)

  // perímetro em construção
  const [polyPts, setPolyPts]     = useState<{ x: number; y: number }[]>([])
  // lado (retângulo) em construção — 2 pontos
  const [ladoPts, setLadoPts]     = useState<{ x: number; y: number }[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const imgRef   = useRef<HTMLImageElement>(null)

  // ── Upload ────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setErro(null)
    if (!/image\/(png|jpe?g|webp)/.test(file.type)) {
      setErro('Envie a planta como imagem (PNG/JPG). Para PDF: abra o PDF, dê zoom na planta e tire um print.')
      return
    }
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })
    const url = URL.createObjectURL(file)
    const dim = await new Promise<{ w: number; h: number }>(res => {
      const i = new Image()
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight })
      i.src = url
    })
    setImg({ url, b64, mt: file.type, ...dim })
    setAmbientes([]); setCalibPts([]); setPxPorM(null); setPolyPts([])
  }, [])

  // ── Etapa 0: análise IA ───────────────────────────────────────
  async function analisar() {
    if (!img) return
    if (!apiKey) { setErro('Informe sua chave da API Anthropic (console.anthropic.com → API Keys). Fica salva só neste computador.'); return }
    localStorage.setItem('lumen_api_key', apiKey)
    setAnalisando(true); setErro(null)
    try {
      const found = await analisarPlantaIA(img.b64, img.mt, apiKey)
      setAmbientes(found)
      if (!found.length) setErro('Nenhum ambiente identificado — tente uma imagem com mais resolução ou zoom na área da planta.')
    } catch (e) {
      setErro('Falha na análise: ' + String(e).slice(0, 200))
    } finally { setAnalisando(false) }
  }

  // ── Clique na imagem (calibração / perímetro) ────────────────
  function cliqueImagem(e: React.MouseEvent) {
    if (!imgRef.current || modo === 'nenhum') return
    const rect = imgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width  * (img?.w ?? 1)
    const y = (e.clientY - rect.top)  / rect.height * (img?.h ?? 1)

    if (modo === 'calibrar') {
      const pts = [...calibPts, { x, y }]
      setCalibPts(pts)
      if (pts.length === 2) {
        const distPx = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        const real = parseFloat(prompt('Distância real entre os 2 pontos (em metros):', '3.00') ?? '')
        if (real > 0) {
          setPxPorM(distPx / real)
          setModo('nenhum')
        } else { setCalibPts([]) }
      }
    }
    if (modo === 'perimetro' && selecionado) {
      setPolyPts(prev => [...prev, { x, y }])
    }

    if (modo === 'lado' && selecionado && pxPorM) {
      const pts = [...ladoPts, { x, y }]
      setLadoPts(pts)
      if (pts.length === 2) {
        // "Puxar o perímetro por um dos lados": para ambiente ~retangular,
        // mede-se UM lado L; com a área A conhecida (da IA ou já medida),
        // o outro lado é A/L → perímetro = 2·(L + A/L).
        const L = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / pxPorM
        const amb = ambientes.find(a => a.id === selecionado)
        const A = amb?.area_medida_m2 ?? amb?.area_ia_m2 ?? 0
        if (L > 0.1 && A > 0.1) {
          const outro = A / L
          const per = 2 * (L + outro)
          setAmbientes(prev => prev.map(a => a.id === selecionado
            ? { ...a, perimetro_m: Math.round(per * 100) / 100, lado_m: Math.round(L * 100) / 100 }
            : a))
        }
        setLadoPts([]); setModo('nenhum')
      }
    }
  }

  // fechar perímetro (duplo clique)
  function fecharPerimetro() {
    if (polyPts.length < 3 || !pxPorM || !selecionado) return
    const per_m  = perimetroPoly(polyPts) / pxPorM
    const area_m = shoelace(polyPts) / (pxPorM * pxPorM)
    setAmbientes(prev => prev.map(a => a.id === selecionado
      ? { ...a, perimetro_m: Math.round(per_m * 100) / 100,
          area_medida_m2: Math.round(area_m * 100) / 100, vertices: polyPts }
      : a))
    setPolyPts([]); setModo('nenhum')
  }

  // ── Importar para o projeto elétrico ─────────────────────────
  function importar() {
    const confirmados = ambientes.filter(a => a.confirmado)
    for (const a of confirmados) {
      const area  = a.area_medida_m2 ?? a.area_ia_m2
      // Perímetro: medido, ou estimado como quadrado equivalente ×1.05
      const perim = a.perimetro_m ?? Math.round(4 * Math.sqrt(Math.max(area, 1)) * 1.05 * 10) / 10
      addComodo({
        nome: a.nome, tipo: a.tipo as any, area_m2: area, perimetro_m: perim,
        pe_direito_m: a.pe_direito, cargas_manuais: [], tues: [],
      } as any)
    }
    setPagina('comodos')
  }

  const n_medidos = ambientes.filter(a => a.area_medida_m2 != null).length
  const area_total = useMemo(() =>
    ambientes.filter(a => a.confirmado)
      .reduce((s, a) => s + (a.area_medida_m2 ?? a.area_ia_m2), 0),
    [ambientes])

  const upd = (id: string, patch: Partial<AmbienteIA>) =>
    setAmbientes(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))

  // ── Estilos base (dark técnico, accent do app) ───────────────
  const S = {
    stepHdr: { fontSize: 10, fontWeight: 700 as const, letterSpacing: '.08em',
      color: 'var(--text4)', textTransform: 'uppercase' as const, margin: '14px 0 6px' },
    btn: { width: '100%', textAlign: 'left' as const, padding: '7px 10px', fontSize: 12,
      borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>

      {/* ── Área da planta ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Barra superior */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Levantamento <span style={{ color: 'var(--blue)' }}>por IA</span></span>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {(['planta','tabela'] as const).map(t => (
              <button key={t} onClick={() => setAba(t)}
                style={{ padding: '4px 14px', fontSize: 11, border: 'none', cursor: 'pointer',
                  background: aba === t ? 'var(--blue)' : 'transparent',
                  color: aba === t ? 'white' : 'var(--text3)', fontWeight: 600 }}>
                {t === 'planta' ? 'Planta' : 'Tabela'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {img && aba === 'planta' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="btn" style={{ padding: '2px 10px' }} onClick={() => setZoom(z => Math.max(25, z - 25))}>−</button>
              <span style={{ fontSize: 11, width: 44, textAlign: 'center' }}>{zoom}%</span>
              <button className="btn" style={{ padding: '2px 10px' }} onClick={() => setZoom(z => Math.min(400, z + 25))}>+</button>
            </div>
          )}
          {ambientes.length > 0 && (
            <button className="btn primary" style={{ fontWeight: 700 }} onClick={importar}>
              → Importar {ambientes.filter(a => a.confirmado).length} cômodo(s)
            </button>
          )}
        </div>

        {/* ── KPIs do levantamento (estilo painel de obra) ─────── */}
        {ambientes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1,
            background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
            {[
              { lbl: 'Área construída', val: `${area_total.toFixed(1)} m²`, cor: 'var(--blue)' },
              { lbl: 'Ambientes', val: `${ambientes.filter(a => a.confirmado).length}/${ambientes.length}`, cor: 'var(--text)' },
              { lbl: 'Escala', val: pxPorM ? 'definida ✓' : 'pendente', cor: pxPorM ? 'var(--green)' : 'var(--amber)' },
              { lbl: 'Medidos', val: `${Math.round(n_medidos / Math.max(ambientes.length, 1) * 100)}%`, cor: n_medidos === ambientes.length ? 'var(--green)' : 'var(--text2)' },
            ].map(k => (
              <div key={k.lbl} style={{ background: 'var(--surface)', padding: '8px 14px' }}>
                <div style={{ fontSize: 9.5, color: 'var(--text4)', textTransform: 'uppercase',
                  letterSpacing: '.06em', fontWeight: 700 }}>{k.lbl}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: k.cor }}>{k.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Conteúdo */}
        {!img ? (
          <div onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 12, cursor: 'pointer', margin: 20,
              border: '2px dashed var(--border)', borderRadius: 14, background: 'var(--surface2)' }}>
            <div style={{ fontSize: 40 }}>🗺️</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Arraste a planta aqui (PNG/JPG)</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 380, textAlign: 'center' }}>
              A IA identifica os ambientes, você calibra a escala e confirma —
              tudo vira cômodos do projeto elétrico automaticamente
            </div>
            <button className="btn primary">Selecionar imagem</button>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        ) : aba === 'planta' ? (
          <div style={{ flex: 1, overflow: 'auto', background: '#2a2d33', position: 'relative' }}>
            <div style={{ position: 'relative', width: `${zoom}%`, minWidth: 300 }}>
              <img ref={imgRef} src={img.url} alt="planta"
                onClick={cliqueImagem}
                onDoubleClick={modo === 'perimetro' ? fecharPerimetro : undefined}
                style={{ width: '100%', display: 'block',
                  cursor: modo !== 'nenhum' ? 'crosshair' : 'default' }} />

              {/* Overlay SVG */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                pointerEvents: 'none' }} viewBox={`0 0 ${img.w} ${img.h}`} preserveAspectRatio="none">
                {/* pontos de calibração */}
                {calibPts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={img.w * 0.006}
                    fill="var(--amber)" stroke="white" strokeWidth={img.w * 0.0015} />
                ))}
                {calibPts.length === 2 && (
                  <line x1={calibPts[0].x} y1={calibPts[0].y} x2={calibPts[1].x} y2={calibPts[1].y}
                    stroke="var(--amber)" strokeWidth={img.w * 0.002} strokeDasharray="8 5" />
                )}
                {/* polígono em construção */}
                {polyPts.length > 0 && (
                  <polygon points={polyPts.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(20,100,200,.18)" stroke="var(--blue)" strokeWidth={img.w * 0.002} />
                )}
                {polyPts.map((p, i) => (
                  <circle key={`v${i}`} cx={p.x} cy={p.y} r={img.w * 0.005}
                    fill="var(--blue)" stroke="white" strokeWidth={img.w * 0.001} />
                ))}
                {/* lado (retâng.) em construção */}
                {ladoPts.map((p, i) => (
                  <circle key={`l${i}`} cx={p.x} cy={p.y} r={img.w * 0.006}
                    fill="var(--green)" stroke="white" strokeWidth={img.w * 0.0015} />
                ))}
                {/* polígonos já medidos */}
                {ambientes.filter(a => a.vertices).map(a => (
                  <polygon key={a.id} points={a.vertices!.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={a.id === selecionado ? 'rgba(13,122,71,.25)' : 'rgba(13,122,71,.12)'}
                    stroke="var(--green)" strokeWidth={img.w * 0.0015} />
                ))}
              </svg>

              {/* Pins dos ambientes */}
              {ambientes.map(a => (
                <button key={a.id}
                  onClick={() => setSel(a.id)}
                  title={`${a.nome} — ${(a.area_medida_m2 ?? a.area_ia_m2).toFixed(1)}m²`}
                  style={{
                    position: 'absolute', left: `${a.cx * 100}%`, top: `${a.cy * 100}%`,
                    transform: 'translate(-50%,-100%)', cursor: 'pointer',
                    background: a.id === selecionado ? 'var(--blue)' : 'rgba(15,20,30,.85)',
                    color: 'white', border: `1.5px solid ${a.area_medida_m2 != null ? 'var(--green)' : 'var(--blue)'}`,
                    borderRadius: 7, padding: '3px 8px', fontSize: 10, fontWeight: 600,
                    whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,.4)',
                  }}>
                  {a.area_medida_m2 != null ? '✓ ' : ''}{a.nome}
                  <span style={{ opacity: .75, marginLeft: 5 }}>{(a.area_medida_m2 ?? a.area_ia_m2).toFixed(1)}m²</span>
                </button>
              ))}
            </div>

            {/* Dica de modo ativo */}
            {modo !== 'nenhum' && (
              <div style={{ position: 'sticky', bottom: 12, margin: '0 auto', width: 'fit-content',
                background: 'var(--blue)', color: 'white', padding: '6px 16px', borderRadius: 20,
                fontSize: 12, fontWeight: 600, boxShadow: '0 3px 10px rgba(0,0,0,.35)' }}>
                {modo === 'calibrar'
                  ? `Clique em 2 pontos de uma cota conhecida (${calibPts.length}/2)`
                  : `Clique nos vértices do ambiente · duplo clique fecha (${polyPts.length} ponto(s))`}
              </div>
            )}
          </div>
        ) : (
          /* ── Tabela consolidada ── */
          <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text4)', fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <th style={{ padding: 6 }}>✓</th><th>Ambiente</th><th>Tipo</th>
                  <th>Área IA</th><th>Área medida</th><th>Perímetro</th><th>PD</th>
                </tr>
              </thead>
              <tbody>
                {ambientes.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border)',
                    opacity: a.confirmado ? 1 : .45 }}>
                    <td style={{ padding: 6 }}>
                      <input type="checkbox" checked={a.confirmado}
                        onChange={e => upd(a.id, { confirmado: e.target.checked })} />
                    </td>
                    <td><input className="finput" style={{ fontSize: 12, width: 170 }}
                      value={a.nome} onChange={e => upd(a.id, { nome: e.target.value })} /></td>
                    <td><select className="fselect" style={{ fontSize: 11 }} value={a.tipo}
                      onChange={e => upd(a.id, { tipo: e.target.value })}>
                      {TIPOS.map(t => <option key={t}>{t}</option>)}</select></td>
                    <td style={{ color: 'var(--text3)' }}>{a.area_ia_m2.toFixed(1)} m²</td>
                    <td style={{ color: a.area_medida_m2 != null ? 'var(--green)' : 'var(--text4)', fontWeight: 600 }}>
                      {a.area_medida_m2 != null ? `${a.area_medida_m2.toFixed(1)} m²` : '—'}</td>
                    <td>{a.perimetro_m != null ? `${a.perimetro_m.toFixed(1)} m` : '—'}</td>
                    <td><input className="finput" type="number" step={0.1} min={2.2}
                      style={{ fontSize: 12, width: 58 }} value={a.pe_direito}
                      onChange={e => upd(a.id, { pe_direito: Math.max(2.2, parseFloat(e.target.value) || 2.7) })} /></td>
                  </tr>
                ))}
              </tbody>
              {ambientes.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--blue)', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: 8 }}>TOTAL — {ambientes.filter(a => a.confirmado).length} ambiente(s)</td>
                    <td colSpan={4} style={{ color: 'var(--blue)' }}>{area_total.toFixed(1)} m² construídos</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ── Sidebar de etapas ─────────────────────────────────── */}
      <div style={{ width: 268, borderLeft: '1px solid var(--border)', padding: '10px 14px',
        overflow: 'auto', flexShrink: 0 }}>

        <div style={S.stepHdr}>0 · Automático</div>
        <input className="finput" type="password" placeholder="Chave API Anthropic (sk-ant-...)"
          value={apiKey} onChange={e => setApiKey(e.target.value)}
          style={{ fontSize: 11, marginBottom: 6 }} />
        <button style={{ ...S.btn, background: 'var(--blue)', color: 'white',
          justifyContent: 'center', fontWeight: 700, opacity: !img || analisando ? .5 : 1 }}
          disabled={!img || analisando} onClick={analisar}>
          {analisando ? '⏳ Analisando…' : '✨ Analisar planta'}
        </button>
        {ambientes.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>
            ✓ {ambientes.length} ambiente(s) · ≈ {area_total.toFixed(1)} m².
            Confira os pins, ajuste nomes e desmarque o que não for ambiente.
          </div>
        )}

        <div style={S.stepHdr}>1 · Escala (calibrar)</div>
        <button style={S.btn} disabled={!img}
          onClick={() => { setModo('calibrar'); setCalibPts([]) }}>
          📏 Calibrar escala
        </button>
        <div style={{ fontSize: 10.5, color: pxPorM ? 'var(--green)' : 'var(--amber)', marginTop: 5 }}>
          {pxPorM
            ? `✓ Escala definida — ${pxPorM.toFixed(1)} px/m`
            : 'Escala não definida — calibre sobre uma cota conhecida da planta'}
        </div>

        <div style={S.stepHdr}>2 · Medir</div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 6 }}>
          Selecione um ambiente (pin ou lista) e demarque o perímetro real.
          Sobrescreve a estimativa da IA.
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...S.btn, flex: 1, opacity: !pxPorM || !selecionado ? .45 : 1,
            ...(modo === 'lado' ? { borderColor: 'var(--blue)', background: 'var(--surface3)' } : {}) }}
            disabled={!pxPorM || !selecionado}
            title="Ambiente ~retangular: meça UM lado com 2 cliques — o perímetro é deduzido pela área"
            onClick={() => { setModo('lado'); setLadoPts([]) }}>
            📏 Lado (retâng.)
          </button>
          <button style={{ ...S.btn, flex: 1, opacity: !pxPorM || !selecionado ? .45 : 1,
            ...(modo === 'perimetro' ? { borderColor: 'var(--blue)', background: 'var(--surface3)' } : {}) }}
            disabled={!pxPorM || !selecionado}
            title="Clique em cada vértice do ambiente; duplo clique fecha — mede área E perímetro reais"
            onClick={() => { setModo('perimetro'); setPolyPts([]) }}>
            ⬡ Perímetro
          </button>
        </div>
        {ambientes.length > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 5 }}>
            {n_medidos}/{ambientes.length} medido(s)
          </div>
        )}

        {/* Lista de ambientes */}
        {ambientes.length > 0 && <>
          <div style={S.stepHdr}>Ambientes ({ambientes.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ambientes.map(a => (
              <button key={a.id} onClick={() => setSel(a.id)}
                style={{ ...S.btn, padding: '5px 9px',
                  borderColor: a.id === selecionado ? 'var(--blue)' : 'var(--border)',
                  background: a.id === selecionado ? 'var(--blue-dim)' : 'var(--surface2)' }}>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
                <span style={{ fontSize: 10, color: a.area_medida_m2 != null ? 'var(--green)' : 'var(--text4)' }}>
                  {(a.area_medida_m2 ?? a.area_ia_m2).toFixed(1)}m²{a.area_medida_m2 != null ? ' ✓' : ''}
                </span>
              </button>
            ))}
          </div>
        </>}

        {erro && (
          <div style={{ marginTop: 12, padding: 9, borderRadius: 8, fontSize: 11,
            background: 'var(--red-dim, #fde8e8)', color: 'var(--red, #c0392b)' }}>
            {erro}
          </div>
        )}
      </div>
    </div>
  )
}
