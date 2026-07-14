// src/types/electrical.ts
// Grafo Elétrico — tipagem forte, arquitetura DAG

export type NodeType = 'source' | 'bus' | 'protection' | 'load'
export type CircuitType = 'ILUM' | 'TUG' | 'TUE' | 'GERAL'
export type FaseType = 'R' | 'S' | 'T' | 'RS' | 'ST' | 'RT' | 'RST'
export type MetodoInstalacao = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D1' | 'D2' | 'E' | 'F'
export type MaterialCabo = 'Cu' | 'Al'
export type IsolacaoCabo = 'PVC' | 'XLPE' | 'EPR'
export type CurvaDisjuntor = 'B' | 'C' | 'D'
export type EsquemaAterramento = 'TN-S' | 'TN-C' | 'TN-C-S' | 'TT' | 'IT'

// ── Nós do grafo ────────────────────────────────────────────────
export interface SourceNode {
  id: string
  tipo: 'source'
  tensao_fase: number        // V
  tensao_linha: number       // V
  impedancia_r: number       // Ω
  impedancia_x: number       // Ω
  icc_disponivel_ka: number  // kA
  concessionaria: string
}

export interface BusNode {
  id: string
  tipo: 'bus'
  nome: string
  fases: FaseType[]
  neutro: boolean
  pe: boolean
}

export interface ProtectionNode {
  id: string
  tipo: 'protection'
  in_a: number              // corrente nominal (A)
  curva: CurvaDisjuntor
  icu_ka: number            // poder de interrupção
  idr?: boolean             // tem DR acoplado?
  idr_ma?: 10 | 30 | 100 | 300  // sensibilidade
  fabricante?: string
}

export interface LoadNode {
  id: string
  tipo: 'load'
  descricao: string
  circuit_type: CircuitType
  potencia_va: number
  fp: number                // fator de potência
  fase: FaseType
  comodo?: string           // referência ao cômodo
}

export type ElectricalNode = SourceNode | BusNode | ProtectionNode | LoadNode

// ── Arestas do grafo (condutores físicos) ────────────────────────
export interface ConductingEdge {
  id: string
  from: string              // id do nó origem
  to: string                // id do nó destino
  comprimento_m: number
  cabo: {
    secao_mm2: number
    material: MaterialCabo
    isolacao: IsolacaoCabo
    n_condutores_carregados: 2 | 3
    secao_pe_mm2: number
  }
  instalacao: MetodoInstalacao
  n_agrup: number           // circuitos no mesmo eletroduto
  t_amb: number             // temperatura ambiente °C
}

// ── Resultado de cálculo por edge ───────────────────────────────
export interface EdgeCalcResult {
  edge_id: string
  ib: number                // corrente de projeto (A)
  ft: number                // fator temperatura
  fa: number                // fator agrupamento
  iz_nominal: number        // Iz do catálogo
  iz_efetiva: number        // Iz' = Iz × Ft × Fa
  in_disj: number           // In do disjuntor selecionado
  du_pct: number            // queda de tensão (%)
  du_acumulado_pct: number  // queda acumulada desde a fonte
  icc_max_ka: number        // Icc máximo no ponto
  icc_min_ka: number        // Icc mínimo no ponto mais distante
  status: 'OK' | 'AVISO' | 'ERRO'
  violacoes: NormViolation[]
  log: string
}

// ── Violação normativa ───────────────────────────────────────────
export interface NormViolation {
  codigo: string            // ex: 'NBR5410_5131'
  descricao: string
  norma: string             // ex: 'NBR 5410:2004 item 5.1.3.1'
  severidade: 'info' | 'aviso' | 'erro_bloqueante'
  valor_calculado?: number
  valor_limite?: number
}

// ── Projeto completo ─────────────────────────────────────────────
export interface Projeto {
  id: string
  nome: string
  empresa: string
  endereco: string
  projetista: string
  crea: string
  ano: string
  concessionaria: string

  // Tensão — VF é a variável primária, VL = VF × √3
  sistema:  'Monofasico' | 'Bifasico' | 'Trifasico'
  v_fase:   number   // V — ex: 127
  v_linha:  number   // V — ex: 220 (calculado)

  // Parâmetros globais
  metodo_instalacao: MetodoInstalacao
  isolacao: IsolacaoCabo
  material_cabo: MaterialCabo
  t_amb: number
  du_max_pct: number
  du_ramal_pct: number
  aterramento: EsquemaAterramento
  fp_global: number
  icc_rede_ka: number

  // Grafo
  nodes: ElectricalNode[]
  edges: ConductingEdge[]

  // Cômodos (entrada de dados)
  comodos: Comodo[]

