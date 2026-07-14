// src/data/nbr5410tables.ts
// Tabelas normativas NBR 5410:2004+Em1:2008 — tipadas, imutáveis

import type { MetodoInstalacao, IsolacaoCabo, MaterialCabo } from '../types/electrical'

// ── Tabela 36 — Capacidade de condução Iz (A) ────────────────────
// Chave: `${metodo}-${n_cond}-${secao}` → Iz (A)
// Cobre PVC 70°C, temperatura ref 30°C

const IZ_RAW: Record<string, number> = {
  // NBR 5410:2004 Tabela 36 — Capacidade de condução de corrente (A) — Condutor Cu PVC/XLPE
  // Método | n_cond | seção(mm²)
  // NOTA: Método E é derivado de C × fator ao ar livre — valores aproximados, não normativos explícitos

  // A1 — unipolar em eletroduto embutido em parede isolante
  'A1-2-1.5':14.5,'A1-2-2.5':19.5,'A1-2-4':26,  'A1-2-6':34,  'A1-2-10':46, 'A1-2-16':61,  'A1-2-25':80,  'A1-2-35':99,  'A1-2-50':119,'A1-2-70':151,'A1-2-95':182,'A1-2-120':210,'A1-2-150':264,'A1-2-185':303,'A1-2-240':357,
  'A1-3-1.5':13.5,'A1-3-2.5':18,  'A1-3-4':24,  'A1-3-6':31,  'A1-3-10':42, 'A1-3-16':56,  'A1-3-25':73,  'A1-3-35':89,  'A1-3-50':108,'A1-3-70':136,'A1-3-95':164,'A1-3-120':188,'A1-3-150':236,'A1-3-185':271,'A1-3-240':318,
  // A2 — multipolar em eletroduto embutido em parede isolante
  'A2-2-1.5':13.5,'A2-2-2.5':18,  'A2-2-4':24,  'A2-2-6':31,  'A2-2-10':42, 'A2-2-16':56,  'A2-2-25':73,  'A2-2-35':89,  'A2-2-50':108,'A2-2-70':136,'A2-2-95':164,'A2-2-120':188,'A2-2-150':240,'A2-2-185':275,'A2-2-240':323,
  'A2-3-1.5':12,  'A2-3-2.5':16,  'A2-3-4':21,  'A2-3-6':27,  'A2-3-10':37, 'A2-3-16':49,  'A2-3-25':64,  'A2-3-35':78,  'A2-3-50':94, 'A2-3-70':118,'A2-3-95':143,'A2-3-120':165,'A2-3-150':214,'A2-3-185':245,'A2-3-240':287,
  // B1 — unipolar em eletroduto embutido em alvenaria (PADRÃO RESIDENCIAL)
  'B1-2-1.5':17.5,'B1-2-2.5':24,  'B1-2-4':32,  'B1-2-6':41,  'B1-2-10':57, 'B1-2-16':76,  'B1-2-25':101, 'B1-2-35':125, 'B1-2-50':151,'B1-2-70':192,'B1-2-95':232,'B1-2-120':269,'B1-2-150':309,'B1-2-185':353,'B1-2-240':416,
  'B1-3-1.5':15.5,'B1-3-2.5':21,  'B1-3-4':28,  'B1-3-6':36,  'B1-3-10':50, 'B1-3-16':68,  'B1-3-25':89,  'B1-3-35':110, 'B1-3-50':134,'B1-3-70':171,'B1-3-95':207,'B1-3-120':239,'B1-3-150':275,'B1-3-185':314,'B1-3-240':369,
  // B2 — multipolar em eletroduto embutido em alvenaria
  'B2-2-1.5':16.5,'B2-2-2.5':23,  'B2-2-4':30,  'B2-2-6':38,  'B2-2-10':52, 'B2-2-16':69,  'B2-2-25':90,  'B2-2-35':111, 'B2-2-50':133,'B2-2-70':168,'B2-2-95':201,'B2-2-120':232,'B2-2-150':272,'B2-2-185':311,'B2-2-240':365,
  'B2-3-1.5':15,  'B2-3-2.5':20,  'B2-3-4':27,  'B2-3-6':34,  'B2-3-10':46, 'B2-3-16':62,  'B2-3-25':80,  'B2-3-35':99,  'B2-3-50':118,'B2-3-70':149,'B2-3-95':179,'B2-3-120':206,'B2-3-150':244,'B2-3-185':278,'B2-3-240':326,
  // C — sobre parede ou teto ao ar livre
  'C-2-1.5':19.5, 'C-2-2.5':27,   'C-2-4':36,   'C-2-6':46,   'C-2-10':63,  'C-2-16':85,   'C-2-25':112,  'C-2-35':138,  'C-2-50':168, 'C-2-70':213, 'C-2-95':258, 'C-2-120':299, 'C-2-150':330, 'C-2-185':381, 'C-2-240':450,
  'C-3-1.5':17.5, 'C-3-2.5':24,   'C-3-4':32,   'C-3-6':41,   'C-3-10':57,  'C-3-16':76,   'C-3-25':96,   'C-3-35':119,  'C-3-50':144, 'C-3-70':184, 'C-3-95':223, 'C-3-120':259, 'C-3-150':294, 'C-3-185':339, 'C-3-240':400,
  // D1 — unipolar em eletroduto enterrado no solo
  'D1-2-1.5':22,  'D1-2-2.5':30,  'D1-2-4':40,  'D1-2-6':51,  'D1-2-10':69, 'D1-2-16':91,  'D1-2-25':119, 'D1-2-35':146, 'D1-2-50':175,'D1-2-70':221,'D1-2-95':265,'D1-2-120':305,'D1-2-150':357,'D1-2-185':406,'D1-2-240':475,
  'D1-3-1.5':20,  'D1-3-2.5':27,  'D1-3-4':36,  'D1-3-6':45,  'D1-3-10':61, 'D1-3-16':81,  'D1-3-25':105, 'D1-3-35':130, 'D1-3-50':156,'D1-3-70':198,'D1-3-95':237,'D1-3-120':274,'D1-3-150':319,'D1-3-185':362,'D1-3-240':424,
  // D2 — multipolar em eletroduto enterrado no solo
  'D2-2-1.5':22,  'D2-2-2.5':29,  'D2-2-4':38,  'D2-2-6':47,  'D2-2-10':63, 'D2-2-16':81,  'D2-2-25':104, 'D2-2-35':125, 'D2-2-50':148,'D2-2-70':183,'D2-2-95':216,'D2-2-120':246,'D2-2-150':278,'D2-2-185':317,'D2-2-240':371,
  'D2-3-1.5':20,  'D2-3-2.5':26,  'D2-3-4':34,  'D2-3-6':42,  'D2-3-10':56, 'D2-3-16':72,  'D2-3-25':92,  'D2-3-35':110, 'D2-3-50':132,'D2-3-70':163,'D2-3-95':192,'D2-3-120':219,'D2-3-150':248,'D2-3-185':283,'D2-3-240':332,
  // ⚠ E — DERIVADO, NÃO NORMATIVO: valores ≈ C × 1.05 (aproximação operacional)
  // NBR 5410:2004 Tabela 36 não lista explicitamente o método E com fio unipolar
  // Usar APENAS quando método não puder ser confirmado — registrar no memorial
  'E-2-1.5':20.5, 'E-2-2.5':28,   'E-2-4':37,   'E-2-6':48,   'E-2-10':65,  'E-2-16':88,   'E-2-25':116,  'E-2-35':143,  'E-2-50':175, 'E-2-70':222, 'E-2-95':269, 'E-2-120':312, 'E-2-150':347, 'E-2-185':400, 'E-2-240':473,
  'E-3-1.5':18.5, 'E-3-2.5':25,   'E-3-4':33,   'E-3-6':43,   'E-3-10':60,  'E-3-16':80,   'E-3-25':101,  'E-3-35':125,  'E-3-50':151, 'E-3-70':192, 'E-3-95':233, 'E-3-120':271, 'E-3-150':309, 'E-3-185':357, 'E-3-240':421,
}

