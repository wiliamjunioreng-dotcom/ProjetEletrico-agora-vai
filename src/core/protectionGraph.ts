// src/core/protectionGraph.ts
// ════════════════════════════════════════════════════════════════
// PROTECTION GRAPH — topologia elétrica de proteção real
//
// O que o sistema já tem mas fragmentado:
//   panelTopology.ts   → nós e arestas do QD (topologia espacial)
//   protectionCoord.ts → Icu, seletividade (cálculo por par)
//
// O que ainda falta:
//   "O que o DR-3 protege?"           → ZonaProtegida
//   "Qual neutro pertence a qual DR?" → SegregacaoNeutro
//   "Seletividade por zona"           → grafo de hierarquia
//
// ProtectionGraph é a topologia de proteção como rede:
//   - Fonte alimenta barramentos
//   - Barramentos alimentam dispositivos de proteção
//   - Dispositivos de proteção delimitam zonas protegidas
//   - Zonas possuem neutros próprios (para DR) ou compartilhados
//   - Hierarquia de seletividade é explícita como arestas do grafo
//
// Responde:
//   - "Circuito C3 está protegido por DR?"
//   - "O neutro de C3 está segregado corretamente?"
//   - "Se D1 falhar, qual é o backup?"
//   - "Qual zona perde energia se o DR-geral atuar?"
// ════════════════════════════════════════════════════════════════

import type { QuadroDistribuicao } from './quadroDistribuicao'

// ── Zona protegida ────────────────────────────────────────────────
// Conjunto de circuitos sob proteção de um mesmo dispositivo
export interface ZonaProtegida {
  readonly id:               string
  readonly dispositivo_id:   string    // DR, disjuntor, fusível que delimita a zona
  readonly tipo_protecao:    'DISJUNTOR' | 'DR_30MA' | 'DR_100MA' | 'DR_300MA' | 'FUSIVEL'
  // Circuitos dentro desta zona
  readonly circuito_ids:     string[]
  // O neutro desta zona é segregado (exclusivo para o DR)?
  readonly neutro_segregado: boolean
  // ID do barramento de neutro desta zona (pode ser compartilhado ou dedicado)
  readonly neutro_barr_id:   string
  // Zona pai (dispositivo à montante que protege esta zona)
  readonly zona_pai_id?:     string
  // Sub-zonas (dispositivos à jusante)
  readonly sub_zona_ids:     string[]
  // Corrente total na zona
  readonly corrente_total_a: number
  // Corrente do dispositivo de proteção
  readonly corrente_prot_a:  number
  // Carregamento (%)
  readonly carregamento_pct: number
}

// ── Nó de proteção ───────────────────────────────────────────────
export type TipoNoProtecao =
  | 'FONTE'         // entrada de energia (concessionária)
  | 'BARRAMENTO'    // barramento do QD (fase ou neutro)
  | 'DISJUNTOR'     // disjuntor simples
  | 'DR'            // dispositivo diferencial-residual
  | 'TERMINAL'      // saída para circuito
  | 'ZONA'          // zona protegida (agrupamento lógico)

export interface NoProtecao {
  readonly id:           string
  readonly tipo:         TipoNoProtecao
  readonly label:        string
  readonly dispositivo_id?: string
  readonly circuito_id?:    string
  readonly zona_id?:        string
}

// ── Aresta de proteção ────────────────────────────────────────────
export type TipoArestaProtecao =
  | 'ALIMENTA'      // energia fluindo de montante para jusante
  | 'PROTEGE'       // dispositivo protege zona/circuito
  | 'NEUTRO'        // caminho do neutro
  | 'SELETIVIDADE'  // relação de seletividade entre dois dispositivos

export interface ArestaProtecao {
  readonly id:         string
  readonly tipo:       TipoArestaProtecao
  readonly no_a:       string
  readonly no_b:       string
  // Para SELETIVIDADE: resultado da verificação
  readonly seletivo?:  boolean
  readonly justificativa?: string
}

// ── ProtectionGraph ───────────────────────────────────────────────
export interface ProtectionGraph {
  readonly nos:      Map<string, NoProtecao>
  readonly arestas:  ArestaProtecao[]
  readonly zonas:    Map<string, ZonaProtegida>
  readonly avisos:   AvisoProtection[]
}

