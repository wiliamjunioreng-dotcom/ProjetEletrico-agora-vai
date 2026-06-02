// src/core/sync.ts
// ════════════════════════════════════════════════════════════════
// SYNC ENGINE — Sincronização bidirecional domínio ↔ geometria
//
// PROBLEMA A RESOLVER:
//   projectStore (elétrico) ↔ plantaStore (geometria)
//   precisam conversar sem criar:
//     - loops infinitos (A atualiza B, B atualiza A, ...)
//     - race conditions (dois updates simultâneos)
//     - mutações ocultas (efeito colateral invisível)
//
// SOLUÇÃO:
//   Sync é sempre UNIDIRECIONAL por chamada.
//   O chamador decide qual direção sincronizar.
//   Nunca sync automático reativo — sempre explícito.
//
// CONTRATOS:
//   syncDomainToPlant(electrical, geo) → geo atualizado (sem tocar electrical)
//   syncPlantToDomain(geo, electrical) → electrical atualizado (sem tocar geo)
//   Cada função é pura: retorna novos objetos, não muta os existentes.
// ════════════════════════════════════════════════════════════════

import type { RawCircuit } from '../store/projectStore'
import type { PontoEletrico, ComodoGeometria } from '../types/geometry'
import type { NoTopologico } from '../types/electrical'


// ── 1. DOMÍNIO → PLANTA ──────────────────────────────────────────
// Quando o engenheiro modifica circuitos, cômodos ou topologia:
// → atualizar pontos na planta que estão vinculados

export interface SyncDomainToPlantInput {
  // Estado elétrico atual
  circuitos:  RawCircuit[]
  nos:        NoTopologico[]
  // Estado geométrico atual (para preservar posições manuais)
  pontos:     PontoEletrico[]
  comodos:    ComodoGeometria[]
}

export interface SyncDomainToPlantOutput {
  // Pontos a criar (nos topológicos que não têm ponto na planta)
  criar:   Omit<PontoEletrico, 'id'>[]
  // Pontos a remover (pontos vinculados a entidades deletadas)
  remover: string[]  // IDs de PontoEletrico
  // Pontos a atualizar (circuito do ponto mudou)
  atualizar: { id: string; partial: Partial<PontoEletrico> }[]
}

export function syncDomainToPlant(input: SyncDomainToPlantInput): SyncDomainToPlantOutput {
  const { circuitos, nos, pontos } = input
  const criar:    Omit<PontoEletrico, 'id'>[]                   = []
  const remover:  string[]                                        = []
  const atualizar: { id: string; partial: Partial<PontoEletrico> }[] = []

  // IDs válidos no domínio elétrico
  const circuito_ids = new Set(circuitos.map(c => c.id))
  const no_ids       = new Set(nos.map(n => n.id))

  // 1a. Remover pontos cujo circuito foi deletado
  for (const p of pontos) {
    if (p.circuito_id && !circuito_ids.has(p.circuito_id)) {
      atualizar.push({ id: p.id, partial: { circuito_id: undefined } })
    }
    // Remover pontos cujo nó topológico foi deletado
    if (p.no_id && !no_ids.has(p.no_id)) {
      remover.push(p.id)
    }
  }

  // 1b. Criar pontos para nós topológicos que têm posição mas não têm ponto na planta
  const nos_com_posicao = nos.filter(n => n.pos_x != null && n.pos_y != null)
  const pontos_com_no   = new Set(pontos.map(p => p.no_id).filter(Boolean))

  for (const no of nos_com_posicao) {
    if (pontos_com_no.has(no.id)) continue  // já tem ponto

    // Mapear tipo de nó → tipo de ponto elétrico
    const tipo = noToTipoPonto(no.tipo)
    if (!tipo) continue

    criar.push({
      tipo,
      x:             no.pos_x!,
      y:             no.pos_y!,
      rotacao_graus: 0,
      comodo_id:     no.comodo,
      no_id:         no.id,
      altura_m:      undefined,
    })
  }

  return { criar, remover, atualizar }
}

// ── 2. PLANTA → DOMÍNIO ──────────────────────────────────────────
// Quando o engenheiro move/adiciona pontos na planta:
// → atualizar pos_x/pos_y dos NoTopologico vinculados

export interface SyncPlantToDomainInput {
  pontos: PontoEletrico[]
  nos:    NoTopologico[]
}

export interface SyncPlantToDomainOutput {
  // Nós a atualizar (ponto vinculado mudou de posição)
  atualizar_nos: { id: string; pos_x: number; pos_y: number }[]
  // Nós a criar (ponto na planta sem nó correspondente — engenheiro posicionou manualmente)
  criar_nos:     Omit<NoTopologico, 'id'>[]
}

