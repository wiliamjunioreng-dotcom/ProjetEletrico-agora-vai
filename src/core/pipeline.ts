// src/core/pipeline.ts
import { inferirCurva } from './protectionDevicePhysics'
import { comprimentoMaximo } from './minFaultCurrentAnalysis'
// Pipeline de resolução com rastreabilidade completa
// Convergência iterativa explícita — seção→dU→seção

import {
  getFt, getFa, getIz, getSecaoMinimaPorIz, getSecaoPE,
  getDisjuntor, getIDR, getSecaoMinima, SECOES_COMERCIAIS,
} from '../data/nbr5410tables'
import { validarCircuito } from './rules/index'
import { bloqueiaCalculo } from './rules/context'
import type { CircuitoContext } from './rules/context'
import type { ResultadoNorma } from './rules/context'

// ════════════════════════════════════════════════════════════════
// CONTRACTS DE ESTÁGIO — dependências explícitas
//
// Cada estágio declara:
//   requires:    quais artefatos precisa que sejam válidos
//   provides:    qual artefato produz
//   can_continue: pode executar mesmo que reqs anteriores tenham erros?
//   invalidates:  quais estágios posteriores ficam inválidos se falhar
//
// Isso é o início do grafo de execução do solver.
// Hoje o pipeline é linear — contracts são a fundação para o DAG futuro.
// ════════════════════════════════════════════════════════════════

export type StageNome = 'tensao'|'corrente'|'fatores'|'secao'|'queda'|'protecao'|'curto'|'julgamento'

export interface StageContract {
  readonly nome:         StageNome
  readonly ordem:        number
  readonly requires:     StageNome[]   // estágios que devem ter completado sem erro físico
  readonly provides:     string        // artefato produzido
  readonly can_continue: boolean       // true = executa mesmo com erros de estágios anteriores
  readonly invalidates:  StageNome[]   // estágios que ficam inválidos se este falhar
}

export const STAGE_CONTRACTS: Record<StageNome, StageContract> = {
  tensao: {
    nome: 'tensao', ordem: 1,
    requires: [],
    provides: 'ArtTensao — tensão de fase/linha, número de condutores',
    can_continue: true,   // sempre executa (só depende da entrada)
    invalidates: ['corrente','fatores','secao','queda','protecao','curto','julgamento'],
  },
  corrente: {
    nome: 'corrente', ordem: 2,
    requires: ['tensao'],
    provides: 'ArtCorrente — Ib = VA / V',
    can_continue: true,   // se tensao=0, Ib=0 (incompleto, não inválido)
    invalidates: ['fatores','secao','queda','protecao','curto','julgamento'],
  },
  fatores: {
    nome: 'fatores', ordem: 3,
    requires: ['corrente'],
    provides: 'ArtFatores — Ft × Fa → Irc',
    can_continue: true,   // fatores são independentes da corrente para Ft/Fa
    invalidates: ['secao','queda','protecao','julgamento'],
  },
  secao: {
    nome: 'secao', ordem: 4,
    requires: ['tensao','corrente','fatores'],
    provides: 'ArtSecao — seção mínima pelo critério de Iz',
    can_continue: false,  // se inviável: bloqueia protecao e curto
    invalidates: ['queda','protecao','curto','julgamento'],
  },
  queda: {
    nome: 'queda', ordem: 5,
    requires: ['tensao','corrente','fatores','secao'],
    provides: 'ArtQueda — ΔV% e seção final convergida',
    can_continue: true,   // se comprimento=0, dU=0 (incompleto, não inválido)
    invalidates: ['protecao','julgamento'],
  },
  protecao: {
    nome: 'protecao', ordem: 6,
    requires: ['corrente','queda'],
    provides: 'ArtProtecao — In, curva, IDR, secao_PE',
    can_continue: false,  // sem proteção, curto-circuito é incoerente
    invalidates: ['curto','julgamento'],
  },
  curto: {
    nome: 'curto', ordem: 7,
    requires: ['queda','tensao','protecao'],
    provides: 'ArtCurto | null — Icc_max, Icc_min, verificação de atuação',
    can_continue: true,   // se icc_rede=0, retorna null (incompleto, não inválido)
    invalidates: [],      // curto não invalida julgamento — é verificação independente
  },
  julgamento: {
    nome: 'julgamento', ordem: 8,
    requires: ['corrente','secao','queda','protecao'],
    provides: 'ArtJulgamento — status, violações, secao_consolidada, bloqueado',
    can_continue: true,   // julgamento sempre executa mas usa erros_fisicos
    invalidates: [],
  },
}

// Estado de execução de um estágio
export type StageStatus =
  | 'concluido'       // executou sem erros físicos
  | 'incompleto'      // executou mas com dados parciais (ex: comprimento=0 → dU=0)
  | 'invalido'        // erro físico — resultado não deve ser usado para decisão
  | 'nao_executado'   // reqs não satisfeitos — não executou

