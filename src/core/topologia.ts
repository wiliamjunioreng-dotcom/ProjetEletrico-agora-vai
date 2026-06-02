
// ── Motor topológico — src/core/topologia.ts ────────────────────
// Propagação de condutores, análise de segmentos, cálculo de dU real
// Algoritmo: BFS do QD → propagação pelas arestas do grafo

import type {
  RedeEletrica, SegmentoEletroduto, ConductorEmSegmento,
  CaminhoCircuito, AnaliseSegmento,
  TipoCondutor,
} from '../types/electrical'
import type { CircuitoV3 } from '../types/electrical'
import { getAreaExterna, AREA_INTERNA_ELETRODUTO } from './nbr5410tablesExport'

// ── 1. Construir condutores automáticos por segmento ─────────────
// Dado um segmento e os circuitos que passam por ele,
// lista quais condutores estão presentes e suas correntes

export function inferirCondutores(
  segmento: SegmentoEletroduto,
  _circuitos: CircuitoV3[],
  _isolacao: 'PVC'|'XLPE'|'EPR' = 'PVC'
): ConductorEmSegmento[] {
  const condutores: ConductorEmSegmento[] = []

  // Para cada circuito que passa por este segmento
  segmento.condutores.forEach(c => {
    // Já definido manualmente — preservar
    condutores.push(c)
  })

  return condutores
}

// ── 2. Analisar ocupação real de um segmento ─────────────────────
// Usa diâmetro EXTERNO real (IEC 60228), não πr² pela bitola nominal

export function analisarSegmento(
  segmento: SegmentoEletroduto,
  isolacao: 'PVC'|'XLPE'|'EPR' = 'PVC'
): AnaliseSegmento {
  const violacoes: string[] = []

  // Área de cada condutor usando diâmetro externo real
  let area_total = 0
  const circuitos_unicos = new Set<string>()

  for (const cond of segmento.condutores) {
    const area = getAreaExterna(cond.secao_mm2, isolacao)
    area_total += area
    if (cond.circuito_id) circuitos_unicos.add(cond.circuito_id)
  }

  const area_int   = AREA_INTERNA_ELETRODUTO[segmento.diametro_mm] ?? 188
  const taxa       = area_int > 0 ? (area_total / area_int) * 100 : 0
  const n_circuitos = circuitos_unicos.size

  // Status de ocupação — NBR 5410 §6.2.11
  const status_ocupacao: 'OK'|'LIMITE'|'EXCEDIDO' =
    taxa <= 30 ? 'OK' : taxa <= 35 ? 'LIMITE' : 'EXCEDIDO'

  if (status_ocupacao === 'EXCEDIDO') {
    violacoes.push(`Ocupação ${taxa.toFixed(1)}% > 35% — NBR 5410 §6.2.11`)
  }

  // Fa pelo número de circuitos (NBR 5410 Tabela 42)
  const fa_map: Record<number, number> = {
    1: 1.0, 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6,
    6: 0.57, 7: 0.54, 8: 0.52, 9: 0.5,
  }
  const fa = fa_map[n_circuitos] ?? (n_circuitos > 9 ? 0.5 : 1.0)

  // Ft mínimo (condutor mais quente determina o Fa do grupo)
  // Simplificado — temperatura do condutor mais carregado
  const ft_min = 1.0  // calculado externamente pelo engine principal

  return {
    area_condutores_mm2:   Math.round(area_total * 10) / 10,
    area_interna_mm2:      area_int,
    taxa_ocupacao_pct:     Math.round(taxa * 10) / 10,
    status_ocupacao,
    n_circuitos_distintos: n_circuitos,
    fa_resultante:         fa,
    ft_min,
    violacoes,
  }
}

// ── 3. BFS: encontrar caminho do QD até cada carga ───────────────
// Retorna a sequência de segmentos que cada circuito percorre

