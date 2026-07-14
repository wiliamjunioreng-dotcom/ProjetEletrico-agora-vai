// src/pages/Unifilar.tsx — Diagrama Unifilar com layout técnico real
// Barra horizontal · Derivações para baixo · QD identificado · Exporta SVG

import { useRef } from 'react'
import { useProjectStore } from '../store/projectStore'

// Cores por tipo de circuito (fiel ao padrão gráfico de projetos elétricos)
const COR: Record<string, string> = {
  ILUM: '#157a4a',  // var(--green) — mesma cor semântica do resto do app
  TUG:  '#2563eb',  // var(--blue)
  TUE:  '#c2660a',  // var(--amber)
  GERAL:'#6d28d9',  // var(--purple)
}

// ─── Símbolo IEC: disjuntor ─────────────────────────────────────
function SimDisjuntor({ x, y, cor, label, idr }: {
  x: number; y: number; cor: string; label: string; idr: boolean
}) {
  return (
    <g>
      {/* Corpo do disjuntor */}
      <rect x={x - 10} y={y} width={20} height={24} rx={3}
        fill={cor} fillOpacity={.12} stroke={cor} strokeWidth={1.2} />
      {/* Alavanca */}
      <line x1={x} y1={y + 4} x2={x} y2={y + 12}
        stroke={cor} strokeWidth={2} strokeLinecap="round" />
      {/* Corrente nominal */}
      <text x={x} y={y + 34} textAnchor="middle" fontSize={7.5}
        fill={cor} fontFamily="monospace" fontWeight={600}>{label}</text>
      {/* Badge IDR */}
      {idr && (
        <g>
          <rect x={x - 9} y={y + 37} width={18} height={9} rx={2}
            fill="#fdf0ee" stroke="#c0392b" strokeWidth={0.8} />
          <text x={x} y={y + 44} textAnchor="middle" fontSize={6}
            fill="#c0392b" fontFamily="monospace" fontWeight={700}>IDR</text>
        </g>
      )}
    </g>
  )
}

// ─── Símbolo: carga (retângulo com tipo) ────────────────────────
function SimCarga({ x, y, tipo, potencia_va, potencia_real_w }: {
  x: number; y: number; tipo: string
  potencia_va: number; potencia_real_w?: number
}) {
  const cor    = COR[tipo] || '#9590a8'
  const kva    = (potencia_va / 1000).toFixed(2)
  const hasReal = potencia_real_w && potencia_real_w > 0 && Math.abs(potencia_real_w - potencia_va) > 10

  return (
    <g>
      <rect x={x - 28} y={y} width={56} height={hasReal ? 28 : 22} rx={3}
        fill={cor} fillOpacity={.10} stroke={cor} strokeWidth={1} />
      <text x={x} y={y + 9} textAnchor="middle" fontSize={7}
        fill={cor} fontFamily="monospace" fontWeight={600}>{tipo}</text>
      <text x={x} y={y + 18} textAnchor="middle" fontSize={6.5}
        fill="var(--text3)" fontFamily="monospace">{kva}kVA</text>
      {hasReal && (
        <text x={x} y={y + 26} textAnchor="middle" fontSize={6}
          fill="#157a4a" fontFamily="monospace">{potencia_real_w}W real</text>
      )}
    </g>
  )
}

