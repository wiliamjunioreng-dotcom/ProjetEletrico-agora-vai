// src/core/carga.ts
// ════════════════════════════════════════════════════════════════
// DOMÍNIO DE CARGA ELÉTRICA
//
// Responsabilidade: modelar como cargas reais se traduzem em
// potência de dimensionamento elétrico.
//
// Distinção fundamental:
//   pot_w     = potência ativa real (consumo, conta de energia)
//   pot_va    = potência aparente de dimensionamento (cabo, disjuntor)
//
// FATOR DE DIMENSIONAMENTO:
//   NBR 5410 §6.3 + práticas de projeto para LED/driver
//   Não é constante física — é política de projeto.
//   Deve ser documentado no memorial técnico.
// ════════════════════════════════════════════════════════════════

// ── Origens do fator de dimensionamento ──────────────────────────
// Permite rastrear de onde veio o fator, para auditoria e memorial
export type OrigemFatorDim =
  | 'NBR5410_tabela'    // tabelado pela norma
  | 'fabricante'        // dado pelo fabricante (datasheet)
  | 'medicao'           // medido em campo (analisador de energia)
  | 'estimativa_led'    // estimativa para LED com driver (fp ≈ 0.9, THD ≈ 15%)
  | 'pior_caso'         // conservador — fp = 0.5 (motores small)
  | 'unitario'          // fp = 1.0 (resistivo — chuveiro, aquecedor)

export interface FatorDimensionamento {
  readonly valor:  number         // VA / W — sempre ≥ 1.0
  readonly origem: OrigemFatorDim
  readonly nota:   string         // explicação textual para memorial
}

// ── Fatores padrão do projeto ─────────────────────────────────────
// Referência: ABNT NBR 5410:2004 §6.3 + IEC 61000-3-2 + prática CEMIG
export const FATORES_DIM: Record<string, FatorDimensionamento> = {

  // Iluminação LED com driver (uso geral residencial/comercial)
  // fp ≈ 0.92, THD ≈ 10-20% → VA/W ≈ 1.10-1.25
  // NBR 5410 §9.5.2.1 não especifica fator — usar conservador
  LED_DRIVER: {
    valor:  1.25,
    origem: 'estimativa_led',
    nota:   'LED com driver: fp ≈ 0.92, THD ≈ 15% → VA = W × 1.25 (estimativa conservadora NBR)',
  },

  // Lâmpada incandescente/halógena — carga resistiva
  INCANDESCENTE: {
    valor:  1.0,
    origem: 'unitario',
    nota:   'Carga resistiva pura: fp = 1.0 → VA = W',
  },

  // Tomada de uso geral (TUG) — carga diversa desconhecida
  // NBR 5410 §9.5.2.2 — usar 100VA por tomada
  // fp médio residencial ≈ 0.85-0.95
  TUG_GERAL: {
    valor:  1.0,   // TUG já é declarado em VA diretamente
    origem: 'NBR5410_tabela',
    nota:   'TUG: carga declarada diretamente em VA conforme NBR 5410 §9.5.2.2',
  },

  // Motor monofásico pequeno (ar condicionado < 1 HP)
  MOTOR_PEQUENO: {
    valor:  1.25,
    origem: 'pior_caso',
    nota:   'Motor: fp ≈ 0.80-0.92 → VA = W × 1.25 (conservador)',
  },

  // Chuveiro / aquecedor elétrico — resistivo
  CHUVEIRO: {
    valor:  1.0,
    origem: 'unitario',
    nota:   'Carga resistiva: fp = 1.0 → VA = W',
  },
}

// ── Cálculo da potência de dimensionamento ────────────────────────
// Rastreável: retorna o valor E a origem do fator
export function calcVaDim(
  pot_w: number,
  fator: FatorDimensionamento = FATORES_DIM.LED_DRIVER
): { va: number; fator: FatorDimensionamento } {
  const va = Math.round(pot_w * fator.valor)
  return { va, fator }
}

// ── Calcular total de uma composição de cargas ────────────────────
export interface ItemCarga {
  readonly descricao: string
  readonly qtd:       number
  readonly pot_w:     number        // potência real por unidade
  readonly pot_dim_w?: number       // potência de dimensionamento por unidade (se diferente de pot_w)
  readonly fator?:    FatorDimensionamento
}

export interface TotalCarga {
  readonly va_dim:   number         // VA total de dimensionamento
  readonly w_real:   number         // W total real
  readonly itens:    number         // total de pontos/unidades
  readonly composicao: string       // "2×100VA + 1×60VA"
  readonly fator_efetivo: number    // VA_dim / W_real (média ponderada)
}

export function calcularTotalCarga(itens: ItemCarga[]): TotalCarga {
  if (itens.length === 0) return { va_dim: 0, w_real: 0, itens: 0, composicao: '—', fator_efetivo: 1 }

  let va_dim  = 0
  let w_real  = 0
  let n_total = 0
  const partes: string[] = []

  for (const item of itens) {
    const fator = item.fator ?? FATORES_DIM.LED_DRIVER
    const pot_dim = item.pot_dim_w ?? item.pot_w * fator.valor
    const va_item = Math.round(item.qtd * pot_dim)
    const w_item  = item.qtd * item.pot_w

    va_dim  += va_item
    w_real  += w_item
    n_total += item.qtd

    const tag = item.qtd === 1 ? `${va_item}VA` : `${item.qtd}×${Math.round(pot_dim)}VA`
    partes.push(tag)
  }

  return {
    va_dim:         Math.round(va_dim),
    w_real:         Math.round(w_real),
    itens:          n_total,
    composicao:     partes.join(' + '),
    fator_efetivo:  w_real > 0 ? Math.round(va_dim / w_real * 100) / 100 : 1,
  }
}

// ── Evolução futura: ProdutoEletrico ─────────────────────────────
// LampadaReal está crescendo para além do nome.
// Esta interface documenta o que ela se tornará.
// Por ora: compatível com LampadaReal (superset).
export interface ProdutoEletrico {
  readonly id:           string
  readonly descricao:    string
  readonly fabricante?:  string
  readonly modelo?:      string
  readonly qtd:          number
  readonly pot_w:        number       // potência ativa real
  readonly pot_dim_w?:   number       // potência de dimensionamento
  readonly fator_pot?:   number       // fp real (do datasheet)
  readonly thd_pct?:     number       // distorção harmônica (%)
  readonly fator_dim?:   FatorDimensionamento
  // Fotometria (futura)
  readonly lm_tipico?:   number
  readonly efi_lm_w?:    number       // eficácia (lm/W)
}

// Converter LampadaReal → ProdutoEletrico (compatibilidade)
export function lampadaParaProduto(l: {
  id: string; descricao: string; qtd: number; pot_w: number; pot_dim_w?: number
}): ProdutoEletrico {
  return {
    id: l.id, descricao: l.descricao, qtd: l.qtd,
    pot_w: l.pot_w, pot_dim_w: l.pot_dim_w,
    fator_dim: l.pot_dim_w
      ? { valor: l.pot_dim_w / l.pot_w, origem: 'fabricante', nota: 'Dado pelo projetista' }
      : FATORES_DIM.LED_DRIVER,
  }
}
