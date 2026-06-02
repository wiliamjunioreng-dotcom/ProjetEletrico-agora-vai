// src/core/constraints.ts
// ════════════════════════════════════════════════════════════════
// CONSTRAINT ENGINE — Restrições geométricas e ownership espacial
//
// Problema: sem constraints, o CAD vira caos.
//   - tomadas flutuando no ar
//   - interruptores sem parede
//   - colisões entre pontos
//   - eletrodutos não-ortogonais
//   - ownership perdido ao mover cômodo
//
// Solução: constraints declarativas aplicadas antes de cada mutação.
//
// Princípio:
//   O ConstraintEngine NÃO bloqueia o usuário.
//   Ele INFORMA a violação e SUGERE a correção.
//   O usuário decide se aceita a sugestão.
//
// Tipos de constraint:
//   DEVE_SER_EM_PAREDE    — interruptores, tomadas
//   DISTANCIA_MINIMA      — dois pontos não se sobrepõem
//   DENTRO_DO_COMODO      — ponto deve estar no cômodo declarado
//   ORTOGONAL             — eletrodutos ortogonais por padrão
//   ALTURA_PADRAO         — tomada a 0.30m, interruptor a 1.10m
// ════════════════════════════════════════════════════════════════

import type { PontoEletrico, ComodoGeometria } from '../types/geometry'
import type { TipoPontoEletrico } from '../types/geometry'
import type { SegmentoParede, WorldPoint } from './coords'
import { snapParede } from './coords'

// ── Resultado de validação ────────────────────────────────────────
export type SeveridadeConstraint = 'bloqueio' | 'aviso' | 'info'

export interface ResultadoConstraint {
  readonly valido:     boolean
  readonly severidade: SeveridadeConstraint
  readonly mensagem:   string
  readonly sugestao?:  WorldPoint    // posição corrigida sugerida
  readonly parede_id?: string        // parede mais próxima
}

// ── Tipos de ponto que exigem parede ─────────────────────────────
const TIPOS_QUE_EXIGEM_PAREDE: TipoPontoEletrico[] = [
  'INTERRUPTOR_SIMPLES',
  'INTERRUPTOR_PARALELO',
  'INTERRUPTOR_INTERMEDIARIO',
  'TUG_BAIXA',
  'TUG_MEDIA',
  'TUG_ALTA',
  'TUE',
]

// Tipos que ficam no centro do cômodo (não em parede)
// ── 1. CONSTRAINT: deve estar em parede ──────────────────────────
export function validarEmParede(
  ponto: WorldPoint,
  tipo:  TipoPontoEletrico,
  paredes: SegmentoParede[],
  threshold_m = 0.35   // 35cm — tolerância de posicionamento
): ResultadoConstraint {
  if (!TIPOS_QUE_EXIGEM_PAREDE.includes(tipo)) {
    return { valido: true, severidade: 'info', mensagem: 'Tipo não requer parede' }
  }
  if (paredes.length === 0) {
    return { valido: true, severidade: 'info', mensagem: 'Sem paredes definidas' }
  }

  const snap = snapParede(ponto, paredes, threshold_m)
  if (snap.snapped) {
    return {
      valido: true,
      severidade: 'info',
      mensagem: `Snap na parede ${snap.parede_id} (${(snap.distancia_m * 100).toFixed(0)}cm)`,
      sugestao: snap.ponto,
      parede_id: snap.parede_id,
    }
  }

  // Fora do threshold — avisar e sugerir
  return {
    valido: false,
    severidade: 'aviso',
    mensagem: `${tipoNome(tipo)} deve estar em parede (distância: ${(snap.distancia_m * 100).toFixed(0)}cm)`,
    sugestao: snap.ponto,
    parede_id: snap.parede_id,
  }
}

// ── 2. CONSTRAINT: dentro do cômodo ──────────────────────────────
export function validarDentroDoComodo(
  ponto: WorldPoint,
  comodo: ComodoGeometria
): ResultadoConstraint {
  const { x, y, largura_m, altura_m } = comodo
  const MARGEM = 0.05  // 5cm de tolerância

  const dentro =
    ponto.x_m >= x - MARGEM &&
    ponto.x_m <= x + largura_m + MARGEM &&
    ponto.y_m >= y - MARGEM &&
    ponto.y_m <= y + altura_m + MARGEM

  if (dentro) return { valido: true, severidade: 'info', mensagem: 'Dentro do cômodo' }

  // Sugerir posição mais próxima dentro do cômodo
  const sx = Math.max(x + MARGEM, Math.min(x + largura_m - MARGEM, ponto.x_m))
  const sy = Math.max(y + MARGEM, Math.min(y + altura_m - MARGEM, ponto.y_m))
  return {
    valido: false,
    severidade: 'aviso',
    mensagem: `Ponto fora do cômodo "${comodo.nome}"`,
    sugestao: { x_m: sx, y_m: sy },
  }
}

// ── 3. CONSTRAINT: distância mínima entre pontos ─────────────────
export function validarDistanciaMinima(
  ponto: WorldPoint,
  outros: PontoEletrico[],
  excluir_id?: string,
  dist_min_m = 0.15    // 15cm mínimo
): ResultadoConstraint {
  for (const outro of outros) {
    if (outro.id === excluir_id) continue
    const dist = Math.sqrt((ponto.x_m - outro.x)**2 + (ponto.y_m - outro.y)**2)
    if (dist < dist_min_m) {
      return {
        valido: false,
        severidade: 'aviso',
        mensagem: `Muito próximo de outro ponto (${(dist * 100).toFixed(0)}cm < ${dist_min_m*100}cm mínimo)`,
      }
    }
  }
  return { valido: true, severidade: 'info', mensagem: 'Distância OK' }
}

