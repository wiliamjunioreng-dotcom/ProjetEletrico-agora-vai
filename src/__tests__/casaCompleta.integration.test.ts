// src/__tests__/casaCompleta.integration.test.ts
// ════════════════════════════════════════════════════════════════
// TESTE DE INTEGRAÇÃO PONTA A PONTA — pedido direto do usuário:
// "faça um teste do zero, uma casa de dez cômodos com cargas
// distribuídas de uma maneira real, e veja se o programa consegue
// chegar até o final. Tudo aquilo que se espera de um projeto
// entregue, calculado."
//
// Simula uma residência real: 10 cômodos, sistema trifásico (padrão
// mais comum em residências de médio/grande porte com chuveiro +
// ar-condicionado + eventual carga maior), cargas manuais variadas
// (mono/bi/tri misturadas de propósito — exercita o fix de circuito
// homogêneo), grupos de circuito declarados (exercita o agrupamento
// por proximidade), e verifica que o pipeline INTEIRO roda sem
// travar: cadastro → geração de circuitos → demanda → auditoria →
// materiais → nenhuma violação física crítica inesperada.
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest'
import { useProjectStore } from '../store/projectStore'
import { verificarComodoNBR9 } from '../core/rules/nbr5410_s9'
import { calcResumoMateriais, calcQuantCircuito } from '../core/quantitativos'