// Fator XLPE/EPR: +10% sobre PVC
// Fator Alumínio: ×0.77 do cobre

// getIz — capacidade de condução de corrente (A)
// Falha explícita: retorna -1 se combinação não existe na tabela
// O chamador deve tratar -1 como "combinação inválida", não como Iz=0
export function getIz(
  secao: number,
  metodo: MetodoInstalacao,
  n_cond: 2 | 3,
  material: MaterialCabo = 'Cu',
  isolacao: IsolacaoCabo = 'PVC'
): number {
  const key = `${metodo}-${n_cond}-${secao}`
  const iz_base = IZ_RAW[key]

  // Falha explícita: combinação não tabelada
  if (iz_base === undefined || iz_base <= 0) {
    // Em vez de retornar 0 silenciosamente, retornar valor negativo
    // para forçar o pipeline a detectar o problema
    return -1
  }

  // Aviso de método não normativo (E é derivado)
  if (metodo === 'E') {
    // Valor derivado — rastreável mas não oficial NBR
    // O trace deve registrar isso como 'criterio', não 'norma'
  }

  let iz = iz_base
  if (isolacao === 'XLPE' || isolacao === 'EPR') iz *= 1.10
  if (material === 'Al') iz *= 0.77
  return Math.round(iz * 10) / 10
}

