// src/pages/EletrodutosCanvas.tsx
// ════════════════════════════════════════════════════════════════
// Canvas visual — a linha É o eletroduto, a fiação que passa por ela
// é representada por simbologia (cor + contagem), no espírito de CAD.
// Substitui o fluxo de "escolher origem/destino em dois dropdowns"
// por desenhar: clica no nó de origem, clica no nó de destino, o
// segmento (eletroduto) é criado como uma linha entre os dois.
// ════════════════════════════════════════════════════════════════
import { useState, useRef } from 'react'
import type { NoTopologico, SegmentoEletroduto, TipoNo, TipoCondutor } from '../types/electrical'

const TIPO_NO_ICON: Record<TipoNo, string> = {
  QD: '⬛', CAIXA_PASSAGEM: '⬜', CAIXA_DERIVACAO: '◈',
  CAIXA_TOMADA: '⬡', CAIXA_INTERRUPTOR: '⬡',
  PONTO_LUZ: '◎', PONTO_EMENDA: '◆', ENTRADA_SERVICO: '⚡',
}
const TIPO_NO_COR: Record<TipoNo, string> = {
  QD: 'var(--gold-dark)', CAIXA_PASSAGEM: 'var(--text3)', CAIXA_DERIVACAO: 'var(--purple)',
  CAIXA_TOMADA: 'var(--blue)', CAIXA_INTERRUPTOR: 'var(--blue)',
  PONTO_LUZ: 'var(--amber)', PONTO_EMENDA: 'var(--text4)', ENTRADA_SERVICO: 'var(--red)',
}
const COR_CONDUTOR: Record<TipoCondutor, string> = {
  FASE_A: 'var(--blue)', FASE_B: 'var(--green)', FASE_C: 'var(--amber)',
  NEUTRO: 'var(--text3)', PE: '#16a34a', RETORNO: '#7c3aed',
  CONTRA_RETORNO: '#be185d', TRAVAMENTO: '#b45309',
}

const PX_POR_M = 55
const RAIO_NO = 20

function layoutAutomatico(nos: NoTopologico[]): Record<string, { x: number; y: number }> {
  // Nós sem posição salva ganham um layout circular simples ao redor
  // do QD (ou do centro, se não houver QD) — só pra não ficarem
  // empilhados na origem. O engenheiro reposiciona arrastando.
  const pos: Record<string, { x: number; y: number }> = {}
  const semPosicao = nos.filter(n => n.pos_x === undefined || n.pos_y === undefined)
  const qd = nos.find(n => n.tipo === 'QD')
  const cx = qd?.pos_x ?? 4, cy = qd?.pos_y ?? 4
  const raio = 3.2
  semPosicao.forEach((n, i) => {
    const ang = (i / Math.max(semPosicao.length, 1)) * 2 * Math.PI
    pos[n.id] = {
      x: n.id === qd?.id ? cx : cx + raio * Math.cos(ang),
      y: n.id === qd?.id ? cy : cy + raio * Math.sin(ang),
    }
  })
  return pos
}

