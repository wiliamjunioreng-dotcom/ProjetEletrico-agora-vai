// src/pages/Precos.tsx — Orçamento SINAPI × SETOP
// Importação XLSX nativa · Material + Mão de Obra separados · Comparação paralela

import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { ItemOrc } from '../store/projectStore'
import {
  parsearXLSX, parsearCSV,
  buscarPreco, salvarTabela, carregarTabela, limparTabela,
} from '../core/sinapi'
import type { TabelaPrecos, TipoDesonerado } from '../core/sinapi'

const UFs = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// ── Tipos locais ──────────────────────────────────────────────────


// ── Gerar itens do orçamento ──────────────────────────────────────

function gerarItens(calc: any[], raw: any[], demanda: any): ItemOrc[] {
  const ci  = calc.filter((c: any) => c.potencia_va > 0)
  const rws = raw.filter((_: any, i: number) => (calc[i]?.potencia_va ?? 0) > 0)

  const cabos: Record<string, ItemOrc> = {}
  ci.forEach((c: any, i: number) => {
    const r = rws[i]
    if (!r || !c.secao_fase) return
    const comp  = (r.comprimento_m || 0) * 1.10
    const nCond = ['R','S','T'].includes(c.fase) ? 2 : 3
    const kF  = `cabo-${c.secao_fase}mm`
    const kPE = `pe-${c.secao_pe}mm`
    if (!cabos[kF]) cabos[kF] = { chave: kF, descr: `Cabo Cu PVC ${c.secao_fase}mm² (fase/neutro)`, qtd: 0, unidade: 'm' }
    if (!cabos[kPE]) cabos[kPE] = { chave: kPE, descr: `Cabo Cu PVC ${c.secao_pe}mm² (proteção PE)`, qtd: 0, unidade: 'm' }
    cabos[kF].qtd  += comp * nCond
    cabos[kPE].qtd += comp
  })

  const disjs: Record<string, ItemOrc> = {}
  ci.forEach((c: any) => {
    const k = `disj-${c.in_disj}A-${c.curva}`
    if (!disjs[k]) disjs[k] = { chave: k, descr: `Disjuntor monopolar ${c.in_disj}A Curva ${c.curva} 6kA`, qtd: 0, unidade: 'un' }
    disjs[k].qtd++
  })

  const totalCaboM = Object.values(cabos).reduce((s, c) => s + c.qtd, 0)
  const nIDR       = ci.filter((c: any) => c.idr).length

  const fixos: ItemOrc[] = [
    ...(demanda?.in_geral ? [{ chave: 'disj-geral', descr: `Disjuntor geral ${demanda.in_geral}A Curva C 10kA`, qtd: 1, unidade: 'un' }] : []),
    ...(nIDR > 0 ? [{ chave: 'idr-30mA', descr: 'IDR 30mA bipolar IEC 61008', qtd: nIDR, unidade: 'un' }] : []),
    { chave: 'elet-20', descr: 'Eletroduto PVC rigido 20mm', qtd: Math.ceil(totalCaboM * 0.4 / 3) * 3, unidade: 'm' },
    { chave: 'elet-25', descr: 'Eletroduto PVC rigido 25mm', qtd: Math.ceil(totalCaboM * 0.6 / 3) * 3, unidade: 'm' },
    ...(demanda?.n_total_qd ? [{ chave: 'qd', descr: `Quadro distribuicao ${demanda.n_total_qd} pos.`, qtd: 1, unidade: 'un' }] : []),
    // Serviços de MO
    { chave: 'mo-eletricista', descr: 'Eletricista instalacao eletrica residencial', qtd: Math.ceil(ci.length * 3), unidade: 'H' },
    { chave: 'mo-ajudante',    descr: 'Ajudante eletricista auxiliar', qtd: Math.ceil(ci.length * 2), unidade: 'H' },
  ]

  return [
    ...Object.values(cabos).map(c => ({ ...c, qtd: Math.ceil(c.qtd) })),
    ...Object.values(disjs),
    ...fixos,
  ].filter(i => i.qtd > 0)
}

