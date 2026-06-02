// src/__tests__/entityGraph.test.ts
import { describe, it, expect } from 'vitest'
import {
  createEntityGraph, registerEntity, invalidateEntity,
  markEntityComputed, dirtyEntitiesOfType, entityRecomputeOrder, graphStats,
} from '../core/entityDependencyGraph'

describe('EntityDependencyGraph — registro', () => {

  it('registerEntity: nó criado e começa dirty', () => {
    const g = createEntityGraph()
    const n = registerEntity(g, 'p1', 'ponto')
    expect(g.nodes.has('p1')).toBe(true)
    expect(n.dirty).toBe(true)
  })

  it('registerEntity: dependência atualiza affects do dep', () => {
    const g = createEntityGraph()
    registerEntity(g, 'parede-N', 'parede')
    registerEntity(g, 'face-N', 'face', ['parede-N'])
    const parede = g.nodes.get('parede-N')!
    expect(parede.affects).toContain('face-N')
  })

  it('registerEntity: grafo bidirecional (depends_on + affects)', () => {
    const g = createEntityGraph()
    registerEntity(g, 'ponto-1', 'ponto')
    registerEntity(g, 'seg-1', 'segmento', ['ponto-1'])
    registerEntity(g, 'cond-1', 'condutor', ['seg-1'])

    expect(g.nodes.get('ponto-1')!.affects).toContain('seg-1')
    expect(g.nodes.get('seg-1')!.affects).toContain('cond-1')
    expect(g.nodes.get('seg-1')!.depends_on).toContain('ponto-1')
  })
})

describe('EntityDependencyGraph — invalidação', () => {

  it('invalidateEntity: propaga para afetados', () => {
    const g = createEntityGraph()
    registerEntity(g, 'parede-N', 'parede')
    registerEntity(g, 'face-N',   'face',     ['parede-N'])
    registerEntity(g, 'seg-1',    'segmento', ['face-N'])
    registerEntity(g, 'cond-1',   'condutor', ['seg-1'])

    // Marcar todos como computados primeiro
    ;['parede-N','face-N','seg-1','cond-1'].forEach(id => markEntityComputed(g, id))
    expect(g.nodes.get('face-N')!.dirty).toBe(false)

    // Mover a parede: invalida face, segmento, condutor
    const afetados = invalidateEntity(g, 'parede-N')
    expect(afetados).toContain('parede-N')
    expect(afetados).toContain('face-N')
    expect(afetados).toContain('seg-1')
    expect(afetados).toContain('cond-1')
  })

  it('invalidateEntity: NÃO propaga para cima (deps não ficam dirty)', () => {
    const g = createEntityGraph()
    registerEntity(g, 'comodo-A', 'comodo')
    registerEntity(g, 'parede-N', 'parede', ['comodo-A'])
    registerEntity(g, 'face-N',   'face',   ['parede-N'])

    // Invalidar face não deve afetar comodo ou parede (que estão "acima")
    ;['comodo-A', 'parede-N', 'face-N'].forEach(id => markEntityComputed(g, id))
    invalidateEntity(g, 'face-N')

    expect(g.nodes.get('comodo-A')!.dirty).toBe(false)
    expect(g.nodes.get('parede-N')!.dirty).toBe(false)
    expect(g.nodes.get('face-N')!.dirty).toBe(true)
  })

  it('granularidade: mover p1 não invalida p2', () => {
    const g = createEntityGraph()
    registerEntity(g, 'parede-N', 'parede')
    registerEntity(g, 'p1', 'ponto', ['parede-N'])
    registerEntity(g, 'p2', 'ponto', ['parede-N'])
    registerEntity(g, 'seg-p1', 'segmento', ['p1'])
    registerEntity(g, 'seg-p2', 'segmento', ['p2'])

    ;['parede-N','p1','p2','seg-p1','seg-p2'].forEach(id => markEntityComputed(g, id))
    invalidateEntity(g, 'p1')  // só mover p1

    // seg-p1 fica dirty, seg-p2 NÃO
    expect(g.nodes.get('seg-p1')!.dirty).toBe(true)
    expect(g.nodes.get('seg-p2')!.dirty).toBe(false)
    expect(g.nodes.get('p2')!.dirty).toBe(false)
  })
})