// ── Tabela 40 — Fator de temperatura Ft ─────────────────────────
// Temperatura de referência: 30°C → Ft = 1,000
const FT_PVC: Record<number, number> = {
  10:1.22, 15:1.17, 20:1.12, 25:1.06, 30:1.00, 35:0.94,
  40:0.87, 45:0.79, 50:0.71, 55:0.61, 60:0.50,
}
const FT_XLPE: Record<number, number> = {
  10:1.15, 15:1.12, 20:1.08, 25:1.04, 30:1.00, 35:0.96,
  40:0.91, 45:0.87, 50:0.82, 55:0.76, 60:0.71, 65:0.65, 70:0.58,
}

export function getFt(t_amb: number, isolacao: IsolacaoCabo = 'PVC'): number {
  const tab = (isolacao === 'XLPE' || isolacao === 'EPR') ? FT_XLPE : FT_PVC
  const temps = Object.keys(tab).map(Number).sort((a, b) => a - b)
  if (t_amb <= temps[0]) return tab[temps[0]]
  if (t_amb >= temps[temps.length - 1]) return tab[temps[temps.length - 1]]
  for (let i = 0; i < temps.length - 1; i++) {
    const t1 = temps[i], t2 = temps[i + 1]
    if (t_amb >= t1 && t_amb <= t2) {
      return tab[t1] + (tab[t2] - tab[t1]) * (t_amb - t1) / (t2 - t1)
    }
  }
  return 1.0
}

// ── Tabela 42 — Fator de agrupamento Fa ─────────────────────────
// NBR 5410:2004 Tabela 42, linha 1 (condutores agrupados em feixe:
// sobre superfície, embutidos ou em conduto fechado — o caso padrão
// de instalação predial em eletroduto).
// CORRIGIDO: a norma define DEGRAUS (faixas fixas), não curva contínua.
//   n=9..11 → 0,50 | n=12..15 → 0,45 | n=16..19 → 0,41 | n>=20 → 0,38
export function getFa(n_circ: number): number {
  const n = Math.max(1, Math.floor(n_circ))
  if (n === 1)  return 1.00
  if (n === 2)  return 0.80
  if (n === 3)  return 0.70
  if (n === 4)  return 0.65
  if (n === 5)  return 0.60
  if (n === 6)  return 0.57
  if (n === 7)  return 0.54
  if (n === 8)  return 0.52
  if (n <= 11)  return 0.50
  if (n <= 15)  return 0.45
  if (n <= 19)  return 0.41
  return 0.38
}

// ── Tabela 45 — Fator de agrupamento para linhas ENTERRADAS ──────
// Só se aplica a métodos D1/D2 quando os circuitos estão em eletrodutos
// SEPARADOS no solo (cada circuito no seu próprio duto, com afastamento
// de ar entre eles) — cenário fisicamente diferente de vários circuitos
// dividindo o MESMO eletroduto (que usa a Tabela 42/getFa acima). Quanto
// maior o afastamento entre dutos, melhor a dissipação térmica de cada
// um isoladamente, logo o fator de redução é menos penalizante.
//
// Fonte: texto transcrito da NBR 5410 Tabela 45, trazido nesta sessão
// (não verificação independente minha do PDF físico — mesmo padrão de
// confiança das demais tabelas trazidas por citação direta/estruturada
// nesta auditoria). Duas irregularidades notadas na transcrição que
// valem conferência extra contra o documento original antes de uso
// legal formal:
//   (a) multipolar, 6 circuitos: os 3 últimos afastamentos (0,25/0,5/
//       1,0m) têm o MESMO valor (0,80) — pode ser um platô real da
//       norma nessa faixa, ou artefato de transcrição.
//   (b) unipolar: as linhas de 5 e 6 circuitos são IDÊNTICAS nas 4
//       colunas — incomum para uma tabela que normalmente degrada
//       (mesmo que levemente) com mais circuitos.
export type TipoCondutorEnterrado = 'multipolar' | 'unipolar'

