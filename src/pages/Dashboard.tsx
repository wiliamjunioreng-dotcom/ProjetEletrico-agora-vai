// src/pages/Dashboard.tsx — Dashboard com gráficos de fases e KPIs visuais
import { useProjectStore } from '../store/projectStore'

export function Dashboard() {
  const { projeto, circuitos_calc, demanda, setPagina, comodos } = useProjectStore()
  const ci = circuitos_calc.filter(c => c.potencia_va > 0)
  const n_ok   = ci.filter(c => c.status === 'OK').length
  const n_err  = ci.filter(c => c.status === 'ERRO').length
  const iq     = ci.length > 0 ? Math.round(n_ok / ci.length * 100) : 0
  const iq_cls = n_err > 0 ? 'err' : iq >= 90 ? 'ok' : 'warn'

  // Calcular cargas por fase para gráfico
  let fR = 0, fS = 0, fT = 0
  ci.forEach(c => {
    const va = c.potencia_va
    if      (c.fase === 'R')   fR += va
    else if (c.fase === 'S')   fS += va
    else if (c.fase === 'T')   fT += va
    else if (c.fase === 'RS')  { fR += va/2; fS += va/2 }
    else if (c.fase === 'ST')  { fS += va/2; fT += va/2 }
    else if (c.fase === 'RT')  { fR += va/2; fT += va/2 }
    else if (c.fase === 'RST') { fR += va/3; fS += va/3; fT += va/3 }
  })
  const fMax = Math.max(fR, fS, fT, 1)
  const deseq = fMax > 0
    ? Math.round((Math.max(fR,fS,fT) - Math.min(fR,fS,fT)) / (fR+fS+fT || 1) * 100)
    : 0

  // Gráfico de barras dU por circuito
  const duData = ci.slice(0, 12).map(c => ({
    nome: c.descricao.slice(0, 20),
    du:   c.du_calc || 0,
    status: c.status,
  }))
  const duMax = Math.max(...duData.map(d => d.du), 4.5)

  const passo = (projeto as any).nome === 'Novo Projeto' || !ci.length

  // ── Roteiro do projeto: detecta em que etapa o engenheiro está ──
  // Guia visual para o fluxo completo — especialmente útil para quem
  // está aprendendo ou usa o programa pela primeira vez.
  const p: any = projeto
  const etapas = [
    {
      id: 'projeto', label: '1. Dados do projeto', pagina: 'projeto',
      feito: !!p.nome && p.nome !== 'Novo Projeto' && !!p.projetista && !!p.crea,
      dica: 'Nome da obra, responsável técnico, CREA, tensão e concessionária',
    },
    {
      id: 'comodos', label: '2. Cômodos e cargas', pagina: 'comodos',
      feito: comodos.length > 0,
      dica: 'Cadastre os cômodos com área e perímetro — as cargas mínimas da NBR 5410 §9.5.2 são calculadas automaticamente',
    },
    {
      id: 'circuitos', label: '3. Circuitos', pagina: 'circuitos',
      feito: ci.length > 0,
      dica: 'Gere os circuitos a partir dos cômodos ou crie manualmente — seção, disjuntor e queda são dimensionados pela norma',
    },
    {
      id: 'auditoria', label: '4. Auditoria', pagina: 'auditoria',
      feito: ci.length > 0 && n_err === 0,
      dica: 'Revise as violações normativas e corrija com 1 clique — nada deve ficar vermelho antes de emitir',
    },
    {
      id: 'emissao', label: '5. Emissão', pagina: 'qdfl',
      feito: false,  // etapa final — sempre disponível como próximo destino
      dica: 'Exporte QDFL, memorial descritivo, prancha PDF e lista de materiais',
    },
  ]
  const etapa_atual = etapas.find(e => !e.feito) ?? etapas[etapas.length - 1]

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Painel do Projeto</div>
        <div className="page-sub">
          NBR 5410:2004+Em1:2008 · CEMIG ND-5.1 · {(projeto as any).sistema || 'Bifasico'} {(projeto as any).v_fase || 127}/{(projeto as any).v_linha || 220}V
        </div>
      </div>
      <div className="page-actions">
        {passo && (
          <button className="btn primary" onClick={() => setPagina('projeto')}>
            Iniciar projeto →
          </button>
        )}
        {!passo && (
          <>
            <button className="btn" onClick={() => setPagina('circuitos')}>+ Circuito</button>
            <button className="btn primary" onClick={() => setPagina('qdfl')}>Exportar QDFL</button>
          </>
        )}
      </div>
    </div>

    {/* ── Roteiro do projeto — orientação passo a passo ─────────── */}
    <div style={{
      display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10,
      border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface2)',
    }}>
      {etapas.map((e, i) => {
        const atual = e.id === etapa_atual.id
        return (
          <button key={e.id}
            onClick={() => setPagina(e.pagina as any)}
            title={e.dica}
            style={{
              flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer',
              background: atual ? 'var(--blue)' : e.feito ? 'var(--surface3)' : 'transparent',
              color: atual ? 'white' : e.feito ? 'var(--green)' : 'var(--text3)',
              fontSize: 11, fontWeight: atual ? 700 : 500,
              borderRight: i < etapas.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              transition: 'background .15s',
            }}>
            <span style={{ fontSize: 13 }}>{e.feito ? '✓' : atual ? '▶' : '○'}</span>
            <span>{e.label}</span>
          </button>
        )
      })}
    </div>
    {/* Dica contextual da etapa atual */}
    <div style={{
      marginBottom: 16, padding: '8px 14px', borderRadius: 8, fontSize: 12,
      background: 'var(--blue-dim, rgba(37,99,235,.08))', color: 'var(--text2)',
      border: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span style={{ fontSize: 14 }}>💡</span>
      <span><b>{etapa_atual.label}:</b> {etapa_atual.dica}</span>
    </div>

    {/* KPIs principais */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className={`kpi ${iq_cls}`}>
        <div className="kpi-lbl">Qualidade</div>
        <div className="kpi-val">{iq}%</div>
        <div className="kpi-unit">{n_ok}/{ci.length} conformes · {n_err} erros</div>
        <div className="kpi-bar"><div className="kpi-fill" style={{ width: `${iq}%` }} /></div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">CI Instalada</div>
        <div className="kpi-val">{demanda ? demanda.ci_kw.toFixed(2) : '—'}</div>
        <div className="kpi-unit">kW instalados</div>
        <div className="kpi-bar"><div className="kpi-fill" style={{ width: '65%', background: 'var(--blue)' }} /></div>
      </div>
      <div className="kpi warn">
        <div className="kpi-lbl">Demanda CEMIG</div>
        <div className="kpi-val">{demanda ? demanda.dem_kw.toFixed(2) : '—'}</div>
        <div className="kpi-unit">kW · FD {demanda ? Math.round(demanda.fd * 100) : 0}%</div>
        <div className="kpi-bar"><div className="kpi-fill" style={{ width: `${demanda ? demanda.fd * 100 : 0}%` }} /></div>
      </div>
      <div className="kpi info">
        <div className="kpi-lbl">Disjuntor Geral</div>
        <div className="kpi-val">{demanda ? demanda.in_geral : '—'} A</div>
        <div className="kpi-unit">{demanda ? demanda.tipo_ligacao_cemig : '—'} · CEMIG</div>
        <div className="kpi-bar"><div className="kpi-fill" style={{ width: '50%' }} /></div>
      </div>
      <div className={`kpi ${deseq <= 10 ? 'ok' : deseq <= 20 ? 'warn' : 'err'}`}>
        <div className="kpi-lbl">Desequilíbrio</div>
        <div className="kpi-val">{deseq}%</div>
        <div className="kpi-unit">{deseq <= 10 ? 'Equilibrado' : deseq <= 20 ? 'Atenção' : 'Corrigir'}</div>
        <div className="kpi-bar"><div className="kpi-fill" style={{ width: `${Math.min(deseq * 3, 100)}%` }} /></div>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

      {/* Gráfico de fases */}
      <div className="card">
        <div className="card-header">
          Distribuição de Cargas por Fase
          <button className="btn" onClick={() => setPagina('balanceamento')} style={{ height: 26, fontSize: 11 }}>
            Balancear →
          </button>
        </div>
        <div style={{ padding: 16 }}>
          {ci.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text4)', fontSize: 12 }}>
              Adicione circuitos para ver a distribuição de fases.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Fase R', va: fR, color: '#0f62fe' },
                { label: 'Fase S', va: fS, color: '#0f9d58' },
                { label: 'Fase T', va: fT, color: '#f59e0b' },
              ].map(({ label, va, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontFamily: 'var(--mono)', color, fontWeight: 600 }}>
                      {(va / 1000).toFixed(2)} kW
                    </span>
                  </div>
                  <div style={{ height: 28, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${(va / fMax) * 100}%`,
                      height: '100%',
                      background: color,
                      borderRadius: 4,
                      transition: 'width .5s ease',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 8,
                      minWidth: va > 0 ? 30 : 0,
                    }}>
                      {va > 0 && (
                        <span style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          {Math.round(va)} VA
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Indicador de desequilíbrio */}
              <div style={{
                marginTop: 4,
                padding: '8px 12px',
                borderRadius: 6,
                background: deseq <= 10 ? 'var(--green-dim)' : deseq <= 20 ? 'var(--amber-dim)' : 'var(--red-dim)',
                border: `1px solid ${deseq <= 10 ? 'var(--green)' : deseq <= 20 ? 'var(--amber)' : 'var(--red)'}`,
                fontSize: 11,
                color: deseq <= 10 ? 'var(--green)' : deseq <= 20 ? 'var(--amber)' : 'var(--red)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>
                  {deseq <= 10 ? '✓ Desequilíbrio dentro do limite (≤10%)' :
                   deseq <= 20 ? '⚠ Desequilíbrio elevado — recomendar balanceamento' :
                   '✗ Desequilíbrio crítico — balancear obrigatório'}
                </span>
                <strong style={{ fontFamily: 'var(--mono)' }}>{deseq}%</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gráfico dU por circuito */}
      <div className="card">
        <div className="card-header">
          Queda de Tensão por Circuito (ΔV%)
          <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>
            limite {(projeto as any).du_max_pct || 4}%
          </span>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflow: 'auto' }}>
          {duData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text4)', fontSize: 12 }}>
              Nenhum circuito dimensionado.
            </div>
          ) : duData.map((d, i) => {
            const pct = (d.du / duMax) * 100
            const cor = d.du <= 3.5 ? '#0f9d58' : d.du <= 4 ? '#f59e0b' : '#da1e28'
            const limite_pct = (4 / duMax) * 100
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                <span style={{ width: 120, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                  {d.nome}
                </span>
                <div style={{ flex: 1, height: 14, background: 'var(--surface3)', borderRadius: 3, position: 'relative', overflow: 'visible' }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: cor,
                    borderRadius: 3,
                    transition: 'width .4s ease',
                  }} />
                  {/* Linha de limite */}
                  <div style={{
                    position: 'absolute',
                    left: `${limite_pct}%`,
                    top: -2,
                    bottom: -2,
                    width: 1,
                    background: 'rgba(218,30,40,.4)',
                    pointerEvents: 'none',
                  }} />
                </div>
                <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--mono)', color: cor, fontWeight: 600 }}>
                  {d.du.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabela de circuitos */}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header">
          Circuitos Dimensionados
          <button className="btn" onClick={() => setPagina('circuitos')} style={{ height: 26, fontSize: 11 }}>
            Ver todos ({ci.length}) →
          </button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 260 }}>
          <table className="dtable">
            <thead><tr>
              <th style={{ width: 32 }}>N°</th>
              <th className="l">Descrição</th>
              <th>Tipo</th>
              <th>Fase</th>
              <th className="r">Seção</th>
              <th className="r">In(A)</th>
              <th className="r">Iz'(A)</th>
              <th className="r">ΔV%</th>
              <th style={{ width: 80 }}>Status</th>
              <th>IDR</th>
            </tr></thead>
            <tbody>
              {ci.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: 'var(--text4)' }}>
                  Nenhum circuito.{' '}
                  <span style={{ color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setPagina('comodos')}>
                    Começar pela previsão de cargas →
                  </span>
                </td></tr>
              ) : ci.slice(0, 10).map((c, i) => {
                const tc = c.tipo === 'ILUM' ? 'ilum' : c.tipo === 'TUG' ? 'tug' : 'tue'
                const dc = c.du_calc <= 3.5 ? 'c-ok' : c.du_calc <= 4 ? 'c-warn' : 'c-err'
                const sc = c.status === 'OK' ? 'c-ok' : c.status === 'LIMITE' ? 'c-warn' : 'c-err'
                return (
                  <tr key={c.id}>
                    <td className="mono c-dim" style={{ textAlign: 'center' }}>{String(i+1).padStart(2, '0')}</td>
                    <td className="name">{c.descricao.slice(0, 50)}</td>
                    <td><span className={`badge ${tc}`}>{c.tipo}</span></td>
                    <td className="mono" style={{ fontWeight: 600, color: c.fase.length > 1 ? 'var(--amber)' : 'var(--green)' }}>{c.fase}</td>
                    <td className="mono r">{c.secao_fase > 0 ? `${c.secao_fase} mm²` : '—'}</td>
                    <td className="mono r">{c.in_disj > 0 ? `${c.in_disj} A` : '—'}</td>
                    <td className="mono r">{c.iz_efetiva > 0 ? `${c.iz_efetiva.toFixed(1)} A` : '—'}</td>
                    <td className={`mono r ${dc}`}>{c.du_calc > 0 ? `${c.du_calc.toFixed(2)}%` : '—'}</td>
                    <td><span className={sc}>{c.status}</span></td>
                    <td style={{ textAlign: 'center' }}>{c.idr ? <span className="badge idr">30mA</span> : <span className="c-dim">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    </div>
  </>)
}
