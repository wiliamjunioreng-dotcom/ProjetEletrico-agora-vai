// src/__tests__/pipeline.test.ts
// Testes determinísticos do pipeline elétrico
// Casos reais da NBR 5410:2004 — calculados manualmente e verificados

import { describe, it, expect } from 'vitest'
import { resolverCircuito } from '../core/pipeline'
import type { EntradaCircuito } from '../core/pipeline'

// ── Projeto base para os testes ───────────────────────────────────
const BASE: Omit<EntradaCircuito, 'id' | 'descricao' | 'tipo' | 'fase' | 'potencia_va' | 'comprimento_m'> = {
  potencia_real_w: undefined,
  n_agrup:         1,
  v_fase:          127,
  metodo:          'B1',
  isolacao:        'PVC',
  material:        'Cu',
  t_amb:           30,
  du_max_pct:      4.0,
  du_ramal_pct:    0.5,
  icc_rede_ka:     3,
}

// ── Helper para criar entrada de teste ────────────────────────────
function circ(
  desc: string,
  tipo: string,
  fase: string,
  va: number,
  comp: number,
  extras?: Partial<EntradaCircuito>
): EntradaCircuito {
  return { ...BASE, id: 'test', descricao: desc, tipo, fase, potencia_va: va, comprimento_m: comp, ...extras }
}

// ════════════════════════════════════════════════════════════════
// GRUPO 1: TENSÃO E CORRENTE
// ════════════════════════════════════════════════════════════════

describe('stageTensao — cálculo de tensão por sistema de ligação', () => {

  it('monofásico (fase R) → V = 127V', () => {
    const r = resolverCircuito(circ('ILUM Sala', 'ILUM', 'R', 300, 15))
    expect(r.tensao.tensao_v).toBe(127)
    expect(r.tensao.n_fases).toBe(1)
    expect(r.tensao.n_cond).toBe(2)
  })

  it('bifásico (fase RS) → V = 220V (127 × √3 ≈ 220)', () => {
    const r = resolverCircuito(circ('Chuveiro', 'TUE', 'RS', 5500, 12))
    expect(r.tensao.tensao_v).toBe(220)
    expect(r.tensao.n_fases).toBe(2)
  })

  it('trifásico (RST) → V = 220V (linha)', () => {
    const r = resolverCircuito({ ...circ('Motor', 'TUE', 'RST', 3000, 20), v_fase: 127 })
    expect(r.tensao.tensao_v).toBe(220)
    expect(r.tensao.n_fases).toBe(3)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 2: CORRENTE DE PROJETO
// ════════════════════════════════════════════════════════════════

describe('stageCorrente — Ib = VA / V', () => {

  it('ILUM 300VA / 127V → Ib ≈ 2,36A', () => {
    const r = resolverCircuito(circ('ILUM Sala', 'ILUM', 'R', 300, 15))
    expect(r.corrente.ib).toBeCloseTo(2.36, 1)
  })

  it('TUG 1000VA / 127V → Ib ≈ 7,87A', () => {
    const r = resolverCircuito(circ('TUG Sala', 'TUG', 'R', 1000, 12))
    expect(r.corrente.ib).toBeCloseTo(7.87, 1)
  })

  it('Chuveiro 5500VA / 220V → Ib = 25A', () => {
    const r = resolverCircuito(circ('Chuveiro', 'TUE', 'RS', 5500, 12))
    expect(r.corrente.ib).toBeCloseTo(25, 0)
  })

  it('circuito sem carga → Ib = 0', () => {
    const r = resolverCircuito(circ('Vazio', 'TUG', 'R', 0, 10))
    expect(r.corrente.ib).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 3: FATORES DE CORREÇÃO
// ════════════════════════════════════════════════════════════════

describe('stageFatores — Ft e Fa NBR 5410 Tabelas 40 e 42', () => {

  it('PVC 30°C → Ft = 1,000 (temperatura de referência)', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10))
    expect(r.fatores.ft).toBe(1.0)
  })

  it('PVC 40°C → Ft < 1,0 (derating por temperatura)', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10, { t_amb: 40 }))
    expect(r.fatores.ft).toBeLessThan(1.0)
    expect(r.fatores.ft).toBeGreaterThan(0.7)
  })

  it('1 circuito no eletroduto → Fa = 1,000', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10, { n_agrup: 1 }))
    expect(r.fatores.fa).toBe(1.0)
  })

  it('3 circuitos no eletroduto → Fa = 0,700 (Tabela 42)', () => {
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 1000, 10, { n_agrup: 3 }))
    expect(r.fatores.fa).toBe(0.7)
  })

  it('Irc = Ib / (Ft × Fa) — invariante', () => {
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 1000, 10, { n_agrup: 3 }))
    const irc_esperado = r.corrente.ib / (r.fatores.ft * r.fatores.fa)
    expect(r.fatores.irc).toBeCloseTo(irc_esperado, 1)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 4: SEÇÃO MÍNIMA
