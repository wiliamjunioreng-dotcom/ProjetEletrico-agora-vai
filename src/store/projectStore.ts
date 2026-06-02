// src/store/projectStore.ts
import { create } from 'zustand'
import { dimensionarCircuito, calcularDemanda, calcIlumComodo, calcTugComodo } from '../core/engine'
import { solve } from '../core/solver'
import { resolverCircuito } from '../core/pipeline'
import type { EstadoCalculado } from '../core/solver'
import { analisarSegmento } from '../core/topologia'
import type { Comodo, DemandaResult, FaseType, Projeto, Carga, CircuitoV3, TrechoEletroduto, RedeEletrica, NoTopologico, SegmentoEletroduto } from '../types/electrical'
import type { CircuitResult } from '../core/engine'

export interface LampadaReal {
  id:       string
  descricao: string   // Ex: "LED 9W A60"
  qtd:      number
  pot_w:    number    // potência real de cada unidade
  pot_dim_w?: number  // potência para dimensionamento (se diferente)
}

// ── Histórico de decisões do projeto ─────────────────────────────
export interface EntradaHistorico {
  id:          string
  timestamp:   number     // Date.now()
  tipo:        'override' | 'auditoria' | 'norma' | 'manual'
  circuito_id?: string
  comodo_id?:  string
  descricao:   string     // "Seção aumentada de 1.5→4mm² (proteção funcional)"
  autor?:      string     // nome do projetista (do projeto)
}

export interface RawCircuit {
  id: string
  descricao: string
  potencia_va: number          // Potência de DIMENSIONAMENTO (usada para cabo/disjuntor)
  potencia_real_w?: number     // Potência REAL instalada (LED real, etc.)
  lampadas?: LampadaReal[]     // Componentes de iluminação individuais
  abaixo_minimo_nbr?: boolean  // Flag: usuário inseriu abaixo do mínimo normativo
  minimo_nbr_va?: number       // Mínimo calculado pela NBR 5410 para informação
  justificativa?: string       // Justificativa técnica para abaixo do mínimo
  fase: FaseType
  ligacao?: TipoLigacao        // monofasica | bifasica | trifasica — determina as fases disponíveis
  comprimento_m: number
  n_agrup: number
  tipo: string
  comodo_id?: string
  // ── Override do engenheiro ─────────────────────────────────────
  // Quando definido, o sistema respeita a decisão e não recalcula
  override_secao_mm2?: number   // "quero 4mm² mesmo que 2.5mm² resolva"
  override_in_disj?: number     // "quero 25A mesmo que 16A seja suficiente"
  override_curva?: 'B'|'C'|'D' // "quero curva D para este motor específico"
  override_motivo?: string      // justificativa obrigatória para rastreabilidade
}

// Fases permitidas por sistema
// Tipo de ligação do circuito — determina quantas fases usa
export type TipoLigacao = 'monofasica' | 'bifasica' | 'trifasica'

// Fases disponíveis por tipo de ligação E sistema da instalação
// REGRA: carga monofásica → 1 fase | bifásica → 2 fases | trifásica → 3 fases
export function fasesParaTipo(ligacao: TipoLigacao, sistema: string): FaseType[] {
  if (ligacao === 'monofasica') {
    if (sistema === 'Monofasico') return ['R']
    if (sistema === 'Bifasico')   return ['R', 'S']
    return ['R', 'S', 'T']           // Trifasico
  }
  if (ligacao === 'bifasica') {
    if (sistema === 'Bifasico')   return ['RS']
    if (sistema === 'Trifasico')  return ['RS', 'ST', 'RT']
    return ['RS']                    // Monofasico não tem bifásico — fallback
  }
  // trifasica
  return ['RST']
}

// Inferir ligação pelo tipo e potência do circuito
export function inferirLigacao(tipo: string, potencia_va: number): TipoLigacao {
  if (tipo === 'ILUM' || tipo === 'TUG') return 'monofasica'
  if (tipo === 'TUE') {
    if (potencia_va >= 6000)  return 'trifasica'  // motor, compressor grande
    if (potencia_va >= 2500)  return 'bifasica'   // chuveiro, AC split, secador
    return 'monofasica'                            // forno pequeno, micro-ondas
  }
  return 'monofasica'
}

// Fase padrão para uma ligação
export function faseDefault(ligacao: TipoLigacao, sistema: string): FaseType {
  const disponiveis = fasesParaTipo(ligacao, sistema)
  return disponiveis[0]
}

// Compatibilidade: retornar todas as fases do sistema (para páginas legadas)
export function fasesPermitidas(sistema: string): FaseType[] {
  if (sistema === 'Monofasico') return ['R']
  if (sistema === 'Trifasico')  return ['R','S','T','RS','ST','RT','RST']
  return ['R','S','RS']  // Bifasico
}

export function getVLinha(v_fase: number): number {
  return Math.round(v_fase * Math.sqrt(3))
}

