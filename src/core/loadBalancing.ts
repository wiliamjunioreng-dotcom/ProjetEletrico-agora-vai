// src/core/loadBalancing.ts
// ════════════════════════════════════════════════════════════════
// LOAD BALANCING ENGINE
//
// Separação fundamental:
//   InstalacaoEletrica → disponibilidade da infraestrutura
//   CargaEletrica      → requisito do equipamento
//
// São entidades DISTINTAS. A instalação não define a carga.
// A carga não define a instalação. O sistema valida compatibilidade.
//
// A decisão de ligação emerge de critérios técnicos:
//   - corrente resultante (limite do condutor/disjuntor)
//   - tensão disponível (infraestrutura suporta?)
//   - balanceamento atual das fases
//   - queda de tensão (comprimento + corrente)
//   - tipo de carga (motor ≠ resistivo ≠ eletrônico)
//   - padrão da concessionária
//
// NÃO é: if (potencia > 6000) trifasico
// É: motor de decisão com justificativas rastreáveis
// ════════════════════════════════════════════════════════════════

// ── InstalacaoEletrica — disponibilidade de infraestrutura ────────
// O QUE ESTÁ DISPONÍVEL na edificação
export interface InstalacaoEletrica {
  // Padrão de fornecimento
  readonly tipo:         'monofasico' | 'bifasico' | 'trifasico'
  // Tensões disponíveis (fase-neutro e fase-fase)
  readonly tensao_fn_v:  127 | 220    // fase–neutro
  readonly tensao_ff_v:  220 | 380    // fase–fase
  // Fases efetivamente disponíveis no QD
  readonly fases:        ('R'|'S'|'T')[]
  // Neutro disponível para circuitos
  readonly neutro:       boolean
  // Carga atual por fase (para balanceamento)
  readonly carga_fase_va: { R: number; S: number; T: number }
  // Capacidade máxima do alimentador
  readonly cap_alim_a:   number
  // Padrão da concessionária (pode restringir bifásico)
  readonly padrao:       'ANEEL' | 'CEMIG' | 'ENEL' | 'COPEL' | 'OUTRO'
}

// ── CargaEletrica — requisito do equipamento ──────────────────────
// O QUE O EQUIPAMENTO PRECISA
export interface CargaEletrica {
  readonly id?:           string
  readonly descricao:     string
  readonly tipo:          'resistivo' | 'motor' | 'eletronico' | 'luminaria' | 'tomada'
  // Parâmetros elétricos do equipamento
  readonly potencia_va:   number
  readonly fp:            number        // fator de potência (0.6–1.0)
  readonly fases_req:     1 | 2 | 3    // fases que o equipamento exige
  readonly tensao_nom_v:  127 | 220 | 380  // tensão nominal do equipamento
  // Para motores: corrente de partida é maior
  readonly corrente_part_mult?: number  // multiplicador da corrente de partida
  // Comprimento do circuito (afeta queda de tensão)
  readonly comprimento_m: number
}

// ── Resultado da inferência de ligação ────────────────────────────
export interface ResultadoLigacao {
  // Decisão principal
  readonly ligacao:       'monofasica' | 'bifasica' | 'trifasica'
  readonly fases:         ('R'|'S'|'T')[]
  readonly corrente_a:    number
  readonly tensao_v:      number
  // Compatibilidade
  readonly compativel:    boolean
  readonly bloqueios:     string[]   // razões pelas quais é inviável
  // Justificativas da decisão (rastreável)
  readonly justificativas: string[]
  // Avisos (válido mas com ressalvas)
  readonly avisos:        string[]
  // Impacto no balanceamento
  readonly desequilibrio_pct_antes: number
  readonly desequilibrio_pct_depois: number
  readonly melhora_balanceamento:   boolean
}

