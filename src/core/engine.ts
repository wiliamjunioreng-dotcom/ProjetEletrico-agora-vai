import { inferirCurva, FATOR_K } from './protectionDevicePhysics'
// Regras NBR validadas via pipeline.ts → core/rules/index.ts (validarCircuito)
// src/core/engine.ts
// Motor de cálculo elétrico — física pura + auditoria normativa

import {
  getIz, getFt, getFa, getFaEnterrado, getFsolo, getFatorHarmonica, getSecaoPE, getSecaoMinimaPorIz,
  getSecaoMinima, getFatorManutencao, getDisjuntor, getIDR, getFatorDemandaCEMIG,
  getReservasQD, getTamanhoQD, getTipoLigacaoCEMIG, POT_TOMADA
} from '../data/nbr5410tables'
import type {
  NormViolation, DemandaResult, FaseType
} from '../types/electrical'

// ── Constantes físicas ───────────────────────────────────────────
const RHO_CU = 0.0172   // Ω·mm²/m a 20°C
const RHO_AL = 0.0282
const ALPHA_CU = 0.00393

// ── Tensão do circuito conforme fase ────────────────────────────
export function getTensaoCircuito(fase: FaseType, v_fase: number): number {
  const v_linha = Math.round(v_fase * Math.sqrt(3))  // √3 correto
  if (['R','S','T'].includes(fase)) return v_fase
  return v_linha
}

// ── Número de condutores carregados ─────────────────────────────
export function getNCond(fase: FaseType): 2 | 3 {
  return ['R','S','T'].includes(fase) ? 2 : 3
}

// ── Número de fases (para cálculo dU) ───────────────────────────
export function getNFases(fase: FaseType): 1 | 2 | 3 {
  if (['R','S','T'].includes(fase)) return 1
  if (['RS','ST','RT'].includes(fase)) return 2
  return 3
}

// ── Corrente de projeto Ib ───────────────────────────────────────
export function calcIb(potencia_va: number, tensao_v: number): number {
  if (tensao_v <= 0) return 0
  return potencia_va / tensao_v
}

// ── Queda de tensão ΔU% ─────────────────────────────────────────
export function calcDeltaU(
  ib: number,
  comprimento_m: number,
  secao_mm2: number,
  tensao_v: number,
  n_fases: 1 | 2 | 3,
  material: 'Cu' | 'Al' = 'Cu',
  t_conductor = 70
): number {
  if (secao_mm2 <= 0 || tensao_v <= 0 || comprimento_m <= 0) return 0
  const rho_20 = material === 'Cu' ? RHO_CU : RHO_AL
  const rho_t  = rho_20 * (1 + ALPHA_CU * (t_conductor - 20))
  // Fórmulas NBR 5410 item 6.2.7 (Anexo C informativo)
  // BUG CRÍTICO CORRIGIDO: bifásico (F-F, sem neutro — ex: chuveiro/
  // ar-condicionado 220V tirado de duas fases 127V) é um circuito de
  // 2 CONDUTORES — fisicamente idêntico ao monofásico para fins de
  // queda de tensão (corrente vai por um condutor, volta pelo outro:
  // fator 2). O fator √3 só é válido para circuitos TRIFÁSICOS reais
  // (3 condutores, carga equilibrada nas 3 fases). Usar √3 (≈1,732)
  // em vez de 2 SUBESTIMA a queda real em ~13,4% — podendo aprovar
  // como conforme um circuito que na prática excede o limite de 4%/7%
  // da NBR 5410. Isso afetava TODOS os circuitos bifásicos do sistema
  // (chuveiro, ar-condicionado — os TUE mais comuns no Brasil).
  // A função getVAkm() logo abaixo já tinha a fórmula correta
  // (fator 2 para n_fases=2), confirmando que isto era de fato um bug.
  if (n_fases === 3) {
    // Trifásico: ΔU = √3 × ρ × L × Ib / (S × VL)
    return (Math.sqrt(3) * rho_t * comprimento_m * ib) / (secao_mm2 * tensao_v) * 100
  }
  // Monofásico (F-N) e Bifásico (F-F): ambos 2 condutores → fator 2
  return (2 * rho_t * comprimento_m * ib) / (secao_mm2 * tensao_v) * 100
}

// ── V/A·km ──────────────────────────────────────────────────────
export function getVAkm(secao_mm2: number, n_fases: 1|2|3, material: 'Cu'|'Al' = 'Cu'): number {
  const rho = material === 'Cu' ? RHO_CU : RHO_AL
  const rho_t = rho * (1 + ALPHA_CU * 50) // 70°C operação
  const fator = n_fases === 3 ? Math.sqrt(3) : 2
  return (fator * rho_t * 1000) / secao_mm2
}