// ── Componente ────────────────────────────────────────────────────

const COR_MATCH: Record<string, string> = {
  exato: 'var(--green)', alto: '#16a34a', medio: 'var(--amber)', baixo: '#d97706', '—': 'var(--text4)',
}

export function Precos() {
  const {
    circuitos_calc, circuitos_raw, demanda, projeto,
    orcamento_itens: itens, setOrcamentoItens: setItens,
    orcamento_estado_uf: estado, setOrcamentoEstadoUf: setEstado,
    orcamento_desoneracao: desoner, setOrcamentoDesoneracao: setDesoner,
  } = useProjectStore()

  const [tabelaSin, setTabelaSin] = useState<TabelaPrecos | null>(null)
  const [tabelaSet, setTabelaSet] = useState<TabelaPrecos | null>(null)
  const [carregando, setCarregando] = useState<'SINAPI' | 'SETOP' | null>(null)
  const [buscando,   setBuscando]   = useState(false)
  const [msg,        setMsg]        = useState<{ txt: string; tipo: 'ok' | 'err' | 'info' } | null>(null)
  const [editando,   setEditando]   = useState<{ chave: string; campo: string } | null>(null)
  const [vistaAtiva, setVistaAtiva] = useState<'material' | 'mo' | 'total'>('material')

  const refSin = useRef<HTMLInputElement>(null)
  const refSet = useRef<HTMLInputElement>(null)

  // Carregar tabelas salvas
  useEffect(() => {
    const sin = carregarTabela('SINAPI')
    const set = carregarTabela('SETOP')
    if (sin) setTabelaSin(sin)
    if (set) setTabelaSet(set)
  }, [])

  // Regenerar itens quando projeto muda
  useEffect(() => {
    const novos = gerarItens(circuitos_calc, circuitos_raw, demanda)
    setItens(prev => novos.map(n => ({ ...prev.find(p => p.chave === n.chave), ...n })))
  }, [circuitos_calc, demanda])

  function mostrarMsg(txt: string, tipo: 'ok' | 'err' | 'info') {
    setMsg({ txt, tipo })
    setTimeout(() => setMsg(null), 7000)
  }

  // Importar arquivo (XLSX ou CSV)
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, fonte: 'SINAPI' | 'SETOP') {
    const file = e.target.files?.[0]
    if (!file) return
    setCarregando(fonte)
    try {
      let result
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const buf = await file.arrayBuffer()
        result = await parsearXLSX(buf, fonte, estado, desoner)
      } else {
        const text = await file.text()
        result = parsearCSV(text, fonte, estado, desoner)
      }
      if (!result.ok || !result.tabela) {
        mostrarMsg(`Erro ${fonte}: ${result.erros?.join(', ') || 'formato invalido'}`, 'err')
        return
      }
      salvarTabela(result.tabela)
      if (fonte === 'SINAPI') setTabelaSin(result.tabela)
      else                    setTabelaSet(result.tabela)

      const avs = result.avisos?.length ? ` | Avisos: ${result.avisos.join('; ')}` : ''
      mostrarMsg(
        `${fonte} importado: ${result.total?.toLocaleString()} insumos · ` +
        `${result.tabela.total_material} materiais · ${result.tabela.total_mo} MO${avs}`,
        'ok'
      )
    } catch (err) {
      mostrarMsg(`Erro ao ler arquivo: ${String(err)}`, 'err')
    } finally {
      setCarregando(null)
      if (fonte === 'SINAPI' && refSin.current) refSin.current.value = ''
      if (fonte === 'SETOP'  && refSet.current) refSet.current.value = ''
    }
  }

  // Buscar preços automaticamente
  async function buscarTodos() {
    if (!tabelaSin && !tabelaSet) { mostrarMsg('Importe pelo menos uma tabela', 'err'); return }
    setBuscando(true)
    try {
      const novos = itens.map(item => {
        const next: ItemOrc = { ...item }
        const isMO = item.chave.startsWith('mo-')

        if (tabelaSin) {
          const resMat = buscarPreco(item.descr, tabelaSin, isMO ? 'Mao_de_Obra' : 'Material', 3)
          if (resMat[0] && resMat[0].score > 0.2) {
            next.preco_mat_sin   = resMat[0].insumo.preco
            next.insumo_mat_sin  = resMat[0].insumo
            next.match_mat_sin   = resMat[0].match
          }
          if (!isMO) {
            const resMO = buscarPreco(item.descr, tabelaSin, 'Mao_de_Obra', 3)
            if (resMO[0] && resMO[0].score > 0.2) {
              next.preco_mo_sin  = resMO[0].insumo.preco
              next.insumo_mo_sin = resMO[0].insumo
              next.match_mo_sin  = resMO[0].match
            }
          }
        }

        if (tabelaSet) {
          const resMat = buscarPreco(item.descr, tabelaSet, isMO ? 'Mao_de_Obra' : 'Material', 3)
          if (resMat[0] && resMat[0].score > 0.2) {
            next.preco_mat_set   = resMat[0].insumo.preco
            next.insumo_mat_set  = resMat[0].insumo
            next.match_mat_set   = resMat[0].match
          }
        }

        return next
      })
      setItens(novos)
      const n = novos.filter(i => (i.preco_mat_sin || i.preco_mat_set)).length
      mostrarMsg(`${n}/${novos.length} itens com preco encontrado`, 'ok')
    } finally {
      setBuscando(false)
    }
  }

  function editarPreco(chave: string, campo: string, valor: number) {
    setItens(prev => prev.map(i => i.chave === chave ? { ...i, [campo]: valor } : i))
    setEditando(null)
  }

  // Calcular totais
  function precoMat(item: ItemOrc) {
    return item.preco_mat_manual ?? item.preco_mat_sin ?? item.preco_mat_set ?? 0
  }
  function precoMO(item: ItemOrc) {
    return item.preco_mo_manual ?? item.preco_mo_sin ?? item.preco_mo_set ?? 0
  }

  const itensAtivos = itens.filter(i => !i.ignorar)
  const totalMat    = itensAtivos.reduce((s, i) => s + precoMat(i) * i.qtd, 0)
  const totalMO     = itensAtivos.reduce((s, i) => s + precoMO(i) * i.qtd, 0)
  const totalGeral  = totalMat + totalMO
  const nComPreco   = itensAtivos.filter(i => precoMat(i) > 0 || precoMO(i) > 0).length
  const cobertura   = itens.length > 0 ? Math.round(nComPreco / itens.length * 100) : 0

  // Delta SINAPI vs SETOP
  const totalMatSin = itensAtivos.reduce((s, i) => s + (i.preco_mat_sin ?? 0) * i.qtd, 0)
  const totalMatSet = itensAtivos.reduce((s, i) => s + (i.preco_mat_set ?? 0) * i.qtd, 0)
  const delta = totalMatSin > 0 && totalMatSet > 0
    ? Math.round((totalMatSet - totalMatSin) / totalMatSin * 100)
    : null

  function exportar() {
    const R = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    const linhas = [
      ['N', 'Descricao', 'Qtd', 'Un',
       'Mat SINAPI(R$)', 'Mat SETOP(R$)', 'MO SINAPI(R$)',
       'Total Mat(R$)', 'Total MO(R$)', 'Total(R$)',
       'Match Mat', 'Codigo SINAPI'],
      ...itensAtivos.map((item, i) => {
        const mat = precoMat(item), mo = precoMO(item)
        return [
          String(i+1), item.descr, String(item.qtd), item.unidade,
          item.preco_mat_sin ? R(item.preco_mat_sin) : '',
          item.preco_mat_set ? R(item.preco_mat_set) : '',
          item.preco_mo_sin  ? R(item.preco_mo_sin)  : '',
          mat > 0 ? R(mat * item.qtd) : '',
          mo  > 0 ? R(mo  * item.qtd) : '',
          R((mat + mo) * item.qtd),
          item.match_mat_sin || '',
          item.insumo_mat_sin?.codigo || '',
        ]
      }),
      [],
      ['', 'TOTAL MATERIAL', '', '', '', '', '', R(totalMat), '', '', ''],
      ['', 'TOTAL MAO DE OBRA', '', '', '', '', '', '', R(totalMO), '', ''],
      ['', 'TOTAL GERAL', '', '', '', '', '', '', '', R(totalGeral), ''],
    ]
    const csv = '\uFEFF' + linhas.map(l => l.map(v => `"${v}"`).join(';')).join('\n')
    const a   = document.createElement('a')
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `Orcamento_${((projeto as any).nome||'projeto').replace(/\s+/g,'_')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Componente de célula de preço editável
  function CelulaPreco({ item, campo, valor, cor = 'var(--text)' }: {
    item: ItemOrc; campo: string; valor: number; cor?: string
  }) {
    const ativa = editando?.chave === item.chave && editando?.campo === campo
    if (ativa) return (
      <input type="number" autoFocus defaultValue={valor || ''} min={0} step={0.01}
        style={{ width: 80, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, border: '1px solid var(--blue)', borderRadius: 3, padding: '0 4px' }}
        onBlur={e => editarPreco(item.chave, campo, parseFloat(e.target.value) || 0)}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    )
    return (
      <span onClick={() => setEditando({ chave: item.chave, campo })}
        title="Clique para editar"
        style={{ cursor: 'pointer', color: valor > 0 ? cor : 'var(--text4)', fontFamily: 'var(--mono)', fontSize: 11,
          borderBottom: '1px dashed var(--border2)' }}>
        {valor > 0 ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '— editar'}
      </span>
    )
  }

  // Painel de importação de uma tabela
  function PainelImport({ fonte, tabela, refInput }: { fonte: 'SINAPI' | 'SETOP'; tabela: TabelaPrecos | null; refInput: React.RefObject<HTMLInputElement | null> }) {
    const cor = fonte === 'SINAPI' ? 'var(--blue)' : 'var(--green)'
    return (
      <div className="card">
        <div className="card-header" style={{ borderLeft: `3px solid ${cor}` }}>
          <span style={{ color: cor, fontWeight: 700 }}>{fonte}</span>
          {fonte === 'SINAPI' ? ' — Caixa Econômica Federal' : ' — Estado de Minas Gerais'}
          {tabela && (
            <button className="btn danger" onClick={() => { limparTabela(fonte); fonte === 'SINAPI' ? setTabelaSin(null) : setTabelaSet(null) }}
              style={{ height: 24, fontSize: 10, marginLeft: 'auto' }}>
              Remover
            </button>
          )}
        </div>
        <div style={{ padding: 14 }}>
          {tabela ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                ['Competência', tabela.mes ? `${tabela.mes}/${tabela.ano}` : '—'],
                ['Insumos',     tabela.insumos.length.toLocaleString()],
                ['Materiais',   tabela.total_material.toLocaleString()],
                ['Mão de obra', tabela.total_mo.toLocaleString()],
                ['Estado',      tabela.estado || '—'],
                ['Encargos',    tabela.desonerado === 'desonerado' ? 'Desonerado' : 'Não desonerado'],
              ].map(([k, v]) => (
                <div key={k} style={{ fontSize: 11 }}>
                  <div style={{ color: 'var(--text4)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: cor }}>{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 10 }}>
              Nenhuma tabela carregada.
              {fonte === 'SINAPI'
                ? <> Baixe em <a href="https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>caixa.gov.br/sinapi</a> → Insumos → .xlsx</>
                : <> Baixe em <a href="https://www.setop.mg.gov.br" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>setop.mg.gov.br</a> → Custos Unitários</>
              }
            </div>
          )}
          <input ref={refInput} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }}
            onChange={e => handleFile(e, fonte)} />
          <button className="btn" onClick={() => refInput.current?.click()}
            disabled={carregando === fonte}
            style={{ width: '100%', justifyContent: 'center', borderColor: cor, color: cor }}>
            {carregando === fonte ? '⏳ Importando...' : tabela ? '🔄 Atualizar tabela' : `📂 Importar ${fonte} (.xlsx ou .csv)`}
          </button>
        </div>
      </div>
    )
  }

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Preços SINAPI / SETOP</div>
        <div className="page-sub">
          Importação .xlsx nativa · Material + Mão de Obra separados · Comparação paralela
        </div>
      </div>
      <div className="page-actions">
        {msg && <div className={`toast-bar ${msg.tipo}`} style={{ maxWidth: 380, fontSize: 11 }}>{msg.txt}</div>}
        {(tabelaSin || tabelaSet) && (
          <button className="btn" onClick={buscarTodos} disabled={buscando}>
            {buscando ? '⏳ Buscando...' : '🔍 Buscar preços'}
          </button>
        )}
        {nComPreco > 0 && (
          <button className="btn success" onClick={exportar}>Exportar CSV</button>
        )}
      </div>
    </div>

    {/* KPIs */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className={`kpi ${cobertura >= 80 ? 'ok' : cobertura >= 50 ? 'warn' : ''}`}>
        <div className="kpi-lbl">Cobertura</div>
        <div className="kpi-val">{cobertura}%</div>
        <div className="kpi-unit">{nComPreco}/{itens.length} itens</div>
      </div>
      <div className="kpi info">
        <div className="kpi-lbl">Total Material</div>
        <div className="kpi-val" style={{ fontSize: 18 }}>{totalMat > 0 ? totalMat.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Total Mão de Obra</div>
        <div className="kpi-val" style={{ fontSize: 18 }}>{totalMO > 0 ? totalMO.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</div>
      </div>
      <div className={`kpi ${totalGeral > 0 ? 'ok' : ''}`}>
        <div className="kpi-lbl">Total Geral</div>
        <div className="kpi-val" style={{ fontSize: 16 }}>{totalGeral > 0 ? totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</div>
      </div>
      <div className={`kpi ${delta === null ? '' : Math.abs(delta) <= 10 ? 'ok' : 'warn'}`}>
        <div className="kpi-lbl">SETOP vs SINAPI</div>
        <div className="kpi-val">{delta !== null ? `${delta > 0 ? '+' : ''}${delta}%` : '—'}</div>
        <div className="kpi-unit">{delta !== null ? (delta > 0 ? 'SETOP mais caro' : 'SETOP mais barato') : 'importe as duas tabelas'}</div>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Config + Importação */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* Config */}
        <div className="card">
          <div className="card-header">Config</div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="fgroup">
              <label className="flabel">Estado (UF)</label>
              <select className="fselect" value={estado} onChange={e => setEstado(e.target.value)}>
                {UFs.map(uf => <option key={uf}>{uf}</option>)}
              </select>
            </div>
            <div className="fgroup">
              <label className="flabel">Encargos</label>
              <select className="fselect" value={desoner} onChange={e => setDesoner(e.target.value as TipoDesonerado)}>
                <option value="nao_desonerado">Não desonerado</option>
                <option value="desonerado">Desonerado</option>
              </select>
            </div>
            <div className="fhint" style={{ lineHeight: 1.5 }}>
              Não desonerado = com encargos sociais (INSS 20% folha).<br/>
              Para obras privadas: usar Não desonerado.
            </div>
          </div>
        </div>

        {/* SINAPI */}
        <PainelImport fonte="SINAPI" tabela={tabelaSin} refInput={refSin} />
        {/* SETOP */}
        <PainelImport fonte="SETOP"  tabela={tabelaSet} refInput={refSet} />
      </div>

      {/* Abas de vista */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {(['material', 'mo', 'total'] as const).map(v => (
          <button key={v} onClick={() => setVistaAtiva(v)} style={{
            height: 36, padding: '0 16px', background: 'none', border: 'none',
            borderBottom: `2px solid ${vistaAtiva === v ? 'var(--blue)' : 'transparent'}`,
            color: vistaAtiva === v ? 'var(--blue)' : 'var(--text3)',
            fontSize: 12, fontWeight: vistaAtiva === v ? 600 : 400,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            {v === 'material' ? 'Material (R$)' : v === 'mo' ? 'Mão de Obra (R$)' : 'Total Consolidado'}
          </button>
        ))}
      </div>

      {/* Tabela de itens */}
      <div className="card">
        <div className="card-header">
          Orçamento — {itens.length} itens
          <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>
            clique no preço para editar manualmente
          </span>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table className="dtable">
            <thead>
              {vistaAtiva === 'material' && (
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Descrição</th>
                  <th className="r" style={{ width: 50 }}>Qtd</th>
                  <th style={{ width: 36 }}>Un</th>
                  <th className="r" style={{ width: 100, background: '#eaf2ff', color: 'var(--blue)' }}>Unit. SINAPI</th>
                  <th className="r" style={{ width: 100, background: '#e6f4ea', color: 'var(--green)' }}>Unit. SETOP</th>
                  <th className="r" style={{ width: 90, background: '#f6f2ff', color: 'var(--purple)' }}>Unit. Manual</th>
                  <th className="r" style={{ width: 100 }}>Total (R$)</th>
                  <th style={{ width: 80 }}>Match</th>
                </tr>
              )}
              {vistaAtiva === 'mo' && (
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Descrição</th>
                  <th className="r" style={{ width: 50 }}>Qtd</th>
                  <th style={{ width: 36 }}>Un</th>
                  <th className="r" style={{ width: 100, background: '#eaf2ff', color: 'var(--blue)' }}>MO SINAPI/h</th>
                  <th className="r" style={{ width: 90, background: '#f6f2ff', color: 'var(--purple)' }}>MO Manual/h</th>
                  <th className="r" style={{ width: 100 }}>Total MO (R$)</th>
                  <th style={{ width: 80 }}>Match</th>
                </tr>
              )}
              {vistaAtiva === 'total' && (
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Descrição</th>
                  <th className="r" style={{ width: 50 }}>Qtd</th>
                  <th style={{ width: 36 }}>Un</th>
                  <th className="r" style={{ width: 100 }}>Material (R$)</th>
                  <th className="r" style={{ width: 100 }}>MO (R$)</th>
                  <th className="r" style={{ width: 110, fontWeight: 700 }}>Total (R$)</th>
                  <th className="r" style={{ width: 90 }}>SETOP Δ%</th>
                </tr>
              )}
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text4)' }}>
                  Nenhum item — dimensione circuitos primeiro.
                </td></tr>
              ) : itens.map(item => {
                const mat = precoMat(item), mo = precoMO(item)
                const totalItem = (mat + mo) * item.qtd
                const deltaItem = item.preco_mat_sin && item.preco_mat_set
                  ? Math.round((item.preco_mat_set - item.preco_mat_sin) / item.preco_mat_sin * 100) : null
                const bgRow = item.ignorar ? { opacity: 0.4 } : {}
                return (
                  <tr key={item.chave} style={bgRow}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!item.ignorar}
                        onChange={e => setItens(prev => prev.map(i => i.chave === item.chave ? { ...i, ignorar: !e.target.checked } : i))} />
                    </td>
                    <td className="name" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descr}</td>
                    <td className="mono r">{item.qtd}</td>
                    <td style={{ color: 'var(--text4)', fontSize: 11 }}>{item.unidade}</td>

                    {vistaAtiva === 'material' && <>
                      <td className="r" style={{ background: '#f5f9ff' }}>
                        <CelulaPreco item={item} campo="preco_mat_sin" valor={item.preco_mat_sin || 0} cor="var(--blue)" />
                      </td>
                      <td className="r" style={{ background: '#f5fbf5' }}>
                        <CelulaPreco item={item} campo="preco_mat_set" valor={item.preco_mat_set || 0} cor="var(--green)" />
                      </td>
                      <td className="r" style={{ background: '#faf8ff' }}>
                        <CelulaPreco item={item} campo="preco_mat_manual" valor={item.preco_mat_manual || 0} cor="var(--purple)" />
                      </td>
                      <td className="mono r" style={{ fontWeight: 600 }}>
                        {mat > 0 ? (mat * item.qtd).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ fontSize: 10, color: COR_MATCH[item.match_mat_sin || '—'] }}>
                        {item.match_mat_sin || '—'}
                      </td>
                    </>}

                    {vistaAtiva === 'mo' && <>
                      <td className="r" style={{ background: '#f5f9ff' }}>
                        <CelulaPreco item={item} campo="preco_mo_sin" valor={item.preco_mo_sin || 0} cor="var(--blue)" />
                      </td>
                      <td className="r" style={{ background: '#faf8ff' }}>
                        <CelulaPreco item={item} campo="preco_mo_manual" valor={item.preco_mo_manual || 0} cor="var(--purple)" />
                      </td>
                      <td className="mono r" style={{ fontWeight: 600 }}>
                        {mo > 0 ? (mo * item.qtd).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ fontSize: 10, color: COR_MATCH[item.match_mo_sin || '—'] }}>
                        {item.match_mo_sin || '—'}
                      </td>
                    </>}

                    {vistaAtiva === 'total' && <>
                      <td className="mono r">{mat > 0 ? (mat * item.qtd).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                      <td className="mono r">{mo  > 0 ? (mo  * item.qtd).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                      <td className="mono r" style={{ fontWeight: 700, color: totalItem > 0 ? 'var(--blue)' : 'var(--text4)' }}>
                        {totalItem > 0 ? totalItem.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="mono r" style={{ color: deltaItem === null ? 'var(--text4)' : deltaItem > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {deltaItem !== null ? `${deltaItem > 0 ? '+' : ''}${deltaItem}%` : '—'}
                      </td>
                    </>}
                  </tr>
                )
              })}

              {/* Linha de totais */}
              {itens.length > 0 && vistaAtiva === 'total' && (
                <tr style={{ background: 'var(--surface2)', fontWeight: 700, borderTop: '2px solid var(--border2)' }}>
                  <td colSpan={4} style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12 }}>TOTAIS</td>
                  <td className="mono r" style={{ color: 'var(--blue)' }}>{totalMat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="mono r" style={{ color: 'var(--text2)' }}>{totalMO.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="mono r" style={{ color: 'var(--blue)', fontSize: 13 }}>{totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="mono r" style={{ color: delta === null ? 'var(--text4)' : delta > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {delta !== null ? `${delta > 0 ? '+' : ''}${delta}%` : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nota */}
      <div style={{ padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        <strong>Como usar:</strong> (1) Configure o estado e o tipo de encargo. (2) Importe a tabela SINAPI e/ou SETOP (.xlsx direto, sem precisar converter). (3) Clique em "Buscar preços" — o motor de matching encontra os insumos por similaridade de descrição. (4) Clique em qualquer preço para corrigir manualmente. (5) Exporte o orçamento em CSV para cotação final.<br/>
        <strong>Material vs. Mão de Obra:</strong> o SINAPI classifica automaticamente — cabos, disjuntores e eletrodutos vão para Material; eletricista e ajudante vão para MO. A aba "Total Consolidado" soma os dois.
      </div>
    </div>
    </div>
  </>)
}
