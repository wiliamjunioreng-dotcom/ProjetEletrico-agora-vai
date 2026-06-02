// src/core/solver.ts
// ════════════════════════════════════════════════════════════════
// SOLVER ELÉTRICO DETERMINÍSTICO
//
// CONTRATO FUNDAMENTAL:
//   solve(dominioDeclarativo) => EstadoCalculado
//
// O solver:
//   - não muta nenhum campo do domínio de entrada
//   - não acessa store, localStorage, DOM, ou qualquer efeito
//   - é puro: mesma entrada → mesma saída (determinístico)
//   - retorna um snapshot imutável do estado calculado
//
// Isso habilita futuramente:
//   - undo/redo (comparar snapshots)
//   - auditoria (log de cada solve)
//   - simulação (solve com parâmetros hipotéticos)
//   - testes determinísticos (sem mocks)
// ════════════════════════════════════════════════════════════════

import { dimensionarCircuito, calcularDemanda } from './engine'
import { resolverCircuito } from './pipeline'
import type { CircuitoPipelined } from './pipeline'
import { validarCircuito, ocupacaoEletroduto, reservasQD } from './rules/index'
import { analisarSegmento } from './topologia'
import { verificarInvariantes } from './domain'
import type { CircuitoContext, SegmentoContext, ResultadoNorma } from './rules/context'
import type { RedeEletrica } from '../types/electrical'
import type { RawCircuit } from '../store/projectStore'

// ── Tipos do domínio declarativo (entrada) ───────────────────────
export interface DominioDeclarativo {
  readonly projeto: {
    readonly sistema:            string
    readonly v_fase:             number
    readonly v_linha:            number
    readonly metodo_instalacao:  string
    readonly isolacao:           string
    readonly material_cabo:      string
    readonly t_amb:              number
    readonly du_max_pct:         number
    readonly du_ramal_pct:       number
    readonly fp_global:          number
    readonly icc_rede_ka:        number
    readonly aterramento:        string
  }
  readonly circuitos: ReadonlyArray<RawCircuit>
  readonly rede:      RedeEletrica
}

// ── Resultado por circuito ────────────────────────────────────────
export interface CircuitoSolvido {
  readonly id:          string
  readonly descricao:   string
  readonly tipo:        string
  readonly fase:        string
  // Dimensionamento
  readonly tensao_v:    number
  readonly ib:          number
  readonly ft:          number
  readonly fa:          number
  readonly secao_fase:  number
  readonly secao_neutro:number
  readonly secao_pe:    number
  readonly iz_nominal:  number
  readonly iz_efetiva:  number
  readonly in_disj:     number
  readonly curva:       string
  readonly idr:         boolean
  readonly du_calc:     number
  readonly du_acum:     number
  // Potências
  readonly potencia_va:     number
  readonly potencia_real_w: number | undefined
  // Validação normativa
  readonly violacoes:   ResultadoNorma[]
  readonly status:      'OK' | 'AVISO' | 'ERRO' | 'SEM_DADOS'
}

// ── Resultado por segmento ────────────────────────────────────────
export interface SegmentoSolvido {
  readonly id:                   string
  readonly nome:                 string
  readonly area_condutores_mm2:  number
  readonly area_interna_mm2:     number
  readonly taxa_ocupacao_pct:    number
  readonly status_ocupacao:      'OK' | 'LIMITE' | 'EXCEDIDO'
  readonly n_circuitos:          number
  readonly fa_resultante:        number
  readonly violacoes:            ResultadoNorma[]
}

// ── Demanda calculada ─────────────────────────────────────────────
export interface DemandaSolvida {
  readonly ci_kw:              number
  readonly fd:                 number
  readonly dem_kw:             number
  readonly i_dem:              number
  readonly in_geral:           number
  readonly tipo_ligacao_cemig: string
  readonly ramal_min_mm2:      number
  readonly n_ativos:           number
  readonly n_reservas:         number
  readonly n_total_qd:         number
  readonly violacoes:          ResultadoNorma[]
}

// ── Estado calculado completo (saída imutável) ────────────────────
export interface EstadoCalculado {
  readonly timestamp:    string              // ISO — quando foi calculado
  // Pipeline completo (estágios explícitos) — disponível para debug/auditoria
  readonly pipeline:     CircuitoPipelined[]
  readonly valido:       boolean             // todos os invariantes OK
  readonly invariantes:  string[]            // problemas de topologia

  readonly circuitos:    CircuitoSolvido[]
  readonly segmentos:    SegmentoSolvido[]
  readonly demanda:      DemandaSolvida | null

