// src/core/panelTopology.ts
// ════════════════════════════════════════════════════════════════
// PANEL TOPOLOGY — mini-rede elétrica interna do quadro
//
// O QuadroDistribuicao tem dispositivos, barramentos e trilhos.
// Mas ainda não sabe QUEM ALIMENTA QUEM internamente.
//
// Hoje: dispositivos coexistem no trilho (topologia espacial)
// Problema: dois dispositivos podem ser fisicamente adjacentes
//   mas eletricamente independentes (DR antes vs depois de disjuntor)
//
// PanelTopology modela:
//   barramento FASE_R → pente → disjuntor C1 → terminal C1
//   barramento FASE_R → pente → DR → disjuntor C3 → terminal C3
//   barramento NEUTRO → borne neutro → (todos os circuitos)
//   barramento PE → borne PE → (todos os circuitos)
//
// Isso permite:
//   - saber quais circuitos estão protegidos pelo mesmo DR
//   - verificar se DPS está antes ou depois do disjuntor geral
//   - calcular corrente em cada segmento do barramento
//   - verificar seletividade (cascata de proteção)
//   - detectar circuitos sem DR em áreas molhadas
// ════════════════════════════════════════════════════════════════

import type { QuadroDistribuicao } from './quadroDistribuicao'

// ── Nó interno do painel ──────────────────────────────────────────
export type TipoNoPainel =
  | 'barramento'      // barramento principal (PE, N, fase)
  | 'pente'           // pente de distribuição de fase
  | 'dispositivo'     // disjuntor, DR, DPS, contator
  | 'terminal'        // borne de saída para o circuito
  | 'alimentador'     // entrada de energia (antes do DG)

export interface NoPainel {
  readonly id:          string
  readonly tipo:        TipoNoPainel
  readonly label:       string       // ex: "DR-C3" ou "BARR-FASE-R" ou "TERM-C1"
  readonly dispositivo_id?: string   // Dispositivo correspondente
  readonly barramento_id?:  string   // Barramento correspondente
  readonly circuito_id?:    string   // circuito que sai deste terminal
  // Estado elétrico
  readonly tensao_v:    number       // tensão no ponto (nominal)
  readonly corrente_a:  number       // corrente passando (calculada)
}

// ── Aresta interna do painel ──────────────────────────────────────
export interface ArestaPainel {
  readonly id:          string
  readonly no_a:        string    // NoPainel.id
  readonly no_b:        string    // NoPainel.id
  readonly tipo:        'pente' | 'fio' | 'barramento' | 'jumper'
  readonly fase?:       'R'|'S'|'T'|'N'|'PE'
  readonly secao_mm2?:  number
  readonly corrente_a:  number   // corrente calculada neste trecho
  // O pente conecta o barramento a múltiplos disjuntores em paralelo
  readonly em_paralelo: boolean
}

// ── PanelTopology ─────────────────────────────────────────────────
export interface PanelTopology {
  readonly nodes: Map<string, NoPainel>
  readonly edges: ArestaPainel[]
  // Grupos de proteção: quais circuitos estão sob o mesmo DR
  readonly grupos_dr: GrupoDR[]
  // Verificações
  readonly avisos:     AvisoPainel[]
}

export interface GrupoDR {
  readonly dr_id:       string   // ID do Dispositivo DR
  readonly corrente_in: number   // corrente do DR
  readonly sensibilidade_ma: number
  readonly circuito_ids: string[]  // circuitos protegidos por este DR
  readonly corrente_total: number  // soma das correntes dos circuitos
  readonly sobrecarga:    boolean  // corrente_total > corrente_in * 0.80
}

export interface AvisoPainel {
  readonly tipo:        'SEM_DR_AREA_MOLHADA' | 'DR_SOBRECARREGADO' | 'DPS_POSICAO_ERRADA' |
                        'CIRCUITO_SEM_PE'     | 'NEUTRO_INTERROMPIDO' | 'SEQUENCIA_INCORRETA'
  readonly dispositivo_id?: string
  readonly circuito_id?:    string
  readonly descricao:       string
  readonly severidade:      'erro' | 'aviso'
}

