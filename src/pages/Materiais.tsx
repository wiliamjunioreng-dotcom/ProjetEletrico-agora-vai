// src/pages/Materiais.tsx — Lista de materiais quantificada
import { useProjectStore } from '../store/projectStore'
import { calcQuantCircuito, calcResumoMateriais } from '../core/quantitativos'

export function Materiais() {
  const { circuitos_calc, circuitos_raw, projeto, demanda } = useProjectStore()
  const ci  = circuitos_calc.filter(c => c.potencia_va > 0)
  const raw = circuitos_raw.filter((_, i) => (circuitos_calc[i]?.potencia_va ?? 0) > 0)

  const isolacao = (projeto as any).isolacao || 'PVC'
  const material = (projeto as any).material_cabo || 'Cu'
  const mat_label = material === 'Cu' ? 'Cu' : 'Al'

  // ── Cabos ──────────────────────────────────────────────────────
  const cabos: Record<string, { descr: string; metros: number; cor: string }> = {}
  ci.forEach((c, i) => {
    const r = raw[i]
    if (!r || !c.secao_fase) return
    const comp = (r.comprimento_m || 0) * 1.10 // +10% folga
    const n_cond_fase = ['R','S','T'].includes(c.fase) ? 2 : 3 // F+N ou F+F+N

    const kF  = `${mat_label}-${isolacao}-${c.secao_fase}`
    const kPE = `${mat_label}-${isolacao}-PE-${c.secao_pe}`

    if (!cabos[kF])  cabos[kF]  = { descr: `Cabo ${mat_label} ${isolacao} ${c.secao_fase}mm² — fase/neutro`, metros: 0, cor: '#0f62fe' }
    if (!cabos[kPE]) cabos[kPE] = { descr: `Cabo ${mat_label} ${isolacao} ${c.secao_pe}mm² — proteção (verde/amarelo)`, metros: 0, cor: '#0f9d58' }

    cabos[kF].metros  += comp * n_cond_fase
    cabos[kPE].metros += comp
  })

  // ── Disjuntores ────────────────────────────────────────────────
  const disj: Record<string, { descr: string; qtd: number }> = {}
  ci.forEach(c => {
    const k = `disj-${c.in_disj}-${c.curva}`
    if (!disj[k]) disj[k] = { descr: `Disjuntor ${c.in_disj}A Curva ${c.curva} — IEC 60898 6kA`, qtd: 0 }
    disj[k].qtd++
  })

  // Disjuntor geral
  const in_geral = demanda?.in_geral || 0
  if (in_geral > 0) {
    disj['geral'] = { descr: `Disjuntor geral ${in_geral}A Curva C — 10kA — ${demanda?.tipo_ligacao_cemig || ''}`, qtd: 1 }
  }

  // ── IDR ────────────────────────────────────────────────────────
  const n_idr = ci.filter(c => c.idr).length
  const idr_items = n_idr > 0 ? [
    { descr: 'IDR 30mA bipolar — IEC 61008 (DR para áreas molhadas)', qtd: n_idr },
  ] : []

  // ── Quantitativos automáticos do domínio espacial ──────────────
  const quants = ci.map((circ, i) => calcQuantCircuito(
    { id: circ.id, descricao: circ.descricao, tipo: circ.tipo,
      comprimento_m: raw[i]?.comprimento_m,
      n_fases: (raw[i]?.fase === 'RST' ? 3 : (raw[i]?.fase?.length ?? 1) > 1 ? 2 : 1) as 1|2|3 },
    { secao_fase: circ.secao_fase, in_disj: circ.in_disj }
  ))
  const resumo = calcResumoMateriais(quants)

  const metros_eletroduto_20 = resumo.eletrodutos.find(e => e.diametro_mm === 20)?.metros_total ?? 0
  const metros_eletroduto_25 = resumo.eletrodutos.find(e => e.diametro_mm === 25)?.metros_total ?? 0

  const caixas = resumo.caixas.map(c => ({ descr: c.descricao, qtd: c.qtd }))

  // ── QD ────────────────────────────────────────────────────────
  const n_qd = demanda?.n_total_qd || 0
  const qd_item = n_qd > 0 ? [{ descr: `Quadro de distribuição embutir ${n_qd} disjuntores — ${n_qd} posições NBR 5410`, qtd: 1 }] : []

  // ── Função exportar CSV ───────────────────────────────────────
  function exportarCSV() {
    const linhas: string[][] = [
      ['Item', 'Descrição', 'Quantidade', 'Unidade'],
      ...Object.values(cabos)
        .sort((a, b) => b.metros - a.metros)
        .map(c => ['Condutor', c.descr, String(Math.ceil(c.metros)), 'm']),
      ...Object.values(disj)
        .map(d => ['Proteção', d.descr, String(d.qtd), 'un']),
      ...idr_items.map(d => ['Proteção', d.descr, String(d.qtd), 'un']),
      ['Eletroduto', `Eletroduto PVC rígido 20mm — circuitos leves`, String(metros_eletroduto_20), 'm'],
      ['Eletroduto', `Eletroduto PVC rígido 25mm — circuitos gerais`, String(metros_eletroduto_25), 'm'],
      ...caixas.map(c => ['Caixa', c.descr, String(c.qtd), 'un']),
      ...qd_item.map(q => ['QD', q.descr, String(q.qtd), 'un']),
    ]
    const csv = '\uFEFF' + linhas.map(l => l.map(v => `"${v}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `Materiais_${((projeto as any).nome||'projeto').replace(/\s+/g,'_')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const Section = ({ title, items, unit = 'un', cor = 'var(--blue)' }: {
    title: string
    items: { descr: string; qtd: number; cor?: string }[]
    unit?: string
    cor?: string
  }) => (
    <div className="card">
      <div className="card-header" style={{ borderLeft: `3px solid ${cor}` }}>
        {title}
        <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>
          {items.length} item(s)
        </span>
      </div>
      <table className="dtable">
        <thead><tr>
          <th>Descrição</th>
          <th className="r" style={{ width: 70 }}>Qtd</th>
          <th style={{ width: 40 }}>Un</th>
        </tr></thead>
        <tbody>
          {items.length === 0
            ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text4)', padding: 12 }}>Nenhum item</td></tr>
            : items.map((item, i) => (
              <tr key={i}>
                <td className="name">{item.descr}</td>
                <td className="mono r" style={{ fontWeight: 700, color: cor }}>
                  {item.qtd}
                </td>
                <td style={{ color: 'var(--text4)', fontSize: 11 }}>{unit}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  )

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Lista de Materiais</div>
        <div className="page-sub">
          Quantitativos automáticos · +10% de folga nos cabos · estimativa de eletrodutos e caixas
        </div>
      </div>
      <div className="page-actions">
        <button className="btn" onClick={exportarCSV} disabled={ci.length === 0}>
          Exportar CSV
        </button>
      </div>
    </div>

    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
      <div className="kpi info">
        <div className="kpi-lbl">Metros de cabo</div>
        <div className="kpi-val">{Math.ceil(Object.values(cabos).reduce((s,c)=>s+c.metros,0))}</div>
        <div className="kpi-unit">m (com 10% de folga)</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Disjuntores</div>
        <div className="kpi-val">{Object.values(disj).reduce((s,d)=>s+d.qtd,0)}</div>
        <div className="kpi-unit">unidades (incluindo geral)</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">IDR 30mA</div>
        <div className="kpi-val" style={{ color: n_idr > 0 ? 'var(--red)' : 'var(--text4)' }}>{n_idr}</div>
        <div className="kpi-unit">áreas molhadas</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Circuitos</div>
        <div className="kpi-val">{ci.length}</div>
        <div className="kpi-unit">dimensionados</div>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

      <Section
        title="Condutores elétricos"
        unit="m"
        cor="var(--blue)"
        items={Object.values(cabos)
          .sort((a, b) => b.metros - a.metros)
          .map(c => ({ descr: c.descr, qtd: Math.ceil(c.metros) }))}
      />

      <Section
        title="Dispositivos de proteção"
        cor="var(--red)"
        items={[
          ...Object.entries(disj)
            .sort((a, b) => {
              const aIn = parseInt(a[0].split('-')[1]) || 0
              const bIn = parseInt(b[0].split('-')[1]) || 0
              return bIn - aIn
            })
            .map(([_, d]) => ({ descr: d.descr, qtd: d.qtd })),
          ...idr_items,
        ]}
      />

      <Section
        title="Eletrodutos e caixas (estimativa)"
        cor="var(--amber)"
        items={[
          { descr: 'Eletroduto PVC rígido 20mm — circuitos leves (ILUM)', qtd: metros_eletroduto_20 },
          { descr: 'Eletroduto PVC rígido 25mm — circuitos TUG/TUE', qtd: metros_eletroduto_25 },
          ...caixas,
        ]}
      />

      <Section
        title="Quadro de distribuição e acessórios"
        cor="var(--purple)"
        items={[
          ...qd_item,
          { descr: 'Barramento de neutro — DIN para QD', qtd: 1 },
          { descr: 'Barramento de terra (PE) — DIN para QD', qtd: 1 },
          { descr: 'Bornes de conexão 4mm² — bloco 12 vias', qtd: Math.ceil(ci.length / 6) },
        ]}
      />

    </div>

    {/* Notas */}
    <div style={{ padding: '0 22px 22px' }}>
      <div style={{ padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        <strong>Observações:</strong><br />
        • Quantitativos de cabo calculados com 10% de folga sobre os comprimentos informados nos circuitos.<br />
        • Eletrodutos e caixas são estimativas — dimensionamento exato depende do projeto civil.<br />
        • Preços não incluídos — exportar CSV e completar com cotação local.<br />
        • Para projetos comerciais/industriais, o memorial descritivo deve incluir especificação detalhada por fabricante.
      </div>
    </div>
    </div>
  </>)
}
