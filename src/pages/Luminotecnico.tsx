// src/pages/Luminotecnico.tsx
// Dimensionamento luminotécnico — Método dos Lúmens — NBR ISO/CIE 8995-1
//
// REESCRITO — antes mantinha cópia própria de nome/comprimento/largura/
// pé-direito de cada ambiente, desconectada do Cômodo real (auditoria
// de duplicação de dados). Agora cada ambiente calculado é uma
// REFERÊNCIA (comodo_id) ao cômodo real — geometria sempre lida ao
// vivo de lá, nunca copiada. Editar a área do cômodo em Cômodos.tsx
// atualiza o cálculo luminotécnico automaticamente, sem precisar
// reimportar nem haver risco de divergência entre as duas telas.

import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { calcLuminotecnico } from '../core/engine'
import type { LuminoInput } from '../core/engine'
// Catálogo compartilhado — fonte única, mesma usada pelo seletor rápido
// em Comodos.tsx. Corrigido: a reescrita anterior desta tela recriou um
// catálogo próprio (LUMINARIAS local) em vez de importar este, mesmo o
// arquivo já declarando explicitamente ser "usado por Luminotecnico.tsx
// e pelo seletor de luminária no Comodos.tsx" — reconectado agora.
import { CATALOGO_LUMINARIAS } from '../core/luminotecnico'

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

// Sugestão de categoria de iluminância a partir do tipo do cômodo real
// (Comodo.tipo é uma categoria ampla — Social/Cozinha/Banho/Lavanderia/
// Garagem/Externo — mais grossa que ILUMINANCIAS; serve só de ponto de
// partida, o engenheiro pode refinar)
function sugerirCategoriaAmbiente(tipoComodo: string): string {
  if (tipoComodo === 'Banho') return 'Banheiro'
  if (tipoComodo === 'Cozinha') return 'Cozinha — geral'
  if (tipoComodo === 'Lavanderia') return 'Lavanderia'
  if (tipoComodo === 'Garagem') return 'Garagem'
  if (tipoComodo === 'Externo') return 'Corredor'
  return 'Sala de estar'
}

// LUMINARIAS local removida — usa CATALOGO_LUMINARIAS (importado acima),
// mesmo catálogo do seletor rápido em Comodos.tsx. Formato compatível:
// ModeloLuminaria = { nome, pot, lm, obs? } — mesmos campos pot/lm que
// o código abaixo já esperava, então nenhuma outra mudança necessária
// além do import.
const LUMINARIAS = CATALOGO_LUMINARIAS

// Deriva comprimento e largura a partir de área e perímetro REAIS do
// cômodo, resolvendo o sistema comp×larg=área, comp+larg=perímetro/2
// (raízes de x² - sx + área = 0, s = perímetro/2) — substitui a
// aproximação antiga que assumia proporção fixa 1,4:1 sem checar o
// perímetro real declarado.
export function derivarDimensoes(area_m2: number, perimetro_m: number): { comp: number; larg: number } {
  const s = perimetro_m / 2
  const disc = s * s - 4 * area_m2
  if (disc < 0 || s <= 0) {
    const lado = Math.sqrt(Math.max(area_m2, 0.01))
    return { comp: Math.round(lado * 100) / 100, larg: Math.round(lado * 100) / 100 }
  }
  const raiz = Math.sqrt(disc)
  const comp = Math.round((s + raiz) / 2 * 100) / 100
  const larg = Math.round((s - raiz) / 2 * 100) / 100
  return { comp, larg }
}

interface AmbienteCalc {
  id:            string
  comodo_id:     string   // referência ao Comodo real — nunca copia geometria
  ambiente:      string   // categoria de iluminância (mais fina que Comodo.tipo)
  h_trabalho:    number
  lux:           number
  luminaria_idx: number
  pot_custom:    number
  lm_custom:     number
  refl_teto:     number
  refl_parede:   number
  refl_piso:     number
  condicao_fm:   'muito_limpo' | 'normal' | 'normal_maior_acumulo' | 'sujo'
}

const EMPTY_CALC = {
  h_trabalho: 0.75, lux: 200, luminaria_idx: 2,
  pot_custom: 9, lm_custom: 900,
  refl_teto: 0.7, refl_parede: 0.5, refl_piso: 0.2,
  condicao_fm: 'muito_limpo' as const,
}

