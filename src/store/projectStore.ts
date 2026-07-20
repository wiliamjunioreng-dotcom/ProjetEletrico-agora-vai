// src/store/projectStore.ts
import { create } from 'zustand'
import { dimensionarCircuito, calcularDemanda, calcIlumComodo, calcTugComodo } from '../core/engine'
import { solve } from '../core/solver'
import { resolverCircuito } from '../core/pipeline'
import type { EstadoCalculado } from '../core/solver'
import { analisarSegmento } from '../core/topologia'
import type { Comodo, DemandaResult, FaseType, Projeto, Carga, CircuitoV3, TrechoEletroduto, RedeEletrica, NoTopologico, SegmentoEletroduto } from '../types/electrical'
import type { CircuitResult } from '../core/engine'
import type { InsumoSINAPI } from '../core/sinapi'

export interface LampadaReal {
  id:       string
  descricao: string   // livre — o engenheiro digita (ex: "LED 9W A60 Philips")
  qtd:      number
  pot_w:    number    // potência real de cada unidade
  pot_dim_w?: number  // potência para dimensionamento (se diferente)
  lm?:      number    // fluxo luminoso real de cada unidade (lúmens) — digitado pelo engenheiro, do datasheet do fabricante
  // Iluminação geral (uso principal do ambiente) vs de efeito
  // (arandela, sanca, fita decorativa — realce, não a luz principal)
  tipo?:    'geral' | 'efeito'
  // Tecnologia — só para o fator de segurança de dimensionamento
  // (harmônicas de driver LED vs carga resistiva de incandescente),
  // NÃO é catálogo de produto — o engenheiro digita tudo o resto.
  tecnologia?: 'LED' | 'Fluorescente' | 'Halogena' | 'Descarga' | 'Incandescente'
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
// ── Integridade do arquivo salvo ──────────────────────────────────
// Checksum simples (FNV-1a, não criptográfico — não precisa ser: o
// objetivo é detectar CORRUPÇÃO ACIDENTAL — truncamento, cópia
// incompleta, edição manual acidental — não adulteração maliciosa.
// Calculado sobre o conteúdo canônico (JSON.stringify sem formatação
// extra) dos dados do projeto, nunca sobre o arquivo formatado
// inteiro — assim, reformatar o arquivo num editor de texto (mudar
// espaçamento) não dispara falso positivo de corrupção.
export function calcularChecksum(texto: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// Validação estrutural — antes disso, carregarJSON só conferia
// "data.projeto existe", o que deixa passar arquivos malformados
// (ex: projeto como string, comodos como objeto em vez de array) que
// quebrariam silenciosamente em algum lugar mais fundo do app depois.
// Agora rejeita com mensagem clara ANTES de aplicar qualquer coisa.
export function validarEstruturaArquivo(data: any): string | null {
  if (typeof data !== 'object' || data === null) return 'Arquivo não é um projeto válido (JSON raiz não é um objeto).'
  if (typeof data.projeto !== 'object' || data.projeto === null) return 'Campo "projeto" ausente ou corrompido.'
  if (data.comodos !== undefined && !Array.isArray(data.comodos)) return 'Campo "comodos" corrompido (deveria ser uma lista).'
  if (data.circuitos !== undefined && !Array.isArray(data.circuitos)) return 'Campo "circuitos" corrompido (deveria ser uma lista).'
  if (data.orcamento_itens !== undefined && !Array.isArray(data.orcamento_itens)) return 'Campo "orcamento_itens" corrompido (deveria ser uma lista).'
  return null  // sem problemas encontrados
}

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
                                      // (ver sistemaSuportaLigacao — combinação
                                      // impossível, deve ser bloqueada antes de
                                      // chegar aqui, este fallback é só defesa)
  }
  // trifasica
  return ['RST']
}