  // Métricas globais (derivadas — não armazenar separado)
  readonly n_ok:         number
  readonly n_aviso:      number
  readonly n_erro:       number
  readonly iq_pct:       number              // índice de qualidade 0-100
  readonly total_va:     number
  readonly total_real_w: number
}

// ── O Solver ─────────────────────────────────────────────────────
export function solve(dominio: DominioDeclarativo): EstadoCalculado {
  const { projeto, circuitos, rede } = dominio

  // ─ 1. Verificar invariantes da topologia ─────────────────────
  const invariantes = verificarInvariantes(rede)
  const valido = invariantes.length === 0

  // ─ 2. Propagar fluxo na rede (topologia → corrente) ──────────
  // (por enquanto usado para análise futura; circuitos legados usam engine diretamente)
  // propagarFluxo será usado na Etapa 2 (corrente dinâmica por segmento)
  // const _fluxos = rede.nos.length > 0 ? propagarFluxo(rede) : new Map()

  // ─ 3a. Pipeline explícito (estágios tipados) ─────────────────
  const pipelineResults: CircuitoPipelined[] = circuitos.map(raw => resolverCircuito({
    id: raw.id, descricao: raw.descricao, tipo: raw.tipo,
    fase: raw.fase, potencia_va: raw.potencia_va ?? 0,
    potencia_real_w: raw.potencia_real_w,
    comprimento_m: raw.comprimento_m ?? 0,
    n_agrup: raw.n_agrup ?? 1,
    v_fase: projeto.v_fase,
    metodo: projeto.metodo_instalacao,
    isolacao: projeto.isolacao as any,
    material: projeto.material_cabo as any,
    t_amb: projeto.t_amb,
    du_max_pct: projeto.du_max_pct,
    du_ramal_pct: projeto.du_ramal_pct,
    icc_rede_ka: projeto.icc_rede_ka,
  }))

  // ─ 3b. Dimensionar via engine legado (compatibilidade com UI existente)
  const circuitosSolvidos: CircuitoSolvido[] = circuitos.map(raw => {
    if (!raw.potencia_va || raw.potencia_va <= 0) {
      return {
        id: raw.id, descricao: raw.descricao, tipo: raw.tipo,
        fase: raw.fase, tensao_v: 0, ib: 0, ft: 1, fa: 1,
        secao_fase: 0, secao_neutro: 0, secao_pe: 0,
        iz_nominal: 0, iz_efetiva: 0, in_disj: 0,
        curva: 'C', idr: false, du_calc: 0, du_acum: 0,
        potencia_va: 0, potencia_real_w: raw.potencia_real_w,
        violacoes: [], status: 'SEM_DADOS' as const,
      }
    }

    // Chamar engine puro — retorna resultado sem mutar raw
    const r = dimensionarCircuito({
      ...raw,
      v_fase:      projeto.v_fase,
      metodo:      projeto.metodo_instalacao,
      isolacao:    projeto.isolacao as any,
      material:    projeto.material_cabo as any,
      t_amb:       projeto.t_amb,
      du_max:      projeto.du_max_pct,
      du_ramal:    projeto.du_ramal_pct,
      icc_rede_ka: projeto.icc_rede_ka,
    })

    // Construir contexto para regras (somente leitura)
    const ctx: CircuitoContext = {
      id:            raw.id,
      tipo:          raw.tipo,
      descricao:     raw.descricao,
      ib:            r.ib,
      in_disj:       r.in_disj,
      iz_nominal:    r.iz_nominal,
      iz_efetiva:    r.iz_efetiva,
      secao_mm2:     r.secao_fase,
      du_pct:        r.du_calc,
      du_max_pct:    projeto.du_max_pct,
      du_ramal_pct:  projeto.du_ramal_pct,
      idr:           r.idr,
      fase:          raw.fase,
      comprimento_m: raw.comprimento_m,
      n_agrup:       raw.n_agrup,
      ft:            r.ft,
      fa:            r.fa,
    }

    // Aplicar todas as regras normativas
    const violacoes = validarCircuito(ctx)
    const status = violacoes.some(v => v.severidade === 'erro') ? 'ERRO'
                 : violacoes.some(v => v.severidade === 'aviso') ? 'AVISO'
                 : 'OK'

    return {
      id: r.id, descricao: r.descricao, tipo: r.tipo, fase: r.fase,
      tensao_v: r.tensao_v, ib: r.ib, ft: r.ft, fa: r.fa,
      secao_fase: r.secao_fase, secao_neutro: r.secao_neutro, secao_pe: r.secao_pe,
      iz_nominal: r.iz_nominal, iz_efetiva: r.iz_efetiva,
      in_disj: r.in_disj, curva: r.curva, idr: r.idr,
      du_calc: r.du_calc, du_acum: r.du_acum,
      potencia_va: raw.potencia_va,
      potencia_real_w: raw.potencia_real_w,
      violacoes,
      status: status as 'OK' | 'AVISO' | 'ERRO',
    }
  })

  // ─ 4. Analisar segmentos da rede ─────────────────────────────
  const segmentosSolvidos: SegmentoSolvido[] = rede.segmentos.map(seg => {
    const analise = analisarSegmento(seg)
    const ctx: SegmentoContext = {
      id: seg.id, nome: seg.nome,
      diametro_mm: seg.diametro_mm,
      area_interna_mm2: analise.area_interna_mm2,
      area_condutores_mm2: analise.area_condutores_mm2,
      taxa_ocupacao_pct: analise.taxa_ocupacao_pct,
      n_circuitos: analise.n_circuitos_distintos,
      fa_resultante: analise.fa_resultante,
    }
    const violacoes = ocupacaoEletroduto(ctx)
    return {
      id: seg.id, nome: seg.nome,
      area_condutores_mm2: analise.area_condutores_mm2,
      area_interna_mm2: analise.area_interna_mm2,
      taxa_ocupacao_pct: analise.taxa_ocupacao_pct,
      status_ocupacao: analise.status_ocupacao,
      n_circuitos: analise.n_circuitos_distintos,
      fa_resultante: analise.fa_resultante,
      violacoes,
    }
  })

  // ─ 5. Calcular demanda ────────────────────────────────────────
  const ciAtivos = circuitosSolvidos.filter(c => c.potencia_va > 0)

  let demanda: DemandaSolvida | null = null
  if (ciAtivos.length > 0) {
    // Converter para formato do engine (compatibilidade)
    const ciParaDemanda = ciAtivos.map(c => ({
      potencia_va: c.potencia_va, status: c.status, ib: c.ib,
      in_disj: c.in_disj, iz_efetiva: c.iz_efetiva,
      du_calc: c.du_calc, idr: c.idr, fase: c.fase,
      tipo: c.tipo, descricao: c.descricao, id: c.id,
    })) as any[]

    const d = calcularDemanda(ciParaDemanda, projeto.v_fase, projeto.fp_global)
    const violacoes_qd = reservasQD(d.n_ativos, d.n_reservas)

    demanda = {
      ci_kw:              d.ci_kw,
      fd:                 d.fd,
      dem_kw:             d.dem_kw,
      i_dem:              d.i_dem,
      in_geral:           d.in_geral,
      tipo_ligacao_cemig: d.tipo_ligacao_cemig,
      ramal_min_mm2:      d.ramal_min_mm2,
      n_ativos:           d.n_ativos,
      n_reservas:         d.n_reservas,
      n_total_qd:         d.n_total_qd,
      violacoes:          violacoes_qd,
    }
  }

  // ─ 6. Métricas globais ────────────────────────────────────────
  const n_ok    = ciAtivos.filter(c => c.status === 'OK').length
  const n_aviso = ciAtivos.filter(c => c.status === 'AVISO').length
  const n_erro  = ciAtivos.filter(c => c.status === 'ERRO').length
  const iq_pct  = ciAtivos.length > 0
    ? Math.round((n_ok / ciAtivos.length) * 100)
    : 0
  const total_va     = ciAtivos.reduce((s, c) => s + c.potencia_va, 0)
  const total_real_w = ciAtivos.reduce((s, c) => s + (c.potencia_real_w ?? 0), 0)

  return {
    timestamp: new Date().toISOString(),
    valido,
    invariantes,
    pipeline: pipelineResults,
    circuitos:  circuitosSolvidos,
    segmentos:  segmentosSolvidos,
    demanda,
    n_ok, n_aviso, n_erro, iq_pct,
    total_va, total_real_w,
  }
}

// ── Comparar dois estados calculados (para undo/redo/auditoria) ───
export function diffEstados(anterior: EstadoCalculado, atual: EstadoCalculado): string[] {
  const mudancas: string[] = []

  if (anterior.n_ok !== atual.n_ok)
    mudancas.push(`Circuitos OK: ${anterior.n_ok} → ${atual.n_ok}`)
  if (anterior.n_erro !== atual.n_erro)
    mudancas.push(`Erros: ${anterior.n_erro} → ${atual.n_erro}`)
  if (Math.abs(anterior.total_va - atual.total_va) > 10)
    mudancas.push(`CI: ${(anterior.total_va/1000).toFixed(2)}kW → ${(atual.total_va/1000).toFixed(2)}kW`)
  if (anterior.demanda?.in_geral !== atual.demanda?.in_geral)
    mudancas.push(`Disj. geral: ${anterior.demanda?.in_geral}A → ${atual.demanda?.in_geral}A`)

  return mudancas
}
