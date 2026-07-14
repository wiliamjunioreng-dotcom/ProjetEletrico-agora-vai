// src/pages/Comodos.tsx — Previsão de Cargas
// "Vigia Normativo": NBR 5410 como piso legal, projetista com autonomia total
// Potência Real (consumo) vs. Potência de Dimensionamento (segurança do cabo)

import { useState } from 'react'
import { verificarComodoNBR9 } from '../core/rules/nbr5410_s9'
import { useProjectStore } from '../store/projectStore'
import type { Comodo } from '../types/electrical'
import { CATALOGO_LUMINARIAS, ILUMINANCIAS_REF, calcularLumens } from '../core/luminotecnico'
import type { LampadaReal } from '../store/projectStore'
import { calcIlumComodo, calcTugComodo } from '../core/engine'

// ── Tipos de cômodo ───────────────────────────────────────────────

const TIPOS: Comodo['tipo'][] = ['Social','Cozinha','Banho','Lavanderia','Garagem','Externo']
const TIPO_DESC: Record<string, string> = {
  Social:     'Sala, quarto, escritório, corredor',
  Cozinha:    'Cozinha — TUG 600VA (NBR §9.5.2.2.1)',
  Banho:      'Banheiro — TUG 600VA + IDR 30mA',
  Lavanderia: 'Área de serviço — TUG 600VA + IDR 30mA',
  Garagem:    'Garagem — IDR 30mA obrigatório',
  Externo:    'Varanda, sacada, área externa — IDR 30mA',
}

// ── Catálogo de luminárias (amplo, não só LED) ────────────────────

interface PresetLamp {
  grupo: string
  desc:  string
  pot:   number   // W
  lm:    number
  obs?:  string
}

const CATALOGO_LAMPADAS: PresetLamp[] = [
  // LED — tecnologia atual
  { grupo:'LED', desc:'LED Bulbo A60 9W',       pot:9,   lm:810,  obs:'Substitui incandescente 60W' },
  { grupo:'LED', desc:'LED Bulbo A60 12W',      pot:12,  lm:1100, obs:'Substitui incandescente 75W' },
  { grupo:'LED', desc:'LED Bulbo A60 15W',      pot:15,  lm:1500, obs:'Substitui incandescente 100W' },
  { grupo:'LED', desc:'LED Downlight 7W',       pot:7,   lm:600  },
  { grupo:'LED', desc:'LED Downlight 9W',       pot:9,   lm:900  },
  { grupo:'LED', desc:'LED Downlight 12W',      pot:12,  lm:1200 },
  { grupo:'LED', desc:'LED Downlight 18W',      pot:18,  lm:1800 },
  { grupo:'LED', desc:'LED Spot GU10 5W',       pot:5,   lm:400  },
  { grupo:'LED', desc:'LED Spot GU10 7W',       pot:7,   lm:600  },
  { grupo:'LED', desc:'LED Tube T8 9W (60cm)',  pot:9,   lm:900  },
  { grupo:'LED', desc:'LED Tube T8 18W (120cm)',pot:18,  lm:1800 },
  { grupo:'LED', desc:'LED Painel 24W',         pot:24,  lm:2400 },
  { grupo:'LED', desc:'LED Painel 36W',         pot:36,  lm:3600 },
  { grupo:'LED', desc:'LED Fita 5W/m',          pot:5,   lm:450, obs:'Por metro linear' },
  { grupo:'LED', desc:'LED Fita 10W/m',         pot:10,  lm:900, obs:'Por metro linear' },
  { grupo:'LED', desc:'LED Dicroica GU5.3 5W',  pot:5,   lm:400  },
  { grupo:'LED', desc:'LED High Bay 100W',      pot:100, lm:12000, obs:'Industrial/galpão' },
  { grupo:'LED', desc:'LED High Bay 150W',      pot:150, lm:18000, obs:'Industrial/galpão' },
  // Fluorescente compacta
  { grupo:'Fluorescente', desc:'CFL 9W',        pot:9,   lm:560,  obs:'Obsoleta — uso residual' },
  { grupo:'Fluorescente', desc:'CFL 15W',       pot:15,  lm:900  },
  { grupo:'Fluorescente', desc:'CFL 23W',       pot:23,  lm:1500 },
  { grupo:'Fluorescente', desc:'Tube T8 32W',   pot:32,  lm:2600 },
  { grupo:'Fluorescente', desc:'Tube T8 40W',   pot:40,  lm:3200 },
  // Halógena
  { grupo:'Halógena', desc:'Halógena 20W',      pot:20,  lm:300,  obs:'Alta temperatura — evitar' },
  { grupo:'Halógena', desc:'Halógena 50W',      pot:50,  lm:850  },
  { grupo:'Halógena', desc:'Halógena 100W',     pot:100, lm:1650 },
  { grupo:'Halógena', desc:'Dicroica GU5.3 35W',pot:35,  lm:550 },
  { grupo:'Halógena', desc:'Dicroica GU5.3 50W',pot:50,  lm:850 },
  // Vapor de sódio
  { grupo:'Vapor Sódio', desc:'Vapor Sódio 70W', pot:70, lm:6600, obs:'Área externa/industrial' },
  { grupo:'Vapor Sódio', desc:'Vapor Sódio 150W',pot:150,lm:16000 },
  { grupo:'Vapor Sódio', desc:'Vapor Sódio 250W',pot:250,lm:28500 },
  { grupo:'Vapor Sódio', desc:'Vapor Sódio 400W',pot:400,lm:47000 },
  // Vapor de mercúrio
  { grupo:'Vapor Mercúrio', desc:'Vapor Mercúrio 80W',  pot:80,  lm:3800, obs:'Em desuso' },
  { grupo:'Vapor Mercúrio', desc:'Vapor Mercúrio 125W', pot:125, lm:6400 },
  { grupo:'Vapor Mercúrio', desc:'Vapor Mercúrio 250W', pot:250, lm:13500 },
  { grupo:'Vapor Mercúrio', desc:'Vapor Mercúrio 400W', pot:400, lm:22500 },
  // Metal halide
  { grupo:'Metal Halide', desc:'Metal Halide 35W',  pot:35,  lm:3200 },
  { grupo:'Metal Halide', desc:'Metal Halide 70W',  pot:70,  lm:7000 },
  { grupo:'Metal Halide', desc:'Metal Halide 150W', pot:150, lm:14000 },
  { grupo:'Metal Halide', desc:'Metal Halide 250W', pot:250, lm:24000 },
  { grupo:'Metal Halide', desc:'Metal Halide 400W', pot:400, lm:40000 },
  // Incandescente (referência histórica)
  { grupo:'Incandescente', desc:'Incandescente 40W',  pot:40,  lm:440,  obs:'Proibida — referência' },
  { grupo:'Incandescente', desc:'Incandescente 60W',  pot:60,  lm:720  },
  { grupo:'Incandescente', desc:'Incandescente 100W', pot:100, lm:1380 },
  // Personalizada
  { grupo:'Personalizada', desc:'Personalizada', pot:0, lm:0, obs:'Informe potência e fluxo' },
]

