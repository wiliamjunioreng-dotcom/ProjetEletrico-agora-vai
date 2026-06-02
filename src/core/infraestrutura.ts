// src/core/infraestrutura.ts
// ════════════════════════════════════════════════════════════════
// INFRAESTRUTURA COMPARTILHADA
//
// Problema: hoje cada circuito calcula seu eletroduto isoladamente.
// Realidade: vários circuitos compartilham o mesmo eletroduto.
//
// Consequências de ignorar isso:
//   - ocupação errada (soma de áreas individuais ignorada)
//   - Fa errado (agrupamento subestimado)
//   - Iz' errado (desempenho térmico piorado)
//   - diâmetro errado (eletroduto pode estar superlotado)
//   - quantitativo errado (metros contados N vezes em vez de 1)
//
// Este módulo:
//   1. Agrupa circuitos em eletrodutos por trajeto/cômodo
//   2. Calcula ocupação real (NBR 5410 §6.1.5)
//   3. Determina diâmetro mínimo necessário
//   4. Informa o Fa correto para cada circuito no eletroduto
//
// Referência: NBR 5410:2004 §6.1.5.2 — fator de agrupamento
// ════════════════════════════════════════════════════════════════

import {
  getAreaExterna, AREA_INTERNA_ELETRODUTO, getFa,
} from '../data/nbr5410tables'

// ── Ocupação máxima por NBR 5410 ─────────────────────────────────
// §6.1.5.2: ≤ 40% para 3+ cabos; ≤ 53% para 2 cabos; ≤ 31% para 1 cabo
const TAXA_MAX_OCUPACAO: Record<number, number> = {
  1: 0.31,
  2: 0.53,
  3: 0.40,   // para 3 ou mais
}
function taxaMaxima(n_cabos: number): number {
  if (n_cabos <= 0) return 0.40
  if (n_cabos === 1) return TAXA_MAX_OCUPACAO[1]
  if (n_cabos === 2) return TAXA_MAX_OCUPACAO[2]
  return TAXA_MAX_OCUPACAO[3]
}

// ── Condutor em eletroduto ────────────────────────────────────────
export interface CaboNoEletroduto {
  readonly circuito_id:  string
  readonly descricao:    string
  readonly secao_mm2:    number
  readonly isolacao:     'PVC' | 'XLPE' | 'EPR'
  readonly n_condutores: number    // quantos cabos desta seção passam aqui
}

// ── Eletroduto compartilhado ──────────────────────────────────────
export interface EletrodutoCompartilhado {
  readonly id:           string
  readonly comodo_id?:   string       // cômodo ao longo do qual percorre
  readonly descricao:    string

  // Circuitos que passam por este eletroduto
  readonly cabos:        CaboNoEletroduto[]

  // ── Cálculo de ocupação ───────────────────────────────────────
  readonly area_cabos_mm2:   number   // soma das áreas externas dos cabos
  readonly diametro_mm:      20 | 25 | 32 | 40   // mínimo para a ocupação
  readonly area_interna_mm2: number   // área interna do diâmetro escolhido
  readonly taxa_ocupacao:    number   // area_cabos / area_interna (0-1)
  readonly taxa_maxima:      number   // NBR §6.1.5.2
  readonly status_ocupacao:  'OK' | 'LIMITE' | 'EXCEDIDO'

  // ── Agrupamento ──────────────────────────────────────────────
  readonly n_circuitos:  number       // circuitos elétricos distintos
  readonly fa:           number       // fator de agrupamento NBR Tabela 42
}

// ── Calcular eletroduto compartilhado ─────────────────────────────
export function calcEletroduto(
  id:       string,
  cabos:    CaboNoEletroduto[],
  descricao = '',
  comodo_id?: string
): EletrodutoCompartilhado {
  if (cabos.length === 0) {
    return {
      id, cabos, descricao, comodo_id,
      area_cabos_mm2: 0, diametro_mm: 20, area_interna_mm2: AREA_INTERNA_ELETRODUTO[20],
      taxa_ocupacao: 0, taxa_maxima: 0.40, status_ocupacao: 'OK',
      n_circuitos: 0, fa: 1.0,
    }
  }

  // 1. Área total dos cabos (soma de todas as áreas externas)
  let area_total = 0
  for (const cabo of cabos) {
    const area_cabo = getAreaExterna(cabo.secao_mm2, cabo.isolacao) ?? 0
    area_total += area_cabo * cabo.n_condutores
  }

  // 2. Número de circuitos elétricos distintos (para Fa)
  const n_circ = new Set(cabos.map(c => c.circuito_id)).size

  // 3. Taxa máxima de ocupação por número total de cabos
  const n_cabos_total = cabos.reduce((s, c) => s + c.n_condutores, 0)
  const taxa_max = taxaMaxima(n_cabos_total)

  // 4. Diâmetro mínimo: menor que comporta a ocupação
  const diametros_disponiveis = [20, 25, 32, 40] as const
  let diametro_escolhido: 20 | 25 | 32 | 40 = 40
  for (const d of diametros_disponiveis) {
    const area_int = AREA_INTERNA_ELETRODUTO[d] ?? 0
    if (area_int > 0 && area_total / area_int <= taxa_max) {
      diametro_escolhido = d
      break
    }
  }

  const area_interna = AREA_INTERNA_ELETRODUTO[diametro_escolhido]
  const taxa_ocp     = area_interna > 0 ? area_total / area_interna : 0

  // 5. Status de ocupação
  const status: 'OK' | 'LIMITE' | 'EXCEDIDO' =
    taxa_ocp > taxa_max       ? 'EXCEDIDO' :
    taxa_ocp > taxa_max * 0.85 ? 'LIMITE'   : 'OK'

  // 6. Fator de agrupamento (Fa NBR Tabela 42)
  const fa = getFa(n_circ)

  return {
    id, cabos, descricao, comodo_id,
    area_cabos_mm2:   Math.round(area_total * 100) / 100,
    diametro_mm:      diametro_escolhido,
    area_interna_mm2: area_interna,
    taxa_ocupacao:    Math.round(taxa_ocp * 1000) / 1000,
    taxa_maxima:      taxa_max,
    status_ocupacao:  status,
    n_circuitos:      n_circ,
    fa,
  }
}