// ── 4. SNAP INTELIGENTE ───────────────────────────────────────────
// Combina snap de parede + grid na ordem correta de prioridade
export interface SnapInteligente {
  ponto:     WorldPoint
  modo:      'parede' | 'grid'
  // Preenchido quando modo='parede' — permite criar PosicaoParametrica
  parede_id?:    string
  pos_relativa?: number    // 0-1 na parede
}

export function snapInteligente(
  ponto: WorldPoint,
  tipo:  TipoPontoEletrico,
  paredes: SegmentoParede[],
  grid_m = 0.25
): SnapInteligente {
  // 1. Tentar snap de parede para tipos que exigem parede
  if (TIPOS_QUE_EXIGEM_PAREDE.includes(tipo) && paredes.length > 0) {
    const snap = snapParede(ponto, paredes, 0.60)
    if (snap.snapped) {
      return {
        ponto:        snap.ponto,
        modo:         'parede',
        parede_id:    snap.parede_id,
        pos_relativa: snap.pos_relativa,
      }
    }
  }

  // 2. Fallback: snap ao grid
  const gx = Math.round(ponto.x_m / grid_m) * grid_m
  const gy = Math.round(ponto.y_m / grid_m) * grid_m
  return { ponto: { x_m: gx, y_m: gy }, modo: 'grid' }
}

// ── 5. VALIDAR POSIÇÃO COMPLETA ───────────────────────────────────
// Roda todas as constraints relevantes para um ponto
export function validarPosicao(
  ponto:   WorldPoint,
  tipo:    TipoPontoEletrico,
  paredes: SegmentoParede[],
  comodo?: ComodoGeometria,
  pontos?: PontoEletrico[],
  ponto_id?: string
): ResultadoConstraint[] {
  const resultados: ResultadoConstraint[] = []

  // Constraint de parede
  resultados.push(validarEmParede(ponto, tipo, paredes))

  // Constraint de cômodo
  if (comodo) resultados.push(validarDentroDoComodo(ponto, comodo))

  // Constraint de distância
  if (pontos) resultados.push(validarDistanciaMinima(ponto, pontos, ponto_id))

  return resultados.filter(r => !r.valido || r.severidade !== 'info')
}

// ── 6. ANALISAR VIOLAÇÕES EM TODOS OS PONTOS ─────────────────────
export interface ViolacaoConstraint {
  ponto_id:   string
  tipo:       TipoPontoEletrico
  resultados: ResultadoConstraint[]
}

export function analisarViolacoes(
  pontos:  PontoEletrico[],
  paredes: SegmentoParede[],
  comodos: ComodoGeometria[]
): ViolacaoConstraint[] {
  const violacoes: ViolacaoConstraint[] = []

  for (const p of pontos) {
    const comodo = comodos.find(c => c.id === p.comodo_id)
    const wp: WorldPoint = { x_m: p.x, y_m: p.y }
    const resultados = validarPosicao(wp, p.tipo, paredes, comodo, pontos, p.id)
    const violadas = resultados.filter(r => !r.valido)
    if (violadas.length > 0) violacoes.push({ ponto_id: p.id, tipo: p.tipo, resultados: violadas })
  }

  return violacoes
}

// ── 7. GERAR PAREDES DE UM CÔMODO ─────────────────────────────────
// Converter ComodoGeometria (retângulo) → SegmentoParede[]
export function paredesdoComodo(cg: ComodoGeometria): SegmentoParede[] {
  // Se o cômodo tem Paredes soberanas → usar seus IDs persistentes
  if (cg.paredes && cg.paredes.length > 0) {
    return cg.paredes.map(p => ({
      id: p.id,               // UUID persistente — parede_id no pos_parametrica
      p1: { x_m: p.inicio.x, y_m: p.inicio.y },
      p2: { x_m: p.fim.x,    y_m: p.fim.y    },
    }))
  }
  // Fallback: gerar geometricamente para cômodos antigos sem Paredes soberanas
  // Atenção: IDs aqui são derivados — pos_parametrica pode perder referência após migration
  const { id, x, y, largura_m, altura_m } = cg
  return [
    { id: `${id}-N`, p1: { x_m: x,           y_m: y          }, p2: { x_m: x + largura_m, y_m: y          } },
    { id: `${id}-L`, p1: { x_m: x + largura_m, y_m: y          }, p2: { x_m: x + largura_m, y_m: y + altura_m } },
    { id: `${id}-S`, p1: { x_m: x + largura_m, y_m: y + altura_m }, p2: { x_m: x,           y_m: y + altura_m } },
    { id: `${id}-O`, p1: { x_m: x,           y_m: y + altura_m }, p2: { x_m: x,           y_m: y          } },
  ]
}

// ── Helper: nome legível do tipo ──────────────────────────────────
function tipoNome(tipo: TipoPontoEletrico): string {
  const nomes: Partial<Record<TipoPontoEletrico, string>> = {
    INTERRUPTOR_SIMPLES: 'Interruptor',
    INTERRUPTOR_PARALELO: 'Interruptor paralelo',
    TUG_BAIXA: 'Tomada',
    TUG_MEDIA: 'Tomada (bancada)',
    TUE: 'Tomada especial',
  }
  return nomes[tipo] ?? String(tipo)
}
