// src/data/templates.ts
// Templates de projeto elétrico para edificações típicas
// O engenheiro escolhe um template como ponto de partida
// e personaliza conforme a realidade da obra

import type { Comodo } from '../types/electrical'

interface Template {
  id:         string
  nome:       string
  descricao:  string
  icone:      string
  tags:       string[]   // 'residencial' | 'comercial' | 'pequeno' | 'medio' | 'grande'
  // Configuração do projeto
  v_fase:     127 | 220
  n_fases:    1 | 2 | 3
  du_max:     number
  // Cômodos pré-configurados
  comodos:    Omit<Comodo, 'id' | 'paredes' | 'pe_direito_m' | 'cargas_manuais'>[]
}

export const TEMPLATES: Template[] = [
  // ── Residencial ───────────────────────────────────────────────
  {
    id: 'kitnet',
    nome: 'Kitnet / Studio',
    descricao: 'Unidade compacta (até 30m²): sala integrada, banheiro, área de serviço',
    icone: '🏠',
    tags: ['residencial', 'pequeno'],
    v_fase: 127, n_fases: 1, du_max: 4,
    comodos: [
      { nome:'Sala/Quarto', tipo:'Social', area_m2:18, perimetro_m:18, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Banheiro',    tipo:'Banho',  area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
      { nome:'Área de Serviço', tipo:'Lavanderia', area_m2:3, perimetro_m:7, ilum_va:100, tug_va:600, tues:[] },
    ],
  },
  {
    id: 'apto_2qts',
    nome: 'Apartamento 2 Quartos',
    descricao: 'Apartamento padrão (~60m²): sala, 2 quartos, 2 banheiros, cozinha, área de serviço',
    icone: '🏢',
    tags: ['residencial', 'medio'],
    v_fase: 127, n_fases: 1, du_max: 4,
    comodos: [
      { nome:'Sala de Estar',   tipo:'Social',    area_m2:20, perimetro_m:20, ilum_va:200, tug_va:600, tues:[] },
      { nome:'Quarto Principal',tipo:'Social',    area_m2:14, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Quarto 2',        tipo:'Social',    area_m2:10, perimetro_m:14, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Cozinha',         tipo:'Cozinha',   area_m2:8,  perimetro_m:12, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Banheiro Social',  tipo:'Banho',   area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
      { nome:'Banheiro Suíte',   tipo:'Banho',   area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
      { nome:'Área de Serviço',  tipo:'Lavanderia', area_m2:4, perimetro_m:8, ilum_va:100, tug_va:600, tues:[] },
    ],
  },
  {
    id: 'residencia_padrao',
    nome: 'Residência Padrão',
    descricao: 'Casa térrea (~120m²): ambientes sociais, 3 quartos, churrasqueira, garagem',
    icone: '🏡',
    tags: ['residencial', 'grande'],
    v_fase: 127, n_fases: 1, du_max: 4,
    comodos: [
      { nome:'Sala de Estar',   tipo:'Social',    area_m2:22, perimetro_m:22, ilum_va:200, tug_va:600, tues:[] },
      { nome:'Sala de Jantar',  tipo:'Social',    area_m2:14, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Quarto 1 (suíte)', tipo:'Social',   area_m2:16, perimetro_m:18, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Quarto 2',        tipo:'Social',    area_m2:12, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Quarto 3',        tipo:'Social',    area_m2:10, perimetro_m:14, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Cozinha',         tipo:'Cozinha',   area_m2:12, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Banheiro Social',  tipo:'Banho',   area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
      { nome:'Banheiro Suíte',   tipo:'Banho',   area_m2:6,  perimetro_m:10, ilum_va:100, tug_va:100, tues:[] },
      { nome:'Área de Serviço',  tipo:'Lavanderia', area_m2:6, perimetro_m:10, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Garagem',          tipo:'Garagem', area_m2:20, perimetro_m:20, ilum_va:100, tug_va:200, tues:[] },
    ],
  },
  // ── Comercial ──────────────────────────────────────────────────
  {
    id: 'loja',
    nome: 'Loja / Comércio',
    descricao: 'Estabelecimento comercial (~60m²): salão, estoque, banheiro, vitrine',
    icone: '🏪',
    tags: ['comercial', 'medio'],
    v_fase: 220, n_fases: 1, du_max: 4,
    comodos: [
      { nome:'Salão de Vendas',  tipo:'Social',  area_m2:40, perimetro_m:28, ilum_va:400, tug_va:600, tues:[] },
      { nome:'Estoque',          tipo:'Social',  area_m2:12, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Banheiro',         tipo:'Banho',   area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
      { nome:'Área de Serviço',  tipo:'Lavanderia', area_m2:4, perimetro_m:8, ilum_va:100, tug_va:600, tues:[] },
    ],
  },
  {
    id: 'escritorio',
    nome: 'Escritório',
    descricao: 'Escritório (~80m²): recepção, sala de reunião, 2 salas, copa, banheiros',
    icone: '🏬',
    tags: ['comercial', 'medio'],
    v_fase: 220, n_fases: 1, du_max: 4,
    comodos: [
      { nome:'Recepção',           tipo:'Social',  area_m2:12, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Sala de Reunião',    tipo:'Social',  area_m2:16, perimetro_m:18, ilum_va:200, tug_va:600, tues:[] },
      { nome:'Sala de Trabalho 1', tipo:'Social',  area_m2:20, perimetro_m:20, ilum_va:200, tug_va:600, tues:[] },
      { nome:'Sala de Trabalho 2', tipo:'Social',  area_m2:14, perimetro_m:16, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Copa',               tipo:'Cozinha', area_m2:8,  perimetro_m:12, ilum_va:100, tug_va:600, tues:[] },
      { nome:'Banheiro Masculino',  tipo:'Banho',  area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
      { nome:'Banheiro Feminino',   tipo:'Banho',  area_m2:4,  perimetro_m:8,  ilum_va:100, tug_va:100, tues:[] },
    ],
  },
]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id)
}

export function templatePorTag(tag: string): Template[] {
  return TEMPLATES.filter(t => t.tags.includes(tag))
}