// Estado de execução do pipeline completo
export interface PipelineExecution {
  readonly stages:    Record<StageNome, StageStatus>
  readonly confianca: 'total' | 'parcial' | 'inviavel'
  // confianca = total: todos os estágios concluídos sem erros
  // confianca = parcial: algum estágio incompleto (dados parciais)
  // confianca = inviavel: erro físico bloqueou um ou mais estágios
}

import { TraceBuilder } from './trace'
import type { TracoEstagio, IteracaoConvergencia, RelatorioTrace } from './trace'

// ── Entrada (domínio declarativo — imutável) ──────────────────────
export interface EntradaCircuito {
  readonly id:             string
  readonly descricao:      string
  readonly tipo:           string
  readonly fase:           string
  readonly potencia_va:    number
  readonly potencia_real_w?: number
  readonly comprimento_m:  number
  readonly n_agrup:        number
  readonly v_fase:         number
  readonly metodo:         string
  readonly isolacao:       'PVC' | 'XLPE' | 'EPR'
  readonly material:       'Cu' | 'Al'
  readonly t_amb:          number
  readonly du_max_pct:     number
  readonly du_ramal_pct:   number
  readonly icc_rede_ka:    number
  // Tensão de referência FIXA do ponto de entrega (não confundir com
  // v_fase do circuito específico, que varia por tipo de carga).
  // O Icc presumido informado pela concessionária é referenciado a
  // ESSA tensão fixa de entrada, não à tensão de cada circuito
  // terminal. Quando ausente, assume v_fase × √3 (convenção trifásica
  // padrão da maioria dos padrões de entrada CEMIG).
  readonly v_linha_ref?:   number
}

// ── Artefatos intermediários (imutáveis) ──────────────────────────

export interface ArtTensao {
  readonly tensao_v: number; readonly n_fases: 1|2|3; readonly n_cond: 2|3
}
export interface ArtCorrente {
  readonly ib: number
}
export interface ArtFatores {
  readonly ft: number; readonly fa: number; readonly irc: number
}
export interface ArtSecao {
  readonly secao_por_iz: number
  readonly secao_min_projeto: number
  readonly secao_final: number
  readonly iz_nominal: number; readonly iz_efetiva: number
}
export interface ArtQueda {
  readonly du_pct: number; readonly du_ramal: number; readonly du_total: number
  readonly secao_final: number  // pode ter crescido para atender dU
  readonly iz_nominal_final: number; readonly iz_efetiva_final: number
  readonly iteracoes: IteracaoConvergencia[]
  readonly convergiu: boolean
}
export interface ArtProtecao {
  readonly in_disj: number; readonly curva: 'B'|'C'|'D'
  readonly idr: boolean; readonly idr_in: number
  readonly secao_pe: number; readonly secao_neutro: number
  // Verificação de adequação da curva ao tipo de carga
  readonly curva_adequada: boolean
  readonly curva_sugerida: 'B'|'C'|'D'
  readonly justificativa_curva: string
  // Seção final após garantir tripartida In <= Iz' (NBR §5.1.3.1).
  // Igual a q.secao_final quando nenhum ajuste foi necessário.
  readonly secao_protegida_mm2: number
}
export interface ArtCurto {
  readonly icc_max_ka: number; readonly icc_min_ka: number
  readonly tempo_atuacao_ms: number; readonly ok_atuacao: boolean
  readonly z_rede_mohm: number; readonly z_cabo_mohm: number
  // Verificação de pior caso (loop completo)
  readonly protecao_funcional: boolean    // proteção atua no pior caso (cabo quente, tensão -10%)
  readonly comprimento_max_m: number      // comprimento máximo para esta configuração
  readonly fator_seguranca: number        // Icc_min / Ia_min (deve ser ≥ 1.0)
}
export interface ArtJulgamento {
  readonly violacoes:         ResultadoNorma[]
  readonly status:            'OK' | 'AVISO' | 'ERRO' | 'SEM_DADOS'
  readonly bloqueado:         boolean   // erro físico — decisões técnicas paradas
  readonly secao_consolidada: number    // seção final = max(Iz, dU, norma) — garantia explícita
}

// Resultado completo com rastreabilidade e estado de execução
export interface CircuitoPipelined {
  readonly entrada:    EntradaCircuito
  readonly tensao:     ArtTensao
  readonly corrente:   ArtCorrente
  readonly fatores:    ArtFatores
  readonly secao:      ArtSecao
  readonly queda:      ArtQueda
  readonly protecao:   ArtProtecao
  readonly curto:      ArtCurto | null
  readonly julgamento: ArtJulgamento
  readonly trace:      RelatorioTrace      // raciocínio completo
  readonly execution:  PipelineExecution   // estado de cada estágio
}

