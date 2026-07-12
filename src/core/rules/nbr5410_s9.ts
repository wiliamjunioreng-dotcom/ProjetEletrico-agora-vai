// src/core/rules/nbr5410_s9.ts
// ════════════════════════════════════════════════════════════════
// NBR 5410 — Seção 9: Instalações residenciais e similares
// Verificações de quantidade mínima de pontos e circuitos dedicados
//
// Referências:
//   §9.5.4 — Circuitos de uso específico (cargas ≥ 1500W dedicadas)
//   §9.6   — Distribuição de pontos por compartimento
//   §9.6.2 — ILUM: 1 ponto por cômodo, mínimo 100VA
//   §9.6.3 — TUG: quantidade por comprimento de parede
//   §9.6.3.1 — TUG em cozinha/área de serviço: min 3, espaçadas ≤ 1m bancada
//   §9.6.3.2 — TUG em banheiro: min 1, junto ao lavatório
//   §9.6.3.3 — TUG em garagem/áreas externas: min 1
//   §9.6.4 — TUE: circuito dedicado para cargas ≥ 1500W
// ════════════════════════════════════════════════════════════════

import type { ResultadoNorma } from './context'
import type { Comodo } from '../../types/electrical'

const N = 'ABNT NBR 5410:2004+Em1:2008'

function aviso(codigo: string, descricao: string, norma: string, valor?: number, limite?: number): ResultadoNorma {
  return { codigo, descricao, norma, severidade: 'aviso', conforme: false, valor, limite }
}

// ── §9.6.3 — Quantidade mínima de TUG por comprimento de parede ──
// 1 TUG a cada 5m de parede (ou fração)
// Mínimo: 1 TUG por cômodo habitável
export function verificarTUGMinimas(comodo: Comodo): ResultadoNorma[] {
  const resultados: ResultadoNorma[] = []
  const tipo = comodo.tipo

  // Contar TUGs declaradas nas cargas manuais
  const n_tug_manual = comodo.cargas_manuais.filter(c =>
    c.tipo === 'TUG'
  ).reduce((s, c) => s + (c.qtd ?? 1), 0)

  // TUG calculadas pelo sistema (fallback automático)
  // Se tem cargas manuais, usar elas; senão usar o mínimo normativo
  const tem_manual = comodo.cargas_manuais.length > 0

  // ── §9.6.3 — Mínimo por perimetro ─────────────────────────────
  if (tipo === 'Social' || tipo === 'Cozinha' || tipo === 'Lavanderia') {
    const min_por_perimetro = Math.ceil(comodo.perimetro_m / 5)
    const min_absoluto = Math.max(1, min_por_perimetro)

    if (tem_manual && n_tug_manual < min_absoluto) {
      resultados.push(aviso(
        `NBR5410.9.6.3.${tipo}`,
        `${comodo.nome}: ${n_tug_manual} TUG declarada(s), mínimo ${min_absoluto} (1 a cada 5m de parede — perímetro ${comodo.perimetro_m}m)`,
        `${N} §9.6.3 — TUG mínimas por comprimento de parede`,
        n_tug_manual, min_absoluto
      ))
    }
  }

  // ── §9.6.3.1 — Cozinha/Área de serviço ────────────────────────
  // Mínimo 3 TUGs, incluindo 1 para geladeira e 1 para forno/micro
  if (tipo === 'Cozinha' || tipo === 'Lavanderia') {
    const min_cozinha = 3

    if (tem_manual && n_tug_manual < min_cozinha) {
      resultados.push(aviso(
        `NBR5410.9.6.3.1.${tipo}`,
        `${comodo.nome}: mínimo ${min_cozinha} TUGs (geladeira + forno/micro + bancada). Declaradas: ${n_tug_manual}`,
        `${N} §9.6.3.1 — TUG mínimas em cozinha e área de serviço`,
        n_tug_manual, min_cozinha
      ))
    }
  }

  // ── §9.6.3.2 — Banheiro ────────────────────────────────────────
  // Mínimo 1 TUG junto ao lavatório (exceto WC simples < 3m²)
  if (tipo === 'Banho') {
    const min_banho = comodo.area_m2 >= 3 ? 1 : 0

    if (tem_manual && min_banho > 0 && n_tug_manual < min_banho) {
      resultados.push(aviso(
        'NBR5410.9.6.3.2',
        `${comodo.nome}: banheiro com área ≥ 3m² requer pelo menos 1 TUG junto ao lavatório`,
        `${N} §9.6.3.2 — TUG em banheiros e lavatórios`,
        n_tug_manual, min_banho
      ))
    }
  }

  // ── §9.6.3.3 — Garagem ─────────────────────────────────────────
  if (tipo === 'Garagem' || tipo === 'Externo') {
    const min_garagem = 1
    if (tem_manual && n_tug_manual < min_garagem) {
      resultados.push(aviso(
        'NBR5410.9.6.3.3',
        `${comodo.nome}: ${tipo === 'Garagem' ? 'garagem' : 'área externa'} requer mínimo 1 TUG (NBR §9.6.3.3)`,  
        `${N} §9.6.3.3 — TUG em garagens e áreas externas`,
        n_tug_manual, min_garagem
      ))
    }
  }

  return resultados
}

