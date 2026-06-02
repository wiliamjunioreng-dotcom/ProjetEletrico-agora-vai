// src/store/plantaStore.ts
// ════════════════════════════════════════════════════════════════
// PLANTA STORE — estado geométrico separado do domínio elétrico
//
// Separação de responsabilidades:
//   projectStore: domínio elétrico (circuitos, cômodos, cargas)
//   plantaStore:  domínio geométrico (posições, formas, viewport)
//
// A planta referencia o domínio elétrico por IDs, nunca por estrutura.
// Isso permite que os dois domínios evoluam independentemente.
// ════════════════════════════════════════════════════════════════

import { create } from 'zustand'
import { resolverParametrica } from '../core/coords'
import type { SegmentoParede } from '../core/coords'
import type {
  PlantaEletrica, ComodoGeometria, PontoEletrico,
  SegmentoCanvas, Viewport, TipoPontoEletrico,
} from '../types/geometry'

// ── Plano de fundo (imagem/PDF como referência) ──────────────────
export interface PlanoDeFundo {
  readonly id:          string
  readonly tipo:        'imagem' | 'pdf_pagina'
  readonly data_url:    string      // base64 da imagem
  // Calibração espacial
  readonly calibrado:   boolean
  readonly escala_px_m: number | null   // pixels por metro (null = não calibrado)
  // Offset de alinhamento (metros)
  readonly offset_x_m:  number
  readonly offset_y_m:  number
  // Opacidade de exibição (0-1)
  readonly opacidade:   number
  // Travado (não pode ser movido acidentalmente)
  readonly travado:     boolean
}

interface PlantaState {
  planta:    PlantaEletrica
  plano_de_fundo: PlanoDeFundo | null
  // Interação atual
  ferramenta:   'selecionar' | 'adicionar_comodo' | 'adicionar_ponto' | 'adicionar_eletroduto' | 'mover'
  tipo_ativo:   TipoPontoEletrico | null
  selecionados: string[]   // IDs de pontos selecionados

  // Ações de planta
  resetarPlanta:    () => void
  // Cômodos
  addComodoGeom:    (cg: Omit<ComodoGeometria, 'paredes' | 'aberturas'>) => void
  updateComodoGeom: (id: string, partial: Partial<ComodoGeometria>) => void
  removeComodoGeom: (id: string) => void
  // Pontos elétricos
  setPlanoFundo: (pf: PlanoDeFundo | null) => void
  calibrarPlano: (escala_px_m: number, offset_x_m: number, offset_y_m: number) => void
  setOpacidadePlano: (opacidade: number) => void
  resolverPontosParametricos: (paredes: import('../core/coords').SegmentoParede[]) => void
  addPonto:         (p: Omit<PontoEletrico, 'id'>) => void
  updatePonto:      (id: string, partial: Partial<PontoEletrico>) => void
  removePonto:      (id: string) => void
  movePonto:        (id: string, x: number, y: number) => void
  // Segmentos
  addSegmento:      (s: Omit<SegmentoCanvas, 'id'>) => void
  removeSegmento:   (id: string) => void
  // Viewport
  setViewport:      (v: Partial<Viewport>) => void
  pan:              (dx: number, dy: number) => void
  zoom:             (delta: number, cx: number, cy: number) => void
  resetViewport:    () => void
  fitToContent:     () => void
  // Interação
  setFerramenta:    (f: PlantaState['ferramenta']) => void
  setTipoAtivo:     (t: TipoPontoEletrico | null) => void
  setSelecionados:  (ids: string[]) => void
  // Auto-layout: gera geometria de cômodos a partir do domínio elétrico
  gerarGeometriaDeComodos: (
    comodos: { id: string; nome: string; area_m2: number; perimetro_m: number }[]
  ) => void
}

const VIEWPORT_PADRAO: Viewport = {
  offset_x: 80, offset_y: 80,
  escala: 80,   // 80 pixels por metro
  escala_min: 20, escala_max: 400,
}