// ── Detecção de área molhada ─────────────────────────────────────
// Detecção de área molhada — implementação centralizada em areaMolhada.ts
import { ehAreaMolhada } from './areaMolhada'
export { ehAreaMolhada }

// Fs não aplicado no dimensionamento de cabos — NBR 5410 item 6.2.1

// ── Motor principal: dimensionar um circuito ────────────────────
export interface CircuitInput {
  id: string
  descricao: string
  potencia_va: number
  potencia_real_w?: number  // W real instalados (LED real)
  fase: FaseType
  comprimento_m: number
  n_agrup: number
  tipo: string
  // Parâmetros do projeto
  v_fase: number
  metodo: string
  isolacao: 'PVC' | 'XLPE' | 'EPR'
  material: 'Cu' | 'Al'
  t_amb: number
  du_max: number
  du_ramal: number
  icc_rede_ka?: number
  // Preset de cliente/escritório — piso adicional acima do normativo,
  // nunca abaixo (Math.max com o piso da norma sempre aplicado)
  secao_minima_preset_mm2?: number
  // Resistividade térmica do solo (K.m/W) — só relevante para métodos
  // enterrados D1/D2 (NBR 5410 Tabela 41). Se omitido, assume o padrão
  // normativo 2,5 K.m/W (Fsolo = 1,0, sem correção).
  resistividade_solo_km_w?: number
  // Tipo do cômodo de origem — permite ehAreaMolhada() detectar área
  // molhada pelo LOCAL, não só pelo texto da descrição (cobre TUE com
  // descrição customizada que não menciona o cômodo nem bate com
  // palavra-chave de equipamento — ex: "Máquina de lavar" numa
  // Lavanderia real, que sem isso perdia o DR obrigatório).
  comodo_tipo?: string
  // Taxa de 3ª harmônica (%) — §6.2.5.6.1. Só relevante para circuitos
  // trifásicos com neutro (fase RST) alimentando carga concentrada de
  // eletrônica/LED. DECLARADA pelo engenheiro; acima de 15%, aplica
  // fator 0,86 sobre Iz efetiva. Se omitido, sem correção.
  terceira_harmonica_pct?: number
  // Tabela 45 — só relevante para métodos enterrados (D1/D2) quando os
  // circuitos estão em DUTOS SEPARADOS no solo (não compartilhando o
  // mesmo eletroduto — esse caso já é coberto por n_agrup + Tabela 42).
  // Se declarado, substitui o cálculo de Fa padrão pela matriz de
  // agrupamento enterrado por distância. Se omitido em método D1/D2,
  // assume o comportamento conservador padrão (Tabela 42, como se
  // agrupado no mesmo duto).
  tipo_condutor_enterrado?: 'multipolar' | 'unipolar'
  distancia_dutos_m?: number
  // Override do engenheiro (decisão travada, sistema respeita)
  override_secao_mm2?: number
  override_in_disj?: number
  override_curva?: 'B'|'C'|'D'
  override_motivo?: string
}

export interface CircuitResult {
  id: string
  descricao: string
  tipo: string
  fase: FaseType
  tensao_v: number
  potencia_va: number
  potencia_real_w?: number  // W real instalados (LED real)
  fp: number
  ib: number
  ft: number
  fa: number
  fs: number
  ib_corr: number
  irc: number
  secao_fase: number
  secao_neutro: number
  secao_pe: number
  iz_nominal: number
  iz_efetiva: number
  in_disj: number
  curva: string
  curva_adequada?: boolean
  justificativa_curva?: string
  comprimento_max_m?: number
  fator_seguranca?: number
  idr: boolean
  idr_in: number
  du_calc: number
  du_acum: number
  v_a_km: number
  dist_km: number
  status: 'OK' | 'LIMITE' | 'ERRO' | 'SEM_DADOS'
  violacoes: NormViolation[]
  log: string
  // Indica se algum campo foi travado pelo engenheiro
  override_ativo?: boolean
  override_motivo?: string
}

