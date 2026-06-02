// src/core/quadroDistribuicao.ts
// ════════════════════════════════════════════════════════════════
// QUADRO DE DISTRIBUIÇÃO — sistema físico completo
//
// Hoje: QD = lista de circuitos com disjuntor e IDR.
// Isso é simplificação excessiva.
//
// QD real é:
//   - topologia elétrica local (barramentos, dispositivos, bornes)
//   - distribuição física (trilho DIN, posição modular, ocupação)
//   - continuidade de barramentos (pente distribui a fase)
//   - capacidade térmica (corrente do barramento, pente)
//   - seletividade (qual disjuntor atua primeiro)
//   - organização construtiva (sequência, espaços de reserva)
//
// Hierarquia física:
//   QuadroDistribuicao
//     ├── TrilhoDIN[]         (trilhos para montagem dos dispositivos)
//     ├── Dispositivo[]       (disjuntor, DR, DPS, contator)
//     ├── Barramento[]        (PE, neutro, fase, pente)
//     ├── Terminal[]          (bornes de saída para circuitos)
//     └── LigacaoInterna[]   (conexões internas do QD)
// ════════════════════════════════════════════════════════════════

// ── Dispositivos ──────────────────────────────────────────────────
export type TipoDispositivo =
  | 'DISJUNTOR_MONO'    // 1 polo, 1 módulo DIN
  | 'DISJUNTOR_BI'      // 2 polos, 2 módulos DIN
  | 'DISJUNTOR_TRI'     // 3 polos, 3 módulos DIN
  | 'DR_MONO'           // IDR monofásico, 2 módulos
  | 'DR_BI'             // IDR bifásico, 3 módulos
  | 'DR_TRI'            // IDR trifásico, 4 módulos
  | 'DPS_MONO'          // DPS monofásico, 1 módulo
  | 'DPS_TRI'           // DPS trifásico, 3 módulos
  | 'CONTATOR'          // contator (2-4 módulos)
  | 'RESERVA'           // espaço reservado (vazio)

// Largura modular de cada dispositivo (em módulos DIN de 17.5mm)
export const LARGURA_MODULAR: Record<TipoDispositivo, number> = {
  DISJUNTOR_MONO: 1, DISJUNTOR_BI: 2,  DISJUNTOR_TRI: 3,
  DR_MONO: 2,         DR_BI: 3,          DR_TRI: 4,
  DPS_MONO: 1,        DPS_TRI: 3,
  CONTATOR: 3,
  RESERVA: 1,
}

// ── Dispositivo no quadro ─────────────────────────────────────────
export interface Dispositivo {
  readonly id:              string
  readonly tipo:            TipoDispositivo
  readonly descricao:       string        // ex: "Disjuntor 16A C - ILUM Sala"
  readonly posicao_modulo:  number        // módulo onde começa (1-based)
  readonly trilho_id:       string        // trilho DIN onde está
  readonly circuito_id?:    string        // circuito protegido (se houver)
  // Parâmetros elétricos
  readonly corrente_in:     number        // corrente nominal (A)
  readonly curva?:          'B'|'C'|'D'  // curva de atuação
  readonly sensibilidade_ma?: number      // para DR: 30, 100, 300 mA
  readonly tensao_nominal:  230 | 380 | 415  // tensão de operação
  // Fase(s) conectadas
  readonly fases:           ('R'|'S'|'T')[]
}

// ── Trilho DIN ────────────────────────────────────────────────────
export interface TrilhoDIN {
  readonly id:              string
  readonly comprimento_mm:  number        // comprimento físico (mm)
  readonly n_modulos:       number        // módulos disponíveis (comprimento/17.5)
  readonly posicao_vertical: number       // posição no QD (1 = topo)
  readonly dispositivos:    string[]      // IDs de Dispositivo, em ordem
}

// Módulos usados por um trilho
export function modulosUsados(trilho: TrilhoDIN, dispositivos: Dispositivo[]): number {
  return dispositivos
    .filter(d => d.trilho_id === trilho.id)
    .reduce((s, d) => s + LARGURA_MODULAR[d.tipo], 0)
}

// ── Barramento ────────────────────────────────────────────────────
export type TipoBarramento = 'PE' | 'NEUTRO' | 'FASE_R' | 'FASE_S' | 'FASE_T' | 'PENTE'

export interface Barramento {
  readonly id:               string
  readonly tipo:             TipoBarramento
  readonly corrente_max_a:   number      // capacidade do barramento
  readonly n_terminais:      number      // quantos terminais tem
  readonly terminais_usados: number      // quantos em uso
  // Corrente total sendo conduzida
  readonly corrente_total_a: number      // calculado: soma dos circuitos
  readonly tensao_v?:        number      // para fase: 230V mono, 380V fase-fase
}

