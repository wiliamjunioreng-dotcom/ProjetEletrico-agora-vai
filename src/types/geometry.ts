// src/types/geometry.ts
// ════════════════════════════════════════════════════════════════
// DOMÍNIO GEOMÉTRICO — separado do domínio elétrico
//
// Princípio da separação:
//   ElectricalDomain: o que está instalado (circuitos, cargas, condutores)
//   GeometryDomain:   onde está instalado (posições, formas, paredes)
//   RenderingEngine:  como é exibido (SVG, escala, viewport)
//   InteractionEngine: como o engenheiro interage (drag, snap, select)
//
// A UI nunca altera o domínio elétrico diretamente via geometria.
// A geometria referencia o domínio elétrico por ID (nunca por estrutura).
// ════════════════════════════════════════════════════════════════

// ── Ponto 2D ─────────────────────────────────────────────────────
export interface Ponto2D { x: number; y: number }

// ── Parede de um cômodo ───────────────────────────────────────────
export type OrientacaoParede = 'N' | 'S' | 'L' | 'O'

// ── Vértice de parede ────────────────────────────────────────────
// Ponto de junção entre paredes — identidade persistente.
// Quando duas paredes compartilham um vértice, elas se "tocam" topologicamente.
// UUID persiste mesmo se a geometria mudar (ex: cômodo redimensionado).
export interface VerticeParede {
  readonly id:     string    // UUID persistente
  readonly pos:    Ponto2D   // posição geométrica (WorldSpace, metros)
  // IDs das paredes que chegam neste vértice
  // Normalmente 2 (num canto); pode ser 3+ em junções T ou X
  readonly parede_ids: readonly string[]
}

export interface Parede {
  // ── Identidade ──────────────────────────────────────────────────
  readonly id:          string    // UUID persistente, imutável
  readonly comodo_id:   string    // cômodo proprietário

  // ── Geometria (WorldSpace, metros) ──────────────────────────────
  // inicio/fim são as posições atuais dos vértices
  // Não usar para lookup de identidade — usar id dos VerticeParede
  readonly inicio:      Ponto2D
  readonly fim:         Ponto2D
  readonly orientacao:  OrientacaoParede
  readonly espessura_m: number    // 0.15m alvenaria, 0.10m drywall

  // ── Tipo construtivo ────────────────────────────────────────────
  readonly tipo:        'alvenaria' | 'drywall' | 'divisoria' | 'vidro'

  // ── Topologia ────────────────────────────────────────────────────
  // IDs dos VerticeParede que definem os extremos desta parede
  // vertice_inicio: onde a parede começa (coincide com p.inicio)
  // vertice_fim:    onde a parede termina (coincide com p.fim)
  // Manter: mesmo se a geometria mudar, a topologia é preservada
  readonly vertice_inicio_id: string   // ID do VerticeParede no início
  readonly vertice_fim_id:    string   // ID do VerticeParede no fim

  // IDs de Paredes adjacentes por vértice (para WallGraph)
  // adjacencias_inicio: quais outras paredes chegam no vértice de início
  // adjacencias_fim:    quais outras paredes chegam no vértice de fim
  readonly adjacencias_inicio: readonly string[]  // IDs de Parede
  readonly adjacencias_fim:    readonly string[]  // IDs de Parede

  // ── Ownership ────────────────────────────────────────────────────
  // Pontos elétricos instalados nesta parede
  readonly ponto_ids:   readonly string[]
}

// ── Abertura (porta/janela) ────────────────────────────────────────
export interface Abertura {
  readonly id:           string
  readonly tipo:         'porta' | 'janela'
  readonly parede_id:    string
  readonly pos_relativa: number      // 0-1 na parede
  readonly largura_m:    number
}

// ── Geometria de um cômodo ────────────────────────────────────────
export interface ComodoGeometria {
  readonly id:           string      // mesmo ID do Comodo no domínio elétrico
  readonly nome:         string
  // Retângulo principal (simplificado — polígonos na Etapa 2)
  readonly x:            number      // metros — canto superior esquerdo
  readonly y:            number      // metros — canto superior esquerdo
  readonly largura_m:    number
  readonly altura_m:     number      // profundidade
  readonly paredes:      Parede[]
  readonly aberturas:    Abertura[]
}

// ── Tipo de ponto elétrico (NBR 5444) ─────────────────────────────
export type TipoPontoEletrico =
  | 'LUMINARIA'          // ponto de luz (ceiling)
  | 'LUMINARIA_PAREDE'   // arandela
  | 'INTERRUPTOR_SIMPLES'
  | 'INTERRUPTOR_PARALELO'
  | 'INTERRUPTOR_INTERMEDIARIO'
  | 'TUG_BAIXA'          // 0.30m
  | 'TUG_MEDIA'          // 1.10m
  | 'TUG_ALTA'           // 1.80m
  | 'TUE'
  | 'TUE_MONOFASICO'
  | 'TUE_BIFASICO'
  | 'TUE_TRIFASICO'
  | 'QD'                 // quadro de distribuição
  | 'CAIXA_PASSAGEM'
  | 'CAIXA_DERIVACAO'
  | 'CAMPAINHA'
  | 'SENSOR_PRESENCA'
  | 'DADOS_TELEFONE'