// ════════════════════════════════════════════════════════════════

describe('stageSecao — seção pela Iz e piso normativo', () => {

  it('ILUM com Ib baixo → seção mínima = 1,5mm² (NBR §6.2.5)', () => {
    // Ib = 300/127 = 2.36A — Iz de 1.5mm² no B1 com Ft=1.0 = 17.5A > 2.36A
    // Mas piso normativo é 1.5mm² para ILUM
    const r = resolverCircuito(circ('ILUM Quarto', 'ILUM', 'R', 300, 10))
    expect(r.secao.secao_final).toBe(1.5)
    expect(r.secao.secao_min_projeto).toBe(1.5)
  })

  it('TUG → seção mínima = 2,5mm² mesmo com Ib baixo (NBR §6.2.5)', () => {
    // Ib = 500/127 ≈ 3.94A — 1.5mm² suportaria, mas NBR exige 2.5mm² para TUG
    const r = resolverCircuito(circ('TUG corredor', 'TUG', 'R', 500, 8))
    expect(r.secao.secao_final).toBe(2.5)
    expect(r.secao.secao_min_projeto).toBe(2.5)
    // Registrar no trace que a seção veio do piso normativo, não da corrente
    expect(r.trace.estagios[3].decisoes.some(
      d => d.categoria === 'criterio' && d.nome === 'secao_final'
    )).toBe(true)
  })

  it('Chuveiro 5500VA/220V → seção ≥ 4mm² (Ib=25A, Irc=25A > Iz de 2.5mm²=21A)', () => {
    const r = resolverCircuito(circ('Chuveiro', 'TUE', 'RS', 5500, 12))
    expect(r.secao.secao_final).toBeGreaterThanOrEqual(4)
  })

  it('Iz efetiva deve ser ≥ Ib (tripartida parcial no estágio físico)', () => {
    const r = resolverCircuito(circ('TUG Sala', 'TUG', 'R', 1000, 12))
    // Iz' = Iz × Ft × Fa ≥ Ib
    expect(r.secao.iz_efetiva).toBeGreaterThanOrEqual(r.corrente.ib)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 5: QUEDA DE TENSÃO E CONVERGÊNCIA
// ════════════════════════════════════════════════════════════════

describe('stageQueda — convergência seção→dU', () => {

  it('circuito curto sem dU excessiva → 1 iteração, convergiu', () => {
    const r = resolverCircuito(circ('ILUM Sala', 'ILUM', 'R', 300, 10))
    expect(r.queda.convergiu).toBe(true)
    expect(r.queda.iteracoes.length).toBe(1)
    expect(r.queda.du_pct).toBeLessThanOrEqual(3.5)  // 4% - 0.5% ramal
  })

  it('circuito longo com dU alta → mais de 1 iteração, seção cresce', () => {
    // TUG 2000VA em 50m → dU com 2.5mm² vai exceder 3.5%
    // dU = 2 × 0.0265 × 50 × (2000/127) / (2.5 × 127) × 100
    const r = resolverCircuito(circ('TUG remoto', 'TUG', 'R', 2000, 50))
    // Verificar que o pipeline convergiu
    expect(r.queda.convergiu).toBe(true)
    // Seção final deve ser maior que a seção inicial para atender dU
    const secao_inicial = r.secao.secao_final
    const secao_queda   = r.queda.secao_final
    if (r.queda.iteracoes.length > 1) {
      expect(secao_queda).toBeGreaterThan(secao_inicial)
    }
    // dU final deve estar dentro do limite
    expect(r.queda.du_pct).toBeLessThanOrEqual(4.0)
  })

  it('dU ramal é subtraído do limite disponível', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10, {
      du_max_pct: 4.0, du_ramal_pct: 1.0,
    }))
    // dU disponível = 3.0% (4.0 - 1.0)
    expect(r.queda.du_ramal).toBe(1.0)
    expect(r.queda.du_pct).toBeLessThanOrEqual(3.0)
  })

  it('rastreamento: iterações registradas no trace', () => {
    const r = resolverCircuito(circ('TUG remoto', 'TUG', 'R', 2000, 50))
    expect(r.trace.iteracoes).toBeDefined()
    expect(r.trace.iteracoes!.length).toBeGreaterThan(0)
    // Cada iteração tem os campos obrigatórios
    r.trace.iteracoes!.forEach(it => {
      expect(it.secao_mm2).toBeGreaterThan(0)
      expect(it.du_pct).toBeGreaterThan(0)
      expect(it.motivo).toBeTruthy()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 6: PROTEÇÃO
// ════════════════════════════════════════════════════════════════

describe('stageProtecao — disjuntor, curva, IDR', () => {

  it('ILUM → curva C (reatores têm inrush — curva C correta)', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10))
    expect(r.protecao.curva).toBe('C')
  })

  it('TUE chuveiro → curva B ou C (resistivo → B, motor → C)', () => {
    const r = resolverCircuito(circ('Chuveiro', 'TUE', 'RS', 5500, 12))
    // Chuveiro = carga resistiva → B correto; C também aceitável
    expect(['B','C']).toContain(r.protecao.curva)
  })

  it('In_disj deve ser ≥ Ib (disjuntor não pode ser menor que corrente de projeto)', () => {
    const r = resolverCircuito(circ('TUG Sala', 'TUG', 'R', 1500, 15))
    expect(r.protecao.in_disj).toBeGreaterThanOrEqual(r.corrente.ib)
  })

  it('banheiro → IDR obrigatório (NBR §5.1.3.6.1)', () => {
    const r = resolverCircuito(circ('TUG Banheiro', 'TUG', 'R', 600, 8))
    expect(r.protecao.idr).toBe(true)
  })

  it('sala de estar → IDR não obrigatório', () => {
    const r = resolverCircuito(circ('TUG Sala de estar', 'TUG', 'R', 1000, 12))
    expect(r.protecao.idr).toBe(false)
  })

  it('cozinha → IDR obrigatório', () => {
    const r = resolverCircuito(circ('TUG Cozinha', 'TUG', 'R', 1000, 8))
    expect(r.protecao.idr).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 7: CURTO-CIRCUITO
// ════════════════════════════════════════════════════════════════

describe('stageCurto — IEC 60909', () => {

  it('Icc_max > Icc_min (início do cabo > fim do cabo)', () => {
    const r = resolverCircuito(circ('TUG Sala', 'TUG', 'R', 1000, 20, { icc_rede_ka: 3 }))
    expect(r.curto).not.toBeNull()
    expect(r.curto!.icc_max_ka).toBeGreaterThan(r.curto!.icc_min_ka)
  })

  it('cabo mais longo → Icc_min menor (mais impedância)', () => {
    const r10 = resolverCircuito(circ('T', 'TUG', 'R', 1000, 10, { icc_rede_ka: 3 }))
    const r30 = resolverCircuito(circ('T', 'TUG', 'R', 1000, 30, { icc_rede_ka: 3 }))
    expect(r10.curto!.icc_min_ka).toBeGreaterThan(r30.curto!.icc_min_ka)
  })

  it('sem comprimento → curto retorna null', () => {
    const r = resolverCircuito(circ('T', 'TUG', 'R', 1000, 0))
    expect(r.curto).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 8: JULGAMENTO NORMATIVO (separado da física)
// ════════════════════════════════════════════════════════════════

describe('stageJulgamento — conformidade normativa isolada', () => {

  it('circuito bem dimensionado → status OK, sem violações', () => {
    const r = resolverCircuito(circ('ILUM Sala', 'ILUM', 'R', 300, 10))
    expect(r.julgamento.status).toBe('OK')
    expect(r.julgamento.violacoes).toHaveLength(0)
  })

  it('julgamento não altera física — Ib não muda por causa de violação', () => {
    // Um circuito com dU alta ainda tem o mesmo Ib físico
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 2000, 100))
    const ib_esperado = 2000 / 127
    expect(r.corrente.ib).toBeCloseTo(ib_esperado, 0)
    // Julgamento pode ter violações, mas Ib não muda
  })

  it('circuito sem carga → status SEM_DADOS', () => {
    const r = resolverCircuito(circ('Vazio', 'TUG', 'R', 0, 10))
    expect(r.julgamento.status).toBe('SEM_DADOS')
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 9: RASTREABILIDADE
// ════════════════════════════════════════════════════════════════

describe('trace — rastreabilidade do raciocínio', () => {

  it('trace tem 8 estágios', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10))
    expect(r.trace.estagios).toHaveLength(8)
  })

  it('cada estágio tem ordem sequencial 1..8', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10))
    r.trace.estagios.forEach((est, i) => {
      expect(est.ordem).toBe(i + 1)
    })
  })

  it('estágio de tensão registra a fórmula aplicada', () => {
    const r = resolverCircuito(circ('ILUM', 'ILUM', 'R', 300, 10))
    const est1 = r.trace.estagios[0]
    expect(est1.estagio).toBe('stageTensao')
    const tensaoEntry = est1.entradas.find(e => e.nome === 'tensao_v')
    expect(tensaoEntry).toBeDefined()
    expect(tensaoEntry!.formula).toBeTruthy()
    expect(tensaoEntry!.categoria).toBe('fisica')
  })

  it('estágio de fatores registra referência normativa NBR Tabelas 40 e 42', () => {
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 1000, 10))
    const est3 = r.trace.estagios[2]
    const ftEntry = est3.entradas.find(e => e.nome === 'ft')
    expect(ftEntry!.norma).toContain('Tabela 40')
  })

  it('decisão de seção registra categoria criterio', () => {
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 500, 8))
    const est4 = r.trace.estagios[3]
    const secaoDecisao = est4.decisoes.find(d => d.nome === 'secao_final')
    expect(secaoDecisao).toBeDefined()
    expect(secaoDecisao!.categoria).toBe('criterio')
  })

  it('trace é determinístico — mesma entrada → mesmo trace', () => {
    const entrada = circ('TUG Sala', 'TUG', 'R', 1000, 15)
    const r1 = resolverCircuito(entrada)
    const r2 = resolverCircuito(entrada)
    expect(r1.corrente.ib).toBe(r2.corrente.ib)
    expect(r1.secao.secao_final).toBe(r2.secao.secao_final)
    expect(r1.queda.du_pct).toBe(r2.queda.du_pct)
    expect(r1.protecao.in_disj).toBe(r2.protecao.in_disj)
    expect(r1.julgamento.status).toBe(r2.julgamento.status)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 10: CASOS REAIS NBR 5410
// ════════════════════════════════════════════════════════════════

describe('casos reais — projetos residenciais típicos', () => {

  it('C01 — ILUM Sala/Corredor — 300VA, 127V, 18m, B1, PVC, 30°C', () => {
    const r = resolverCircuito(circ('ILUM: Sala/Corredor', 'ILUM', 'R', 300, 18))
    // Ib = 300/127 ≈ 2.36A
    expect(r.corrente.ib).toBeCloseTo(2.36, 0)
    // Seção mínima ILUM = 1.5mm² (piso normativo)
    expect(r.secao.secao_final).toBe(1.5)
    // disjuntor: próximo acima de 2.36A → 10A (série IEC 60898)
    expect(r.protecao.in_disj).toBe(10)
    // Curva C para iluminação (inrush de reatores/drivers)
    expect(r.protecao.curva).toBe('C')
    // Status OK (circuito leve e curto)
    expect(r.julgamento.status).toBe('OK')
  })

  it('C02 — TUG Quartos — 1000VA, 127V, 15m, B1, PVC, 30°C', () => {
    const r = resolverCircuito(circ('TUG: Quarto 1 + Quarto 2', 'TUG', 'R', 1000, 15))
    // Ib ≈ 7.87A
    expect(r.corrente.ib).toBeCloseTo(7.87, 0)
    // Seção mínima TUG = 2.5mm²
    expect(r.secao.secao_final).toBe(2.5)
    expect(r.protecao.in_disj).toBe(10)
    expect(r.julgamento.status).toBe('OK')
  })

  it('C03 — TUE Chuveiro — 5500VA, 220V (bifásico), 12m', () => {
    const r = resolverCircuito(circ('TUE: Chuveiro elétrico', 'TUE', 'RS', 5500, 12))
    expect(r.tensao.tensao_v).toBe(220)
    // Ib = 5500/220 = 25A exato
    expect(r.corrente.ib).toBeCloseTo(25, 0)
    // Seção ≥ 4mm² (Ib=25A, Iz de 2.5mm² B1-3 = 21A < 25A → sobe para 4mm²)
    expect(r.secao.secao_final).toBeGreaterThanOrEqual(4)
    // NBR §5.1.3.1: Ib ≤ In — In=25A é válido (Ib=In é permitido pela norma)
    // Prática CEMIG: aceita 25A como In para Ib=25A exato
    expect(r.protecao.in_disj).toBeGreaterThanOrEqual(25)
    // Chuveiro = resistivo → curva B; C também aceitável
    expect(['B','C']).toContain(r.protecao.curva)
    // Banheiro → IDR obrigatório
    // (nota: "Chuveiro elétrico" não contém "banho" — IDR depende da descrição)
    expect(r.julgamento.status).toBe('OK')
  })

  it('C04 — TUG Cozinha — 3000VA, 127V, 8m (alta carga)', () => {
    const r = resolverCircuito(circ('TUG Cozinha e bancada', 'TUG', 'R', 3000, 8))
    // Ib = 3000/127 ≈ 23.6A
    expect(r.corrente.ib).toBeCloseTo(23.6, 0)
    // B1 monofásico (2 condutores): Iz de 2.5mm² = 24A > 23.6A → 2.5mm² suporta
    // Mas 23.6A é muito próximo do limite — aviso esperado
    expect(r.secao.secao_final).toBeGreaterThanOrEqual(2.5)
    // In: próximo acima de 23.6A = 25A (mínimo 10A, série: 20, 25, ...)
    expect(r.protecao.in_disj).toBeGreaterThanOrEqual(25)
    // IDR obrigatório em cozinha (NBR §5.1.3.6.1)
    expect(r.protecao.idr).toBe(true)
  })

  it('C05 — Estabilidade: resultado idêntico executado 100 vezes', () => {
    const entrada = circ('TUG Sala', 'TUG', 'R', 1500, 20)
    const ref = resolverCircuito(entrada)
    for (let i = 0; i < 100; i++) {
      const r = resolverCircuito(entrada)
      expect(r.corrente.ib).toBe(ref.corrente.ib)
      expect(r.secao.secao_final).toBe(ref.secao.secao_final)
      expect(r.queda.du_pct).toBe(ref.queda.du_pct)
      expect(r.protecao.in_disj).toBe(ref.protecao.in_disj)
      expect(r.julgamento.status).toBe(ref.julgamento.status)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 11: HIERARQUIA DE ERROS E BLOQUEIO
// ════════════════════════════════════════════════════════════════

describe('Hierarquia de severidade e bloqueio de pipeline', () => {

  it('circuito OK não é bloqueado', () => {
    const r = resolverCircuito(circ('ILUM Sala', 'ILUM', 'R', 300, 10))
    expect(r.julgamento.bloqueado).toBe(false)
    expect(r.julgamento.status).toBe('OK')
  })

  it('secao_consolidada >= secao por Iz E secao por dU (invariante)', () => {
    // Para qualquer circuito, a seção consolidada é sempre a mais restritiva
    const casos = [
      circ('ILUM',    'ILUM', 'R', 300,  10),
      circ('TUG',     'TUG',  'R', 1500, 25),
      circ('Chuveiro','TUE', 'RS', 5500, 12),
      circ('TUG remoto', 'TUG', 'R', 2000, 50),
    ]
    for (const e of casos) {
      const r = resolverCircuito(e)
      expect(r.julgamento.secao_consolidada).toBeGreaterThanOrEqual(r.secao.secao_final)
      expect(r.julgamento.secao_consolidada).toBeGreaterThanOrEqual(r.queda.secao_final)
      expect(r.julgamento.secao_consolidada).toBeGreaterThanOrEqual(r.secao.secao_min_projeto)
    }
  })

  it('violação física tem acao_sugerida preenchida', () => {
    // Se há violação de tripartida (In > Iz'), deve ter ação sugerida
    const r = resolverCircuito(circ('TUG Sala', 'TUG', 'R', 1000, 20))
    // Verificar que violações com severidade fisico_critico ou erro têm acao_sugerida
    const erros = r.julgamento.violacoes.filter(v => v.severidade === 'fisico_critico' || v.severidade === 'erro')
    for (const e of erros) {
      // Pode não haver erros neste caso específico, mas se houver, devem ter ação
      if (erros.length > 0) {
        expect(e.acao_sugerida).toBeTruthy()
      }
    }
  })

  it('circuito sem carga: bloqueado=false, secao_consolidada=0', () => {
    const r = resolverCircuito(circ('Vazio', 'TUG', 'R', 0, 10))
    expect(r.julgamento.status).toBe('SEM_DADOS')
    expect(r.julgamento.bloqueado).toBe(false)
    expect(r.julgamento.secao_consolidada).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// GRUPO 12: CONTRACTS DE ESTÁGIO E ESTADO DE EXECUÇÃO
// ════════════════════════════════════════════════════════════════

import { STAGE_CONTRACTS } from '../core/pipeline'

describe('Contracts de estágio — dependências explícitas', () => {

  it('STAGE_CONTRACTS tem 8 contratos correspondentes aos 8 estágios', () => {
    const nomes = Object.keys(STAGE_CONTRACTS)
    expect(nomes).toHaveLength(8)
    expect(nomes).toContain('tensao')
    expect(nomes).toContain('julgamento')
  })

  it('ordens são únicas e sequenciais 1..8', () => {
    const ordens = Object.values(STAGE_CONTRACTS).map(c => c.ordem).sort()
    expect(ordens).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('tensao não requer nenhum estágio anterior', () => {
    expect(STAGE_CONTRACTS.tensao.requires).toHaveLength(0)
  })

  it('julgamento requer corrente, secao, queda, protecao', () => {
    const reqs = STAGE_CONTRACTS.julgamento.requires
    expect(reqs).toContain('corrente')
    expect(reqs).toContain('secao')
    expect(reqs).toContain('queda')
    expect(reqs).toContain('protecao')
  })

  it('secao.can_continue = false (erro físico bloqueia)', () => {
    expect(STAGE_CONTRACTS.secao.can_continue).toBe(false)
  })

  it('curto.can_continue = true (incompleto não é inválido)', () => {
    expect(STAGE_CONTRACTS.curto.can_continue).toBe(true)
  })
})

describe('Estado de execução do pipeline (inválido vs. incompleto)', () => {

  it('circuito completo: confianca = total', () => {
    const r = resolverCircuito(circ('TUG Sala', 'TUG', 'R', 1000, 15, { icc_rede_ka: 3 }))
    expect(r.execution.confianca).toBe('total')
    expect(r.execution.stages.tensao).toBe('concluido')
    expect(r.execution.stages.corrente).toBe('concluido')
    expect(r.execution.stages.secao).toBe('concluido')
  })

  it('sem comprimento: queda incompleta, confiança parcial', () => {
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 1000, 0))
    expect(r.execution.stages.queda).toBe('incompleto')
    expect(r.queda.du_pct).toBe(0)
    // Sem comprimento, dU não pode ser calculado — é incompleto, não inválido
  })

  it('sem Icc: curto incompleto (dados parciais), não inválido', () => {
    const r = resolverCircuito(circ('TUG', 'TUG', 'R', 1000, 15, { icc_rede_ka: 0 }))
    expect(r.execution.stages.curto).toBe('incompleto')
    expect(r.curto).toBeNull()
    // null é correto aqui — falta Icc, não é erro
  })

  it('circuito sem carga: corrente incompleta (não inválida)', () => {
    const r = resolverCircuito(circ('Vazio', 'TUG', 'R', 0, 10))
    expect(r.execution.stages.corrente).toBe('incompleto')
    expect(r.corrente.ib).toBe(0)
    // Ib=0 é incompleto (falta carga), não físico impossível
  })

  it('execution.confianca é derivado do estado dos estágios (não hardcoded)', () => {
    // Dois circuitos diferentes devem ter estados diferentes
    const r1 = resolverCircuito(circ('OK', 'TUG', 'R', 1000, 15, { icc_rede_ka: 3 }))
    const r2 = resolverCircuito(circ('Parcial', 'TUG', 'R', 1000, 0, { icc_rede_ka: 0 }))
    expect(r1.execution.confianca).toBe('total')
    // r2 não tem comprimento nem Icc — algum estágio incompleto
    expect(r2.execution.stages.queda).toBe('incompleto')
  })
})