export interface AvisoProtection {
  readonly tipo:       'NEUTRO_NAO_SEGREGADO' | 'ZONA_SEM_DR' | 'CARREGAMENTO_ALTO' |
                       'SELETIVIDADE_FALHA'   | 'DR_GERAL_FALTANDO'
  readonly zona_id?:   string
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso'
  readonly referencia: string
}

// ── Construir ProtectionGraph a partir do QuadroDistribuicao ──────
export function buildProtectionGraph(
  qd:              QuadroDistribuicao,
  // Mapeamento: dispositivo_id → corrente de circuito (para carregamento real)
  correntes_circ:  Map<string, number> = new Map()
): ProtectionGraph {
  const nos     = new Map<string, NoProtecao>()
  const arestas: ArestaProtecao[] = []
  const zonas   = new Map<string, ZonaProtegida>()
  const avisos:   AvisoProtection[] = []

  // ── 1. Nó de fonte ───────────────────────────────────────────────
  const no_fonte: NoProtecao = { id:'fonte', tipo:'FONTE', label:'Alimentador' }
  nos.set('fonte', no_fonte)

  // ── 2. Nós de barramento ─────────────────────────────────────────
  for (const barr of qd.barramentos) {
    const no: NoProtecao = {
      id:    `barr-${barr.id}`,
      tipo:  'BARRAMENTO',
      label: barr.tipo,
    }
    nos.set(no.id, no)
  }

  // ── 3. Identificar DGs e dispositivos de circuito ────────────────
  const dg = qd.dispositivos[0]  // DG = primeiro dispositivo (sem circuito)
  if (dg) {
    const no_dg: NoProtecao = {
      id:             `disp-${dg.id}`,
      tipo:           'DISJUNTOR',
      label:          `DG ${dg.corrente_in}A`,
      dispositivo_id: dg.id,
    }
    nos.set(no_dg.id, no_dg)

    // Aresta: fonte → DG
    arestas.push({ id:`a-fonte-dg`, tipo:'ALIMENTA', no_a:'fonte', no_b:no_dg.id })
    // Aresta: DG → barramento fase principal
    const barr_fase_id = `barr-${qd.barramentos.find(b => b.tipo === 'FASE_R')?.id ?? 'BR'}`
    arestas.push({ id:`a-dg-barr`, tipo:'ALIMENTA', no_a:no_dg.id, no_b:barr_fase_id })
  }

  // ── 4. Dispositivos de circuito → nós e zonas ────────────────────
  const disps_circ = qd.dispositivos
    .filter(d => d.circuito_id && d.tipo !== 'RESERVA')
    .sort((a, b) => a.posicao_modulo - b.posicao_modulo)

  // Detectar se há DRs (para verificar segregação de neutro)
  const tem_dr = disps_circ.some(d => d.tipo.startsWith('DR'))
  const tem_sem_dr = disps_circ.some(d => !d.tipo.startsWith('DR'))
  const misto = tem_dr && tem_sem_dr

  // Barramento de neutro compartilhado ou segregado
  const barr_n_compartilhado = qd.barramentos.find(b => b.tipo === 'NEUTRO')?.id ?? 'BN'
  const barr_n_segregado = misto ? `${qd.id}-BN-DR` : barr_n_compartilhado

  for (const disp of disps_circ) {
    if (!disp.circuito_id) continue
    const e_dr = disp.tipo.startsWith('DR')

    const tipo_no: TipoNoProtecao = e_dr ? 'DR' : 'DISJUNTOR'
    const no_disp: NoProtecao = {
      id:              `disp-${disp.id}`,
      tipo:            tipo_no,
      label:           `${disp.corrente_in}A${e_dr ? ' DR' : ''} ${disp.circuito_id}`,
      dispositivo_id:  disp.id,
      circuito_id:     disp.circuito_id,
    }
    nos.set(no_disp.id, no_disp)

    // Terminal de saída
    const no_term: NoProtecao = {
      id:           `term-${disp.circuito_id}`,
      tipo:         'TERMINAL',
      label:        `Saída ${disp.circuito_id}`,
      circuito_id:  disp.circuito_id,
    }
    nos.set(no_term.id, no_term)

    // Arestas
    const barr_fase_id = `barr-${qd.barramentos.find(b => b.tipo === `FASE_${disp.fases[0] ?? 'R'}`)?.id ?? `BR`}`
    arestas.push({ id:`a-barr-${disp.id}`, tipo:'ALIMENTA', no_a:barr_fase_id, no_b:no_disp.id })
    arestas.push({ id:`a-disp-term-${disp.id}`, tipo:'ALIMENTA', no_a:no_disp.id, no_b:no_term.id })
    arestas.push({ id:`a-prot-${disp.id}`, tipo:'PROTEGE', no_a:no_disp.id, no_b:no_term.id })

    // Neutro: DR tem neutro segregado (idealmente), disjuntor usa barramento compartilhado
    const neutro_id = e_dr && misto ? barr_n_segregado : barr_n_compartilhado
    arestas.push({ id:`a-neutro-${disp.id}`, tipo:'NEUTRO', no_a:`barr-${neutro_id}`, no_b:no_term.id })

    // ── Zona protegida ──────────────────────────────────────────────
    const corrente_circ = correntes_circ.get(disp.circuito_id) ?? disp.corrente_in * 0.6  // estimativa
    const carregamento  = Math.round(corrente_circ / disp.corrente_in * 100)

    const zona: ZonaProtegida = {
      id:               `zona-${disp.id}`,
      dispositivo_id:   disp.id,
      tipo_protecao:    e_dr ? (disp.sensibilidade_ma === 30 ? 'DR_30MA' : 'DR_100MA') : 'DISJUNTOR',
      circuito_ids:     [disp.circuito_id],
      neutro_segregado: e_dr,   // DR deveria ter neutro segregado
      neutro_barr_id:   neutro_id,
      sub_zona_ids:     [],
      corrente_total_a: corrente_circ,
      corrente_prot_a:  disp.corrente_in,
      carregamento_pct: carregamento,
    }
    zonas.set(zona.id, zona)

    // Avisos
    if (e_dr && misto && neutro_id === barr_n_compartilhado) {
      avisos.push({
        tipo: 'NEUTRO_NAO_SEGREGADO', zona_id: zona.id, severidade: 'erro',
        descricao: `DR ${disp.id}: neutro não segregado — retorno pode mascarar corrente diferencial`,
        referencia: 'NBR 5410 §4.1.3',
      })
    }
    if (carregamento > 80) {
      avisos.push({
        tipo: 'CARREGAMENTO_ALTO', zona_id: zona.id, severidade: 'aviso',
        descricao: `Circuito ${disp.circuito_id}: ${carregamento}% de carregamento`,
        referencia: 'NBR 5410 §6.2.1',
      })
    }
  }

  // ── 5. Seletividade entre DG e cada dispositivo ──────────────────
  if (dg) {
    for (const disp of disps_circ) {
      const ratio_in = dg.corrente_in / disp.corrente_in
      const seletivo = ratio_in >= 1.6
      arestas.push({
        id:         `a-selet-${disp.id}`,
        tipo:       'SELETIVIDADE',
        no_a:       `disp-${dg.id}`,
        no_b:       `disp-${disp.id}`,
        seletivo,
        justificativa: seletivo
          ? `In DG/In circ = ${ratio_in.toFixed(1)} ≥ 1.6`
          : `In DG/In circ = ${ratio_in.toFixed(1)} < 1.6 — seletividade comprometida`,
      })
      if (!seletivo) {
        avisos.push({
          tipo: 'SELETIVIDADE_FALHA', severidade: 'aviso',
          descricao: `DG ${dg.corrente_in}A / ${disp.id} ${disp.corrente_in}A: razão ${ratio_in.toFixed(1)} < 1.6`,
          referencia: 'NBR 5410 §4.3.4',
        })
      }
    }
  }

  return { nos, arestas, zonas, avisos }
}

// ── Consultas ao ProtectionGraph ──────────────────────────────────
// Circuito está protegido por DR?
export function circuitoTemDRnoGrafo(circuito_id: string, graph: ProtectionGraph): boolean {
  for (const [, zona] of graph.zonas) {
    if (zona.circuito_ids.includes(circuito_id)) {
      return zona.tipo_protecao.startsWith('DR_')
    }
  }
  return false
}

// Qual zona protege o circuito?
export function zonaDoCircuito(circuito_id: string, graph: ProtectionGraph): ZonaProtegida | null {
  for (const [, zona] of graph.zonas) {
    if (zona.circuito_ids.includes(circuito_id)) return zona
  }
  return null
}

// Verificar se PE está presente em toda a instalação
export function verificarContinuidadePEnoGrafo(graph: ProtectionGraph): boolean {
  // Verificar que existe ao menos um barramento PE no grafo
  for (const [, no] of graph.nos) {
    if (no.tipo === 'BARRAMENTO' && no.label === 'PE') return true
  }
  return false
}