// ── Construir PanelTopology a partir do QuadroDistribuicao ────────
export function buildPanelTopology(qd: QuadroDistribuicao): PanelTopology {
  const nodes = new Map<string, NoPainel>()
  const edges: ArestaPainel[] = []
  const grupos_dr: GrupoDR[] = []
  const avisos: AvisoPainel[] = []

  // ── 1. Nós de alimentador e barramento ───────────────────────────
  const n_alim: NoPainel = {
    id: 'alim', tipo: 'alimentador', label: 'Alimentador',
    tensao_v: qd.tensao_nominal_v, corrente_a: qd.corrente_alimentador_a,
  }
  nodes.set(n_alim.id, n_alim)

  for (const barr of qd.barramentos) {
    const n: NoPainel = {
      id:           `barr-${barr.id}`,
      tipo:         'barramento',
      label:        barr.tipo,
      barramento_id: barr.id,
      tensao_v:     barr.tensao_v ?? qd.tensao_nominal_v,
      corrente_a:   barr.corrente_total_a,
    }
    nodes.set(n.id, n)
  }

  // ── 2. Nó para o Disjuntor Geral ─────────────────────────────────
  const dg = qd.dispositivos[0]  // DG sempre é o primeiro
  if (dg) {
    const n_dg: NoPainel = {
      id:              `disp-${dg.id}`,
      tipo:            'dispositivo',
      label:           `DG ${dg.corrente_in}A`,
      dispositivo_id:  dg.id,
      tensao_v:        qd.tensao_nominal_v,
      corrente_a:      qd.corrente_alimentador_a,
    }
    nodes.set(n_dg.id, n_dg)

    // Alimentador → DG → barramento de fase
    edges.push({
      id: 'e-alim-dg', no_a: 'alim', no_b: n_dg.id,
      tipo: 'fio', fase: 'R', corrente_a: qd.corrente_alimentador_a, em_paralelo: false,
    })
    const barr_fase_id = `barr-${qd.barramentos.find(b => b.tipo === 'FASE_R')?.id ?? 'bfr'}`
    edges.push({
      id: 'e-dg-barr', no_a: n_dg.id, no_b: barr_fase_id,
      tipo: 'fio', fase: 'R', corrente_a: qd.corrente_alimentador_a, em_paralelo: false,
    })
  }

  // ── 3. Nó para cada dispositivo de circuito ───────────────────────
  // Rastrear DRs para criar grupos
  const dr_circs = new Map<string, string[]>()  // dr_id → circuito_ids

  // Dispositivos em ordem de posição (excluindo DG e RESERVA)
  const disps_circ = qd.dispositivos.filter(d => d.circuito_id && d.tipo !== 'RESERVA')
    .sort((a, b) => a.posicao_modulo - b.posicao_modulo)

  for (const disp of disps_circ) {
    const n_disp: NoPainel = {
      id:             `disp-${disp.id}`,
      tipo:           'dispositivo',
      label:          `${disp.corrente_in}A${disp.tipo.startsWith('DR') ? ' DR' : ''} — ${disp.descricao.split('—')[1]?.trim() ?? ''}`,
      dispositivo_id: disp.id,
      circuito_id:    disp.circuito_id,
      tensao_v:       qd.tensao_nominal_v,
      corrente_a:     disp.corrente_in,
    }
    nodes.set(n_disp.id, n_disp)

    // Barramento de fase → pente → dispositivo
    const fase_barr_id = `barr-${qd.barramentos.find(b => b.tipo === `FASE_${disp.fases[0] ?? 'R'}`)?.id ?? 'bfr'}`
    edges.push({
      id:          `e-pente-${disp.id}`,
      no_a:        fase_barr_id,
      no_b:        n_disp.id,
      tipo:        'pente',
      fase:        disp.fases[0] ?? 'R',
      corrente_a:  disp.corrente_in,
      em_paralelo: true,  // pente conecta em paralelo ao barramento
    })

    // Terminal de saída
    const term = qd.terminais.find(t => t.circuito_id === disp.circuito_id)
    if (term && disp.circuito_id) {
      const n_term: NoPainel = {
        id:           `term-${disp.circuito_id}`,
        tipo:         'terminal',
        label:        `Terminal C${disp.circuito_id.slice(-4)}`,
        circuito_id:  disp.circuito_id,
        tensao_v:     qd.tensao_nominal_v,
        corrente_a:   disp.corrente_in,
      }
      nodes.set(n_term.id, n_term)

      edges.push({
        id:          `e-disp-term-${disp.id}`,
        no_a:        n_disp.id,
        no_b:        n_term.id,
        tipo:        'fio',
        fase:        disp.fases[0] ?? 'R',
        secao_mm2:   term.secao_mm2,
        corrente_a:  disp.corrente_in,
        em_paralelo: false,
      })

      // Rastrear grupos DR
      if (disp.tipo.startsWith('DR') && disp.circuito_id) {
        const lista = dr_circs.get(disp.id) ?? []
        lista.push(disp.circuito_id)
        dr_circs.set(disp.id, lista)
      }
    }
  }

  // ── 4. Construir grupos DR ────────────────────────────────────────
  for (const [dr_id, circ_ids] of dr_circs) {
    const disp = qd.dispositivos.find(d => d.id === dr_id)
    if (!disp) continue

    // Corrente total sob este DR
    const corrente_total = circ_ids.reduce((_s, _cid) => _s + disp.corrente_in, 0)

    grupos_dr.push({
      dr_id,
      corrente_in:      disp.corrente_in,
      sensibilidade_ma: disp.sensibilidade_ma ?? 30,
      circuito_ids:     circ_ids,
      corrente_total,
      sobrecarga:       corrente_total > disp.corrente_in * 0.8,
    })
  }

  // ── 5. Verificações normativas ────────────────────────────────────
  // Neutro pós-DR: verificar que o neutro de circuitos protegidos por DR
  // NÃO é compartilhado com circuitos sem DR
  // NBR 5410 §4.1.3: neutro depois do DR deve ser exclusivo do grupo
  const circs_com_dr = disps_circ.filter(d => d.tipo.startsWith('DR')).map(d => d.circuito_id!)
  const circs_sem_dr = disps_circ.filter(d => !d.tipo.startsWith('DR')).map(d => d.circuito_id!)
  if (circs_com_dr.length > 0 && circs_sem_dr.length > 0) {
    // Em quadros mistos (com e sem DR), o barramento de neutro PODE ter problemas
    // se circuitos pós-DR compartilharem o mesmo borne de neutro com circuitos sem DR
    avisos.push({
      tipo:        'NEUTRO_INTERROMPIDO',
      descricao:   `Quadro misto: ${circs_com_dr.length} circuito(s) com DR e ${circs_sem_dr.length} sem DR compartilham barramento de neutro — verificar separação do neutro pós-DR (NBR 5410 §4.1.3)`,
      severidade:  'aviso',
    })
  }

  // Circuitos sem DR em áreas "molhadas" (descrição contém banho/cozinha/etc.)
  for (const disp of disps_circ) {
    if (!disp.tipo.startsWith('DR') && disp.circuito_id) {
      const desc = disp.descricao.toLowerCase()
      const area_molhada = ['banho', 'cozinha', 'lavand', 'externo', 'garagem'].some(k => desc.includes(k))
      if (area_molhada) {
        avisos.push({
          tipo:           'SEM_DR_AREA_MOLHADA',
          dispositivo_id: disp.id,
          circuito_id:    disp.circuito_id,
          descricao:      `Circuito "${disp.descricao}" em área molhada sem IDR — NBR 5410 §4.1`,
          severidade:     'erro',
        })
      }
    }
  }

  // DR sobrecarregado
  for (const grupo of grupos_dr) {
    if (grupo.sobrecarga) {
      avisos.push({
        tipo:           'DR_SOBRECARREGADO',
        dispositivo_id: grupo.dr_id,
        descricao:      `DR ${grupo.corrente_in}A com ${grupo.corrente_total.toFixed(0)}A total — acima de 80%`,
        severidade:     'aviso',
      })
    }
  }

  return { nodes, edges, grupos_dr, avisos }
}