// [n_circuitos][distancia_m] → fator. Distâncias tabeladas: 0, 0.25, 0.5, 1.0
const TABELA_45_MULTIPOLAR: Record<number, Record<number, number>> = {
  2: { 0: 0.85, 0.25: 0.90, 0.5: 0.95, 1.0: 0.95 },
  3: { 0: 0.75, 0.25: 0.85, 0.5: 0.90, 1.0: 0.95 },
  4: { 0: 0.70, 0.25: 0.80, 0.5: 0.85, 1.0: 0.90 },
  5: { 0: 0.65, 0.25: 0.80, 0.5: 0.85, 1.0: 0.90 },
  6: { 0: 0.60, 0.25: 0.80, 0.5: 0.80, 1.0: 0.80 },
}
const TABELA_45_UNIPOLAR: Record<number, Record<number, number>> = {
  2: { 0: 0.80, 0.25: 0.90, 0.5: 0.90, 1.0: 0.95 },
  3: { 0: 0.70, 0.25: 0.80, 0.5: 0.85, 1.0: 0.90 },
  4: { 0: 0.65, 0.25: 0.75, 0.5: 0.80, 1.0: 0.90 },
  5: { 0: 0.60, 0.25: 0.70, 0.5: 0.80, 1.0: 0.90 },
  6: { 0: 0.60, 0.25: 0.70, 0.5: 0.80, 1.0: 0.90 },
}

export function getFaEnterrado(
  tipo: TipoCondutorEnterrado,
  n_circuitos: number,
  distancia_m: number,
): number {
  const tabela = tipo === 'multipolar' ? TABELA_45_MULTIPOLAR : TABELA_45_UNIPOLAR
  const n = Math.max(2, Math.min(6, Math.round(n_circuitos)))  // tabela cobre 2-6
  const linha = tabela[n]

  const distancias = [0, 0.25, 0.5, 1.0]
  if (distancia_m <= distancias[0]) return linha[0]
  if (distancia_m >= distancias[distancias.length - 1]) return linha[1.0]

  for (let i = 0; i < distancias.length - 1; i++) {
    const d1 = distancias[i], d2 = distancias[i + 1]
    if (distancia_m >= d1 && distancia_m <= d2) {
      const f1 = linha[d1], f2 = linha[d2]
      return Math.round((f1 + (f2 - f1) * (distancia_m - d1) / (d2 - d1)) * 1000) / 1000
    }
  }
  return linha[1.0]
}

// ── Tabela 41 — Fator de correção por resistividade térmica do solo ──
// Aplicável a métodos de instalação enterrados (D1, D2). Referência:
// resistividade padrão da NBR 5410 = 2,5 K.m/W → Fsolo = 1,000.
// Solo mais úmido (menor resistividade) conduz melhor o calor →
// fator > 1 (cabo suporta MAIS corrente). Solo seco/arenoso → fator < 1.
const FSOLO_TABLE: Record<number, number> = {
  0.5: 1.28, 0.7: 1.20, 1.0: 1.18, 1.5: 1.10, 2.0: 1.05,
  2.5: 1.00, 3.0: 0.96, 3.5: 0.92,
}

// getFsolo — fator de correção por resistividade térmica do solo (K.m/W)
// Só se aplica a métodos enterrados; para os demais métodos retorna 1.0
// (a resistividade do solo não afeta cabos ao ar livre ou embutidos em parede).
export function getFsolo(resistividade_km_w: number, metodo: MetodoInstalacao): number {
  if (metodo !== 'D1' && metodo !== 'D2') return 1.0
  const chaves = Object.keys(FSOLO_TABLE).map(Number).sort((a, b) => a - b)
  if (resistividade_km_w <= chaves[0]) return FSOLO_TABLE[chaves[0]]
  if (resistividade_km_w >= chaves[chaves.length - 1]) return FSOLO_TABLE[chaves[chaves.length - 1]]
  for (let i = 0; i < chaves.length - 1; i++) {
    const r1 = chaves[i], r2 = chaves[i + 1]
    if (resistividade_km_w >= r1 && resistividade_km_w <= r2) {
      return FSOLO_TABLE[r1] + (FSOLO_TABLE[r2] - FSOLO_TABLE[r1]) * (resistividade_km_w - r1) / (r2 - r1)
    }
  }
  return 1.0
}

