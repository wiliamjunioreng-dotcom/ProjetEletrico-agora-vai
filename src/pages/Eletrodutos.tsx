// src/pages/Eletrodutos.tsx — Topologia elétrica real
// Nó → Segmento → Propagação de condutores — NBR 5410 §6.2.11 + NBR 5444
import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type {
  SegmentoEletroduto,
  TipoNo, TipoCondutor,
} from '../types/electrical'
import { validarRede, MODELOS_COMANDO } from '../core/topologia'
import { getDiametroExterno, AREA_INTERNA_ELETRODUTO } from '../data/nbr5410tables'

// ── Constantes ────────────────────────────────────────────────────
const DIAMETROS_NOMINAL: (16|20|25|32|40|50|63|75)[] = [16,20,25,32,40,50,63,75]
const MATERIAIS_ELETRODUTO = [
  { id: 'PVC_rigido', label: 'PVC Rígido — NBR 15465' },
  { id: 'PVC_flex',   label: 'PVC Flexível (corrugado)' },
  { id: 'Aco_EMT',    label: 'Aço EMT — parede fina' },
  { id: 'Aco_IMC',    label: 'Aço IMC — parede média' },
] as const

const TIPOS_NO: TipoNo[] = [
  'QD','CAIXA_PASSAGEM','CAIXA_DERIVACAO',
  'CAIXA_TOMADA','CAIXA_INTERRUPTOR','PONTO_LUZ','PONTO_EMENDA','ENTRADA_SERVICO',
]
const TIPO_NO_LABEL: Record<TipoNo, string> = {
  QD:                'Quadro de Distribuição',
  CAIXA_PASSAGEM:    'Caixa de Passagem',
  CAIXA_DERIVACAO:   'Caixa de Derivação',
  CAIXA_TOMADA:      'Ponto de Tomada',
  CAIXA_INTERRUPTOR: 'Ponto de Interruptor',
  PONTO_LUZ:         'Ponto de Luz',
  PONTO_EMENDA:      'Emenda / Splice',
  ENTRADA_SERVICO:   'Entrada de Serviço',
}
const TIPO_NO_ICON: Record<TipoNo, string> = {
  QD: '⬛', CAIXA_PASSAGEM: '⬜', CAIXA_DERIVACAO: '◈',
  CAIXA_TOMADA: '⬡', CAIXA_INTERRUPTOR: '⬡',
  PONTO_LUZ: '◎', PONTO_EMENDA: '◆', ENTRADA_SERVICO: '⚡',
}

const TIPOS_CONDUTOR: { id: TipoCondutor; label: string; cor: string }[] = [
  { id: 'FASE_A',         label: 'Fase A',         cor: 'var(--blue)'   },
  { id: 'FASE_B',         label: 'Fase B',         cor: 'var(--green)'  },
  { id: 'FASE_C',         label: 'Fase C',         cor: 'var(--amber)'  },
  { id: 'NEUTRO',         label: 'Neutro (N)',     cor: 'var(--text3)'  },
  { id: 'PE',             label: 'Proteção (PE)',  cor: '#16a34a'        },
  { id: 'RETORNO',        label: 'Retorno (R)',    cor: '#7c3aed'        },
  { id: 'CONTRA_RETORNO', label: 'Contra-retorno', cor: '#be185d'       },
  { id: 'TRAVAMENTO',     label: 'Travamento (T)', cor: '#b45309'        },
]

// ── Seção transversal SVG ─────────────────────────────────────────
function SecaoTransversal({ taxa, diametro }: { taxa: number; diametro: number }) {
  const cor = taxa <= 30 ? 'var(--green)' : taxa <= 35 ? 'var(--amber)' : 'var(--red)'
  const r = 38
  const circ = 2 * Math.PI * r
  const dash = circ * Math.min(taxa / 100, 1)

  return (
    <svg width={96} height={96} viewBox="-48 -48 96 96">
      <circle r={r} fill="none" stroke="var(--border2)" strokeWidth={3} />
      <circle r={r} fill="none" stroke={cor} strokeWidth={3.5}
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ * 0.25}
        transform="rotate(-90)" />
      <text y={4} textAnchor="middle" fontSize={12}
        fill={cor} fontFamily="monospace" fontWeight={700}>{taxa}%</text>
      <text y={16} textAnchor="middle" fontSize={8}
        fill="var(--text4)" fontFamily="monospace">⌀{diametro}mm</text>
    </svg>
  )
}