// ── Terminal de saída ─────────────────────────────────────────────
export interface TerminalQD {
  readonly id:          string
  readonly circuito_id: string    // circuito que parte daqui
  readonly dispositivo_id: string // dispositivo de proteção
  readonly borne_tipo:  'fase' | 'neutro' | 'terra'
  readonly secao_mm2:   number    // bitola do condutor de saída
}

// ── Ligação interna ───────────────────────────────────────────────
// Conexão dentro do QD (pente, jumper, barramento → dispositivo)
export interface LigacaoInterna {
  readonly id:        string
  readonly origem:    string   // ID de Barramento ou Dispositivo
  readonly destino:   string   // ID de Barramento ou Dispositivo
  readonly tipo:      'pente' | 'jumper' | 'barramento' | 'cabo'
  readonly secao_mm2?: number
}

// ── QuadroDistribuicao ────────────────────────────────────────────
export interface QuadroDistribuicao {
  readonly id:              string
  readonly descricao:       string        // ex: "QD - Pavimento Térreo"
  readonly tipo:            'QD' | 'QDC' | 'QGBT' | 'QG'
  // Físico
  readonly n_modulos_total: number        // capacidade total (ex: 24, 36, 48 módulos)
  readonly trilhos:         TrilhoDIN[]
  readonly dispositivos:    Dispositivo[]
  // Elétrico
  readonly barramentos:     Barramento[]
  readonly terminais:       TerminalQD[]
  readonly ligacoes_internas: LigacaoInterna[]
  // Alimentação
  readonly corrente_alimentador_a: number  // corrente máxima do alimentador
  readonly tensao_nominal_v:       230 | 380  // mono ou trifásico
  // Estado computado
  readonly modulos_usados:   number
  readonly modulos_livres:   number
  readonly ocupacao_pct:     number
}

// ── Construir QuadroDistribuicao a partir de circuitos ───────────
export interface CircuitoParaQD {
  id:          string
  descricao:   string
  tipo:        string
  potencia_va: number
  in_disj:     number
  curva:       'B'|'C'|'D'
  idr:         boolean
  idr_in:      number
  fase:        'R'|'S'|'T'|'RST'|'RS'|'ST'|'RT'
  n_fases:     1|2|3
  secao_fase:  number
}