// ── Tabela 49 — Tensão máxima de operação contínua (Uc) do DPS ───
// Cruza o ponto de ligação do DPS com o esquema de aterramento da
// instalação. Uo = tensão fase-neutro; U = tensão fase-fase.
//
// DPS entre FASE e NEUTRO:
//   TT, TN-S, IT (com neutro distribuído) → 1,1 × Uo
//   TN-C não se aplica (não tem neutro separado do PE — é PEN)
// DPS entre FASE e PE:
//   TT, TN-S → 1,1 × Uo
//   IT (com ou sem neutro) → U (tensão fase-fase)
//   TN-C não se aplica (é PEN, não PE separado)
// DPS entre FASE e PEN:
//   TN-C → 1,1 × Uo
//   Demais esquemas não se aplicam (não têm condutor PEN)
// DPS entre NEUTRO e PE:
//   TT, TN-S, IT (com neutro) → Uo
//   TN-C não se aplica
//
// TN-C-S: tratado como TN-S para fins desta tabela — no trecho da
// instalação onde PE já está fisicamente separado do neutro (o caso
// relevante para instalação de DPS no quadro), o comportamento é
// equivalente ao TN-S. Esta é uma interpretação prática, não uma
// citação direta da norma para este esquema específico — a tabela
// fornecida cobre explicitamente TN-C, TN-S, TT e IT, não TN-C-S.
export type LigacaoDPS = 'fase-neutro' | 'fase-pe' | 'fase-pen' | 'neutro-pe'

export interface UcDPSResult {
  aplicavel: boolean
  uc_minimo_v: number | null
  motivo?: string  // por que não se aplica, quando aplicavel=false
}

export function getUcMinimoDPS(
  ligacao: LigacaoDPS,
  esquema: 'TN-S' | 'TN-C' | 'TN-C-S' | 'TT' | 'IT',
  v_fase: number,   // Uo
  v_linha: number,  // U
): UcDPSResult {
  const esquemaEquiv = esquema === 'TN-C-S' ? 'TN-S' : esquema

  switch (ligacao) {
    case 'fase-neutro':
      if (esquemaEquiv === 'TN-C') {
        return { aplicavel: false, uc_minimo_v: null, motivo: 'TN-C não tem neutro separado do PE (é condutor PEN) — ver ligação fase-PEN' }
      }
      return { aplicavel: true, uc_minimo_v: Math.round(1.1 * v_fase) }

    case 'fase-pe':
      if (esquemaEquiv === 'TN-C') {
        return { aplicavel: false, uc_minimo_v: null, motivo: 'TN-C não tem PE separado (é condutor PEN) — ver ligação fase-PEN' }
      }
      if (esquemaEquiv === 'IT') {
        return { aplicavel: true, uc_minimo_v: Math.round(v_linha) }
      }
      return { aplicavel: true, uc_minimo_v: Math.round(1.1 * v_fase) }

    case 'fase-pen':
      if (esquemaEquiv !== 'TN-C') {
        return { aplicavel: false, uc_minimo_v: null, motivo: `Esquema ${esquema} não usa condutor PEN — só aplicável em TN-C` }
      }
      return { aplicavel: true, uc_minimo_v: Math.round(1.1 * v_fase) }

    case 'neutro-pe':
      if (esquemaEquiv === 'TN-C') {
        return { aplicavel: false, uc_minimo_v: null, motivo: 'TN-C não tem neutro separado do PE (são o mesmo condutor PEN)' }
      }
      return { aplicavel: true, uc_minimo_v: Math.round(v_fase) }
  }
}

// Lista as ligações de DPS fisicamente possíveis para um esquema —
// evita que a UI mostre "não aplicável" para combinações que nem
// deveriam aparecer como opção.
export function ligacoesDPSAplicaveis(esquema: 'TN-S'|'TN-C'|'TN-C-S'|'TT'|'IT'): LigacaoDPS[] {
  if (esquema === 'TN-C') return ['fase-pen']
  return ['fase-neutro', 'fase-pe', 'neutro-pe']
}

