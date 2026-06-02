// src/core/protectionCoordination.ts
// ════════════════════════════════════════════════════════════════
// PROTECTION COORDINATION ENGINE
//
// Problema: dispositivos de proteção existem mas não sabemos:
//   - Esse disjuntor aguenta a corrente de curto disponível?
//   - Qual dispositivo atua primeiro (seletividade)?
//   - A proteção está coordenada (sem disparos indevidos)?
//
// Coordenação de proteção = "quem protege quem, em qual ordem"
//
// Princípio de seletividade:
//   Em caso de falta, o dispositivo MAIS PRÓXIMO da falta atua.
//   O dispositivo à montante NÃO deve atuar.
//   Se ambos atuam → sem seletividade → apagão desnecessário.
//
// Referência:
//   NBR 5410 §4.3.3 — proteção contra curto-circuito
//   IEC 60947-2 — capacidade de interrupção (Icu, Ics)
//   NBR IEC 60898-1 — disjuntores residenciais (curvas B/C/D)
// ════════════════════════════════════════════════════════════════

// ── Corrente de curto disponível em um ponto ──────────────────────
export interface PontoCurto {
  readonly id:         string
  readonly descricao:  string        // ex: "barra principal" ou "final circuito C1"
  readonly icc_max_ka: number        // corrente máxima de curto (trifásico)
  readonly icc_min_ka: number        // corrente mínima (fase-terra, pior caso)
  readonly tensao_v:   number
}

// ── Dispositivo de proteção ───────────────────────────────────────
export interface DispositivoProtecao {
  readonly id:           string
  readonly tipo:         'DISJUNTOR' | 'FUSIVEL' | 'DR' | 'DPS'
  readonly corrente_in:  number      // corrente nominal (A)
  readonly curva:        'B'|'C'|'D'|'gG'|'aM'  // curva de atuação
  readonly icu_ka:       number      // capacidade de interrupção última (kA)
  readonly ics_ka?:      number      // capacidade de interrupção de serviço (kA)
  readonly polo:         1|2|3       // número de polos
  // Posição na hierarquia de proteção
  readonly montante_id?: string      // dispositivo à montante (quem o protege)
  readonly jusante_ids:  string[]    // dispositivos à jusante (quem ele protege)
  // Circuito protegido (para dispositivos terminais)
  readonly circuito_id?: string
}

// ── Verificação de capacidade de interrupção ─────────────────────
// Icc disponível no ponto ≤ Icu do dispositivo — se não, o dispositivo
// pode ser destruído antes de interromper a corrente
export interface VerificacaoIcu {
  readonly dispositivo_id: string
  readonly icc_ponto_ka:   number    // corrente de curto no ponto de instalação
  readonly icu_ka:         number    // capacidade de interrupção do dispositivo
  readonly adequado:       boolean   // icc_ponto ≤ icu
  readonly margem_ka:      number    // icu - icc_ponto (positivo = seguro)
  readonly recomendacao?:  string    // se inadequado: qual Icu mínimo usar
}

// ── Verificação de seletividade entre dois dispositivos ───────────
// Dispositivo montante vs dispositivo jusante
// Critérios (simplificado — seletividade total requer curvas I×t):
//   1. In montante ≥ 1.6 × In jusante (afastamento de correntes nominais)
//   2. Icu montante ≥ Icu jusante × 1.2 (montante deve suportar mais)
//   3. Curvas compatíveis (C montante + B jusante = melhor seletividade)
export interface VerificacaoSeletividade {
  readonly montante_id:    string
  readonly jusante_id:     string
  readonly seletivo:       boolean
  readonly tipo:           'TOTAL' | 'PARCIAL' | 'SEM_SELETIVIDADE'
  readonly justificativa:  string    // motivo técnico da decisão
  readonly corrente_limite_a?: number  // até qual corrente há seletividade (parcial)
}

// ── Cascade de proteção ───────────────────────────────────────────
// Sequência de dispositivos do alimentador até o ponto de consumo
export interface CascadeProtecao {
  readonly circuito_id:    string
  readonly dispositivos:   string[]  // IDs em ordem: montante → jusante
  readonly coordenado:     boolean   // todos os pares são seletivos
  readonly problemas:      string[]  // par(es) sem seletividade
}