export function Unifilar() {
  const { circuitos_calc, circuitos_raw, projeto, demanda } = useProjectStore()
  const svgRef = useRef<SVGSVGElement>(null)

  const ci  = circuitos_calc.filter(c => c.potencia_va > 0)
  const raw = circuitos_raw.filter((_, i) => (circuitos_calc[i]?.potencia_va ?? 0) > 0)

  // ── Layout ───────────────────────────────────────────────────────
  // Barra horizontal no centro vertical do QD
  // Cada circuito = derivação para baixo a partir da barra
  // Espaçamento horizontal uniforme

  const MARGIN_LEFT  = 60    // espaço para ramal de entrada
  const BARRA_Y      = 160   // Y da barra de distribuição
  const BARRA_H      = 6     // espessura da barra
  const CIRC_STEP    = 68    // espaçamento horizontal entre circuitos
  const VERT_LEN     = 90    // comprimento do condutor vertical (barra → disjuntor)
  const DISJ_H       = 46    // altura do símbolo do disjuntor
  const CARGA_Y      = BARRA_Y + VERT_LEN + DISJ_H + 10  // Y da carga
  const SVG_H        = CARGA_Y + 70  // altura total

  const N            = Math.max(ci.length, 1)
  const BARRA_X0     = MARGIN_LEFT
  const BARRA_X1     = MARGIN_LEFT + N * CIRC_STEP + 20
  const SVG_W        = BARRA_X1 + 40

  // Descrição de cada fase por cor
  const FASE_COR: Record<string, string> = {
    R: '#2563eb', S: '#157a4a', T: '#c2660a', RS: '#6d28d9', ST: '#6d28d9', RT: '#6d28d9', RST: '#b8901f',
  }

  function handleExportar() {
    if (!svgRef.current) return
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    // Embutir estilos básicos
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = 'text { font-family: "Courier New", monospace; }'
    clone.insertBefore(style, clone.firstChild)
    const svg = new XMLSerializer().serializeToString(clone)
    const a   = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    a.download = `Unifilar_${(projeto.nome || 'projeto').replace(/\s+/g, '_')}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Diagrama Unifilar</div>
        <div className="page-sub">
          Gerado automaticamente · {ci.length} circuitos · layout técnico IEC · exporta SVG para prancha
        </div>
      </div>
      <div className="page-actions">
        <button className="btn" onClick={handleExportar} disabled={ci.length === 0}>
          Exportar SVG
        </button>
      </div>
    </div>

    <div className="page-scroll">
    <div style={{ padding: '16px 22px' }}>

      {ci.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text4)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum circuito dimensionado</div>
          <div style={{ fontSize: 12 }}>Gere os circuitos nos passos 2 e 3 para ver o diagrama unifilar.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header" style={{ background: '#1a1a28', color: '#e2e8f0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                QD — {projeto.nome || 'Quadro de Distribuição'}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                {(projeto as any).concessionaria} · {(projeto as any).sistema} {(projeto as any).v_fase}/{(projeto as any).v_linha}V · Método {(projeto as any).metodo_instalacao}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
              {[
                { cor: COR.ILUM, label: 'ILUM' },
                { cor: COR.TUG,  label: 'TUG'  },
                { cor: COR.TUE,  label: 'TUE'  },
              ].map(({ cor, label }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: cor, display: 'inline-block' }} />
                  <span style={{ color: '#94a3b8' }}>{label}</span>
                </span>
              ))}
              <span style={{ color: '#94a3b8', marginLeft: 4 }}>
                ● OK · △ Limite · ✗ Erro
              </span>
            </div>
          </div>

          <div style={{ overflow: 'auto', background: '#f8fafc' }}>
            <svg
              ref={svgRef}
              width={Math.max(SVG_W, 600)}
              height={SVG_H}
              viewBox={`0 0 ${Math.max(SVG_W, 600)} ${SVG_H}`}
              style={{ display: 'block', fontFamily: 'monospace' }}
            >
              {/* Sombra suave para dar profundidade aos símbolos — a
                  diferença entre "desenho técnico plano" e peça acabada */}
              <defs>
                <filter id="unifilarShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1a1a28" floodOpacity="0.14" />
                </filter>
              </defs>

              {/* Grade de fundo — tom quente, alinhado à paleta do app */}
              {Array.from({ length: Math.ceil(SVG_H / 20) }, (_, i) => (
                <line key={i} x1={0} y1={i * 20} x2={Math.max(SVG_W, 600)} y2={i * 20}
                  stroke="#e8e3d8" strokeWidth={0.4} />
              ))}

              <g filter="url(#unifilarShadow)">

              {/* ── Ramal de entrada (concessionária → DG) ── */}
              {/* Texto concessionária */}
              <text x={MARGIN_LEFT / 2} y={24} textAnchor="middle" fontSize={9}
                fill="#5a5670" fontFamily="monospace" fontWeight={600}>
                {(projeto as any).concessionaria || 'CEMIG'}
              </text>
              <text x={MARGIN_LEFT / 2} y={36} textAnchor="middle" fontSize={7.5}
                fill="#9590a8" fontFamily="monospace">
                {(projeto as any).v_fase}/{(projeto as any).v_linha}V
              </text>

              {/* Condutor ramal */}
              <line x1={MARGIN_LEFT / 2} y1={38} x2={MARGIN_LEFT / 2} y2={BARRA_Y - 80}
                stroke="#2e2d3d" strokeWidth={2.5} />

              {/* Medidor (retângulo com "kWh") */}
              <rect x={MARGIN_LEFT / 2 - 14} y={BARRA_Y - 80} width={28} height={20} rx={3}
                fill="#fff" stroke="#5a5670" strokeWidth={1} />
              <text x={MARGIN_LEFT / 2} y={BARRA_Y - 67} textAnchor="middle" fontSize={7}
                fill="#5a5670" fontFamily="monospace" fontWeight={600}>kWh</text>

              {/* Condutor do medidor ao DG */}
              <line x1={MARGIN_LEFT / 2} y1={BARRA_Y - 60} x2={MARGIN_LEFT / 2} y2={BARRA_Y - 46}
                stroke="#2e2d3d" strokeWidth={2.5} />

              {/* Disjuntor Geral */}
              <SimDisjuntor
                x={MARGIN_LEFT / 2} y={BARRA_Y - 46}
                cor="#1a1a28"
                label={demanda ? `${demanda.in_geral}A` : 'DG'}
                idr={false}
              />

              {/* Condutor DG → Barra */}
              <line x1={MARGIN_LEFT / 2} y1={BARRA_Y - 46 + 24} x2={MARGIN_LEFT / 2} y2={BARRA_Y}
                stroke="#2e2d3d" strokeWidth={2.5} />

              {/* Seção do ramal */}
              {demanda && (
                <text x={MARGIN_LEFT / 2 + 8} y={BARRA_Y - 20} fontSize={7.5}
                  fill="#9590a8" fontFamily="monospace">
                  {demanda.ramal_min_mm2}mm²
                </text>
              )}

              {/* ── Barra de distribuição ── */}
              <rect x={BARRA_X0 - 4} y={BARRA_Y - BARRA_H / 2}
                width={BARRA_X1 - BARRA_X0 + 8} height={BARRA_H}
                rx={2} fill="#1a1a28" />

              {/* Label da barra */}
              <text x={BARRA_X1 + 12} y={BARRA_Y + 2} textAnchor="start" fontSize={8}
                fill="#5a5670" fontFamily="monospace" fontWeight={600}>
                BARRA — {demanda?.n_total_qd || N}DIN
              </text>

              {/* ── Circuitos ── */}
              {ci.map((c, i) => {
                const r    = raw[i]
                const x    = BARRA_X0 + i * CIRC_STEP + CIRC_STEP / 2
                const cor  = COR[c.tipo] || '#9590a8'
                const fCor = FASE_COR[c.fase] || '#9590a8'
                const statusSym = c.status === 'OK' ? '●' : c.status === 'LIMITE' ? '△' : '✗'
                const statusCor = c.status === 'OK' ? '#157a4a' : c.status === 'LIMITE' ? '#c2660a' : '#c0392b'
                const realW = (c as any).potencia_real_w

                return (
                  <g key={c.id}>
                    {/* Ponto na barra */}
                    <circle cx={x} cy={BARRA_Y} r={3.5} fill={cor} />

                    {/* Condutor vertical: barra → disjuntor */}
                    <line x1={x} y1={BARRA_Y + BARRA_H / 2} x2={x} y2={BARRA_Y + VERT_LEN - 24}
                      stroke={cor} strokeWidth={1.8} strokeOpacity={.7} />

                    {/* Seção do condutor */}
                    {c.secao_fase > 0 && (
                      <text x={x + 4} y={BARRA_Y + VERT_LEN / 2} fontSize={6.5}
                        fill="#9590a8" fontFamily="monospace">
                        {c.secao_fase}mm²
                      </text>
                    )}

                    {/* Comprimento */}
                    {r?.comprimento_m > 0 && (
                      <text x={x + 4} y={BARRA_Y + VERT_LEN / 2 + 10} fontSize={6}
                        fill="#b8bec9" fontFamily="monospace">
                        {r.comprimento_m}m
                      </text>
                    )}

                    {/* Disjuntor */}
                    <SimDisjuntor
                      x={x} y={BARRA_Y + VERT_LEN - 24}
                      cor={cor}
                      label={c.in_disj > 0 ? `${c.in_disj}A ${c.curva}` : '—'}
                      idr={c.idr}
                    />

                    {/* Condutor disjuntor → carga */}
                    <line x1={x} y1={BARRA_Y + VERT_LEN - 24 + 24}
                      x2={x} y2={CARGA_Y}
                      stroke={cor} strokeWidth={1.5} strokeOpacity={.6} />

                    {/* Carga */}
                    <SimCarga
                      x={x} y={CARGA_Y}
                      tipo={c.tipo}
                      potencia_va={c.potencia_va}
                      potencia_real_w={realW}
                    />

                    {/* N° do circuito */}
                    <text x={x} y={BARRA_Y - 10} textAnchor="middle" fontSize={7.5}
                      fill="#9590a8" fontFamily="monospace">
                      {String(i + 1).padStart(2, '0')}
                    </text>

                    {/* Fase */}
                    <text x={x} y={BARRA_Y - 20} textAnchor="middle" fontSize={7.5}
                      fill={fCor} fontFamily="monospace" fontWeight={700}>
                      {c.fase}
                    </text>

                    {/* Status */}
                    <text x={x} y={SVG_H - 14} textAnchor="middle" fontSize={9}
                      fill={statusCor}>{statusSym}</text>

                    {/* ΔV% */}
                    {c.du_calc > 0 && (
                      <text x={x} y={SVG_H - 4} textAnchor="middle" fontSize={6.5}
                        fill={c.du_calc <= 4 ? '#157a4a' : '#c0392b'} fontFamily="monospace">
                        {c.du_calc.toFixed(1)}%
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Linha de status na base */}
              <line x1={BARRA_X0} y1={SVG_H - 20} x2={BARRA_X1} y2={SVG_H - 20}
                stroke="#e2e5eb" strokeWidth={0.5} strokeDasharray="3 3" />

              {/* Legenda fase */}
              {Object.entries(FASE_COR).slice(0, 3).map(([fase, cor], i) => (
                <g key={fase}>
                  <circle cx={BARRA_X0 + i * 36} cy={BARRA_Y - 38} r={3} fill={cor} />
                  <text x={BARRA_X0 + i * 36 + 6} y={BARRA_Y - 34} fontSize={7}
                    fill={cor} fontFamily="monospace" fontWeight={600}>{fase}</text>
                </g>
              ))}
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* Notas técnicas */}
      {ci.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
          <strong>Diagrama unifilar simplificado</strong> conforme NBR 5410 / IEC 60364 — Layout: ramal → medidor → disjuntor geral → barra de distribuição → circuitos. Seções, comprimentos e ΔV% anotados em cada derivação. Exporte SVG para incluir na prancha do projeto.
          {ci.some(c => (c as any).potencia_real_w) && (
            <><br /><strong style={{ color: '#157a4a' }}>Verde itálico</strong> = potência real instalada (LED real) vs. potência de dimensionamento do cabo.</>
          )}
        </div>
      )}
    </div>
    </div>
  </>)
}