export function dimensionarCircuito(e: CircuitInput): CircuitResult {
  const r: CircuitResult = {
    id: e.id, descricao: e.descricao, tipo: e.tipo,
    fase: e.fase, tensao_v: 0, potencia_va: e.potencia_va,
    fp: 0.92, ib: 0, ft: 1, fa: 1, fs: 1,
    ib_corr: 0, irc: 0,
    secao_fase: 0, secao_neutro: 0, secao_pe: 0,
    iz_nominal: 0, iz_efetiva: 0,
    in_disj: 0, curva: 'C',
    idr: false, idr_in: 0,
    potencia_real_w: e.potencia_real_w,
    du_calc: 0, du_acum: 0, v_a_km: 0, dist_km: e.comprimento_m / 1000,
    status: 'SEM_DADOS', violacoes: [], log: '',
  }

  if (!e.potencia_va || e.potencia_va <= 0) return r

  const metodo = e.metodo as any
  const n_cond = getNCond(e.fase)
  const n_fases = getNFases(e.fase)

  // 1. Tensão
  r.tensao_v = getTensaoCircuito(e.fase, e.v_fase)

  // 2. Ib
  r.ib = calcIb(e.potencia_va, r.tensao_v)

  // 3. Fatores de correção (NBR 5410 Tabelas 40 e 42)
  r.ft = getFt(e.t_amb, e.isolacao)
  // Fa: Tabela 42 (agrupamento no mesmo duto) por padrão. Para métodos
  // enterrados (D1/D2) com dutos SEPARADOS declarados explicitamente,
  // usa a Tabela 45 (agrupamento enterrado por distância) em vez —
  // cenário fisicamente diferente e menos penalizante que dividir o
  // mesmo eletroduto.
  const metodoEnterrado = e.metodo === 'D1' || e.metodo === 'D2'
  const usaTabela45 = metodoEnterrado && e.tipo_condutor_enterrado !== undefined && e.distancia_dutos_m !== undefined
  r.fa = usaTabela45
    ? getFaEnterrado(e.tipo_condutor_enterrado!, e.n_agrup, e.distancia_dutos_m!)
    : getFa(e.n_agrup)
  // Tabela 41 — correção por resistividade térmica do solo, só ativa
  // para métodos enterrados (D1/D2); retorna 1.0 para os demais e
  // quando não informado (assume padrão normativo 2,5 K.m/W)
  const fsolo = getFsolo(e.resistividade_solo_km_w ?? 2.5, e.metodo as any)
  // §6.2.5.6.1 — fator 0,86 quando 3ª harmônica > 15% em trifásico c/ neutro
  const fHarmonica = getFatorHarmonica(e.terceira_harmonica_pct, e.fase)
  // Fs NÃO é usado para dimensionar o cabo — só para previsão de carga total
  // O cabo deve suportar a corrente máxima do circuito (NBR 5410 item 6.2.1)
  r.fs = 1.0
  r.ib_corr = r.ib  // sem Fs no dimensionamento

  // 4. Corrente de referência para seleção do cabo: Irc = Ib / (Ft × Fa)
  const divisor = r.fa * r.ft
  r.irc = divisor > 0 ? r.ib / divisor : r.ib

  // 5. Seção mínima normativa — Tabela 47 (Cobre: 1,5 ILUM / 2,5 força |
  // Alumínio: piso mecânico único de 16mm² independente do tipo)
  const sec_min_norma_base = getSecaoMinima(e.tipo, e.material)
  // Preset do cliente/escritório só pode SUBIR o piso, nunca descer —
  // Math.max garante que a norma continua sendo o mínimo absoluto
  // mesmo que o preset seja menor (ex: preset mal configurado em 1mm²
  // não enfraquece o piso normativo de 1,5/2,5mm²)
  const sec_min_norma = Math.max(sec_min_norma_base, e.secao_minima_preset_mm2 ?? 0)

  // 6. Seção por Iz
  const sec_iz = getSecaoMinimaPorIz(r.irc, metodo, n_cond, e.material, e.isolacao)
  let sec = Math.max(sec_min_norma, sec_iz)

  // 7. Verificar dU — subir seção se necessário
  const du_disp = Math.max(0.5, e.du_max - e.du_ramal)
  if (e.comprimento_m > 0) {
    const SECOES = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240]
    for (let i = 0; i < 12; i++) {
      r.du_calc = calcDeltaU(r.ib, e.comprimento_m, sec, r.tensao_v, n_fases, e.material)
      if (r.du_calc <= du_disp || sec >= 240) break
      const idx = SECOES.indexOf(sec)
      if (idx >= 0 && idx < SECOES.length - 1) sec = SECOES[idx + 1]
      else break
    }
  }

  r.secao_fase   = sec
  r.secao_neutro = sec
  r.secao_pe     = getSecaoPE(sec)
  r.iz_nominal   = getIz(sec, metodo, n_cond, e.material, e.isolacao)
  r.iz_efetiva   = r.iz_nominal * r.ft * r.fa * fsolo * fHarmonica

  // 8. Disjuntor
  r.in_disj = getDisjuntor(r.ib_corr)

  // 8b. Verificação de tripartida: In <= Iz' (NBR 5410 §5.1.3.1)
  // Quando o disjuntor escolhido (próximo passo padrão acima de Ib) excede
  // a capacidade EFETIVA do cabo após fatores de agrupamento/temperatura,
  // a seção precisa subir — senão o disjuntor não protege o cabo contra
  // sobrecarga (risco de incêndio). Mesma lógica de escalonamento usada
  // para ΔU, aplicada aqui para a tripartida.
  {
    const SECOES_TRIP = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240]
    let tentativas = 0
    while (r.in_disj > r.iz_efetiva && tentativas < 12) {
      const idx = SECOES_TRIP.indexOf(sec)
      if (idx < 0 || idx >= SECOES_TRIP.length - 1) break
      sec = SECOES_TRIP[idx + 1]
      r.secao_fase   = sec
      r.secao_neutro = sec
      r.secao_pe     = getSecaoPE(sec)
      r.iz_nominal   = getIz(sec, metodo, n_cond, e.material, e.isolacao)
      r.iz_efetiva   = r.iz_nominal * r.ft * r.fa * fsolo * fHarmonica
      tentativas++
    }
    // BUG CORRIGIDO: quando a tripartida força a seção a subir MAIS do
    // que o laço de ΔU já tinha exigido, r.du_calc ficava PARADO no
    // valor calculado para a seção menor anterior — nunca era
    // recalculado com a seção final maior. Como seção maior sempre dá
    // ΔU menor, isso fazia o app reportar um ΔU% PIOR do que o real
    // (podendo até marcar "EXCEDE" um circuito que na seção final
    // adotada estava, na verdade, conforme). Achado construindo a
    // planilha de auditoria com fórmulas — o Excel usa a seção final
    // corretamente, o valor armazenado aqui não usava.
    if (tentativas > 0 && e.comprimento_m > 0) {
      r.du_calc = calcDeltaU(r.ib, e.comprimento_m, sec, r.tensao_v, n_fases, e.material)
    }
  }

  const sug = inferirCurva(e.tipo, e.descricao?.toLowerCase())
  r.curva   = sug.curva as string

  // ── Override do engenheiro ────────────────────────────────────
  // Aplicado APÓS cálculo automático — trava os campos solicitados
  if (e.override_secao_mm2) {
    r.secao_fase = e.override_secao_mm2
    r.secao_neutro = e.override_secao_mm2
    r.override_ativo = true
  }
  if (e.override_in_disj) {
    r.in_disj = e.override_in_disj
    r.override_ativo = true
  }
  if (e.override_curva) {
    r.curva = e.override_curva
    r.override_ativo = true
  }
  if (e.override_motivo) r.override_motivo = e.override_motivo

  // 9. IDR
  r.idr    = ehAreaMolhada(e.descricao, e.comodo_tipo, e.tipo)
  r.idr_in = r.idr ? getIDR(r.in_disj) : 0

  // 10. V/A·km e distância
  r.v_a_km = getVAkm(sec, n_fases, e.material)

  // 11. Auditoria normativa — violações
  const violacoes: NormViolation[] = []

  // Tripartida Ib ≤ In ≤ Iz'
  if (r.in_disj > r.iz_efetiva && r.iz_efetiva > 0) {
    violacoes.push({
      codigo: 'NBR5410_513',
      descricao: `In(${r.in_disj}A) > Iz'(${r.iz_efetiva.toFixed(1)}A) — tripartida violada`,
      norma: 'NBR 5410:2004 item 5.1.3.1',
      severidade: 'erro_bloqueante',
      valor_calculado: r.in_disj,
      valor_limite: r.iz_efetiva,
    })
  }
  if (r.ib > r.in_disj) {
    violacoes.push({
      codigo: 'NBR5410_513_IB',
      descricao: `Ib(${r.ib.toFixed(2)}A) > In(${r.in_disj}A)`,
      norma: 'NBR 5410:2004 item 5.1.3.1',
      severidade: 'erro_bloqueante',
      valor_calculado: r.ib,
      valor_limite: r.in_disj,
    })
  }

  // Seção mínima
  if (sec < sec_min_norma) {
    violacoes.push({
      codigo: 'NBR5410_625',
      descricao: `Seção ${sec}mm² abaixo do mínimo (${sec_min_norma}mm²) para ${e.tipo}`,
      norma: 'NBR 5410:2004 item 6.2.5',
      severidade: 'erro_bloqueante',
      valor_calculado: sec,
      valor_limite: sec_min_norma,
    })
  }

  // dU
  if (r.du_calc > e.du_max) {
    violacoes.push({
      codigo: 'NBR5410_627',
      descricao: `ΔU=${r.du_calc.toFixed(2)}% excede máximo (${e.du_max}%)`,
      norma: 'NBR 5410:2004 item 6.2.7.2',
      severidade: 'erro_bloqueante',
      valor_calculado: r.du_calc,
      valor_limite: e.du_max,
    })
  } else if (r.du_calc > du_disp * 0.9) {
    violacoes.push({
      codigo: 'NBR5410_627_AVISO',
      descricao: `ΔU=${r.du_calc.toFixed(2)}% próximo do limite`,
      norma: 'NBR 5410:2004 item 6.2.7.2',
      severidade: 'aviso',
      valor_calculado: r.du_calc,
      valor_limite: du_disp,
    })
  }

  // IDR obrigatório
  if (r.idr && r.idr_in === 0) {
    violacoes.push({
      codigo: 'NBR5410_5136',
      descricao: 'IDR 30mA obrigatório não configurado',
      norma: 'NBR 5410:2004 item 5.1.3.6.1',
      severidade: 'erro_bloqueante',
    })
  }

  r.violacoes = violacoes

  // 12. Status
  // NBR 5410 §9.5.2.2 — TUG com 2,5mm²: Ib > 10A → sugerir desmembramento
  // A norma limita a corrente por tomada, não o número de pontos
  if (e.tipo === 'TUG' && r.ib > 10 && sec <= 2.5) {
    violacoes.push({
      codigo: 'NBR5410_9522_SPLIT',
      descricao: `Ib=${r.ib.toFixed(1)}A > 10A em TUG 2,5mm² — considerar desmembrar em dois circuitos`,
      norma: 'NBR 5410:2004 item 9.5.2.2',
      severidade: 'aviso',
      valor_calculado: r.ib,
      valor_limite: 10,
    })
  }

  // NBR 5410 §9.5.3.3 — Mistura ILUM+TUG só permitida se Ib ≤ 16A em habitações
  // Detectar pelo prefixo da descrição
  const descNorm = e.descricao.toUpperCase()
  const temIlum  = descNorm.includes('ILUM') && descNorm.includes('TUG')
  if (temIlum && r.ib > 16) {
    violacoes.push({
      codigo: 'NBR5410_9533',
      descricao: `Mistura ILUM+TUG com Ib=${r.ib.toFixed(1)}A > 16A — §9.5.3.3 exige circuitos separados`,
      norma: 'NBR 5410:2004 item 9.5.3.3',
      severidade: 'erro_bloqueante',
      valor_calculado: r.ib,
      valor_limite: 16,
    })
  }

  const temErro = violacoes.some(v => v.severidade === 'erro_bloqueante')
  const temAviso = violacoes.some(v => v.severidade === 'aviso')
  if (temErro) r.status = 'ERRO'
  else if (temAviso) r.status = 'LIMITE'
  else if (e.comprimento_m === 0) r.status = 'OK'
  else r.status = 'OK'

  // 13. Log de engenharia
  r.log = [
    `Ib=${r.ib.toFixed(2)}A`,
    `Irc=${r.irc.toFixed(2)}A`,
    `Iz'=${r.iz_efetiva.toFixed(1)}A`,
    `Sec=${sec}mm²`,
    `In=${r.in_disj}A`,
    r.du_calc > 0 ? `dU=${r.du_calc.toFixed(3)}%` : null,
    r.idr ? `IDR ${r.idr_in}A/30mA` : null,
  ].filter(Boolean).join(' | ')

  return r
}

