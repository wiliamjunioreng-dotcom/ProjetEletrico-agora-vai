// src/core/condutor.ts
// ════════════════════════════════════════════════════════════════
// CONDUTOR CONTÍNUO
//
// Hoje: ConductorSegmento é uma propriedade de cada SegmentoRede.
// Problema: o cabo físico é contínuo e único — passa por vários
//   segmentos, pode ser emendado, pode mudar de seção.
//
// "O cabo é contínuo; o circuito é lógico;
//  a infraestrutura é física; mas o condutor
//  possui continuidade própria."
//
// CondutorContinuo modela a identidade física do cabo:
//   - origem: quadro ou ponto de entrada
//   - destino: ponto de utilização (tomada, lum., interruptor)
//   - segmentos[]: trechos por onde passa (em ordem)
//   - emendas[]: onde é emendado (caixa de passagem)
//   - derivacoes[]: onde uma ponta é conectada a outro condutor
//   - secao_variavel: se a seção muda ao longo do trajeto (redução)
// ════════════════════════════════════════════════════════════════

// ── Tipo de condutor ──────────────────────────────────────────────
export type FuncaoCondutor = 'fase' | 'neutro' | 'terra' | 'retorno' | 'viajante'

// Cores NBR 5410:2004 §6.1.1
export const COR_NBR5410: Record<FuncaoCondutor, string> = {
  fase:      '#111111',  // Preto (ou vermelho/branco para F2/F3)
  neutro:    '#0077cc',  // Azul-claro — exclusivo do neutro
  terra:     '#44aa00',  // Verde/verde-amarelo — exclusivo do PE
  retorno:   '#cc3300',  // Vermelho — retorno de iluminação
  viajante:  '#cc8800',  // Amarelo/laranja — para interruptor paralelo
}

// Cor por fase (RST) para instalações trifásicas
export const COR_FASE: Record<'R'|'S'|'T', string> = {
  R: '#111111',  // Preto
  S: '#cc0000',  // Vermelho
  T: '#ffffff',  // Branco (com marcação)
}

// ── Emenda ────────────────────────────────────────────────────────
// Onde dois condutores físicos são emendados (caixa de passagem)
export interface EmendaCondutor {
  readonly id:              string
  readonly no_id:           string    // NoInfra onde ocorre a emenda
  readonly caixa_id?:       string    // CaixaFisica onde está a emenda
  readonly tipo:            'conector' | 'pressao' | 'solda'
  // Condutor de origem e de destino (podem ter seções diferentes — redução)
  readonly condutor_a_id:   string
  readonly condutor_b_id:   string
}

// ── Derivação de condutor ─────────────────────────────────────────
// Onde o condutor se bifurca (ex: fase que alimenta dois pontos)
export interface DerivacaoCondutor {
  readonly id:              string
  readonly no_id:           string
  readonly condutor_tronco_id: string   // condutor principal
  readonly condutor_ramal_id:  string   // condutor derivado
  readonly caixa_id?:          string
}

// ── Condutor Contínuo ─────────────────────────────────────────────
export interface CondutorContinuo {
  readonly id:            string
  // Identidade elétrica
  readonly circuito_id:   string
  readonly funcao:        FuncaoCondutor
  readonly cor_nbr5410:   string
  // Seção (pode variar ao longo do trajeto via emendas)
  readonly secao_mm2:     number
  readonly isolacao:      'PVC' | 'XLPE' | 'EPR'
  // Trajeto: segmentos por onde passa (IDs de SegmentoRede, em ordem)
  readonly segmento_ids:  readonly string[]
  // Nó de origem e destino
  readonly no_origem_id:  string    // QD, derivação, etc.
  readonly no_destino_id: string    // ponto de utilização
  // Emendas e derivações ao longo do trajeto
  readonly emendas:       readonly EmendaCondutor[]
  readonly derivacoes:    readonly DerivacaoCondutor[]
  // Comprimento total (soma dos segmentos)
  readonly comprimento_m: number
}

// ── Construir condutores de um circuito ───────────────────────────
// Dado o trajeto de segmentos de um circuito, gerar os CondutorContinuo
// com base no tipo de circuito (ILUM → 4 condutores, TUG → 3, etc.)
export interface CircuitoParaCondutores {
  readonly id:         string
  readonly tipo:       string
  readonly secao_mm2:  number
  readonly n_fases:    1 | 2 | 3
  readonly isolacao:   'PVC' | 'XLPE' | 'EPR'
  readonly segmento_ids: string[]   // em ordem do trajeto
  readonly no_origem_id: string
  readonly no_destino_id: string
}