// ── Helpers ───────────────────────────────────────────────────────
import { ehAreaMolhada as isMolhado } from './areaMolhada'

// ── Estágio 1: Tensão ─────────────────────────────────────────────
export function stageTensao(e: EntradaCircuito): [ArtTensao, TracoEstagio] {
  const tb = new TraceBuilder('stageTensao', 1)
  const MONO = ['R','S','T']
  const n_fases = MONO.includes(e.fase) ? 1 : e.fase === 'RST' ? 3 : 2
  const n_cond  = n_fases === 1 ? 2 : 3
  const tensao_v = n_fases === 1 ? e.v_fase : Math.round(e.v_fase * Math.sqrt(3))

  tb.entrada('tensao_v', tensao_v,
    { fase: e.fase, v_fase: e.v_fase, n_fases },
    { formula: n_fases === 1 ? 'V = V_fase' : 'V = V_fase × √3',
      unidade: 'V', categoria: 'fisica',
      nota: `Sistema ${e.fase}: ${n_fases === 1 ? 'monofásico' : n_fases === 2 ? 'bifásico' : 'trifásico'}` }
  )

  return [
    { tensao_v, n_fases: n_fases as 1|2|3, n_cond: n_cond as 2|3 },
    tb.build()
  ]
}

// ── Estágio 2: Corrente de projeto ───────────────────────────────
export function stageCorrente(e: EntradaCircuito, t: ArtTensao): [ArtCorrente, TracoEstagio] {
  const tb = new TraceBuilder('stageCorrente', 2)
  const ib = e.potencia_va > 0 ? Math.round(e.potencia_va / t.tensao_v * 100) / 100 : 0

  tb.entrada('ib', ib,
    { potencia_va: e.potencia_va, tensao_v: t.tensao_v },
    { formula: 'Ib = VA / V', unidade: 'A', categoria: 'fisica',
      nota: `Corrente de projeto — NÃO é atributo do circuito, é resultado da física` }
  )

  return [{ ib }, tb.build()]
}

// ── Estágio 3: Fatores de correção ────────────────────────────────
export function stageFatores(e: EntradaCircuito, c: ArtCorrente): [ArtFatores, TracoEstagio] {
  const tb  = new TraceBuilder('stageFatores', 3)
  const ft  = getFt(e.t_amb, e.isolacao)
  const fa  = getFa(e.n_agrup)
  const div = ft * fa
  const irc = div > 0 ? Math.round(c.ib / div * 100) / 100 : c.ib

  tb.entrada('ft', ft,
    { t_amb: e.t_amb, isolacao: e.isolacao },
    { norma: 'NBR 5410:2004 Tabela 40', categoria: 'norma',
      nota: `Fator temperatura — Iz' = Iz × Ft — redução de ${Math.round((1-ft)*100)}%` }
  ).entrada('fa', fa,
    { n_agrup: e.n_agrup },
    { norma: 'NBR 5410:2004 Tabela 42', categoria: 'norma',
      nota: `Fator agrupamento — ${e.n_agrup} circuito(s) no mesmo eletroduto` }
  ).entrada('irc', irc,
    { ib: c.ib, ft, fa },
    { formula: 'Irc = Ib / (Ft × Fa)', unidade: 'A', categoria: 'fisica',
      nota: `Corrente corrigida — o cabo precisa suportar ${irc.toFixed(2)}A após fatores` }
  )

  return [{ ft, fa, irc }, tb.build()]
}