// ── Demanda do projeto ───────────────────────────────────────────
export function calcularDemanda(
  circuitos: CircuitResult[],
  v_fase: number,
  fp = 0.92,
  sistema: 'Monofasico' | 'Bifasico' | 'Trifasico' = 'Bifasico'
): DemandaResult {
  const ci = circuitos.filter(c => c.potencia_va > 0)
  const va_total = ci.reduce((s, c) => s + c.potencia_va, 0)
  const ci_kw    = va_total / 1000
  const fd       = getFatorDemandaCEMIG(ci_kw)
  const dem_kw   = ci_kw * fd
  // Corrente de demanda — divisor depende do número de fases.
  // BUG CORRIGIDO: antes usava sempre (2 × v_fase), correto só para
  // bifásico. Resultava em disjuntor geral SUPERDIMENSIONADO (~50%
  // a mais) em projetos trifásicos, e em erro (subdimensionado) em
  // monofásicos puros.
  //   Monofásico: I = S / V_fase
  //   Bifásico:   I = S / (2 × V_fase)   — duas fases sem referência comum
  //   Trifásico:  I = S / (√3 × V_linha) = S / (3 × V_fase)  [balanceado]
  const divisor_tensao =
    sistema === 'Monofasico' ? v_fase :
    sistema === 'Trifasico'  ? 3 * v_fase :
    2 * v_fase  // Bifasico (padrão/fallback)
  const i_dem    = (dem_kw * 1000 / fp) / divisor_tensao
  const in_geral = getDisjuntor(i_dem * 1.1)
  const tipo_lig = getTipoLigacaoCEMIG(dem_kw, v_fase)
  const n_at     = ci.length
  const n_res    = getReservasQD(n_at)
  const n_qd     = getTamanhoQD(n_at + n_res)

  return {
    ci_kw: Math.round(ci_kw * 1000) / 1000,
    fd:    Math.round(fd * 1000) / 1000,
    dem_kw: Math.round(dem_kw * 1000) / 1000,
    i_dem:  Math.round(i_dem * 100) / 100,
    in_geral,
    tipo_ligacao_cemig: tipo_lig.tipo,
    ramal_min_mm2: tipo_lig.ramal_mm2,
    n_ativos:    n_at,
    n_reservas:  n_res,
    n_total_qd:  n_qd,
  }
}