export function syncPlantToDomain(input: SyncPlantToDomainInput): SyncPlantToDomainOutput {
  const { pontos, nos } = input
  const atualizar_nos: { id: string; pos_x: number; pos_y: number }[] = []
  const criar_nos:     Omit<NoTopologico, 'id'>[]                     = []

  const no_map = new Map(nos.map(n => [n.id, n]))

  for (const p of pontos) {
    if (p.no_id) {
      // Ponto vinculado a nó — sincronizar posição
      const no = no_map.get(p.no_id)
      if (no && (no.pos_x !== p.x || no.pos_y !== p.y)) {
        atualizar_nos.push({ id: p.no_id, pos_x: p.x, pos_y: p.y })
      }
    } else {
      // Ponto sem nó vinculado — candidato a criar NoTopologico
      // Apenas se o ponto for do tipo que representa nó elétrico físico
      const tipo_no = tipoPontoToNo(p.tipo)
      if (tipo_no) {
        criar_nos.push({
          tipo:    tipo_no,
          nome:    tipoNome(p.tipo),
          comodo:  p.comodo_id,
          pos_x:   p.x,
          pos_y:   p.y,
        })
      }
    }
  }

  return { atualizar_nos, criar_nos }
}

// ── 3. VALIDAÇÃO DE CONSISTÊNCIA ─────────────────────────────────
// Detecta inconsistências entre os dois stores

export interface InconsistenciaSync {
  tipo:       'orfao_ponto' | 'orfao_no' | 'posicao_divergente'
  descricao:  string
  ponto_id?:  string
  no_id?:     string
}

export function detectarInconsistencias(
  pontos: PontoEletrico[],
  nos:    NoTopologico[],
  circuitos: RawCircuit[]
): InconsistenciaSync[] {
  const problemas: InconsistenciaSync[] = []
  const no_ids       = new Set(nos.map(n => n.id))
  const circuito_ids = new Set(circuitos.map(c => c.id))

  for (const p of pontos) {
    if (p.no_id && !no_ids.has(p.no_id)) {
      problemas.push({
        tipo: 'orfao_ponto',
        descricao: `Ponto ${p.id} referencia nó ${p.no_id} que não existe mais`,
        ponto_id: p.id, no_id: p.no_id,
      })
    }
    if (p.circuito_id && !circuito_ids.has(p.circuito_id)) {
      problemas.push({
        tipo: 'orfao_ponto',
        descricao: `Ponto ${p.id} referencia circuito ${p.circuito_id} que não existe mais`,
        ponto_id: p.id,
      })
    }
  }

  for (const no of nos) {
    if (no.pos_x == null) continue
    const pontoVinculado = pontos.find(p => p.no_id === no.id)
    if (!pontoVinculado) continue
    const dx = Math.abs((pontoVinculado.x - (no.pos_x ?? 0)))
    const dy = Math.abs((pontoVinculado.y - (no.pos_y ?? 0)))
    if (dx > 0.01 || dy > 0.01) {
      problemas.push({
        tipo: 'posicao_divergente',
        descricao: `Nó ${no.nome} está em (${no.pos_x?.toFixed(2)},${no.pos_y?.toFixed(2)}) mas ponto em (${pontoVinculado.x.toFixed(2)},${pontoVinculado.y.toFixed(2)})`,
        no_id: no.id, ponto_id: pontoVinculado.id,
      })
    }
  }

  return problemas
}

// ── Helpers de mapeamento ─────────────────────────────────────────
import type { TipoNo } from '../types/electrical'
import type { TipoPontoEletrico } from '../types/geometry'

function noToTipoPonto(tipo: TipoNo): TipoPontoEletrico | null {
  const mapa: Partial<Record<TipoNo, TipoPontoEletrico>> = {
    QD:                'QD',
    CAIXA_PASSAGEM:    'CAIXA_PASSAGEM',
    CAIXA_DERIVACAO:   'CAIXA_PASSAGEM',
    PONTO_LUZ:         'LUMINARIA',
    CAIXA_TOMADA:      'TUG_BAIXA',
    CAIXA_INTERRUPTOR: 'INTERRUPTOR_SIMPLES',
  }
  return mapa[tipo] ?? null
}

function tipoPontoToNo(tipo: TipoPontoEletrico): TipoNo | null {
  const mapa: Partial<Record<TipoPontoEletrico, TipoNo>> = {
    LUMINARIA:              'PONTO_LUZ',
    LUMINARIA_PAREDE:       'PONTO_LUZ',
    TUG_BAIXA:              'CAIXA_TOMADA',
    TUG_MEDIA:              'CAIXA_TOMADA',
    TUG_ALTA:               'CAIXA_TOMADA',
    INTERRUPTOR_SIMPLES:    'CAIXA_INTERRUPTOR',
    INTERRUPTOR_PARALELO:   'CAIXA_INTERRUPTOR',
    TUE:                    'CAIXA_TOMADA',
  }
  return mapa[tipo] ?? null
}

function tipoNome(tipo: TipoPontoEletrico): string {
  const nomes: Partial<Record<TipoPontoEletrico, string>> = {
    LUMINARIA:               'Ponto de luz',
    LUMINARIA_PAREDE:        'Arandela',
    INTERRUPTOR_SIMPLES:     'Interruptor simples',
    INTERRUPTOR_PARALELO:    'Interruptor paralelo',
    INTERRUPTOR_INTERMEDIARIO: 'Interruptor intermediário',
    TUG_BAIXA:               'Tomada baixa',
    TUG_MEDIA:               'Tomada média',
    TUG_ALTA:                'Tomada alta',
    TUE:                     'Tomada especial',
    QD:                      'Quadro de distribuição',
    CAIXA_PASSAGEM:          'Caixa de passagem',
  }
  return nomes[tipo] ?? String(tipo)
}