export function EletrodutosCanvas({
  nos, segmentos, onUpdateNo, onAddSegmento, onSelectSegmento, onSelectNo, segmentoSelecionadoId,
}: {
  nos: NoTopologico[]
  segmentos: SegmentoEletroduto[]
  onUpdateNo: (id: string, partial: Partial<NoTopologico>) => void
  onAddSegmento: (origemId: string, destinoId: string) => void
  onSelectSegmento: (id: string | null) => void
  onSelectNo: (id: string | null) => void
  segmentoSelecionadoId: string | null
}) {
  const [modo, setModo] = useState<'mover' | 'desenhar'>('mover')
  const [origemDesenho, setOrigemDesenho] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const autoPos = layoutAutomatico(nos)
  const getPos = (n: NoTopologico) =>
    n.pos_x !== undefined && n.pos_y !== undefined
      ? { x: n.pos_x, y: n.pos_y }
      : autoPos[n.id] ?? { x: 4, y: 4 }

  function pxToM(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / PX_POR_M,
      y: (clientY - rect.top) / PX_POR_M,
    }
  }

  function onNoMouseDown(e: React.MouseEvent, noId: string) {
    e.stopPropagation()
    if (modo === 'desenhar') {
      if (!origemDesenho) {
        setOrigemDesenho(noId)
      } else if (origemDesenho !== noId) {
        onAddSegmento(origemDesenho, noId)
        setOrigemDesenho(null)
      }
      return
    }
    setArrastando(noId)
    onSelectNo(noId)
    onSelectSegmento(null)
  }

  function onCanvasMouseMove(e: React.MouseEvent) {
    if (!arrastando) return
    const p = pxToM(e.clientX, e.clientY)
    onUpdateNo(arrastando, { pos_x: Math.round(p.x * 10) / 10, pos_y: Math.round(p.y * 10) / 10 })
  }

  function onCanvasMouseUp() {
    setArrastando(null)
  }

  // Persistir posições auto-geradas na primeira renderização (pra não
  // recalcular do zero a cada render e o nó "pular" quando outro é arrastado)
  const jaPersistiu = useRef(false)
  if (!jaPersistiu.current) {
    jaPersistiu.current = true
    Object.entries(autoPos).forEach(([id, p]) => onUpdateNo(id, { pos_x: p.x, pos_y: p.y }))
  }

  const largura = Math.max(600, ...nos.map(n => getPos(n).x * PX_POR_M + 120))
  const altura  = Math.max(400, ...nos.map(n => getPos(n).y * PX_POR_M + 120))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0 2px' }}>
        <button className="btn" style={modo === 'mover' ? { borderColor: 'var(--gold-mid)', color: 'var(--gold-dark)', background: 'var(--gold-dim)' } : undefined}
          onClick={() => { setModo('mover'); setOrigemDesenho(null) }}>
          ✥ Mover nós
        </button>
        <button className="btn" style={modo === 'desenhar' ? { borderColor: 'var(--gold-mid)', color: 'var(--gold-dark)', background: 'var(--gold-dim)' } : undefined}
          onClick={() => setModo('desenhar')}>
          ✏️ Desenhar eletroduto
        </button>
        {modo === 'desenhar' && (
          <span style={{ fontSize: 11, color: 'var(--text4)' }}>
            {origemDesenho
              ? 'Clique no nó de destino para fechar o trecho...'
              : 'Clique no nó de origem do eletroduto'}
          </span>
        )}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'auto',
        background: 'var(--surface2)', maxHeight: 560 }}>
        <svg ref={svgRef} width={largura} height={altura}
          onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp} onMouseLeave={onCanvasMouseUp}
          style={{ cursor: modo === 'mover' && arrastando ? 'grabbing' : 'default' }}>
          {/* grade sutil */}
          <defs>
            <pattern id="grid" width={PX_POR_M} height={PX_POR_M} patternUnits="userSpaceOnUse">
              <path d={`M ${PX_POR_M} 0 L 0 0 0 ${PX_POR_M}`} fill="none" stroke="var(--border)" strokeWidth={1} opacity={0.5} />
            </pattern>
          </defs>
          <rect width={largura} height={altura} fill="url(#grid)" />

          {/* Segmentos — a linha É o eletroduto */}
          {segmentos.map(seg => {
            const origem = nos.find(n => n.id === seg.origem_no_id)
            const destino = nos.find(n => n.id === seg.destino_no_id)
            if (!origem || !destino) return null
            const p1 = getPos(origem), p2 = getPos(destino)
            const x1 = p1.x * PX_POR_M, y1 = p1.y * PX_POR_M
            const x2 = p2.x * PX_POR_M, y2 = p2.y * PX_POR_M
            const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2
            const status = seg.analise?.status_ocupacao
            const corLinha = status === 'EXCEDIDO' ? 'var(--red)' : status === 'LIMITE' ? 'var(--amber)' : 'var(--green)'
            const selecionado = seg.id === segmentoSelecionadoId
            // Composição por tipo de condutor — símbolos ao longo da linha
            const contagem: Partial<Record<TipoCondutor, number>> = {}
            seg.condutores.forEach(c => { contagem[c.tipo] = (contagem[c.tipo] ?? 0) + 1 })
            const tipos = Object.keys(contagem) as TipoCondutor[]
            const angulo = Math.atan2(y2 - y1, x2 - x1)
            const perpX = -Math.sin(angulo), perpY = Math.cos(angulo)

            return (
              <g key={seg.id} style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onSelectSegmento(seg.id); onSelectNo(null) }}>
                {/* Linha grossa "eletroduto" */}
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={corLinha} strokeWidth={selecionado ? 7 : 5} strokeLinecap="round"
                  opacity={selecionado ? 1 : 0.75} />
                {selecionado && (
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="var(--surface)" strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
                )}
                {/* Símbolos de composição — pequenos traços perpendiculares coloridos por tipo */}
                {tipos.map((t, i) => {
                  const offset = (i - (tipos.length - 1) / 2) * 7
                  const bx = midX + perpX * offset, by = midY + perpY * offset
                  return (
                    <circle key={t} cx={bx} cy={by} r={4.5} fill={COR_CONDUTOR[t]}
                      stroke="var(--surface)" strokeWidth={1.2}>
                      <title>{t}: {contagem[t]}</title>
                    </circle>
                  )
                })}
                {tipos.length === 0 && (
                  <text x={midX} y={midY - 10} fontSize={9} fill="var(--text4)" textAnchor="middle" fontStyle="italic">
                    sem condutores
                  </text>
                )}
                {/* Ocupação % perto do meio */}
                {seg.analise && (
                  <text x={midX} y={midY + 16} fontSize={9} fontWeight={700} fill={corLinha} textAnchor="middle"
                    style={{ fontFamily: 'var(--mono)' }}>
                    {seg.analise.taxa_ocupacao_pct}%
                  </text>
                )}
              </g>
            )
          })}

          {/* Trecho em desenho (feedback visual) */}
          {origemDesenho && (() => {
            const no = nos.find(n => n.id === origemDesenho)
            if (!no) return null
            const p = getPos(no)
            return <circle cx={p.x * PX_POR_M} cy={p.y * PX_POR_M} r={RAIO_NO + 6}
              fill="none" stroke="var(--gold-mid)" strokeWidth={2} strokeDasharray="4 3" />
          })()}

          {/* Nós */}
          {nos.map(n => {
            const p = getPos(n)
            const x = p.x * PX_POR_M, y = p.y * PX_POR_M
            return (
              <g key={n.id} transform={`translate(${x},${y})`} style={{ cursor: modo === 'desenhar' ? 'crosshair' : 'grab' }}
                onMouseDown={(e) => onNoMouseDown(e, n.id)}>
                <circle r={RAIO_NO} fill="var(--surface)" stroke={TIPO_NO_COR[n.tipo]} strokeWidth={2.5} />
                <text textAnchor="middle" dy={6} fontSize={15}>{TIPO_NO_ICON[n.tipo]}</text>
                <text textAnchor="middle" dy={RAIO_NO + 14} fontSize={10} fontWeight={600} fill="var(--text2)">
                  {n.nome.length > 14 ? n.nome.slice(0, 13) + '…' : n.nome}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--text4)', display: 'flex', gap: 14, flexWrap: 'wrap', padding: '0 2px' }}>
        <span>🟢 ocupação OK</span>
        <span>🟡 próxima do limite</span>
        <span>🔴 excedida</span>
        <span>· clique num eletroduto (linha) pra ver/editar os condutores</span>
      </div>
    </div>
  )
}