// ── Calcular ILUM por cômodo — NBR 5410 item 9.5.2.1 ────────────
export function calcIlumComodo(area_m2: number): number {
  if (area_m2 <= 0) return 0
  if (area_m2 <= 6) return 100
  // §9.5.2.1.2: 100 VA para os primeiros 6 m², acrescidos de 60 VA
  // para cada aumento de 4 m² INTEIROS — logo floor, não ceil.
  // BUG CORRIGIDO: ceil superdimensionava até 60 VA por cômodo
  // (ex.: 16 m² → norma 220 VA; antes o código dava 280 VA).
  return 100 + Math.floor((area_m2 - 6) / 4) * 60
}

// ── Calcular TUG por cômodo — NBR 5410 §9.5.2.2 ─────────────────
// Tipos com regra própria (quantidade E potência):
//   Banheiro:                mín. 1 tomada (junto ao lavatório) — 600 VA
//   Cozinha/Copa/Lavanderia/
//   Área de serviço:         1 tomada a cada 3,5 m OU FRAÇÃO de
//                            perímetro; potência 600 VA nas 3
//                            primeiras + 100 VA nas excedentes
//   Varanda/Externo:         mín. 1 tomada — 100 VA
//   Demais (salas/dorms):    área ≤ 6 m² → 1 tomada; senão 1 a cada
//                            5 m ou fração de perímetro — 100 VA
// BUG CORRIGIDO: a versão anterior usava 1/5 m e potência fixa por
// tipo para TODOS os ambientes — cozinhas/AS ficavam com MENOS
// tomadas que o mínimo da norma (violação real, não conservadora).
export function calcTugComodo(perimetro_m: number, tipo: string, area_m2 = 0): number {
  if (perimetro_m <= 0 && area_m2 <= 0) return 0

  if (tipo === 'Banho') {
    return 600  // mínimo normativo: 1 tomada de 600 VA
  }

  if (tipo === 'Cozinha' || tipo === 'Lavanderia') {
    const n = Math.max(1, Math.ceil(perimetro_m / 3.5))
    const n600 = Math.min(n, 3)
    return n600 * 600 + (n - n600) * 100
  }

  if (tipo === 'Externo') {
    const n = Math.max(1, Math.ceil(perimetro_m / 5))
    return n * 100
  }

  // Demais dependências (Social, Garagem, ...):
  if (area_m2 > 0 && area_m2 <= 6) return 100  // 1 tomada
  const n = Math.max(1, Math.ceil(perimetro_m / 5))
  return n * (POT_TOMADA[tipo] ?? 100)
}