// ── Motor de inferência de ligação ───────────────────────────────
export function inferirLigacao(
  carga:      CargaEletrica,
  instalacao: InstalacaoEletrica
): ResultadoLigacao {
  const bloqueios:     string[] = []
  const justificativas: string[] = []
  const avisos:        string[] = []

  // ── 1. Verificar compatibilidade de fases disponíveis ─────────
  if (carga.fases_req > instalacao.fases.length) {
    bloqueios.push(
      `Carga exige ${carga.fases_req} fase(s) mas instalação tem apenas ${instalacao.fases.length} — INCOMPATÍVEL`
    )
    return _resultado_bloqueado(bloqueios, instalacao)
  }

  // ── 2. Verificar tensão disponível ────────────────────────────
  const tensao_disponivel_mono  = instalacao.tensao_fn_v
  const tensao_disponivel_bi    = instalacao.tensao_ff_v
  if (carga.tensao_nom_v === 380 && instalacao.tensao_ff_v !== 380) {
    bloqueios.push(`Carga requer 380V mas instalação fornece apenas ${instalacao.tensao_ff_v}V fase-fase`)
    return _resultado_bloqueado(bloqueios, instalacao)
  }
  if (carga.tensao_nom_v === 127 && instalacao.tensao_fn_v !== 127) {
    avisos.push(`Carga é 127V mas instalação tem ${instalacao.tensao_fn_v}V fase-neutro`)
  }

  // ── 3. Calcular corrente monofásica equivalente ───────────────
  const tensao_mono = carga.tensao_nom_v <= 220 ? tensao_disponivel_mono : tensao_disponivel_bi
  const corrente_mono = carga.potencia_va / tensao_mono  // I = P/V

  // ── 4. Decidir ligação ideal ──────────────────────────────────
  let ligacao_ideal: 'monofasica' | 'bifasica' | 'trifasica' = 'monofasica'

  // Motor: sempre conforme especificação do equipamento
  if (carga.tipo === 'motor') {
    ligacao_ideal = carga.fases_req === 3 ? 'trifasica'
                  : carga.fases_req === 2 ? 'bifasica'
                  : 'monofasica'
    justificativas.push(`Motor: ligação conforme especificação do equipamento (${carga.fases_req} fases)`)

    if (carga.corrente_part_mult && corrente_mono * carga.corrente_part_mult > 63) {
      avisos.push(`Corrente de partida estimada: ${(corrente_mono * carga.corrente_part_mult).toFixed(0)}A — verificar relé de sobrecarga`)
    }
  }
  // Resistivo/eletrônico: decidir pela corrente e balanceamento
  else {
    // Critério 0: equipamento exige múltiplas fases
    if (carga.fases_req > 1) {
      const forcar_bi  = carga.fases_req === 2 && instalacao.fases.length >= 2
      const forcar_tri = carga.fases_req === 3 && instalacao.fases.length >= 3
      if (forcar_tri) {
        ligacao_ideal = 'trifasica'
        justificativas.push(`Equipamento exige ${carga.fases_req} fases — ligação trifásica`)
      } else if (forcar_bi) {
        ligacao_ideal = 'bifasica'
        justificativas.push(`Equipamento exige ${carga.fases_req} fases — ligação bifásica`)
      }
    } else {
    // Critério 1: corrente monofásica excessiva
    if (corrente_mono > 40) {
      ligacao_ideal = instalacao.fases.length >= 3 ? 'trifasica' : 'bifasica'
      justificativas.push(`Corrente monofásica ${corrente_mono.toFixed(0)}A > 40A → ligação multipolar necessária`)
    } else if (corrente_mono > 20 && instalacao.fases.length >= 2) {
      ligacao_ideal = 'bifasica'
      justificativas.push(`Corrente monofásica ${corrente_mono.toFixed(0)}A > 20A → bifásico preferível`)
    } else {
      ligacao_ideal = 'monofasica'
      justificativas.push(`Corrente monofásica ${corrente_mono.toFixed(0)}A ≤ 20A → monofásico adequado`)
    }

    }  // fim do bloco fases_req == 1
    // Critério 2: queda de tensão (comprimento × corrente)
    const queda_pct = (corrente_mono * carga.comprimento_m * 0.02) / (tensao_mono / 100)
    if (queda_pct > 4 && ligacao_ideal === 'monofasica' && instalacao.fases.length >= 2) {
      ligacao_ideal = 'bifasica'
      justificativas.push(`Queda estimada ${queda_pct.toFixed(1)}% > 4% → bifásico reduz corrente e queda`)
    }

    // Critério 3: balanceamento global
    const deseq = _desequilibrio(instalacao.carga_fase_va)
    if (deseq > 20 && instalacao.fases.length >= 3 && ligacao_ideal === 'monofasica') {
      avisos.push(`Desequilíbrio atual ${deseq.toFixed(0)}% — considerar redistribuição de fases`)
    }
  }

  // ── 5. Ajustar para o que a instalação suporta ────────────────
  if (ligacao_ideal === 'trifasica' && instalacao.fases.length < 3) {
    ligacao_ideal = 'bifasica'
    avisos.push(`Trifásico desejável mas instalação não tem 3 fases — usando bifásico`)
  }
  if (ligacao_ideal === 'bifasica' && instalacao.fases.length < 2) {
    ligacao_ideal = 'monofasica'
    avisos.push(`Bifásico desejável mas instalação tem apenas 1 fase — usando monofásico`)
  }

  // ── 6. Selecionar fases para melhor balanceamento ─────────────
  const fases_escolhidas = _selecionarFases(ligacao_ideal, instalacao)

  // ── 7. Calcular corrente real e tensão ────────────────────────
  const n_fases = ligacao_ideal === 'trifasica' ? 3 : ligacao_ideal === 'bifasica' ? 2 : 1
  const tensao_real = n_fases > 1 ? tensao_disponivel_bi : tensao_disponivel_mono
  const corrente_real = carga.potencia_va / (tensao_real * (n_fases > 1 ? Math.sqrt(3) : 1))

  // ── 8. Calcular impacto no balanceamento ──────────────────────
  const carga_nova = { ...instalacao.carga_fase_va }
  const carga_por_fase = carga.potencia_va / n_fases
  for (const f of fases_escolhidas) {
    carga_nova[f] = (carga_nova[f] ?? 0) + carga_por_fase
  }
  const deseq_antes  = _desequilibrio(instalacao.carga_fase_va)
  const deseq_depois = _desequilibrio(carga_nova)

  return {
    ligacao:       ligacao_ideal,
    fases:         fases_escolhidas,
    corrente_a:    Math.round(corrente_real * 10) / 10,
    tensao_v:      tensao_real,
    compativel:    bloqueios.length === 0,
    bloqueios,
    justificativas,
    avisos,
    desequilibrio_pct_antes:  Math.round(deseq_antes),
    desequilibrio_pct_depois: Math.round(deseq_depois),
    melhora_balanceamento:    deseq_depois < deseq_antes,
  }
}