// Verifica se o sistema do projeto (fases FISICAMENTE disponíveis na
// entrada) suporta a ligação que uma carga específica exige. O sistema
// é o "cardápio" de fases disponíveis; cada carga pede um subconjunto
// dele — mas uma carga NUNCA pode pedir mais fases do que existem.
// Monofásico só tem 1 fase → nenhuma carga bi/trifásica é fisicamente
// possível ali. Bifásico tem 2 → aceita mono e bi, não tri. Trifásico
// tem as 3 → aceita qualquer ligação.
export function sistemaSuportaLigacao(sistema: string, ligacao: TipoLigacao): boolean {
  if (ligacao === 'monofasica') return true
  if (ligacao === 'bifasica')   return sistema === 'Bifasico' || sistema === 'Trifasico'
  if (ligacao === 'trifasica')  return sistema === 'Trifasico'
  return true
}

// Varre TODAS as cargas do projeto (manuais e TUEs legados) e retorna
// as que pedem mais fases do que o sistema declarado realmente tem —
// situação fisicamente impossível que hoje cai num fallback silencioso
// em fasesParaTipo() sem avisar ninguém.
export function verificarCompatibilidadeSistema(
  comodos: { nome: string; cargas_manuais: { descricao: string; fase: 'mono'|'bi'|'tri' }[]; tues: { descricao: string; fase_ligacao?: 'mono'|'bi'|'tri' }[] }[],
  sistema: string,
): { comodo: string; carga: string; ligacaoPedida: string }[] {
  const problemas: { comodo: string; carga: string; ligacaoPedida: string }[] = []
  const paraLigacao = (f: 'mono'|'bi'|'tri'): TipoLigacao =>
    f === 'tri' ? 'trifasica' : f === 'bi' ? 'bifasica' : 'monofasica'

  for (const co of comodos) {
    for (const cm of co.cargas_manuais ?? []) {
      const lig = paraLigacao(cm.fase)
      if (!sistemaSuportaLigacao(sistema, lig)) {
        problemas.push({ comodo: co.nome, carga: cm.descricao, ligacaoPedida: cm.fase })
      }
    }
    for (const t of co.tues ?? []) {
      if (!t.fase_ligacao) continue
      const lig = paraLigacao(t.fase_ligacao)
      if (!sistemaSuportaLigacao(sistema, lig)) {
        problemas.push({ comodo: co.nome, carga: (t as any).descricao ?? 'TUE', ligacaoPedida: t.fase_ligacao })
      }
    }
  }
  return problemas
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
// BUG CORRIGIDO: sempre retornava disponiveis[0] (sempre 'R'), nunca
// rotacionava — desconectado da lógica de balanceamento usada na
// geração em massa (gerarCircuitosDeComodos). Todo circuito criado ou
// editado manualmente na tela Circuitos sempre voltava pra fase R,
// fazendo a fase T (e S) nunca aparecerem na prática mesmo estando
// disponíveis no seletor. Agora recebe as fases já em uso nos
// circuitos existentes e escolhe a MENOS usada entre as disponíveis
// para o tipo de ligação — balanceamento ativo, não estático.
export function faseDefault(
  ligacao: TipoLigacao,
  sistema: string,
  fasesExistentes: FaseType[] = []
): FaseType {
  const disponiveis = fasesParaTipo(ligacao, sistema)
  if (fasesExistentes.length === 0) return disponiveis[0]

  const contagem = new Map<FaseType, number>()
  disponiveis.forEach(f => contagem.set(f, 0))
  fasesExistentes.forEach(f => {
    if (contagem.has(f)) contagem.set(f, (contagem.get(f) ?? 0) + 1)
  })

  let melhor = disponiveis[0]
  let menorContagem = contagem.get(melhor) ?? 0
  for (const f of disponiveis) {
    const c = contagem.get(f) ?? 0
    if (c < menorContagem) { melhor = f; menorContagem = c }
  }
  return melhor
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

// Item do orçamento — movido de estado local do componente Precos.tsx
// para o estado global do projeto. Antes disso, o orçamento (com
// qualquer preço editado manualmente pelo engenheiro) se perdia ao
// navegar para outra aba e voltar, e nunca era salvo no arquivo do
// projeto — "salvar e continuar depois" simplesmente não funcionava
// para essa parte.
export interface ItemOrc {
  chave:   string
  descr:   string
  qtd:     number
  unidade: string
  preco_mat_sin?: number
  preco_mat_set?: number
  insumo_mat_sin?: InsumoSINAPI
  insumo_mat_set?: InsumoSINAPI
  match_mat_sin?: string
  match_mat_set?: string
  preco_mo_sin?: number
  preco_mo_set?: number
  insumo_mo_sin?: InsumoSINAPI
  insumo_mo_set?: InsumoSINAPI
  match_mo_sin?: string
  match_mo_set?: string
  preco_mat_manual?: number
  preco_mo_manual?:  number
  ignorar?: boolean
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
  // Orçamento — persiste entre navegação de abas E no arquivo salvo
  orcamento_itens: ItemOrc[]
  orcamento_estado_uf: string
  orcamento_desoneracao: 'nao_desonerado' | 'desonerado'
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
  updateNo:       (id: string, partial: Partial<NoTopologico>) => void
  removeNo:       (id: string) => void
  addSegmento:    (s: Omit<SegmentoEletroduto, 'id' | 'analise'>) => string
  removeSegmento: (id: string) => void
  updateSegmento: (id: string, partial: Partial<Omit<SegmentoEletroduto, 'id'>>) => void
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

  setOrcamentoItens:       (itens: ItemOrc[] | ((prev: ItemOrc[]) => ItemOrc[])) => void
  setOrcamentoEstadoUf:    (uf: string) => void
  setOrcamentoDesoneracao: (d: 'nao_desonerado' | 'desonerado') => void

  salvarJSON:   () => string
  carregarJSON: (json: string, ignorarAvisoIntegridade?: boolean) => void
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
  empresa:           'Lumen Soluções',
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

function calcCircuito(raw: RawCircuit, proj: ProjectState['projeto'], comodos?: ProjectState['comodos']): CircuitResult {
  const comodo_tipo = comodos?.find(c => c.id === raw.comodo_id)?.tipo
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
    comodo_tipo,
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
  orcamento_itens: [],
  orcamento_estado_uf: 'MG',
  orcamento_desoneracao: 'nao_desonerado',
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
    const tug_nbr  = calcTugComodo(input.perimetro_m, input.tipo, input.area_m2)
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
    // BUG CRITICO CORRIGIDO: esta função recalculava ilum_va/tug_va do
    // minimo NBR INCONDICIONALMENTE, mesmo quando o chamador passava um
    // valor explicito em partial - descartando silenciosamente qualquer
    // override manual (luminarias declaradas, ferramenta "Metodo dos
    // Lumens", etc). Achado ao escrever teste de integracao para a
    // consolidacao de luminarias: o valor persistido nunca batia com o
    // que a UI acabava de calcular e enviar.
    // FIX: só recalcula do automatico quando o chamador NAO forneceu um
    // valor explicito em partial E o comodo nao tem luminarias
    // declaradas (que já governam ilum_va por conta própria) - preserva
    // o comportamento original (recalcular ao editar área/perímetro)
    // para o caso comum, sem apagar decisões deliberadas.
    set(s => ({
      comodos: s.comodos.map(c => {
        if (c.id !== id) return c
        const u = { ...c, ...partial }
        const ilumExplicito = (partial as any).ilum_va !== undefined
        const tugExplicito  = (partial as any).tug_va !== undefined
        const temLuminarias = (u.luminarias ?? []).length > 0
        if (!ilumExplicito && !temLuminarias) {
          u.ilum_va = calcIlumComodo(u.area_m2)
        }
        if (!tugExplicito) {
          u.tug_va = calcTugComodo(u.perimetro_m, u.tipo, u.area_m2)
        }
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
    // BUG CORRIGIDO: existia um único contador `fi` compartilhado entre
    // TODOS os blocos de geração (cargas manuais ILUM/TUG/TUE + ILUM
    // automático + TUE automático), cada um usando arrays de fases de
    // tamanho DIFERENTE (1 para trifásico, 2 para bifásico, 3 para
    // monofásico em sistema trifásico). Misturar chamadas de tamanhos
    // diferentes no mesmo contador desalinha a rotação — um circuito
    // trifásico "consome" 1 passo do contador sem de fato precisar
    // balancear R/S/T, deslocando a rotação dos circuitos seguintes.
    // Como T é a 3ª fase da sequência, ela é a mais provável de ser
    // pulada por esse desalinhamento. Também havia um array hardcoded
    // ['R','S','R'] para sistema Bifásico — R com o dobro do peso de S.
    // FIX: cada bloco de geração agora tem seu PRÓPRIO contador local,
    // e todos usam fasesParaTipo() como única fonte de verdade — nunca
    // mais um array de fases duplicado e potencialmente errado.

    // ── Cargas manuais + automático, UNIFICADOS por ILUM/TUG ─────────
    // BUG CRÍTICO CORRIGIDO: o agrupamento por rótulo declarado
    // (grupo_circuito_ilum/tug) só olhava para comodos_auto (cômodos
    // SEM NENHUMA carga manual de NENHUM tipo) — um cômodo com só um
    // TUE manual já ficava inteiramente fora do agrupamento por
    // rótulo, mesmo que sua ILUM/TUG estivesse corretamente marcada
    // com o mesmo rótulo de outro cômodo. Achado no teste da casa
    // completa: "Sala de Estar" e "Sala de Jantar" com o MESMO
    // grupo_circuito_ilum="Área Social" geraram 2 circuitos ILUM
    // separados, não 1 — porque as duas salas tinham TUE/TUG manuais
    // e caíam em comodos_com_cargas, nunca em comodos_auto.
    //
    // FIX: uma única coleta por tipo (ILUM ou TUG), pegando de CADA
    // cômodo a carga manual daquele tipo SE existir, senão o valor
    // automático (ilum_va/tug_va) — independente do cômodo ter outras
    // cargas manuais de outros tipos. Só depois disso agrupa por
    // rótulo declarado, particiona por ligação (nunca mistura mono/
    // bi/tri) e respeita o teto de 800VA — tudo num só caminho, para
    // as duas fontes de dado convergirem de verdade.
    const comodos_com_cargas = comodos.filter(c => c.cargas_manuais?.length)

    interface ItemAgrupavel {
      descricao: string; potencia_va: number; fase: 'mono' | 'bi' | 'tri'
      comodo_id: string; comodo_nome: string; comodo_tipo: string
      abaixo_nbr: boolean; nbr_min_va: number
      lampadas?: any[]; potencia_real_w?: number
    }

    function coletarItens(tipo: 'ILUM' | 'TUG'): { rotulo?: string; itens: ItemAgrupavel[] }[] {
      const porRotulo = new Map<string, ItemAgrupavel[]>()
      const semRotulo: ItemAgrupavel[] = []

      for (const co of comodos) {
        const rotulo = (tipo === 'ILUM' ? (co as any).grupo_circuito_ilum : (co as any).grupo_circuito_tug)?.trim()
        const manuais = (co.cargas_manuais ?? []).filter(cm => cm.tipo === tipo)
        let itensDoComodo: ItemAgrupavel[] = []

        if (manuais.length > 0) {
          itensDoComodo = manuais.map(cm => ({
            descricao: cm.descricao, potencia_va: cm.potencia_va * cm.qtd, fase: cm.fase,
            comodo_id: co.id, comodo_nome: co.nome, comodo_tipo: co.tipo,
            abaixo_nbr: cm.abaixo_nbr, nbr_min_va: cm.nbr_min_va,
          }))
        } else {
          const va = tipo === 'ILUM' ? co.ilum_va : co.tug_va
          if (va > 0) {
            const lumino = (co as any).lumino
            const realW = tipo === 'ILUM' && lumino ? Math.round((lumino.n_luminarias || 1) * lumino.luminaria_pot_w) : undefined
            itensDoComodo = [{
              descricao: `${tipo} ${co.nome}`, potencia_va: va, fase: 'mono',
              comodo_id: co.id, comodo_nome: co.nome, comodo_tipo: co.tipo,
              abaixo_nbr: false, nbr_min_va: va,
              lampadas: (co as any).lampadas, potencia_real_w: realW,
            }]
          }
        }

        if (itensDoComodo.length === 0) continue
        if (rotulo) {
          if (!porRotulo.has(rotulo)) porRotulo.set(rotulo, [])
          porRotulo.get(rotulo)!.push(...itensDoComodo)
        } else {
          semRotulo.push(...itensDoComodo)
        }
      }

      const resultado: { rotulo?: string; itens: ItemAgrupavel[] }[] = []
      for (const [rotulo, itens] of porRotulo) resultado.push({ rotulo, itens })
      // Sem rótulo: cada CÔMODO permanece isolado dos demais — ausência
      // de rótulo significa "engenheiro não declarou esses como
      // próximos", não "agrupe automaticamente com qualquer outro".
      const porComodoSemRotulo = new Map<string, ItemAgrupavel[]>()
      for (const item of semRotulo) {
        if (!porComodoSemRotulo.has(item.comodo_id)) porComodoSemRotulo.set(item.comodo_id, [])
        porComodoSemRotulo.get(item.comodo_id)!.push(item)
      }
      for (const [, itens] of porComodoSemRotulo) resultado.push({ itens })
      return resultado
    }

    // Contadores de rotação — um conjunto por TIPO (ILUM, TUG), cada
    // um com 3 sub-contadores por ligação (nunca compartilhados entre
    // tipos nem entre ligações — mesmo padrão anti-desalinhamento já
    // corrigido nos outros blocos desta sessão).
    const fiILUM = { monofasica: 0, bifasica: 0, trifasica: 0 }
    const fiTUG  = { monofasica: 0, bifasica: 0, trifasica: 0 }

    function gerarCircuitosAgrupados(tipo: 'ILUM' | 'TUG') {
      const grupos = coletarItens(tipo)
      const fiRef = tipo === 'ILUM' ? fiILUM : fiTUG

      for (const { rotulo, itens } of grupos) {
        const porLigacao: Record<'mono'|'bi'|'tri', ItemAgrupavel[]> = { mono: [], bi: [], tri: [] }
        itens.forEach(it => porLigacao[it.fase].push(it))

        for (const faseKey of ['mono', 'bi', 'tri'] as const) {
          const sub = porLigacao[faseKey]
          if (sub.length === 0) continue
          const ligacao: TipoLigacao = faseKey === 'tri' ? 'trifasica' : faseKey === 'bi' ? 'bifasica' : 'monofasica'
          const fasesDisp = fasesParaTipo(ligacao, projeto.sistema)

          let grupo: ItemAgrupavel[] = []
          let grupoVA = 0
          const flush = () => {
            if (grupo.length === 0) return
            const nomesUnicos = [...new Set(grupo.map(g => g.comodo_nome))]
            const lampGrupo = grupo.flatMap(g => g.lampadas ?? [])
            const realW = grupo.reduce((s, g) => s + (g.potencia_real_w ?? 0), 0)
            circs.push({
              id: crypto.randomUUID(),
              descricao: `${tipo}: ${grupo.map(g => g.descricao).join(', ')}${rotulo ? ` [${rotulo}]` : ''} (${nomesUnicos.join(', ')})`,
              potencia_va: grupoVA,
              potencia_real_w: realW > 0 ? realW : undefined,
              lampadas: lampGrupo.length > 0 ? lampGrupo : undefined,
              fase: fasesDisp[fiRef[ligacao]++ % fasesDisp.length],
              ligacao,
              tipo,
              comodo_id: grupo[0].comodo_id,
              comprimento_m: comprimentoEstimado(grupo[0].comodo_tipo, tipo),
              n_agrup: 1,
              abaixo_minimo_nbr: grupo.some(g => g.abaixo_nbr),
              minimo_nbr_va: grupo.reduce((s, g) => s + g.nbr_min_va, 0),
            } as any)
            grupo = []; grupoVA = 0
          }
          sub.forEach(item => {
            if (grupoVA + item.potencia_va > 800) flush()
            grupo.push(item); grupoVA += item.potencia_va
          })
          flush()
        }
      }
    }

    gerarCircuitosAgrupados('ILUM')
    gerarCircuitosAgrupados('TUG')

    // TUE e GERAL — cada entrada É seu próprio circuito, sempre (nunca
    // agrupado, nem por rótulo — chuveiro/motor/ar-condicionado não
    // devem compartilhar circuito com nada)
    const fiOutrasPorLigacao = { monofasica: 0, bifasica: 0, trifasica: 0 }
    for (const co of comodos_com_cargas) {
      const outrasEntries = co.cargas_manuais.filter(cm => cm.tipo !== 'ILUM' && cm.tipo !== 'TUG')
      for (const cm of outrasEntries) {
        const pot = cm.potencia_va * cm.qtd
        const ligacao = cm.fase === 'tri' ? 'trifasica' : cm.fase === 'bi' ? 'bifasica' : 'monofasica'
        const fasesDisp = fasesParaTipo(ligacao as TipoLigacao, projeto.sistema)
        const sufixoTipo = cm.tipo === 'TUE' && cm.tipo_carga && cm.tipo_carga !== 'geral'
          ? ` (${cm.tipo_carga})` : ''
        circs.push({
          id: crypto.randomUUID(),
          descricao: (cm.descricao || `${cm.tipo}: ${co.nome}`) + sufixoTipo,
          potencia_va: pot,
          fase: fasesDisp[fiOutrasPorLigacao[ligacao as TipoLigacao]++ % fasesDisp.length],
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

    // TUE (array legado tues[]) — contador próprio, isolado dos demais.
    // Itera TODOS os cômodos (não só comodos_auto) — tues[] é um campo
    // legado independente de cargas_manuais; um cômodo com cargas
    // manuais de outro tipo ainda pode ter tues[] de dados antigos
    // importados, mesma correção de escopo aplicada ao ILUM/TUG acima.
    let fiTueAuto = 0
    comodos.forEach(c => {
      ;(c.tues ?? []).forEach(t => {
        // Ligação: respeita a seleção EXPLÍCITA do engenheiro (t.fase_ligacao)
        // quando informada — só cai para inferência automática por potência
        // quando o engenheiro não declarou. Autoridade do projetista > heurística.
        const ligacao = t.fase_ligacao === 'tri' ? 'trifasica'
                       : t.fase_ligacao === 'bi'  ? 'bifasica'
                       : t.fase_ligacao === 'mono' ? 'monofasica'
                       : inferirLigacao('TUE', t.potencia_va)
        const fasesDisp = fasesParaTipo(ligacao, projeto.sistema)
        const fase: FaseType = fasesDisp[fiTueAuto++ % fasesDisp.length]
        // Comprimento estimado pelo tipo de ambiente (refinável pelo engenheiro)
        const comp = c.tipo === 'Externo' || c.tipo === 'Garagem' ? 20 : 12
        // Anexar tipo_carga à descrição como palavra-chave para inferirCurva()
        // reconhecer corretamente (motor→D, resistivo→B, etc.) — sem isso a
        // seleção do engenheiro no formulário era descartada silenciosamente.
        const sufixo_tipo = t.tipo_carga && t.tipo_carga !== 'geral' ? ` (${t.tipo_carga})` : ''
        circs.push({
          id: crypto.randomUUID(), descricao: `TUE: ${t.descricao}${sufixo_tipo} (${c.nome})`,
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
    const { circuitos_raw, projeto, rede, comodos } = get()
    // Calcular legado (compatibilidade com páginas existentes)
    const calc = circuitos_raw.map(r => calcCircuito(r, projeto, comodos))
    const dem  = calcularDemanda(calc, projeto.v_fase, projeto.fp_global, projeto.sistema)
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
          v_linha_ref: projeto.v_linha, secao_minima_preset_mm2: (projeto as any).secao_minima_preset_mm2,
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

  updateNo: (id, partial) => {
    set(s => ({
      rede: { ...s.rede, nos: s.rede.nos.map(n => n.id === id ? { ...n, ...partial } : n) },
      modificado: true,
    }))
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
    return seg.id
  },

  removeSegmento: (id) => {
    set(s => ({ rede: { ...s.rede, segmentos: s.rede.segmentos.filter(seg => seg.id !== id) }, modificado: true }))
  },

  updateSegmento: (id, partial) => {
    set(s => ({
      rede: {
        ...s.rede,
        segmentos: s.rede.segmentos.map(seg => {
          if (seg.id !== id) return seg
          const atualizado = { ...seg, ...partial }
          return { ...atualizado, analise: analisarSegmento(atualizado) }
        }),
      },
      modificado: true,
    }))
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
        secao_minima_preset_mm2: (projeto as any).secao_minima_preset_mm2,
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

  setOrcamentoItens: (itens) => {
    set(s => ({
      orcamento_itens: typeof itens === 'function' ? itens(s.orcamento_itens) : itens,
      modificado: true,
    }))
  },
  setOrcamentoEstadoUf: (uf) => set({ orcamento_estado_uf: uf, modificado: true }),
  setOrcamentoDesoneracao: (d) => set({ orcamento_desoneracao: d, modificado: true }),

  salvarJSON: () => {
    const { projeto, comodos, circuitos_raw } = get()
    const { cargas, circuitos: circuitosV3, trechos } = get()
    const { orcamento_itens, orcamento_estado_uf, orcamento_desoneracao } = get()
    // Dados "puros" — exatamente o que será verificado por checksum no
    // carregamento. Serializado SEM formatação (JSON.stringify simples,
    // sem indentação) para dar um resultado determinístico — o arquivo
    // final continua bonito/indentado, só o cálculo do checksum usa a
    // forma compacta por baixo dos panos.
    const dados = {
      projeto, comodos, circuitos: circuitos_raw,
      cargas, circuitosV3, trechos,
      rede: get().rede,
      orcamento_itens, orcamento_estado_uf, orcamento_desoneracao,
    }
    const checksum = calcularChecksum(JSON.stringify(dados))
    return JSON.stringify({
      _meta: { app: 'ProjetEletrico', versao: '3.1', data: new Date().toISOString(), checksum },
      ...dados,
    }, null, 2)
  },

  carregarJSON: (json, ignorarAvisoIntegridade = false) => {
    let data: any
    try {
      data = JSON.parse(json)
    } catch {
      throw new Error('Arquivo corrompido — não é um JSON válido. O arquivo pode ter sido truncado ou danificado na cópia.')
    }

    const erroEstrutura = validarEstruturaArquivo(data)
    if (erroEstrutura) throw new Error(`Arquivo inválido: ${erroEstrutura}`)

    // Checksum — só verifica se o arquivo TEM um (arquivos salvos antes
    // desta proteção não têm, e isso é esperado, não é motivo de aviso).
    // Recalcula sobre EXATAMENTE os mesmos campos, na mesma forma, que
    // salvarJSON() usou — reformatar o arquivo num editor não quebra
    // isso, só edição/corrupção real do CONTEÚDO quebra.
    if (data._meta?.checksum && !ignorarAvisoIntegridade) {
      const dadosParaChecagem = {
        projeto: data.projeto, comodos: data.comodos, circuitos: data.circuitos,
        cargas: data.cargas, circuitosV3: data.circuitosV3, trechos: data.trechos,
        rede: data.rede, orcamento_itens: data.orcamento_itens,
        orcamento_estado_uf: data.orcamento_estado_uf, orcamento_desoneracao: data.orcamento_desoneracao,
      }
      const checksumCalculado = calcularChecksum(JSON.stringify(dadosParaChecagem))
      if (checksumCalculado !== data._meta.checksum) {
        throw new Error('AVISO_INTEGRIDADE: Este arquivo pode estar corrompido ou foi alterado fora do programa — a verificação de integridade não bateu. Os dados abaixo podem estar incompletos ou incorretos.')
      }
    }

    set({
      projeto:        { ...projetoDefault, ...data.projeto },
      comodos:        data.comodos        ?? [],
      circuitos_raw:  data.circuitos      ?? [],
      cargas:         data.cargas         ?? [],
      circuitos:      data.circuitosV3    ?? [],
      trechos:        data.trechos        ?? [],
      rede:           data.rede           ?? { nos: [], segmentos: [], caminhos: [] },
      // Arquivos salvos antes da v3.1 não têm essas chaves — cai pro
      // padrão em vez de quebrar, arquivo antigo continua abrindo normal
      orcamento_itens:        data.orcamento_itens        ?? [],
      orcamento_estado_uf:    data.orcamento_estado_uf    ?? 'MG',
      orcamento_desoneracao:  data.orcamento_desoneracao  ?? 'nao_desonerado',
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
      orcamento_itens: [], orcamento_estado_uf: 'MG', orcamento_desoneracao: 'nao_desonerado',
      modificado: false, arquivo_path: null, pagina_atual: 'dashboard',
    })
  },

  marcarSalvo: (path) => set({ modificado: false, arquivo_path: path }),
}))