// ── §9.5.4 — Circuitos dedicados obrigatórios ────────────────────
// Cargas ≥ 1500W devem ter circuito exclusivo
// Cargas específicas obrigatórias: chuveiro, aquecedor, lavadora,
//   lava-louça, forno elétrico, ar-cond ≥ 1500W
const PALAVRAS_TUE_DEDICADO = [
  'chuveiro', 'aquecedor', 'torneira', 'ducha',         // aquecimento de água
  'ar.condicionado', 'ar-condicionado', 'split', 'hvac', // climatização
  'forno', 'microondas', 'fogão', 'coifão',              // culinária
  'lavadora', 'maquina.lavar', 'secadora',               // roupas
  'lava.loca', 'lava-loca', 'lava.roupa',                // louça
  'geladeira', 'freezer',                                  // refrigeração
  'bomba', 'motor',                                        // motores
]

export function verificarCircuitosDedicados(comodo: Comodo): ResultadoNorma[] {
  const resultados: ResultadoNorma[] = []

  for (const carga of comodo.cargas_manuais) {
    const pot_total = (carga.potencia_va ?? 0) * (carga.qtd ?? 1)
    const nome_lower = carga.descricao?.toLowerCase() ?? ''

    // Carga ≥ 1500W sem circuito dedicado explícito
    if (pot_total >= 1500 && carga.tipo !== 'TUE') {
      resultados.push(aviso(
        'NBR5410.9.5.4',
        `"${carga.descricao}" (${pot_total}VA): carga ≥ 1500W deve ter circuito dedicado (TUE)`,
        `${N} §9.5.4 — Circuitos de uso específico para cargas ≥ 1500W`,
        pot_total, 1500
      ))
    }

    // Equipamentos que obrigatoriamente precisam de circuito dedicado
    const e_dedicado = PALAVRAS_TUE_DEDICADO.some(p => nome_lower.includes(p.replace('.', ' ')))
    if (e_dedicado && carga.tipo !== 'TUE' && pot_total > 0) {
      resultados.push(aviso(
        'NBR5410.9.5.4.esp',
        `"${carga.descricao}": equipamento de uso específico — requer circuito TUE dedicado`,
        `${N} §9.5.4 — Chuveiro, lavadora, forno e similares: circuito exclusivo`,
        undefined, undefined
      ))
    }
  }

  return resultados
}

// ── §9.6.2 — Iluminação mínima ────────────────────────────────────
// Todo cômodo habitável deve ter pelo menos 1 ponto de iluminação
export function verificarILUMMinima(comodo: Comodo): ResultadoNorma[] {
  const resultados: ResultadoNorma[] = []

  const n_ilum = comodo.cargas_manuais.filter(c =>
    c.tipo === 'ILUM'
  ).reduce((s, c) => s + (c.qtd ?? 1), 0)

  const tipos_habitaveis = ['Social', 'Cozinha', 'Lavanderia']

  if (tipos_habitaveis.includes(comodo.tipo) && comodo.cargas_manuais.length > 0 && n_ilum === 0) {
    resultados.push(aviso(
      'NBR5410.9.6.2',
      `${comodo.nome}: nenhum ponto de iluminação declarado — mínimo 1 ponto por cômodo habitável`,
      `${N} §9.6.2 — Ponto de iluminação obrigatório por cômodo`,
      0, 1
    ))
  }

  return resultados
}

// ── Verificação completa do cômodo ────────────────────────────────
export function verificarComodoNBR9(comodo: Comodo): ResultadoNorma[] {
  return [
    ...verificarTUGMinimas(comodo),
    ...verificarCircuitosDedicados(comodo),
    ...verificarILUMMinima(comodo),
  ]
}

// ── Verificação de todos os cômodos de um projeto ─────────────────
export function verificarProjetoNBR9(comodos: Comodo[]): {
  comodo_id: string
  comodo_nome: string
  violacoes: ResultadoNorma[]
}[] {
  return comodos
    .map(c => ({
      comodo_id:   c.id,
      comodo_nome: c.nome,
      violacoes:   verificarComodoNBR9(c),
    }))
    .filter(r => r.violacoes.length > 0)
}