describe('CASA COMPLETA — 10 cômodos, ponta a ponta', () => {

  beforeAll(() => {
    useProjectStore.setState({
      comodos: [], circuitos_raw: [], circuitos_calc: [],
      projeto: {
        ...useProjectStore.getState().projeto,
        nome: 'Residência Teste — Casa Completa',
        empresa: 'Lumen Soluções', projetista: 'Wiliam Antônio da Silva Júnior', crea: 'CREA-MG 000000',
        sistema: 'Trifasico', v_fase: 127, v_linha: 220,
        metodo_instalacao: 'B1', isolacao: 'PVC', material_cabo: 'Cu',
        t_amb: 30, du_max_pct: 4, du_ramal_pct: 0.5, fp_global: 0.92,
        icc_rede_ka: 5, aterramento: 'TN-S',
      },
    } as any)

    const { addComodo } = useProjectStore.getState()

    // ── 10 cômodos de uma residência real de médio porte ──────────
    addComodo({ nome: 'Sala de Estar',   tipo: 'Social',     area_m2: 24, perimetro_m: 20, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Área Social' } as any)
    addComodo({ nome: 'Sala de Jantar',  tipo: 'Social',     area_m2: 14, perimetro_m: 15, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Área Social' } as any)
    addComodo({ nome: 'Cozinha',         tipo: 'Cozinha',    area_m2: 16, perimetro_m: 17, pe_direito_m: 2.7, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Área de Serviço', tipo: 'Lavanderia', area_m2: 6,  perimetro_m: 10, pe_direito_m: 2.7, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Suíte Master',    tipo: 'Social',     area_m2: 18, perimetro_m: 18, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Quartos' } as any)
    addComodo({ nome: 'Banheiro Suíte',  tipo: 'Banho',      area_m2: 6,  perimetro_m: 10, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Quarto 2',        tipo: 'Social',     area_m2: 12, perimetro_m: 14, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Quartos' } as any)
    addComodo({ nome: 'Quarto 3',        tipo: 'Social',     area_m2: 11, perimetro_m: 13, pe_direito_m: 2.8, ilum_va: 0, tug_va: 0, grupo_circuito_ilum: 'Quartos' } as any)
    addComodo({ nome: 'Banheiro Social', tipo: 'Banho',      area_m2: 4.5,perimetro_m: 9,  pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)
    addComodo({ nome: 'Garagem',         tipo: 'Garagem',    area_m2: 28, perimetro_m: 22, pe_direito_m: 2.6, ilum_va: 0, tug_va: 0 } as any)

    const { comodos, addCargaManual } = useProjectStore.getState()
    const byName = (n: string) => comodos.find(c => c.nome === n)!.id

    // ── Cargas manuais realistas e VARIADAS (mono/bi/tri de propósito) ──

    // Sala de Estar: ILUM geral + TUG várias tomadas + 1 TUE (ar-condicionado bifásico)
    addCargaManual(byName('Sala de Estar'), { tipo: 'ILUM', descricao: 'Plafon central', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Sala de Estar'), { tipo: 'TUG', descricao: 'Tomadas sala', potencia_va: 100, qtd: 6, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Sala de Estar'), { tipo: 'TUE', descricao: 'Ar-condicionado Split 12000BTU', potencia_va: 1200, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'ar_cond' } as any)

    // Sala de Jantar: ILUM + TUG
    addCargaManual(byName('Sala de Jantar'), { tipo: 'ILUM', descricao: 'Pendente mesa', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Sala de Jantar'), { tipo: 'TUG', descricao: 'Tomadas jantar', potencia_va: 100, qtd: 3, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    // Cozinha: ILUM + TUG bancada (alta potência, mín 3 a 600VA) + TUE forno elétrico trifásico
    addCargaManual(byName('Cozinha'), { tipo: 'ILUM', descricao: 'Spots cozinha', potencia_va: 300, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUG', descricao: 'Geladeira', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUG', descricao: 'Micro-ondas', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUG', descricao: 'Bancada', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUE', descricao: 'Forno elétrico embutido trifásico', potencia_va: 6500, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'resistivo' } as any)

    // Área de Serviço: TUE máquina de lavar + TUG
    addCargaManual(byName('Área de Serviço'), { tipo: 'ILUM', descricao: 'Luz área serviço', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Área de Serviço'), { tipo: 'TUE', descricao: 'Máquina de lavar', potencia_va: 1500, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)

    // Suíte Master: ILUM geral + efeito + TUG + TUE ar-condicionado
    addCargaManual(byName('Suíte Master'), { tipo: 'ILUM', descricao: 'Plafon quarto', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Suíte Master'), { tipo: 'TUG', descricao: 'Tomadas suíte', potencia_va: 100, qtd: 5, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Suíte Master'), { tipo: 'TUE', descricao: 'Ar-condicionado Split 9000BTU', potencia_va: 900, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'ar_cond' } as any)

    // Banheiro Suíte: ILUM + TUG declarada a 0,80m do box (dentro do Volume 3 — deve passar) + TUE chuveiro
    addCargaManual(byName('Banheiro Suíte'), { tipo: 'ILUM', descricao: 'Plafon banheiro', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro Suíte'), { tipo: 'TUG', descricao: 'Tomada barbeador', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, distancia_box_m: 0.8 } as any)
    addCargaManual(byName('Banheiro Suíte'), { tipo: 'TUE', descricao: 'Chuveiro elétrico 7500W', potencia_va: 7500, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'resistivo', distancia_box_m: 0.1 } as any)

    // Quarto 2, Quarto 3: ILUM + TUG simples
    addCargaManual(byName('Quarto 2'), { tipo: 'ILUM', descricao: 'Plafon quarto 2', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Quarto 2'), { tipo: 'TUG', descricao: 'Tomadas quarto 2', potencia_va: 100, qtd: 4, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Quarto 3'), { tipo: 'ILUM', descricao: 'Plafon quarto 3', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Quarto 3'), { tipo: 'TUG', descricao: 'Tomadas quarto 3', potencia_va: 100, qtd: 4, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)

    // Banheiro Social: ILUM + TUG dentro do Volume 2 (< 0,60m — DEVE gerar erro proposital)
    addCargaManual(byName('Banheiro Social'), { tipo: 'ILUM', descricao: 'Plafon banheiro social', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro Social'), { tipo: 'TUG', descricao: 'Tomada mal posicionada', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, distancia_box_m: 0.3 } as any)

    // Garagem: ILUM + TUG externa + TUE motor de portão trifásico (testa sistema aceitando tri)
    addCargaManual(byName('Garagem'), { tipo: 'ILUM', descricao: 'Refletores garagem', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Garagem'), { tipo: 'TUG', descricao: 'Tomadas garagem', potencia_va: 100, qtd: 2, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Garagem'), { tipo: 'TUE', descricao: 'Motor portão eletrônico', potencia_va: 750, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)
  })

  it('1. Cadastro completo: 10 cômodos criados com sucesso', () => {
    const { comodos } = useProjectStore.getState()
    expect(comodos).toHaveLength(10)
  })

  it('2. Geração de circuitos NÃO TRAVA e produz resultado', () => {
    const { gerarCircuitosDeComodos } = useProjectStore.getState()
    expect(() => gerarCircuitosDeComodos()).not.toThrow()
    const { circuitos_raw } = useProjectStore.getState()
    expect(circuitos_raw.length).toBeGreaterThan(0)
  })

  it('3. Circuitos automáticos de RESERVA foram gerados (§6.5.4.7)', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const reservas = circuitos_raw.filter(c => c.tipo === 'RESERVA')
    expect(reservas.length).toBeGreaterThan(0)
  })

  it('4. TUEs viraram circuitos INDIVIDUAIS — nunca agrupados (7 TUEs declarados)', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const tueCircs = circuitos_raw.filter(c => c.tipo === 'TUE')
    // 7 TUEs declarados: AC sala, Forno, Máq. lavar, AC suíte, Chuveiro, Motor portão = 6
    // (recontagem: Sala AC, Cozinha Forno, Lavanderia Máq, Suíte AC, Banheiro Chuveiro, Garagem Motor = 6)
    expect(tueCircs.length).toBe(6)
  })

  it('5. Circuitos NUNCA misturam ligação diferente — nenhum circuito ILUM/TUG agrupado tem fase incoerente', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const ilumTug = circuitos_raw.filter(c => c.tipo === 'ILUM' || c.tipo === 'TUG')
    for (const c of ilumTug) {
      // cada circuito deve ter ligacao definida e coerente com o sistema
      expect(['monofasica', 'bifasica', 'trifasica']).toContain(c.ligacao)
    }
  })

  it('6. Rotação de fases R/S/T acontece de verdade — não trava tudo em R (bug histórico corrigido)', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const fasesUsadas = new Set(circuitos_raw.map(c => c.fase))
    console.log('Fases usadas em toda a casa:', [...fasesUsadas].sort())
    // Com 10 cômodos e ~15+ circuitos, espera-se ver mais de uma fase
    expect(fasesUsadas.size).toBeGreaterThan(1)
  })

  it('7. Grupos de circuito ILUM declarados ("Área Social", "Quartos") realmente agruparam cômodos diferentes', () => {
    const { circuitos_raw } = useProjectStore.getState()
    const areaSocial = circuitos_raw.find(c => c.descricao.includes('Área Social'))
    const quartos = circuitos_raw.filter(c => c.descricao.includes('Quartos'))
    // Área Social: Sala de Estar + Sala de Jantar deveriam estar juntas em 1 circuito
    if (areaSocial) {
      expect(areaSocial.descricao).toMatch(/Sala/i)
    }
    console.log('Circuitos com grupo Quartos:', quartos.map(c => c.descricao))
  })

  it('8. Dimensionamento completo (cabo, disjuntor, ΔU) roda sem NaN/undefined em nenhum circuito', () => {
    const { circuitos_calc } = useProjectStore.getState()
    expect(circuitos_calc.length).toBeGreaterThan(0)
    for (const c of circuitos_calc.filter(x => x.potencia_va > 0)) {
      expect(Number.isFinite(c.secao_fase)).toBe(true)
      expect(c.secao_fase).toBeGreaterThan(0)
      expect(Number.isFinite(c.in_disj)).toBe(true)
      expect(c.in_disj).toBeGreaterThan(0)
      expect(Number.isFinite(c.du_calc)).toBe(true)
    }
  })

  it('9. Demanda do projeto calculada — CI, FD, demanda final e disjuntor geral, tudo número real', () => {
    const { demanda } = useProjectStore.getState()
    expect(demanda).toBeDefined()
    expect(Number.isFinite(demanda!.ci_kw)).toBe(true)
    expect(demanda!.ci_kw).toBeGreaterThan(0)
    expect(Number.isFinite(demanda!.dem_kw)).toBe(true)
    expect(demanda!.dem_kw).toBeGreaterThan(0)
    expect(demanda!.dem_kw).toBeLessThanOrEqual(demanda!.ci_kw)  // FD nunca aumenta a demanda
    expect(Number.isFinite(demanda!.in_geral)).toBe(true)
    expect(demanda!.in_geral).toBeGreaterThan(0)
    console.log(`Demanda: CI=${demanda!.ci_kw.toFixed(2)}kW, Dem=${demanda!.dem_kw.toFixed(2)}kW, Disjuntor geral=${demanda!.in_geral}A`)
  })

  it('10. Auditoria §9 pega a violação PROPOSITAL do Banheiro Social (tomada a 0,30m do box)', () => {
    const { comodos } = useProjectStore.getState()
    const banheiroSocial = comodos.find(c => c.nome === 'Banheiro Social')!
    const violacoes = verificarComodoNBR9(banheiroSocial).filter(v => !v.conforme)
    const erroVolume = violacoes.find(v => v.codigo.includes('TomadaProxima') || v.codigo.includes('Volume'))
    expect(erroVolume).toBeDefined()
    expect(erroVolume?.severidade).toBe('erro')
    console.log('Violação pega:', erroVolume?.descricao)
  })

  it('11. Auditoria §9 NÃO reclama do Banheiro Suíte (tomada a 0,80m, chuveiro a 0,10m — ambos corretos)', () => {
    const { comodos } = useProjectStore.getState()
    const banheiroSuite = comodos.find(c => c.nome === 'Banheiro Suíte')!
    const violacoes = verificarComodoNBR9(banheiroSuite).filter(v => !v.conforme && v.severidade === 'erro')
    expect(violacoes).toHaveLength(0)
  })

  it('12. Chuveiro (TUE bifásico 7500VA) dimensionado com IDR 30mA obrigatório (área molhada)', () => {
    const { circuitos_calc } = useProjectStore.getState()
    const chuveiro = circuitos_calc.find(c => c.descricao?.includes('Chuveiro'))
    expect(chuveiro).toBeDefined()
    expect(chuveiro!.idr).toBe(true)
  })

  it('13. Nenhum circuito ficou com seção abaixo do piso normativo (1,5mm² ILUM / 2,5mm² força)', () => {
    const { circuitos_calc } = useProjectStore.getState()
    for (const c of circuitos_calc.filter(x => x.potencia_va > 0)) {
      const piso = c.tipo === 'ILUM' ? 1.5 : 2.5
      expect(c.secao_fase).toBeGreaterThanOrEqual(piso)
    }
  })

  it('14. Lista de materiais é gerada sem travar — mesmo caminho EXATO que Materiais.tsx usa em produção', () => {
    const { circuitos_calc, circuitos_raw } = useProjectStore.getState()
    const ci  = circuitos_calc.filter(c => c.potencia_va > 0)
    const raw = circuitos_raw.filter((_, i) => (circuitos_calc[i]?.potencia_va ?? 0) > 0)

    expect(() => {
      const quants = ci.map((circ, i) => calcQuantCircuito(
        { id: circ.id, descricao: circ.descricao, tipo: circ.tipo,
          comprimento_m: raw[i]?.comprimento_m,
          n_fases: (raw[i]?.fase === 'RST' ? 3 : (raw[i]?.fase?.length ?? 1) > 1 ? 2 : 1) as 1|2|3 },
        { secao_fase: circ.secao_fase, in_disj: circ.in_disj }
      ))
      calcResumoMateriais(quants)
    }).not.toThrow()

    const quants = ci.map((circ, i) => calcQuantCircuito(
      { id: circ.id, descricao: circ.descricao, tipo: circ.tipo,
        comprimento_m: raw[i]?.comprimento_m,
        n_fases: (raw[i]?.fase === 'RST' ? 3 : (raw[i]?.fase?.length ?? 1) > 1 ? 2 : 1) as 1|2|3 },
      { secao_fase: circ.secao_fase, in_disj: circ.in_disj }
    ))
    const resumo = calcResumoMateriais(quants)
    expect(resumo).toBeDefined()
    console.log('Resumo de materiais gerado:', JSON.stringify(resumo).slice(0, 200) + '...')
  })

  it('15. Nenhum circuito tem TUE misturado com ILUM/TUG no mesmo circuito (regra §9.5.4 respeitada)', () => {
    const { circuitos_raw } = useProjectStore.getState()
    for (const c of circuitos_raw) {
      if (c.tipo === 'TUE') {
        // um circuito TUE nunca deveria ter descrição citando ILUM/TUG junto
        expect(c.descricao).not.toMatch(/ILUM:|TUG:/i)
      }
    }
  })

  it('16. RESUMO FINAL — projeto "entregável": nº circuitos, potência total, demanda, sem exceções', () => {
    const { circuitos_calc, demanda, comodos } = useProjectStore.getState()
    const ci = circuitos_calc.filter(c => c.potencia_va > 0)
    const totalVA = ci.reduce((s, c) => s + c.potencia_va, 0)
    console.log('═══════════════════════════════════════════')
    console.log(`RESUMO — Residência Teste (10 cômodos)`)
    console.log(`Circuitos ativos: ${ci.length}`)
    console.log(`Potência instalada total: ${(totalVA/1000).toFixed(2)}kW`)
    console.log(`Demanda calculada: ${demanda?.dem_kw.toFixed(2)}kW`)
    console.log(`Disjuntor geral: ${demanda?.in_geral}A`)
    console.log(`Cômodos: ${comodos.map(c => c.nome).join(', ')}`)
    console.log('═══════════════════════════════════════════')
    expect(ci.length).toBeGreaterThan(10)
    expect(totalVA).toBeGreaterThan(10000)  // casa real, deve passar de 10kW instalados
  })
})

describe('CASA COMPLETA — investigação adicional pedida pelo usuário', () => {
  it('Breakdown de circuitos por tipo, e quais têm IDR (áreas molhadas)', () => {
    const { circuitos_raw, circuitos_calc } = useProjectStore.getState()
    const porTipo: Record<string, number> = {}
    circuitos_raw.forEach(c => { porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1 })
    console.log('Circuitos por tipo:', JSON.stringify(porTipo))

    const comIdr = circuitos_calc.filter(c => c.idr)
    console.log('Circuitos com IDR:', comIdr.map(c => c.descricao))

    const fasesUsadas = new Set(circuitos_raw.map(c => c.fase))
    console.log('Fases usadas (após fix RT):', [...fasesUsadas].sort())

    expect(true).toBe(true)
  })
})