// ── §6.2.5.6.1 — Fator de correção por harmônicas de 3ª ordem ────
// Circuitos trifásicos com neutro (fase RST) alimentando carga
// concentrada de eletrônica/LED podem ter 3ª harmônica alta o
// suficiente para o neutro carregar corrente comparável às fases
// (as harmônicas de ordem 3 e múltiplas NÃO se cancelam no neutro
// como as componentes fundamentais fariam — elas se somam).
//
// Citação direta do texto da norma (item 6.2.5.6.1):
// "Tal fator, que em caráter geral é de 0,86, independentemente do
// método de instalação, é aplicável então às capacidades de condução
// de corrente válidas para três condutores carregados."
//
// Gatilho: taxa de 3ª harmônica > 15% — DECLARADA pelo engenheiro
// (não medida automaticamente; o sistema não tem instrumentação para
// isso). Aplica-se multiplicando Iz efetiva por 0,86 quando ativo.
export const LIMITE_3H_PCT = 15
export const FATOR_3H = 0.86

export function getFatorHarmonica(terceira_harmonica_pct: number | undefined, fase: string): number {
  if (terceira_harmonica_pct === undefined) return 1.0
  if (fase !== 'RST') return 1.0  // regra é para trifásico com neutro
  if (terceira_harmonica_pct <= LIMITE_3H_PCT) return 1.0
  return FATOR_3H
}

// ── Tabela 58 — Seção do PE ────────────────────────────────────── (número corrigido de 54 para 58, confirmado contra o texto da norma)
export function getSecaoPE(secao_fase: number): number {
  if (secao_fase <= 16) return secao_fase
  if (secao_fase <= 35) return 16
  return Math.max(secao_fase / 2, 16)
}

// ── Seções comerciais (mm²) ──────────────────────────────────────
export const SECOES_COMERCIAIS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240]

// getSecaoMinimaPorIz — menor seção comercial cuja Iz ≥ Irc
// Retorna -1 se nenhuma seção da tabela suporta a corrente (situação excepcional)
export function getSecaoMinimaPorIz(irc: number, metodo: MetodoInstalacao, n_cond: 2|3, material: MaterialCabo = 'Cu', isolacao: IsolacaoCabo = 'PVC'): number {
  for (const s of SECOES_COMERCIAIS) {
    const iz = getIz(s, metodo, n_cond, material, isolacao)
    if (iz > 0 && iz >= irc) return s  // iz > 0 garante que a seção existe na tabela
  }
  // Corrente excede capacidade da maior seção disponível (240mm²)
  // Isso é sinal de projeto inviável — o pipeline deve registrar como ERRO
  return -1
}

// ── Série comercial de disjuntores (A) — IEC 60898 ──────────────
export const DISJUNTORES_A = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250]

// getDisjuntor — seleciona In da série IEC 60898
// in_min: mínimo prático (residencial CEMIG: 10A para ILUM/TUG)
// NBR 5410 §5.1.3.1: Ib ≤ In ≤ Iz' (In pode ser igual a Ib — válido)
export function getDisjuntor(ib: number, in_min = 10): number {
  const in_calculado = DISJUNTORES_A.find(d => d >= ib) ?? 250
  // Mínimo prático: evitar 6A em circuitos de uso geral
  return Math.max(in_calculado, in_min)
}

// ── IDR — IEC 61008 ──────────────────────────────────────────────
export const IDR_SERIES_A = [16, 25, 32, 40, 63, 80, 100, 125]

export function getIDR(in_disj: number): number {
  return IDR_SERIES_A.find(d => d >= in_disj) ?? 125
}

// ── Fator de demanda CEMIG ND-5.1 ───────────────────────────────
export function getFatorDemandaCEMIG(ci_kw: number): number {
  if (ci_kw <= 5)  return 1.00
  if (ci_kw <= 6)  return 0.97
  if (ci_kw <= 7)  return 0.94
  if (ci_kw <= 8)  return 0.92
  if (ci_kw <= 9)  return 0.89
  if (ci_kw <= 10) return 0.87
  if (ci_kw <= 15) return 0.82
  if (ci_kw <= 20) return 0.75
  if (ci_kw <= 30) return 0.65
  if (ci_kw <= 40) return 0.60
  if (ci_kw <= 50) return 0.56
  return 0.50
}

// ── Reservas de QD — NBR 5410 item 6.3.7 ────────────────────────
// NBR 5410:2004 §6.5.4.7 — Circuitos de reserva no QD
export function getReservasQD(n_ativos: number): number {
  if (n_ativos <= 6)  return 2
  if (n_ativos <= 12) return 3
  if (n_ativos <= 30) return 4
  return Math.ceil(n_ativos * 0.15)  // 15% para mais de 30 circuitos
}