// ── ProtectionCoordination ────────────────────────────────────────
export interface CoordinacaoProtecao {
  readonly verificacoes_icu:       VerificacaoIcu[]
  readonly verificacoes_selet:     VerificacaoSeletividade[]
  readonly cascades:               CascadeProtecao[]
  readonly dispositivos_inadequados: string[]  // IDs com Icu insuficiente
  readonly pares_sem_seletividade:   string[]  // 'montante_id:jusante_id'
  readonly avisos:                 AvisoCoord[]
}

export interface AvisoCoord {
  readonly tipo:        'ICU_INSUFICIENTE' | 'SEM_SELETIVIDADE' | 'CASCATA_INVERTIDA' | 'DR_SEM_ATERRAMENTO'
  readonly dispositivo_id?: string
  readonly descricao:  string
  readonly severidade: 'erro' | 'aviso'
  readonly referencia: string
}

// ── Calcular Icc ao longo da instalação ──────────────────────────
// Icc no ponto B dado Icc no ponto A e impedância do cabo A→B
// Fórmula simplificada: Icc_B = V / (√3 × (Z_rede + Z_cabo))
export function calcIccPonto(
  icc_fonte_ka: number,   // Icc disponível na fonte (kA)
  tensao_v:     number,   // tensão nominal (V)
  secao_mm2:    number,   // seção do condutor (mm²)
  comprimento_m: number,  // comprimento (m)
  material:     'Cu'|'Al' = 'Cu'
): { icc_max_ka: number; icc_min_ka: number } {
  const rho = material === 'Cu' ? 0.0172 : 0.028  // Ω·mm²/m
  const z_rede = tensao_v / (Math.sqrt(3) * icc_fonte_ka * 1000)  // Ω
  const z_cabo = rho * comprimento_m / secao_mm2  // Ω (resistência por condutor)
  const z_total_max = z_rede + z_cabo * 1  // máximo: cabo frio (menor R)
  const z_total_min = z_rede + z_cabo * 2  // mínimo: cabo quente (R maior) + retorno

  const icc_max = tensao_v / (Math.sqrt(3) * z_total_max) / 1000  // kA
  const icc_min = tensao_v / (Math.sqrt(3) * z_total_min) / 1000  // kA

  return {
    icc_max_ka: Math.round(icc_max * 100) / 100,
    icc_min_ka: Math.round(icc_min * 100) / 100,
  }
}

// ── Verificar capacidade de interrupção ──────────────────────────
export function verificarIcu(
  dispositivo: DispositivoProtecao,
  ponto:       PontoCurto
): VerificacaoIcu {
  const adequado  = ponto.icc_max_ka <= dispositivo.icu_ka
  const margem    = dispositivo.icu_ka - ponto.icc_max_ka
  const recom     = adequado ? undefined
    : `Usar disjuntor com Icu ≥ ${Math.ceil(ponto.icc_max_ka)}kA (disponível: ${ponto.icc_max_ka.toFixed(1)}kA)`

  return {
    dispositivo_id: dispositivo.id,
    icc_ponto_ka:   ponto.icc_max_ka,
    icu_ka:         dispositivo.icu_ka,
    adequado,
    margem_ka:      Math.round(margem * 100) / 100,
    recomendacao:   recom,
  }
}