// ── Estágio 4: Seção mínima ───────────────────────────────────────
export function stageSecao(e: EntradaCircuito, t: ArtTensao, f: ArtFatores): [ArtSecao, TracoEstagio] {
  const tb = new TraceBuilder('stageSecao', 4)
  const metodo = e.metodo as any

  // Física: seção para suportar Irc (lei de condução)
  const secao_por_iz_raw = getSecaoMinimaPorIz(f.irc, metodo, t.n_cond, e.material, e.isolacao)
  const secao_invalida = secao_por_iz_raw < 0  // -1 = combinação inválida ou inviável
  const secao_por_iz = secao_invalida ? 240 : secao_por_iz_raw  // fallback defensivo

  // Norma como parâmetro de projeto (piso mínimo de segurança) —
  // Tabela 47, com diferenciação de material (Al = piso único 16mm²).
  // Consolidado: antes duplicava o mesmo lookup direto de engine.ts,
  // sem cobrir Alumínio — mesmo padrão de risco já corrigido para o
  // K-factor e o PE nesta auditoria.
  const secao_min_projeto = getSecaoMinima(e.tipo, e.material)

  // Decisão: máximo entre física e piso de projeto
  const secao_final = Math.max(secao_por_iz, secao_min_projeto)

  const iz_nominal_raw = getIz(secao_final, metodo, t.n_cond, e.material, e.isolacao)
  const iz_nominal = iz_nominal_raw > 0 ? iz_nominal_raw : 0  // -1 → 0 (combinação não tabelada)
  const iz_efetiva = iz_nominal > 0 ? Math.round(iz_nominal * f.ft * f.fa * 10) / 10 : 0

  if (secao_invalida) {
    tb.decisao('ERRO_SECAO', 'projeto inviável',
      { irc: f.irc, metodo: e.metodo, n_cond: t.n_cond },
      { categoria: 'julgamento',
        nota: `Corrente ${f.irc.toFixed(1)}A excede capacidade do maior condutor (240mm²) no método ${e.metodo}. Projeto inviável — revisar carga ou método de instalação.` }
    )
  }

  tb.entrada('secao_por_iz', secao_por_iz,
    { irc: f.irc, metodo: e.metodo, n_cond: t.n_cond },
    { categoria: 'fisica', unidade: 'mm²',
      nota: `Tabela 36 (${e.isolacao}/${e.material}): seção mínima para Irc=${f.irc.toFixed(2)}A` }
  ).entrada('secao_min_projeto', secao_min_projeto,
    { tipo: e.tipo },
    { norma: 'NBR 5410:2004 §6.2.5', categoria: 'norma', unidade: 'mm²',
      nota: `Piso normativo para circuito ${e.tipo} — usado como critério de projeto, não julgamento` }
  ).decisao('secao_final', secao_final,
    { secao_por_iz, secao_min_projeto },
    { formula: 'max(secao_por_iz, secao_min_projeto)', categoria: 'criterio', unidade: 'mm²',
      nota: secao_final > secao_por_iz
        ? `Seção cresceu de ${secao_por_iz}mm² para ${secao_final}mm² pelo piso normativo do projeto`
        : `Seção definida pela corrente corrigida Irc=${f.irc.toFixed(2)}A` }
  ).entrada('iz_efetiva', iz_efetiva,
    { iz_nominal, ft: f.ft, fa: f.fa },
    { formula: "Iz' = Iz × Ft × Fa", unidade: 'A', categoria: 'fisica' }
  )

  return [{ secao_por_iz, secao_min_projeto, secao_final, iz_nominal, iz_efetiva }, tb.build()]
}

// ── Estágio 5: Queda de tensão (iterativo convergente) ────────────
export function stageQueda(
  e: EntradaCircuito,
  t: ArtTensao,
  c: ArtCorrente,
  f: ArtFatores,
  s: ArtSecao
): [ArtQueda, TracoEstagio] {
  const tb = new TraceBuilder('stageQueda', 5)
  const iteracoes: IteracaoConvergencia[] = []

  if (!e.comprimento_m || e.comprimento_m <= 0 || c.ib <= 0) {
    tb.entrada('du_pct', 0, { comprimento_m: e.comprimento_m, ib: c.ib },
      { nota: 'Sem comprimento informado — queda de tensão não calculada', categoria: 'criterio' })
    const art: ArtQueda = {
      du_pct: 0, du_ramal: e.du_ramal_pct, du_total: e.du_ramal_pct,
      secao_final: s.secao_final, iz_nominal_final: s.iz_nominal,
      iz_efetiva_final: s.iz_efetiva, iteracoes, convergiu: true,
    }
    return [art, tb.build()]
  }

  const du_disp = e.du_max_pct - e.du_ramal_pct
  const RHO_20  = e.material === 'Cu' ? 0.0172 : 0.0282
  const ALPHA   = e.material === 'Cu' ? 0.00393 : 0.00403
  const T_OP    = 60  // temperatura de operação simplificada
  const rho_t   = RHO_20 * (1 + ALPHA * (T_OP - 20))
  // BUG CRÍTICO CORRIGIDO: bifásico (n_fases=2, F-F sem neutro — ex:
  // chuveiro/ar-condicionado 220V) é circuito de 2 condutores, igual
  // ao monofásico para queda de tensão — fator 2. √3 só vale para
  // trifásico real (3 condutores). Usar √3 no bifásico subestimava
  // a queda em ~13,4%. Mesmo bug existia em engine.ts:calcDeltaU()
  // (corrigido na mesma sessão) — os dois motores ficam consistentes.
  const k_nfases = t.n_fases === 3 ? Math.sqrt(3) : 2

  const metodo = e.metodo as any
  let sec = s.secao_final
  let du  = 0
  let convergiu = false

  // Loop de convergência explícito — seção → dU → seção
  const MAX_ITER = SECOES_COMERCIAIS.length
  for (let iter = 0; iter < MAX_ITER; iter++) {
    du = (k_nfases * rho_t * e.comprimento_m * c.ib) / (sec * t.tensao_v) * 100
    du = Math.round(du * 100) / 100

    iteracoes.push({
      n:        iter + 1,
      secao_mm2: sec,
      du_pct:   du,
      du_disp,
      motivo:   du <= du_disp
        ? `Convergiu: dU=${du.toFixed(2)}% ≤ disponível ${du_disp.toFixed(1)}%`
        : `dU=${du.toFixed(2)}% > disponível ${du_disp.toFixed(1)}% — aumentar seção`,
    })

    if (du <= du_disp) { convergiu = true; break }

    // Avançar para próxima seção comercial
    const idx = SECOES_COMERCIAIS.indexOf(sec)
    if (idx < 0 || idx >= SECOES_COMERCIAIS.length - 1) break
    sec = SECOES_COMERCIAIS[idx + 1]
  }

  const iz_nom  = getIz(sec, metodo, t.n_cond, e.material, e.isolacao)
  const iz_efet = Math.round(iz_nom * f.ft * f.fa * 10) / 10

  tb.entrada('rho_t', rho_t,
    { material: e.material, T_OP, RHO_20, ALPHA },
    { formula: 'ρ(T) = ρ₂₀ × (1 + α × (T - 20))', categoria: 'fisica',
      unidade: 'Ω·mm²/m', nota: `Resistividade do ${e.material} a ${T_OP}°C` }
  ).entrada('du_disp', du_disp,
    { du_max_pct: e.du_max_pct, du_ramal_pct: e.du_ramal_pct },
    { formula: 'dU_disp = dU_max - dU_ramal', norma: 'NBR 5410:2004 §6.2.7.2',
      categoria: 'norma', nota: `Reserva para ramal: ${e.du_ramal_pct}%` }
  ).decisao('du_pct', du,
    { ib: c.ib, comprimento_m: e.comprimento_m, sec, tensao_v: t.tensao_v },
    { formula: `dU = (${k_nfases === 2 ? '2' : '√3'} × ρ × L × I) / (S × V) × 100`,
      unidade: '%', categoria: 'fisica',
      nota: iteracoes.length > 1
        ? `${iteracoes.length} iteração(ões): seção cresceu de ${s.secao_final}mm² para ${sec}mm² para atender dU`
        : `1ª iteração: seção ${sec}mm² atende dU=${du.toFixed(2)}%` }
  )

  return [{
    du_pct: du, du_ramal: e.du_ramal_pct, du_total: du + e.du_ramal_pct,
    secao_final: sec, iz_nominal_final: iz_nom, iz_efetiva_final: iz_efet,
    iteracoes, convergiu,
  }, tb.build()]
}