// ── Luminotécnico — Método dos Lúmens NBR ISO/CIE 8995-1 ────────
export interface LuminoInput {
  area_m2: number
  pe_direito_m: number
  h_plano_trabalho: number
  iluminancia_lux: number
  refl_teto: number
  refl_parede: number
  refl_piso: number
  luminaria_lm: number
  luminaria_pot_w: number
  // Índice de Reprodução de Cor da luminária (Ra/CRI, 0-100).
  // NBR ISO/CIE 8995-1 exige Ra ≥ 80 para ambientes de trabalho
  // contínuo (escritórios, oficinas) — abaixo disso, cores parecem
  // distorcidas sob a luz artificial, o que cansa a visão em jornadas
  // longas. Opcional: se omitido, a verificação não é aplicada
  // (não force um valor que o engenheiro não tem em mãos).
  luminaria_ra?: number
  // Ambiente é de trabalho contínuo? (escritório, oficina, bancada)
  // Determina se o Ra<80 vira aviso ou é só informativo.
  trabalho_continuo?: boolean
  // Anexo D NBR ISO/CIE 8995-1 — condição do ambiente/ciclo de limpeza,
  // determina o Fator de Manutenção real. Se omitido, usa 0,80 (cenário
  // mais otimista — "ambiente muito limpo, limpeza anual") por
  // compatibilidade histórica; recomenda-se declarar a condição real.
  condicao_ambiente_fm?: 'muito_limpo' | 'normal' | 'normal_maior_acumulo' | 'sujo'
}

export interface LuminoResult {
  k: number
  cu: number
  fm: number
  n_raw: number
  n_luminarias: number
  pot_total_w: number
  em_real: number
  dpf: number          // densidade de potência W/m²
  arranjos: Array<{desc: string, espac_x: number, espac_y: number}>
  string_circuito: string
  // Verificação de reprodução de cor — NBR ISO/CIE 8995-1
  ra_conforme?: boolean       // null/undefined se Ra não foi informado
  ra_aviso?: string
}