export function getTensaoCircuito(fase: FaseType, v_fase: number): number {
  const mono: FaseType[] = ['R','S','T']
  return mono.includes(fase) ? v_fase : getVLinha(v_fase)
}

interface ProjectState {
  projeto: Omit<Projeto, 'nodes' | 'edges' | 'comodos'>
  comodos: Comodo[]
  circuitos_raw: RawCircuit[]
  circuitos_calc: CircuitResult[]
  demanda: DemandaResult | null
  pagina_atual: string
  circuito_foco_id: string | null   // circuito destacado pela auditoria
  historico: EntradaHistorico[]       // timeline de decisões técnicas
  modificado: boolean
  arquivo_path: string | null
  // Estado calculado pelo solver (imutável — nunca editar diretamente)
  estado: EstadoCalculado | null

  // ── v3: Carga → Circuito → Eletroduto ─────────────────────
  cargas:     Carga[]
  circuitos:  CircuitoV3[]
  trechos:    TrechoEletroduto[]
  rede:       RedeEletrica

  addNo:          (n: Omit<NoTopologico, 'id'>) => void
  removeNo:       (id: string) => void
  addSegmento:    (s: Omit<SegmentoEletroduto, 'id' | 'analise'>) => void
  removeSegmento: (id: string) => void
  recalcularRede: () => void

  addCarga:        (c: Omit<Carga, 'id'>) => void
  updateCarga:     (id: string, partial: Partial<Carga>) => void
  removeCarga:     (id: string) => void
  addCircuitoV3:   (c: Omit<CircuitoV3, 'id' | 'calculado'>) => void
  updateCircuitoV3:(id: string, partial: Partial<Omit<CircuitoV3, 'calculado'>>) => void
  removeCircuitoV3:(id: string) => void
  addCargaAoCircuito:(circuito_id: string, carga_id: string) => void
  recalcularCircuitosV3: () => void
  addTrecho:       (t: Omit<TrechoEletroduto, 'id' | 'condutores'>) => void
  updateTrecho:    (id: string, partial: Partial<Omit<TrechoEletroduto, 'condutores'>>) => void
  removeTrecho:    (id: string) => void
  calcularCondutores: () => void

  setPagina:    (p: string) => void
  setCircuitoFoco: (id: string | null) => void
  addHistorico: (entry: Omit<EntradaHistorico, 'id' | 'timestamp'>) => void
  setProjeto:   (partial: Partial<ProjectState['projeto']>) => void
  setSistema:   (s: string) => void
  setVFase:     (v: number) => void

  addComodo:              (c: Omit<Comodo, 'id' | 'ilum_va' | 'tug_va'>) => void
  removeComodo:           (id: string) => void
  addCargaManual:         (comodo_id: string, carga: Omit<import('../types/electrical').CargaManual, 'id'>) => void
  removeCargaManual:      (comodo_id: string, carga_id: string) => void
  updateComodo:           (id: string, partial: Partial<Comodo>) => void
  clearComodos:           () => void
  gerarCircuitosDeComodos:() => void
  gerarReservasQD:       () => void

  addCircuito:    (c: Omit<RawCircuit, 'id'>) => void
  updateCircuitoBatch: (id: string, updates: Partial<RawCircuit>) => void
  updateCircuito: (id: string, partial: Partial<RawCircuit>) => void
  removeCircuito: (id: string) => void
  setCircuitos:   (circs: RawCircuit[]) => void
  recalcular:     () => void
  balancearFases: () => void
  setFaseCircuito:(id: string, fase: FaseType) => void

  salvarJSON:   () => string
  carregarJSON: (json: string) => void
  resetar:      () => void
  marcarSalvo:  (path: string) => void
}

// Comprimento estimado por tipo de comodo (refinavel pelo engenheiro)
// Baseado em comodo tipico de 3x4m com QD centralizado
export function comprimentoEstimado(tipoComodo: string, tipoCircuito: 'ILUM' | 'TUG' | 'TUE'): number {
  const COMP: Record<string, { ILUM: number; TUG: number; TUE: number }> = {
    'Sala':          { ILUM: 15, TUG: 12, TUE: 15 },
    'Quarto':        { ILUM: 12, TUG: 10, TUE: 12 },
    'Cozinha':       { ILUM: 10, TUG: 8,  TUE: 10 },
    'Banheiro':      { ILUM: 8,  TUG: 6,  TUE: 8  },
    'Lavabo':        { ILUM: 8,  TUG: 6,  TUE: 8  },
    'Lavanderia':    { ILUM: 8,  TUG: 8,  TUE: 8  },
    'Garagem':       { ILUM: 18, TUG: 14, TUE: 18 },
    'Externo':       { ILUM: 22, TUG: 18, TUE: 22 },
    'Corredor':      { ILUM: 14, TUG: 10, TUE: 14 },
    'Escritório':    { ILUM: 12, TUG: 10, TUE: 12 },
    'Varanda':       { ILUM: 18, TUG: 14, TUE: 18 },
  }
  const def = { ILUM: 18, TUG: 12, TUE: 15 }
  return (COMP[tipoComodo] ?? def)[tipoCircuito]
}

