// src/core/areaMolhada.ts
// ════════════════════════════════════════════════════════════════
// Detecção centralizada de "área molhada" (NBR 5410 §5.1.3.6.1 —
// IDR 30mA obrigatório). Único ponto de verdade — antes esta lógica
// estava duplicada em 5 lugares (engine.ts, pipeline.ts, rules.ts,
// rules/protection.ts), cada um com sua própria lista de palavras.
//
// BUG HISTÓRICO CORRIGIDO: nenhuma das implementações duplicadas
// normalizava acentos. "Área de Serviço" (grafia correta em
// português) não batia com "area de serv" (sem acento) na lista,
// fazendo o IDR obrigatório falhar silenciosamente sempre que o
// usuário digitava a descrição com acentuação correta — o caso
// normal de uso real.
// ════════════════════════════════════════════════════════════════

const PALAVRAS_AREA_MOLHADA = [
  // Locais (§5.1.3.2.2 / §9.1 — banheira/chuveiro, áreas externas)
  'banho', 'lavabo', 'banheiro', 'cozinha', 'lavanderia',
  'servico', 'area de serv', 'externo', 'varanda', 'sacada',
  'garagem', 'churrasq', 'piscina', 'jardim', 'quintal',
  // Equipamentos que por definição estão em local molhado — o circuito
  // do chuveiro é o mais perigoso da residência e precisa de DR 30mA
  // mesmo que a descrição não mencione o cômodo (§5.1.3.2.2)
  'chuveiro', 'ducha', 'banheira', 'hidro',
  'torneira', 'aquecedor de agua', 'aquecedor de água', 'boiler',
]

// Remove acentos (NFD + remoção de diacríticos) para comparação robusta
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function ehAreaMolhada(descricao: string): boolean {
  const d = semAcento(descricao.toLowerCase())
  return PALAVRAS_AREA_MOLHADA.some(p => d.includes(p))
}