  // Metadados
  versao: string
  criado_em: string
  modificado_em: string
}

// ── Cômodo ───────────────────────────────────────────────────────
export interface Comodo {
  id: string
  nome: string
  tipo: 'Social' | 'Cozinha' | 'Banho' | 'Lavanderia' | 'Garagem' | 'Externo'
  area_m2: number
  perimetro_m: number
  pe_direito_m: number      // pé direito (para luminotécnico)

  // Calculados automaticamente (NBR mínimo) — usados quando nenhuma carga manual existe
  ilum_va: number
  tug_va: number

  // Cargas manuais declaradas pelo engenheiro
  // Quando presente, substituem ilum_va/tug_va no solver
  // O cômodo é soberano sobre suas cargas
  cargas_manuais: CargaManual[]

  // TUEs do cômodo
  tues: TUE[]

  // Luminotécnico (opcional)
  lumino?: LuminoData
}

// Carga manual: criada pelo engenheiro, persiste no cômodo
export interface CargaManual {
  readonly id:          string
  readonly tipo:        'ILUM' | 'TUG' | 'TUE' | 'GERAL'
  readonly descricao:   string
  readonly potencia_va: number
  readonly qtd:         number           // multiplicador
  readonly fase:        'mono' | 'bi' | 'tri'
  // Abaixo do mínimo NBR (alerta mas não bloqueia)
  readonly abaixo_nbr:  boolean
  readonly nbr_min_va:  number

  // Zona de instalação em locais contendo banheira/chuveiro — NBR 5410
  // §9.1, Volumes 0 a 3. DECLARADA pelo engenheiro (não detectada por
  // geometria — o sistema não modela a posição 3D da banheira/box).
  // Só relevante quando o cômodo é do tipo 'Banho'; ignorada nos demais.
  readonly volume_banheiro?: 'V0' | 'V1' | 'V2' | 'V3' | 'fora'

  // ── Conexões físicas (preenchidas ao completar o projeto) ────────
  // Ponto elétrico que materializa esta carga na planta
  readonly ponto_id?:   string   // ID de PontoEletrico
  // Circuito que alimenta esta carga
  readonly circuito_id?: string  // ID de RawCircuit
  // Grupo de instalação (quando compartilha caixa)
  readonly grupo_id?:   string   // ID de GrupoInstalacao
}

export interface TUE {
  id: string
  descricao: string
  potencia_va: number
  fase_sugerida: FaseType
  // Ligação elétrica declarada pelo engenheiro (1F/2F/3F)
  fase_ligacao?: 'mono' | 'bi' | 'tri'
  // Tipo de carga — usado para inferência de curva do disjuntor
  tipo_carga?: 'resistivo' | 'motor' | 'ar_cond' | 'geral'
}

export interface LuminoData {
  iluminancia_lux: number
  luminaria_pot_w: number
  luminaria_lm: number
  refl_teto: number
  refl_parede: number
  refl_piso: number
  // Resultados
  n_luminarias?: number
  pot_total_w?: number
  arranjo?: string
}

// ── Demanda ──────────────────────────────────────────────────────
export interface DemandaResult {
  ci_kw: number
  fd: number
  dem_kw: number
  i_dem: number
  in_geral: number
  tipo_ligacao_cemig: string
  ramal_min_mm2: number
  n_ativos: number
  n_reservas: number
  n_total_qd: number
}


// ────────────────────────────────────────────────────────────────
// ARQUITETURA v3: Carga → Circuito → Eletroduto
// Carga ≠ Circuito. Um circuito agrega N cargas de N cômodos.
// ────────────────────────────────────────────────────────────────

// ── Carga elétrica (ponto de consumo) ───────────────────────────
export interface Carga {
  id:             string
  descricao:      string          // "Tomadas Quarto 1 + Corredor"
  tipo:           CircuitType     // ILUM | TUG | TUE
  comodo_ids:     string[]        // pode abranger N cômodos
  potencia_va:    number          // VA de dimensionamento
  potencia_real_w?: number        // W real (LED real, etc.)
  n_pontos?:      number          // número de pontos/tomadas
  abaixo_nbr?:    boolean         // flag: abaixo do mínimo normativo
  nbr_minimo_va?: number          // referência da norma
  lampadas?:      LampadaRealItem[]
}

export interface LampadaRealItem {
  id:       string
  descricao: string
  qtd:      number
  pot_w:    number
  pot_dim_w?: number
}