export function buildQuadro(
  id:          string,
  descricao:   string,
  circuitos:   CircuitoParaQD[],
  tipo:        QuadroDistribuicao['tipo'] = 'QD',
  n_modulos:   number = 36,
  tensao:      230|380 = 230,
  n_fases:     1|2|3 = 1
): QuadroDistribuicao {
  const dispositivos: Dispositivo[] = []
  const terminais:    TerminalQD[]  = []
  const ligacoes:     LigacaoInterna[] = []

  // Trilho único por ora (futuro: múltiplos trilhos com quebra DIN)
  const trilho: TrilhoDIN = {
    id: `${id}-t1`, comprimento_mm: n_modulos * 17.5,
    n_modulos, posicao_vertical: 1, dispositivos: [],
  }

  let posicao = 1  // módulo atual

  // Alimentador geral (disjuntor principal)
  const tipo_dg: TipoDispositivo = tensao === 380 ? 'DISJUNTOR_TRI' : 'DISJUNTOR_MONO'
  const dg: Dispositivo = {
    id: `${id}-DG`, tipo: tipo_dg,
    descricao: `Disjuntor Geral — alimentador`,
    posicao_modulo: posicao, trilho_id: trilho.id,
    corrente_in: Math.ceil(circuitos.reduce((s, c) => s + c.potencia_va / 220, 0) * 1.25),
    curva: 'C', tensao_nominal: tensao,
    fases: tensao === 380 ? ['R','S','T'] : ['R'],
  }
  dispositivos.push(dg)
  posicao += LARGURA_MODULAR[tipo_dg]

  // Um dispositivo por circuito
  for (const circ of circuitos) {
    const fases: ('R'|'S'|'T')[] = circ.fase === 'RST' ? ['R','S','T']
      : circ.fase === 'RS' ? ['R','S']
      : circ.fase === 'ST' ? ['S','T']
      : circ.fase === 'RT' ? ['R','T']
      : [circ.fase as 'R'|'S'|'T']

    const tipo_disj: TipoDispositivo =
      circ.idr ? (circ.n_fases >= 2 ? 'DR_BI' : 'DR_MONO')
      : (circ.n_fases === 3 ? 'DISJUNTOR_TRI' : circ.n_fases === 2 ? 'DISJUNTOR_BI' : 'DISJUNTOR_MONO')

    const largura = LARGURA_MODULAR[tipo_disj]
    if (posicao + largura - 1 > n_modulos) break  // quadro cheio

    const disp: Dispositivo = {
      id:             `${id}-D${dispositivos.length + 1}`,
      tipo:           tipo_disj,
      descricao:      `${circ.in_disj}A ${circ.curva}${circ.idr ? ' DR' : ''} — ${circ.descricao}`,
      posicao_modulo: posicao,
      trilho_id:      trilho.id,
      circuito_id:    circ.id,
      corrente_in:    circ.in_disj,
      curva:          circ.curva,
      sensibilidade_ma: circ.idr ? circ.idr_in : undefined,
      tensao_nominal: tensao,
      fases,
    }
    dispositivos.push(disp)
    posicao += largura

    // Terminal de saída
    terminais.push({
      id:             `${id}-T${terminais.length + 1}`,
      circuito_id:    circ.id,
      dispositivo_id: disp.id,
      borne_tipo:     'fase',
      secao_mm2:      circ.secao_fase,
    })
  }

  // Reserva até o final
  while (posicao <= n_modulos) {
    dispositivos.push({
      id: `${id}-R${posicao}`, tipo: 'RESERVA',
      descricao: 'Reserva', posicao_modulo: posicao,
      trilho_id: trilho.id, corrente_in: 0, tensao_nominal: tensao, fases: [],
    })
    posicao++
  }

  // Contar apenas dispositivos reais (não RESERVA) para modulos_usados
  const usados = dispositivos.filter(d => d.tipo !== 'RESERVA').reduce((s, d) => s + LARGURA_MODULAR[d.tipo], 0)
  const livres = Math.max(0, n_modulos - usados)

  // Barramentos básicos
  const corrente_circ_total = circuitos.reduce((s, c) => s + c.potencia_va / 220, 0)
  // Calcular corrente por fase
  const cor_R = circuitos.filter(c => ['R'].includes(c.fase.charAt(0))).reduce((s,c) => s+c.potencia_va,0)/220
  const cor_S = circuitos.filter(c => ['S'].includes(c.fase.charAt(0))).reduce((s,c) => s+c.potencia_va,0)/220
  const cor_T = circuitos.filter(c => ['T'].includes(c.fase.charAt(0))).reduce((s,c) => s+c.potencia_va,0)/220

  const barramentos: Barramento[] = [
    { id:`${id}-BPE`, tipo:'PE',     corrente_max_a:160, n_terminais:12, terminais_usados:circuitos.length, corrente_total_a:0 },
    { id:`${id}-BN`,  tipo:'NEUTRO', corrente_max_a:100, n_terminais:12, terminais_usados:circuitos.length, corrente_total_a:corrente_circ_total },
    { id:`${id}-BR`,  tipo:'FASE_R', corrente_max_a:100, n_terminais:1,  terminais_usados:1, corrente_total_a:cor_R, tensao_v:tensao },
    // Barramentos S e T apenas para instalações bifásicas e trifásicas
    ...(tensao === 380 || n_fases >= 2 ? [
      { id:`${id}-BS`, tipo:'FASE_S' as const, corrente_max_a:100, n_terminais:1, terminais_usados:1, corrente_total_a:cor_S, tensao_v:tensao },
    ] : []),
    ...(tensao === 380 ? [
      { id:`${id}-BT`, tipo:'FASE_T' as const, corrente_max_a:100, n_terminais:1, terminais_usados:1, corrente_total_a:cor_T, tensao_v:tensao },
    ] : []),
  ]

  return {
    id, descricao, tipo,
    n_modulos_total:    n_modulos,
    trilhos:            [{ ...trilho, dispositivos: dispositivos.map(d => d.id) }],
    dispositivos,
    barramentos,
    terminais,
    ligacoes_internas: ligacoes,
    corrente_alimentador_a: dg.corrente_in,
    tensao_nominal_v:  tensao,
    modulos_usados:    usados,
    modulos_livres:    livres,
    ocupacao_pct:      Math.round(usados / n_modulos * 100),
  }
}

// ── Verificar capacidade do quadro ────────────────────────────────
export interface VerificacaoQD {
  ok:              boolean
  avisos:          string[]
  modulos_livres:  number
  corrente_total:  number
  carga_pct:       number
}

export function verificarQuadro(qd: QuadroDistribuicao): VerificacaoQD {
  const avisos: string[] = []

  if (qd.modulos_livres < 4) {
    avisos.push(`Quadro com ${qd.modulos_livres} módulo(s) livres — reserva mínima recomendada: 4 módulos`)
  }
  if (qd.ocupacao_pct > 80) {
    avisos.push(`Ocupação ${qd.ocupacao_pct}% > 80% — considerar quadro maior`)
  }

  const barra_neutro = qd.barramentos.find(b => b.tipo === 'NEUTRO')
  if (barra_neutro && barra_neutro.corrente_total_a > barra_neutro.corrente_max_a) {
    avisos.push(`Barramento neutro sobrecarregado: ${barra_neutro.corrente_total_a.toFixed(0)}A > ${barra_neutro.corrente_max_a}A`)
  }

  return {
    ok: avisos.length === 0,
    avisos,
    modulos_livres:  qd.modulos_livres,
    corrente_total:  qd.barramentos.find(b => b.tipo === 'FASE_R')?.corrente_total_a ?? 0,
    carga_pct:       qd.ocupacao_pct,
  }
}
