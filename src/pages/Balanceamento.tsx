// src/pages/Balanceamento.tsx — Balanceamento de fases com visualização
import { useProjectStore } from '../store/projectStore'
import type { FaseType } from '../types/electrical'

const FASE_COR: Record<string, string> = {
  R: '#0f62fe', S: '#0f9d58', T: '#f59e0b'
}

export function Balanceamento() {
  const { circuitos_raw, circuitos_calc, balancearFases, setFaseCircuito, projeto } = useProjectStore()

  const ci = circuitos_raw.filter((_, i) => (circuitos_calc[i]?.potencia_va ?? 0) > 0)

  // Calcular cargas por fase
  let fR = 0, fS = 0, fT = 0
  circuitos_raw.forEach((r, i) => {
    const va = circuitos_calc[i]?.potencia_va ?? 0
    if (!va) return
    switch (r.fase) {
      case 'R':   fR += va; break
      case 'S':   fS += va; break
      case 'T':   fT += va; break
      case 'RS':  fR += va / 2; fS += va / 2; break
      case 'ST':  fS += va / 2; fT += va / 2; break
      case 'RT':  fR += va / 2; fT += va / 2; break
      case 'RST': fR += va / 3; fS += va / 3; fT += va / 3; break
    }
  })

  const total  = fR + fS + fT
  const fMax   = Math.max(fR, fS, fT, 1)
  const fMin   = total > 0 ? Math.min(fR || Infinity, fS || Infinity, fT || Infinity) : 0
  const deseq  = total > 0 ? (fMax - (fMin === Infinity ? 0 : fMin)) / total * 100 : 0
  const deseqOk = deseq <= 10

  // Fases disponíveis por sistema
  const fasesMonof: FaseType[] = projeto.sistema === 'Trifasico'
    ? ['R', 'S', 'T']
    : ['R', 'S']

  // Contar circuitos por fase
  const nR = ci.filter(c => c.fase === 'R').length
  const nS = ci.filter(c => c.fase === 'S').length
  const nT = ci.filter(c => c.fase === 'T').length

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Balanceamento de Fases</div>
        <div className="page-sub">
          Passo 4 de 6 — Distribuição de carga R/S/T · algoritmo greedy descendente
        </div>
      </div>
      <div className="page-actions">
        <button className="btn primary" onClick={balancearFases} disabled={ci.length === 0}>
          ⚡ Balancear automaticamente
        </button>
      </div>
    </div>

    {/* KPIs */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className="kpi info">
        <div className="kpi-lbl">Fase R</div>
        <div className="kpi-val" style={{ color: FASE_COR.R }}>{(fR / 1000).toFixed(2)}</div>
        <div className="kpi-unit">kW · {nR} circ.</div>
        <div className="kpi-bar">
          <div className="kpi-fill" style={{ width: `${(fR / fMax) * 100}%`, background: FASE_COR.R }} />
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Fase S</div>
        <div className="kpi-val" style={{ color: FASE_COR.S }}>{(fS / 1000).toFixed(2)}</div>
        <div className="kpi-unit">kW · {nS} circ.</div>
        <div className="kpi-bar">
          <div className="kpi-fill" style={{ width: `${(fS / fMax) * 100}%`, background: FASE_COR.S }} />
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Fase T</div>
        <div className="kpi-val" style={{ color: FASE_COR.T }}>{(fT / 1000).toFixed(2)}</div>
        <div className="kpi-unit">kW · {nT} circ.</div>
        <div className="kpi-bar">
          <div className="kpi-fill" style={{ width: `${(fT / fMax) * 100}%`, background: FASE_COR.T }} />
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Total instalado</div>
        <div className="kpi-val">{(total / 1000).toFixed(2)}</div>
        <div className="kpi-unit">kW</div>
      </div>
      <div className={`kpi ${deseqOk ? 'ok' : deseq <= 20 ? 'warn' : 'err'}`}>
        <div className="kpi-lbl">Desequilíbrio</div>
        <div className="kpi-val">{deseq.toFixed(1)}%</div>
        <div className="kpi-unit">{deseqOk ? '✓ ≤10% OK' : deseq <= 20 ? '⚠ Atenção' : '✗ Corrigir'}</div>
        <div className="kpi-bar">
          <div className="kpi-fill" style={{ width: `${Math.min(deseq * 5, 100)}%` }} />
        </div>
      </div>
    </div>

    {/* Gráfico de barras visual */}
    <div style={{ padding: '0 22px 12px', flexShrink: 0 }}>
      <div className="card">
        <div className="card-header">
          Distribuição de carga por fase
          {!deseqOk && (
            <span style={{ fontSize: 11, color: 'var(--amber)' }}>
              ⚠ Desequilíbrio {deseq.toFixed(1)}% — clique em "Balancear automaticamente"
            </span>
          )}
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { fase: 'R', va: fR, cor: FASE_COR.R, n: nR },
            { fase: 'S', va: fS, cor: FASE_COR.S, n: nS },
            { fase: 'T', va: fT, cor: FASE_COR.T, n: nT },
          ].filter(f => projeto.sistema !== 'Monofasico' || f.fase === 'R').map(({ fase, va, cor, n }) => (
            <div key={fase} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 4,
                background: cor, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700,
                flexShrink: 0,
              }}>
                {fase}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Fase {fase}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: cor, fontWeight: 700 }}>
                    {(va / 1000).toFixed(2)} kW &nbsp;·&nbsp; {n} circuito{n !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ height: 20, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${total > 0 ? (va / fMax) * 100 : 0}%`,
                    height: '100%', background: cor, borderRadius: 4,
                    transition: 'width .5s ease',
                    display: 'flex', alignItems: 'center', paddingLeft: 8,
                    minWidth: va > 0 ? 40 : 0,
                  }}>
                    {va > 0 && (
                      <span style={{ fontSize: 9, color: '#fff', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {total > 0 ? Math.round(va / total * 100) : 0}%
                      </span>
                    )}
                  </div>
                  {/* Linha de equilíbrio ideal */}
                  {total > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: `${(1 / fasesMonof.length) * 100}%`,
                      top: 0, bottom: 0, width: 1,
                      background: 'rgba(0,0,0,.2)',
                      pointerEvents: 'none',
                    }} />
                  )}
                </div>
              </div>
            </div>
          ))}
          {total > 0 && (
            <div style={{
              fontSize: 11, color: 'var(--text4)',
              borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2,
            }}>
              Linha tracejada = equilíbrio ideal ({(total / fasesMonof.length / 1000).toFixed(2)} kW/fase)
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Tabela de circuitos com selector de fase */}
    <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 16px' }}>
      <div className="card">
        <div className="card-header">
          Distribuição manual de circuitos
          <span style={{ fontSize: 10, color: 'var(--text4)' }}>
            Arraste o select para mudar a fase de cada circuito individualmente
          </span>
        </div>
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 36 }}>N°</th>
              <th>Descrição</th>
              <th style={{ width: 60 }}>Tipo</th>
              <th className="r" style={{ width: 80 }}>VA</th>
              <th className="r" style={{ width: 70 }}>% total</th>
              <th style={{ width: 130 }}>Fase atual</th>
            </tr>
          </thead>
          <tbody>
            {ci.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text4)' }}>
                  Nenhum circuito dimensionado. Complete os passos 2 e 3 primeiro.
                </td>
              </tr>
            ) : ci.map((r, i) => {
              const calc = circuitos_calc[circuitos_raw.indexOf(r)]
              const va   = calc?.potencia_va ?? 0
              const tc   = r.tipo === 'ILUM' ? 'ilum' : r.tipo === 'TUG' ? 'tug' : 'tue'
              const isMonof = ['R', 'S', 'T'].includes(r.fase)
              const faseAtualCor = FASE_COR[r.fase] || 'var(--text3)'

              return (
                <tr key={r.id}>
                  <td className="mono c-dim" style={{ textAlign: 'center' }}>
                    {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className="name">{r.descricao.slice(0, 48)}</td>
                  <td>
                    <span className={`badge ${tc}`}>{r.tipo}</span>
                  </td>
                  <td className="mono r">{va.toLocaleString()}</td>
                  <td className="mono r" style={{ color: 'var(--text4)', fontSize: 11 }}>
                    {total > 0 ? (va / total * 100).toFixed(1) : 0}%
                  </td>
                  <td>
                    {isMonof ? (
                      /* Selector visual de fase com cores */
                      <div style={{ display: 'flex', gap: 4 }}>
                        {fasesMonof.map(f => (
                          <button
                            key={f}
                            onClick={() => setFaseCircuito(r.id, f)}
                            style={{
                              width: 28, height: 24, borderRadius: 4, border: 'none',
                              cursor: 'pointer', fontSize: 10, fontWeight: 700,
                              background: r.fase === f ? FASE_COR[f] : 'var(--surface3)',
                              color: r.fase === f ? '#fff' : FASE_COR[f],
                              transition: 'all .12s',
                            }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* Circuito bifásico/trifásico — não balancear */
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
                        color: faseAtualCor, padding: '2px 8px',
                        background: `${faseAtualCor}18`, borderRadius: 4,
                      }}>
                        {r.fase} — bifásico/trifásico
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Rodapé com resumo por fase */}
        {ci.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${fasesMonof.length + 1}, 1fr)`,
            gap: 0, borderTop: '2px solid var(--border2)',
          }}>
            {[
              ...fasesMonof.map(f => ({
                label: `Fase ${f}`,
                va: f === 'R' ? fR : f === 'S' ? fS : fT,
                cor: FASE_COR[f],
              })),
              { label: 'Total', va: total, cor: 'var(--text)' },
            ].map(({ label, va, cor }) => (
              <div key={label} style={{
                textAlign: 'center', padding: '8px 4px',
                borderRight: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: cor, fontFamily: 'var(--mono)' }}>
                  {(va / 1000).toFixed(2)} kW
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </>)
}