// ── Sequência elétrica de um circuito ────────────────────────────
// Retorna a sequência de nós do alimentador até o terminal do circuito
export function sequenciaCircuito(
  circuito_id: string,
  topo:        PanelTopology
): NoPainel[] {
  // Encontrar o terminal do circuito
  const terminal = [...topo.nodes.values()].find(n => n.circuito_id === circuito_id && n.tipo === 'terminal')
  if (!terminal) return []

  // BFS reverso: do terminal até o alimentador
  const sequencia: NoPainel[] = []
  const visitados = new Set<string>()
  let atual_id = terminal.id

  while (atual_id && !visitados.has(atual_id)) {
    visitados.add(atual_id)
    const no = topo.nodes.get(atual_id)
    if (no) sequencia.unshift(no)

    // Encontrar a aresta que chega neste nó
    const aresta_entrada = topo.edges.find(e => e.no_b === atual_id && !e.em_paralelo)
    atual_id = aresta_entrada?.no_a ?? ''
  }

  return sequencia
}

// ── Verificar se um circuito tem DR ──────────────────────────────
export function circuitoTemDR(circuito_id: string, topo: PanelTopology): boolean {
  const seq = sequenciaCircuito(circuito_id, topo)
  return seq.some(n => {
    const d = topo.nodes.get(n.id)
    const disp_id = d?.dispositivo_id
    if (!disp_id) return false
    // verificar se é DR
    return n.label.includes('DR')
  })
}