export function calcLuminotecnico(comp: number, larg: number, input: LuminoInput): LuminoResult {
  const area    = comp * larg
  const h_mont  = input.pe_direito_m - input.h_plano_trabalho

  // Índice do local k
  const k = area / (h_mont * (comp + larg))

  // Fator de utilização (CU) — interpolação por k
  const cu_tab: [number, number][] = [
    [0.6,0.28],[0.8,0.34],[1.0,0.40],[1.25,0.45],[1.5,0.50],
    [2.0,0.56],[2.5,0.61],[3.0,0.65],[5.0,0.70],
  ]
  let cu_base = 0.28
  for (const [k_tab, cu_val] of cu_tab) {
    if (k <= k_tab) { cu_base = cu_val; break }
    cu_base = cu_val
  }

  // Correção pelas refletâncias
  const refl_media = (input.refl_teto + input.refl_parede * 0.5 + input.refl_piso * 0.2) / 1.4
  const cu = Math.min(0.85, Math.max(0.20, cu_base * (0.6 + 0.4 * refl_media)))

  // Fator de manutenção — Anexo D NBR ISO/CIE 8995-1 (default 0,80
  // = cenário otimista, sobreposto quando o engenheiro declara a
  // condição real do ambiente)
  const fm = getFatorManutencao(input.condicao_ambiente_fm)

  // Fluxo necessário e número de luminárias
  const phi_total = (input.iluminancia_lux * area) / (cu * fm)
  const n_raw     = phi_total / input.luminaria_lm
  const n_lum     = Math.ceil(n_raw)
  const pot_total = n_lum * input.luminaria_pot_w
  const em_real   = (n_lum * input.luminaria_lm * cu * fm) / area
  const dpf       = pot_total / area

  // Arranjos sugeridos
  const arranjos: LuminoResult['arranjos'] = []
  for (let col = 1; col <= n_lum; col++) {
    if (n_lum % col !== 0) continue
    const row = n_lum / col
    if (col > 8 || row > 8) continue
    arranjos.push({
      desc: `${col} col × ${row} lin`,
      espac_x: Math.round(comp / (col + 1) * 100) / 100,
      espac_y: Math.round(larg / (row + 1) * 100) / 100,
    })
    if (arranjos.length >= 3) break
  }
  if (arranjos.length === 0) {
    arranjos.push({ desc: `${n_lum} luminarias — arranjo livre`, espac_x: 0, espac_y: 0 })
  }

  const string_circuito = `ILUM: ${n_lum}x${input.luminaria_pot_w}W`

  // NBR ISO/CIE 8995-1 — Ra ≥ 80 obrigatório em ambientes de trabalho
  // contínuo. Só avalia se o engenheiro informou o Ra da luminária —
  // não assumimos um valor que não foi declarado.
  let ra_conforme: boolean | undefined
  let ra_aviso: string | undefined
  if (input.luminaria_ra !== undefined) {
    ra_conforme = input.luminaria_ra >= 80
    if (!ra_conforme && input.trabalho_continuo) {
      ra_aviso = `Ra=${input.luminaria_ra} < 80 — NBR ISO/CIE 8995-1 exige Ra≥80 para ambientes de trabalho contínuo. Cores parecerão distorcidas sob esta luz; considere trocar a luminária.`
    } else if (!ra_conforme) {
      ra_aviso = `Ra=${input.luminaria_ra} < 80 — aceitável para ambientes de passagem, mas abaixo do recomendado (Ra≥80) para permanência prolongada.`
    }
  }

  return { k: Math.round(k*100)/100, cu: Math.round(cu*1000)/1000, fm,
           n_raw: Math.round(n_raw*10)/10, n_luminarias: n_lum,
           pot_total_w: pot_total, em_real: Math.round(em_real),
           dpf: Math.round(dpf*10)/10, arranjos, string_circuito,
           ra_conforme, ra_aviso }
}

// ── Curto-circuito IEC 60909:2016 ────────────────────────────────
// Método simplificado para instalações de BT até 1kV

export interface IccInput {
  icc_rede_ka: number      // Icc disponível na rede (da concessionária)
  v_linha: number          // tensão de linha (V)
  secao_mm2: number        // seção do condutor (mm²)
  comprimento_m: number    // comprimento do circuito (m)
  material: 'Cu' | 'Al'
  isolacao?: 'PVC' | 'XLPE' | 'EPR'  // padrão PVC — determina o fator K correto
  temperatura: number      // temperatura de operação (°C)
}