// ── Agrupar circuitos por cômodo ─────────────────────────────────
// Heurística simples: circuitos do mesmo cômodo compartilham eletroduto
// Futura evolução: usar FaceGraph para agrupar por trajeto real
export interface CircuitoParaEletroduto {
  id:           string
  descricao:    string
  tipo:         string
  comodo_id?:   string
  secao_fase:   number
  n_fases:      1 | 2 | 3
  isolacao?:    'PVC' | 'XLPE' | 'EPR'
}

export function agruparCircuitosPorComodo(
  circuitos: CircuitoParaEletroduto[]
): Map<string, CircuitoParaEletroduto[]> {
  const grupos = new Map<string, CircuitoParaEletroduto[]>()

  for (const circ of circuitos) {
    const chave = circ.comodo_id ?? 'sem_comodo'
    const lista = grupos.get(chave) ?? []
    lista.push(circ)
    grupos.set(chave, lista)
  }
  return grupos
}

// ── Construir eletrodutos compartilhados do projeto ───────────────
export function buildEletrodutos(
  circuitos: CircuitoParaEletroduto[]
): EletrodutoCompartilhado[] {
  const grupos = agruparCircuitosPorComodo(circuitos)
  const eletrodutos: EletrodutoCompartilhado[] = []

  for (const [comodo_id, circs] of grupos) {
    // Montar lista de cabos para este eletroduto
    const cabos: CaboNoEletroduto[] = circs.map(c => {
      // Condutores: F + N(ou F2) + PE + retorno se ILUM
      const n_cond =
        c.tipo === 'ILUM'        ? 4 :
        c.tipo === 'TUE' && c.n_fases === 3 ? 4 :
        3
      return {
        circuito_id:  c.id,
        descricao:    c.descricao,
        secao_mm2:    c.secao_fase,
        isolacao:     c.isolacao ?? 'PVC',
        n_condutores: n_cond,
      }
    })

    const eletroduto = calcEletroduto(
      `elet-${comodo_id}`,
      cabos,
      `Eletroduto ${comodo_id === 'sem_comodo' ? 'geral' : comodo_id}`,
      comodo_id === 'sem_comodo' ? undefined : comodo_id
    )
    eletrodutos.push(eletroduto)
  }

  return eletrodutos
}

// ── Verificar consistência dos eletrodutos ────────────────────────
export interface AvisoEletroduto {
  eletroduto_id: string
  tipo:          'EXCEDIDO' | 'LIMITE' | 'FA_CRITICO'
  descricao:     string
  acao:          string
}

export function verificarEletrodutos(eletrodutos: EletrodutoCompartilhado[]): AvisoEletroduto[] {
  const avisos: AvisoEletroduto[] = []

  for (const e of eletrodutos) {
    if (e.status_ocupacao === 'EXCEDIDO') {
      avisos.push({
        eletroduto_id: e.id,
        tipo:          'EXCEDIDO',
        descricao:     `Ocupação ${(e.taxa_ocupacao * 100).toFixed(0)}% > ${(e.taxa_maxima * 100).toFixed(0)}% — eletroduto superlotado`,
        acao:          'Aumentar para ⌀' + (e.diametro_mm === 40 ? '50' : e.diametro_mm + 8) + 'mm ou dividir em dois eletrodutos',
      })
    }
    if (e.status_ocupacao === 'LIMITE') {
      avisos.push({
        eletroduto_id: e.id,
        tipo:          'LIMITE',
        descricao:     `Ocupação ${(e.taxa_ocupacao * 100).toFixed(0)}% próxima do limite — sem folga para manutenção`,
        acao:          'Considerar eletroduto ⌀' + (e.diametro_mm + 5) + 'mm para folga de manutenção',
      })
    }
    if (e.fa < 0.7) {
      avisos.push({
        eletroduto_id: e.id,
        tipo:          'FA_CRITICO',
        descricao:     `Fa=${e.fa.toFixed(2)} — ${e.n_circuitos} circuitos agrupados causam redução severa de capacidade`,
        acao:          'Dividir em dois eletrodutos com máximo 6 circuitos cada',
      })
    }
  }

  return avisos
}