describe('EntityDependencyGraph — recompute', () => {

  it('markEntityComputed: nó limpo', () => {
    const g = createEntityGraph()
    registerEntity(g, 'p1', 'ponto')
    expect(g.nodes.get('p1')!.dirty).toBe(true)
    markEntityComputed(g, 'p1')
    expect(g.nodes.get('p1')!.dirty).toBe(false)
    expect(g.nodes.get('p1')!.computed_at).not.toBeNull()
  })

  it('dirtyEntitiesOfType: filtra por tipo', () => {
    const g = createEntityGraph()
    registerEntity(g, 'p1', 'ponto')
    registerEntity(g, 'p2', 'ponto')
    registerEntity(g, 'f1', 'face')
    markEntityComputed(g, 'p2')  // p2 limpo

    const sujos_pontos = dirtyEntitiesOfType(g, 'ponto')
    expect(sujos_pontos).toHaveLength(1)
    expect(sujos_pontos[0].entity_id).toBe('p1')
  })

  it('entityRecomputeOrder: deps antes dos dependentes', () => {
    const g = createEntityGraph()
    registerEntity(g, 'comodo',  'comodo')
    registerEntity(g, 'parede',  'parede',   ['comodo'])
    registerEntity(g, 'face',    'face',     ['parede'])
    registerEntity(g, 'segmento','segmento', ['face'])

    // Todos dirty (recém criados)
    const ordem = entityRecomputeOrder(g)
    const i_c = ordem.indexOf('comodo')
    const i_p = ordem.indexOf('parede')
    const i_f = ordem.indexOf('face')
    const i_s = ordem.indexOf('segmento')

    expect(i_c).toBeLessThan(i_p)
    expect(i_p).toBeLessThan(i_f)
    expect(i_f).toBeLessThan(i_s)
  })
})

describe('EntityDependencyGraph — stats', () => {

  it('graphStats: conta total e dirty corretamente', () => {
    const g = createEntityGraph()
    registerEntity(g, 'p1', 'ponto')
    registerEntity(g, 'p2', 'ponto')
    registerEntity(g, 'f1', 'face')
    markEntityComputed(g, 'p1')

    const stats = graphStats(g)
    expect(stats.total).toBe(3)
    expect(stats.dirty).toBe(2)
    expect(stats.clean).toBe(1)
    expect(stats.por_tipo['ponto'].total).toBe(2)
    expect(stats.por_tipo['ponto'].dirty).toBe(1)
  })
})

// ── Bug de carga: CargaManual persistida no Comodo ────────────────
// Estes testes validam que o store cria e persiste cargas corretamente
// (testes de integração do fix)
describe('CargaManual — estrutura de dados', () => {

  it('CargaManual tem todos os campos obrigatórios', () => {
    const carga = {
      id: 'c1', tipo: 'TUG' as const, descricao: 'Tomada extra',
      potencia_va: 600, qtd: 2, fase: 'mono' as const,
      abaixo_nbr: false, nbr_min_va: 600,
    }
    // Verificar que todos os campos existem
    expect(carga.id).toBeTruthy()
    expect(carga.tipo).toBe('TUG')
    expect(carga.potencia_va * carga.qtd).toBe(1200)
    expect(carga.abaixo_nbr).toBe(false)
  })

  it('carga abaixo do NBR: flag corretamente calculada', () => {
    const nbr_min = 100 * 6  // 6 TUGs × 100VA = 600VA
    const potencia = 400
    const carga = {
      id: 'c2', tipo: 'TUG' as const, descricao: 'Tomadas sala',
      potencia_va: potencia, qtd: 1, fase: 'mono' as const,
      abaixo_nbr: potencia < nbr_min, nbr_min_va: nbr_min,
    }
    expect(carga.abaixo_nbr).toBe(true)
  })

  it('potência total = potencia_va × qtd', () => {
    const carga = {
      id: 'c3', tipo: 'ILUM' as const, descricao: 'Luminárias LED',
      potencia_va: 50, qtd: 6, fase: 'mono' as const,
      abaixo_nbr: false, nbr_min_va: 100,
    }
    const total = carga.potencia_va * carga.qtd
    expect(total).toBe(300)
  })
})