const GRUPOS = [...new Set(CATALOGO_LAMPADAS.map(l => l.grupo))]

// ── Fatores de dimensionamento por tecnologia ─────────────────────
// NBR 5410 §9.5.2.1: mínimo 100VA/ponto
// Fator sobre a pot. real para compensar harmônicas, chaveamento, margem de segurança
const FATOR_DIM: Record<string, number> = {
  'LED':           1.8,   // harmônicas do driver + margem para troca futura
  'Fluorescente':  1.5,   // reator/driver + fator de potência
  'Halógena':      1.1,   // carga resistiva, pouco fator
  'Vapor Sódio':   1.25,  // reator + ignitor
  'Vapor Mercúrio':1.25,
  'Metal Halide':  1.25,
  'Incandescente': 1.0,   // carga puramente resistiva
  'Personalizada': 1.5,   // conservador
}

const MIN_VA_PONTO = 100  // NBR 5410 §9.5.2.1

function calcPotDim(potReal_w: number, nPontos: number, grupo: string): number {
  const fator   = FATOR_DIM[grupo] ?? 1.5
  const dimFator = Math.ceil(potReal_w * fator)
  const dimNorma = nPontos * MIN_VA_PONTO
  return Math.max(dimFator, dimNorma)
}

// ── Parser de string de lâmpadas ─────────────────────────────────
// Aceita: "4x9W + 2x12W", "3×LED 9W + 1×Downlight 18W", "6 LED 9W"

interface ParsedLamp { qtd: number; pot: number; desc: string }

function parseStringLampadas(str: string): ParsedLamp[] {
  const results: ParsedLamp[] = []
  // Separar por + ou ,
  const partes = str.split(/[+,]/).map(s => s.trim()).filter(Boolean)
  for (const parte of partes) {
    // Padrões: "4x9W", "4×9W", "4 9W", "4 LED 9W", "9W x4"
    const m1 = parte.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*w/i)
    const m2 = parte.match(/(\d+(?:\.\d+)?)\s*w\s*[x×*]\s*(\d+)/i)
    const m3 = parte.match(/^(\d+)\s+(?:led|lamp|luminaria|spot|bulbo)?\s*(\d+(?:\.\d+)?)\s*w/i)
    const m4 = parte.match(/(\d+(?:\.\d+)?)\s*w/i) // só potência, assume qtd=1

    let qtd = 1, pot = 0, desc = parte.trim()
    if (m1)      { qtd = parseInt(m1[1]);  pot = parseFloat(m1[2]) }
    else if (m2) { pot = parseFloat(m2[1]); qtd = parseInt(m2[2]) }
    else if (m3) { qtd = parseInt(m3[1]);  pot = parseFloat(m3[2]) }
    else if (m4) { pot = parseFloat(m4[1]) }

    if (pot > 0) results.push({ qtd, pot, desc })
  }
  return results
}

// ── Tipos de tomada TUG ───────────────────────────────────────────

const TIPOS_TOMADA = [
  { desc: 'TUG 2P+T 10A (100VA)',   va: 100 },
  { desc: 'TUG 2P+T 20A (200VA)',   va: 200 },
  { desc: 'TUG 2P+T 30A (300VA)',   va: 300 },
  { desc: 'TUG bancada coz. (600VA)',va: 600 },
  { desc: 'TUG área molhada (600VA)',va: 600 },
  { desc: 'Personalizada',           va: 0   },
]

// ── Form state ────────────────────────────────────────────────────

interface Form {
  nome:      string
  tipo:      string
  area:      string
  perim:     string
  afluencia_publico: boolean
  grupo_circuito_ilum: string
  // Iluminação
  ilum_modo: 'auto' | 'manual' | 'lampadas' | 'string'
  ilum_manual: string
  ilum_string: string    // parser de string "4x9W + 2x12W"
  // TUG
  tug_modo:  'auto' | 'manual' | 'tomadas'
  tug_manual: string
  // TUE
}

const EMPTY: Form = {
  nome: '', tipo: 'Social', area: '', perim: '', afluencia_publico: false, grupo_circuito_ilum: '',
  ilum_modo: 'auto', ilum_manual: '', ilum_string: '',
  tug_modo:  'auto', tug_manual: '',
}

interface TomadaItem { id: string; desc: string; qtd: number; va_unit: number; va_custom?: number }

// ── Componente ────────────────────────────────────────────────────


// ── Seletor de luminária inline ───────────────────────────────────
function LuminariaSelector({
  area_m2, pe_m, onSelect, onClose
}: {
  area_m2: number
  pe_m: number
  onSelect: (pot_dim_va: number, pot_real_w: number, desc: string) => void
  onClose: () => void
}) {
  const [lux_alvo, setLux] = useState(300)
  const [lum_idx, setLumIdx] = useState(0)
  const modelo = CATALOGO_LUMINARIAS[lum_idx]
  const resultado = area_m2 > 0 && pe_m > 0 && modelo
    ? calcularLumens(area_m2, pe_m, lux_alvo, modelo)
    : null

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      background: 'var(--surface2)', border: '1px solid var(--blue)',
      borderRadius: 5, zIndex: 10, padding: 12, boxShadow: 'var(--sh-md)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
          Método dos Lúmens — Seleção de Luminária
        </div>
        <button className="btn ghost icon" onClick={onClose}>×</button>
      </div>

      <div className="form-grid c3" style={{ marginBottom: 10 }}>
        <div className="fgroup">
          <label className="flabel">Iluminância alvo (lux)</label>
          <select className="fselect" value={lux_alvo}
            onChange={e => setLux(Number(e.target.value))}>
            {Object.entries(ILUMINANCIAS_REF).map(([k, v]) => (
              <option key={k} value={v}>{k} — {v} lux</option>
            ))}
          </select>
        </div>
        <div className="fgroup">
          <label className="flabel">Modelo de luminária</label>
          <select className="fselect" value={lum_idx}
            onChange={e => setLumIdx(Number(e.target.value))}>
            {CATALOGO_LUMINARIAS.map((l, i) => (
              <option key={i} value={i}>{l.nome} — {l.pot}W/{l.lm}lm</option>
            ))}
          </select>
        </div>
        <div className="fgroup">
          <label className="flabel">Resultado</label>
          <div className="finput" style={{ background: 'var(--surface3)', color: resultado ? 'var(--green)' : 'var(--text4)', display: 'flex', alignItems: 'center' }}>
            {resultado
              ? `${resultado.n_luminarias} un × ${modelo.pot}W = ${resultado.pot_dim_va.toFixed(0)}VA`
              : 'Preencha área e pé direito'}
          </div>
        </div>
      </div>

      {resultado && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1, fontSize: 10, color: 'var(--text4)' }}>
            Pot. dimming: {resultado.pot_dim_va.toFixed(0)}VA · Pot. real: {resultado.pot_total_w.toFixed(0)}W · {resultado.n_luminarias} un de {lux_alvo} lux · {(modelo.lm * resultado.n_luminarias).toFixed(0)} lm
          </div>
          <button className="btn primary" style={{ height: 28 }}
            onClick={() => {
              onSelect(
                resultado.pot_dim_va,
                resultado.pot_total_w,
                `${resultado.n_luminarias}× ${modelo.nome} (${lux_alvo}lux)`
              )
              onClose()
            }}>
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}


