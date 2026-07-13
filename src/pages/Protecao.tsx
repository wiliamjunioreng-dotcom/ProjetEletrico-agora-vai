// src/pages/Protecao.tsx — Tripartida · IDR · Curto-circuito IEC 60909 · Seletividade · DPS
import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { calcIcc } from '../core/engine'

type Aba = 'tripartida' | 'curto' | 'seletividade' | 'dps'

export function Protecao() {
  const { circuitos_calc, circuitos_raw, projeto, demanda } = useProjectStore()
  const [aba, setAba] = useState<Aba>('tripartida')
  const [tooltip, setTooltip] = useState<string | null>(null)

  const ci  = circuitos_calc.filter(c => c.potencia_va > 0)
  const raw = circuitos_raw.filter((_, i) => (circuitos_calc[i]?.potencia_va ?? 0) > 0)

  const n_err = ci.filter(c => c.status === 'ERRO').length
  const n_idr = ci.filter(c => c.idr).length
  const n_ok  = ci.filter(c => c.status === 'OK').length

  const icc_rede  = (projeto as any).icc_rede_ka || 3
  const v_linha   = (projeto as any).v_linha || 220
  const in_geral  = demanda?.in_geral || 0
  const in_max_c  = Math.max(...ci.map(c => c.in_disj || 0), 0)
  const sel_ok    = in_geral > in_max_c

  const icc_results = ci.map((c, i) => {
    const r = raw[i]
    if (!r || !c.secao_fase || c.secao_fase <= 0 || !(r.comprimento_m > 0)) return null
    return calcIcc({
      icc_rede_ka:   icc_rede,
      v_linha,
      secao_mm2:     c.secao_fase,
      comprimento_m: r.comprimento_m,
      material:      (projeto as any).material_cabo || 'Cu',
      isolacao:      (projeto as any).isolacao || 'PVC',
      temperatura:   (projeto as any).t_amb || 30,
    }, c.in_disj)
  })

  const ABAS: { id: Aba; label: string; badge?: number }[] = [
    { id: 'tripartida',   label: 'Tripartida + IDR', badge: n_err > 0 ? n_err : undefined },
    { id: 'curto',        label: 'Curto-circuito IEC 60909' },
    { id: 'seletividade', label: 'Seletividade' },
    { id: 'dps',          label: 'DPS / SPDA' },
  ]

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Proteção</div>
        <div className="page-sub">
          Tripartida · IDR 30mA · Curto-circuito IEC 60909 · Seletividade · DPS NBR 5419
        </div>
      </div>
    </div>

    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className={`kpi ${n_err === 0 ? 'ok' : 'err'}`}>
        <div className="kpi-lbl">Tripartida OK</div>
        <div className="kpi-val">{n_ok}/{ci.length}</div>
        <div className="kpi-unit">Ib ≤ In ≤ Iz'</div>
      </div>
      <div className={`kpi ${n_err > 0 ? 'err' : 'ok'}`}>
        <div className="kpi-lbl">Erros bloqueantes</div>
        <div className="kpi-val">{n_err}</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">IDR 30mA</div>
        <div className="kpi-val" style={{ color: 'var(--red)' }}>{n_idr}</div>
        <div className="kpi-unit">circuitos protegidos</div>
      </div>
      <div className={`kpi ${sel_ok ? 'ok' : 'warn'}`}>
        <div className="kpi-lbl">Seletividade</div>
        <div className="kpi-val">{sel_ok ? 'OK' : '!'}</div>
        <div className="kpi-unit">Geral {in_geral}A · Máx {in_max_c}A</div>
      </div>
      <div className="kpi info">
        <div className="kpi-lbl">DPS sugerido</div>
        <div className="kpi-val">{v_linha}V</div>
        <div className="kpi-unit">Classe II · Up ≤ 2,5 kV</div>
      </div>
    </div>

    {/* Abas */}
    <div style={{
      display: 'flex', padding: '0 22px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)', flexShrink: 0,
    }}>
      {ABAS.map(a => (
        <button key={a.id} onClick={() => setAba(a.id)} style={{
          height: 38, padding: '0 16px',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${aba === a.id ? 'var(--blue)' : 'transparent'}`,
          color: aba === a.id ? 'var(--blue)' : 'var(--text3)',
          fontSize: 12, fontWeight: aba === a.id ? 600 : 400,
          cursor: 'pointer', fontFamily: 'var(--font)',
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'all .1s',
        }}>
          {a.label}
          {a.badge !== undefined && (
            <span style={{ background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>
              {a.badge}
            </span>
          )}
        </button>
      ))}
    </div>

    {tooltip && (
      <div className="tooltip-violation">
        {tooltip}
        <button onClick={() => setTooltip(null)} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
    )}

    <div className="page-scroll">

      {/* Tripartida + IDR */}
      {aba === 'tripartida' && (
        <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <table className="dtable" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <thead><tr>
              <th style={{ width: 32 }}></th>
              <th>Circuito</th>
              <th className="r">Ib(A)</th>
              <th className="r">In(A)</th>
              <th>Curva</th>
              <th className="r">Iz'(A)</th>
              <th className="r">ΔV%</th>
              <th>IDR</th>
              <th>Verificação</th>
            </tr></thead>
            <tbody>
              {ci.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text4)' }}>Nenhum circuito.</td></tr>
                : ci.map(c => {
                  const ok   = c.status === 'OK'
                  const iz_ok = c.in_disj <= c.iz_efetiva && c.ib <= c.in_disj
                  const du_ok = c.du_calc <= (projeto as any).du_max_pct
                  return (
                    <tr key={c.id} style={{ background: c.status === 'ERRO' ? '#fff5f5' : c.status === 'LIMITE' ? '#fffbf0' : '' }}>
                      <td style={{ textAlign: 'center', fontSize: 14 }}>
                        <span className={ok ? 'c-ok' : c.status === 'LIMITE' ? 'c-warn' : 'c-err'}>
                          {ok ? '✓' : c.status === 'LIMITE' ? '△' : '✗'}
                        </span>
                      </td>
                      <td className="name">{c.descricao.slice(0, 42)}</td>
                      <td className="mono r">{c.ib.toFixed(2)}</td>
                      <td className="mono r" style={{ fontWeight: 600, color: iz_ok ? 'var(--green)' : 'var(--red)' }}>{c.in_disj}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 10, background: 'var(--surface2)', padding: '2px 7px', borderRadius: 4, fontFamily: 'var(--mono)' }}>
                          Curva {c.curva}
                        </span>
                      </td>
                      <td className="mono r" style={{ color: iz_ok ? 'var(--green)' : 'var(--red)' }}>{c.iz_efetiva.toFixed(1)}</td>
                      <td className={`mono r ${du_ok ? 'c-ok' : 'c-err'}`}>{c.du_calc.toFixed(2)}%</td>
                      <td style={{ textAlign: 'center' }}>
                        {c.idr ? <span className="badge idr">30mA</span> : <span className="c-dim">—</span>}
                      </td>
                      <td style={{ fontSize: 11, cursor: c.violacoes.length > 0 ? 'help' : 'default' }}
                        onClick={() => c.violacoes.length > 0 && setTooltip(c.violacoes.map(v => `• ${v.descricao} (${v.norma})`).join('\n'))}>
                        {c.violacoes.length === 0
                          ? <span className="c-ok">✓ Conforme</span>
                          : c.violacoes.map(v => (
                            <div key={v.codigo} style={{ color: v.severidade === 'erro_bloqueante' ? 'var(--red)' : 'var(--amber)' }}>
                              {v.descricao.slice(0, 48)}
                            </div>
                          ))
                        }
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="card">
              <div className="card-header">Tripartida — NBR 5410 item 5.1.3.1</div>
              <div style={{ padding: '12px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)', marginBottom: 6 }}>Ib ≤ In ≤ Iz'</div>
                {[['Ib','Corrente de projeto = VA / V'],['In','Corrente nominal do disjuntor (IEC 60898)'],["Iz'",'Iz × Ft × Fa — capacidade real do cabo'],['Ft','Fator de temperatura — Tabela 40'],['Fa','Fator de agrupamento — Tabela 42']].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ width: 24, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 600, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: 'var(--text3)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header">IDR — NBR 5410 item 5.1.3.6.1</div>
              <div style={{ padding: '12px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>30 mA — alta sensibilidade — obrigatório em:</div>
                {['Banheiros, lavabos e vestiários','Cozinhas e lavanderias','Áreas externas, varandas, sacadas','Garagens e estacionamentos','Piscinas e churrasqueiras','Tomadas de uso geral (residencial)'].map(i => (
                  <div key={i} style={{ color: 'var(--text3)', paddingLeft: 8 }}>· {i}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Curto-circuito */}
      {aba === 'curto' && (
        <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '10px 14px', background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 8, fontSize: 11, color: 'var(--blue)' }}>
            <strong>IEC 60909:2016 — método simplificado BT.</strong> Icc da rede: {icc_rede} kA (concessionária).
            Temperatura de curto: 160°C (PVC). Circuitos sem comprimento informado são omitidos.
          </div>
          <table className="dtable" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <thead><tr>
              <th>Circuito</th>
              <th className="r">Comp.(m)</th>
              <th className="r">S(mm²)</th>
              <th className="r">Zcabo(mΩ)</th>
              <th className="r">Icc máx(kA)</th>
              <th className="r">Icc mín(kA)</th>
              <th className="r">In(A)</th>
              <th>Atuação</th>
              <th>I²t%</th>
            </tr></thead>
            <tbody>
              {ci.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text4)' }}>Nenhum circuito.</td></tr>
                : ci.map((c, i) => {
                  const r  = icc_results[i]
                  const rw = raw[i]
                  if (!r) return (
                    <tr key={c.id}>
                      <td className="name">{c.descricao.slice(0, 40)}</td>
                      <td colSpan={8} style={{ color: 'var(--text4)', fontSize: 11, textAlign: 'center' }}>
                        Informe o comprimento na aba Circuitos
                      </td>
                    </tr>
                  )
                  const atua  = c.curva === 'B' ? r.ok_curva_b : c.curva === 'D' ? r.ok_curva_d : r.ok_curva_c
                  const it_c  = r.energia_especifica <= 70 ? 'var(--green)' : r.energia_especifica <= 100 ? 'var(--amber)' : 'var(--red)'
                  const it_bg = r.energia_especifica <= 70 ? 'var(--green-dim)' : r.energia_especifica <= 100 ? 'var(--amber-dim)' : 'var(--red-dim)'
                  return (
                    <tr key={c.id}>
                      <td className="name">{c.descricao.slice(0, 38)}</td>
                      <td className="mono r">{rw?.comprimento_m || 0}</td>
                      <td className="mono r">{c.secao_fase}</td>
                      <td className="mono r">{r.z_cabo_mohm}</td>
                      <td className="mono r" style={{ color: 'var(--text3)' }}>{r.icc_max_ka}</td>
                      <td className="mono r" style={{ fontWeight: 600 }}>{r.icc_min_ka}</td>
                      <td className="mono r">{c.in_disj}</td>
                      <td>
                        {atua
                          ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>✓ {r.tempo_atuacao_ms}ms</span>
                          : <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>✗ Não atua!</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: it_bg, color: it_c }}>
                          {r.energia_especifica}%
                        </span>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="card">
              <div className="card-header">Legenda — IEC 60909</div>
              <div style={{ padding: '10px 14px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[['Icc máx','No início do cabo — dimensiona o poder de interrupção'],['Icc mín','No fim do cabo — verifica se o disjuntor atua'],['Curva B','Disparo magnético 3-5×In — cabos longos'],['Curva C','Disparo magnético 5-10×In — padrão residencial'],['Curva D','Disparo magnético 10-20×In — motores'],['I²t%','Energia específica / máx. admissível pelo cabo']].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ width: 60, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 600, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: 'var(--text3)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header">Parâmetros da rede</div>
              <div style={{ padding: '10px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[['Icc concessionária',`${icc_rede} kA`],['Tensão de linha',`${v_linha} V`],['Z rede',`${icc_results.find(r=>r)?.z_rede_mohm || '—'} mΩ`],['Material',(projeto as any).material_cabo || 'Cu'],['Temperatura',`${(projeto as any).t_amb || 30}°C`],['Norma','IEC 60909:2016 / NBR 5410 §5.3']].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text3)' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Seletividade */}
      {aba === 'seletividade' && (
        <div style={{ padding: '14px 22px' }}>
          <div className="card">
            <div className="card-header">Coordenação e Seletividade — NBR 5410 item 5.3.4</div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                O disjuntor geral deve ter In maior que qualquer disjuntor de circuito para garantir seletividade total.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 8, marginBottom: 8, background: 'var(--sb-bg)', color: '#e2e8f0' }}>
                <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)', flexShrink: 0 }}>QDG</div>
                <div>
                  <div style={{ fontWeight: 600 }}>Disjuntor Geral — {in_geral ? `${in_geral}A` : 'não calculado'}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'var(--mono)' }}>CEMIG · {(projeto as any).tipo_ligacao_cemig || 'ver QDFL'}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 11, color: sel_ok ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {sel_ok ? '✓ Seletivo' : `✗ Conflito: ${in_max_c}A ≥ ${in_geral}A`}
                </div>
              </div>
              {/* Tabela de seletividade com análise por razão */}
              <div style={{ marginLeft: 20, borderLeft: '2px dashed var(--border2)', paddingLeft: 20 }}>
                <table className="dtable" style={{ marginBottom: 8 }}>
                  <thead><tr>
                    <th>Circuito</th>
                    <th className="r">In circ.</th>
                    <th className="r">In DG</th>
                    <th className="r">Razão</th>
                    <th className="r">Curva</th>
                    <th className="r">Seletividade</th>
                  </tr></thead>
                  <tbody>
                  {ci.map(c => {
                    const ok_basica = in_geral > c.in_disj
                    const razao     = in_geral > 0 ? (in_geral / (c.in_disj || 1)) : 0
                    // Seletividade total exige razão ≥ 1,6 (IEC 60947-2)
                    // Seletividade parcial: apenas 1 patamar (DG abre antes do circuito)
                    const sel_total = razao >= 1.6
                    const status_sel = !ok_basica ? 'conflito' : sel_total ? 'total' : 'parcial'
                    const cor_sel = status_sel === 'conflito' ? 'var(--red)' : status_sel === 'total' ? 'var(--green)' : 'var(--amber)'
                    return (
                      <tr key={c.id} style={{ background: !ok_basica ? 'var(--red-dim)' : undefined }}>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.descricao}</td>
                        <td className="mono r">{c.in_disj}A {c.curva}</td>
                        <td className="mono r">{in_geral || '—'}A</td>
                        <td className="mono r" style={{ color: sel_total ? 'var(--green)' : 'var(--amber)' }}>
                          {in_geral > 0 ? razao.toFixed(1) + '×' : '—'}
                        </td>
                        <td className="mono r" style={{ fontSize: 10, color: 'var(--text4)' }}>{c.curva || 'B'}</td>
                        <td className="r">
                          <span style={{ fontSize: 9, fontWeight: 700, color: cor_sel,
                            background: status_sel === 'conflito' ? 'var(--red-dim)' : status_sel === 'total' ? 'var(--green-dim)' : 'var(--amber-dim)',
                            padding: '1px 6px', borderRadius: 2, border: `1px solid ${cor_sel}` }}>
                            {status_sel === 'conflito' ? '✗ CONFLITO' : status_sel === 'total' ? '✓ TOTAL' : '~ PARCIAL'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  </tbody>
                </table>
                {ci.length === 0 && <div style={{ color: 'var(--text4)', fontSize: 12, padding: 12 }}>Nenhum circuito dimensionado.</div>}
                {/* Legenda */}
                <div style={{ fontSize: 9.5, color: 'var(--text4)', display: 'flex', gap: 16, padding: '4px 0' }}>
                  <span><span style={{ color: 'var(--green)', fontWeight: 700 }}>TOTAL</span> = razão ≥ 1,6 (IEC 60947-2)</span>
                  <span><span style={{ color: 'var(--amber)', fontWeight: 700 }}>PARCIAL</span> = DG &gt; circuito mas razão &lt; 1,6</span>
                  <span><span style={{ color: 'var(--red)', fontWeight: 700 }}>CONFLITO</span> = DG ≤ circuito — risco de não-seletividade</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DPS / SPDA */}
      {aba === 'dps' && (
        <div style={{ padding: '14px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card">
            <div className="card-header">DPS — NBR 5410 item 7.4 + IEC 61643-11</div>
            <div style={{ padding: '12px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13, marginBottom: 4 }}>Classe II — residencial/comercial</div>
              {[['Tensão nominal (Un)',`${v_linha} V CA`],['Tensão máxima (Uc)',`${Math.round(v_linha*1.15)} V (≥ 1,15 × Un)`],['Nível de proteção (Up)','≤ 2,5 kV (Categoria II)'],['Corrente de descarga (In)','≥ 5 kA (forma 8/20 μs)'],['Ponto de instalação','Entrada do QD principal'],['Configuração (TN-S)','Fase/fase + neutro/terra'],['Fusível de backup','gL/gG conforme fabricante']].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text3)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header">SPDA — Para-raios NBR 5419:2015</div>
            <div style={{ padding: '12px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontWeight: 600, color: 'var(--purple)', fontSize: 13, marginBottom: 4 }}>Guia preliminar — NPR III</div>
              {[['Eficiência mínima','80% (NPR III)'],['Método de proteção','Franklin / Esfera rolante 45m'],['Ângulo de proteção','45° para h ≤ 20m'],['Condutor de descida','50 mm² Cu ou 70 mm² Al'],['Eletrodo','Haste 16mm × 2,4m mín.'],['Resistência','≤ 10 Ω (medida)'],['Equipotencialização','Obrigatória — NBR 5419-3']].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text3)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, fontSize: 11 }}>{v}</span>
                </div>
              ))}
              <div style={{ padding: '8px 10px', background: 'var(--purple-dim)', border: '1px solid var(--purple)', borderRadius: 6, fontSize: 11, color: 'var(--purple)', marginTop: 4 }}>
                Cálculo completo do SPDA requer análise de risco (NBR 5419-2). Módulo SPDA completo em desenvolvimento.
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  </>)
}