// ── Estágio 6: Proteção ───────────────────────────────────────────
export function stageProtecao(
  e: EntradaCircuito,
  c: ArtCorrente,
  q: ArtQueda,
  t: ArtTensao,
  f: ArtFatores
): [ArtProtecao, TracoEstagio] {
  const tb      = new TraceBuilder('stageProtecao', 6)
  const in_disj = getDisjuntor(c.ib)
  // Inferir curva pelo tipo real da carga (corrigido: não mais 'B' para tudo)
  const sug_curva = inferirCurva(e.tipo, e.descricao?.toLowerCase())
  const curva = sug_curva.curva
  const idr     = isMolhado(e.descricao)
  const idr_in  = idr ? getIDR(in_disj) : 0

  // ── Tripartida: In <= Iz' (NBR 5410 §5.1.3.1) ──────────────────
  // O disjuntor padrão (próximo passo comercial acima de Ib) pode
  // exceder a capacidade EFETIVA do cabo após fatores de agrupamento/
  // temperatura. Quando isso ocorre, a seção precisa subir — senão
  // o disjuntor não protege o cabo contra sobrecarga térmica.
  // Mesma lógica já aplicada em engine.ts — mantém os dois motores
  // de cálculo (engine.ts e pipeline.ts) consistentes entre si.
  let secao_protegida = q.secao_final
  let iz_efetiva_corrigida = q.iz_efetiva_final
  {
    const SECOES_TRIP = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240]
    let tentativas = 0
    while (in_disj > iz_efetiva_corrigida && tentativas < 12) {
      const idx = SECOES_TRIP.indexOf(secao_protegida)
      if (idx < 0 || idx >= SECOES_TRIP.length - 1) break
      secao_protegida = SECOES_TRIP[idx + 1]
      const iz_nom = getIz(secao_protegida, e.metodo as any, t.n_cond, e.material, e.isolacao)
      iz_efetiva_corrigida = Math.round(iz_nom * f.ft * f.fa * 10) / 10
      tentativas++
    }
  }

  // PE — NBR 5410:2004 Tabela 54 (usa a seção JÁ corrigida pela tripartida)
  // Reutiliza getSecaoPE() (fonte única em nbr5410tables.ts) em vez de
  // duplicar a fórmula inline pela 2ª vez (engine.ts já usava a função;
  // esta era uma cópia paralela — mesmo padrão de risco do K-factor
  // corrigido anteriormente, aqui os valores já batiam, mas o risco
  // de divergência futura existia).
  const sec_pe  = getSecaoPE(secao_protegida)
  const sec_neu = secao_protegida  // neutro = fase (circuitos terminais)

  tb.decisao('in_disj', in_disj,
    { ib: c.ib },
    { norma: 'IEC 60898 — série comercial', categoria: 'selecao', unidade: 'A',
      nota: `Próximo valor comercial acima de Ib=${c.ib.toFixed(2)}A` }
  ).decisao('curva', curva,
    { tipo: e.tipo },
    { norma: 'IEC 60898-1', categoria: 'norma',
      nota: sug_curva.justificativa }
  ).decisao('idr', String(idr),
    { descricao: e.descricao },
    { norma: 'NBR 5410:2004 §5.1.3.6.1', categoria: 'norma',
      nota: idr ? 'Área molhada detectada — IDR 30mA obrigatório' : 'Área seca — IDR não obrigatório' }
  ).decisao('secao_pe', sec_pe,
    { secao_fase: q.secao_final },
    { norma: 'NBR 5410:2004 Tabela 54', categoria: 'norma', unidade: 'mm²' }
  )

  return [{
    in_disj, curva, idr, idr_in, secao_pe: sec_pe, secao_neutro: sec_neu,
    curva_adequada: sug_curva.curva === curva,
    curva_sugerida: sug_curva.curva,
    justificativa_curva: sug_curva.justificativa,
    secao_protegida_mm2: secao_protegida,
  }, tb.build()]
}

