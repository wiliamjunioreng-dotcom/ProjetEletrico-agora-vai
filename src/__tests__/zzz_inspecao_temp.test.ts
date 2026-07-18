import { describe, it } from 'vitest'
import { useProjectStore } from '../store/projectStore'

describe('INSPEÇÃO — breakdown real da casa completa', () => {
  it('reconstrói e imprime tudo', () => {
    useProjectStore.setState({
      comodos: [], circuitos_raw: [], circuitos_calc: [],
      projeto: { ...useProjectStore.getState().projeto, sistema: 'Trifasico', v_fase: 127, v_linha: 220, fp_global: 0.92, aterramento: 'TN-S' },
    } as any)
    const { addComodo } = useProjectStore.getState()
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
    addCargaManual(byName('Sala de Estar'), { tipo: 'ILUM', descricao: 'Plafon central', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Sala de Estar'), { tipo: 'TUG', descricao: 'Tomadas sala', potencia_va: 100, qtd: 6, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Sala de Estar'), { tipo: 'TUE', descricao: 'Ar-condicionado Split 12000BTU', potencia_va: 1200, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'ar_cond' } as any)
    addCargaManual(byName('Sala de Jantar'), { tipo: 'ILUM', descricao: 'Pendente mesa', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Sala de Jantar'), { tipo: 'TUG', descricao: 'Tomadas jantar', potencia_va: 100, qtd: 3, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'ILUM', descricao: 'Spots cozinha', potencia_va: 300, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUG', descricao: 'Geladeira', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUG', descricao: 'Micro-ondas', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUG', descricao: 'Bancada', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Cozinha'), { tipo: 'TUE', descricao: 'Forno elétrico embutido trifásico', potencia_va: 6500, qtd: 1, fase: 'tri', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'resistivo' } as any)
    addCargaManual(byName('Área de Serviço'), { tipo: 'ILUM', descricao: 'Luz área serviço', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Área de Serviço'), { tipo: 'TUE', descricao: 'Máquina de lavar', potencia_va: 1500, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)
    addCargaManual(byName('Suíte Master'), { tipo: 'ILUM', descricao: 'Plafon quarto', potencia_va: 150, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Suíte Master'), { tipo: 'TUG', descricao: 'Tomadas suíte', potencia_va: 100, qtd: 5, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Suíte Master'), { tipo: 'TUE', descricao: 'Ar-condicionado Split 9000BTU', potencia_va: 900, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'ar_cond' } as any)
    addCargaManual(byName('Banheiro Suíte'), { tipo: 'ILUM', descricao: 'Plafon banheiro', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro Suíte'), { tipo: 'TUG', descricao: 'Tomada barbeador', potencia_va: 600, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, distancia_box_m: 0.8 } as any)
    addCargaManual(byName('Banheiro Suíte'), { tipo: 'TUE', descricao: 'Chuveiro elétrico 7500W', potencia_va: 7500, qtd: 1, fase: 'bi', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'resistivo', distancia_box_m: 0.1 } as any)
    addCargaManual(byName('Quarto 2'), { tipo: 'ILUM', descricao: 'Plafon quarto 2', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Quarto 2'), { tipo: 'TUG', descricao: 'Tomadas quarto 2', potencia_va: 100, qtd: 4, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Quarto 3'), { tipo: 'ILUM', descricao: 'Plafon quarto 3', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Quarto 3'), { tipo: 'TUG', descricao: 'Tomadas quarto 3', potencia_va: 100, qtd: 4, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro Social'), { tipo: 'ILUM', descricao: 'Plafon banheiro social', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Banheiro Social'), { tipo: 'TUG', descricao: 'Tomada mal posicionada', potencia_va: 100, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, distancia_box_m: 0.3 } as any)
    addCargaManual(byName('Garagem'), { tipo: 'ILUM', descricao: 'Refletores garagem', potencia_va: 200, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Garagem'), { tipo: 'TUG', descricao: 'Tomadas garagem', potencia_va: 100, qtd: 2, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0 } as any)
    addCargaManual(byName('Garagem'), { tipo: 'TUE', descricao: 'Motor portão eletrônico', potencia_va: 750, qtd: 1, fase: 'mono', abaixo_nbr: false, nbr_min_va: 0, tipo_carga: 'motor' } as any)

    const { gerarCircuitosDeComodos } = useProjectStore.getState()
    gerarCircuitosDeComodos()
    const { circuitos_calc, demanda } = useProjectStore.getState()

    console.log('\n═══ BREAKDOWN COMPLETO ═══')
    const porTipo: Record<string, number> = {}
    circuitos_calc.forEach(c => { porTipo[c.tipo] = (porTipo[c.tipo]||0)+1 })
    console.log('Por tipo:', porTipo)
    console.log('\n═══ CADA CIRCUITO (não-reserva) ═══')
    circuitos_calc.filter(c => c.tipo !== 'RESERVA').forEach(c => {
      console.log(`  [${c.tipo}] ${c.descricao} — ${c.potencia_va}VA, fase=${c.fase}, seção=${c.secao_fase}mm², disj=${c.in_disj}A, IDR=${c.idr}`)
    })
    console.log('\n═══ DR por área molhada ═══')
    const molhados = circuitos_calc.filter(c => /banheiro|cozinha|lavanderia|garagem|área de serviço/i.test(c.descricao))
    molhados.forEach(c => console.log(`  ${c.descricao} — IDR=${c.idr}`))
    console.log('\n═══ DEMANDA ═══')
    console.log(JSON.stringify(demanda, null, 2))
  })
})