export interface IccResult {
  z_rede_mohm: number      // impedância da rede (mΩ)
  z_cabo_mohm: number      // impedância do cabo (mΩ)
  z_total_mohm: number     // impedância total (mΩ)
  icc_max_ka: number       // Icc máximo (kA) — no início do cabo
  icc_min_ka: number       // Icc mínimo (kA) — no fim do cabo
  icc_min_a: number        // Icc mínimo (A) — para verificar atuação do disjuntor
  tempo_atuacao_ms: number // tempo estimado de atuação do disjuntor (ms)
  ok_curva_b: boolean      // disjuntor curva B atua (Icc_min >= 5×In)
  ok_curva_c: boolean      // disjuntor curva C atua (Icc_min >= 10×In)
  ok_curva_d: boolean      // disjuntor curva D atua (Icc_min >= 20×In)
  energia_especifica: number // energia específica I²t (A²s/mm⁴) — verificar cabo
}

export function calcIcc(input: IccInput, in_disj_a: number): IccResult {
  const { icc_rede_ka, v_linha, secao_mm2, comprimento_m, material, temperatura, isolacao } = input

  // Resistividade corrigida pela temperatura
  const rho_20  = material === 'Cu' ? 0.0172 : 0.0282  // Ω·mm²/m
  const alpha   = material === 'Cu' ? 0.00393 : 0.00403
  const rho_t   = rho_20 * (1 + alpha * (temperatura - 20))

  // Impedância da rede (mΩ)
  const z_rede_mohm = icc_rede_ka > 0
    ? (v_linha / (Math.sqrt(3) * icc_rede_ka * 1000)) * 1000
    : 9999

  // Impedância do cabo (mΩ) — ida e volta = 2× comprimento
  const r_cabo_mohm = (2 * rho_t * comprimento_m / secao_mm2) * 1000

  // Reatância do cabo ≈ 0.08 mΩ/m (estimativa para BT)
  const x_cabo_mohm = comprimento_m * 0.08

  const z_cabo_mohm = Math.sqrt(r_cabo_mohm ** 2 + x_cabo_mohm ** 2)
  const z_total_mohm = z_rede_mohm + z_cabo_mohm

  // Icc máximo (início do cabo = só impedância de rede)
  const icc_max_ka = v_linha / (Math.sqrt(3) * z_rede_mohm / 1000) / 1000

  // Icc mínimo (fim do cabo = rede + cabo)
  const icc_min_a  = (v_linha / Math.sqrt(3)) / (z_total_mohm / 1000)
  const icc_min_ka = icc_min_a / 1000

  // Verificar se disjuntor atua (fatores: B=5×In, C=10×In, D=20×In)
  const ok_curva_b = icc_min_a >= 5  * in_disj_a
  const ok_curva_c = icc_min_a >= 10 * in_disj_a
  const ok_curva_d = icc_min_a >= 20 * in_disj_a

  // Tempo de atuação estimado (curva C, zona magnética)
  const mult = in_disj_a > 0 ? icc_min_a / in_disj_a : 0
  const tempo_atuacao_ms = mult >= 10 ? 10  // magnética instantânea
                         : mult >=  5 ? 50  // zona intermediária
                         : 300              // zona térmica

  // Energia específica para verificar integridade do cabo
  // Máxima admissível (IEC 60364-5-54 / NBR 5410 Tabela B.1): k²×S²
  // BUG CORRIGIDO: usava k=143 fixo para todo cobre, mas 143 é o valor
  // de Cu/XLPE — para Cu/PVC (isolação padrão/mais comum do projeto)
  // o valor correto é 115. Usar 143 indevidamente superestimava a
  // capacidade térmica do cabo em ~54% ((143/115)²≈1,55), tornando a
  // verificação de curto-circuito mais permissiva do que deveria no
  // caso comum. Agora usa a mesma tabela única de protectionDevicePhysics.ts
  // (Cu/PVC=115, Cu/XLPE=143, Al/PVC=74, Al/XLPE=94), evitando uma
  // terceira cópia divergente do mesmo dado normativo.
  const isolacaoChave = (isolacao === 'XLPE' || isolacao === 'EPR') ? 'XLPE' : 'PVC'
  const k = FATOR_K[`${material}/${isolacaoChave}`] ?? (material === 'Cu' ? 115 : 74)
  const energia_max = (k * secao_mm2) ** 2
  const energia_especifica = (icc_min_a ** 2) * (tempo_atuacao_ms / 1000)
  const energia_relativa = energia_max > 0 ? energia_especifica / energia_max : 0

  return {
    z_rede_mohm:    Math.round(z_rede_mohm * 100) / 100,
    z_cabo_mohm:    Math.round(z_cabo_mohm * 100) / 100,
    z_total_mohm:   Math.round(z_total_mohm * 100) / 100,
    icc_max_ka:     Math.round(icc_max_ka * 100) / 100,
    icc_min_ka:     Math.round(icc_min_ka * 100) / 100,
    icc_min_a:      Math.round(icc_min_a),
    tempo_atuacao_ms,
    ok_curva_b,
    ok_curva_c,
    ok_curva_d,
    energia_especifica: Math.round(energia_relativa * 1000) / 10,
  }
}