// ── Circuito elétrico (entidade de projeto) ──────────────────────
// Um circuito pode agregar N cargas. O motor calcula com a soma.
export interface CircuitoV3 {
  id:             string
  numero:         number          // número no QD (01, 02...)
  nome:           string          // "C01 — TUG Social/Quartos"
  tipo:           CircuitType
  fase:           FaseType
  // Cargas agrupadas neste circuito
  carga_ids:      string[]        // referências a Carga.id
  // Parâmetros físicos do condutor
  comprimento_m:  number          // comprimento do trecho mais longo
  n_agrup:        number          // circuitos no mesmo eletroduto
  // Resultado calculado (preenchido pelo engine)
  calculado?: CircuitoV3Calc
}

export interface CircuitoV3Calc {
  potencia_va:    number          // soma das cargas (dim.)
  potencia_real_w?: number        // soma das cargas (real)
  ib:             number          // corrente de projeto (A)
  tensao_v:       number
  ft:             number
  fa:             number
  secao_fase:     number          // mm²
  secao_neutro:   number
  secao_pe:       number
  iz_nominal:     number
  iz_efetiva:     number
  in_disj:        number
  curva:          string
  idr:            boolean
  du_calc:        number          // ΔV%
  status:         'OK' | 'LIMITE' | 'ERRO' | 'SEM_DADOS'
  violacoes:      NormViolation[]
}

// ── Trecho de eletroduto (NBR 5444) ──────────────────────────────
export interface TrechoEletroduto {
  id:             string
  nome:           string          // "T01 — QD → Quarto 1"
  origem:         string          // "QD" | id de outro trecho
  destino:        string          // descrição do ponto de chegada
  comprimento_m:  number
  diametro_mm:    16 | 20 | 25 | 32 | 40 | 50  // diâmetro nominal
  material:       'PVC_rigido' | 'PVC_flex' | 'Aço_EMT' | 'Aço_IMC'
  // Circuitos que passam por este trecho
  circuito_ids:   string[]
  // Calculado automaticamente
  condutores?:    ConductorSummary
}

export interface ConductorSummary {
  // Condutores presentes e suas bitolas
  fases:   { secao_mm2: number; qty: number }[]
  neutros: { secao_mm2: number; qty: number }[]
  pes:     { secao_mm2: number; qty: number }[]
  retornos?: { secao_mm2: number; qty: number }[]
  // Taxa de ocupação (NBR 5410 §6.2.11)
  area_condutores_mm2: number
  area_interna_mm2:    number
  taxa_ocupacao_pct:   number
  status_ocupacao:     'OK' | 'LIMITE' | 'EXCEDIDO'
  // Agrupamento
  n_circuitos:         number
  fa_resultante:       number
}

// ════════════════════════════════════════════════════════════════
// TOPOLOGIA ELÉTRICA — Grafo de distribuição
// Baseado em: IEC 60364 / NBR 5410 / EPLAN / AltoQi
//
// Conceito fundamental:
//   Nó = ponto elétrico (QD, caixa, emenda, ponto de carga)
//   Segmento = eletroduto físico entre dois nós
//   Condutor = fio específico dentro de um segmento
//   Corrente propaga pelo caminho: Nó → Segmento → Nó → ...
// ════════════════════════════════════════════════════════════════

// ── 1. Fases tipadas (não labels) ────────────────────────────────
// Fase como entidade, não string
export const FASE = { A: 'A', B: 'B', C: 'C' } as const
export type Fase = typeof FASE[keyof typeof FASE]

// Configuração de fases por circuito
export interface ConfiguracaoFases {
  fases_ativas:  Fase[]          // ex: ['A'] monof | ['A','B'] bifásico
  tem_neutro:    boolean          // N presente no trecho
  tem_pe:        boolean          // PE obrigatório (NBR 5410 §5.1.3.2)
  neutro_compartilhado?: boolean  // N compartilhado com outro circuito
}

// Mapeamento do sistema legado (R/S/T) → novo (A/B/C)
export function mapFaseLegado(fase: string): Fase[] {
  const mapa: Record<string, Fase[]> = {
    'R': ['A'], 'S': ['B'], 'T': ['C'],
    'RS': ['A','B'], 'ST': ['B','C'], 'RT': ['A','C'],
    'RST': ['A','B','C'],
  }
  return mapa[fase] ?? ['A']
}

// ── 2. Tipo de nó elétrico ────────────────────────────────────────
export type TipoNo =
  | 'QD'              // Quadro de distribuição (origem)
  | 'CAIXA_PASSAGEM'  // Caixa de passagem (distribuição)
  | 'CAIXA_DERIVACAO' // Caixa de derivação (split)
  | 'CAIXA_TOMADA'    // Ponto de tomada
  | 'CAIXA_INTERRUPTOR'// Ponto de interruptor
  | 'PONTO_LUZ'       // Ponto de luz (luminária)
  | 'PONTO_EMENDA'    // Emenda no cabo (caixa de passagem)
  | 'ENTRADA_SERVICO' // Ponto de entrada da concessionária

