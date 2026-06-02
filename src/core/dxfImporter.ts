// src/core/dxfImporter.ts
// ════════════════════════════════════════════════════════════════
// DXF IMPORTER — leitura e reconhecimento de plantas arquitetônicas
//
// Fluxo:
//   1. Ler arquivo DXF
//   2. Detectar layers de parede automaticamente
//   3. Extrair polígonos fechados (contornos de cômodos)
//   4. Ler textos dentro dos polígonos (nomes dos cômodos)
//   5. Calcular área e perímetro com escala real
//   6. Retornar para revisão do engenheiro
// ════════════════════════════════════════════════════════════════

// Tipos de resultado
export interface ComodoDetectado {
  id:           string
  nome_dxf:     string      // nome detectado do texto no DXF
  nome_final:   string      // editável pelo engenheiro na revisão
  vertices:     { x: number; y: number }[]  // em metros (após escala)
  area_m2:      number
  perimetro_m:  number
  layer:        string
  confirmado:   boolean
}

export interface ResultadoImportDXF {
  comodos:       ComodoDetectado[]
  layers_parede: string[]
  layers_todas:  string[]
  escala:        number       // pixels por metro
  bbox:          { minX: number; minY: number; maxX: number; maxY: number }
  avisos:        string[]
}

// Layers comuns de parede em plantas brasileiras
const LAYERS_PAREDE_CONHECIDAS = [
  'parede', 'paredes', 'wall', 'walls', 'muro', 'muros',
  'arq-parede', 'arq_parede', 'a-wall', 'a_wall',
  'arquitetura', 'arq', 'planta', 'estrutura',
  'alvenaria', 'vedação', 'vedacao',
]

function isLayerParede(layer: string): boolean {
  const l = layer.toLowerCase().trim()
  return LAYERS_PAREDE_CONHECIDAS.some(k => l.includes(k))
}

// Calcular área de polígono (fórmula de Shoelace)
function calcularArea(vertices: { x: number; y: number }[]): number {
  let area = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += vertices[i].x * vertices[j].y
    area -= vertices[j].x * vertices[i].y
  }
  return Math.abs(area / 2)
}

// Calcular perímetro de polígono
function calcularPerimetro(vertices: { x: number; y: number }[]): number {
  let perim = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = vertices[j].x - vertices[i].x
    const dy = vertices[j].y - vertices[i].y
    perim += Math.sqrt(dx * dx + dy * dy)
  }
  return perim
}

// Verificar se ponto está dentro de polígono (ray casting)
function pontoNoPoly(
  px: number, py: number,
  vertices: { x: number; y: number }[]
): boolean {
  let dentro = false
  const n = vertices.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y
    const xj = vertices[j].x, yj = vertices[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
}

// Centróide de polígono
export function centroide(vertices: { x: number; y: number }[]): { x: number; y: number } {
  const n = vertices.length
  return {
    x: vertices.reduce((s, v) => s + v.x, 0) / n,
    y: vertices.reduce((s, v) => s + v.y, 0) / n,
  }
}

// ── Parser principal ───────────────────────────────────────────
export async function importarDXF(
  conteudo: string,
  escala_real: number = 1    // mm por unidade DXF (padrão: 1mm)
): Promise<ResultadoImportDXF> {
  // Importar dxf-parser dinamicamente
  const DxfParser = (await import('dxf-parser')).default
  const parser = new DxfParser()
  const dxf = parser.parseSync(conteudo) as any

  const avisos: string[] = []
  if (!dxf) throw new Error('DXF inválido ou vazio')
  const layers_todas = Object.keys(dxf.tables?.layer?.layers ?? {})
  const layers_parede = layers_todas.filter(isLayerParede)

  if (layers_parede.length === 0) {
    avisos.push('Nenhuma layer de parede detectada automaticamente. Selecione manualmente.')
  }

  // Coletar LWPOLYLINE e POLYLINE fechadas
  const entidades: any[] = dxf.entities ?? []
  const polilinhas_fechadas: {
    vertices: { x: number; y: number }[]
    layer: string
  }[] = []

  for (const e of entidades) {
    if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      const vertices = ((e.vertices ?? e.points ?? []) as any[]).map((v: any) => ({
        x: (v.x ?? 0) * escala_real / 1000,  // converter para metros
        y: (v.y ?? 0) * escala_real / 1000,
      }))
      // Só incluir polígonos fechados com área mínima (> 1m²)
      if (vertices.length >= 3 && (e.shape || e.closed || e.flag)) {
        const area = calcularArea(vertices)
        if (area >= 1.0) {  // mínimo 1m²
          polilinhas_fechadas.push({ vertices, layer: e.layer ?? '0' })
        }
      }
    }
  }

  // Coletar textos (nomes dos cômodos)
  const textos: { x: number; y: number; texto: string }[] = []
  for (const e of entidades) {
    if (e.type === 'TEXT' || e.type === 'MTEXT') {
      textos.push({
        x: (e.startPoint?.x ?? e.position?.x ?? 0) * escala_real / 1000,
        y: (e.startPoint?.y ?? e.position?.y ?? 0) * escala_real / 1000,
        texto: (e.text ?? e.string ?? '').trim(),
      })
    }
  }

  // Calcular bounding box geral
  const todos_x = polilinhas_fechadas.flatMap(p => p.vertices.map(v => v.x))
  const todos_y = polilinhas_fechadas.flatMap(p => p.vertices.map(v => v.y))
  const bbox = {
    minX: Math.min(...todos_x, 0),
    minY: Math.min(...todos_y, 0),
    maxX: Math.max(...todos_x, 1),
    maxY: Math.max(...todos_y, 1),
  }

  // Montar cômodos: para cada polilinha fechada, encontrar texto dentro
  const comodos: ComodoDetectado[] = polilinhas_fechadas.map((poly, i) => {
    const area   = calcularArea(poly.vertices)
    const perim  = calcularPerimetro(poly.vertices)

    // Encontrar texto dentro do polígono
    const texto_dentro = textos.find(t => pontoNoPoly(t.x, t.y, poly.vertices))
    const nome_dxf = texto_dentro?.texto ?? `Cômodo ${i + 1}`

    return {
      id:          crypto.randomUUID(),
      nome_dxf,
      nome_final:  nome_dxf,
      vertices:    poly.vertices,
      area_m2:     Math.round(area * 100) / 100,
      perimetro_m: Math.round(perim * 100) / 100,
      layer:       poly.layer,
      confirmado:  true,
    }
  })

  // Ordenar por área (maiores primeiro)
  comodos.sort((a, b) => b.area_m2 - a.area_m2)

  if (comodos.length === 0) {
    avisos.push('Nenhum cômodo detectado. Verifique se o DXF tem polígonos fechados.')
  }

  return {
    comodos,
    layers_parede,
    layers_todas,
    escala: escala_real,
    bbox,
    avisos,
  }
}

// Converter ComodoDetectado para o formato do projeto
export function converterParaComodo(det: ComodoDetectado, tipo: string = 'Social') {
  return {
    id:          det.id,
    nome:        det.nome_final,
    tipo,
    area_m2:     det.area_m2,
    perimetro_m: det.perimetro_m,
    pe_direito_m: 2.7,
    ilum_va:     0,
    tug_va:      0,
    cargas_manuais: [],
    tues:        [],
    paredes:     [],
    // Guardar vértices para renderização na planta
    vertices_m:  det.vertices,
  }
}