// ── Verificar seletividade entre dois dispositivos ────────────────
export function verificarSeletividade(
  montante: DispositivoProtecao,
  jusante:  DispositivoProtecao
): VerificacaoSeletividade {
  const justificativas: string[] = []
  let seletivo = true
  let tipo: VerificacaoSeletividade['tipo'] = 'TOTAL'

  // Critério 1: afastamento de correntes nominais
  const ratio_in = montante.corrente_in / jusante.corrente_in
  if (ratio_in < 1.6) {
    seletivo = false
    justificativas.push(`In montante/jusante = ${ratio_in.toFixed(1)} < 1.6 mínimo`)
  }

  // Critério 2: capacidade de interrupção
  if (montante.icu_ka < jusante.icu_ka * 1.2) {
    seletivo = false
    justificativas.push(`Icu montante ${montante.icu_ka}kA < 1.2 × Icu jusante ${(jusante.icu_ka*1.2).toFixed(1)}kA`)
  }

  // Critério 3: curvas (B+C = melhor, C+C = parcial, B+B = marginal)
  const curvas_ok = montante.curva === 'C' && (jusante.curva === 'B' || jusante.curva === 'C')
  if (!curvas_ok && seletivo) {
    tipo = 'PARCIAL'
    justificativas.push(`Curvas ${montante.curva}/${jusante.curva} — seletividade parcial`)
  }

  if (!seletivo) tipo = 'SEM_SELETIVIDADE'

  return {
    montante_id:   montante.id,
    jusante_id:    jusante.id,
    seletivo,
    tipo,
    justificativa: justificativas.join('; ') || 'Seletividade total confirmada',
  }
}

// ── Construir coordenação completa ────────────────────────────────
export function buildCoordinacao(
  dispositivos: DispositivoProtecao[],
  pontos:       Map<string, PontoCurto>  // dispositivo_id → PontoCurto
): CoordinacaoProtecao {
  const verificacoes_icu:    VerificacaoIcu[]           = []
  const verificacoes_selet:  VerificacaoSeletividade[]  = []
  const cascades:            CascadeProtecao[]           = []
  const avisos:              AvisoCoord[]                = []
  const disps_map = new Map(dispositivos.map(d => [d.id, d]))

  // 1. Verificar Icu de cada dispositivo
  for (const d of dispositivos) {
    const ponto = pontos.get(d.id)
    if (!ponto) continue
    const v = verificarIcu(d, ponto)
    verificacoes_icu.push(v)
    if (!v.adequado) {
      avisos.push({
        tipo: 'ICU_INSUFICIENTE', dispositivo_id: d.id, severidade: 'erro',
        descricao: `Disjuntor ${d.corrente_in}A: Icu=${d.icu_ka}kA insuficiente para Icc=${ponto.icc_max_ka.toFixed(1)}kA`,
        referencia: 'NBR 5410 §4.3.3.1 | IEC 60947-2',
      })
    }
  }

  // 2. Verificar seletividade em pares montante-jusante
  for (const d of dispositivos) {
    if (!d.montante_id) continue
    const mont = disps_map.get(d.montante_id)
    if (!mont) continue
    const v = verificarSeletividade(mont, d)
    verificacoes_selet.push(v)
    if (!v.seletivo) {
      avisos.push({
        tipo: 'SEM_SELETIVIDADE', dispositivo_id: d.id, severidade: 'aviso',
        descricao: `Par ${mont.corrente_in}A//${d.corrente_in}A: ${v.justificativa}`,
        referencia: 'NBR 5410 §4.3.4 — Seletividade',
      })
    }
  }

  // 3. Montar cascades por circuito
  const terminais = dispositivos.filter(d => d.circuito_id)
  for (const term of terminais) {
    const chain: string[] = []
    let atual: DispositivoProtecao | undefined = term
    while (atual) {
      chain.unshift(atual.id)
      atual = atual.montante_id ? disps_map.get(atual.montante_id) : undefined
    }

    // Verificar se cada par na cadeia é seletivo
    const probs: string[] = []
    for (let i = 0; i < chain.length - 1; i++) {
      const par_id = `${chain[i]}:${chain[i+1]}`
      const v = verificacoes_selet.find(s => s.montante_id === chain[i] && s.jusante_id === chain[i+1])
      if (v && !v.seletivo) probs.push(par_id)
    }

    cascades.push({
      circuito_id:  term.circuito_id!,
      dispositivos: chain,
      coordenado:   probs.length === 0,
      problemas:    probs,
    })
  }

  return {
    verificacoes_icu,
    verificacoes_selet,
    cascades,
    dispositivos_inadequados: verificacoes_icu.filter(v => !v.adequado).map(v => v.dispositivo_id),
    pares_sem_seletividade:   verificacoes_selet.filter(v => !v.seletivo).map(v => `${v.montante_id}:${v.jusante_id}`),
    avisos,
  }
}
