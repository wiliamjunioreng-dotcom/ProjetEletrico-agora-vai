// src/pages/Projeto.tsx
import { TEMPLATES, getTemplate } from '../data/templates'
// Todos os campos · Feedback em tempo real · Validação · Preview do memorial

import { useProjectStore, getVLinha } from '../store/projectStore'
import { getFt } from '../data/nbr5410tables'

// ── Opções dos campos ──────────────────────────────────────────────

const METODOS: [string, string][] = [
  ['B1', 'B1 — Unipolar em eletroduto embutido em alvenaria (padrão residencial)'],
  ['B2', 'B2 — Multipolar em eletroduto embutido em alvenaria'],
  ['A1', 'A1 — Unipolar em eletroduto em parede isolante'],
  ['A2', 'A2 — Multipolar em eletroduto em parede isolante'],
  ['C',  'C  — Sobre parede ou teto ao ar livre'],
  ['D1', 'D1 — Unipolar em eletroduto enterrado no solo'],
  ['D2', 'D2 — Multipolar em eletroduto enterrado no solo'],
  ['E',  'E  — Multipolar ao ar livre descoberto'],
  ['F',  'F  — Unipolar agrupado ao ar livre'],
]

const ATERRAMENTOS: [string, string][] = [
  ['TN-S',   'TN-S — N e PE separados em todo percurso (recomendado)'],
  ['TN-C-S', 'TN-C-S — Combina TN-C na entrada, TN-S no QD'],
  ['TT',     'TT — Massas aterradas independente da fonte'],
  ['TN-C',   'TN-C — PEN combinado (proibido em novas instalações)'],
  ['IT',     'IT — Fonte isolada (industrial/hospitalar)'],
]

const CONCESSIONARIAS = ['CEMIG','COPEL','CPFL','CELESC','ENERGISA','ENEL','EQUATORIAL','Outra']
const SISTEMAS        = ['Monofasico','Bifasico','Trifasico']
const ISOLACOES       = ['PVC','XLPE','EPR']
const MATERIAIS: [string, string][] = [
  ['Cu', 'Cobre — padrão residencial'],
  ['Al', 'Alumínio — uso em seções ≥ 16mm²'],
]

const V_FASE_OPTS: Record<string, number[]> = {
  CEMIG:      [127],
  COPEL:      [127],
  CPFL:       [127],
  CELESC:     [220],
  ENERGISA:   [127],
  ENEL:       [127],
  EQUATORIAL: [127],
  Outra:      [127, 220],
}

// ── Validação em tempo real ────────────────────────────────────────

interface Val { campo: string; msg: string; tipo: 'erro' | 'aviso' }

function validar(p: any): Val[] {
  const v: Val[] = []
  if (!p.nome || p.nome === 'Novo Projeto')
    v.push({ campo: 'nome',        msg: 'Informe o nome da obra',              tipo: 'aviso' })
  if (!p.endereco)
    v.push({ campo: 'endereco',    msg: 'Endereço obrigatório para o memorial', tipo: 'aviso' })
  if (!p.projetista)
    v.push({ campo: 'projetista',  msg: 'Nome do RT obrigatório para a ART',   tipo: 'aviso' })
  if (!p.crea)
    v.push({ campo: 'crea',        msg: 'Registro CREA obrigatório para a ART',tipo: 'aviso' })
  if (p.t_amb < 10 || p.t_amb > 60)
    v.push({ campo: 't_amb',       msg: 'Temperatura fora do intervalo 10–60°C',tipo: 'erro' })
  if (p.du_max_pct > 7)
    v.push({ campo: 'du_max_pct',  msg: 'NBR 5410 limita a 7% no total',       tipo: 'erro' })
  if (p.du_max_pct <= 0)
    v.push({ campo: 'du_max_pct',  msg: 'ΔU máximo deve ser maior que zero',   tipo: 'erro' })
  if (p.du_ramal_pct < 0 || p.du_ramal_pct >= p.du_max_pct)
    v.push({ campo: 'du_ramal_pct', msg: 'Reserva do ramal deve ser ≥ 0 e menor que o ΔU máximo total', tipo: 'erro' })
  if (p.fp_global < 0.7 || p.fp_global > 1)
    v.push({ campo: 'fp_global',   msg: 'FP deve estar entre 0,70 e 1,00',     tipo: 'erro' })
  if (p.icc_rede_ka <= 0)
    v.push({ campo: 'icc_rede_ka', msg: 'Solicite à concessionária',            tipo: 'aviso' })
  if (p.material_cabo === 'Al' && p.du_max_pct < 5)
    v.push({ campo: 'material_cabo', msg: 'Alumínio tem maior resistividade — considere dU máx ≥ 5%', tipo: 'aviso' })
  return v
}

