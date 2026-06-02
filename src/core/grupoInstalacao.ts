// src/core/grupoInstalacao.ts
// ════════════════════════════════════════════════════════════════
// GRUPO DE INSTALAÇÃO — entidade real da instalação construtiva
//
// Problema: hoje cada ponto elétrico é independente.
// Realidade: tomada + interruptor na mesma caixa 4x2 é UMA entidade.
//
// Consequências de ignorar isso:
//   - quantitativo errado (2 caixas em vez de 1 compartilhada)
//   - posicionamento desalinhado (diverge visualmente)
//   - eletroduto errado (compartilham entrada)
//   - altura errada (todos na mesma altura)
//
// Exemplos de grupos reais:
//   - tomada simples: 1 ponto / 1 caixa 4x2
//   - tomada dupla: 2 tomadas / 1 caixa 4x2
//   - tomada + interruptor: 2 pontos / 1 caixa 4x2
//   - conjunto TV + dados + energia: 3 pontos / 1 caixa 4x4
//   - bancada com 3 tomadas: 3 tomadas / 1 caixa 4x4
// ════════════════════════════════════════════════════════════════

import type { TipoPontoEletrico } from '../types/geometry'
import type { RegraInstalacao } from './nbr5444'
import { SIMBOLOS_NBR5444 } from './nbr5444'

// ── Elemento dentro do grupo ──────────────────────────────────────
export interface ElementoGrupo {
  readonly id:           string
  readonly tipo:         TipoPontoEletrico
  readonly circuito_id?: string
  // Posição dentro do grupo (relativa ao centro do grupo)
  readonly offset_eixo_m: number   // offset ao longo do eixo da parede
}

// ── Grupo de instalação ───────────────────────────────────────────
export interface GrupoInstalacao {
  readonly id:           string
  readonly face_id:      string
  readonly parede_id:    string
  // Posição paramétrica na parede
  readonly pos_relativa: number   // 0-1 ao longo da parede
  readonly altura_m:     number   // altura do centro do grupo (piso → eixo)
  // Elementos do grupo
  readonly elementos:    readonly ElementoGrupo[]
  // Caixa resultante (calculada dos elementos)
  readonly caixa:        '4x2' | '4x4'
  // Distância entre eixos dos elementos (padrão 0.057m = 1 módulo DIN)
  readonly distancia_eixos_m: number
  // Alinhamento dos elementos no grupo
  readonly alinhamento:  'horizontal' | 'vertical'
}

// ── Determinar caixa para um conjunto de tipos ────────────────────
// 4x2 para até 2 módulos; 4x4 para 3+
export function caixaParaGrupo(tipos: TipoPontoEletrico[]): '4x2' | '4x4' {
  const n = tipos.length
  const tem_tue = tipos.some(t => t === 'TUE' || t === 'QD')
  if (tem_tue || n > 2) return '4x4'
  return '4x2'
}

// ── Validar compatibilidade do grupo ─────────────────────────────
// Todos os elementos precisam ser compatíveis com a mesma caixa e altura
export interface ValidacaoGrupo {
  valido:    boolean
  problemas: string[]
}

export function validarGrupo(grupo: GrupoInstalacao): ValidacaoGrupo {
  const problemas: string[] = []
  const regras = grupo.elementos
    .map(e => SIMBOLOS_NBR5444[e.tipo]?.regras)
    .filter(Boolean) as RegraInstalacao[]

  // Todos devem permitir agrupamento
  const nao_agrupavel = grupo.elementos.filter(
    e => SIMBOLOS_NBR5444[e.tipo]?.regras.permite_agrupamento === false
  )
  if (nao_agrupavel.length > 0) {
    problemas.push(`${nao_agrupavel[0].tipo} não permite agrupamento`)
  }

  // Alturas devem ser compatíveis (mesma faixa)
  const alturas = regras.map(r => r.altura_m)
  const alt_min = Math.min(...alturas)
  const alt_max = Math.max(...alturas)
  if (alt_max - alt_min > 0.30) {
    problemas.push(
      `Alturas incompatíveis no grupo: ${alt_min.toFixed(2)}m vs ${alt_max.toFixed(2)}m`
    )
  }

  // Número máximo por tipo de caixa
  if (grupo.caixa === '4x2' && grupo.elementos.length > 2) {
    problemas.push('Caixa 4×2 comporta no máximo 2 módulos')
  }
  if (grupo.caixa === '4x4' && grupo.elementos.length > 4) {
    problemas.push('Caixa 4×4 comporta no máximo 4 módulos')
  }

  return { valido: problemas.length === 0, problemas }
}

// ── Construir grupo de instalação ─────────────────────────────────
export function buildGrupoInstalacao(
  id:         string,
  face_id:    string,
  parede_id:  string,
  pos_relativa: number,
  altura_m:   number,
  tipos:      TipoPontoEletrico[],
  circuito_ids: (string | undefined)[] = [],
  alinhamento: 'horizontal' | 'vertical' = 'horizontal',
  distancia_eixos_m = 0.057   // módulo DIN: 57mm
): GrupoInstalacao {
  const caixa = caixaParaGrupo(tipos)
  const n     = tipos.length

  // Distribuir elementos centrados no eixo do grupo
  const total_width = (n - 1) * distancia_eixos_m
  const elementos: ElementoGrupo[] = tipos.map((tipo, i) => ({
    id:             `${id}-elem-${i}`,
    tipo,
    circuito_id:    circuito_ids[i],
    offset_eixo_m:  -total_width / 2 + i * distancia_eixos_m,
  }))

  return {
    id, face_id, parede_id, pos_relativa, altura_m,
    elementos, caixa, distancia_eixos_m, alinhamento,
  }
}

// ── Posição X de cada elemento do grupo na parede ─────────────────
// Dado o comprimento real da parede, retornar posição absoluta (m) de cada elemento
export function posicaoElementos(
  grupo:        GrupoInstalacao,
  comp_parede_m: number
): { elemento_id: string; pos_m: number; offset: number }[] {
  const pos_central = grupo.pos_relativa * comp_parede_m
  return grupo.elementos.map(e => ({
    elemento_id: e.id,
    pos_m:       pos_central + e.offset_eixo_m,
    offset:      e.offset_eixo_m,
  }))
}

// ── Quantitativo de caixas ────────────────────────────────────────
export function quantCaixas(grupos: GrupoInstalacao[]): {
  '4x2': number
  '4x4': number
  'octogonal': number
} {
  const q = { '4x2': 0, '4x4': 0, 'octogonal': 0 }
  for (const g of grupos) {
    if (g.caixa === '4x2') q['4x2']++
    else if (g.caixa === '4x4') q['4x4']++
  }
  // Octogonais = luminárias avulsas (não em grupo)
  return q
}