export function getTamanhoQD(n_total: number): number {
  const sizes = [4, 6, 8, 12, 16, 20, 24, 30, 36, 42, 48]
  return sizes.find(s => s >= n_total) ?? n_total + 6
}

// ── Seção mínima por tipo — NBR 5410 item 6.2.5 ─────────────────
// Tabela 47 — seção mínima dos condutores (cobre). Circuitos de
// sinalização/controle (0,5mm²) não modelados — o sistema não tem um
// CircuitType próprio para esse tipo de circuito (só ILUM/TUG/TUE/GERAL).
export const SECAO_MINIMA: Record<string, number> = {
  ILUM: 1.5,
  TUG:  2.5,
  TUE:  2.5,
  GERAL: 2.5,
}

// Tabela 47 — piso mecânico para Alumínio (16mm², independente do
// tipo de circuito) — antes SECAO_MINIMA só cobria Cobre.
export const SECAO_MINIMA_AL_MM2 = 16

export function getSecaoMinima(tipo: string, material: 'Cu' | 'Al' = 'Cu'): number {
  if (material === 'Al') return SECAO_MINIMA_AL_MM2
  return SECAO_MINIMA[tipo] ?? 2.5
}

// ── Tipo de ligação CEMIG ND-5.1 ────────────────────────────────
export function getTipoLigacaoCEMIG(dem_kw: number, v_fase: number) {
  if (dem_kw <= 5)   return { tipo: v_fase === 127 ? 'A1' : 'A2', ramal_mm2: 6,  fases: 1 }
  if (dem_kw <= 10)  return { tipo: 'B1', ramal_mm2: 10, fases: 2 }
  if (dem_kw <= 15)  return { tipo: 'B2', ramal_mm2: 16, fases: 2 }
  return { tipo: 'C', ramal_mm2: 25, fases: 3 }
}

// ── Iluminância mínima NBR ISO/CIE 8995-1 ───────────────────────
export const ILUMINANCIA_MIN: Record<string, number> = {
  'Dormitorio': 150, 'Sala de estar': 200, 'Sala de jantar': 200,
  'Cozinha geral': 200, 'Cozinha bancada': 500, 'Banheiro': 200,
  'Escritorio': 500, 'Corredor': 100, 'Escada': 150,
  'Garagem': 100, 'Lavanderia': 200, 'Loja': 500,
}

// ── Potência de tomada por tipo de cômodo — NBR 9.5.2.2 ─────────
export const POT_TOMADA: Record<string, number> = {
  Social: 100, Cozinha: 600, Banho: 600,
  Lavanderia: 600, Garagem: 100, Externo: 100,
}

// ── NBR 5444 / IEC 60228: diâmetros externos reais ──────────────
// Cabo unipolar isolado — PVC 70°C, condutor classe 5 (flexível)
// Necessário para cálculo de OCUPAÇÃO REAL de eletrodutos
// Fonte: IEC 60228 + catálogos Nexans/Prysmian/Ficap

export interface DiametroExterno {
  secao_mm2: number
  d_ext_pvc_mm: number    // PVC 70°C — isolação simples
  d_ext_xlpe_mm: number   // XLPE 90°C
  d_ext_epr_mm: number    // EPR 90°C
  area_ext_pvc_mm2: number // área da seção transversal do cabo (círculo)
}