// ── Estágio 7: Curto-circuito ─────────────────────────────────────
export function stageCurto(
  e: EntradaCircuito,
  q: ArtQueda,
  t: ArtTensao,
  p: ArtProtecao
): [ArtCurto | null, TracoEstagio] {
  const tb = new TraceBuilder('stageCurto', 7)

  if (!e.icc_rede_ka || e.icc_rede_ka <= 0 || !e.comprimento_m) {
    tb.entrada('icc', 'não calculado', { icc_rede_ka: e.icc_rede_ka, comprimento_m: e.comprimento_m },
      { nota: 'Icc da rede ou comprimento não informado', categoria: 'criterio' })
    return [null, tb.build()]
  }

  const RHO_20 = e.material === 'Cu' ? 0.0172 : 0.0282
  const ALPHA  = e.material === 'Cu' ? 0.00393 : 0.00403
  const T_CC   = 160  // temperatura de curto-circuito (PVC)
  const rho_cc = RHO_20 * (1 + ALPHA * (T_CC - 20))

  // BUG CORRIGIDO: a impedância da rede da concessionária (z_rede_ohm)
  // é propriedade FÍSICA FIXA do transformador/ramal de entrada —
  // não pode variar conforme qual circuito terminal está sendo
  // analisado. O engenheiro só tem acesso a UM valor de Icc presumido
  // (kA), fornecido pela concessionária referenciado à tensão de
  // entrada (v_linha_ref) — nunca à tensão de cada circuito interno
  // (127V mono vs 220V bifásico variam por circuito; a rede não).
  // Antes usava t.tensao_v (variável por circuito), dando z_rede
  // diferente para o mesmo ponto de entrega dependendo do tipo de
  // carga analisada — fisicamente incorreto.
  const v_ref       = e.v_linha_ref ?? (e.v_fase * Math.sqrt(3))
  const z_rede_ohm  = v_ref / (Math.sqrt(3) * e.icc_rede_ka * 1000)
  const r_cabo      = (2 * rho_cc * e.comprimento_m) / q.secao_final
  const z_total     = z_rede_ohm + r_cabo

  // Icc no ponto do circuito usa a TENSÃO LOCAL (t.tensao_v) — isso
  // está correto, pois a corrente de falta disponível em cada ponto
  // realmente depende da tensão ali. Só a impedância de FONTE (acima)
  // precisa ser fixa.
  const icc_max_ka = t.tensao_v / (Math.sqrt(3) * z_rede_ohm) / 1000
  const icc_min_ka = t.tensao_v / (Math.sqrt(3) * z_total)    / 1000
  const icc_min_a  = icc_min_ka * 1000

  // Verificar atuação (curva B: 3×In, C: 5×In)
  const fator_min = p.curva === 'C' ? 5 : 3
  const ok_atuacao = icc_min_a >= fator_min * p.in_disj
  const tempo_ms   = icc_min_a >= 10 * p.in_disj ? 10
                   : icc_min_a >=  5 * p.in_disj ? 50 : 300

  tb.entrada('z_rede', Math.round(z_rede_ohm * 1000 * 100) / 100,
    { icc_rede_ka: e.icc_rede_ka, tensao_v: t.tensao_v },
    { formula: 'Z_rede = V / (√3 × Icc_rede)', unidade: 'mΩ',
      norma: 'IEC 60909:2016', categoria: 'fisica' }
  ).entrada('r_cabo', Math.round(r_cabo * 1000 * 100) / 100,
    { rho_cc, comprimento_m: e.comprimento_m, secao: q.secao_final },
    { formula: 'R_cabo = 2 × ρ(Tcc) × L / S', unidade: 'mΩ', categoria: 'fisica',
      nota: `ρ a ${T_CC}°C (curto-circuito)` }
  ).entrada('icc_max_ka', Math.round(icc_max_ka * 100) / 100,
    { z_rede_ohm },
    { formula: 'Icc_max = V / (√3 × Z_rede)', unidade: 'kA', categoria: 'fisica',
      nota: 'Pior caso para o disjuntor — corrente no início do cabo' }
  ).entrada('icc_min_ka', Math.round(icc_min_ka * 100) / 100,
    { z_total },
    { formula: 'Icc_min = V / (√3 × Z_total)', unidade: 'kA', categoria: 'fisica',
      nota: 'Pior caso para proteção — corrente no fim do cabo' }
  ).decisao('ok_atuacao', String(ok_atuacao),
    { icc_min_a: Math.round(icc_min_a), in_disj: p.in_disj, curva: p.curva, fator_min },
    { norma: 'IEC 60898', categoria: 'julgamento',
      nota: ok_atuacao
        ? `✓ Icc_min(${icc_min_a.toFixed(0)}A) ≥ ${fator_min}×In(${p.in_disj}A) = ${fator_min*p.in_disj}A`
        : `✗ Icc_min(${icc_min_a.toFixed(0)}A) < ${fator_min}×In(${p.in_disj}A) — disjuntor pode não atuar` }
  )

  return [{
    icc_max_ka: Math.round(icc_max_ka * 100) / 100,
    icc_min_ka: Math.round(icc_min_ka * 100) / 100,
    tempo_atuacao_ms: tempo_ms,
    ok_atuacao,
    z_rede_mohm: Math.round(z_rede_ohm * 1000 * 100) / 100,
    z_cabo_mohm: Math.round(r_cabo * 1000 * 100) / 100,
    // Verificação de pior caso (loop completo com cabo quente e tensão mínima)
    protecao_funcional: ok_atuacao,
    // Usa a seção PROTEGIDA (pós-correção de tripartida), não a pré-correção —
    // senão o comprimento máximo calculado fica pessimista/inconsistente
    // em relação ao cabo realmente especificado no projeto.
    comprimento_max_m:  comprimentoMaximo(
      p?.secao_protegida_mm2 ?? q?.secao_final ?? 2.5,
      p?.secao_protegida_mm2 ?? q?.secao_final ?? 2.5,
      t.tensao_v, 'PVC', p.curva as 'B'|'C'|'D', p.in_disj
    ).comprimento_max_m,
    fator_seguranca: ok_atuacao
      ? Math.round((icc_min_ka * 1000) / (p.in_disj * (p.curva === 'B' ? 3 : p.curva === 'D' ? 10 : 5)) * 10) / 10
      : 0,
  }, tb.build()]
}