const projetoDefault: ProjectState['projeto'] = {
  id:                crypto.randomUUID(),
  nome:              'Novo Projeto',
  endereco:          '',
  projetista:        '',
  crea:              '',
  ano:               new Date().getFullYear().toString(),
  concessionaria:    'CEMIG',
  sistema:           'Bifasico',
  v_fase:            127,
  v_linha:           220,
  metodo_instalacao: 'B1',
  isolacao:          'PVC',
  material_cabo:     'Cu',
  t_amb:             30,
  du_max_pct:        4,
  du_ramal_pct:      0.5,
  aterramento:       'TN-S',
  fp_global:         0.92,
  icc_rede_ka:       5,
  versao:            '2.0',
  criado_em:         new Date().toISOString(),
  modificado_em:     new Date().toISOString(),
}

function calcCircuito(raw: RawCircuit, proj: ProjectState['projeto']): CircuitResult {
  return dimensionarCircuito({
    ...raw,
    v_fase:      proj.v_fase,
    metodo:      proj.metodo_instalacao,
    isolacao:    proj.isolacao,
    material:    proj.material_cabo,
    t_amb:       proj.t_amb,
    du_max:      proj.du_max_pct,
    du_ramal:    proj.du_ramal_pct,
    icc_rede_ka: proj.icc_rede_ka,
  })
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projeto:        { ...projetoDefault },
  comodos:        [],
  circuitos_raw:  [],
  circuitos_calc: [],
  demanda:        null,
  pagina_atual:   'dashboard',
  circuito_foco_id: null,
  historico: [],
  estado:    null,
  cargas:    [],
  circuitos: [],
  trechos:   [],
  rede:      { nos: [], segmentos: [], caminhos: [] },
  modificado:     false,
  arquivo_path:   null,

  setPagina: (p) => set({ pagina_atual: p, circuito_foco_id: null }),
  setCircuitoFoco: (id) => set({ circuito_foco_id: id }),
  addHistorico: (entry) => set(s => ({
    historico: [...s.historico, {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }].slice(-50),  // manter últimas 50 entradas
  })),

  setProjeto: (partial) => {
    set(s => ({ projeto: { ...s.projeto, ...partial }, modificado: true }))
    get().recalcular()
  },

  setSistema: (sistema: string) => {
    const v_fase = sistema === 'Trifasico' ? 220 : 127
    get().setProjeto({ sistema: sistema as any, v_fase, v_linha: getVLinha(v_fase) })
  },

  setVFase: (v) => get().setProjeto({ v_fase: v, v_linha: getVLinha(v) }),

  // ── Cômodos ─────────────────────────────────────────────────
  addComodo: (input) => {
    // Respeitar valores calculados pelo formulário (autonomia do projetista)
    // Se o input já traz ilum_va/tug_va (modo manual, LED real, etc.), usar eles
    const inputAny = input as any
    const ilum_nbr = calcIlumComodo(input.area_m2)
    const tug_nbr  = calcTugComodo(input.perimetro_m, input.tipo)
    const comodo: Comodo = {
      ...input,
      id:      crypto.randomUUID(),
      // Usar o valor do formulário se explicitamente informado, senão NBR
      ilum_va: inputAny.ilum_va !== undefined ? inputAny.ilum_va : ilum_nbr,
      tug_va:  inputAny.tug_va  !== undefined ? inputAny.tug_va  : tug_nbr,
      cargas_manuais: [],
    }
    set(s => ({ comodos: [...s.comodos, comodo], modificado: true }))
  },

  addCargaManual: (comodo_id, carga) => {
    const id = crypto.randomUUID()
    set(s => ({
      comodos: s.comodos.map(co => co.id !== comodo_id ? co : {
        ...co,
        cargas_manuais: [...(co.cargas_manuais ?? []), { ...carga, id }],
      }),
      modificado: true,
    }))
    get().recalcular()
  },

  removeCargaManual: (comodo_id, carga_id) => {
    set(s => ({
      comodos: s.comodos.map(co => co.id !== comodo_id ? co : {
        ...co,
        cargas_manuais: (co.cargas_manuais ?? []).filter(c => c.id !== carga_id),
      }),
      modificado: true,
    }))
    get().recalcular()
  },

  removeComodo: (id) => {
    set(s => ({
      comodos:       s.comodos.filter(c => c.id !== id),
      circuitos_raw: s.circuitos_raw.filter(c => c.comodo_id !== id),
      modificado:    true,
    }))
    get().recalcular()
  },

  updateComodo: (id, partial) => {
    set(s => ({
      comodos: s.comodos.map(c => {
        if (c.id !== id) return c
        const u = { ...c, ...partial }
        u.ilum_va = calcIlumComodo(u.area_m2)
        u.tug_va  = calcTugComodo(u.perimetro_m, u.tipo)
        return u
      }),
      modificado: true,
    }))
    // Sincronizar circuitos gerados por esse cômodo
    const comodo = get().comodos.find(c => c.id === id)
    if (comodo) {
      set(s => ({
        circuitos_raw: s.circuitos_raw.map(c => {
          if (c.comodo_id !== id) return c
          if (c.tipo === 'ILUM') return { ...c, potencia_va: comodo.ilum_va }
          if (c.tipo === 'TUG')  return { ...c, potencia_va: comodo.tug_va }
          return c
        }),
      }))
      get().recalcular()
    }
  },

  clearComodos: () => set({ comodos: [], modificado: true }),

  gerarCircuitosDeComodos: () => {
    const { comodos, projeto } = get()
    if (!comodos.length) return
    const circs: RawCircuit[] = []
    const fases: FaseType[] = projeto.sistema === 'Monofasico' ? ['R','R','R']
                            : projeto.sistema === 'Trifasico'  ? ['R','S','T']
                            : ['R','S','R']
    let fi = 0

    // ── Cargas manuais declaradas pelo engenheiro ─────────────────
    // Quando o cômodo possui cargas_manuais[], usá-las diretamente
    // (sobrepõem os valores NBR calculados)
    const comodos_com_cargas = comodos.filter(c => c.cargas_manuais?.length)
    for (const co of comodos_com_cargas) {
      for (const cm of co.cargas_manuais) {
        const pot = cm.potencia_va * cm.qtd
        const ligacao = cm.fase === 'tri' ? 'trifasica' : cm.fase === 'bi' ? 'bifasica' : 'monofasica'
        const fasesDisp = fasesParaTipo(ligacao as TipoLigacao, projeto.sistema)
        circs.push({
          id: crypto.randomUUID(),
          descricao: cm.descricao || `${cm.tipo}: ${co.nome}`,
          potencia_va: pot,
          fase: fasesDisp[fi++ % fasesDisp.length],
          ligacao: ligacao as TipoLigacao,
          tipo: cm.tipo,
          comodo_id: co.id,
          comprimento_m: comprimentoEstimado(co.tipo, cm.tipo as 'ILUM'|'TUG'|'TUE'),
          n_agrup: 1,
          abaixo_minimo_nbr: cm.abaixo_nbr,
          minimo_nbr_va: cm.nbr_min_va,
        })
      }
    }

    // Cômodos sem cargas manuais → usar lógica NBR automática abaixo
    const comodos_auto = comodos.filter(c => !c.cargas_manuais?.length)

    // ILUM — agrupar até 3 ou 800VA
    // potencia_real_w = soma da pot. real das lâmpadas (LED real)
    // potencia_va     = pot. de dimensionamento (cabo/disjuntor)
    let grp: string[] = [], grpVA = 0, grpRealW = 0, grpId = '', grpComodos: string[] = []
    comodos_auto.filter(c => c.ilum_va > 0).forEach(c => {
      const lumino = (c as any).lumino
      const realW  = lumino ? Math.round((lumino.n_luminarias || 1) * lumino.luminaria_pot_w) : 0

      if (grp.length >= 3 || grpVA + c.ilum_va > 800) {
        if (grp.length > 0) {
          // Coletar lampadas dos cômodos deste grupo para composição analítica
          const lampGrupo = grpComodos.flatMap((cid: string) => {
            const com = comodos.find(x => x.id === cid)
            const lamps = (com as any)?.lampadas ?? []
            return lamps
          })
          circs.push({
            id: crypto.randomUUID(), descricao: `ILUM: ${grp.join(', ')}`,
            potencia_va:     grpVA,
            potencia_real_w: grpRealW > 0 ? grpRealW : undefined,
            lampadas:        lampGrupo.length > 0 ? lampGrupo : undefined,
            minimo_nbr_va:   grpVA,
            abaixo_minimo_nbr: false,
            fase: fases[fi++ % 3],
            comprimento_m: comprimentoEstimado(comodos.find(x => x.id === grpId)?.tipo ?? 'Sala', 'ILUM'),
            n_agrup: 1, tipo: 'ILUM', comodo_id: grpId,
          })
        }
        grp = []; grpVA = 0; grpRealW = 0; grpId = ''; grpComodos = []
      }
      grp.push(c.nome)
      grpVA    += c.ilum_va
      grpRealW += realW
      grpId = c.id
      grpComodos.push(c.id)
    })
    if (grp.length > 0) circs.push({
      id: crypto.randomUUID(), descricao: `ILUM: ${grp.join(', ')}`,
      potencia_va:     grpVA,
      potencia_real_w: grpRealW > 0 ? grpRealW : undefined,
      minimo_nbr_va:   grpVA,
      abaixo_minimo_nbr: false,
      fase: fases[fi++ % 3],
      comprimento_m: 18, n_agrup: 1, tipo: 'ILUM', comodo_id: grpId,
    })

    // TUG
    fi = 0
    comodos_auto.filter(c => c.tug_va > 0).forEach(c => {
      circs.push({
        id: crypto.randomUUID(), descricao: `TUG: ${c.nome}`,
        potencia_va: c.tug_va, fase: fases[fi++ % 3], ligacao: 'monofasica' as TipoLigacao,
        comprimento_m: comprimentoEstimado(c.tipo, 'TUG'), n_agrup: 1, tipo: 'TUG', comodo_id: c.id,
      })
    })

    // TUE
    comodos_auto.forEach(c => {
      ;(c.tues ?? []).forEach(t => {
        // Inferir ligação pela potência
        const ligacao = inferirLigacao('TUE', t.potencia_va)
        const fasesDisp = fasesParaTipo(ligacao, projeto.sistema)
        const fase: FaseType = fasesDisp[fi++ % fasesDisp.length]
        // Comprimento estimado pelo tipo de ambiente (refinável pelo engenheiro)
        const comp = c.tipo === 'Externo' || c.tipo === 'Garagem' ? 20 : 12
        circs.push({
          id: crypto.randomUUID(), descricao: `TUE: ${t.descricao} (${c.nome})`,
          potencia_va: t.potencia_va, fase, ligacao,
          comprimento_m: comp, n_agrup: 1, tipo: 'TUE', comodo_id: c.id,
        })
      })
    })

    set({ circuitos_raw: circs, modificado: true })
    get().recalcular()
  },

  // ── Circuitos ────────────────────────────────────────────────
  addCircuito: (c) => {
    set(s => ({ circuitos_raw: [...s.circuitos_raw, { ...c, id: crypto.randomUUID() }], modificado: true }))
    get().recalcular()
  },

  updateCircuitoBatch: (id: string, updates: Partial<RawCircuit>) => {
    // Atualização atômica — múltiplos campos em uma única mutação
    // Evita race conditions de setTimeout(0) para lampadas + potencia_va
    set(s => ({
      circuitos_raw: s.circuitos_raw.map(c => c.id === id ? { ...c, ...updates } : c),
      modificado: true,
    }))
    // Recalcular após todos os campos serem atualizados
    get().recalcular()
  },

  updateCircuito: (id, partial) => {
    // Se tem override, registrar no histórico
    if (partial.override_secao_mm2 || partial.override_in_disj || partial.override_curva) {
      // encontrar circuito para contexto se necessário
      const motivo = partial.override_motivo ?? 'Override manual'
      get().addHistorico({
        tipo: 'override',
        circuito_id: id,
        descricao: motivo,
        autor: get().projeto.projetista || undefined,
      })
    }
    set(s => ({
      circuitos_raw: s.circuitos_raw.map(c => c.id === id ? { ...c, ...partial } : c),
      modificado: true,
    }))
    get().recalcular()
  },

  removeCircuito: (id) => {
    set(s => ({ circuitos_raw: s.circuitos_raw.filter(c => c.id !== id), modificado: true }))
    get().recalcular()
  },

  setCircuitos: (circs) => {
    set({ circuitos_raw: circs, modificado: true })
    get().recalcular()
  },

  recalcular: () => {
    const { circuitos_raw, projeto, rede } = get()
    // Calcular legado (compatibilidade com páginas existentes)
    const calc = circuitos_raw.map(r => calcCircuito(r, projeto))
    const dem  = calcularDemanda(calc, projeto.v_fase, projeto.fp_global)
    // Solver determinístico puro (novo — não muta domínio)
    const estado = solve({
      projeto: {
        sistema:           projeto.sistema,
        v_fase:            projeto.v_fase,
        v_linha:           projeto.v_linha,
        metodo_instalacao: projeto.metodo_instalacao,
        isolacao:          projeto.isolacao,
        material_cabo:     projeto.material_cabo,
        t_amb:             projeto.t_amb,
        du_max_pct:        projeto.du_max_pct,
        du_ramal_pct:      projeto.du_ramal_pct,
        fp_global:         projeto.fp_global,
        icc_rede_ka:       projeto.icc_rede_ka,
        aterramento:       projeto.aterramento,
      },
      circuitos: circuitos_raw,
      rede,
    })
    set({ circuitos_calc: calc, demanda: dem, estado })
    // Atualizar circuitos de reserva automaticamente
    get().gerarReservasQD()
  },

  // Gera/atualiza circuitos de reserva no QD automaticamente
  // Chamado após recalcular() quando n_ativos muda
  gerarReservasQD: () => {
    const { circuitos_raw, demanda, projeto } = get()
    if (!demanda) return

    const ativos = circuitos_raw.filter(r => r.tipo !== 'RESERVA')
    const n_ativos = ativos.length

    // Contar concluídos com confiança ≥ parcial
    const n_concluidos = ativos.filter(r => {
      if ((r.potencia_va ?? 0) <= 0) return false
      try {
        const p = resolverCircuito({
          id: r.id, descricao: r.descricao, tipo: r.tipo,
          fase: r.fase, potencia_va: r.potencia_va ?? 0,
          comprimento_m: r.comprimento_m ?? 0, n_agrup: r.n_agrup ?? 1,
          v_fase: projeto.v_fase, metodo: projeto.metodo_instalacao,
          isolacao: projeto.isolacao as any, material: projeto.material_cabo as any,
          t_amb: projeto.t_amb, du_max_pct: projeto.du_max_pct,
          du_ramal_pct: projeto.du_ramal_pct, icc_rede_ka: projeto.icc_rede_ka,
        })
        return p.execution.confianca !== 'inviavel'
      } catch { return false }
    }).length

    const base = Math.max(n_ativos, n_concluidos)
    const n_minimo = base <= 6 ? 2 : base <= 12 ? 3 : base <= 30 ? 4 : Math.ceil(base * 0.15)
    const n_reservas = Math.max(demanda.n_reservas, n_minimo)

    // Remover reservas antigas
    const sem_reservas = circuitos_raw.filter(c => c.tipo !== 'RESERVA')

    // Gerar novas reservas numeradas
    const reservas = Array.from({ length: n_reservas }, (_, i) => ({
      id:            crypto.randomUUID(),
      descricao:     `Reserva R${String(i + 1).padStart(2, '0')} — NBR 5410 §6.5.4.7`,
      tipo:          'RESERVA' as any,
      fase:          'R' as any,
      potencia_va:   0,
      comprimento_m: 0,
      n_agrup:       1,
      numero:        n_ativos + i + 1,
    }))

    set({
      circuitos_raw: [...sem_reservas, ...reservas],
      modificado:    true,
    })
  },

  balancearFases: () => {
    const { circuitos_raw, projeto } = get()
    // fOpts: fases disponíveis para circuitos MONOFÁSICOS
    // allFases: todas as fases do sistema (para contabilizar bifásicos RS/ST/RT)
    const fOpts: FaseType[] = projeto.sistema === 'Monofasico' ? ['R']
                            : projeto.sistema === 'Trifasico'  ? ['R','S','T']
                            : ['R','S']
    const allFases: FaseType[] = projeto.sistema === 'Trifasico' ? ['R','S','T'] : ['R','S','T']
    const totals: Record<string, number> = {}
    allFases.forEach(f => { totals[f] = 0 })

    // Acumular polifásicos (não mudar)
    circuitos_raw.filter(c => !fOpts.includes(c.fase as FaseType)).forEach(c => {
      const va = c.potencia_va
      if (c.fase === 'RS') { totals['R'] = (totals['R']||0)+va/2; totals['S'] = (totals['S']||0)+va/2 }
      if (c.fase === 'ST') { totals['S'] = (totals['S']||0)+va/2; totals['T'] = (totals['T']||0)+va/2 }
      if (c.fase === 'RT') { totals['R'] = (totals['R']||0)+va/2; totals['T'] = (totals['T']||0)+va/2 }
      if (c.fase === 'RST') { fOpts.forEach(f => { totals[f] = (totals[f]||0)+va/3 }) }
    })

    const monos = [...circuitos_raw]
      .filter(c => fOpts.includes(c.fase as FaseType))
      .sort((a, b) => b.potencia_va - a.potencia_va)

    const updated = [...circuitos_raw]
    monos.forEach(c => {
      const minFase = fOpts.reduce((a, b) => (totals[a]||0) <= (totals[b]||0) ? a : b)
      const idx = updated.findIndex(r => r.id === c.id)
      updated[idx] = { ...c, fase: minFase }
      totals[minFase] = (totals[minFase]||0) + c.potencia_va
    })

    set({ circuitos_raw: updated, modificado: true })
    get().recalcular()
  },

  setFaseCircuito: (id, fase) => get().updateCircuito(id, { fase }),

  // ── Rede topológica ────────────────────────────────────────
  addNo: (input) => {
    const no: NoTopologico = { ...input, id: crypto.randomUUID() }
    set(s => ({ rede: { ...s.rede, nos: [...s.rede.nos, no] }, modificado: true }))
  },

  removeNo: (id) => {
    set(s => ({
      rede: {
        ...s.rede,
        nos: s.rede.nos.filter(n => n.id !== id),
        segmentos: s.rede.segmentos.filter(seg => seg.origem_no_id !== id && seg.destino_no_id !== id),
      },
      modificado: true,
    }))
    get().recalcularRede()
  },

  addSegmento: (input) => {
    const seg: SegmentoEletroduto = { ...input, id: crypto.randomUUID() }
    const analise = analisarSegmento(seg)
    set(s => ({ rede: { ...s.rede, segmentos: [...s.rede.segmentos, { ...seg, analise }] }, modificado: true }))
  },

  removeSegmento: (id) => {
    set(s => ({ rede: { ...s.rede, segmentos: s.rede.segmentos.filter(seg => seg.id !== id) }, modificado: true }))
  },

  recalcularRede: () => {
    const { rede } = get()
    const segmentosAtualizados = rede.segmentos.map(seg => ({
      ...seg,
      analise: analisarSegmento(seg),
    }))
    set(s => ({ rede: { ...s.rede, segmentos: segmentosAtualizados } }))
  },

  // ── v3: Carga actions ─────────────────────────────────────
  addCarga: (input) => {
    const carga: Carga = { ...input, id: crypto.randomUUID() }
    set(s => ({ cargas: [...s.cargas, carga], modificado: true }))
  },

  updateCarga: (id, partial) => {
    set(s => ({ cargas: s.cargas.map(c => c.id === id ? { ...c, ...partial } : c), modificado: true }))
    get().recalcularCircuitosV3()
  },

  removeCarga: (id) => {
    set(s => ({
      cargas:     s.cargas.filter(c => c.id !== id),
      circuitos:  s.circuitos.map(ci => ({ ...ci, carga_ids: ci.carga_ids.filter(cid => cid !== id) })),
      modificado: true,
    }))
    get().recalcularCircuitosV3()
  },

  // ── v3: CircuitoV3 actions ─────────────────────────────────
  addCircuitoV3: (input) => {
    const n = get().circuitos.length + 1
    const circ: CircuitoV3 = { ...input, id: crypto.randomUUID(), numero: n }
    set(s => ({ circuitos: [...s.circuitos, circ], modificado: true }))
    get().recalcularCircuitosV3()
  },

  updateCircuitoV3: (id, partial) => {
    set(s => ({ circuitos: s.circuitos.map(c => c.id === id ? { ...c, ...partial } : c), modificado: true }))
    get().recalcularCircuitosV3()
  },

  removeCircuitoV3: (id) => {
    set(s => ({ circuitos: s.circuitos.filter(c => c.id !== id), modificado: true }))
  },

  addCargaAoCircuito: (circuito_id, carga_id) => {
    set(s => ({
      circuitos: s.circuitos.map(c => {
        if (c.id !== circuito_id) return c
        if (c.carga_ids.includes(carga_id)) return c
        return { ...c, carga_ids: [...c.carga_ids, carga_id] }
      }),
      modificado: true,
    }))
    get().recalcularCircuitosV3()
  },

  recalcularCircuitosV3: () => {
    const { cargas, circuitos, projeto } = get()
    const atualizados = circuitos.map(ci => {
      const minhasCargas = cargas.filter(cg => ci.carga_ids.includes(cg.id))
      const pot_va    = minhasCargas.reduce((s, cg) => s + cg.potencia_va, 0)
      const pot_real  = minhasCargas.reduce((s, cg) => s + (cg.potencia_real_w ?? 0), 0)
      if (pot_va <= 0) return { ...ci, calculado: undefined }

      // Usar o engine existente para calcular
      const result = dimensionarCircuito({
        id: ci.id, descricao: ci.nome, potencia_va: pot_va,
        potencia_real_w: pot_real > 0 ? pot_real : undefined,
        fase: ci.fase, comprimento_m: ci.comprimento_m, n_agrup: ci.n_agrup,
        tipo: ci.tipo,
        v_fase: projeto.v_fase, metodo: projeto.metodo_instalacao,
        isolacao: projeto.isolacao, material: projeto.material_cabo,
        t_amb: projeto.t_amb, du_max: projeto.du_max_pct,
        du_ramal: projeto.du_ramal_pct, icc_rede_ka: projeto.icc_rede_ka,
      })
      const calc = {
        potencia_va: pot_va, potencia_real_w: pot_real > 0 ? pot_real : undefined,
        ib: result.ib, tensao_v: result.tensao_v, ft: result.ft, fa: result.fa,
        secao_fase: result.secao_fase, secao_neutro: result.secao_neutro, secao_pe: result.secao_pe,
        iz_nominal: result.iz_nominal, iz_efetiva: result.iz_efetiva,
        in_disj: result.in_disj, curva: result.curva, idr: result.idr,
        du_calc: result.du_calc, status: result.status, violacoes: result.violacoes,
        // Campos de verificação prática
        curva_adequada: result.curva_adequada,
        justificativa_curva: result.justificativa_curva,
        comprimento_max_m: result.comprimento_max_m,
        fator_seguranca: result.fator_seguranca,
      }
      return { ...ci, calculado: calc }
    })
    set({ circuitos: atualizados })
  },

  // ── v3: Eletrodutos ────────────────────────────────────────
  addTrecho: (input) => {
    const t: TrechoEletroduto = { ...input, id: crypto.randomUUID() }
    set(s => ({ trechos: [...s.trechos, t], modificado: true }))
    get().calcularCondutores()
  },

  updateTrecho: (id, partial) => {
    set(s => ({ trechos: s.trechos.map(t => t.id === id ? { ...t, ...partial } : t), modificado: true }))
    get().calcularCondutores()
  },

  removeTrecho: (id) => {
    set(s => ({ trechos: s.trechos.filter(t => t.id !== id), modificado: true }))
  },

  calcularCondutores: () => {
    // Calcular condutores em cada trecho — área interna por diâmetro nominal
    const AREA_INTERNA: Record<number, number> = {
      16: 113.1, 20: 201.1, 25: 314.2, 32: 530.9, 40: 855.3, 50: 1320.3,
    }
    const { trechos, circuitos } = get()
    const atualizados = trechos.map(trecho => {
      const circsNoTrecho = circuitos.filter(ci => trecho.circuito_ids.includes(ci.id))
      const fases:   { secao_mm2: number; qty: number }[] = []
      const neutros: { secao_mm2: number; qty: number }[] = []
      const pes:     { secao_mm2: number; qty: number }[] = []

      circsNoTrecho.forEach(ci => {
        const calc = ci.calculado
        if (!calc) return
        const secF = calc.secao_fase || 0
        const secN = calc.secao_neutro || 0
        const secPE = calc.secao_pe || 0
        const nF = ['RS','ST','RT'].includes(ci.fase) ? 2 : ci.fase === 'RST' ? 3 : 1
        if (secF > 0) fases.push({ secao_mm2: secF, qty: nF })
        if (secN > 0) neutros.push({ secao_mm2: secN, qty: 1 })
        if (secPE > 0) pes.push({ secao_mm2: secPE, qty: 1 })
      })

      // Área dos condutores (fórmula IEC: A = π × (d/2)²)
      const areaTotal = (arr: { secao_mm2: number; qty: number }[]) =>
        arr.reduce((s, { secao_mm2, qty }) => s + (Math.PI * (Math.sqrt(secao_mm2 / Math.PI)) ** 2) * qty, 0)

      const area_cond = areaTotal(fases) + areaTotal(neutros) + areaTotal(pes)
      const area_int  = AREA_INTERNA[trecho.diametro_mm] ?? 201.1
      const taxa      = area_int > 0 ? (area_cond / area_int) * 100 : 0

      // NBR 5410 §6.2.11: máximo 35% de ocupação
      const status_ocupacao: 'OK' | 'LIMITE' | 'EXCEDIDO' =
        taxa <= 30 ? 'OK' : taxa <= 35 ? 'LIMITE' : 'EXCEDIDO'

      // Fa resultante pelo número de circuitos
      const n = circsNoTrecho.length
      const fa = n <= 1 ? 1 : n <= 2 ? 0.8 : n <= 3 ? 0.7 : n <= 5 ? 0.65 : 0.6

      return {
        ...trecho,
        condutores: { fases, neutros, pes, area_condutores_mm2: area_cond, area_interna_mm2: area_int, taxa_ocupacao_pct: Math.round(taxa * 10) / 10, status_ocupacao, n_circuitos: n, fa_resultante: fa },
      }
    })
    set({ trechos: atualizados })
  },

  salvarJSON: () => {
    const { projeto, comodos, circuitos_raw } = get()
    const { cargas, circuitos: circuitosV3, trechos } = get()
    return JSON.stringify({
      _meta: { app: 'ProjetEletrico', versao: '3.0', data: new Date().toISOString() },
      projeto, comodos, circuitos: circuitos_raw,
      // v3
      cargas, circuitosV3, trechos,
      rede: get().rede,
    }, null, 2)
  },

  carregarJSON: (json) => {
    const data = JSON.parse(json)
    if (!data.projeto) throw new Error('Arquivo invalido')
    set({
      projeto:        { ...projetoDefault, ...data.projeto },
      comodos:        data.comodos        ?? [],
      circuitos_raw:  data.circuitos      ?? [],
      cargas:         data.cargas         ?? [],
      circuitos:      data.circuitosV3    ?? [],
      trechos:        data.trechos        ?? [],
      rede:           data.rede           ?? { nos: [], segmentos: [], caminhos: [] },
      modificado: false,
    })
    get().recalcular()
  },

  resetar: () => {
    set({
      projeto:        { ...projetoDefault, id: crypto.randomUUID(), criado_em: new Date().toISOString() },
      comodos:        [], circuitos_raw: [], circuitos_calc: [], demanda: null,
      estado:         null,
      cargas:         [], circuitos: [], trechos: [],
      rede:           { nos: [], segmentos: [], caminhos: [] },
      modificado: false, arquivo_path: null, pagina_atual: 'dashboard',
    })
  },

  marcarSalvo: (path) => set({ modificado: false, arquivo_path: path }),
}))