export function buildCondutoresCircuito(
  circ: CircuitoParaCondutores
): CondutorContinuo[] {
  const condutores: CondutorContinuo[] = []
  const { id, tipo, secao_mm2, n_fases, isolacao, segmento_ids } = circ
  const comp_total = segmento_ids.length * 1.0  // simplificação — em prod: soma real

  function condutor(
    funcao: FuncaoCondutor,
    sufixo: string,
    secao = secao_mm2
  ): CondutorContinuo {
    return {
      id:             `${id}-${sufixo}`,
      circuito_id:    id,
      funcao,
      cor_nbr5410:    COR_NBR5410[funcao],
      secao_mm2:      secao,
      isolacao,
      segmento_ids:   segmento_ids,
      no_origem_id:   circ.no_origem_id,
      no_destino_id:  circ.no_destino_id,
      emendas:        [],
      derivacoes:     [],
      comprimento_m:  comp_total,
    }
  }

  // PE (terra) — seção = max(2.5, secao/2) conforme NBR 5410 Tabela 5
  const secao_pe = Math.max(2.5, secao_mm2 / 2)

  switch (tipo.toUpperCase()) {
    case 'ILUM':
      condutores.push(
        condutor('fase',    'F'),
        condutor('neutro',  'N'),
        condutor('retorno', 'RET'),
        condutor('terra',   'PE', secao_pe),
      )
      break
    case 'TUG':
      condutores.push(
        condutor('fase',   'F'),
        condutor('neutro', 'N'),
        condutor('terra',  'PE', secao_pe),
      )
      break
    case 'TUE':
      for (let i = 0; i < n_fases; i++) {
        condutores.push(condutor('fase', `F${i+1}`))
      }
      if (n_fases === 1) condutores.push(condutor('neutro', 'N'))
      condutores.push(condutor('terra', 'PE', secao_pe))
      break
    default:
      condutores.push(
        condutor('fase',   'F'),
        condutor('neutro', 'N'),
        condutor('terra',  'PE', secao_pe),
      )
  }

  return condutores
}

// ── Comprimento real de cabo (condutor × metros) ──────────────────
// O quantitativo de cabo é: comprimento do condutor × 1 (é um condutor)
// Mas para encomenda: arredondar para rolo comercial (100m, 50m, 25m)
export function roloComercial(metros: number): number {
  if (metros <= 25)  return 25
  if (metros <= 50)  return 50
  if (metros <= 100) return 100
  return Math.ceil(metros / 100) * 100
}

// ── Verificar continuidade dos condutores ─────────────────────────
export interface InconsistenciaCondutor {
  readonly tipo:         'SEM_SEGMENTO' | 'SECAO_INVALIDA' | 'COR_ERRADA'
  readonly condutor_id:  string
  readonly descricao:    string
}

export function verificarCondutores(condutores: CondutorContinuo[]): InconsistenciaCondutor[] {
  const problemas: InconsistenciaCondutor[] = []

  for (const c of condutores) {
    if (c.segmento_ids.length === 0) {
      problemas.push({
        tipo: 'SEM_SEGMENTO', condutor_id: c.id,
        descricao: `Condutor ${c.id} sem segmentos de percurso`,
      })
    }
    if (c.secao_mm2 <= 0) {
      problemas.push({
        tipo: 'SECAO_INVALIDA', condutor_id: c.id,
        descricao: `Condutor ${c.id} com seção ${c.secao_mm2}mm² inválida`,
      })
    }
    // Verificar cor NBR 5410
    if (c.funcao === 'neutro' && !c.cor_nbr5410.includes('0077cc')) {
      problemas.push({
        tipo: 'COR_ERRADA', condutor_id: c.id,
        descricao: `Neutro deve ser azul-claro (NBR 5410 §6.1.1)`,
      })
    }
    if (c.funcao === 'terra' && !c.cor_nbr5410.includes('44aa00')) {
      problemas.push({
        tipo: 'COR_ERRADA', condutor_id: c.id,
        descricao: `PE deve ser verde/verde-amarelo (NBR 5410 §6.1.1)`,
      })
    }
  }

  return problemas
}

// ── Resumo de cabos para compra ───────────────────────────────────
export interface ItemCompra {
  readonly descricao:     string   // "Cabo 2.5mm² PVC azul-claro"
  readonly secao_mm2:     number
  readonly cor:           string
  readonly funcao:        FuncaoCondutor
  readonly metros_total:  number
  readonly rolo_sugerido: number
}

export function resumoCompra(condutores: CondutorContinuo[]): ItemCompra[] {
  const mapa = new Map<string, { metros: number; condutor: CondutorContinuo }>()

  for (const c of condutores) {
    const key = `${c.secao_mm2}:${c.cor_nbr5410}:${c.funcao}`
    const ex = mapa.get(key)
    if (ex) {
      mapa.set(key, { ...ex, metros: ex.metros + c.comprimento_m })
    } else {
      mapa.set(key, { metros: c.comprimento_m, condutor: c })
    }
  }

  return [...mapa.entries()].map(([, { metros, condutor }]) => {
    const metros_com_folga = Math.ceil(metros * 1.10)
    return {
      descricao:     `Cabo ${condutor.secao_mm2}mm² ${condutor.isolacao} — ${condutor.funcao}`,
      secao_mm2:     condutor.secao_mm2,
      cor:           condutor.cor_nbr5410,
      funcao:        condutor.funcao,
      metros_total:  metros_com_folga,
      rolo_sugerido: roloComercial(metros_com_folga),
    }
  }).sort((a, b) => a.secao_mm2 - b.secao_mm2 || a.funcao.localeCompare(b.funcao))
}
