// src/core/luminotecnico.ts
// Método dos Lúmens — NBR ISO/CIE 8995-1
// Exportado como módulo puro — sem dependência de UI
// Usado por Luminotecnico.tsx e pelo seletor de luminária no Comodos.tsx

import { calcLuminotecnico } from './engine'
import type { LuminoInput } from './engine'

// ── Catálogo de luminárias (fonte única) ──────────────────────────
export interface ModeloLuminaria {
  nome:  string
  pot:   number  // W
  lm:    number  // lúmens
  obs?:  string
}

export const CATALOGO_LUMINARIAS: ModeloLuminaria[] = [
  // LED — uso geral residencial
  { nome: 'LED Painel 40W',       pot: 40,  lm: 3600,  obs: '60×60cm — escritório/sala' },
  { nome: 'LED Painel 24W',       pot: 24,  lm: 2400,  obs: '60×60cm — residencial' },
  { nome: 'LED Downlight 20W',    pot: 20,  lm: 2000,  obs: 'Embutir ⌀200mm' },
  { nome: 'LED Downlight 12W',    pot: 12,  lm: 1200,  obs: 'Embutir ⌀150mm' },
  { nome: 'LED Downlight 9W',     pot: 9,   lm: 900,   obs: 'Embutir ⌀90mm' },
  { nome: 'LED Downlight 7W',     pot: 7,   lm: 600,   obs: 'Embutir ⌀75mm' },
  { nome: 'LED Spot GU10 7W',     pot: 7,   lm: 600,   obs: 'Trilho ou embutir' },
  { nome: 'LED Spot GU10 5W',     pot: 5,   lm: 400,   obs: 'Trilho ou embutir' },
  { nome: 'LED Tube T8 18W/1,2m', pot: 18,  lm: 1800,  obs: 'Calha 1,2m' },
  { nome: 'LED Tube T8 9W/0,6m',  pot: 9,   lm: 900,   obs: 'Calha 0,6m' },
  { nome: 'LED Bulbo 12W',        pot: 12,  lm: 1100,  obs: 'A60 — substitui 75W' },
  { nome: 'LED Bulbo 9W',         pot: 9,   lm: 810,   obs: 'A60 — substitui 60W' },
  { nome: 'LED High Bay 100W',    pot: 100, lm: 12000, obs: 'Galpão/garagem' },
  { nome: 'Personalizada',        pot: 0,   lm: 0 },
]

// ── Iluminâncias de referência NBR ISO/CIE 8995-1 ─────────────────
export const ILUMINANCIAS_REF: Record<string, number> = {
  'Sala de estar':   200,
  'Quarto':          150,
  'Cozinha geral':   200,
  'Cozinha tarefa':  500,
  'Banheiro':        200,
  'Escritório':      500,
  'Corredor':        100,
  'Garagem':         100,
  'Lavanderia':      200,
  'Escada':          150,
  'Quarto infantil': 300,
}

// ── Resultado do Método dos Lúmens para um cômodo ─────────────────
export interface ResultadoLumens {
  n_luminarias:      number   // quantidade calculada (arredondado para cima)
  pot_total_w:       number   // potência real total instalada (W)
  e_media_lux:       number   // iluminância média resultante
  dpf_w_m2:         number   // densidade de potência (W/m²)
  phi_total_lm:      number   // fluxo luminoso total (lm)
  conforme_nbi:      boolean  // ≤ 12W/m² (NBR)
  // Para preencher a carga no cômodo
  pot_dim_va:        number   // potência de dimensionamento (fator de harmônicas LED)
  pot_real_w:        number   // potência real (consumo)
}

// ── Calcular N° de luminárias pelo Método dos Lúmens ──────────────
export function calcularLumens(
  area_m2: number,
  pe_m: number,
  lux: number,
  luminaria: ModeloLuminaria,
  refl_teto = 0.7, refl_parede = 0.5, refl_piso = 0.2
): ResultadoLumens | null {
  const { pot, lm } = luminaria
  if (pot <= 0 || lm <= 0 || area_m2 <= 0 || pe_m <= 0) return null

  const input: LuminoInput = {
    area_m2, pe_direito_m: pe_m,
    h_plano_trabalho: 0.75,
    iluminancia_lux: lux,
    refl_teto, refl_parede, refl_piso,
    luminaria_lm: lm,
    luminaria_pot_w: pot,
  }

  // Usar comp = larg = √area (aproximação quadrada)
  const lado = Math.sqrt(area_m2)
  const result = calcLuminotecnico(lado, lado, input)

  const pot_total_w = result.n_luminarias * pot
  // Fator de dimensionamento LED: 1.8× (driver + harmônicas + margem futura)
  const pot_dim_va = Math.max(
    Math.ceil(pot_total_w * 1.8),
    result.n_luminarias * 100  // mínimo NBR §9.5.2.1: 100VA/ponto
  )

  return {
    n_luminarias:  result.n_luminarias,
    pot_total_w,
    e_media_lux:   result.em_real,
    dpf_w_m2:      result.dpf,
    phi_total_lm:  result.n_luminarias * input.luminaria_lm,
    conforme_nbi:  result.dpf <= 12,
    pot_dim_va,
    pot_real_w:    pot_total_w,
  }
}