// ── Componente ────────────────────────────────────────────────────

export function Projeto() {
  const { projeto, setProjeto, setSistema, setVFase, setPagina, demanda, circuitos_calc } = useProjectStore()

  const upd = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
      setProjeto({ [k]: v } as any)
    }

  const vOpts  = V_FASE_OPTS[projeto.concessionaria] ?? [127, 220]
  const vLinha = getVLinha(projeto.v_fase)
  const ft     = getFt(projeto.t_amb, projeto.isolacao as any)

  const tensaoDesc =
    projeto.sistema === 'Monofasico' ? `${projeto.v_fase}V monofásico`
    : projeto.sistema === 'Bifasico' ? `${projeto.v_fase}V (F-N) | ${vLinha}V (F-F)`
    : `${vLinha}V entre fases | ${projeto.v_fase}V (F-N)`

  const erros   = validar(projeto)
  const nErr    = erros.filter(e => e.tipo === 'erro').length
  const nAviso  = erros.filter(e => e.tipo === 'aviso').length
  const ci      = circuitos_calc.filter(c => c.potencia_va > 0)

  const borda = (campo: string): React.CSSProperties => {
    const e = erros.find(e => e.campo === campo)
    if (!e) return {}
    return { borderColor: e.tipo === 'erro' ? 'var(--red)' : 'var(--amber)' }
  }

  const ErroInline = ({ campo }: { campo: string }) => {
    const e = erros.find(e => e.campo === campo)
    if (!e) return null
    return (
      <div style={{ fontSize: 10, marginTop: 2, color: e.tipo === 'erro' ? 'var(--red)' : 'var(--amber)', display: 'flex', gap: 4 }}>
        {e.tipo === 'erro' ? '✗' : '⚠'} {e.msg}
      </div>
    )
  }

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Dados do Projeto</div>
        <div className="page-sub">Passo 1 de 6 — Identificação, tensões e parâmetros NBR 5410</div>
      </div>
      <div className="page-actions">
        {nErr > 0 && <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--mono)' }}>{nErr} erro(s)</span>}
        {nAviso > 0 && <span style={{ fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{nAviso} aviso(s)</span>}
        {nErr === 0 && nAviso === 0 && <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)' }}>✓ Completo</span>}
        <button className="btn primary" onClick={() => setPagina('comodos')}>
          Próximo: Previsão de Cargas →
        </button>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>

      {/* ── Coluna principal ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Identificação */}
        <div className="card">
          <div className="card-header">
            Identificação da Obra e do Responsável Técnico
            {(nErr > 0 || nAviso > 0) && (
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10, marginLeft: 8,
                background: nErr ? 'var(--red-dim)' : 'var(--amber-dim)',
                color: nErr ? 'var(--red)' : 'var(--amber)',
                border: `1px solid ${nErr ? 'var(--red)' : 'var(--amber)'}`,
              }}>
                {nErr ? `${nErr} erro(s)` : `${nAviso} aviso(s)`}
              </span>
            )}
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div className="fgroup">
              {/* Templates */}
              <div style={{ gridColumn:'1/-1', marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                  🚀 Templates de partida
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {TEMPLATES.map(t => (
                    <button key={t.id} className="btn"
                      style={{ fontSize:11, padding:'4px 10px' }}
                      title={t.descricao}
                      onClick={() => {
                        if (!confirm(`Usar template "${t.nome}"? Cômodos atuais serão substituídos.`)) return
                        const tpl = getTemplate(t.id)!
                        alert(`Template "${tpl.nome}" selecionado!\n\nVá em Projeto > Sistema e configure:\n- Tensão: ${tpl.v_fase}V\n- ΔU máx: ${tpl.du_max}%\n\nDepois adicione os cômodos sugeridos:\n${tpl.comodos.map(cm => '• '+cm.nome+' ('+cm.area_m2+'m²)').join('\n')}`)
                      }}>
                      {t.icone} {t.nome}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flabel">Nome da obra / projeto</label>
              <input className="finput" value={projeto.nome} onChange={upd('nome')}
                placeholder="Ex: Residência — João da Silva — Araguari/MG"
                style={borda('nome')} />
              <ErroInline campo="nome" />
            </div>

            <div className="form-grid c2">
              <div className="fgroup">
                <label className="flabel">Endereço completo</label>
                <input className="finput" value={projeto.endereco} onChange={upd('endereco')}
                  placeholder="Rua das Flores, 123 — Bairro — Cidade/UF"
                  style={borda('endereco')} />
                <ErroInline campo="endereco" />
              </div>
              <div className="fgroup">
                <label className="flabel">Ano / referência</label>
                <input className="finput" value={projeto.ano} onChange={upd('ano')}
                  placeholder={String(new Date().getFullYear())} />
              </div>
            </div>

            <div className="fgroup">
              <label className="flabel">Empresa / Escritório</label>
              <input className="finput" value={projeto.empresa} onChange={upd('empresa')}
                placeholder="Ex: Lumen Soluções" />
            </div>

            <div className="form-grid c2">
              <div className="fgroup">
                <label className="flabel">Responsável Técnico (RT)</label>
                <input className="finput" value={projeto.projetista} onChange={upd('projetista')}
                  placeholder="Nome completo do engenheiro"
                  style={borda('projetista')} />
                <ErroInline campo="projetista" />
              </div>
              <div className="fgroup">
                <label className="flabel">Registro CREA / CFT</label>
                <input className="finput" value={projeto.crea} onChange={upd('crea')}
                  placeholder="CREA-MG 23564875"
                  style={borda('crea')} />
                <ErroInline campo="crea" />
                <div className="fhint">Formato: CREA-UF 00000000 ou CFT-UF 00000</div>
              </div>
            </div>

          </div>
        </div>

        {/* Rede elétrica */}
        <div className="card">
          <div className="card-header">Rede Elétrica e Concessionária</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div className="form-grid c3">
              <div className="fgroup">
                <label className="flabel">Concessionária</label>
                <select className="fselect" value={projeto.concessionaria} onChange={upd('concessionaria')}>
                  {CONCESSIONARIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="fgroup">
                <label className="flabel">Sistema de ligação</label>
                <select className="fselect" value={projeto.sistema} onChange={e => setSistema(e.target.value)}>
                  {SISTEMAS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="fgroup">
                <label className="flabel">Tensão de fase (VF)</label>
                {vOpts.length === 1 ? (
                  <div style={{ height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, fontSize: 12.5, color: 'var(--text3)' }}>
                    {projeto.v_fase} V (fixo — {projeto.concessionaria})
                  </div>
                ) : (
                  <select className="fselect" value={projeto.v_fase} onChange={e => setVFase(Number(e.target.value))}>
                    {vOpts.map(v => <option key={v} value={v}>{v} V</option>)}
                  </select>
                )}
                <div className="fhint">Variável primária — VL calculado automaticamente</div>
              </div>
            </div>

            {/* VL destaque */}
            <div style={{
              padding: '10px 16px', background: 'var(--blue-dim)',
              border: '1px solid var(--blue)', borderRadius: 7,
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>VL (= VF × √3)</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{vLinha} V</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--blue)', lineHeight: 1.8 }}>
                <strong>{tensaoDesc}</strong><br />
                {projeto.sistema === 'Bifasico' && 'Circuitos TUG/ILUM → 127V · Chuveiro/bifásicos → 220V'}
                {projeto.sistema === 'Trifasico' && 'Motores e cargas trifásicas → 380V · Tomadas → 127V'}
                {projeto.sistema === 'Monofasico' && 'Todos os circuitos utilizam 127V (fase-neutro)'}
              </div>
            </div>

            <div className="form-grid c2">
              <div className="fgroup">
                <label className="flabel">Esquema de aterramento — NBR 5410 §4.2</label>
                <select className="fselect" value={projeto.aterramento} onChange={upd('aterramento')}>
                  {ATERRAMENTOS.map(([v, d]) => <option key={v} value={v}>{d}</option>)}
                </select>
              </div>
              <div className="fgroup">
                <label className="flabel">Fator de potência global (fp)</label>
                <input className="finput" type="number" value={projeto.fp_global}
                  onChange={upd('fp_global')} min={0.7} max={1} step={0.01}
                  style={borda('fp_global')} />
                <div className="fhint">Residencial CEMIG: 0,92 · Industrial: 0,85</div>
                <ErroInline campo="fp_global" />
              </div>
            </div>

          </div>
        </div>

        {/* Parâmetros NBR 5410 */}
        <div className="card">
          <div className="card-header">Parâmetros de Dimensionamento — NBR 5410</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div className="fgroup">
              <label className="flabel">Método de instalação — Tabela 33 NBR 5410</label>
              <select className="fselect" value={projeto.metodo_instalacao} onChange={upd('metodo_instalacao')}>
                {METODOS.map(([v, d]) => <option key={v} value={v}>{d}</option>)}
              </select>
              <div className="fhint">B1 é o padrão residencial brasileiro — eletroduto embutido em alvenaria</div>
            </div>

            <div className="form-grid c3">
              <div className="fgroup">
                <label className="flabel">Material do condutor</label>
                <select className="fselect" value={projeto.material_cabo} onChange={upd('material_cabo')}
                  style={borda('material_cabo')}>
                  {MATERIAIS.map(([v, d]) => <option key={v} value={v}>{d}</option>)}
                </select>
                <ErroInline campo="material_cabo" />
              </div>
              <div className="fgroup">
                <label className="flabel">Tipo de isolação</label>
                <select className="fselect" value={projeto.isolacao} onChange={upd('isolacao')}>
                  {ISOLACOES.map(i => <option key={i}>{i}</option>)}
                </select>
                <div className="fhint">PVC 70°C · XLPE 90°C · EPR 90°C</div>
              </div>
              <div className="fgroup">
                <label className="flabel">Temperatura ambiente (°C)</label>
                <input className="finput" type="number" value={projeto.t_amb}
                  onChange={upd('t_amb')} min={10} max={60} step={5}
                  style={borda('t_amb')} />
                <ErroInline campo="t_amb" />
              </div>
            </div>

            {/* Ft feedback */}
            <div style={{
              padding: '10px 16px', borderRadius: 7, display: 'grid',
              gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center',
              background: ft < 0.85 ? 'var(--amber-dim)' : 'var(--green-dim)',
              border: `1px solid ${ft < 0.85 ? 'var(--amber)' : 'var(--green)'}`,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 2 }}>Ft (Tabela 40)</div>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', color: ft < 0.85 ? 'var(--amber)' : 'var(--green)' }}>
                  {ft.toFixed(3)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
                Fator de correção de temperatura para {projeto.isolacao} a {projeto.t_amb}°C (Tabela 40 NBR 5410).<br />
                {ft < 1.0
                  ? <>Iz' = Iz × {ft.toFixed(3)} — redução de <strong>{Math.round((1 - ft) * 100)}%</strong> na capacidade de condução.</>
                  : <>Temperatura abaixo de 30°C — leve aumento na capacidade de condução.</>}
                {ft < 0.85 && <><br /><strong style={{ color: 'var(--amber)' }}>⚠ Ft baixo — verifique se as seções calculadas compensam a redução.</strong></>}
              </div>
            </div>

            <div className="form-grid c3">
              <div className="fgroup">
                <label className="flabel">dU máx. circuitos terminais (%)</label>
                <input className="finput" type="number" value={projeto.du_max_pct}
                  onChange={upd('du_max_pct')} min={1} max={7} step={0.5}
                  style={borda('du_max_pct')} />
                <div className="fhint">NBR 5410 §6.2.7.2 — máx. 7% (ramal + circuito)</div>
                <ErroInline campo="du_max_pct" />
              </div>
              <div className="fgroup">
                <label className="flabel">dU reserva ramal de entrada (%)</label>
                <input className="finput" type="number" value={projeto.du_ramal_pct}
                  onChange={upd('du_ramal_pct')} min={0} max={3} step={0.5}
                  style={borda('du_ramal_pct')} />
                <div className="fhint">Típico: 0,5% — subtrai do limite dos circuitos</div>
                <ErroInline campo="du_ramal_pct" />
              </div>
              <div className="fgroup">
                <label className="flabel">Icc disponível na rede (kA)</label>
                <input className="finput" type="number" value={projeto.icc_rede_ka}
                  onChange={upd('icc_rede_ka')} min={0.5} max={25} step={0.5}
                  style={borda('icc_rede_ka')} />
                <div className="fhint">CEMIG padrão: 5 kA — solicitar à concessionária</div>
                <ErroInline campo="icc_rede_ka" />
              </div>
            </div>

          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, paddingBottom: 24 }}>
          <button className="btn primary" onClick={() => setPagina('comodos')}>
            Próximo: Previsão de Cargas →
          </button>
          <button className="btn" onClick={() => setPagina('dashboard')}>← Painel</button>
        </div>
      </div>

      {/* ── Coluna lateral: status + preview ─────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 }}>

        {/* Checklist de preenchimento */}
        <div className="card">
          <div className="card-header">Checklist</div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Nome da obra',      ok: !!projeto.nome && projeto.nome !== 'Novo Projeto' },
              { label: 'Endereço',          ok: !!projeto.endereco },
              { label: 'RT + CREA',         ok: !!projeto.projetista && !!projeto.crea },
              { label: 'Sistema / tensão',  ok: projeto.v_fase > 0 },
              { label: 'Método instalação', ok: !!projeto.metodo_instalacao },
              { label: 'Temperatura / Ft',  ok: projeto.t_amb >= 10 && projeto.t_amb <= 60 },
              { label: 'dU máximo',         ok: projeto.du_max_pct > 0 && projeto.du_max_pct <= 7 },
              { label: 'Icc da rede',       ok: projeto.icc_rede_ka > 0 },
              { label: 'Circuitos',         ok: ci.length > 0 },
              { label: 'Demanda calculada', ok: !!demanda },
            ].map(({ label, ok }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                  background: ok ? 'var(--green)' : 'var(--surface3)',
                  border: `1px solid ${ok ? 'var(--green)' : 'var(--border2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#fff', fontWeight: 700,
                }}>
                  {ok ? '✓' : ''}
                </div>
                <span style={{ color: ok ? 'var(--text)' : 'var(--text4)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Preview do cabeçalho do memorial */}
        <div className="card">
          <div className="card-header">Preview — cabeçalho do memorial</div>
          <div style={{ padding: '10px 14px', fontSize: 11, lineHeight: 1.9 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: projeto.nome && projeto.nome !== 'Novo Projeto' ? 'var(--text)' : 'var(--text4)' }}>
              {projeto.nome || 'Nome da obra'}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <tbody>
                {[
                  ['Endereço',   projeto.endereco   || '—'],
                  ['RT',         projeto.projetista || '—'],
                  ['CREA',       projeto.crea       || '—'],
                  ['Sistema',    `${projeto.sistema} ${projeto.v_fase}/${vLinha}V`],
                  ['Conc.',      projeto.concessionaria],
                  ['Método',     projeto.metodo_instalacao],
                  ['Condutor',   `${projeto.material_cabo === 'Cu' ? 'Cobre' : 'Alumínio'} ${projeto.isolacao} ${projeto.t_amb}°C`],
                  ['Ft',         ft.toFixed(3)],
                  ['dU máx.',    `${projeto.du_max_pct}%`],
                  ['Icc rede',   `${projeto.icc_rede_ka} kA`],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '2px 0', color: 'var(--text4)', width: 70 }}>{k}</td>
                    <td style={{ padding: '2px 0', fontFamily: 'var(--mono)', fontWeight: 500, color: v === '—' ? 'var(--text4)' : 'var(--text)' }}>{v}</td>
                  </tr>
                ))}
                {demanda && <>
                  <tr><td colSpan={2} style={{ padding: '4px 0', borderTop: '2px solid var(--border2)' }} /></tr>
                  {[
                    ['CI', `${demanda.ci_kw.toFixed(2)} kW`],
                    ['Demanda', `${demanda.dem_kw.toFixed(2)} kW`],
                    ['Disjuntor', `${demanda.in_geral} A — ${demanda.tipo_ligacao_cemig}`],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '2px 0', color: 'var(--text4)', width: 70 }}>{k}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{v}</td>
                    </tr>
                  ))}
                </>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Erros/avisos no lateral */}
        {erros.length > 0 && (
          <div className="card">
            <div className="card-header" style={{ color: nErr ? 'var(--red)' : 'var(--amber)' }}>
              {nErr ? `${nErr} erro(s) de preenchimento` : `${nAviso} aviso(s)`}
            </div>
            <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {erros.map(e => (
                <div key={e.msg} style={{ fontSize: 11, display: 'flex', gap: 6, color: e.tipo === 'erro' ? 'var(--red)' : 'var(--amber)' }}>
                  <span>{e.tipo === 'erro' ? '✗' : '⚠'}</span>
                  <span>{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
    </div>
  </>)
}