export interface NoTopologico {
  id:       string
  tipo:     TipoNo
  nome:     string            // "Caixa corredor", "Tomada quarto 1"
  comodo?:  string            // referência ao cômodo
  // Posição relativa (para futura planta baixa)
  pos_x?:   number            // metros — coordenada X
  pos_y?:   number            // metros — coordenada Y
  // Nó QD tem QD_id
  qd_id?:   string
}

// ── 3. Tipo de interrupção (para modelagem de retorno) ────────────
export type TipoInterruptor =
  | 'SIMPLES'         // 1 fase, 1 retorno — liga/desliga
  | 'PARALELO'        // 2 interruptores, retorno e contra-retorno
  | 'INTERMEDIARIO'   // 3 posições — escadas, corredores longos
  | 'TOMADA_2P'       // Tomada 2 polos (sem retorno)
  | 'TOMADA_3P'       // Tomada 3 polos

// ── 4. Condutor individual em um segmento ────────────────────────
export type TipoCondutor =
  | 'FASE_A' | 'FASE_B' | 'FASE_C'  // Fase ativa específica
  | 'NEUTRO'                          // Condutor neutro
  | 'PE'                              // Proteção (terra)
  | 'RETORNO'                         // Após interruptor simples
  | 'CONTRA_RETORNO'                  // Paralelo — 2ª via
  | 'TRAVAMENTO'                      // Intermediário — 3ª via

export interface ConductorEmSegmento {
  tipo:          TipoCondutor
  secao_mm2:     number
  circuito_id:   string           // a qual CircuitoV3 pertence
  corrente_a:    number           // corrente real neste segmento (A)
  // Se for retorno: referência ao interruptor
  interruptor_id?: string
}

// ── 5. Segmento de eletroduto (entre dois nós) ───────────────────
// SUBSTITUI TrechoEletroduto — agora é topológico
export interface SegmentoEletroduto {
  id:              string
  nome:            string
  origem_no_id:    string           // NoTopologico.id
  destino_no_id:   string           // NoTopologico.id
  comprimento_m:   number
  diametro_mm:     16|20|25|32|40|50|63|75
  material:        'PVC_rigido'|'PVC_flex'|'Aco_EMT'|'Aco_IMC'
  // Curvas de 90° declaradas pelo engenheiro neste trecho — NBR 5410
  // §6.2.11.3 limita a 3 curvas de 90° (270° total) entre duas caixas
  // consecutivas; acima disso é obrigatória uma caixa de passagem
  // intermediária. O sistema NÃO detecta isso automaticamente a partir
  // de geometria (o traçado não é rastreado curva a curva) — o
  // engenheiro declara quantas curvas de 90° existem fisicamente no
  // trecho, e o sistema valida contra o limite.
  n_curvas_90?:    number
  // Condutores presentes neste segmento específico
  condutores:      ConductorEmSegmento[]
  // Calculado
  analise?:        AnaliseSegmento
}

export interface AnaliseSegmento {
  // Ocupação
  area_condutores_mm2:  number
  area_interna_mm2:     number
  taxa_ocupacao_pct:    number
  status_ocupacao:      'OK'|'LIMITE'|'EXCEDIDO'
  // Agrupamento
  n_circuitos_distintos: number
  fa_resultante:         number
  // Correção térmica resultante
  ft_min:                number   // menor Ft dos condutores
  // Curvas — NBR 5410 §6.2.11.3 (máx. 3 curvas de 90° / 270° entre caixas)
  n_curvas_90:            number
  curvas_conforme:        boolean
  // Verificações
  violacoes:             string[]
}

// ── 6. Caminho de um circuito pela rede ──────────────────────────
// Um circuito pode percorrer vários segmentos
export interface CaminhoCircuito {
  circuito_id:     string
  // Sequência de segmentos percorridos
  segmentos:       {
    segmento_id:   string
    sentido:       'ida' | 'volta' | 'derivacao'
    condutores:    TipoCondutor[]   // quais condutores estão neste trecho
    comprimento_m: number           // comprimento deste trecho específico
    corrente_a:    number           // corrente neste ponto (diminui após derivações)
  }[]
  // Queda de tensão real (acumulada ao longo do caminho)
  du_real_pct:     number
  comprimento_total_m: number
}

// ── 7. Rede elétrica completa (grafo) ────────────────────────────
export interface RedeEletrica {
  nos:       NoTopologico[]
  segmentos: SegmentoEletroduto[]
  caminhos:  CaminhoCircuito[]     // calculado automaticamente
}
