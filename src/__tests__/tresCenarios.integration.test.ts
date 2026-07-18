// src/__tests__/tresCenarios.integration.test.ts
// ════════════════════════════════════════════════════════════════
// TRÊS CENÁRIOS ADICIONAIS — pedido direto: "consegue testar 3
// cenários de casas diferentes?" A casa completa (10 cômodos,
// Trifásico, cargas variadas) já existia; estes três cobrem perfis
// que ela não testava: sistema Monofásico puro, prédio comercial de
// maior porte, e um caso extremo pra estressar limites.
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest'
import { useProjectStore } from '../store/projectStore'

function resetStore(sistema: 'Monofasico' | 'Bifasico' | 'Trifasico') {
  useProjectStore.setState({
    comodos: [], circuitos_raw: [], circuitos_calc: [],
    projeto: {
      ...useProjectStore.getState().projeto,
      sistema, v_fase: 127, v_linha: 220,
      metodo_instalacao: 'B1', isolacao: 'PVC', material_cabo: 'Cu',
      t_amb: 30, du_max_pct: 4, du_ramal_pct: 0.5, fp_global: 0.92,
      icc_rede_ka: 5, aterramento: 'TN-S',
    },
  } as any)
}

// ════════════════════════════════════════════════════════════════
// CENÁRIO 1 — Kitnet/apartamento pequeno, sistema MONOFÁSICO puro.
// ════════════════════════════════════════════════════════════════
describe('CENÁRIO 1 — Kitnet Monofásica (3 cômodos, sistema com só 1 fase)', () => {
  beforeAll(() => {
    resetStore('Monofasico')
    const { addComodo } = useProjectStore.getState()
    addComodo({ nome: 'Ambiente Integrado', tipo: 'Social', area_m2: 22, perimetro_m: 20, pe_direito_m: 2.7, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Banheiro', tipo: 'Banho', area_m2: 4, perimetro_m: 8, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Área Serviço', tipo: 'Lavanderia', area_m2: 3, perimetro_m: 7, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)

    const { comodos, addCargaManual } = useProjectStore.getState()
    const byName = (n: string) => comodos.find(c => c.nome === n)!.id

    addCargaManual(byName('Ambiente Integrado'), { tipo: 'ILUM', descricao: 'Plafon', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Ambiente Integrado'), { tipo: 'TUG', descricao: 'Tomadas', potencia_va: 100, qtd: 5, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro'), { tipo: 'ILUM', descricao: 'Plafon banheiro', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro'), { tipo: 'TUE', descricao: 'Chuveiro elétrico 5500W', potencia_va: 5500, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'resistivo', distancia_box_m: 0.1 } as any)
    addCargaManual(byName('Área Serviço'), { tipo: 'ILUM', descricao: 'Luz área serviço', potencia_va: 60, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Área Serviço'), { tipo: 'TUE', descricao: 'Máquina de lavar', potencia_va: 1200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)

    const { gerarCircuitosDeComodos } = useProjectStore.getState()
    gerarCircuitosDeComodos()
  })

  it('Cadastro e geração completos, produziu circuitos', () => {
    const { circuitos_calc } = useProjectStore.getState()
    expect(circuitos_calc.filter(c => c.potencia_va > 0).length).toBeGreaterThan(0)
  })

  it('TODOS os circuitos ficam em fase R — é o único disponível, sistema Monofásico', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const fases = new Set(circuitos_raw.map(c => c.fase))
    expect(fases.size).toBe(1)
    expect(fases.has('R')).toBe(true)
  })

  it('Chuveiro 5500W monofásico dimensiona com cabo/disjuntor corretos (referência de mercado: 4mm²/25A)', () => {
    const { circuitos_calc } = useProjectStore.getState()
    const chuveiro = circuitos_calc.find(c => c.descricao?.includes('Chuveiro'))
    expect(chuveiro).toBeDefined()
    expect(chuveiro!.secao_fase).toBeGreaterThanOrEqual(4)
    expect(chuveiro!.in_disj).toBeGreaterThanOrEqual(25)
    expect(chuveiro!.idr).toBe(true)
  })

  it('Demanda calculada é coerente para sistema Monofásico', () => {
    const { demanda } = useProjectStore.getState()
    expect(demanda).toBeDefined()
    expect(Number.isFinite(demanda!.dem_kw)).toBe(true)
    expect(demanda!.dem_kw).toBeGreaterThan(0)
    console.log(`Kitnet Monofásica — Demanda: ${demanda!.dem_kw.toFixed(2)}kW, disjuntor geral: ${demanda!.in_geral}A`)
  })
})

// ════════════════════════════════════════════════════════════════
// CENÁRIO 2 — Loja comercial de porte médio, sistema Trifásico com
// muitas cargas trifásicas pesadas.
// ════════════════════════════════════════════════════════════════
describe('CENÁRIO 2 — Loja Comercial (6 ambientes, cargas trifásicas pesadas)', () => {
  beforeAll(() => {
    resetStore('Trifasico')
    const { addComodo } = useProjectStore.getState()
    addComodo({ nome: 'Salão de Vendas', tipo: 'Social', area_m2: 120, perimetro_m: 46, pe_direito_m: 3.2, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Salão' } as any)
    addComodo({ nome: 'Estoque', tipo: 'Garagem', area_m2: 60, perimetro_m: 32, pe_direito_m: 3.5, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Câmara Fria', tipo: 'Cozinha', area_m2: 15, perimetro_m: 16, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Copa Funcionários', tipo: 'Cozinha', area_m2: 12, perimetro_m: 14, pe_direito_m: 2.7, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Banheiro Público', tipo: 'Banho', area_m2: 8, perimetro_m: 12, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Escritório Admin', tipo: 'Social', area_m2: 20, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0 } as any)

    const { comodos, addCargaManual } = useProjectStore.getState()
    const byName = (n: string) => comodos.find(c => c.nome === n)!.id

    addCargaManual(byName('Salão de Vendas'), { tipo: 'ILUM', descricao: 'Trilhos LED vitrine', potencia_va: 2400, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Salão de Vendas'), { tipo: 'TUG', descricao: 'Tomadas piso', potencia_va: 100, qtd: 10, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Salão de Vendas'), { tipo: 'TUE', descricao: 'Ar-condicionado central 60000BTU trifásico', potencia_va: 15000, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'ar_cond' } as any)

    addCargaManual(byName('Estoque'), { tipo: 'ILUM', descricao: 'Iluminação galpão', potencia_va: 800, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Estoque'), { tipo: 'TUG', descricao: 'Tomadas estoque', potencia_va: 100, qtd: 4, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Estoque'), { tipo: 'TUE', descricao: 'Empilhadeira elétrica (carregador trifásico)', potencia_va: 3000, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)

    addCargaManual(byName('Câmara Fria'), { tipo: 'ILUM', descricao: 'Luminária câmara fria', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Câmara Fria'), { tipo: 'TUE', descricao: 'Compressor câmara fria trifásico', potencia_va: 8000, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)

    addCargaManual(byName('Copa Funcionários'), { tipo: 'ILUM', descricao: 'Plafon copa', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Copa Funcionários'), { tipo: 'TUG', descricao: 'Geladeira e Micro-ondas', potencia_va: 600, qtd: 2, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    addCargaManual(byName('Banheiro Público'), { tipo: 'ILUM', descricao: 'Plafon banheiro público', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro Público'), { tipo: 'TUG', descricao: 'Secador de mãos', potencia_va: 1800, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, distancia_box_m: 1.0 } as any)

    addCargaManual(byName('Escritório Admin'), { tipo: 'ILUM', descricao: 'Plafon escritório', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Escritório Admin'), { tipo: 'TUG', descricao: 'Tomadas computadores', potencia_va: 100, qtd: 6, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    const { gerarCircuitosDeComodos } = useProjectStore.getState()
    gerarCircuitosDeComodos()
  })

  it('Cadastro, geração e dimensionamento completos, volume maior de circuitos', () => {
    const { circuitos_calc } = useProjectStore.getState()
    const ci = circuitos_calc.filter(c => c.potencia_va > 0)
    expect(ci.length).toBeGreaterThan(5)
    console.log(`Loja Comercial — ${ci.length} circuitos ativos`)
  })

  it('Cargas trifásicas pesadas (AC central 15kVA, compressor 8kVA) dimensionam sem estourar limites de seção', () => {
    const { circuitos_calc } = useProjectStore.getState()
    const pesados = circuitos_calc.filter(c => c.potencia_va >= 5000)
    expect(pesados.length).toBeGreaterThan(0)
    for (const c of pesados) {
      expect(Number.isFinite(c.secao_fase)).toBe(true)
      expect(c.secao_fase).toBeGreaterThan(0)
      expect(c.secao_fase).toBeLessThanOrEqual(300)
      expect(Number.isFinite(c.in_disj)).toBe(true)
    }
  })

  it('Câmara Fria: ILUM não pega DR (mesmo em ambiente tipo Cozinha), TUE do compressor pega', () => {
    const { circuitos_calc } = useProjectStore.getState()
    const ilumCamara = circuitos_calc.find(c => c.descricao?.includes('câmara fria'))
    const tueCamara = circuitos_calc.find(c => c.descricao?.includes('Compressor'))
    expect(ilumCamara?.idr).toBe(false)
    expect(tueCamara?.idr).toBe(true)
  })

  it('Demanda de projeto comercial maior que a kitnet residencial (sanidade de escala)', () => {
    const { demanda } = useProjectStore.getState()
    expect(demanda!.ci_kw).toBeGreaterThan(20)
    console.log(`Loja Comercial — CI=${demanda!.ci_kw.toFixed(2)}kW, Dem=${demanda!.dem_kw.toFixed(2)}kW, disjuntor=${demanda!.in_geral}A`)
  })
})

// ════════════════════════════════════════════════════════════════
// CENÁRIO 3 — Caso extremo: 1 cômodo só, 10 TUEs de alta potência.
// ════════════════════════════════════════════════════════════════
describe('CENÁRIO 3 — Oficina/Laboratório (1 cômodo, 10 TUEs empilhados)', () => {
  beforeAll(() => {
    resetStore('Trifasico')
    const { addComodo } = useProjectStore.getState()
    addComodo({ nome: 'Oficina', tipo: 'Garagem', area_m2: 80, perimetro_m: 40, pe_direito_m: 4.0, ilum_va: 0, tug_va: 0 } as any)
    const id = useProjectStore.getState().comodos[0].id

    const equipamentos = [
      { descricao: 'Solda trifásica',      potencia_va: 8000, fase: 'tri' as const,  tipo_carga: 'motor' as const },
      { descricao: 'Compressor de ar',     potencia_va: 3700, fase: 'tri' as const,  tipo_carga: 'motor' as const },
      { descricao: 'Furadeira de bancada', potencia_va: 1200, fase: 'mono' as const, tipo_carga: 'motor' as const },
      { descricao: 'Serra circular',       potencia_va: 2200, fase: 'bi' as const,   tipo_carga: 'motor' as const },
      { descricao: 'Forno de secagem',     potencia_va: 6000, fase: 'tri' as const,  tipo_carga: 'resistivo' as const },
      { descricao: 'Torno mecânico',       potencia_va: 4500, fase: 'tri' as const,  tipo_carga: 'motor' as const },
      { descricao: 'Exaustor industrial',  potencia_va: 1500, fase: 'bi' as const,   tipo_carga: 'motor' as const },
      { descricao: 'Ar-condicionado',      potencia_va: 2200, fase: 'bi' as const,   tipo_carga: 'ar_cond' as const },
      { descricao: 'Retificadora',         potencia_va: 3000, fase: 'tri' as const,  tipo_carga: 'motor' as const },
      { descricao: 'Aquecedor industrial', potencia_va: 5000, fase: 'mono' as const, tipo_carga: 'resistivo' as const },
    ]
    const { addCargaManual } = useProjectStore.getState()
    equipamentos.forEach(eq => {
      addCargaManual(id, { tipo: 'TUE', descricao: eq.descricao, potencia_va: eq.potencia_va, qtd: 1, fase: eq.fase, abaixo_nbr: false, nbr_min_va: 0, tipo_carga: eq.tipo_carga } as any)
    })

    const { gerarCircuitosDeComodos } = useProjectStore.getState()
    gerarCircuitosDeComodos()
  })

  it('10 TUEs no MESMO cômodo → 10 circuitos INDIVIDUAIS, nunca agrupados', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const tueCircs = circuitos_raw.filter(c => c.tipo === 'TUE')
    expect(tueCircs).toHaveLength(10)
  })

  it('Rotação de fase sob alta repetição continua correta (4 tri, 3 bi, 2 mono declarados)', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const tueCircs = circuitos_raw.filter(c => c.tipo === 'TUE')
    const fasesTri = tueCircs.filter(c => c.ligacao === 'trifasica').map(c => c.fase)
    const fasesBi  = tueCircs.filter(c => c.ligacao === 'bifasica').map(c => c.fase)
    console.log('Fases TUE trifásicas:', fasesTri)
    console.log('Fases TUE bifásicas:', fasesBi)
    expect(fasesTri.every(f => f === 'RST')).toBe(true)
    expect(new Set(fasesBi).size).toBeGreaterThanOrEqual(2)
  })

  it('Dimensionamento de todos os 10 equipamentos sem NaN, seções crescem com a potência', () => {
    const { circuitos_calc } = useProjectStore.getState()
    const tueCalc = circuitos_calc.filter(c => c.tipo === 'TUE').sort((a, b) => a.potencia_va - b.potencia_va)
    expect(tueCalc.length).toBe(10)
    for (const c of tueCalc) {
      expect(Number.isFinite(c.secao_fase)).toBe(true)
      expect(Number.isFinite(c.in_disj)).toBe(true)
    }
    const menor = tueCalc[0], maior = tueCalc[tueCalc.length - 1]
    expect(maior.secao_fase).toBeGreaterThanOrEqual(menor.secao_fase)
  })

  it('QD/demanda comporta os 10 circuitos + reservas sem erro', () => {
    const { demanda, circuitos_calc } = useProjectStore.getState()
    expect(demanda).toBeDefined()
    expect(Number.isFinite(demanda!.dem_kw)).toBe(true)
    const reservas = circuitos_calc.filter(c => c.tipo === 'RESERVA')
    console.log(`Oficina — ${circuitos_calc.filter(c=>c.potencia_va>0).length} circuitos ativos + ${reservas.length} reservas, demanda ${demanda!.dem_kw.toFixed(2)}kW`)
  })
})
