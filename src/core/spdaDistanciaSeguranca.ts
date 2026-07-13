// src/core/spdaDistanciaSeguranca.ts
// ════════════════════════════════════════════════════════════════
// SPDA — DISTÂNCIA DE SEGURANÇA — NBR 5419-3:2015
//
// ESCOPO DELIBERADAMENTE LIMITADO: esta é uma CALCULADORA da fórmula
// normativa, não um detector automático de colisão 3D entre
// eletrodutos elétricos e condutores de descida do SPDA. O sistema
// hoje modela a planta em 2D (top-down); detecção automática de
// colisão exigiria um modelo volumétrico 3D completo, que não existe
// no ProjetEletrico. O engenheiro informa a distância real medida em
// campo/projeto (s) e o comprimento do condutor de descida até o
// ponto de proximidade (l); o sistema calcula d e compara.
//
// Fórmula (NBR 5419-3:2015, Anexo, e IEC 62305-3):
//   d = (ki / km) × kc × l
//   ki — depende do nível de proteção (I a IV)
//   kc — depende do número de condutores de descida em paralelo
//   km — depende do material entre os dois pontos (ar ou sólido)
//   l  — comprimento, em metros, do condutor de descida do ponto de
//        conexão equipotencial até o ponto onde se calcula a distância
//
// Se s (distância real) ≥ d (distância calculada): seguro, sem risco
// de centelhamento perigoso.
// Se s < d: OU afastar fisicamente as instalações, OU executar
// ligação equipotencial (conexão direta/DPS) entre elas.
// ════════════════════════════════════════════════════════════════

export type NivelProtecaoSPDA = 'I' | 'II' | 'III' | 'IV'
export type MaterialEntreCondutores = 'ar' | 'solido'

// ── ki — Nível de proteção (NBR 5419-3 Tabela 8) ──────────────────
const KI_TABLE: Record<NivelProtecaoSPDA, number> = {
  I:   0.08,
  II:  0.06,
  III: 0.04,
  IV:  0.04,
}

// ── km — Material isolante entre os pontos ────────────────────────
// ar = 1,0 (nenhum isolamento além do ar)
// sólido = 0,5 (alvenaria, madeira, materiais isolantes comuns)
// Observação: km=0,5 é o valor para 1 material isolante interposto;
// a norma prevê 1/(2n-1) para n camadas isolantes — simplificado
// aqui para o caso mais comum de 1 camada (parede simples).
const KM_TABLE: Record<MaterialEntreCondutores, number> = {
  ar:     1.0,
  solido: 0.5,
}

// ── kc — Número de condutores de descida em paralelo ──────────────
// Aproximação prática usada pela norma para instalações simples:
//   1 descida:  kc = 1
//   2 descidas: kc = 0,66 (fita/anel de equalização não considerado)
//   ≥3 descidas com anéis de equalização: kc pode cair a 0,44 ou menos
// Valores conservadores — em projeto real com malha complexa de
// descidas, um estudo específico de kc deve ser feito à parte.
export function getKc(n_descidas: number): number {
  if (n_descidas <= 1) return 1.0
  if (n_descidas === 2) return 0.66
  return 0.44
}

export interface DistanciaSegurancaInput {
  readonly nivel_protecao:  NivelProtecaoSPDA
  readonly n_descidas:      number   // número de condutores de descida do SPDA
  readonly material_entre:  MaterialEntreCondutores
  readonly comprimento_l_m: number   // comprimento do condutor de descida até o ponto de proximidade
  readonly distancia_real_s_m: number  // distância medida entre a instalação elétrica e o condutor de descida
}

export interface DistanciaSegurancaResult {
  readonly ki: number
  readonly kc: number
  readonly km: number
  readonly d_calculado_m: number   // distância de segurança exigida
  readonly s_informado_m: number   // distância real disponível
  readonly seguro: boolean         // s ≥ d
  readonly margem_m: number        // s - d (negativo = inseguro)
  readonly acao_requerida?: string
}

export function calcularDistanciaSeguranca(input: DistanciaSegurancaInput): DistanciaSegurancaResult {
  const ki = KI_TABLE[input.nivel_protecao]
  const kc = getKc(input.n_descidas)
  const km = KM_TABLE[input.material_entre]

  // d = (ki/km) × kc × l
  const d = (ki / km) * kc * input.comprimento_l_m
  const d_arred = Math.round(d * 1000) / 1000

  const s = input.distancia_real_s_m
  const seguro = s >= d_arred
  const margem = Math.round((s - d_arred) * 1000) / 1000

  let acao_requerida: string | undefined
  if (!seguro) {
    acao_requerida = `Distância real (${s}m) é MENOR que a distância de segurança calculada (${d_arred}m). ` +
      `Risco de centelhamento perigoso (NBR 5419-3). Ações possíveis: ` +
      `(1) afastar fisicamente o eletroduto elétrico do condutor de descida até atingir ao menos ${d_arred}m, ou ` +
      `(2) executar ligação equipotencial direta (barra de equipotencialização) ou via DPS entre as duas instalações no ponto de proximidade.`
  }

  return {
    ki, kc, km,
    d_calculado_m: d_arred,
    s_informado_m: s,
    seguro,
    margem_m: margem,
    acao_requerida,
  }
}
