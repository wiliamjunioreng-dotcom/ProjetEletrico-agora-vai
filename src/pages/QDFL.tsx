import { abrirPrancha as abrirPranchaInternal } from '../core/pranchaExport'
// src/pages/QDFL.tsx

import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import {
  exportarQDFL_XLSX, exportarQDFL_CSV, exportarMemorial,
  exportarQDFL_Python, isServerMode
} from '../core/exporters'

export function QDFL() {
  const { circuitos_calc, circuitos_raw, demanda, projeto, salvarJSON, setPagina } = useProjectStore()
  const ci = circuitos_calc.filter(c => c.potencia_va > 0)
  const erros_bloqueantes = ci.filter(circ => circ.status === 'ERRO').length
  const incompletos = circuitos_raw.filter(r => r.tipo !== 'RESERVA' && (r.potencia_va ?? 0) > 0 && (!r.comprimento_m || r.comprimento_m <= 0)).length
  const [exportando, setExportando] = useState(false)
  const [msg, setMsg]               = useState<{txt:string; tipo:'ok'|'err'|'info'} | null>(null)

  const n_ok  = ci.filter(c => c.status === 'OK').length
  const n_err = ci.filter(c => c.status === 'ERRO').length

  function mostrarMsg(txt: string, tipo: 'ok'|'err'|'info') {
    setMsg({ txt, tipo })
    setTimeout(() => setMsg(null), 5000)
  }

  function validarParaExportacao(): boolean {
    const erros = ci.filter(c => c.status === 'ERRO')
    const semDados = ci.filter(c => !c.potencia_va || c.potencia_va === 0)
    const msgs: string[] = []
    if (erros.length > 0) msgs.push(`${erros.length} circuito(s) com ERRO normativo`)
    if (semDados.length > 0) msgs.push(semDados.length + ' circuito(s) sem potencia definida')
    if (msgs.length > 0) {
      return confirm('Atencao antes de exportar:\n\n' + msgs.join('\n') + '\n\nDeseja exportar mesmo assim?')
    }
    return true
  }

  async function handleXLS() {
    if (exportando) return
    if (!validarParaExportacao()) return
    setExportando(true)
    try {
      // Tentar via Python (server mode) — gera Excel idêntico ao modelo
      if (isServerMode()) {
        const r = await exportarQDFL_Python(projeto, circuitos_calc, demanda)
        if (r.ok) {
          mostrarMsg(`Excel salvo em: ${r.path}`, 'ok')
          return
        }
        // Fallback para XML se Python falhar
        console.warn('Python export falhou, usando XML:', r.error)
      }
      // Fallback: XML do Excel 2003
      exportarQDFL_XLSX(projeto as any, circuitos_calc, demanda)
      mostrarMsg('Excel baixado (formato XML — abre no Excel/LibreOffice)', 'ok')
    } catch (e) {
      mostrarMsg('Erro ao exportar: ' + String(e), 'err')
    } finally {
      setExportando(false)
    }
  }

  // eslint-disable-next-line
  function handlePrancha() {
    abrirPranchaInternal({
      projeto_nome: projeto.nome || 'Sem nome',
      projetista: (projeto as any).projetista || '—',
      crea: (projeto as any).crea || '—',
      data: new Date().toLocaleDateString('pt-BR'),
      endereco: (projeto as any).endereco || '',
      circuitos: (circuitos_calc as any[]).map(cc => ({
        id: cc.id, descricao: cc.descricao || '', tipo: cc.tipo || '',
        potencia_va: cc.potencia_va || 0,
        secao_fase: cc.resultado?.secao_mm2 ?? 0,
        in_disj: cc.resultado?.in_disj ?? 0,
        curva: cc.resultado?.curva ?? '?',
        idr: cc.resultado?.idr ?? false,
        du_pct: cc.resultado?.du_pct ?? 0,
        fase: String(cc.fase ?? 'RS'),
        status: cc.resultado?.status ?? '?',
      })),
      demanda: demanda ?? undefined,
    })
  }

  function handleCSV() {
    exportarQDFL_CSV(projeto as any, circuitos_calc)
    mostrarMsg('CSV baixado — abra no Excel (separador ;)', 'ok')
  }

  function handleMemorial() {
    exportarMemorial(projeto as any, circuitos_calc, demanda)
    mostrarMsg('Memorial aberto em nova aba — use Ctrl+P para salvar como PDF', 'info')
  }

  function handleSalvar() {
    const json = salvarJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `${(projeto.nome || 'projeto').replace(/\s+/g,'_')}.projelec`
    a.click()
    URL.revokeObjectURL(a.href)
    mostrarMsg('Projeto salvo como .projelec', 'ok')
  }

  return (<>
    {/* Banner de validação pré-exportação */}
    {(erros_bloqueantes > 0 || incompletos > 0) && (
      <div style={{
        padding: '8px 14px', flexShrink: 0,
        background: erros_bloqueantes > 0 ? 'var(--red-dim)' : 'var(--amber-dim)',
        borderBottom: `1px solid ${erros_bloqueantes > 0 ? 'var(--red)' : 'var(--amber)'}`,
        fontSize: 11, display: 'flex', gap: 12, alignItems: 'center',
      }}>
        <span style={{ color: erros_bloqueantes > 0 ? 'var(--red)' : 'var(--amber)', fontWeight: 600 }}>
          {erros_bloqueantes > 0
            ? `⛔ ${erros_bloqueantes} circuito(s) com erro técnico — exportação pode conter inconsistências`
            : `⚠ ${incompletos} circuito(s) sem comprimento definido — queda de tensão não calculada`}
        </span>
        {erros_bloqueantes > 0 && (
          <button className="btn" style={{ height: 22, fontSize: 10 }}
            onClick={() => setPagina('circuitos')}>
            Ir para Circuitos →
          </button>
        )}
      </div>
    )}
    <div className="page-header">
      <div>
        <div className="page-title">Quadro de Distribuição QDFL</div>
        <div className="page-sub">
          Passo 6 de 6 — Exportar Excel (modelo NBR 5410), CSV ou Memorial para PDF
        </div>
      </div>
      <div className="page-actions">
        {msg && (
          <div style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 6,
            background: msg.tipo==='ok' ? 'var(--green-dim)'
                      : msg.tipo==='err' ? 'var(--red-dim)' : 'var(--blue-dim)',
            border: `1px solid ${msg.tipo==='ok' ? 'var(--green)' : msg.tipo==='err' ? 'var(--red)' : 'var(--blue)'}`,
            color: msg.tipo==='ok' ? 'var(--green)' : msg.tipo==='err' ? 'var(--red)' : 'var(--blue)',
            maxWidth: 360,
          }}>
            {msg.txt}
          </div>
        )}
        <button className="btn" style={{ background:'var(--blue)', color:'white', fontWeight:600 }} onClick={handlePrancha}>
          📋 Prancha PDF
        </button>
        <button className="btn" onClick={handleSalvar}>
          💾 .projelec
        </button>
        <button className="btn" onClick={handleCSV}>
          📊 CSV
        </button>
        <button className="btn primary" onClick={handleXLS} disabled={exportando}>
          {exportando ? '⏳ Gerando...' : '📗 Excel'}
        </button>
        <button className="btn success" onClick={handleMemorial}>
          📄 Memorial PDF
        </button>
      </div>
    </div>

    {/* KPIs */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className="kpi">
        <div className="kpi-lbl">CI instalada</div>
        <div className="kpi-val">{demanda?.ci_kw.toFixed(2) ?? '0.00'}</div>
        <div className="kpi-unit">kW</div>
      </div>
      <div className="kpi warn">
        <div className="kpi-lbl">Demanda CEMIG</div>
        <div className="kpi-val">{demanda?.dem_kw.toFixed(2) ?? '0.00'}</div>
        <div className="kpi-unit">kW · FD {demanda ? Math.round(demanda.fd*100) : 0}%</div>
      </div>
      <div className="kpi info">
        <div className="kpi-lbl">Disjuntor geral</div>
        <div className="kpi-val">{demanda?.in_geral ?? 0} A</div>
        <div className="kpi-unit">{demanda?.tipo_ligacao_cemig ?? '—'} CEMIG</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">QD</div>
        <div className="kpi-val">{demanda?.n_total_qd ?? 0}</div>
        <div className="kpi-unit">{demanda?.n_ativos ?? 0} + {demanda?.n_reservas ?? 0} reservas</div>
      </div>
      <div className={`kpi ${n_err===0 ? 'ok' : 'err'}`}>
        <div className="kpi-lbl">Conformidade</div>
        <div className="kpi-val">{ci.length > 0 ? Math.round(n_ok/ci.length*100) : 0}%</div>
        <div className="kpi-unit">{n_ok}/{ci.length} OK</div>
      </div>
    </div>

    {n_err > 0 && (
      <div style={{
        margin: '0 22px 8px', padding: '10px 14px',
        background: 'var(--red-dim)', border: '1px solid var(--red)',
        borderRadius: 8, fontSize: 12, color: 'var(--red)',
      }}>
        ⚠ <strong>{n_err} circuito(s) com violação normativa</strong> — revise antes de exportar.
      </div>
    )}

    {/* Tabela QDFL — formato fiel ao modelo Excel */}
    <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 16px' }}>
      <table className="dtable" style={{
        border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
      }}>
        <thead>
          <tr style={{ background: '#1b2a3b' }}>
            <th style={{ width:32,  color:'#fff', background:'#1b2a3b' }}>N°</th>
            <th style={{ minWidth:200, color:'#fff', background:'#1b2a3b', textAlign:'left' }}>Descrição</th>
            <th style={{ width:52,  color:'#fff', background:'#1b2a3b' }}>Tipo</th>
            <th style={{ width:42,  color:'#fff', background:'#1b2a3b' }}>Fase</th>
            <th className="r" style={{ width:60,  color:'#fff', background:'#1b2a3b' }}>Pot.Dim (VA)</th>
            <th className="r" style={{ width:60,  color:'#fff', background:'#0f6e56' }}>Pot.Real (W)</th>
            <th className="r" style={{ width:44,  color:'#fff', background:'#1b2a3b' }}>V</th>
            <th className="r" style={{ width:52,  color:'#fff', background:'#1b2a3b' }}>Ib (A)</th>
            <th style={{ width:46,  color:'#fff', background:'#2f5496' }}>In (A)</th>
            <th style={{ width:36,  color:'#fff', background:'#2f5496' }}>Curva</th>
            <th style={{ width:50,  color:'#fff', background:'#2f5496' }}>DR</th>
            <th style={{ width:36,  color:'#fff', background:'#1e5c36' }}>Método</th>
            <th className="r" style={{ width:56,  color:'#fff', background:'#1e5c36' }}>Fase mm²</th>
            <th className="r" style={{ width:50,  color:'#fff', background:'#1e5c36' }}>PE mm²</th>
            <th className="r" style={{ width:44,  color:'#fff', background:'#375623' }}>Fa</th>
            <th className="r" style={{ width:44,  color:'#fff', background:'#375623' }}>Ft</th>
            <th className="r" style={{ width:52,  color:'#fff', background:'#375623' }}>Iz nom.</th>
            <th className="r" style={{ width:52,  color:'#fff', background:'#375623' }}>Iz real</th>
            <th className="r" style={{ width:52,  color:'#fff', background:'#7030a0' }}>dU%</th>
            <th style={{ width:60,  color:'#fff', background:'#1b2a3b' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {ci.length === 0 ? (
            <tr>
              <td colSpan={20} style={{ textAlign:'center', padding:32, color:'var(--text4)' }}>
                Nenhum circuito dimensionado.
              </td>
            </tr>
          ) : ci.map((c, i) => {
            const tc  = c.tipo==='ILUM' ? 'ilum' : c.tipo==='TUG' ? 'tug' : 'tue'
            const du  = c.du_calc ?? 0
            const dc  = du<=3.5 ? '#c6efce' : du<=4 ? '#ffeb9c' : '#ffc7ce'
            const sc  = c.status==='OK' ? 'c-ok' : c.status==='LIMITE' ? 'c-warn' : 'c-err'
            const bgRow = c.status==='ERRO' ? '#fff5f5'
                        : c.status==='LIMITE' ? '#fffbf0'
                        : i%2===0 ? '#f0f7fd' : '#ffffff'
            const izBg = (c.iz_efetiva??0) >= c.ib ? '#c6efce' : '#ffc7ce'

            return (
              <tr key={c.id}>
                <td className="mono c-dim" style={{textAlign:'center', background:bgRow}}>
                  {String(i+1).padStart(2,'0')}
                </td>
                <td className="name" style={{background:bgRow}}>{c.descricao.slice(0,55)}</td>
                <td style={{background:bgRow, textAlign:'center'}}>
                  <span className={`badge ${tc}`}>{c.tipo}</span>
                </td>
                <td className="mono" style={{textAlign:'center', background:bgRow, fontWeight:600,
                  color: c.fase.length===1 ? 'var(--green)' : 'var(--amber)'}}>
                  {c.fase}
                </td>
                <td className="mono r" style={{background:bgRow, fontWeight:600}}>{c.potencia_va.toLocaleString()}</td>
                <td className="mono r" style={{
                  background: (c as any).potencia_real_w ? '#e6f4ea' : bgRow,
                  color: (c as any).potencia_real_w ? '#0f6e56' : 'var(--text4)',
                  fontWeight: 600,
                }}>
                  {(c as any).potencia_real_w ? `${(c as any).potencia_real_w}W` : '—'}
                </td>
                <td className="mono r" style={{background:bgRow}}>{c.tensao_v.toFixed(0)}V</td>
                <td className="mono r" style={{background:bgRow, fontWeight:600}}>
                  {c.ib.toFixed(2)}
                </td>
                <td className="mono" style={{textAlign:'center', background:bgRow, fontWeight:600}}>
                  {c.in_disj > 0 ? `${c.in_disj}A` : '—'}
                </td>
                <td className="mono" style={{textAlign:'center', background:bgRow}}>
                  {c.curva}
                </td>
                <td style={{textAlign:'center', background:bgRow}}>
                  {c.idr ? <span className="badge idr">30mA</span> : <span className="c-dim">—</span>}
                </td>
                <td className="mono" style={{textAlign:'center', background:bgRow, fontSize:10}}>
                  {(projeto as any).metodo_instalacao}
                </td>
                <td className="mono r" style={{
                  background: c.secao_fase > 0 ? '#c6efce' : bgRow, fontWeight:600}}>
                  {c.secao_fase > 0 ? `${c.secao_fase} mm²` : '—'}
                </td>
                <td className="mono r" style={{background:bgRow}}>
                  {c.secao_pe > 0 ? `${c.secao_pe} mm²` : '—'}
                </td>
                <td className="mono r" style={{background:bgRow}}>{c.fa.toFixed(3)}</td>
                <td className="mono r" style={{background:bgRow}}>{c.ft.toFixed(3)}</td>
                <td className="mono r" style={{background:bgRow}}>
                  {c.iz_nominal > 0 ? `${c.iz_nominal.toFixed(1)}A` : '—'}
                </td>
                <td className="mono r" style={{background: c.iz_efetiva > 0 ? izBg : bgRow, fontWeight:600}}>
                  {c.iz_efetiva > 0 ? `${c.iz_efetiva.toFixed(1)}A` : '—'}
                </td>
                <td className="mono r" style={{background: du > 0 ? dc : bgRow, fontWeight:600}}>
                  {du > 0 ? `${du.toFixed(2)}%` : '—'}
                </td>
                <td><span className={sc}>{c.status}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Rodapé com resumo fiel ao modelo */}
      {demanda && (
        <div style={{
          marginTop: 12,
          display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8,
        }}>
          <div className="card">
            <div className="card-header" style={{background:'#1b2a3b', color:'#fff'}}>
              Resumo — Demanda e QD
            </div>
            <div style={{padding:'8px 14px'}}>
              <table style={{width:'100%', fontSize:12, borderCollapse:'collapse'}}>
                <tbody>
                  {[
                    ['Carga Instalada (CI)', `${demanda.ci_kw.toFixed(3)} kW`],
                    [`FD — CEMIG ND-5.1`, `${Math.round(demanda.fd*100)}%`],
                    ['Demanda máxima', `${demanda.dem_kw.toFixed(3)} kW`],
                    ['Corrente de demanda', `${demanda.i_dem.toFixed(2)} A`],
                    ['Disjuntor geral', `${demanda.in_geral} A — ${demanda.tipo_ligacao_cemig}`],
                    ['Ramal mínimo', `${demanda.ramal_min_mm2} mm²`],
                    ['QD total', `${demanda.n_total_qd} posições (${demanda.n_ativos}+${demanda.n_reservas}R)`],
                  ].map(([k,v]) => (
                    <tr key={k} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'4px 0',color:'var(--text3)',fontSize:11}}>{k}</td>
                      <td style={{padding:'4px 0',fontFamily:'monospace',fontWeight:600,textAlign:'right'}}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{background:'#1b2a3b', color:'#fff'}}>
              Parâmetros do projeto
            </div>
            <div style={{padding:'8px 14px'}}>
              <table style={{width:'100%', fontSize:12, borderCollapse:'collapse'}}>
                <tbody>
                  {[
                    ['Sistema', `${(projeto as any).sistema} ${(projeto as any).v_fase}/${(projeto as any).v_linha}V`],
                    ['Concessionária', (projeto as any).concessionaria],
                    ['Método instalação', (projeto as any).metodo_instalacao],
                    ['Isolação', `${(projeto as any).isolacao} 70°C`],
                    ['Temp. ambiente', `${(projeto as any).t_amb}°C`],
                    ['dU máximo', `${(projeto as any).du_max_pct}%`],
                    ['Aterramento', (projeto as any).aterramento],
                  ].map(([k,v]) => (
                    <tr key={k} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'4px 0',color:'var(--text3)',fontSize:11}}>{k}</td>
                      <td style={{padding:'4px 0',fontFamily:'monospace',fontWeight:600,textAlign:'right'}}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  </>)
}