// ── Estágio 8: Julgamento normativo (separado da física) ──────────
export function stageJulgamento(
  e: EntradaCircuito,
  c: ArtCorrente,
  s: ArtSecao,
  q: ArtQueda,
  p: ArtProtecao,
  // Erros físicos que chegam de estágios anteriores
  erros_fisicos: ResultadoNorma[] = []
): [ArtJulgamento, TracoEstagio] {
  const tb = new TraceBuilder('stageJulgamento', 8)

  if (!e.potencia_va || e.potencia_va <= 0) {
    return [{ violacoes: [], status: 'SEM_DADOS', bloqueado: false, secao_consolidada: 0 }, tb.build()]
  }

  // Seção consolidada: máximo entre todos os critérios
  // Garante que a decisão final é sempre a mais restritiva
  const secao_consolidada = Math.max(
    s.secao_final,           // critério Iz (físico)
    q.secao_final,           // critério ΔV (convergência)
    s.secao_min_projeto,     // piso normativo
    p.secao_protegida_mm2    // critério tripartida In<=Iz' (proteção)
  )

  if (secao_consolidada > q.secao_final) {
    tb.decisao('secao_consolidada', secao_consolidada,
      { por_iz: s.secao_final, por_du: q.secao_final, norma: s.secao_min_projeto },
      { categoria: 'criterio', unidade: 'mm²',
        nota: `Seção consolidada = max(${s.secao_final}, ${q.secao_final}, ${s.secao_min_projeto}) — critério mais restritivo` }
    )
  }

  // Verificar se algum erro físico bloqueia a decisão
  const ja_bloqueado = bloqueiaCalculo(erros_fisicos)

  const ctx: CircuitoContext = {
    id: e.id, tipo: e.tipo, descricao: e.descricao,
    ib: c.ib, in_disj: p.in_disj,
    iz_nominal: q.iz_nominal_final, iz_efetiva: q.iz_efetiva_final,
    secao_mm2: secao_consolidada,
    du_pct: q.du_pct, du_max_pct: e.du_max_pct, du_ramal_pct: e.du_ramal_pct,
    idr: p.idr, fase: e.fase, comprimento_m: e.comprimento_m, n_agrup: e.n_agrup,
    ft: 0, fa: 0,
  }

  const violacoes_normativas = ja_bloqueado ? [] : validarCircuito(ctx)
  const todas_violacoes = [...erros_fisicos, ...violacoes_normativas]

  const status = ja_bloqueado ? 'ERRO'
    : todas_violacoes.some(v => v.severidade === 'erro') ? 'ERRO'
    : todas_violacoes.some(v => v.severidade === 'aviso') ? 'AVISO'
    : 'OK'

  todas_violacoes.forEach(v => {
    tb.decisao(v.codigo, v.conforme ? 'conforme' : 'não conforme',
      { valor: v.valor ?? '', limite: v.limite ?? '' },
      { norma: v.norma, categoria: 'julgamento', nota: v.descricao }
    )
  })

  return [{
    violacoes: todas_violacoes,
    status: status as ArtJulgamento['status'],
    bloqueado: ja_bloqueado || todas_violacoes.some(v => v.bloqueia_calculo === true),
    secao_consolidada,
  }, tb.build()]
}