// Altura de instalação padrão por tipo (NBR 5410)
export const ALTURA_PADRAO_M: Record<TipoPontoEletrico, number> = {
  LUMINARIA:                  2.5,   // pé direito - 0.2m
  LUMINARIA_PAREDE:           2.0,
  INTERRUPTOR_SIMPLES:        1.1,
  INTERRUPTOR_PARALELO:       1.1,
  INTERRUPTOR_INTERMEDIARIO:  1.1,
  TUG_BAIXA:                  0.3,
  TUG_MEDIA:                  1.1,
  TUG_ALTA:                   2.0,
  TUE:                        1.1,
  TUE_MONOFASICO:             1.1,
  TUE_BIFASICO:               1.1,
  TUE_TRIFASICO:              1.1,
  QD:                         1.6,
  CAIXA_PASSAGEM:             2.3,
  CAIXA_DERIVACAO:            2.3,
  CAMPAINHA:                  2.0,
  SENSOR_PRESENCA:            2.5,
  DADOS_TELEFONE:             0.3,
}

// ── Ponto elétrico posicionado ────────────────────────────────────
export interface PontoEletrico {
  readonly id:             string
  readonly tipo:           TipoPontoEletrico

  // ── POSIÇÃO ───────────────────────────────────────────────────
  // x, y: coordenada absoluta em metros (WorldSpace)
  // Sempre presente — é o que o renderer usa.
  //
  // pos_parametrica: posição RELATIVA à parede (ownership geométrico)
  // Presente quando o ponto foi snappado a uma parede.
  // Quando a parede move → recalcular x, y via resolverParametrica().
  // Luminárias no teto NÃO têm pos_parametrica (ficam no centro).
  readonly x:              number
  readonly y:              number
  readonly pos_parametrica?: {
    parede_id:    string    // ID do SegmentoParede do cômodo
    pos_relativa: number    // 0 = início da parede, 1 = fim
    offset_perp:  number    // metros perpendicular (0 = na parede)
  }

  readonly rotacao_graus:  0 | 90 | 180 | 270

  // ── Referências ao domínio elétrico ─────────────────────────────
  // Por ID, NUNCA por estrutura (separação de domínios)
  readonly comodo_id?:     string
  readonly circuito_id?:   string
  readonly no_id?:         string    // NoTopologico vinculado

  // ── Ponto como nó elétrico real ─────────────────────────────────
  // Cargas intencionais conectadas neste ponto (ex: tomada com equipamento)
  // Permite calcular corrente real, demanda e fator de simultaneidade
  readonly carga_ids?:     readonly string[]   // IDs de CargaManual

  // Condutores que chegam/saem neste ponto (rastreabilidade completa)
  // Preenchido pelo buildCondutoresCircuito ao traçar o circuito
  readonly condutor_ids?:  readonly string[]   // IDs de CondutorContinuo

  // Caixa física de instalação (calculada pelo GrupoInstalacao)
  readonly caixa_id?:      string              // ID de CaixaFisica

  // Grupo de instalação ao qual pertence (conjunto na mesma caixa)
  readonly grupo_id?:      string              // ID de GrupoInstalacao

  // ── Física ──────────────────────────────────────────────────────
  readonly altura_m?:      number
  readonly selecionado?:   boolean
}

// ── Segmento de eletroduto no canvas ─────────────────────────────
export interface SegmentoCanvas {
  readonly id:           string
  // Pontos do traçado (ortogonal para Etapa 1)
  readonly pontos:       Ponto2D[]
  // Referência ao SegmentoEletroduto do domínio topológico
  readonly segmento_id?: string
  readonly diametro_mm:  number
  readonly circuito_ids: string[]
}

// ── Estado do viewport (pan/zoom) ────────────────────────────────
export interface Viewport {
  readonly offset_x:    number   // pixels de deslocamento
  readonly offset_y:    number   // pixels de deslocamento
  readonly escala:      number   // pixels por metro (padrão: 80)
  readonly escala_min:  number
  readonly escala_max:  number
}

// ── Planta elétrica completa ──────────────────────────────────────
export interface PlantaEletrica {
  readonly id:          string
  readonly nome:        string   // "Planta Baixa — Térreo"
  readonly escala_ref:  number   // metros por unidade (ex: 0.01 = 1:100)
  readonly comodos:     ComodoGeometria[]
  readonly pontos:      PontoEletrico[]
  readonly segmentos:   SegmentoCanvas[]
  readonly viewport:    Viewport
  // Metadados
  readonly criado_em:   string
  readonly modificado:  boolean
}