export function Luminotecnico() {
  const { comodos } = useProjectStore()
  const [ambientes, setAmbientes] = useState<AmbienteCalc[]>([])
  const [comodoSelecionado, setComodoSelecionado] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const comodosDisponiveis = comodos.filter(c => c.area_m2 > 0 && !ambientes.some(a => a.comodo_id === c.id))

  function adicionar() {
    const comodo = comodos.find(c => c.id === comodoSelecionado)
    if (!comodo) return
    const categoria = sugerirCategoriaAmbiente(comodo.tipo)
    const id = crypto.randomUUID()
    setAmbientes(prev => [...prev, {
      ...EMPTY_CALC, id, comodo_id: comodo.id,
      ambiente: categoria, lux: ILUMINANCIAS[categoria]?.lux ?? 200,
    }])
    setActiveId(id)
    setComodoSelecionado('')
  }

  function adicionarTodos() {
    const novos = comodosDisponiveis.map(c => {
      const categoria = sugerirCategoriaAmbiente(c.tipo)
      return {
        ...EMPTY_CALC, id: crypto.randomUUID(), comodo_id: c.id,
        ambiente: categoria, lux: ILUMINANCIAS[categoria]?.lux ?? 200,
      }
    })
    setAmbientes(prev => [...prev, ...novos])
  }

  function remover(id: string) {
    setAmbientes(prev => prev.filter(a => a.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function atualizar(id: string, partial: Partial<AmbienteCalc>) {
    setAmbientes(prev => prev.map(a => a.id === id ? { ...a, ...partial } : a))
  }

  // Calcula o resultado para um ambiente — geometria SEMPRE lida ao
  // vivo do cômodo real, nunca de uma cópia armazenada
  function calcular(a: AmbienteCalc) {
    const comodo = comodos.find(c => c.id === a.comodo_id)
    if (!comodo) return null
    const { comp, larg } = derivarDimensoes(comodo.area_m2, comodo.perimetro_m)
    const lum = LUMINARIAS[a.luminaria_idx]
    const pot = lum?.pot > 0 ? lum.pot : a.pot_custom
    const lm  = lum?.lm  > 0 ? lum.lm  : a.lm_custom
    const input: LuminoInput = {
      area_m2:        comodo.area_m2,
      pe_direito_m:   comodo.pe_direito_m || 2.8,
      h_plano_trabalho: a.h_trabalho,
      iluminancia_lux: a.lux,
      refl_teto:      a.refl_teto,
      refl_parede:    a.refl_parede,
      refl_piso:      a.refl_piso,
      luminaria_lm:   lm,
      luminaria_pot_w: pot,
      condicao_ambiente_fm: a.condicao_fm,
    }
    return { comodo, comp, larg, resultado: calcLuminotecnico(comp, larg, input) }
  }

  const calculados = ambientes.map(a => ({ ambiente: a, calc: calcular(a) })).filter(x => x.calc !== null)
  const totais = calculados.map(x => x.calc!.resultado)
  const total_pot   = totais.reduce((s, r) => s + r.pot_total_w, 0)
  const total_lum   = totais.reduce((s, r) => s + r.n_luminarias, 0)
  const area_total  = calculados.reduce((s, x) => s + x.calc!.comodo.area_m2, 0)
  const dpf_medio   = area_total > 0 ? total_pot / area_total : 0
  const orfaos      = ambientes.length - calculados.length  // cômodos removidos depois de adicionados aqui

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Luminotécnico</div>
        <div className="page-sub">
          Método dos Lúmens · NBR ISO/CIE 8995-1 · geometria sempre lida do cômodo real
        </div>
      </div>
      <div className="page-actions">
        {comodosDisponiveis.length > 0 && (
          <button className="btn" onClick={adicionarTodos}>
            + Todos os cômodos ({comodosDisponiveis.length})
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

      {/* Adicionar ambiente — seleciona o CÔMODO REAL, não digita geometria de novo */}
      <div className="card" style={{ position: 'sticky', top: 0 }}>
        <div className="card-header">Adicionar ambiente</div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comodos.length === 0 ? (
            <div className="toast-bar info">
              Nenhum cômodo cadastrado ainda. Crie os cômodos na aba
              <b> Cômodos e Cargas </b> primeiro — a geometria (área, perímetro,
              pé-direito) vem de lá automaticamente, sem digitar de novo aqui.
            </div>
          ) : comodosDisponiveis.length === 0 ? (
            <div className="toast-bar ok">✓ Todos os cômodos já têm cálculo luminotécnico.</div>
          ) : (
            <>
              <div className="fgroup">
                <label className="flabel">Cômodo</label>
                <select className="fselect" value={comodoSelecionado}
                  onChange={e => setComodoSelecionado(e.target.value)}>
                  <option value="">— selecione —</option>
                  {comodosDisponiveis.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.area_m2}m²)</option>
                  ))}
                </select>
                <div className="fhint">
                  Área, perímetro e pé-direito vêm direto do cadastro do cômodo —
                  editar lá atualiza aqui automaticamente.
                </div>
              </div>
              <button className="btn primary" onClick={adicionar} disabled={!comodoSelecionado}
                style={{ width: '100%', justifyContent: 'center' }}>
                + Calcular este ambiente
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resultados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {orfaos > 0 && (
          <div className="toast-bar warn">
            ⚠ {orfaos} ambiente(s) referenciam cômodo(s) removido(s) de Cômodos e Cargas — não aparecem mais no cálculo.
          </div>
        )}

        {calculados.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text4)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💡</div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Nenhum ambiente calculado</div>
            <div style={{ fontSize: 11 }}>Selecione um cômodo ao lado para começar</div>
          </div>
        ) : calculados.map(({ ambiente: a, calc }) => {
          const { comodo, comp, larg, resultado: r } = calc!
          const isActive = activeId === a.id
          const lum  = LUMINARIAS[a.luminaria_idx]
          const nomeLum = lum?.nome || 'Personalizada'
          const dpfOk = r.dpf <= 12

          return (
            <div key={a.id} className="card"
              onClick={() => setActiveId(isActive ? null : a.id)}
              style={{ cursor: 'pointer', borderColor: isActive ? 'var(--blue)' : '', outline: isActive ? '2px solid var(--blue-line)' : 'none' }}>
              <div className="card-header">
                <span style={{ fontWeight: 600 }}>{comodo.nome}</span>
                <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 8 }}>
                  {comodo.area_m2}m² (do cadastro) · {a.lux} lux
                </span>
                <button onClick={e => { e.stopPropagation(); remover(a.id) }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 18 }}>
                  ×
                </button>
              </div>

              {/* Luminárias REAIS já declaradas neste cômodo (em Cômodos e
                  Cargas) — mostradas lado a lado com o cálculo hipotético
                  abaixo, para comparação honesta. Não mescladas num único
                  número: são dois modos diferentes (o que já foi decidido
                  vs. o que o Método dos Lúmens sugere para a luminária
                  escolhida aqui) e forçar isso numa única cifra arriscaria
                  confundir mais do que ajudar. */}
              {(comodo.luminarias ?? []).length > 0 && (() => {
                const reais = comodo.luminarias!
                const lmTotal = reais.reduce((s, l) => s + l.qtd * l.lm, 0)
                const potTotal = reais.reduce((s, l) => s + l.qtd * l.pot_w, 0)
                const nTotal = reais.reduce((s, l) => s + l.qtd, 0)
                return (
                  <div style={{ padding: '8px 14px', background: 'var(--gold-dim)', fontSize: 10.5, color: 'var(--gold-dark)', borderBottom: '1px solid var(--border-light)' }}>
                    📌 Já declarado em Cômodos: {nTotal} luminária(s) real(is), {potTotal}W, {lmTotal.toLocaleString('pt-BR')}lm totais.
                    O cálculo abaixo é hipotético (luminária escolhida aqui) — compare com o que já foi decidido.
                  </div>
                )
              })()}

              {/* Resultado resumido */}
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  ['Luminárias', r.n_luminarias, 'un.', 'var(--blue)'],
                  ['Potência', r.pot_total_w, 'W',  'var(--purple)'],
                  ['Em real', r.em_real, 'lux', 'var(--green)'],
                  ['DPF', r.dpf, 'W/m²', dpfOk ? 'var(--green)' : 'var(--amber)'],
                ].map(([l, v, u, cor]) => (
                  <div key={l as string} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: cor as string, fontFamily: 'var(--mono)' }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text4)' }}>{u}</div>
                  </div>
                ))}
              </div>

              {/* Detalhe expandido — inclui os parâmetros específicos do
                  cálculo luminotécnico (não geometria, essa vem do cômodo) */}
              {isActive && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 14 }} onClick={e => e.stopPropagation()}>

                  <div className="form-grid c4" style={{ marginBottom: 14 }}>
                    <div className="fgroup">
                      <label className="flabel">Categoria (lux alvo)</label>
                      <select className="fselect" value={a.ambiente}
                        onChange={e => atualizar(a.id, { ambiente: e.target.value, lux: ILUMINANCIAS[e.target.value]?.lux ?? a.lux })}>
                        {Object.entries(ILUMINANCIAS).map(([k, v]) => (
                          <option key={k} value={k}>{k} — {v.desc}</option>
                        ))}
                      </select>
                    </div>
                    <div className="fgroup">
                      <label className="flabel">Iluminância (lux)</label>
                      <input className="finput" type="number" value={a.lux} min={50} step={50}
                        onChange={e => atualizar(a.id, { lux: Number(e.target.value) })} />
                    </div>
                    <div className="fgroup" style={{ gridColumn: 'span 2' }}>
                      <label className="flabel">Luminária</label>
                      <select className="fselect" value={a.luminaria_idx}
                        onChange={e => {
                          const idx = Number(e.target.value)
                          const l = LUMINARIAS[idx]
                          atualizar(a.id, { luminaria_idx: idx, ...(l?.pot > 0 ? { pot_custom: l.pot, lm_custom: l.lm } : {}) })
                        }}>
                        {LUMINARIAS.map((l, i) => <option key={i} value={i}>{l.nome}</option>)}
                      </select>
                    </div>
                  </div>

                  {a.luminaria_idx === LUMINARIAS.length - 1 && (
                    <div className="form-grid c2" style={{ marginBottom: 14 }}>
                      <div className="fgroup">
                        <label className="flabel">Potência (W)</label>
                        <input className="finput" type="number" value={a.pot_custom || ''} min={0}
                          onChange={e => atualizar(a.id, { pot_custom: Number(e.target.value) })} />
                      </div>
                      <div className="fgroup">
                        <label className="flabel">Fluxo (lm)</label>
                        <input className="finput" type="number" value={a.lm_custom || ''} min={0}
                          onChange={e => atualizar(a.id, { lm_custom: Number(e.target.value) })} />
                      </div>
                    </div>
                  )}

                  <div className="form-grid c4" style={{ marginBottom: 14 }}>
                    {[
                      { k: 'refl_teto' as const,   label: 'Refl. Teto',   hint: 'Branco=0.8' },
                      { k: 'refl_parede' as const, label: 'Refl. Parede', hint: 'Médio=0.5' },
                      { k: 'refl_piso' as const,   label: 'Refl. Piso',   hint: 'Escuro=0.2' },
                    ].map(({ k, label, hint }) => (
                      <div key={k} className="fgroup">
                        <label className="flabel">{label}</label>
                        <input className="finput" type="number" value={a[k]} min={0} max={1} step={0.05}
                          onChange={e => atualizar(a.id, { [k]: Number(e.target.value) } as any)} />
                        <div className="fhint">{hint}</div>
                      </div>
                    ))}
                    <div className="fgroup">
                      <label className="flabel" title="Anexo D NBR ISO/CIE 8995-1">Manutenção</label>
                      <select className="fselect" value={a.condicao_fm}
                        onChange={e => atualizar(a.id, { condicao_fm: e.target.value as any })}>
                        <option value="muito_limpo">Limpo (0,80)</option>
                        <option value="normal">Normal (0,67)</option>
                        <option value="normal_maior_acumulo">Poeirento (0,57)</option>
                        <option value="sujo">Sujo (0,50)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {/* Memória de cálculo */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Memória de cálculo
                      </div>
                      {[
                        ['Ambiente (derivado)', `${comp}m × ${larg}m × ${comodo.pe_direito_m}m`],
                        ['Área (do cômodo)', `${comodo.area_m2.toFixed(2)} m²`],
                        ['Índice do local (k)', r.k.toFixed(2)],
                        ['Fator de utilização (CU)', r.cu.toFixed(3)],
                        ['Fator de manutenção (FM)', r.fm.toFixed(2)],
                        ['Fluxo total necessário', `${Math.round(a.lux * comodo.area_m2 / (r.cu * r.fm))} lm`],
                        ['Luminária', nomeLum],
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
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 4 }}>Planta esquemática (derivada)</div>
                        <PlantaLuminarias comp={comp} larg={larg} arranjo={r.arranjos[0]} n={r.n_luminarias} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Tabela resumo geral */}
        {calculados.length > 1 && (
          <div className="card">
            <div className="card-header">Resumo geral — todos os ambientes</div>
            <table className="dtable">
              <thead><tr>
                <th>Ambiente</th>
                <th className="r">Área (m²)</th>
                <th className="r">lux req.</th>
                <th className="r">N° lum.</th>
                <th className="r">Pot. (W)</th>
                <th className="r">Em (lux)</th>
                <th className="r">DPF W/m²</th>
              </tr></thead>
              <tbody>
                {calculados.map(({ ambiente: a, calc }) => {
                  const { comodo, resultado: r } = calc!
                  return (
                    <tr key={a.id}>
                      <td className="name">{comodo.nome}</td>
                      <td className="mono r">{comodo.area_m2.toFixed(1)}</td>
                      <td className="mono r">{a.lux}</td>
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
                  <td colSpan={1} />
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
      <rect x={ox} y={oy} width={pw} height={ph}
        fill="none" stroke="var(--text3)" strokeWidth={1} strokeDasharray="3 2" />
      <text x={W / 2} y={oy - 4} textAnchor="middle" fontSize={8} fill="var(--text4)" fontFamily="var(--mono)">
        {comp}m
      </text>
      <text x={ox - 4} y={H / 2} textAnchor="middle" fontSize={8} fill="var(--text4)"
        fontFamily="var(--mono)" transform={`rotate(-90,${ox - 4},${H / 2})`}>
        {larg}m
      </text>
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