// ── Verificar compatibilidade instalação × carga ──────────────────
export function verificarCompatibilidade(
  carga:      CargaEletrica,
  instalacao: InstalacaoEletrica
): { compativel: boolean; bloqueios: string[]; avisos: string[] } {
  const res = inferirLigacao(carga, instalacao)
  return { compativel: res.compativel, bloqueios: res.bloqueios, avisos: res.avisos }
}

// ── Balanceamento automático de múltiplos circuitos ───────────────
export interface PlanoBalanceamento {
  circuito_id:   string
  fase_atual:    'R'|'S'|'T'
  fase_sugerida: 'R'|'S'|'T'
  motivo:        string
}

export function sugerirBalanceamento(
  circuitos: { id: string; fase: 'R'|'S'|'T'; potencia_va: number }[],
  instalacao: InstalacaoEletrica
): { plano: PlanoBalanceamento[]; desequilibrio_antes: number; desequilibrio_depois: number } {
  const carga: Record<'R'|'S'|'T', number> = { R: 0, S: 0, T: 0 }
  for (const c of circuitos) carga[c.fase] = (carga[c.fase] ?? 0) + c.potencia_va

  const deseq_antes = _desequilibrio(carga)

  // Redistribuir: ordenar circuitos por potência desc, atribuir à fase menos carregada
  const plano: PlanoBalanceamento[] = []
  const nova_carga: Record<'R'|'S'|'T', number> = { R: 0, S: 0, T: 0 }

  const circs_sorted = [...circuitos].sort((a, b) => b.potencia_va - a.potencia_va)
  const fases_disp   = instalacao.fases.filter(f => f in nova_carga) as ('R'|'S'|'T')[]

  for (const c of circs_sorted) {
    // Escolher fase com menor carga
    const fase_min = fases_disp.reduce(
      (min, f) => (nova_carga[f] ?? 0) < (nova_carga[min] ?? 0) ? f : min,
      fases_disp[0]
    )
    nova_carga[fase_min] = (nova_carga[fase_min] ?? 0) + c.potencia_va

    if (fase_min !== c.fase) {
      plano.push({
        circuito_id:   c.id,
        fase_atual:    c.fase,
        fase_sugerida: fase_min,
        motivo:        `Fase ${c.fase} mais carregada — mover para ${fase_min} reduz desequilíbrio`,
      })
    }
  }

  return {
    plano,
    desequilibrio_antes:  Math.round(deseq_antes),
    desequilibrio_depois: Math.round(_desequilibrio(nova_carga)),
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function _desequilibrio(carga: { R: number; S: number; T: number }): number {
  const vals = Object.values(carga)
  const media = vals.reduce((s, v) => s + v, 0) / vals.length
  if (media === 0) return 0
  const max_desv = Math.max(...vals.map(v => Math.abs(v - media)))
  return (max_desv / media) * 100
}

function _selecionarFases(
  ligacao:    'monofasica' | 'bifasica' | 'trifasica',
  instalacao: InstalacaoEletrica
): ('R'|'S'|'T')[] {
  if (ligacao === 'trifasica') return instalacao.fases.slice(0, 3) as ('R'|'S'|'T')[]

  // Para mono e bi: escolher fase(s) menos carregadas
  const fases_ord = (instalacao.fases as ('R'|'S'|'T')[])
    .sort((a, b) => (instalacao.carga_fase_va[a] ?? 0) - (instalacao.carga_fase_va[b] ?? 0))

  return ligacao === 'bifasica' ? fases_ord.slice(0, 2) : [fases_ord[0]]
}

function _resultado_bloqueado(
  bloqueios:  string[],
  instalacao: InstalacaoEletrica
): ResultadoLigacao {
  return {
    ligacao: 'monofasica', fases: [instalacao.fases[0] as 'R'|'S'|'T' ?? 'R'],
    corrente_a: 0, tensao_v: instalacao.tensao_fn_v,
    compativel: false, bloqueios, justificativas: [], avisos: [],
    desequilibrio_pct_antes: 0, desequilibrio_pct_depois: 0,
    melhora_balanceamento: false,
  }
}
