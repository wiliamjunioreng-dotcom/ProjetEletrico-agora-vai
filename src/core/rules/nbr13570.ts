// src/core/rules/nbr13570.ts
// ════════════════════════════════════════════════════════════════
// NBR 13570 — Instalações elétricas em locais de afluência de público
//
// Norma DIFERENTE da NBR 5410 — se aplica especificamente a ambientes
// acessíveis ao público (shopping, escola, igreja, teatro, etc.), com
// exigências adicionais de segurança e cabeamento além do piso da 5410.
//
// Implementado nesta sessão (com citação direta do texto, trazida em
// conversa — não verificação independente do PDF físico):
//   §4.10.1 — "Nos ambientes com área superior a 100 m², acessíveis
//              ao público, devem ser previstos no mínimo dois
//              circuitos terminais de iluminação."
//   §2/§4.2  — cabos devem ser resistentes à chama e de baixa emissão
//              de fumaça/gases tóxicos (LSZH), conforme NBR 13248.
//
// LIMITAÇÃO DE ARQUITETURA HONESTA: o sistema não rastreia de forma
// confiável "quantos circuitos terminais de ILUM atendem este cômodo"
// quando o cômodo usa o fluxo automático (cargas calculadas pela
// NBR 5410, sem declaração manual) — nesse fluxo, o gerador de
// circuitos AGRUPA vários cômodos pequenos num único circuito, o
// oposto do que esta regra exige garantir. A verificação só é
// confiável quando o engenheiro declara cargas manuais explícitas
// (mesma limitação já presente nas outras regras §9.6 do arquivo
// nbr5410_s9.ts — não é uma limitação nova introduzida aqui).
// ════════════════════════════════════════════════════════════════

import type { ResultadoNorma } from './context'
import type { Comodo } from '../../types/electrical'

const N13570 = 'NBR 13570 — Locais de afluência de público'

function erro(codigo: string, descricao: string, norma: string, acao?: string): ResultadoNorma {
  return { codigo, descricao, norma, severidade: 'erro', conforme: false, acao_sugerida: acao }
}

// ── §4.10.1 — Mínimo de 2 circuitos terminais de ILUM em ambientes >100m² ──
export function verificarCircuitosILUM13570(comodo: Comodo): ResultadoNorma[] {
  if (!comodo.afluencia_publico) return []
  if (comodo.area_m2 <= 100) return []

  const temCargasManuais = comodo.cargas_manuais.length > 0
  if (!temCargasManuais) return []  // ver limitação de arquitetura no cabeçalho

  const nCircuitosILUM = comodo.cargas_manuais.filter(c => c.tipo === 'ILUM').length

  if (nCircuitosILUM < 2) {
    return [erro(
      'NBR13570.4.10.1',
      `${comodo.nome} (${comodo.area_m2}m², local de afluência de público): ${nCircuitosILUM} circuito(s) de ILUM declarado(s), mínimo exigido é 2 — §4.10.1`,
      `${N13570} §4.10.1`,
      'Divida a iluminação deste ambiente em pelo menos 2 circuitos terminais separados (declare como 2+ cargas manuais distintas do tipo ILUM).'
    )]
  }
  return []
}

// ── §2/§4.2 — Cabeamento LSZH obrigatório (informativo, sem SINAPI) ──
// Não bloqueia — é uma exigência de ESPECIFICAÇÃO de material, não de
// dimensionamento elétrico. O sistema não tem os códigos SINAPI de
// cabo LSZH cadastrados, então não pode substituir automaticamente o
// orçamento — só alerta para o profissional especificar manualmente.
export function verificarCabeamentoLSZH(comodo: Comodo): ResultadoNorma[] {
  if (!comodo.afluencia_publico) return []
  return [{
    codigo: 'NBR13570.LSZH',
    conforme: true, severidade: 'info',
    descricao: `${comodo.nome}: local de afluência de público exige cabos resistentes à chama e de baixa emissão de fumaça/gases tóxicos (LSZH), conforme NBR 13248. Especificar manualmente no orçamento — não incluído automaticamente na lista de materiais.`,
    norma: `${N13570} §2/§4.2 + NBR 13248`,
  }]
}

// ── Verificação completa NBR 13570 do cômodo ──────────────────────
export function verificarComodoNBR13570(comodo: Comodo): ResultadoNorma[] {
  return [
    ...verificarCircuitosILUM13570(comodo),
    ...verificarCabeamentoLSZH(comodo),
  ]
}