// ── Diagrama de nós e segmentos ────────────────────────────────────
// ── Painel de detalhe do segmento selecionado (modo canvas) ──────
function PainelSegmento({ seg, circuitos, onUpdate, onRemove, onFechar }: {
  seg: SegmentoEletroduto
  circuitos: { id: string; numero: number; nome: string }[]
  onUpdate: (partial: Partial<Omit<SegmentoEletroduto, 'id'>>) => void
  onRemove: () => void
  onFechar: () => void
}) {
  const [condTipo, setCondTipo] = useState<TipoCondutor>('FASE_A')
  const [condSecao, setCondSecao] = useState('2.5')
  const [condCirc, setCondCirc] = useState('')

  function addCondutor() {
    onUpdate({
      condutores: [...seg.condutores, {
        tipo: condTipo, secao_mm2: parseFloat(condSecao) || 2.5,
        circuito_id: condCirc, corrente_a: 0,
      }],
    })
  }
  function removeCondutor(i: number) {
    onUpdate({ condutores: seg.condutores.filter((_, j) => j !== i) })
  }

  const analise = seg.analise
  const statusCor = analise?.status_ocupacao === 'EXCEDIDO' ? 'var(--red)'
    : analise?.status_ocupacao === 'LIMITE' ? 'var(--amber)' : 'var(--green)'

  return (
    <div className="card" style={{ position: 'sticky', top: 8 }}>
      <div className="card-header">
        {seg.nome}
        <button className="btn ghost icon" onClick={onFechar} style={{ marginLeft: 'auto' }}>✕</button>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {analise && (
          <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
            <span style={{ color: statusCor, fontWeight: 700 }}>
              {analise.taxa_ocupacao_pct}% ocup. (limite {analise.limite_ocupacao_pct}%)
            </span>
            <span style={{ color: 'var(--text4)' }}>Fa={analise.fa_resultante}</span>
          </div>
        )}

        <div className="form-grid c2">
          <div className="fgroup">
            <label className="flabel">Comprimento (m)</label>
            <input className="finput" type="number" value={seg.comprimento_m}
              onChange={e => onUpdate({ comprimento_m: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="fgroup">
            <label className="flabel">Diâmetro</label>
            <select className="fselect" value={seg.diametro_mm}
              onChange={e => onUpdate({ diametro_mm: parseInt(e.target.value) as any })}>
              {DIAMETROS_NOMINAL.map(d => <option key={d} value={d}>⌀{d}mm</option>)}
            </select>
          </div>
        </div>
        <div className="fgroup">
          <label className="flabel">Material</label>
          <select className="fselect" value={seg.material}
            onChange={e => onUpdate({ material: e.target.value as any })}>
            {MATERIAIS_ELETRODUTO.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <label className="flabel" title="NBR 5410 §6.2.11.3 — máx. 3 curvas (270°) entre caixas">
            Curvas de 90° neste trecho
          </label>
          <input className="finput" type="number" value={seg.n_curvas_90 || ''}
            onChange={e => onUpdate({ n_curvas_90: parseInt(e.target.value) || 0 })}
            min={0} max={10} />
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div className="flabel" style={{ marginBottom: 6 }}>Condutores (a fiação que passa aqui)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px auto', gap: 5, alignItems: 'end' }}>
            <select className="fselect" style={{ height: 30, fontSize: 11 }}
              value={condTipo} onChange={e => setCondTipo(e.target.value as TipoCondutor)}>
              {TIPOS_CONDUTOR.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input className="finput" style={{ height: 30, fontSize: 11 }} type="number"
              value={condSecao} onChange={e => setCondSecao(e.target.value)} min={1} step={0.5} />
            <button className="btn primary" style={{ height: 30, padding: '0 10px' }} onClick={addCondutor}>+</button>
          </div>
          <select className="fselect" style={{ marginTop: 5, height: 28, fontSize: 11 }}
            value={condCirc} onChange={e => setCondCirc(e.target.value)}>
            <option value="">Circuito — nenhum vinculado</option>
            {circuitos.map(ci => (
              <option key={ci.id} value={ci.id}>C{String(ci.numero).padStart(2,'0')} {ci.nome.slice(0,20)}</option>
            ))}
          </select>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
            {seg.condutores.map((cd, i) => {
              const info = TIPOS_CONDUTOR.find(t => t.id === cd.tipo)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  padding: '4px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: info?.cor, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{info?.label} · {cd.secao_mm2}mm²</span>
                  <button onClick={() => removeCondutor(i)} style={{ background: 'none', border: 'none',
                    color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              )
            })}
            {seg.condutores.length === 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--text4)', fontStyle: 'italic' }}>
                Nenhum condutor ainda — adicione acima.
              </div>
            )}
          </div>
        </div>

        <button className="btn danger" style={{ marginTop: 4 }} onClick={onRemove}>
          🗑 Remover este eletroduto
        </button>
      </div>
    </div>
  )
}


// ── Componente principal ───────────────────────────────────────────
export function Eletrodutos() {
  const { rede, addNo, addSegmento, removeNo, removeSegmento, updateSegmento, circuitos } = useProjectStore()
  const [segSelecionadoId, setSegSelecionadoId] = useState<string | null>(null)

  const nos = rede?.nos ?? []
  const segmentos = rede?.segmentos ?? []

  // Formulário nó
  const [formNo, setFormNo] = useState<{ nome: string; tipo: TipoNo; comodo: string }>({
    nome: '', tipo: 'QD', comodo: '',
  })

  // Formulário segmento
  const [formSeg, setFormSeg] = useState({
    nome: '', origem: '', destino: '',
    comprimento_m: 0, diametro_mm: 20 as number,
    material: 'PVC_rigido' as SegmentoEletroduto['material'],
    n_curvas_90: 0,
    condutores: [] as { tipo: TipoCondutor; secao: number; circ_id: string }[],
  })

  // Formulário de condutor para o segmento
  const [condTipo, setCondTipo]   = useState<TipoCondutor>('FASE_A')
  const [condSecao, setCondSecao] = useState('2.5')
  const [condCirc,  setCondCirc]  = useState('')

  function adicionarNo() {
    if (!formNo.nome.trim()) return
    addNo({ nome: formNo.nome, tipo: formNo.tipo, comodo: formNo.comodo || undefined })
    setFormNo({ nome: '', tipo: 'CAIXA_PASSAGEM', comodo: '' })
  }

  function adicionarCondutor() {
    const secao = parseFloat(condSecao) || 0
    if (secao <= 0) return
    setFormSeg(f => ({
      ...f,
      condutores: [...f.condutores, { tipo: condTipo, secao, circ_id: condCirc }],
    }))
  }

  // Criação rápida via canvas — desenhar a linha entre 2 nós já cria o
  // segmento com valores padrão sensatos (diâmetro 20mm, PVC rígido,
  // comprimento = distância real entre os nós posicionados). O
  // engenheiro refina depois clicando na linha (condutores, diâmetro
  // exato, material) — não precisa preencher tudo antes de desenhar.
  function adicionarSegmento() {
    if (!formSeg.nome.trim() || !formSeg.origem || !formSeg.destino) return
    const condutores = formSeg.condutores.map(c => ({
      tipo: c.tipo,
      secao_mm2: c.secao,
      circuito_id: c.circ_id,
      corrente_a: 0,  // calculado pelo motor
    }))
    addSegmento({
      nome: formSeg.nome,
      origem_no_id: formSeg.origem,
      destino_no_id: formSeg.destino,
      comprimento_m: formSeg.comprimento_m,
      diametro_mm: formSeg.diametro_mm as any,
      material: formSeg.material,
      n_curvas_90: formSeg.n_curvas_90,
      condutores,
    })
    setFormSeg({ nome: '', origem: '', destino: '', comprimento_m: 0, diametro_mm: 20, material: 'PVC_rigido', n_curvas_90: 0, condutores: [] })
  }

  // Verificar rede
  const problemas = nos.length > 0 ? validarRede({ nos, segmentos, caminhos: [] }) : []
  const n_erros = problemas.filter(p => p.tipo === 'ERRO').length
  const n_avisos = problemas.filter(p => p.tipo === 'AVISO').length
  const n_ok_seg = segmentos.filter(s => s.analise?.status_ocupacao === 'OK').length
  const n_exc_seg = segmentos.filter(s => s.analise?.status_ocupacao === 'EXCEDIDO').length

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Topologia Elétrica</div>
        <div className="page-sub">
          Nó → Segmento → Condutor · NBR 5410 §6.2.11 · Diâmetros reais IEC 60228 · NBR 5444
        </div>
      </div>
      <div className="page-actions">
        {n_erros > 0 && (
          <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
            {n_erros} erro(s)
          </span>
        )}
      </div>
    </div>

    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className="kpi info">
        <div className="kpi-lbl">Nós</div>
        <div className="kpi-val">{nos.length}</div>
        <div className="kpi-unit">pontos elétricos</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Segmentos</div>
        <div className="kpi-val">{segmentos.length}</div>
        <div className="kpi-unit">trechos de eletroduto</div>
      </div>
      <div className={`kpi ${n_ok_seg === segmentos.length && segmentos.length > 0 ? 'ok' : ''}`}>
        <div className="kpi-lbl">Ocupação OK</div>
        <div className="kpi-val">{n_ok_seg}</div>
        <div className="kpi-unit">limite varia c/ nº condutores</div>
      </div>
      <div className={`kpi ${n_exc_seg > 0 ? 'err' : ''}`}>
        <div className="kpi-lbl">Excedidos</div>
        <div className="kpi-val">{n_exc_seg}</div>
        <div className="kpi-unit">acima do limite — aumentar ⌀</div>
      </div>
      <div className={`kpi ${n_erros > 0 ? 'err' : n_avisos > 0 ? 'warn' : nos.length > 0 ? 'ok' : ''}`}>
        <div className="kpi-lbl">Validação</div>
        <div className="kpi-val">{n_erros > 0 ? 'ERRO' : n_avisos > 0 ? 'AVISO' : nos.length > 0 ? 'OK' : '—'}</div>
        <div className="kpi-unit">{n_erros} erro(s) · {n_avisos} aviso(s)</div>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Representação da fiação — NÃO é desenho. O programa nunca traça
          o percurso físico do eletroduto (isso é trabalho do CAD); aqui
          só declaramos QUAIS trechos existem e QUAIS fios passam em cada
          um, e o programa mostra isso por símbolo/cor — fase, neutro,
          terra, retorno, de qual circuito, qual bitola. */}
      <div style={{ display: 'grid', gridTemplateColumns: segSelecionadoId ? 'minmax(0,1fr) 320px' : 'repeat(auto-fill, minmax(280px,1fr))', gap: 12, alignItems: 'start' }}>
        {segmentos.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text4)', fontSize: 11 }}>
            Nenhum trecho declarado ainda — use o formulário abaixo para criar o primeiro.
          </div>
        ) : segmentos.map(seg => {
          const status = seg.analise?.status_ocupacao
          const corStatus = status === 'EXCEDIDO' ? 'var(--red)' : status === 'LIMITE' ? 'var(--amber)' : 'var(--green)'
          const origem = nos.find(n => n.id === seg.origem_no_id)
          const destino = nos.find(n => n.id === seg.destino_no_id)
          return (
            <div key={seg.id} className="eletroduto-trecho"
              style={{ cursor: 'pointer', borderColor: seg.id === segSelecionadoId ? 'var(--gold-mid)' : undefined }}
              onClick={() => setSegSelecionadoId(seg.id === segSelecionadoId ? null : seg.id)}>
              <div className="header">
                <span style={{ flex: 1 }}>{seg.nome}</span>
                {seg.analise && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: corStatus, fontFamily: 'var(--mono)' }}>
                    {seg.analise.taxa_ocupacao_pct}%
                  </span>
                )}
              </div>
              <div style={{ padding: '8px 14px 0', fontSize: 10, color: 'var(--text4)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>{origem?.nome ?? '?'} → {destino?.nome ?? '?'}</span>
                <span>⌀{seg.diametro_mm}mm</span>
                <span>{seg.comprimento_m}m</span>
              </div>
              <div className="condutores">
                {seg.condutores.length === 0 ? (
                  <span style={{ fontSize: 10, color: 'var(--text4)', fontStyle: 'italic' }}>sem condutores declarados</span>
                ) : seg.condutores.map((cd, i) => {
                  const classeCor = cd.tipo.startsWith('FASE') ? 'fase'
                    : cd.tipo === 'NEUTRO' ? 'neutro'
                    : cd.tipo === 'PE' ? 'pe' : 'retorno'
                  const circ = circuitos.find(ci => ci.id === cd.circuito_id)
                  return (
                    <span key={i} className={`fio-badge ${classeCor}`}>
                      {cd.tipo} {cd.secao_mm2}mm²{circ ? ` · C${String(circ.numero).padStart(2,'0')}` : ''}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        {segSelecionadoId && (() => {
          const seg = segmentos.find(s => s.id === segSelecionadoId)
          if (!seg) return null
          return (
            <PainelSegmento
              seg={seg}
              circuitos={circuitos}
              onUpdate={(partial) => updateSegmento(seg.id, partial)}
              onRemove={() => { removeSegmento(seg.id); setSegSelecionadoId(null) }}
              onFechar={() => setSegSelecionadoId(null)}
            />
          )
        })()}
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--text4)', padding: '0 2px' }}>
        Clique num card pra editar · use o formulário abaixo pra declarar um novo trecho
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,280px) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>

        {/* Formulários */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Adicionar nó */}
          <div className="card">
            <div className="card-header">+ Adicionar nó</div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="fgroup">
                <label className="flabel">Tipo</label>
                <select className="fselect" value={formNo.tipo}
                  onChange={e => setFormNo(f => ({ ...f, tipo: e.target.value as TipoNo }))}>
                  {TIPOS_NO.map(t => (
                    <option key={t} value={t}>{TIPO_NO_ICON[t]} {TIPO_NO_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="fgroup">
                <label className="flabel">Nome</label>
                <input className="finput" value={formNo.nome}
                  onChange={e => setFormNo(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Caixa corredor" />
              </div>
              <button className="btn primary" onClick={adicionarNo} style={{ justifyContent: 'center' }}>
                + Nó
              </button>
            </div>
          </div>

          {/* Adicionar segmento */}
          <div className="card">
            <div className="card-header">+ Adicionar segmento</div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="fgroup">
                <label className="flabel">Nome</label>
                <input className="finput" value={formSeg.nome}
                  onChange={e => setFormSeg(f => ({ ...f, nome: e.target.value }))}
                  placeholder="T01 — QD → Sala" />
              </div>
              <div className="form-grid c2">
                <div className="fgroup">
                  <label className="flabel">Origem</label>
                  <select className="fselect" value={formSeg.origem}
                    onChange={e => setFormSeg(f => ({ ...f, origem: e.target.value }))}>
                    <option value="">— selecione —</option>
                    {nos.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
                  </select>
                </div>
                <div className="fgroup">
                  <label className="flabel">Destino</label>
                  <select className="fselect" value={formSeg.destino}
                    onChange={e => setFormSeg(f => ({ ...f, destino: e.target.value }))}>
                    <option value="">— selecione —</option>
                    {nos.filter(n => n.id !== formSeg.origem).map(n => (
                      <option key={n.id} value={n.id}>{n.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-grid c2">
                <div className="fgroup">
                  <label className="flabel">Comp. (m)</label>
                  <input className="finput" type="number" value={formSeg.comprimento_m || ''}
                    onChange={e => setFormSeg(f => ({ ...f, comprimento_m: parseFloat(e.target.value)||0 }))}
                    min={0} step={0.5} />
                </div>
                <div className="fgroup">
                  <label className="flabel">⌀ nominal</label>
                  <select className="fselect" value={formSeg.diametro_mm}
                    onChange={e => setFormSeg(f => ({ ...f, diametro_mm: Number(e.target.value) }))}>
                    {DIAMETROS_NOMINAL.map(d => (
                      <option key={d} value={d}>⌀{d}mm — {AREA_INTERNA_ELETRODUTO[d]?.toFixed(0)}mm²</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-grid c2">
                <div className="fgroup">
                  <label className="flabel">Material</label>
                  <select className="fselect" value={formSeg.material}
                    onChange={e => setFormSeg(f => ({ ...f, material: e.target.value as any }))}>
                    {MATERIAIS_ELETRODUTO.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="fgroup">
                  <label className="flabel" title="NBR 5410 §6.2.11.3 — máx. 3 curvas (270°) entre caixas">
                    Curvas de 90° neste trecho
                  </label>
                  <input className="finput" type="number" value={formSeg.n_curvas_90 || ''}
                    onChange={e => setFormSeg(f => ({ ...f, n_curvas_90: parseInt(e.target.value) || 0 }))}
                    min={0} max={10} step={1}
                    style={formSeg.n_curvas_90 > 3 ? { borderColor: 'var(--red)' } : undefined} />
                  {formSeg.n_curvas_90 > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>
                      &gt;3 curvas (270°) — insira caixa de passagem intermediária
                    </div>
                  )}
                </div>
              </div>

              {/* Condutores */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div className="flabel" style={{ marginBottom: 6 }}>Condutores neste segmento</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr auto', gap: 5, alignItems: 'end' }}>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Tipo</label>
                    <select className="fselect" style={{ height: 26, fontSize: 10 }}
                      value={condTipo} onChange={e => setCondTipo(e.target.value as TipoCondutor)}>
                      {TIPOS_CONDUTOR.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>mm²</label>
                    <input className="finput" style={{ height: 26, fontSize: 10 }}
                      type="number" value={condSecao}
                      onChange={e => setCondSecao(e.target.value)} min={1} step={0.5} />
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Circuito</label>
                    <select className="fselect" style={{ height: 26, fontSize: 10 }}
                      value={condCirc} onChange={e => setCondCirc(e.target.value)}>
                      <option value="">— nenhum —</option>
                      {circuitos.map(ci => (
                        <option key={ci.id} value={ci.id}>C{String(ci.numero).padStart(2,'0')} {ci.nome.slice(0,16)}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn" style={{ height: 26, padding: '0 8px', alignSelf: 'flex-end' }}
                    onClick={adicionarCondutor}>+</button>
                </div>
                {/* Lista de condutores adicionados */}
                {formSeg.condutores.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {formSeg.condutores.map((c, i) => {
                      const info = TIPOS_CONDUTOR.find(t => t.id === c.tipo)
                      return (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '2px 6px', borderRadius: 2,
                          background: 'var(--surface2)', border: '1px solid var(--border2)',
                          fontSize: 9, fontFamily: 'var(--mono)',
                        }}>
                          <span style={{ color: info?.cor, fontWeight: 700 }}>{c.tipo}</span>
                          <span>{c.secao}mm²</span>
                          <button onClick={() => setFormSeg(f => ({ ...f, condutores: f.condutores.filter((_,j)=>j!==i) }))}
                            style={{ background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:12,lineHeight:1 }}>×</button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              <button className="btn primary" onClick={adicionarSegmento} style={{ justifyContent: 'center' }}>
                + Segmento
              </button>
            </div>
          </div>

          {/* Modelos de comando */}
          <div className="card">
            <div className="card-header">Modelos de comando — condutores</div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MODELOS_COMANDO.map(m => (
                <div key={m.tipo_interruptor} style={{
                  padding: '7px 10px', borderRadius: 4,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  fontSize: 11,
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                    {m.tipo_interruptor} — {m.n_condutores} vias
                  </div>
                  <div style={{ color: 'var(--text4)', fontSize: 9.5 }}>{m.descricao}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                    {m.condutores_necessarios.map(tc => {
                      const info = TIPOS_CONDUTOR.find(t => t.id === tc)
                      return (
                        <span key={tc} style={{
                          fontSize: 8.5, padding: '1px 5px', borderRadius: 2,
                          background: 'var(--surface3)', color: info?.cor,
                          fontFamily: 'var(--mono)', fontWeight: 600,
                        }}>{tc}</span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Listas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflowX: 'hidden' }}>

          {/* Nós */}
          {nos.length > 0 && (
            <div className="card">
              <div className="card-header">Nós da rede</div>
              <table className="dtable">
                <thead><tr>
                  <th style={{ width: 24 }}></th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Segmentos conectados</th>
                  <th style={{ width: 32 }}></th>
                </tr></thead>
                <tbody>
                  {nos.map(no => {
                    const segsConectados = segmentos.filter(
                      s => s.origem_no_id === no.id || s.destino_no_id === no.id
                    )
                    return (
                      <tr key={no.id}>
                        <td style={{ textAlign: 'center', fontSize: 16 }}>{TIPO_NO_ICON[no.tipo]}</td>
                        <td className="name">{no.nome}</td>
                        <td style={{ fontSize: 10, color: 'var(--text4)' }}>{TIPO_NO_LABEL[no.tipo]}</td>
                        <td className="mono" style={{ fontSize: 10 }}>{segsConectados.length}</td>
                        <td>
                          <button className="del-btn" onClick={() => removeNo(no.id)}>×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Segmentos com análise */}
          {segmentos.length > 0 && segmentos.map(seg => {
            const analise = seg.analise
            const statusCor = !analise ? 'var(--text4)'
              : analise.status_ocupacao === 'OK' ? 'var(--green)'
              : analise.status_ocupacao === 'LIMITE' ? 'var(--amber)' : 'var(--red)'
            const noOrig = nos.find(n => n.id === seg.origem_no_id)
            const noDest = nos.find(n => n.id === seg.destino_no_id)

            return (
              <div key={seg.id} style={{
                border: '1px solid var(--border)',
                borderRadius: 5, background: 'var(--surface)',
                overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', background: 'var(--surface2)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 600, flexWrap: 'wrap',
                }}>
                  <span style={{ color: 'var(--blue)', fontFamily: 'var(--mono)' }}>⌀{seg.diametro_mm}</span>
                  <span style={{ flex: 1 }}>{seg.nome}</span>
                  <span style={{ fontSize: 9.5, color: 'var(--text4)' }}>
                    {noOrig?.nome ?? '?'} → {noDest?.nome ?? '?'} · {seg.comprimento_m}m
                  </span>
                  {analise && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: statusCor }}>
                      {analise.taxa_ocupacao_pct}%
                    </span>
                  )}
                  {analise && !analise.curvas_conforme && (
                    <span title="NBR 5410 §6.2.11.3 — máx. 3 curvas (270°) entre caixas"
                      style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--red)',
                        background: 'rgba(220,38,38,.12)', padding: '2px 6px', borderRadius: 4 }}>
                      ⚠ {analise.n_curvas_90} curvas &gt; 270°
                    </span>
                  )}
                  <button className="btn ghost icon" onClick={() => removeSegmento(seg.id)}
                    style={{ color: 'var(--red)', opacity: .7, height: 22 }}>×</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 0 }}>
                  <div style={{ padding: 8, borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SecaoTransversal taxa={analise?.taxa_ocupacao_pct ?? 0} diametro={seg.diametro_mm} />
                  </div>
                  <div style={{ padding: 10 }}>
                    {/* Condutores com diâmetro externo real */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                        Condutores (⌀ externo real — IEC 60228/PVC)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {seg.condutores.map((c, i) => {
                          const info = TIPOS_CONDUTOR.find(t => t.id === c.tipo)
                          const dExt = getDiametroExterno(c.secao_mm2)
                          return (
                            <span key={i} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '2px 6px', borderRadius: 2, fontSize: 9.5,
                              background: 'var(--surface2)', border: `1px solid ${info?.cor ?? 'var(--border)'}`,
                              fontFamily: 'var(--mono)', fontWeight: 600,
                            }}>
                              <span style={{ color: info?.cor }}>{c.tipo}</span>
                              <span style={{ color: 'var(--text3)' }}>{c.secao_mm2}mm²</span>
                              <span style={{ color: 'var(--text4)' }}>⌀{dExt}mm</span>
                            </span>
                          )
                        })}
                        {seg.condutores.length === 0 && (
                          <span style={{ fontSize: 10, color: 'var(--text4)' }}>Nenhum condutor definido</span>
                        )}
                      </div>
                    </div>

                    {analise && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                        {[
                          ['Circ. distintos', String(analise.n_circuitos_distintos)],
                          ['Área condut.', `${analise.area_condutores_mm2}mm²`],
                          ['Área interna', `${analise.area_interna_mm2.toFixed(0)}mm²`],
                          ['Fa result.', analise.fa_resultante.toFixed(2)],
                        ].map(([k, v]) => (
                          <div key={k} style={{ fontSize: 10 }}>
                            <div style={{ color: 'var(--text4)', fontSize: 9 }}>{k}</div>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {analise?.status_ocupacao !== 'OK' && analise && (
                      <div style={{
                        marginTop: 7, padding: '5px 8px', borderRadius: 3, fontSize: 9.5,
                        background: analise.status_ocupacao === 'LIMITE' ? 'var(--amber-dim)' : 'var(--red-dim)',
                        border: `1px solid ${analise.status_ocupacao === 'LIMITE' ? 'var(--amber)' : 'var(--red)'}`,
                        color: analise.status_ocupacao === 'LIMITE' ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {analise.status_ocupacao === 'LIMITE'
                          ? `⚠ ${analise.taxa_ocupacao_pct}% — próxima do limite NBR 5410 §6.2.11.1.6 (${analise.limite_ocupacao_pct}% para ${seg.condutores.length} condutor(es)). Próximo: ⌀${DIAMETROS_NOMINAL[DIAMETROS_NOMINAL.indexOf(seg.diametro_mm as any)+1]??seg.diametro_mm}mm.`
                          : `✗ ${analise.taxa_ocupacao_pct}% excede ${analise.limite_ocupacao_pct}% (${seg.condutores.length} condutor(es)). Use ⌀${DIAMETROS_NOMINAL[DIAMETROS_NOMINAL.indexOf(seg.diametro_mm as any)+1]??seg.diametro_mm}mm.`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {segmentos.length === 0 && nos.length === 0 && (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text4)' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>📐</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Comece pela topologia</div>
              <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                1. Adicione o QD como primeiro nó<br />
                2. Adicione caixas de passagem e derivação<br />
                3. Conecte com segmentos de eletroduto<br />
                4. Defina os condutores em cada segmento
              </div>
            </div>
          )}

          {/* Problemas encontrados */}
          {problemas.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ color: n_erros > 0 ? 'var(--red)' : 'var(--amber)' }}>
                Validação da rede — {problemas.length} problema(s)
              </div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {problemas.map((p, i) => (
                  <div key={i} style={{
                    fontSize: 11, display: 'flex', gap: 6, alignItems: 'flex-start',
                    color: p.tipo === 'ERRO' ? 'var(--red)' : 'var(--amber)',
                  }}>
                    <span>{p.tipo === 'ERRO' ? '✗' : '⚠'}</span>
                    <span>{p.descricao}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de referência — diâmetros externos reais */}
          <div className="card">
            <div className="card-header">
              Diâmetros externos reais — IEC 60228 (cabo unipolar PVC 70°C)
              <span style={{ fontSize: 9, color: 'var(--text4)' }}>NBR usa d_ext, não bitola nominal</span>
            </div>
            <table className="dtable">
              <thead><tr>
                <th className="r">Seção</th>
                <th className="r">⌀ ext. PVC</th>
                <th className="r">⌀ ext. XLPE</th>
                <th className="r">Área (PVC)</th>
                <th>Uso típico</th>
              </tr></thead>
              <tbody>
                {[1.5, 2.5, 4, 6, 10, 16, 25, 35, 50].map(sec => {
                  const dPVC  = getDiametroExterno(sec, 'PVC')
                  const dXLPE = getDiametroExterno(sec, 'XLPE')
                  const area  = Math.PI * (dPVC/2)**2
                  return (
                    <tr key={sec}>
                      <td className="mono r">{sec} mm²</td>
                      <td className="mono r">{dPVC} mm</td>
                      <td className="mono r">{dXLPE} mm</td>
                      <td className="mono r">{area.toFixed(1)} mm²</td>
                      <td style={{ fontSize: 10, color: 'var(--text4)' }}>
                        {sec <= 2.5 ? 'ILUM, TUG leve' :
                         sec <= 6   ? 'TUG, TUE pequeno' :
                         sec <= 16  ? 'TUE, alimentadores' :
                                      'Ramal principal'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div>
  </>)
}
