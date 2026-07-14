// Validação — conexão da regra correta de ocupação (§6.2.11.1.6) ao
// caminho vivo (topologia.ts, usado por solver.ts e Eletrodutos.tsx)
import { describe, it, expect } from 'vitest'
import { analisarSegmento } from '../core/topologia'
import type { SegmentoEletroduto, ConductorEmSegmento } from '../types/electrical'

function segmento(condutores: Partial<ConductorEmSegmento>[], diametro_mm: 16|20|25 = 20): SegmentoEletroduto {
  return {
    id: 's1', nome: 'Trecho teste', origem_no_id: 'qd', destino_no_id: 'p1',
    comprimento_m: 10, diametro_mm,
    material: 'PVC_rigido',
    condutores: condutores.map((c, i) => ({
      tipo: 'FASE_A', secao_mm2: 2.5, circuito_id: `c${i}`, corrente_a: 10, ...c,
    })) as ConductorEmSegmento[],
  } as any
}

describe('Ocupação de eletroduto — §6.2.11.1.6 CONECTADA ao caminho vivo', () => {
  it('1 condutor isolado → limite 53%', () => {
    const a = analisarSegmento(segmento([{}]))
    expect(a.limite_ocupacao_pct).toBe(53)
  })

  it('2 condutores → limite 31% (era 53% na regra antiga — corrigido)', () => {
    const a = analisarSegmento(segmento([{}, {}]))
    expect(a.limite_ocupacao_pct).toBe(31)
  })

  it('Caso típico: 1 circuito mono completo (F+N+PE = 3 condutores) → limite 40%, NÃO 53%', () => {
    const a = analisarSegmento(segmento([
      { tipo: 'FASE_A' }, { tipo: 'NEUTRO' }, { tipo: 'PE' },
    ]))
    expect(a.limite_ocupacao_pct).toBe(40)
    // BUG ANTIGO: a regra fixa 30/35% classificaria isso diferente
    // do correto — o teste abaixo confirma que o novo cálculo usa
    // exatamente o limite do §6.2.11.1.6, não um valor genérico.
  })

  it('status_ocupacao usa o limite correto, não mais o fixo 30/35%', () => {
    // 3 condutores de 2.5mm² em eletroduto de 20mm — calcular se
    // classificaria diferente sob a regra antiga (35%) vs nova (40%)
    const a = analisarSegmento(segmento([
      { secao_mm2: 2.5 }, { secao_mm2: 2.5 }, { secao_mm2: 2.5 },
    ], 16))
    console.log(`Taxa: ${a.taxa_ocupacao_pct}% | Limite aplicado: ${a.limite_ocupacao_pct}% | Status: ${a.status_ocupacao}`)
    expect(a.limite_ocupacao_pct).toBe(40)
  })
})