export function Comodos() {
  const { comodos, addComodo, updateComodo, removeComodo, addCargaManual, removeCargaManual, gerarCircuitosDeComodos, setPagina } = useProjectStore()
  const [formCarga, setFormCarga] = useState({
    tipo: 'TUG' as 'ILUM'|'TUG'|'TUE'|'GERAL',
    descricao: '', potencia_va: 100, qtd: 1, fase: 'mono' as 'mono'|'bi'|'tri',
    tipo_carga: 'geral' as 'resistivo'|'motor'|'ar_cond'|'geral',
    distancia_box_m: '' as string | number,
  })
  const [lumModalComodo, setLumModalComodo] = useState<string | null>(null)
  const [form,     setForm]     = useState<Form>(EMPTY)
  const [lampadas, setLampadas] = useState<LampadaReal[]>([])
  const [tomadas,  setTomadas]  = useState<TomadaItem[]>([])
  const [erros,    setErros]    = useState<Partial<Record<keyof Form, string>>>({})
  // Seletor de luminária (Método dos Lúmens integrado)
  const [lumIdx,   setLumIdx]   = useState(0)
  const [lumLux,   setLumLux]   = useState('')
  const [lumPe,    setLumPe]    = useState('')
  const [lumPotC,  setLumPotC]  = useState('')
  const [lumLmC,   setLumLmC]   = useState('')

  // Formulário de lampada
  const [lampGrupo,  setLampGrupo]  = useState(GRUPOS[0])
  const [lampPreset, setLampPreset] = useState(0)
  const [lampQtd,    setLampQtd]    = useState('')
  const [lampPot,    setLampPot]    = useState('')
  // Formulário de tomada
  const [tomPreset,  setTomPreset]  = useState(0)
  const [tomQtd,     setTomQtd]     = useState('')
  const [tomVAcust,  setTomVAcust]  = useState('')

  const area  = parseFloat(form.area)  || 0
  const perim = parseFloat(form.perim) || 0

  // Mínimos NBR
  const ilumNBR = area  > 0 ? calcIlumComodo(area)            : 0
  const tugNBR  = (perim > 0 || area > 0) ? calcTugComodo(perim, form.tipo, area) : 0

  // Calcular potências de iluminação
  const potRealLamps_w = lampadas.reduce((s, l) => s + l.qtd * l.pot_w, 0)
  const nPontos        = lampadas.reduce((s, l) => s + l.qtd, 0)
  const grupoPredom    = lampadas[0] ? CATALOGO_LAMPADAS.find(l => l.desc === lampadas[0].descricao)?.grupo || 'LED' : 'LED'
  const potDimLamps    = potRealLamps_w > 0 ? calcPotDim(potRealLamps_w, nPontos, grupoPredom) : 0

  // Parsed string
  const parsedFromString = form.ilum_string ? parseStringLampadas(form.ilum_string) : []
  const potRealStr = parsedFromString.reduce((s, l) => s + l.qtd * l.pot, 0)
  const nPontosStr = parsedFromString.reduce((s, l) => s + l.qtd, 0)
  const potDimStr  = potRealStr > 0 ? calcPotDim(potRealStr, nPontosStr, 'LED') : 0

  // Iluminação efetiva
  const ilumManual = parseFloat(form.ilum_manual) || 0
  const ilumEfetiva =
    form.ilum_modo === 'manual'   && ilumManual > 0    ? ilumManual
  : form.ilum_modo === 'lampadas' && potDimLamps > 0   ? potDimLamps
  : form.ilum_modo === 'string'   && potDimStr > 0     ? potDimStr
  : ilumNBR

  const potRealIlum =
    form.ilum_modo === 'lampadas' ? potRealLamps_w
  : form.ilum_modo === 'string'   ? potRealStr
  : form.ilum_modo === 'manual'   ? ilumManual
  : 0

  // TUG efetiva
  const tugManual  = parseFloat(form.tug_manual) || 0
  const tugTomadas = tomadas.reduce((s, t) => s + t.qtd * (t.va_custom ?? t.va_unit), 0)
  const tugEfetiva =
    form.tug_modo === 'tomadas' && tugTomadas > 0 ? tugTomadas
  : form.tug_modo === 'manual'  && tugManual > 0  ? tugManual
  : tugNBR

  const totalCard = ilumEfetiva + tugEfetiva

  // Alertas de vigia normativo
  const ilumAbaixo = ilumEfetiva < ilumNBR && ilumNBR > 0
  const tugAbaixo  = tugEfetiva  < tugNBR  && tugNBR  > 0

  // KPIs totais
  const totalIlum = comodos.reduce((s, c) => s + c.ilum_va, 0)
  const totalTug  = comodos.reduce((s, c) => s + c.tug_va, 0)
  // Soma TUE de AMBAS as fontes — array legado c.tues[] (rooms antigos/
  // importados) e cargas_manuais tipo='TUE' (caminho unificado atual)
  const totalTue  = comodos.reduce((s, c) =>
    s + c.tues.reduce((ss, t) => ss + t.potencia_va, 0)
      + c.cargas_manuais.filter(cm => cm.tipo === 'TUE').reduce((ss, cm) => ss + cm.potencia_va * cm.qtd, 0)
  , 0)
  const totalKW   = (totalIlum + totalTug + totalTue) / 1000

  // Helpers
  const upd = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  // Versão para campos numéricos que NUNCA podem ser negativos (potência,
  // área, perímetro, comprimento). O atributo HTML min={0} só bloqueia o
  // spinner — não impede digitação direta de "-500". Isso garante que
  // valores inválidos não cheguem ao motor de cálculo mesmo digitados
  // diretamente pelo teclado.
  const updNumPositivo = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      // Permite campo vazio (usuário ainda digitando) e bloqueia só o negativo
      const valor = raw === '' || raw === '-' ? raw : String(Math.max(0, parseFloat(raw) || 0))
      setForm(f => ({ ...f, [k]: valor }))
    }

  const presetsDoGrupo = CATALOGO_LAMPADAS.filter(l => l.grupo === lampGrupo)

  function addLampada() {
    const preset = presetsDoGrupo[lampPreset] ?? presetsDoGrupo[0]
    const qtd = parseInt(lampQtd) || 0
    const pot = parseFloat(lampPot) || preset.pot
    if (qtd <= 0 || pot <= 0) return
    setLampadas(prev => [...prev, {
      id: crypto.randomUUID(),
      descricao: preset.desc,
      qtd, pot_w: pot,
      pot_dim_w: pot * (FATOR_DIM[lampGrupo] ?? 1.5),
    }])
    setLampQtd('')
  }

  function addTomada() {
    const preset = TIPOS_TOMADA[tomPreset] ?? TIPOS_TOMADA[0]
    const qtd    = parseInt(tomQtd) || 0
    const vaCust = preset.va === 0 ? (parseFloat(tomVAcust) || 0) : undefined
    if (qtd <= 0 || (preset.va === 0 && !(vaCust! > 0))) return
    setTomadas(prev => [...prev, {
      id: crypto.randomUUID(),
      desc: preset.desc, qtd,
      va_unit: preset.va,
      va_custom: vaCust,
    }])
    setTomQtd(''); setTomVAcust('')
  }

  function adicionar() {
    const e: Partial<Record<keyof Form, string>> = {}
    if (!form.nome.trim()) e.nome  = 'Obrigatório'
    if (area  <= 0)        e.area  = 'Informe a área (m²)'
    if (perim <= 0)        e.perim = 'Informe o perímetro (m)'
    if (Object.keys(e).length) { setErros(e); return }
    setErros({})

    addComodo({
      nome:         form.nome.trim(),
      tipo:         form.tipo as Comodo['tipo'],
      area_m2:      area,
      perimetro_m:  perim,
      pe_direito_m: 2.8,
      afluencia_publico: form.afluencia_publico,
      grupo_circuito_ilum: form.grupo_circuito_ilum.trim() || undefined,
      tues: [],  // TUEs agora adicionados via cargas_manuais após criação
      // Passar os valores calculados explicitamente — o store vai respeitá-los
      ilum_va:      ilumEfetiva,
      tug_va:       tugEfetiva,
      lumino: (potRealIlum > 0 || nPontos > 0) ? {
        iluminancia_lux:  300,
        luminaria_pot_w:  nPontos > 0 ? potRealIlum / nPontos : potRealIlum,
        luminaria_lm:     900,
        n_luminarias:     nPontos || 1,
      } : undefined,
    } as any)

    setForm(EMPTY); setLampadas([]); setTomadas([])
  }

  // Modos de entrada de iluminação
  const MODOS_ILUM = [
    { id: 'auto',     label: 'Auto NBR' },
    { id: 'lampadas', label: 'Por luminária' },
    { id: 'string',   label: '"4×9W + 2×12W"' },
    { id: 'manual',   label: 'Manual (VA)' },
  ] as const

  const MODOS_TUG = [
    { id: 'auto',    label: 'Auto NBR' },
    { id: 'tomadas', label: 'Por tomada' },
    { id: 'manual',  label: 'Manual (VA)' },
  ] as const

  // Badge de comparação real vs. norma
  const BadgeComparacao = ({ real_w, dim_va, norma_va }: { real_w: number; dim_va: number; norma_va: number; grupo?: string }) => {
    if (real_w <= 0) return null
    const economia = norma_va > 0 ? Math.round((1 - real_w / norma_va) * 100) : 0
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, padding: '8px 10px', background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 6, fontSize: 10 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text4)', marginBottom: 2 }}>Pot. real</div>
          <div style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 13 }}>{real_w}W</div>
          <div style={{ color: 'var(--text4)' }}>consumo real</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text4)', marginBottom: 2 }}>Para dim.</div>
          <div style={{ fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--mono)', fontSize: 13 }}>{dim_va}VA</div>
          <div style={{ color: 'var(--text4)' }}>cabo/disjuntor</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text4)', marginBottom: 2 }}>Norma mín.</div>
          <div style={{ fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 13 }}>{norma_va}VA</div>
          <div style={{ color: economia > 0 ? 'var(--green)' : 'var(--text4)' }}>
            {economia > 0 ? `-${economia}% consumo` : 'sem economia'}
          </div>
        </div>
      </div>
    )
  }

  const ModeBtn = ({ label, active, onClick }: { id?: string; label: string; active: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{
      height: 24, padding: '0 9px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--blue)' : 'var(--border2)'}`,
      background: active ? 'var(--blue)' : 'var(--surface2)',
      color: active ? '#fff' : 'var(--text3)', fontFamily: 'var(--font)', fontWeight: active ? 600 : 400,
    }}>{label}</button>
  )

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Previsão de Cargas</div>
        <div className="page-sub">
          Passo 2 de 6 — Vigia NBR: norma como piso legal · projetista com autonomia total · LED e cargas reais
        </div>
      </div>
      <div className="page-actions">
        <button className="btn" disabled={comodos.length === 0}
          onClick={() => { if (confirm('Remover todos os cômodos?')) comodos.forEach(c => removeComodo(c.id)) }}>
          Limpar
        </button>
        <button className="btn primary" onClick={() => { gerarCircuitosDeComodos(); setPagina('circuitos') }}
          disabled={comodos.length === 0}>
          Gerar circuitos ({comodos.length}) →
        </button>
      </div>
    </div>

    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <div className="kpi"><div className="kpi-lbl">Cômodos</div><div className="kpi-val">{comodos.length}</div></div>
      <div className="kpi ok">
        <div className="kpi-lbl">Iluminação (dim.)</div>
        <div className="kpi-val">{totalIlum}</div>
        <div className="kpi-unit">VA — cabo/disjuntor</div>
      </div>
      <div className="kpi info">
        <div className="kpi-lbl">Tomadas TUG</div>
        <div className="kpi-val">{totalTug}</div>
        <div className="kpi-unit">VA</div>
      </div>
      <div className="kpi warn">
        <div className="kpi-lbl">TUEs</div>
        <div className="kpi-val">{totalTue}</div>
        <div className="kpi-unit">VA</div>
      </div>
      <div className="kpi">
        <div className="kpi-lbl">Total instalado</div>
        <div className="kpi-val">{totalKW.toFixed(2)}</div>
        <div className="kpi-unit">kW (dim.)</div>
      </div>
    </div>

    <div className="page-scroll">
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,320px) minmax(0,1fr)', gap: 12, padding: '0 20px 20px', alignItems: 'start', overflowX: 'hidden' }}>

      {/* ── Formulário ─────────────────────────────────────────── */}
      <div className="card" style={{ position: 'sticky', top: 0 }}>
        <div className="card-header">Adicionar cômodo</div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>

          {/* Nome e tipo */}
          <div className="fgroup">
            <label className="flabel">Nome</label>
            <input className="finput" value={form.nome} onChange={upd('nome')}
              placeholder="Ex: Sala de Estar"
              style={{ borderColor: erros.nome ? 'var(--red)' : '' }} />
            {erros.nome && <div style={{ fontSize: 10, color: 'var(--red)' }}>{erros.nome}</div>}
          </div>

          <div className="fgroup">
            <label className="flabel">Tipo</label>
            <select className="fselect" value={form.tipo} onChange={upd('tipo')}>
              {TIPOS.map(t => <option key={t} value={t}>{t} — {TIPO_DESC[t]}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="fgroup">
              <label className="flabel">Área (m²)</label>
              <input className="finput" type="number" value={form.area} onChange={updNumPositivo('area')}
                placeholder="25.5" min={0.5} step={0.5}
                style={{ borderColor: erros.area ? 'var(--red)' : '' }} />
              {erros.area && <div style={{ fontSize: 10, color: 'var(--red)' }}>{erros.area}</div>}
            </div>
            <div className="fgroup">
              <label className="flabel">Perímetro (m)</label>
              <input className="finput" type="number" value={form.perim} onChange={updNumPositivo('perim')}
                placeholder="20.0" min={1} step={0.5}
                style={{ borderColor: erros.perim ? 'var(--red)' : '' }} />
              {erros.perim && <div style={{ fontSize: 10, color: 'var(--red)' }}>{erros.perim}</div>}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
            color: 'var(--text3)', marginTop: 6, cursor: 'pointer' }}
            title="NBR 13570 — ativa verificações extras: mínimo 2 circuitos de ILUM se área>100m², e nota de cabeamento LSZH obrigatório">
            <input type="checkbox" checked={form.afluencia_publico}
              onChange={e => setForm(f => ({ ...f, afluencia_publico: e.target.checked }))} />
            Local de afluência de público (loja, escola, igreja...) — NBR 13570
          </label>

          <div className="fgroup" style={{ marginTop: 6 }}>
            <label className="flabel" title="Cômodos fisicamente próximos economizam cabo se compartilharem o mesmo circuito de iluminação — mas o sistema não enxerga a planta, só você. Dê o MESMO nome de grupo a cômodos que você sabe estarem próximos (ex: 'Ala Quartos', 'Fundo da Casa') e eles serão agrupados juntos, respeitando o limite de 3 cômodos/800VA por circuito.">
              Grupo de circuito ILUM (opcional)
            </label>
            <input className="finput" value={form.grupo_circuito_ilum}
              onChange={e => setForm(f => ({ ...f, grupo_circuito_ilum: e.target.value }))}
              placeholder="ex: Ala Quartos — deixe vazio para agrupamento automático" />
            <div className="fhint">
              Cômodos com o mesmo texto aqui ficam no mesmo circuito de ILUM. Sem
              preenchimento, o sistema agrupa automaticamente por ordem de criação
              (não pela planta — o sistema não sabe quais cômodos são vizinhos).
            </div>
          </div>

          {/* ── ILUMINAÇÃO ────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="flabel">💡 Iluminação</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {MODOS_ILUM.map(m => (
                  <ModeBtn key={m.id} id={m.id} label={m.label}
                    active={form.ilum_modo === m.id}
                    onClick={() => setForm(f => ({ ...f, ilum_modo: m.id }))} />
                ))}
              </div>
            </div>

            {/* Mínimo NBR sempre visível */}
            <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 6, display: 'flex', gap: 12 }}>
              <span>Mínimo NBR §9.5.2.1: <strong style={{ color: 'var(--text3)' }}>{ilumNBR}VA</strong></span>
              {area > 0 && <span>({area}m²)</span>}
            </div>

            {/* Modo AUTO */}
            {form.ilum_modo === 'auto' && (
              <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11, color: 'var(--text3)' }}>
                ✓ Usando mínimo NBR 5410: <strong>{ilumNBR}VA</strong>
                {area > 0 && <> — {Math.ceil(ilumNBR/area)}VA/m²</>}
              </div>
            )}

            {/* Modo LAMPADAS */}
            {form.ilum_modo === 'lampadas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Linha de adição */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div className="fgroup">
                    <label className="flabel" style={{ fontSize: 9 }}>Grupo</label>
                    <select className="fselect" style={{ height: 28, fontSize: 11 }}
                      value={lampGrupo}
                      onChange={e => { setLampGrupo(e.target.value); setLampPreset(0) }}>
                      {GRUPOS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="fgroup">
                    <label className="flabel" style={{ fontSize: 9 }}>Modelo</label>
                    <select className="fselect" style={{ height: 28, fontSize: 11 }}
                      value={lampPreset}
                      onChange={e => {
                        const idx = Number(e.target.value)
                        setLampPreset(idx)
                        const p = presetsDoGrupo[idx]
                        if (p && p.pot > 0) setLampPot(String(p.pot))
                      }}>
                      {presetsDoGrupo.map((p, i) => <option key={i} value={i}>{p.desc}{p.obs ? ` (${p.obs})` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 70px 1fr auto', gap: 6, alignItems: 'end' }}>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Qtd</label>
                    <input className="finput" type="number" style={{ height: 28, padding: '0 6px', fontSize: 11 }}
                      value={lampQtd} onChange={e => setLampQtd(e.target.value)} placeholder="4" min={1} />
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Potência (W)</label>
                    <input className="finput" type="number" style={{ height: 28, padding: '0 6px', fontSize: 11 }}
                      value={lampPot} onChange={e => setLampPot(e.target.value)} placeholder="9" min={0.5} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text4)', alignSelf: 'center', paddingTop: 4 }}>
                    {presetsDoGrupo[lampPreset]?.obs || `Fator dim.: ×${FATOR_DIM[lampGrupo] ?? 1.5}`}
                  </div>
                  <button className="btn primary" style={{ height: 28, padding: '0 12px', alignSelf: 'flex-end' }} onClick={addLampada}>+</button>
                </div>

                {/* Lista */}
                {lampadas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    {lampadas.map(l => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 8px', background: 'var(--surface2)', borderRadius: 4 }}>
                        <span style={{ flex: 1 }}>{l.qtd}× {l.descricao}</span>
                        <span style={{ color: 'var(--green)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{l.qtd * l.pot_w}W</span>
                        <button onClick={() => setLampadas(p => p.filter(x => x.id !== l.id))}
                          style={{ background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 15 }}>×</button>
                      </div>
                    ))}
                    <BadgeComparacao real_w={potRealLamps_w} dim_va={potDimLamps} norma_va={ilumNBR} grupo={grupoPredom} />
                  </div>
                )}
              </div>
            )}

            {/* ── Seletor Método dos Lúmens ── */}
            {form.ilum_modo === 'lampadas' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                  Método dos Lúmens — selecione a luminária para calcular automaticamente
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 55px auto', gap: 5, alignItems: 'end' }}>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Modelo</label>
                    <select className="fselect" style={{ height: 26, fontSize: 10 }}
                      value={lumIdx}
                      onChange={e => {
                        const idx = Number(e.target.value)
                        setLumIdx(idx)
                        const lum = CATALOGO_LUMINARIAS[idx]
                        if (lum && lum.pot > 0) {
                          setLumPotC(String(lum.pot))
                          setLumLmC(String(lum.lm))
                        }
                      }}>
                      {CATALOGO_LUMINARIAS.map((l, i) => (
                        <option key={i} value={i}>{l.nome}{l.obs ? ` — ${l.obs}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Lux alvo</label>
                    <input className="finput" type="number" style={{ height: 26, fontSize: 10 }}
                      value={lumLux} onChange={e => setLumLux(e.target.value)}
                      placeholder={area > 0 ? String(ILUMINANCIAS_REF[form.tipo === 'Social' ? 'Sala de estar' : form.tipo === 'Cozinha' ? 'Cozinha geral' : 'Corredor'] ?? 200) : '200'}
                      min={50} max={1000} />
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Pé dir. (m)</label>
                    <input className="finput" type="number" style={{ height: 26, fontSize: 10 }}
                      value={lumPe} onChange={e => setLumPe(e.target.value)}
                      placeholder="2.7" min={2} max={6} step={0.1} />
                  </div>
                  <button className="btn primary" style={{ height: 26, padding: '0 8px', alignSelf: 'flex-end', fontSize: 10 }}
                    onClick={() => {
                      const lum = CATALOGO_LUMINARIAS[lumIdx]
                      const pot = lum?.pot > 0 ? lum.pot : parseFloat(lumPotC) || 0
                      const lmV = lum?.lm  > 0 ? lum.lm  : parseFloat(lumLmC)  || 0
                      const lux = parseFloat(lumLux) || 200
                      const pe  = parseFloat(lumPe)  || 2.7
                      if (pot <= 0 || lmV <= 0 || area <= 0) return
                      const res = calcularLumens(area, pe, lux, { nome: lum?.nome ?? 'Custom', pot, lm: lmV })
                      if (!res) return
                      // Preencher automaticamente o modo manual com o resultado
                      setForm(f => ({
                        ...f,
                        ilum_modo: 'manual',
                        ilum_manual: String(res.pot_dim_va),
                      }))
                      alert(`✓ Método dos Lúmens: ${res.n_luminarias} luminária(s) × ${pot}W = ${res.pot_total_w}W real | ${res.pot_dim_va}VA dimensionamento | ΔU mínimo: ${res.e_media_lux.toFixed(0)} lux`)
                    }}>
                    Calcular
                  </button>
                </div>
                {CATALOGO_LUMINARIAS[lumIdx]?.pot === 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 4 }}>
                    <div className="fgroup" style={{ margin: 0 }}>
                      <label className="flabel" style={{ fontSize: 9 }}>Pot. (W)</label>
                      <input className="finput" type="number" style={{ height: 26, fontSize: 10 }}
                        value={lumPotC} onChange={e => setLumPotC(e.target.value)} placeholder="0" />
                    </div>
                    <div className="fgroup" style={{ margin: 0 }}>
                      <label className="flabel" style={{ fontSize: 9 }}>Fluxo (lm)</label>
                      <input className="finput" type="number" style={{ height: 26, fontSize: 10 }}
                        value={lumLmC} onChange={e => setLumLmC(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modo STRING */}
            {form.ilum_modo === 'string' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--text4)' }}>
                  Exemplos: <code>4×9W + 2×12W</code> · <code>3 LED 9W, 1 spot 50W</code> · <code>6×LED 9W</code>
                </div>
                <input className="finput" value={form.ilum_string} onChange={upd('ilum_string')}
                  placeholder="Ex: 4×9W + 2×12W LED" />
                {parsedFromString.length > 0 && (
                  <div style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: 5, fontSize: 10 }}>
                    {parsedFromString.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text3)' }}>{l.qtd}× {l.desc}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>{l.qtd * l.pot}W</span>
                      </div>
                    ))}
                    <BadgeComparacao real_w={potRealStr} dim_va={potDimStr} norma_va={ilumNBR} grupo="LED" />
                  </div>
                )}
              </div>
            )}

            {/* Modo MANUAL */}
            {form.ilum_modo === 'manual' && (
              <div className="fgroup">
                <input className="finput" type="number" value={form.ilum_manual} onChange={updNumPositivo('ilum_manual')}
                  placeholder={`NBR mín.: ${ilumNBR}VA`} min={0} step={50}
                  style={{ borderColor: ilumAbaixo ? 'var(--amber)' : '' }} />
                <div className="fhint">Valor direto para dimensionamento do cabo (VA)</div>
              </div>
            )}

            {/* Alerta vigia normativo */}
            {ilumAbaixo && (
              <div style={{ marginTop: 4, padding: '7px 10px', background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6, fontSize: 10, color: '#92400e', lineHeight: 1.6 }}>
                ⚠ <strong>Abaixo do mínimo NBR 5410 ({ilumNBR}VA)</strong><br />
                Projeto pode prosseguir com justificativa técnica (ex: laudo LED confirmado). Cabo e disjuntor serão dimensionados para o valor informado.
              </div>
            )}
          </div>

          {/* ── TOMADAS TUG ──────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="flabel">🔌 Tomadas TUG</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {MODOS_TUG.map(m => (
                  <ModeBtn key={m.id} id={m.id} label={m.label}
                    active={form.tug_modo === m.id}
                    onClick={() => setForm(f => ({ ...f, tug_modo: m.id }))} />
                ))}
              </div>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 6 }}>
              Mínimo NBR §9.5.2.2: <strong style={{ color: 'var(--text3)' }}>{tugNBR}VA</strong>
            </div>

            {form.tug_modo === 'auto' && (
              <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11, color: 'var(--text3)' }}>
                ✓ Automático NBR: <strong>{tugNBR}VA</strong>
              </div>
            )}

            {form.tug_modo === 'tomadas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px auto', gap: 6, alignItems: 'end' }}>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Tipo de tomada</label>
                    <select className="fselect" style={{ height: 28, fontSize: 11 }}
                      value={tomPreset} onChange={e => setTomPreset(Number(e.target.value))}>
                      {TIPOS_TOMADA.map((t, i) => <option key={i} value={i}>{t.desc}</option>)}
                    </select>
                  </div>
                  <div className="fgroup" style={{ margin: 0 }}>
                    <label className="flabel" style={{ fontSize: 9 }}>Qtd</label>
                    <input className="finput" type="number" style={{ height: 28, padding: '0 6px', fontSize: 11 }}
                      value={tomQtd} onChange={e => setTomQtd(e.target.value)} placeholder="3" min={1} />
                  </div>
                  <button className="btn" style={{ height: 28, padding: '0 10px', alignSelf: 'flex-end' }} onClick={addTomada}>+</button>
                </div>
                {TIPOS_TOMADA[tomPreset]?.va === 0 && (
                  <input className="finput" type="number" style={{ height: 28, fontSize: 11 }}
                    value={tomVAcust} onChange={e => setTomVAcust(e.target.value)} placeholder="VA por tomada" />
                )}
                {tomadas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {tomadas.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 8px', background: 'var(--surface2)', borderRadius: 4 }}>
                        <span style={{ flex: 1 }}>{t.qtd}× {t.desc}</span>
                        <span style={{ color: 'var(--blue)', fontWeight: 600, fontFamily: 'var(--mono)' }}>
                          {t.qtd * (t.va_custom ?? t.va_unit)}VA
                        </span>
                        <button onClick={() => setTomadas(p => p.filter(x => x.id !== t.id))}
                          style={{ background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 15 }}>×</button>
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total tomadas:</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: tugAbaixo ? 'var(--amber)' : 'var(--blue)' }}>{tugTomadas}VA</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {form.tug_modo === 'manual' && (
              <input className="finput" type="number" value={form.tug_manual} onChange={updNumPositivo('tug_manual')}
                placeholder={`NBR mín.: ${tugNBR}VA`} min={0} step={100}
                style={{ borderColor: tugAbaixo ? 'var(--amber)' : '' }} />
            )}

            {tugAbaixo && (
              <div style={{ marginTop: 4, padding: '6px 10px', background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6, fontSize: 10, color: '#92400e' }}>
                ⚠ Abaixo do mínimo NBR ({tugNBR}VA) — permitido com justificativa técnica
              </div>
            )}
          </div>

          {/* TUEs (chuveiro, motor, ar-condicionado...) são adicionados
              DEPOIS que o cômodo é criado, pelo formulário único de carga
              manual abaixo na lista de cômodos — mesmo caminho de ILUM/TUG,
              sem sistema separado. */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text4)', lineHeight: 1.4 }}>
              💡 TUEs (chuveiro, motor, ar-condicionado...) são adicionados depois de
              criar o cômodo, no card dele na lista — mesmo formulário usado para
              ILUM e TUG manuais, com campo de fase e tipo de carga.
            </div>
          </div>

          {/* Preview */}
          {(area > 0 && perim > 0) && (
            <div style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 7, padding: '10px 12px', fontSize: 11 }}>
              <div style={{ fontWeight: 600, color: 'var(--blue)', marginBottom: 6, fontSize: 12 }}>Preview deste cômodo</div>
              {[
                ['ILUM (dim.)', `${ilumEfetiva}VA`, ilumAbaixo ? 'var(--amber)' : 'var(--green)'],
                ...(potRealIlum > 0 ? [['ILUM (real)', `${potRealIlum}W`, '#16a34a']] : []),
                ['TUG (dim.)', `${tugEfetiva}VA`, tugAbaixo ? 'var(--amber)' : 'var(--blue)'],
                ['TOTAL dim.', `${totalCard}VA`, 'var(--text)'],
              ].map(([k, v, col]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid var(--blue-line)' }}>
                  <span style={{ color: 'var(--text3)' }}>{k}</span>
                  <span style={{ color: col as string, fontWeight: 600, fontFamily: 'var(--mono)' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn primary" onClick={adicionar}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            + Adicionar cômodo
          </button>
        </div>
      </div>

      {/* ── Lista de cômodos ──────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflowX: 'hidden' }}>
        {comodos.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🏠</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Nenhum cômodo adicionado</div>
            <div style={{ fontSize: 12 }}>Preencha o formulário e clique em Adicionar.</div>
          </div>
        ) : comodos.map(c => {
          const tueTot  = c.tues.reduce((s, t) => s + t.potencia_va, 0)
          const total   = c.ilum_va + c.tug_va + tueTot
          const lumino  = (c as any).lumino
          const potReal = lumino ? Math.round((lumino.n_luminarias || 1) * lumino.luminaria_pot_w) : 0
          const ilumNBRc = calcIlumComodo(c.area_m2)
          const tugNBRc  = calcTugComodo(c.perimetro_m, c.tipo, c.area_m2)
          const abaixoIlum = c.ilum_va < ilumNBRc
          const abaixoTug  = c.tug_va  < tugNBRc
          const violacoesNBR9 = verificarComodoNBR9(c).filter(v => !v.conforme)
          const errosNBR9 = violacoesNBR9.filter(v => v.severidade === 'erro' || v.severidade === 'fisico_critico')

          return (
            <div key={c.id} className="card" style={{ position: 'relative', overflow: 'visible' }}>
              {/* Modal de luminária inline */}
              {lumModalComodo === c.id && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }}>
                  <LuminariaSelector
                    area_m2={c.area_m2}
                    pe_m={(c as any).pe_m ?? 2.7}
                    onSelect={(pot_dim_va, _pot_real_w, _desc) => {
                      updateComodo(c.id, { ilum_va: pot_dim_va })
                    }}
                    onClose={() => setLumModalComodo(null)}
                  />
                </div>
              )}

              <div className="card-header">
                <div>
                  <span style={{ fontWeight: 600 }}>{c.nome}</span>
                  {violacoesNBR9.length > 0 && (
                    <span title={violacoesNBR9.map(v => v.descricao).join(' · ')} style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '1px 5px',
                      borderRadius: 4,
                      background: errosNBR9.length > 0 ? 'rgba(220,38,38,.12)' : 'var(--amber-dim)',
                      color: errosNBR9.length > 0 ? 'var(--red)' : 'var(--amber)',
                      border: `1px solid ${errosNBR9.length > 0 ? 'var(--red)' : 'var(--amber)'}`,
                    }}>
                      {errosNBR9.length > 0 ? '⛔' : '⚠'} {violacoesNBR9.length} {errosNBR9.length > 0 ? 'violação(ões)' : 'aviso(s)'} NBR
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>
                    {c.tipo} · {c.area_m2}m² · {c.perimetro_m}m perímetro
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn" style={{ height: 24, fontSize: 10 }}
                    onClick={() => setLumModalComodo(lumModalComodo === c.id ? null : c.id)}>
                    ⊕ Luminária
                  </button>
                  <button onClick={() => removeComodo(c.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>
                    ×
                  </button>
                </div>
              </div>

              {/* Colunas: Real | Dimensionamento | Norma */}
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: potReal > 0 ? 8 : 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>ILUM dim.</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: abaixoIlum ? 'var(--amber)' : 'var(--green)', fontFamily: 'var(--mono)' }}>{c.ilum_va}</div>
                    <div style={{ fontSize: 9, color: 'var(--text4)' }}>VA</div>
                  </div>
                  {potReal > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>ILUM real</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a', fontFamily: 'var(--mono)' }}>{potReal}</div>
                      <div style={{ fontSize: 9, color: 'var(--text4)' }}>W (consumo)</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>TUG dim.</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: abaixoTug ? 'var(--amber)' : 'var(--blue)', fontFamily: 'var(--mono)' }}>{c.tug_va}</div>
                    <div style={{ fontSize: 9, color: 'var(--text4)' }}>VA</div>
                  </div>
                  {tueTot > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>TUEs</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{tueTot}</div>
                      <div style={{ fontSize: 9, color: 'var(--text4)' }}>VA</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>TOTAL dim.</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{total}</div>
                    <div style={{ fontSize: 9, color: 'var(--text4)' }}>VA</div>
                  </div>
                </div>

                {/* Mini norma comparison */}
                {(abaixoIlum || abaixoTug) && (
                  <div style={{ fontSize: 10, color: 'var(--amber)', padding: '4px 6px', background: 'var(--amber-dim)', borderRadius: 5, display: 'flex', gap: 12 }}>
                    {abaixoIlum && <span>⚠ ILUM abaixo do mínimo NBR ({ilumNBRc}VA)</span>}
                    {abaixoTug  && <span>⚠ TUG abaixo do mínimo NBR ({tugNBRc}VA)</span>}
                    <span style={{ color: 'var(--text4)' }}>— autonomia do projetista registrada</span>
                  </div>
                )}
              </div>

              {c.tues.length > 0 && (
                <div style={{ padding: '0 14px 10px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, color: 'var(--text4)', margin: '6px 0 3px', textTransform: 'uppercase' }}>TUEs</div>
                  {c.tues.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0' }}>
                      <span>{t.descricao}</span>
                      <span style={{ color: 'var(--amber)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{t.potencia_va}VA</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── CARGAS MANUAIS ──────────────────────────────────── */}
              <div style={{ padding: '8px 14px 10px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', fontWeight: 600 }}>⚡ Cargas manuais</span>
                </div>
                {(c.cargas_manuais ?? []).map(cm => (
                  <div key={cm.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 0', fontSize:11 }}>
                    <span style={{ flex:1, color:'var(--text)' }}>
                      <span style={{ color:'var(--text4)' }}>{cm.tipo}</span> {cm.descricao}
                      <span style={{ color:'var(--text4)', marginLeft:5 }}>{cm.qtd}×{cm.potencia_va}VA</span>
                      {cm.abaixo_nbr && <span style={{ color:'var(--amber)', marginLeft:4, fontSize:9 }}>⚠ abaixo NBR</span>}
                      {(cm as any).distancia_box_m !== undefined && (
                        <span style={{
                          color: (cm as any).distancia_box_m < 0.6 && ['TUG','GERAL'].includes(cm.tipo) ? 'var(--red)' : 'var(--text4)',
                          marginLeft:4, fontSize:9, fontWeight:700,
                        }}>
                          · {(cm as any).distancia_box_m}m do box
                        </span>
                      )}
                    </span>
                    <button style={{ fontSize:9, color:'var(--text4)', background:'none', border:'none', cursor:'pointer', padding:0 }}
                      onClick={() => removeCargaManual(c.id, cm.id)}>✕</button>
                  </div>
                ))}
                {c.tipo === 'Banho' && (
                  <div style={{ marginTop:6, marginBottom:2, display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize:9, color:'var(--text4)', display:'block', marginBottom:2 }}
                        title="NBR 5410 §9.1 — restringe o tipo de equipamento permitido conforme a proximidade com a fonte de água">
                        Distância até a banheira/box (m) — opcional
                      </label>
                      <input className="finput" type="number" min={0} step={0.1}
                        placeholder="ex: 0,3"
                        value={formCarga.distancia_box_m}
                        onChange={e => setFormCarga(f => ({ ...f, distancia_box_m: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                        style={{ fontSize:10, width:'100%' }} />
                    </div>
                    {typeof formCarga.distancia_box_m === 'number' && formCarga.distancia_box_m < 0.6 && ['TUG','GERAL'].includes(formCarga.tipo) && (
                      <span style={{ fontSize:9, color:'var(--red)', fontWeight:700, maxWidth: 140 }}>
                        ⛔ &lt;0,60m — tomada não permitida aqui (§9.1)
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns: formCarga.tipo === 'TUE' ? '56px 1fr 64px 36px 36px 64px auto' : '56px 1fr 64px 36px 36px auto', gap:4, alignItems:'end', marginTop:6 }}>
                  <select value={formCarga.tipo}
                    onChange={e => setFormCarga(f => ({ ...f, tipo: e.target.value as any }))}
                    title="Tipo de carga: ILUM/TUG são agrupáveis com outras do mesmo tipo; cada TUE vira seu próprio circuito dedicado"
                    style={{ fontSize:10, padding:'3px 4px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4 }}>
                    <option value="ILUM">ILUM</option><option value="TUG">TUG</option>
                    <option value="TUE">TUE</option><option value="GERAL">Geral</option>
                  </select>
                  <input className="finput" placeholder="Descrição" value={formCarga.descricao}
                    onChange={e => setFormCarga(f => ({ ...f, descricao: e.target.value }))}
                    style={{ fontSize:10 }} />
                  <input className="finput" type="number" min={1} step={50}
                    value={formCarga.potencia_va} title="VA"
                    onChange={e => setFormCarga(f => ({ ...f, potencia_va: Number(e.target.value) }))}
                    style={{ fontSize:10, textAlign:'right' }} />
                  <input className="finput" type="number" min={1} max={99}
                    value={formCarga.qtd} title="Qtd"
                    onChange={e => setFormCarga(f => ({ ...f, qtd: Math.max(1, Number(e.target.value)) }))}
                    style={{ fontSize:10, textAlign:'center' }} />
                  <select value={formCarga.fase}
                    onChange={e => setFormCarga(f => ({ ...f, fase: e.target.value as any }))}
                    title="Ligação elétrica — define quantas fases o circuito usa (bifásico = 2 fases, sem neutro)"
                    style={{ fontSize:10, padding:'3px 2px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4 }}>
                    <option value="mono">1φ</option><option value="bi">2φ</option><option value="tri">3φ</option>
                  </select>
                  {formCarga.tipo === 'TUE' && (
                    <select value={formCarga.tipo_carga}
                      onChange={e => setFormCarga(f => ({ ...f, tipo_carga: e.target.value as any }))}
                      title="Tipo de carga — define a curva do disjuntor (motor exige curva D, resistivo curva B)"
                      style={{ fontSize:9.5, padding:'3px 2px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4 }}>
                      <option value="geral">Geral</option>
                      <option value="resistivo">Resist.</option>
                      <option value="motor">Motor</option>
                      <option value="ar_cond">A/C</option>
                    </select>
                  )}
                  <button className="btn primary" style={{ height:26, fontSize:10, padding:'0 6px' }}
                    onClick={() => {
                      const nbr = formCarga.tipo === 'ILUM' ? c.ilum_va : formCarga.tipo === 'TUG' ? c.tug_va : 0
                      addCargaManual(c.id, {
                        tipo: formCarga.tipo, descricao: formCarga.descricao || `${formCarga.tipo} ${c.nome}`,
                        potencia_va: formCarga.potencia_va, qtd: formCarga.qtd, fase: formCarga.fase,
                        abaixo_nbr: formCarga.potencia_va * formCarga.qtd < nbr, nbr_min_va: nbr,
                        ...(formCarga.tipo === 'TUE' ? { tipo_carga: formCarga.tipo_carga } : {}),
                        ...(c.tipo === 'Banho' && typeof formCarga.distancia_box_m === 'number'
                              ? { distancia_box_m: formCarga.distancia_box_m } : {}),
                      })
                      setFormCarga(f => ({ ...f, descricao:'', potencia_va:100, qtd:1, distancia_box_m:'' }))
                    }}>+</button>
                </div>
                {formCarga.tipo === 'TUE' && (
                  <div style={{ fontSize: 9.5, color: 'var(--text4)', marginTop: 3 }}>
                    💡 Cada TUE vira seu próprio circuito dedicado — não é agrupado com outras cargas.
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {comodos.length > 0 && (
          <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
            <strong>Separação de potências:</strong> "ILUM dim." e "TUG dim." = valor para dimensionar cabo e disjuntor (segurança).
            "ILUM real" = consumo real das luminárias instaladas (para conta de energia e luminotécnica).
            Valores abaixo do mínimo NBR são permitidos com justificativa técnica do projetista.
          </div>
        )}
      </div>
    </div>
    </div>
  </>)
}