// ── Pipeline completo ─────────────────────────────────────────────
export function resolverCircuito(entrada: EntradaCircuito): CircuitoPipelined {
  const estagios: TracoEstagio[] = []

  const [tensao,    t1] = stageTensao(entrada)
  const [corrente,  t2] = stageCorrente(entrada, tensao)
  const [fatores,   t3] = stageFatores(entrada, corrente)
  const [secao,     t4] = stageSecao(entrada, tensao, fatores)
  const [queda,     t5] = stageQueda(entrada, tensao, corrente, fatores, secao)
  const [protecao,  t6] = stageProtecao(entrada, corrente, queda, tensao, fatores)
  const [curto,     t7] = stageCurto(entrada, queda, tensao, protecao)
  // Coletar erros físicos dos estágios anteriores para passar ao julgamento
  const erros_fisicos_secao: import('./rules/context').ResultadoNorma[] =
    t4.decisoes
      .filter(d => d.nome === 'ERRO_SECAO')
      .map(d => ({
        codigo: 'FISICO.SECAO_INVIAVEL',
        descricao: d.nota ?? 'Seção inviável',
        norma: 'NBR 5410:2004 Tabela 36 — capacidade de condução',
        severidade: 'fisico_critico' as const,
        conforme: false,
        bloqueia_calculo: true,
        acao_sugerida: 'Altere o método de instalação, reduza a carga ou divida o circuito em dois.',
      }))

  const [julgamento,t8] = stageJulgamento(entrada, corrente, secao, queda, protecao, erros_fisicos_secao)

  estagios.push(t1, t2, t3, t4, t5, t6, t7, t8)

  const trace: RelatorioTrace = {
    circuito_id:   entrada.id,
    circuito_desc: entrada.descricao,
    timestamp:     new Date().toISOString(),
    estagios,
    iteracoes:  queda.iteracoes,
    convergiu:  queda.convergiu,
  }

  // ── Computar estado de execução de cada estágio ─────────────────
  const bloqueado_desde_secao = secao.secao_final <= 0 || julgamento.bloqueado

  const execution: PipelineExecution = {
    stages: {
      tensao:     'concluido',
      corrente:   corrente.ib > 0 ? 'concluido' : 'incompleto',
      fatores:    'concluido',
      secao:      secao.iz_efetiva <= 0 ? 'invalido' : 'concluido',
      // queda incompleta se: comprimento não informado (dado parcial)
      // queda inválida/incompleta se: convergência falhou
      // queda concluída se: comprimento > 0 E convergiu
      queda:      entrada.comprimento_m <= 0 ? 'incompleto'
                : !queda.convergiu ? 'incompleto'
                : 'concluido',
      protecao:   bloqueado_desde_secao ? 'invalido' : 'concluido',
      curto:      curto === null ? 'incompleto' : 'concluido',  // null = dados parciais, não erro
      julgamento: 'concluido',
    },
    confianca: julgamento.bloqueado ? 'inviavel'
      : Object.values({ // qualquer incompleto → parcial
          q: queda.convergiu, c: curto !== null || entrada.icc_rede_ka <= 0
        }).some(v => !v) ? 'parcial'
      : 'total',
  }

  return { entrada, tensao, corrente, fatores, secao, queda, protecao, curto, julgamento, trace, execution }
}
