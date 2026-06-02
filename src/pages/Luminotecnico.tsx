// src/pages/Luminotecnico.tsx
// Dimensionamento luminotécnico — Método dos Lúmens — NBR ISO/CIE 8995-1

import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { calcLuminotecnico } from '../core/engine'
import type { LuminoInput } from '../core/engine'

// Iluminâncias recomendadas por ambiente (NBR ISO/CIE 8995-1 + NBR 5413)
const ILUMINANCIAS: Record<string, { lux: number; desc: string }> = {
  'Sala de estar':        { lux: 200,  desc: 'Residencial — área social' },
  'Quarto de casal':      { lux: 150,  desc: 'Residencial — repouso' },
  'Quarto infantil':      { lux: 300,  desc: 'Residencial — leitura/estudo' },
  'Cozinha — geral':      { lux: 200,  desc: 'Residencial — circulação' },
  'Cozinha — bancada':    { lux: 500,  desc: 'Residencial — tarefa visual' },
  'Banheiro':             { lux: 200,  desc: 'Residencial — higiene' },
  'Escritório — geral':   { lux: 500,  desc: 'Comercial — trabalho' },
  'Escritório — tela':    { lux: 300,  desc: 'Comercial — VDT NBR 5413' },
  'Corredor':             { lux: 100,  desc: 'Circulação' },
  'Escada':               { lux: 150,  desc: 'Circulação — risco' },
  'Garagem':              { lux: 100,  desc: 'Veículos — circulação' },
  'Lavanderia':           { lux: 200,  desc: 'Tarefa moderada' },
  'Loja — geral':         { lux: 500,  desc: 'Comercial — exposição' },
  'Sala de reunião':      { lux: 500,  desc: 'Comercial — apresentação' },
  'Refeitório':           { lux: 200,  desc: 'Alimentação' },
  'Outro':                { lux: 300,  desc: 'Personalizado' },
}

// Luminárias típicas para seleção
const LUMINARIAS = [
  { nome: 'LED Painel 40W/3600lm', pot: 40,  lm: 3600 },
  { nome: 'LED Downlight 20W/2000lm', pot: 20, lm: 2000 },
  { nome: 'LED Downlight 9W/900lm',  pot: 9,  lm: 900  },
  { nome: 'LED Tube T8 18W/1800lm',  pot: 18, lm: 1800 },
  { nome: 'LED Tube T8 9W/900lm',    pot: 9,  lm: 900  },
  { nome: 'LED Spot 7W/600lm',       pot: 7,  lm: 600  },
  { nome: 'LED High Bay 100W/12000lm',pot:100, lm:12000 },
  { nome: 'Personalizada',           pot: 0,  lm: 0    },
]

interface AmbienteCalc {
  id: string
  nome: string
  ambiente: string
  comp: number
  larg: number
  pe: number
  h_trabalho: number
  lux: number
  luminaria_idx: number
  pot_custom: number
  lm_custom: number
  refl_teto: number
  refl_parede: number
  refl_piso: number
}

const EMPTY: Omit<AmbienteCalc, 'id'> = {
  nome: '', ambiente: 'Sala de estar',
  comp: 0, larg: 0, pe: 2.8, h_trabalho: 0.75,
  lux: 200, luminaria_idx: 0,
  pot_custom: 0, lm_custom: 0,
  refl_teto: 0.7, refl_parede: 0.5, refl_piso: 0.2,
}