export const DIAMETROS_EXTERNOS: DiametroExterno[] = [
  // seção  PVC    XLPE   EPR    área(PVC)
  { secao_mm2: 1.5,  d_ext_pvc_mm: 4.0,  d_ext_xlpe_mm: 4.2,  d_ext_epr_mm: 4.4,  area_ext_pvc_mm2: 12.6 },
  { secao_mm2: 2.5,  d_ext_pvc_mm: 4.8,  d_ext_xlpe_mm: 5.0,  d_ext_epr_mm: 5.2,  area_ext_pvc_mm2: 18.1 },
  { secao_mm2: 4.0,  d_ext_pvc_mm: 5.8,  d_ext_xlpe_mm: 6.0,  d_ext_epr_mm: 6.2,  area_ext_pvc_mm2: 26.4 },
  { secao_mm2: 6.0,  d_ext_pvc_mm: 6.8,  d_ext_xlpe_mm: 7.0,  d_ext_epr_mm: 7.2,  area_ext_pvc_mm2: 36.3 },
  { secao_mm2: 10.0, d_ext_pvc_mm: 8.4,  d_ext_xlpe_mm: 8.8,  d_ext_epr_mm: 9.0,  area_ext_pvc_mm2: 55.4 },
  { secao_mm2: 16.0, d_ext_pvc_mm: 10.2, d_ext_xlpe_mm: 10.6, d_ext_epr_mm: 10.8, area_ext_pvc_mm2: 81.7 },
  { secao_mm2: 25.0, d_ext_pvc_mm: 12.4, d_ext_xlpe_mm: 13.0, d_ext_epr_mm: 13.2, area_ext_pvc_mm2: 120.8 },
  { secao_mm2: 35.0, d_ext_pvc_mm: 14.2, d_ext_xlpe_mm: 14.8, d_ext_epr_mm: 15.0, area_ext_pvc_mm2: 158.4 },
  { secao_mm2: 50.0, d_ext_pvc_mm: 16.8, d_ext_xlpe_mm: 17.6, d_ext_epr_mm: 17.8, area_ext_pvc_mm2: 221.7 },
  { secao_mm2: 70.0, d_ext_pvc_mm: 19.8, d_ext_xlpe_mm: 20.8, d_ext_epr_mm: 21.0, area_ext_pvc_mm2: 308.0 },
  { secao_mm2: 95.0, d_ext_pvc_mm: 23.2, d_ext_xlpe_mm: 24.4, d_ext_epr_mm: 24.6, area_ext_pvc_mm2: 422.7 },
  { secao_mm2: 120.0,d_ext_pvc_mm: 26.2, d_ext_xlpe_mm: 27.6, d_ext_epr_mm: 27.8, area_ext_pvc_mm2: 539.1 },
  { secao_mm2: 150.0,d_ext_pvc_mm: 29.4, d_ext_xlpe_mm: 31.0, d_ext_epr_mm: 31.2, area_ext_pvc_mm2: 679.0 },
  { secao_mm2: 185.0,d_ext_pvc_mm: 32.8, d_ext_xlpe_mm: 34.6, d_ext_epr_mm: 34.8, area_ext_pvc_mm2: 845.3 },
  { secao_mm2: 240.0,d_ext_pvc_mm: 37.6, d_ext_xlpe_mm: 39.6, d_ext_epr_mm: 40.0, area_ext_pvc_mm2: 1110.6 },
]

// Área interna real dos eletrodutos — NBR 15465 (PVC rígido)
// Coeficiente de ocupação máxima: 35% (NBR 5410 §6.2.11)
export const AREA_INTERNA_ELETRODUTO: Record<number, number> = {
  16:  108.0,  // mm² — área efetiva interna (considera espessura da parede)
  20:  188.0,
  25:  299.0,
  32:  490.0,
  40:  792.0,
  50: 1257.0,
  63: 1963.0,
  75: 2827.0,
}

export function getDiametroExterno(secao_mm2: number, isolacao: 'PVC'|'XLPE'|'EPR' = 'PVC'): number {
  const entry = DIAMETROS_EXTERNOS.find(d => d.secao_mm2 === secao_mm2)
  if (!entry) {
    // Interpolação log-linear para seções não tabeladas
    const k = isolacao === 'PVC' ? 2.82 : isolacao === 'XLPE' ? 2.95 : 3.0
    return Math.round(k * Math.sqrt(secao_mm2) * 10) / 10
  }
  return isolacao === 'PVC' ? entry.d_ext_pvc_mm
       : isolacao === 'XLPE' ? entry.d_ext_xlpe_mm
       : entry.d_ext_epr_mm
}

export function getAreaExterna(secao_mm2: number, isolacao: 'PVC'|'XLPE'|'EPR' = 'PVC'): number {
  const d = getDiametroExterno(secao_mm2, isolacao)
  return Math.PI * (d / 2) ** 2
}

// Área máxima de ocupação conforme NBR 5410 §6.2.11
export function getOcupacaoMaxima(diametro_eletroduto: number, tipo: 'entrada_unica' | 'geral' = 'geral'): number {
  const area = AREA_INTERNA_ELETRODUTO[diametro_eletroduto] ?? 0
  // 1 cabo: 53% | 2 cabos: 31% | 3+ cabos: 40% | prática: usar 35% conservador
  return tipo === 'entrada_unica' ? area * 0.53 : area * 0.35
}