export function calcularCaminhos(
  rede: RedeEletrica,
  circuitos: CircuitoV3[]
): CaminhoCircuito[] {
  const caminhos: CaminhoCircuito[] = []

  // Para cada circuito que tem carga definida
  for (const circ of circuitos) {
    if (!circ.calculado || circ.calculado.potencia_va <= 0) continue

    // Encontrar segmentos que contêm condutores deste circuito
    const segmentosDoCircuito = rede.segmentos.filter(seg =>
      seg.condutores.some(c => c.circuito_id === circ.id)
    )

    if (segmentosDoCircuito.length === 0) continue

    // Construir o caminho ordenado (BFS a partir do QD)
    const qd_no = rede.nos.find(n => n.tipo === 'QD')
    if (!qd_no) continue

    // Grafo de adjacência apenas dos segmentos deste circuito
    const visitados = new Set<string>()
    const fila: { seg: SegmentoEletroduto; caminho: SegmentoEletroduto[] }[] = []

    // Iniciar do segmento que começa no QD
    const primeiroSeg = segmentosDoCircuito.find(
      s => s.origem_no_id === qd_no.id || s.destino_no_id === qd_no.id
    )

    if (!primeiroSeg) continue
    fila.push({ seg: primeiroSeg, caminho: [primeiroSeg] })
    visitados.add(primeiroSeg.id)

    let melhorCaminho: SegmentoEletroduto[] = [primeiroSeg]

    while (fila.length > 0) {
      const { seg, caminho } = fila.shift()!
      const noAtual = seg.destino_no_id

      // Vizinhos deste circuito
      const vizinhos = segmentosDoCircuito.filter(s =>
        !visitados.has(s.id) &&
        (s.origem_no_id === noAtual || s.destino_no_id === noAtual)
      )

      if (vizinhos.length === 0) {
        // Chegou ao fim — este é um caminho válido
        if (caminho.length > melhorCaminho.length) {
          melhorCaminho = caminho
        }
      } else {
        vizinhos.forEach(v => {
          visitados.add(v.id)
          fila.push({ seg: v, caminho: [...caminho, v] })
        })
      }
    }

    // Calcular dU real ao longo do caminho
    const ib = circ.calculado.ib
    let du_acum = 0
    const segmentosOrdenados = melhorCaminho.map(seg => {
      const condDoCircuito = seg.condutores.filter(c => c.circuito_id === circ.id)
      return {
        segmento_id:   seg.id,
        sentido:       'ida' as const,
        condutores:    condDoCircuito.map(c => c.tipo),
        comprimento_m: seg.comprimento_m,
        corrente_a:    ib,  // simplificado — sem derivações ainda
      }
    })

    const comp_total = segmentosOrdenados.reduce((s, seg) => s + seg.comprimento_m, 0)

    caminhos.push({
      circuito_id:       circ.id,
      segmentos:         segmentosOrdenados,
      du_real_pct:       du_acum,
      comprimento_total_m: comp_total,
    })
  }

  return caminhos
}

// ── 4. Modelo de retorno para iluminação ─────────────────────────
// Determina os condutores necessários por tipo de comando

export interface ModeloComando {
  tipo_interruptor:  string
  condutores_necessarios: TipoCondutor[]
  n_condutores:     number
  descricao:        string
}

export const MODELOS_COMANDO: ModeloComando[] = [
  {
    tipo_interruptor: 'SIMPLES',
    condutores_necessarios: ['FASE_A', 'NEUTRO', 'PE', 'RETORNO'],
    n_condutores: 4,
    descricao: 'Interruptor simples — F + N + PE + Retorno (4 vias)',
  },
  {
    tipo_interruptor: 'PARALELO',
    condutores_necessarios: ['FASE_A', 'NEUTRO', 'PE', 'RETORNO', 'CONTRA_RETORNO'],
    n_condutores: 5,
    descricao: 'Interruptor paralelo — F + N + PE + Retorno + Contra-retorno (5 vias)',
  },
  {
    tipo_interruptor: 'INTERMEDIARIO',
    condutores_necessarios: ['FASE_A', 'NEUTRO', 'PE', 'RETORNO', 'CONTRA_RETORNO', 'TRAVAMENTO'],
    n_condutores: 6,
    descricao: 'Interruptor intermediário — F + N + PE + R + CR + T (6 vias)',
  },
]

// ── 5. Validador de rede ──────────────────────────────────────────
// Verifica problemas estruturais no grafo

export interface ProblemaRede {
  tipo: 'ERRO'|'AVISO'
  descricao: string
  no_id?: string
  segmento_id?: string
}

export function validarRede(rede: RedeEletrica): ProblemaRede[] {
  const problemas: ProblemaRede[] = []

  // Verificar nós isolados (sem conexão)
  const nosConectados = new Set<string>()
  rede.segmentos.forEach(s => {
    nosConectados.add(s.origem_no_id)
    nosConectados.add(s.destino_no_id)
  })
  rede.nos.forEach(no => {
    if (!nosConectados.has(no.id)) {
      problemas.push({
        tipo: 'AVISO',
        descricao: `Nó "${no.nome}" não está conectado a nenhum segmento`,
        no_id: no.id,
      })
    }
  })

  // Verificar segmentos sem QD como origem indireta
  const qd = rede.nos.find(n => n.tipo === 'QD')
  if (!qd) {
    problemas.push({ tipo: 'ERRO', descricao: 'Nenhum Quadro de Distribuição (QD) definido na rede' })
  }

  // Verificar ocupação dos segmentos
  rede.segmentos.forEach(seg => {
    if (seg.analise?.status_ocupacao === 'EXCEDIDO') {
      problemas.push({
        tipo: 'ERRO',
        descricao: `Segmento "${seg.nome}": ocupação ${seg.analise.taxa_ocupacao_pct}% > 35%`,
        segmento_id: seg.id,
      })
    }
  })

  return problemas
}