export function Luminotecnico() {
  const { comodos } = useProjectStore()
  const [ambientes, setAmbientes] = useState<AmbienteCalc[]>([])
  const [form, setForm] = useState<Omit<AmbienteCalc, 'id'>>({ ...EMPTY })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  function upd(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
      setForm(f => {
        const next = { ...f, [k]: v }
        // Auto-preencher lux do ambiente
        if (k === 'ambiente' && ILUMINANCIAS[v as string]) {
          next.lux = ILUMINANCIAS[v as string].lux
        }
        // Auto-preencher luminárias
        if (k === 'luminaria_idx') {
          const lum = LUMINARIAS[Number(v)]
          if (lum && lum.pot > 0) {
            next.pot_custom = lum.pot
            next.lm_custom  = lum.lm
          }
        }
        return next
      })
    }
  }

  function adicionar() {
    const e: Record<string, string> = {}
    if (!form.nome.trim()) e.nome = 'Obrigatório'
    if (form.comp <= 0)    e.comp = 'Informe o comprimento'
    if (form.larg <= 0)    e.larg = 'Informe a largura'
    if (form.lux <= 0)     e.lux  = 'Informe a iluminância'
    const lum = LUMINARIAS[form.luminaria_idx]
    const pot = lum?.pot > 0 ? lum.pot : form.pot_custom
    const lm  = lum?.lm  > 0 ? lum.lm  : form.lm_custom
    if (pot <= 0 || lm <= 0) e.luminaria_idx = 'Selecione a luminária ou informe pot/lm'
    if (Object.keys(e).length) { setErros(e); return }
    setErros({})
    const id = crypto.randomUUID()
    setAmbientes(prev => [...prev, { ...form, id, pot_custom: pot, lm_custom: lm }])
    setActiveId(id)
  }

  function remover(id: string) {
    setAmbientes(prev => prev.filter(a => a.id !== id))
    if (activeId === id) setActiveId(null)
  }

  // Calcular resultado para um ambiente
  function calcular(a: AmbienteCalc) {
    const lum = LUMINARIAS[a.luminaria_idx]
    const pot = lum?.pot > 0 ? lum.pot : a.pot_custom
    const lm  = lum?.lm  > 0 ? lum.lm  : a.lm_custom
    const input: LuminoInput = {
      area_m2:        a.comp * a.larg,
      pe_direito_m:   a.pe,
      h_plano_trabalho: a.h_trabalho,
      iluminancia_lux: a.lux,
      refl_teto:      a.refl_teto,
      refl_parede:    a.refl_parede,
      refl_piso:      a.refl_piso,
      luminaria_lm:   lm,
      luminaria_pot_w: pot,
    }
    return calcLuminotecnico(a.comp, a.larg, input)
  }

  // Totais
  const totais = ambientes.map(a => calcular(a))
  const total_pot = totais.reduce((s, r) => s + r.pot_total_w, 0)
  const total_lum = totais.reduce((s, r) => s + r.n_luminarias, 0)
  const area_total = ambientes.reduce((s, a) => s + a.comp * a.larg, 0)
  const dpf_medio = area_total > 0 ? total_pot / area_total : 0

  // Preencher automaticamente dos cômodos do projeto
  function importarComodos() {
    const novos: AmbienteCalc[] = comodos
      .filter(c => c.area_m2 > 0)
      .map(c => {
        // Estimar comp e larg de perímetro e área
        const comp = Math.sqrt(c.area_m2 * 1.4)
        const larg = c.area_m2 / comp
        const amb  = c.tipo === 'Banho' ? 'Banheiro'
                   : c.tipo === 'Cozinha' ? 'Cozinha — geral'
                   : c.tipo === 'Lavanderia' ? 'Lavanderia'
                   : c.tipo === 'Garagem' ? 'Garagem'
                   : 'Sala de estar'
        return {
          id:           crypto.randomUUID(),
          nome:         c.nome,
          ambiente:     amb,
          comp:         Math.round(comp * 10) / 10,
          larg:         Math.round(larg * 10) / 10,
          pe:           c.pe_direito_m || 2.8,
          h_trabalho:   0.75,
          lux:          ILUMINANCIAS[amb]?.lux || 200,
          luminaria_idx: 2, // LED Downlight 9W padrão
          pot_custom:   9,
          lm_custom:    900,
          refl_teto:    0.7,
          refl_parede:  0.5,
          refl_piso:    0.2,
        }
      })
    setAmbientes(prev => [...prev, ...novos])
  }

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Luminotécnico</div>
        <div className="page-sub">
          Método dos Lúmens · NBR ISO/CIE 8995-1 · NBR 5413 · {ambientes.length} ambientes
        </div>
      </div>
      <div className="page-actions">
        {comodos.length > 0 && (
          <button className="btn" onClick={importarComodos}>
            Importar cômodos ({comodos.length})
          </button>
        )}
      </div>
    </div>

    {/* KPIs */}
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
      <div className="kpi info">
        <div className="kpi-lbl">Ambientes</div>
        <div className="kpi-val">{ambientes.length}</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Total luminárias</div>
        <div className="kpi-val">{total_lum}</div>
        <div className="kpi-unit">unidades</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Potência total</div>
        <div className="kpi-val">{(total_pot / 1000).toFixed(2)}</div>
        <div className="kpi-unit">kW instalados</div>
      </div>
      <div className={`kpi ${dpf_medio <= 12 ? 'ok' : 'warn'}`}>
        <div className="kpi-lbl">DPF médio</div>
        <div className="kpi-val">{dpf_medio.toFixed(1)}</div>
        <div className="kpi-unit">W/m² {dpf_medio <= 12 ? '· eficiente' : '· revisar'}</div>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start' }}>

      {/* Formulário de entrada */}
      <div className="card" style={{ position: 'sticky', top: 0 }}>
        <div className="card-header">Novo ambiente</div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div className="fgroup">
            <label className="flabel">Nome do ambiente</label>
            <input className="finput" value={form.nome}
              onChange={upd('nome')} placeholder="Ex: Sala de Estar"
              style={{ borderColor: erros.nome ? 'var(--red)' : '' }} />
            {erros.nome && <div style={{ fontSize: 10, color: 'var(--red)' }}>{erros.nome}</div>}
          </div>

          <div className="fgroup">
            <label className="flabel">Tipo de ambiente</label>
            <select className="fselect" value={form.ambiente} onChange={upd('ambiente')}>
              {Object.entries(ILUMINANCIAS).map(([k, v]) => (
                <option key={k} value={k}>{k} — {v.desc}</option>
              ))}
            </select>
          </div>

          {/* Dimensões */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div className="fgroup">
              <label className="flabel">Comp. (m)</label>
              <input className="finput" type="number" value={form.comp || ''} min={0} step={0.1}
                onChange={upd('comp')} placeholder="m"
                style={{ borderColor: erros.comp ? 'var(--red)' : '' }} />
            </div>
            <div className="fgroup">
              <label className="flabel">Larg. (m)</label>
              <input className="finput" type="number" value={form.larg || ''} min={0} step={0.1}
                onChange={upd('larg')} placeholder="m"
                style={{ borderColor: erros.larg ? 'var(--red)' : '' }} />
            </div>
            <div className="fgroup">
              <label className="flabel">Pé dir. (m)</label>
              <input className="finput" type="number" value={form.pe} min={2} step={0.1}
                onChange={upd('pe')} />
            </div>
          </div>

          {/* Iluminância */}
          <div className="fgroup">
            <label className="flabel">
              Iluminância (lux) — NBR ISO/CIE 8995-1
            </label>
            <input className="finput" type="number" value={form.lux} min={50} step={50}
              onChange={upd('lux')} style={{ borderColor: erros.lux ? 'var(--red)' : '' }} />
            <div className="fhint">
              {ILUMINANCIAS[form.ambiente]?.desc || 'Valor personalizado'}
            </div>
          </div>

          {/* Luminária */}
          <div className="fgroup">
            <label className="flabel">Luminária</label>
            <select className="fselect" value={form.luminaria_idx} onChange={upd('luminaria_idx')}
              style={{ borderColor: erros.luminaria_idx ? 'var(--red)' : '' }}>
              {LUMINARIAS.map((l, i) => (
                <option key={i} value={i}>{l.nome}</option>
              ))}
            </select>
          </div>

          {/* Campos personalizados se "Personalizada" */}
          {form.luminaria_idx === LUMINARIAS.length - 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="fgroup">
                <label className="flabel">Potência (W)</label>
                <input className="finput" type="number" value={form.pot_custom || ''} min={0}
                  onChange={upd('pot_custom')} />
              </div>
              <div className="fgroup">
                <label className="flabel">Fluxo (lm)</label>
                <input className="finput" type="number" value={form.lm_custom || ''} min={0}
                  onChange={upd('lm_custom')} />
              </div>
            </div>
          )}

          {/* Refletâncias */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="flabel" style={{ marginBottom: 6 }}>
              Refletâncias das superfícies
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { k: 'refl_teto' as const,   label: 'Teto',   hint: 'Branco=0.8' },
                { k: 'refl_parede' as const, label: 'Paredes',hint: 'Médio=0.5' },
                { k: 'refl_piso' as const,   label: 'Piso',   hint: 'Escuro=0.2' },
              ].map(({ k, label, hint }) => (
                <div key={k} className="fgroup">
                  <label className="flabel">{label}</label>
                  <input className="finput" type="number" value={form[k]} min={0} max={1} step={0.05}
                    onChange={upd(k)} />
                  <div className="fhint">{hint}</div>
                </div>
              ))}
            </div>
          </div>

          <button className="btn primary" onClick={adicionar}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            + Calcular ambiente
          </button>
        </div>
      </div>

      {/* Resultados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {ambientes.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text4)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💡</div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Nenhum ambiente calculado</div>
            <div style={{ fontSize: 11 }}>
              {comodos.length > 0
                ? 'Clique em "Importar cômodos" ou preencha o formulário'
                : 'Preencha o formulário ao lado'}
            </div>
          </div>
        ) : ambientes.map(a => {
          const r    = calcular(a)
          const isActive = activeId === a.id
          const lum  = LUMINARIAS[a.luminaria_idx]
          const nomeLum = lum?.nome || 'Personalizada'
          const area = a.comp * a.larg
          const dpfOk = r.dpf <= 12

          return (
            <div key={a.id} className="card"
              onClick={() => setActiveId(isActive ? null : a.id)}
              style={{ cursor: 'pointer', borderColor: isActive ? 'var(--blue)' : '', outline: isActive ? '2px solid var(--blue-line)' : 'none' }}>
              <div className="card-header">
                <span style={{ fontWeight: 600 }}>{a.nome}</span>
                <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 8 }}>
                  {a.comp}m × {a.larg}m = {area.toFixed(1)}m² · {a.lux} lux
                </span>
                <button onClick={e => { e.stopPropagation(); remover(a.id) }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 18 }}>
                  ×
                </button>
              </div>

              {/* Resultado resumido */}
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  ['Luminárias', r.n_luminarias, 'un.', '#0f62fe'],
                  ['Potência', r.pot_total_w, 'W',  '#6929c4'],
                  ['Em real', r.em_real, 'lux', '#0f9d58'],
                  ['DPF', r.dpf, 'W/m²', dpfOk ? '#0f9d58' : '#f59e0b'],
                ].map(([l, v, u, c]) => (
                  <div key={l as string} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c as string, fontFamily: 'var(--mono)' }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text4)' }}>{u}</div>
                  </div>
                ))}
              </div>

              {/* Detalhe expandido */}
              {isActive && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                    {/* Memória de cálculo */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Memória de cálculo
                      </div>
                      {[
                        ['Ambiente', `${a.comp}m × ${a.larg}m × ${a.pe}m`],
                        ['Área', `${area.toFixed(2)} m²`],
                        ['Índice do local (k)', r.k.toFixed(2)],
                        ['Fator de utilização (CU)', r.cu.toFixed(3)],
                        ['Fator de manutenção (FM)', r.fm.toFixed(2)],
                        ['Iluminância requerida', `${a.lux} lux`],
                        ['Fluxo total necessário', `${Math.round(a.lux * area / (r.cu * r.fm))} lm`],
                        ['Luminária', nomeLum],
                        ['Fluxo/luminária', `${a.lm_custom || lum?.lm} lm`],
                        ['N° luminárias (exato)', r.n_raw.toFixed(2)],
                        ['N° luminárias (adotado)', r.n_luminarias],
                        ['Em real atingida', `${r.em_real} lux`],
                        ['Densidade de potência', `${r.dpf} W/m²`],
                      ].map(([k, v]) => (
                        <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--text3)' }}>{k}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Arranjos e planta */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Arranjos sugeridos
                      </div>
                      {r.arranjos.map((arr, i) => (
                        <div key={i} style={{
                          padding: '6px 10px', marginBottom: 6,
                          background: i === 0 ? 'var(--blue-dim)' : 'var(--surface2)',
                          border: `1px solid ${i === 0 ? 'var(--blue)' : 'var(--border)'}`,
                          borderRadius: 6, fontSize: 11,
                        }}>
                          <div style={{ fontWeight: 600, color: i === 0 ? 'var(--blue)' : 'var(--text2)' }}>
                            {arr.desc} {i === 0 ? '★ recomendado' : ''}
                          </div>
                          {arr.espac_x > 0 && (
                            <div style={{ color: 'var(--text3)', marginTop: 2 }}>
                              Espaç. X: {arr.espac_x}m · Y: {arr.espac_y}m
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Mini planta SVG */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 4 }}>Planta esquemática</div>
                        <PlantaLuminarias
                          comp={a.comp} larg={a.larg}
                          arranjo={r.arranjos[0]}
                          n={r.n_luminarias}
                        />
                      </div>

                      {/* Norma */}
                      <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 10, color: 'var(--text3)' }}>
                        <strong>Norma:</strong> NBR ISO/CIE 8995-1:2013<br />
                        Em ≥ {a.lux} lux · DPF ≤ 12 W/m² (LED eficiente)
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Tabela resumo geral */}
        {ambientes.length > 1 && (
          <div className="card">
            <div className="card-header">Resumo geral — todos os ambientes</div>
            <table className="dtable">
              <thead><tr>
                <th>Ambiente</th>
                <th className="r">Área (m²)</th>
                <th className="r">lux req.</th>
                <th className="r">k</th>
                <th className="r">CU</th>
                <th className="r">N° lum.</th>
                <th className="r">Pot. (W)</th>
                <th className="r">Em (lux)</th>
                <th className="r">DPF W/m²</th>
              </tr></thead>
              <tbody>
                {ambientes.map((a) => {
                  const r = calcular(a)
                  const area = a.comp * a.larg
                  return (
                    <tr key={a.id}>
                      <td className="name">{a.nome}</td>
                      <td className="mono r">{area.toFixed(1)}</td>
                      <td className="mono r">{a.lux}</td>
                      <td className="mono r">{r.k}</td>
                      <td className="mono r">{r.cu}</td>
                      <td className="mono r" style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.n_luminarias}</td>
                      <td className="mono r">{r.pot_total_w}</td>
                      <td className="mono r" style={{ color: r.em_real >= a.lux ? 'var(--green)' : 'var(--red)' }}>{r.em_real}</td>
                      <td className="mono r" style={{ color: r.dpf <= 12 ? 'var(--green)' : 'var(--amber)' }}>{r.dpf}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: 'var(--surface2)', fontWeight: 600 }}>
                  <td className="name">TOTAL</td>
                  <td className="mono r">{area_total.toFixed(1)}</td>
                  <td colSpan={3} />
                  <td className="mono r" style={{ color: 'var(--blue)' }}>{total_lum}</td>
                  <td className="mono r">{total_pot}</td>
                  <td colSpan={1} />
                  <td className="mono r" style={{ color: dpf_medio <= 12 ? 'var(--green)' : 'var(--amber)' }}>{dpf_medio.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
    </div>
  </>)
}

// Mini planta de luminárias em SVG
function PlantaLuminarias({ comp, larg, arranjo, n }: {
  comp: number; larg: number
  arranjo: { desc: string; espac_x: number; espac_y: number }
  n: number
}) {
  const W = 200, H = 130
  const escala = Math.min((W - 20) / comp, (H - 20) / larg)
  const pw = comp * escala, ph = larg * escala
  const ox = (W - pw) / 2, oy = (H - ph) / 2

  // Parsear arranjo "C col × R lin"
  const match = arranjo.desc.match(/(\d+)\s*col\s*×\s*(\d+)\s*lin/)
  const cols  = match ? parseInt(match[1]) : 1
  const rows  = match ? parseInt(match[2]) : n
  const pontos: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pontos.push([
        ox + (pw / (cols + 1)) * (c + 1),
        oy + (ph / (rows + 1)) * (r + 1),
      ])
    }
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
      {/* Planta */}
      <rect x={ox} y={oy} width={pw} height={ph}
        fill="none" stroke="var(--text3)" strokeWidth={1} strokeDasharray="3 2" />
      {/* Dimensões */}
      <text x={W / 2} y={oy - 4} textAnchor="middle" fontSize={8} fill="var(--text4)" fontFamily="var(--mono)">
        {comp}m
      </text>
      <text x={ox - 4} y={H / 2} textAnchor="middle" fontSize={8} fill="var(--text4)"
        fontFamily="var(--mono)" transform={`rotate(-90,${ox - 4},${H / 2})`}>
        {larg}m
      </text>
      {/* Luminárias */}
      {pontos.map(([x, y], idx) => (
        <g key={idx}>
          <circle cx={x} cy={y} r={4} fill="var(--amber)" fillOpacity={.8} />
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} stroke="var(--amber)" strokeWidth={1} />
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke="var(--amber)" strokeWidth={1} />
        </g>
      ))}
    </svg>
  )
}