const PLANTA_VAZIA: PlantaEletrica = {
  id:          crypto.randomUUID(),
  nome:        'Planta Baixa',
  escala_ref:  0.01,   // 1:100
  comodos:     [],
  pontos:      [],
  segmentos:   [],
  viewport:    VIEWPORT_PADRAO,
  criado_em:   new Date().toISOString(),
  modificado:  false,
}

export const usePlantaStore = create<PlantaState>((set, get) => ({
  planta:      PLANTA_VAZIA,
  ferramenta:  'selecionar',
  tipo_ativo:  null,
  selecionados:[],
  plano_de_fundo: null,

  resetarPlanta: () => set({
    planta: { ...PLANTA_VAZIA, id: crypto.randomUUID(), criado_em: new Date().toISOString() },
    selecionados: [],
  }),

  addComodoGeom: (cg) => set(s => ({
    planta: {
      ...s.planta,
      comodos: [...s.planta.comodos, { ...cg, paredes: [], aberturas: [] }],
      modificado: true,
    },
  })),

  updateComodoGeom: (id, partial) => set(s => ({
    planta: {
      ...s.planta,
      comodos: s.planta.comodos.map(c => {
        if (c.id !== id) return c
        const updated = { ...c, ...partial }
        // Recalcular geometria das Paredes soberanas quando cômodo muda
        // Mantém IDs persistentes, só atualiza início/fim
        if (updated.paredes && updated.paredes.length === 4 &&
            (partial.largura_m != null || partial.altura_m != null || partial.x != null || partial.y != null)) {
          const { x, y, largura_m: lm, altura_m: am } = updated
          const atualizarParede = (idx: number, ini: [number,number], fim: [number,number]) => ({
            ...updated.paredes[idx],
            inicio: { x: ini[0], y: ini[1] },
            fim:    { x: fim[0], y: fim[1] },
          })
          updated.paredes = [
            atualizarParede(0, [x, y],         [x+lm, y]),       // N
            atualizarParede(1, [x+lm, y],       [x+lm, y+am]),    // L
            atualizarParede(2, [x+lm, y+am],    [x, y+am]),       // S
            atualizarParede(3, [x, y+am],        [x, y]),          // O
          ] as typeof updated.paredes
        }
        return updated
      }),
      modificado: true,
    },
  })),

  removeComodoGeom: (id) => set(s => ({
    planta: {
      ...s.planta,
      comodos:  s.planta.comodos.filter(c => c.id !== id),
      pontos:   s.planta.pontos.filter(p => p.comodo_id !== id),
      modificado: true,
    },
  })),

  setPlanoFundo: (pf) => set({ plano_de_fundo: pf }),
  calibrarPlano: (escala_px_m, offset_x_m, offset_y_m) => set(s => ({
    plano_de_fundo: s.plano_de_fundo
      ? { ...s.plano_de_fundo, calibrado: true, escala_px_m, offset_x_m, offset_y_m }
      : null,
  })),
  setOpacidadePlano: (opacidade) => set(s => ({
    plano_de_fundo: s.plano_de_fundo
      ? { ...s.plano_de_fundo, opacidade: Math.max(0, Math.min(1, opacidade)) }
      : null,
  })),

  // Recalcular posições absolutas de pontos paramétricos dado paredes atuais
  resolverPontosParametricos: (paredes: SegmentoParede[]) => {
    set(s => ({
      planta: {
        ...s.planta,
        pontos: s.planta.pontos.map(p => {
          if (!p.pos_parametrica) return p
          const resolvido = resolverParametrica(p.pos_parametrica, paredes)
          if (!resolvido) return p  // parede não encontrada — manter posição atual
          return { ...p, x: resolvido.x_m, y: resolvido.y_m }
        }),
        modificado: true,
      },
    }))
  },

  addPonto: (p) => {
    const id = crypto.randomUUID()
    set(s => {
      const novo_ponto = { ...p, id }
      // Se o ponto tem pos_parametrica, registrar seu ID na Parede soberana
      const comodos_atualizados = p.pos_parametrica
        ? s.planta.comodos.map(cg => ({
            ...cg,
            paredes: cg.paredes.map(parede =>
              parede.id === p.pos_parametrica!.parede_id
                ? { ...parede, ponto_ids: [...parede.ponto_ids, id] }
                : parede
            ),
          }))
        : s.planta.comodos

      return ({
        planta: {
          ...s.planta,
          comodos: comodos_atualizados,
          pontos: [...s.planta.pontos, novo_ponto],
          modificado: true,
        },
      })
    })
  },

  updatePonto: (id, partial) => set(s => ({
    planta: {
      ...s.planta,
      pontos: s.planta.pontos.map(p => p.id === id ? { ...p, ...partial } : p),
      modificado: true,
    },
  })),

  removePonto: (id) => set(s => ({
    planta: {
      ...s.planta,
      pontos: s.planta.pontos.filter(p => p.id !== id),
      modificado: true,
    },
    selecionados: s.selecionados.filter(sid => sid !== id),
  })),

  movePonto: (id, x, y) => set(s => ({
    planta: {
      ...s.planta,
      pontos: s.planta.pontos.map(p => p.id === id ? { ...p, x, y } : p),
      modificado: true,
    },
  })),

  addSegmento: (seg) => set(s => ({
    planta: {
      ...s.planta,
      segmentos: [...s.planta.segmentos, { ...seg, id: crypto.randomUUID() }],
      modificado: true,
    },
  })),

  removeSegmento: (id) => set(s => ({
    planta: {
      ...s.planta,
      segmentos: s.planta.segmentos.filter(seg => seg.id !== id),
      modificado: true,
    },
  })),

  setViewport: (v) => set(s => ({
    planta: { ...s.planta, viewport: { ...s.planta.viewport, ...v } },
  })),

  pan: (dx, dy) => set(s => ({
    planta: {
      ...s.planta,
      viewport: {
        ...s.planta.viewport,
        offset_x: s.planta.viewport.offset_x + dx,
        offset_y: s.planta.viewport.offset_y + dy,
      },
    },
  })),

  zoom: (delta, cx, cy) => set(s => {
    const vp = s.planta.viewport
    const fator = delta > 0 ? 1.15 : 0.87
    const nova_escala = Math.max(vp.escala_min, Math.min(vp.escala_max, vp.escala * fator))
    const ratio = nova_escala / vp.escala
    // Zoom centrado no cursor (cx, cy em pixels)
    return {
      planta: {
        ...s.planta,
        viewport: {
          ...vp,
          escala:   nova_escala,
          offset_x: cx - (cx - vp.offset_x) * ratio,
          offset_y: cy - (cy - vp.offset_y) * ratio,
        },
      },
    }
  }),

  resetViewport: () => set(s => ({
    planta: { ...s.planta, viewport: VIEWPORT_PADRAO },
  })),

  fitToContent: () => {
    const { planta } = get()
    const comodos = planta.comodos
    if (comodos.length === 0) return

    // Calcular bounding box de todos os cômodos
    const xs = comodos.flatMap(c => [c.x, c.x + c.largura_m])
    const ys = comodos.flatMap(c => [c.y, c.y + c.altura_m])
    const min_x = Math.min(...xs), max_x = Math.max(...xs)
    const min_y = Math.min(...ys), max_y = Math.max(...ys)

    // Calcular escala para caber em ~800×600 pixels
    const escala_x = 750 / (max_x - min_x + 2)
    const escala_y = 550 / (max_y - min_y + 2)
    const escala = Math.min(escala_x, escala_y, VIEWPORT_PADRAO.escala_max)

    set(s => ({
      planta: {
        ...s.planta,
        viewport: {
          ...s.planta.viewport,
          escala,
          offset_x: 40 - min_x * escala,
          offset_y: 40 - min_y * escala,
        },
      },
    }))
  },

  setFerramenta: (f) => set({ ferramenta: f, selecionados: [] }),
  setTipoAtivo:  (t) => set({ tipo_ativo: t }),
  setSelecionados:(ids) => set({ selecionados: ids }),

  // ── Auto-layout de cômodos ────────────────────────────────────
  // Gera geometria retangular a partir das áreas dos cômodos
  // Posicionamento em grade simples (manual depois)
  gerarGeometriaDeComodos: (comodos) => {
    const GRID_COLS = 3
    const GAP       = 0.5  // metros entre cômodos

    const geoms: ComodoGeometria[] = comodos.map((c, i) => {
      // Estimar proporção do cômodo
      // área ≈ largura × altura, perímetro = 2(largura + altura)
      // Resolver: l × h = área, 2(l + h) = perímetro
      // → h = perímetro/4 ± sqrt((perímetro/4)² - área) (usar a maior raiz)
      const A = c.area_m2
      const P = c.perimetro_m
      const discriminante = Math.max(0, (P/4)**2 - A)
      const lado_grande = P/4 + Math.sqrt(discriminante)  // maior dimensão
      const lado_pequeno = P/4 - Math.sqrt(discriminante)  // menor dimensão
      const largura = Math.max(lado_pequeno, 1.5)
      const altura  = Math.max(lado_grande, A / largura)

      // Posição em grade
      const col = i % GRID_COLS
      const row = Math.floor(i / GRID_COLS)
      // Calcular offset acumulado por coluna (largura variável)
      const x_offset = col * (8 + GAP)  // simplificado: 8m por coluna
      const y_offset = row * (6 + GAP)  // simplificado: 6m por linha

      const lm = Math.round(largura * 10) / 10
      const am = Math.round(altura  * 10) / 10
      const x  = 1 + x_offset
      const y  = 1 + y_offset

      // Paredes soberanas: UUID persistentes para paredes E vértices
      // 4 vértices (cantos NW→NE→SE→SW) e 4 paredes (N→L→S→O)
      // Adjacências declaradas explicitamente — fundação do WallGraph
      const [vNO, vNE, vSE, vSO] = [
        crypto.randomUUID(), crypto.randomUUID(),
        crypto.randomUUID(), crypto.randomUUID(),
      ]
      const [pN, pL, pS, pO] = [
        crypto.randomUUID(), crypto.randomUUID(),
        crypto.randomUUID(), crypto.randomUUID(),
      ]
      const paredes: ComodoGeometria['paredes'] = [
        { id: pN, comodo_id: c.id, orientacao: 'N' as const,
          inicio: { x,      y      }, fim: { x: x+lm, y      },
          espessura_m: 0.15, tipo: 'alvenaria' as const, ponto_ids: [],
          vertice_inicio_id: vNO, vertice_fim_id: vNE,
          adjacencias_inicio: [pO], adjacencias_fim: [pL] },
        { id: pL, comodo_id: c.id, orientacao: 'L' as const,
          inicio: { x: x+lm, y      }, fim: { x: x+lm, y: y+am },
          espessura_m: 0.15, tipo: 'alvenaria' as const, ponto_ids: [],
          vertice_inicio_id: vNE, vertice_fim_id: vSE,
          adjacencias_inicio: [pN], adjacencias_fim: [pS] },
        { id: pS, comodo_id: c.id, orientacao: 'S' as const,
          inicio: { x: x+lm, y: y+am }, fim: { x,     y: y+am },
          espessura_m: 0.15, tipo: 'alvenaria' as const, ponto_ids: [],
          vertice_inicio_id: vSE, vertice_fim_id: vSO,
          adjacencias_inicio: [pL], adjacencias_fim: [pO] },
        { id: pO, comodo_id: c.id, orientacao: 'O' as const,
          inicio: { x,     y: y+am }, fim: { x,     y      },
          espessura_m: 0.15, tipo: 'alvenaria' as const, ponto_ids: [],
          vertice_inicio_id: vSO, vertice_fim_id: vNO,
          adjacencias_inicio: [pS], adjacencias_fim: [pN] },
      ]

      return {
        id:        c.id,
        nome:      c.nome,
        x, y,
        largura_m: lm,
        altura_m:  am,
        paredes,
        aberturas: [],
      }
    })

    set(s => ({
      planta: {
        ...s.planta,
        comodos: geoms,
        modificado: true,
      },
    }))

    // Fit automático após gerar
    setTimeout(() => get().fitToContent(), 50)
  },
}))
