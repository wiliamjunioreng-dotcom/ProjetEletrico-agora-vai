// src/pages/Circuitos.tsx
// Interface de dimensionamento — consome CircuitViewModel, nunca RawCircuit diretamente
// Adapter Layer: buildAllViewModels() faz a tradução domínio → apresentação

import { useState, useRef } from 'react'
import { useProjectStore, fasesParaTipo, inferirLigacao, faseDefault } from '../store/projectStore'
import type { TipoLigacao } from '../store/projectStore'
import { resolverCircuito } from '../core/pipeline'
import type { CircuitoPipelined } from '../core/pipeline'
import { buildAllViewModels } from '../store/circuitViewModel'
import type { CircuitViewModel, ViolacaoVM } from '../store/circuitViewModel'
import { formatarTrace } from '../core/trace'

const TIPOS = ['ILUM', 'TUG', 'TUE', 'GERAL']

// ── Card de circuito — consome CircuitViewModel ────────────────────
function CircuitoCard({
  vm, raw, pipeline, expanded, onToggle,
  onUpdate, onUpdateBatch, onRemove, projeto,
}: {
  vm:            CircuitViewModel
  raw:           any    // apenas para edição — não para exibição
  pipeline:      CircuitoPipelined | undefined
  expanded:      boolean
  onToggle:      () => void
  onUpdate:      (id: string, field: string, value: any) => void
  onUpdateBatch: (id: string, updates: any) => void
  onRemove:      (id: string) => void
  projeto:       any
}) {
  const [showTrace, setShowTrace] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [novaQtd,    setNovaQtd]    = useState(1)
  const [novaPot,    setNovaPot]    = useState(100)
  const [novaDesc,   setNovaDesc]   = useState('')

  // ── Composição — editar lampadas ─────────────────────────────────
  function adicionarItem() {
    if (novaPot <= 0) return
    const fator = vm.tipo === 'ILUM' ? 1.25 : 1.0  // FATORES_DIM via vm
    const novaLamp = {
      id:        crypto.randomUUID(),
      descricao: novaDesc || (vm.tipo === 'ILUM' ? `Lamp. ${novaPot}W` : `${novaPot}VA`),
      qtd:       novaQtd,
      pot_w:     novaPot,
      pot_dim_w: novaPot * fator,
    }
    const novasLampadas = [...(raw.lampadas ?? []), novaLamp]
    const novaVaDim = novasLampadas.reduce((s: number, l: any) => {
      return s + l.qtd * (l.pot_dim_w ?? l.pot_w * fator)
    }, 0)
    // Atualização atômica — sem setTimeout(0)
    onUpdateBatch(raw.id, { lampadas: novasLampadas, potencia_va: Math.round(novaVaDim) })
    setNovaQtd(1); setNovaPot(100); setNovaDesc('')
  }

  function removerItem(lid: string) {
    const fator = vm.tipo === 'ILUM' ? 1.25 : 1.0
    const novasLampadas = (raw.lampadas ?? []).filter((l: any) => l.id !== lid)
    const novaVaDim = novasLampadas.reduce((s: number, l: any) => {
      return s + l.qtd * (l.pot_dim_w ?? l.pot_w * fator)
    }, 0)
    onUpdateBatch(raw.id, { lampadas: novasLampadas, potencia_va: Math.round(novaVaDim) || 0 })
  }

  const { composicao, resultado, execucao, violacoes, status } = vm
  const circuito_foco_id = useProjectStore(s => s.circuito_foco_id)
  const em_foco = circuito_foco_id === vm.id

  return (
    <div className={vm.css_class} style={{
      border: em_foco
        ? '2px solid var(--blue)'
        : `1px solid ${status === 'ok' ? 'var(--green)' : status === 'aviso' ? 'var(--amber)' : status === 'erro' || status === 'invalido' ? 'var(--red)' : 'var(--border)'}`,
      boxShadow: em_foco ? '0 0 0 3px var(--blue-dim)' : 'none',
      borderRadius: 5, background: 'var(--surface)', overflow: 'hidden',
    }}>

      {/* ── Cabeçalho clicável ─────────────────────────────────── */}
      <div onClick={onToggle} style={{
        padding: '9px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        background: expanded ? 'var(--surface2)' : 'var(--surface)',
      }}>
        {/* Badge de status */}
        <div style={{
          minWidth: 68, height: 22, borderRadius: 3, flexShrink: 0,
          background: status === 'ok' ? 'var(--green-dim)'
            : status === 'aviso' ? 'var(--amber-dim)'
            : status === 'erro' || status === 'invalido' ? 'var(--red-dim)'
            : 'var(--surface3)',
          border: em_foco
        ? '2px solid var(--blue)'
        : `1px solid ${status === 'ok' ? 'var(--green)' : status === 'aviso' ? 'var(--amber)' : status === 'erro' || status === 'invalido' ? 'var(--red)' : 'var(--border)'}`,
      boxShadow: em_foco ? '0 0 0 3px var(--blue-dim)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, letterSpacing: '.03em',
          color: status === 'ok' ? 'var(--green)' : status === 'aviso' ? 'var(--amber)'
            : status === 'erro' || status === 'invalido' ? 'var(--red)' : 'var(--text4)',
        }}>
          {execucao.bloqueado && '🔒 '}
          {vm.status_label}
        </div>

        {/* Número + descrição editável */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
              {vm.numero}
            </span>
            <input
              value={vm.descricao}
              onClick={e => e.stopPropagation()}
              onChange={e => onUpdate(raw.id, 'descricao', e.target.value)}
              style={{
                border: 'none', background: 'transparent', outline: 'none',
                fontSize: 12, fontWeight: 500, color: 'var(--text)',
                fontFamily: 'var(--font)', flex: 1, minWidth: 0,
              }}
              placeholder="Descrição do circuito"
            />
          </div>

          {/* Composição analítica — sempre visível no card fechado */}
          {composicao.tem_granular ? (
            <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--text3)' }}>{composicao.composicao}</span>
              <span style={{ color: 'var(--blue)', fontWeight: 700, marginLeft: 5 }}>
                = {composicao.va_dim}VA
              </span>
              {composicao.w_real > 0 && (
                <span style={{ color: 'var(--text4)', marginLeft: 5 }}>({composicao.w_real}W real)</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {vm.resumo}
              {/* Indicador de conformidade de proteção */}
              {vm.resultado?.comprimento_max_m != null && (
                <div style={{
                  fontSize: 9, marginTop: 2,
                  color: (vm.resultado.comprimento_max_m >= vm.comprimento_m)
                    ? 'var(--text4)' : 'var(--red)',
                  fontWeight: (vm.resultado.comprimento_max_m >= vm.comprimento_m) ? 'normal' : '700',
                }}>
                  {(vm.resultado.comprimento_max_m >= vm.comprimento_m)
                    ? `✓ Proteção OK — limite ${vm.resultado.comprimento_max_m.toFixed(0)}m`
                    : `⚠ Comprimento excede limite de ${vm.resultado.comprimento_max_m.toFixed(0)}m`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fase badge */}
        <span style={{
          display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0,
        }}>
          <span style={{
            padding: '2px 6px', borderRadius: 3,
            background: 'var(--surface3)', color: 'var(--text4)',
            fontSize: 8.5, fontFamily: 'var(--mono)',
          }}>
            {raw.ligacao === 'bifasica' ? '2φ' : raw.ligacao === 'trifasica' ? '3φ' : '1φ'}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 3,
            background: 'var(--blue-dim)', color: 'var(--blue)',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
          }}>{vm.fase}</span>
        </span>

        <button
          onClick={e => { e.stopPropagation(); onRemove(raw.id) }}
          style={{ background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
        >×</button>
      </div>

      {/* ── Corpo expandido ────────────────────────────────────────── */}
      {expanded && (
        <div style={{ borderTop: `1px solid var(--border)`, padding: 12 }}>

          {/* Parâmetros editáveis */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 70px', gap: 8, marginBottom: 10 }}>
            <div className="fgroup">
              <label className="flabel">Tipo</label>
              <select className="fselect" value={vm.params.tipo}
                onChange={e => {
                  const tipo = e.target.value
                  const lig  = inferirLigacao(tipo, vm.params.potencia_va)
                  const fase = faseDefault(lig, projeto.sistema)
                  onUpdateBatch(raw.id, { tipo, ligacao: lig, fase })
                }}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="fgroup">
              <label className="flabel">Ligação</label>
              <select className="fselect"
                value={raw.ligacao ?? inferirLigacao(vm.params.tipo, vm.params.potencia_va)}
                onChange={e => {
                  const lig = e.target.value as TipoLigacao
                  const novaFase = faseDefault(lig, projeto.sistema)
                  onUpdateBatch(raw.id, { ligacao: lig, fase: novaFase })
                }}>
                <option value="monofasica">Monofásico — 1 fase</option>
                {projeto.sistema !== 'Monofasico' && <option value="bifasica">Bifásico — 2 fases</option>}
                {projeto.sistema === 'Trifasico' && <option value="trifasica">Trifásico — 3 fases</option>}
              </select>
            </div>
            <div className="fgroup">
              <label className="flabel">Fase</label>
              <select className="fselect" value={vm.params.fase}
                onChange={e => onUpdate(raw.id, 'fase', e.target.value)}>
                {fasesParaTipo(
                  raw.ligacao ?? inferirLigacao(vm.params.tipo, vm.params.potencia_va),
                  projeto.sistema
                ).map((f: string) => {
                  const labels: Record<string, string> = {
                    R: 'R — Fase 1', S: 'S — Fase 2', T: 'T — Fase 3',
                    RS: 'R+S — Fases 1+2', ST: 'S+T — Fases 2+3', RT: 'R+T — Fases 1+3',
                    RST: 'R+S+T — Trifásico',
                  }
                  return <option key={f} value={f}>{labels[f] ?? f}</option>
                })}
              </select>
            </div>
            <div className="fgroup">
              <label className="flabel">Comp. (m)</label>
              <input className="finput" type="number"
                value={vm.params.comprimento_m || ''}
                min={0} step={1}
                onChange={e => onUpdate(raw.id, 'comprimento_m', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="fgroup">
              <label className="flabel">VA dim.</label>
              <input className="finput" type="number"
                value={vm.params.potencia_va || ''}
                min={0} step={50}
                onChange={e => {
                  const va = parseFloat(e.target.value) || 0
                  if (vm.params.tipo === 'TUE') {
                    const lig  = inferirLigacao('TUE', va)
                    const fase = faseDefault(lig, projeto.sistema)
                    onUpdateBatch(raw.id, { potencia_va: va, ligacao: lig, fase })
                  } else {
                    onUpdate(raw.id, 'potencia_va', va)
                  }
                }} />
            </div>
            <div className="fgroup">
              <label className="flabel">Agrup.</label>
              <input className="finput" type="number"
                value={vm.params.n_agrup}
                min={1} max={20}
                onChange={e => onUpdate(raw.id, 'n_agrup', parseInt(e.target.value) || 1)} />
            </div>
          </div>

          {/* Composição granular — sempre visível quando expandido */}
          <div style={{
            marginBottom: 10, border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--surface2)', overflow: 'hidden',
          }}>
            <div
              style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
              onClick={() => setShowEditor(!showEditor)}
            >
              <span style={{ fontSize: 9, color: 'var(--text4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                COMPOSIÇÃO
              </span>
              {composicao.tem_granular ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    {composicao.composicao}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700, marginLeft: 6 }}>
                    = {composicao.va_dim}VA dim.
                  </span>
                  {composicao.w_real > 0 && (
                    <span style={{ fontSize: 9.5, color: 'var(--text4)', marginLeft: 6 }}>
                      · {composicao.w_real}W real · ×{composicao.fator_medio.toFixed(2)}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text4)', fontStyle: 'italic' }}>
                  VA declarado diretamente · ▼ adicionar itens
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--blue)', flexShrink: 0 }}>
                {showEditor ? '▲' : '▼ editar'}
              </span>
            </div>

            {showEditor && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                {/* Lista de itens */}
                {(raw.lampadas ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                    {(raw.lampadas ?? []).map((l: any) => {
                      const fator = vm.tipo === 'ILUM' ? 1.25 : 1.0
                      const va = Math.round((l.pot_dim_w ?? l.pot_w * fator))
                      return (
                        <div key={l.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '3px 7px', background: 'var(--surface)',
                          borderRadius: 3, border: '1px solid var(--border)', fontSize: 10.5,
                        }}>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700, minWidth: 24 }}>{l.qtd}×</span>
                          <span style={{ flex: 1 }}>{l.descricao}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text4)', fontSize: 9.5 }}>
                            {l.pot_w}W · {va}VA
                          </span>
                          <button onClick={() => removerItem(l.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                        </div>
                      )
                    })}
                    <div style={{ padding: '3px 7px', fontSize: 10.5, fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'flex-end', gap: 12, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--blue)', fontWeight: 700 }}>Σ = {composicao.va_dim}VA dim.</span>
                      {composicao.w_real > 0 && <span>{composicao.w_real}W real</span>}
                    </div>
                    {/* Fator de dimensionamento — explicado */}
                    <div style={{ fontSize: 8.5, color: 'var(--text4)', padding: '2px 7px', fontFamily: 'var(--mono)' }}>
                      {composicao.fator_info}
                    </div>
                  </div>
                )}
                {/* Formulário de adição */}
                <div style={{ display: 'grid', gridTemplateColumns: '50px 70px 1fr auto', gap: 5, alignItems: 'end' }}>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 8.5 }}>Qtd</label>
                    <input className="finput" type="number" value={novaQtd} min={1}
                      style={{ height: 26, fontSize: 11 }} onChange={e => setNovaQtd(parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 8.5 }}>{vm.tipo === 'ILUM' ? 'W' : 'VA'}</label>
                    <input className="finput" type="number" value={novaPot} min={1}
                      style={{ height: 26, fontSize: 11 }} onChange={e => setNovaPot(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 8.5 }}>Descrição</label>
                    <input className="finput" value={novaDesc}
                      style={{ height: 26, fontSize: 11 }}
                      placeholder={vm.tipo === 'ILUM' ? 'LED 9W...' : 'Tomada 2P+T...'}
                      onChange={e => setNovaDesc(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && adicionarItem()} />
                  </div>
                  <button className="btn primary" style={{ height: 26, padding: '0 10px' }} onClick={adicionarItem}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* Resultado do pipeline — via ViewModel */}
          {resultado && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { t: 'Corrente', v: resultado.ib_str, d: `${resultado.tensao_v}V · ${resultado.sistema}`, c: 'var(--blue)' },
                { t: 'Fatores', v: `Ft=${resultado.ft.toFixed(2)} · Fa=${resultado.fa.toFixed(2)}`, d: `Irc=${resultado.irc.toFixed(1)}A`, c: 'var(--text3)' },
                { t: 'Seção final', v: resultado.secao_str,
                  d: resultado.n_iteracoes > 1 ? `${resultado.n_iteracoes} iter. — cresceu para ΔV` : `Iz'=${resultado.iz_efetiva.toFixed(1)}A`,
                  c: resultado.n_iteracoes > 1 ? 'var(--amber)' : 'var(--green)' },
                { t: 'Proteção', v: `${resultado.in_disj}A curva ${resultado.curva}${resultado.idr ? ' + IDR' : ''}`, d: ``, c: 'var(--purple)' },
              ].map(({ t, v, d, c }) => (
                <div key={t} style={{ padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{t}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: 'var(--mono)' }}>{v}</div>
                  {d && <div style={{ fontSize: 9.5, color: 'var(--text4)', marginTop: 2, fontFamily: 'var(--mono)' }}>{d}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Barra de queda de tensão */}
          {resultado && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text4)', marginBottom: 3 }}>
                <span>Queda de tensão</span>
                <span style={{ fontFamily: 'var(--mono)', color: resultado.du_ok ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {resultado.du_str} / {resultado.du_limite}%
                </span>
              </div>
              <div style={{ height: 7, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(resultado.du_pct / resultado.du_limite * 100, 100)}%`,
                  height: '100%', borderRadius: 4, transition: 'width .3s',
                  background: resultado.du_ok ? 'var(--green)' : 'var(--red)',
                }} />
              </div>
            </div>
          )}

          {/* Diagnóstico de estágio quando não total */}
          {execucao.confianca !== 'total' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 9, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>Estágios:</span>
              {execucao.estagios.map(est => (
                <span key={est.nome} style={{
                  fontSize: 8.5, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: 2,
                  background: est.status === 'concluido' ? 'var(--green-dim)' : est.status === 'invalido' ? 'var(--red-dim)' : 'var(--surface3)',
                  color: est.status === 'concluido' ? 'var(--green)' : est.status === 'invalido' ? 'var(--red)' : 'var(--text4)',
                  border: `1px solid ${est.status === 'concluido' ? 'var(--green)' : est.status === 'invalido' ? 'var(--red)' : 'var(--border)'}`,
                }}>
                  {est.nome}: {est.icone}
                </span>
              ))}
            </div>
          )}

          {/* Violações — com título, mensagem e ação */}
          {/* ── Hierarquia de prioridade visual ──────────────────── */}
          {vm.resultado && (() => {
            const r = vm.resultado
            const itens: { nivel: 'critico'|'erro'|'aviso'|'ok'; texto: string; detalhe?: string }[] = []

            // CRÍTICO: proteção não funciona no pior caso
            if (r.comprimento_max_m != null && r.comprimento_max_m < vm.comprimento_m) {
              itens.push({ nivel:'critico',
                texto: `⛔ Proteção pode NÃO atuar — circuito ${vm.comprimento_m}m > limite ${r.comprimento_max_m.toFixed(0)}m`,
                detalhe: 'Aumentar seção ou reduzir comprimento' })
            } else if (r.comprimento_max_m != null) {
              itens.push({ nivel:'ok',
                texto: `✓ Proteção funcional — limite ${r.comprimento_max_m.toFixed(0)}m (circuito ${vm.comprimento_m}m)` })
            }

            // AVISO: curva inadequada para o tipo de carga
            if (r.curva_adequada === false && r.justificativa_curva) {
              itens.push({ nivel:'aviso',
                texto: `⚠ Curva ${r.curva} — verificar adequação`,
                detalhe: r.justificativa_curva })
            }

            const cores: Record<string, string> = {
              critico: 'var(--red)', erro: 'var(--red)', aviso: 'var(--amber)', ok: 'var(--green)'
            }
            const fundos: Record<string, string> = {
              critico: 'var(--red-dim)', erro: 'var(--red-dim)', aviso: 'var(--amber-dim)', ok: 'transparent'
            }

            return itens.filter(i => i.nivel !== 'ok' || i === itens[0]).map((item, idx) => (
              <div key={idx} style={{
                margin: '4px 0', padding: '4px 6px', borderRadius: 4,
                background: fundos[item.nivel],
                borderLeft: `3px solid ${cores[item.nivel]}`,
                fontSize: 10, color: cores[item.nivel],
              }}>
                <div style={{ fontWeight: item.nivel === 'critico' ? 700 : 500 }}>{item.texto}</div>
                {item.detalhe && <div style={{ opacity: 0.8, marginTop: 2 }}>{item.detalhe}</div>}
              </div>
            ))
          })()}

          {/* ── Sugestões de correção ──────────────────────────── */}
          {vm.sugestoes_correcao.length > 0 && (
            <div style={{ margin: '4px 0', padding: '6px 8px', borderRadius: 4,
              background: 'var(--blue-dim)', borderLeft: '3px solid var(--blue)', fontSize: 10 }}>
              <div style={{ fontWeight: 600, color: 'var(--blue)', marginBottom: 4 }}>
                💡 Opções para corrigir:
              </div>
              {vm.sugestoes_correcao.slice(0,3).map((op, i) => (
                <div key={i} style={{ marginBottom: 2, color: 'var(--text2)' }}>
                  • {op.descricao}
                  <span style={{ color: 'var(--text4)', marginLeft: 4 }}>
                    [{op.custo_relativo} · {op.complexidade}]
                  </span>
                </div>
              ))}
            </div>
          )}

          {violacoes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {violacoes.map((v: ViolacaoVM) => (
                <div key={v.codigo} style={{
                  padding: '8px 12px', borderRadius: 4, fontSize: 11,
                  background: v.severidade === 'fisico' ? 'var(--red-dim)' : v.severidade === 'normativo' ? 'var(--red-dim)' : 'var(--amber-dim)',
                  border: `1px solid ${v.severidade !== 'aviso' ? 'var(--red)' : 'var(--amber)'}`,
                }}>
                  <div style={{ fontWeight: 600, color: v.severidade !== 'aviso' ? 'var(--red)' : 'var(--amber)', marginBottom: 3 }}>
                    {v.severidade === 'fisico' ? '⛔' : v.severidade === 'normativo' ? '✗' : '⚠'} {v.titulo}
                  </div>
                  <div style={{ color: 'var(--text3)', lineHeight: 1.5, marginBottom: 4 }}>{v.acao}</div>
                  <div style={{ fontSize: 9, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>
                    {v.norma} · {v.mensagem}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rastreabilidade sob demanda */}
          {pipeline && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn ghost" style={{ height: 24, fontSize: 10 }}
                onClick={() => setShowTrace(!showTrace)}>
                {showTrace ? '▲ Ocultar raciocínio' : '▼ Ver raciocínio completo'}
              </button>
            </div>
          )}

          {showTrace && pipeline && (
            <pre style={{
              marginTop: 8, padding: '10px 12px', background: 'var(--surface3)',
              border: '1px solid var(--border)', borderRadius: 4,
              fontSize: 9.5, color: 'var(--text3)', fontFamily: 'var(--mono)',
              overflow: 'auto', maxHeight: 320, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {formatarTrace(pipeline.trace)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export function Circuitos() {
  const { circuitos_raw, updateCircuito, updateCircuitoBatch, removeCircuito, addCircuito, setPagina, projeto } = useProjectStore()
  const [expandido, setExpandido] = useState<string | null>(null)
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Construir o pipeline map ──────────────────────────────────────
  const pipelineMap = new Map<string, CircuitoPipelined>()
  circuitos_raw.filter(r => r.tipo !== 'RESERVA').forEach(raw => {
    if ((raw.potencia_va ?? 0) > 0) {
      try {
        pipelineMap.set(raw.id, resolverCircuito({
          id: raw.id, descricao: raw.descricao, tipo: raw.tipo,
          fase: raw.fase, potencia_va: raw.potencia_va,
          potencia_real_w: raw.potencia_real_w,
          comprimento_m: raw.comprimento_m ?? 0,
          n_agrup: raw.n_agrup ?? 1,
          v_fase: projeto.v_fase,
          metodo: projeto.metodo_instalacao,
          isolacao: projeto.isolacao as any,
          material: projeto.material_cabo as any,
          t_amb: projeto.t_amb,
          du_max_pct: projeto.du_max_pct,
          du_ramal_pct: projeto.du_ramal_pct,
          icc_rede_ka: projeto.icc_rede_ka,
        }))
      } catch { /* circuito inválido */ }
    }
  })

  // ── Construir ViewModels via adapter layer ────────────────────────
  const viewModels = buildAllViewModels(
    circuitos_raw.filter(r => r.tipo !== 'RESERVA'),
    pipelineMap,
    projeto.du_max_pct
  )

  // Debounce para campos de texto e numéricos simples
  function debounce(id: string, field: string, value: any) {
    clearTimeout(timerRef.current[id + field])
    timerRef.current[id + field] = setTimeout(() => {
      updateCircuito(id, { [field]: value } as any)
    }, 300)
  }

  // KPIs via ViewModels
  const n_ok    = viewModels.filter(vm => vm.status === 'ok').length
  const n_aviso = viewModels.filter(vm => vm.status === 'aviso').length
  const n_erro  = viewModels.filter(vm => vm.status === 'erro' || vm.status === 'invalido').length
  const n_idr   = viewModels.filter(vm => vm.resultado?.idr).length
  const iq      = viewModels.length > 0 ? Math.round(n_ok / viewModels.length * 100) : 0
  const total_va = viewModels.reduce((s, vm) => s + vm.composicao.va_dim, 0)
  const total_w  = viewModels.reduce((s, vm) => s + vm.composicao.w_real, 0)

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Dimensionamento de Circuitos</div>
        <div className="page-sub">
          Passo 3 de 6 · Cada circuito dimensionado, validado e explicado automaticamente
        </div>
      </div>
      <div className="page-actions">
        <button className="btn" onClick={() => addCircuito({
          descricao: `Circuito ${circuitos_raw.filter(r => r.tipo !== 'RESERVA').length + 1}`,
          tipo: 'TUG', fase: 'R', potencia_va: 0,
          comprimento_m: 15, n_agrup: 1,
        })}>
          + Circuito
        </button>
        <button className="btn primary" onClick={() => setPagina('balanceamento')} disabled={viewModels.length === 0}>
          Balancear fases →
        </button>
      </div>
    </div>

    {/* KPIs */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
      <div className={`kpi ${iq === 100 ? 'ok' : iq >= 75 ? 'warn' : 'err'}`}>
        <div className="kpi-lbl">Qualidade</div>
        <div className="kpi-val">{iq}%</div>
        <div className="kpi-unit">{n_ok}/{viewModels.length} OK</div>
        <div className="kpi-bar"><div className="kpi-fill" style={{ width: `${iq}%` }} /></div>
      </div>
      <div className={`kpi ${n_erro > 0 ? 'err' : ''}`}>
        <div className="kpi-lbl">Erros</div>
        <div className="kpi-val">{n_erro}</div>
        <div className="kpi-unit">{n_erro > 0 ? 'revisar agora' : 'nenhum'}</div>
      </div>
      <div className={`kpi ${n_aviso > 0 ? 'warn' : ''}`}>
        <div className="kpi-lbl">Avisos</div>
        <div className="kpi-val">{n_aviso}</div>
        <div className="kpi-unit">{n_aviso > 0 ? 'verificar' : 'nenhum'}</div>
      </div>
      <div className="kpi ok">
        <div className="kpi-lbl">Conformes</div>
        <div className="kpi-val">{n_ok}</div>
        <div className="kpi-unit">circuitos OK</div>
      </div>
      <div className="kpi info">
        <div className="kpi-lbl">Com IDR</div>
        <div className="kpi-val">{n_idr}</div>
        <div className="kpi-unit">30mA obrigatório</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Instalado</div>
        <div className="kpi-val">{(total_va/1000).toFixed(1)}</div>
        <div className="kpi-unit">kVA dim · {total_w > 0 ? `${(total_w/1000).toFixed(1)}kW real` : '—'}</div>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Guia de ação */}
      {n_erro > 0 && (
        <div style={{
          padding: '10px 14px', background: 'var(--red-dim)',
          border: '1px solid var(--red)', borderRadius: 5, fontSize: 11,
        }}>
          <strong style={{ color: 'var(--red)' }}>
            {n_erro} circuito(s) com erro — resolva antes de continuar
          </strong>
          <div style={{ color: 'var(--text3)', marginTop: 4 }}>
            Clique em cada circuito marcado em vermelho para ver o problema e a ação recomendada.
          </div>
        </div>
      )}

      {viewModels.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text4)' }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⚡</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Nenhum circuito cadastrado</div>
          <div style={{ fontSize: 11, marginBottom: 16 }}>Gere a partir dos cômodos ou adicione manualmente.</div>
          <button className="btn primary" onClick={() => setPagina('comodos')}>← Voltar para cômodos</button>
        </div>
      )}

      {/* Cards ordenados por prioridade via ViewModel */}
      {viewModels.map(vm => {
        const raw = circuitos_raw.find(r => r.id === vm.id)
        if (!raw) return null
        return (
          <CircuitoCard
            key={vm.id}
            vm={vm}
            raw={raw}
            pipeline={pipelineMap.get(vm.id)}
            expanded={expandido === vm.id}
            onToggle={() => setExpandido(expandido === vm.id ? null : vm.id)}
            onUpdate={debounce}
            onUpdateBatch={updateCircuitoBatch}
            onRemove={removeCircuito}
            projeto={projeto}
          />
        )
      })}

      {viewModels.length > 0 && n_erro === 0 && n_aviso === 0 && (
        <div style={{
          padding: '10px 14px', background: 'var(--green-dim)',
          border: '1px solid var(--green)', borderRadius: 5, fontSize: 11, color: 'var(--green)',
        }}>
          <strong>✓ Todos os circuitos conformes com a NBR 5410</strong>
          <button className="btn success" style={{ marginLeft: 12, height: 24, fontSize: 10 }}
            onClick={() => setPagina('balanceamento')}>
            Balancear fases →
          </button>
        </div>
      )}

    </div>
    </div>
  </>)
}
