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

// Duas listas SEPARADAS — a distinção importa para ILUM (ver abaixo).
// LOCAL: nome de cômodo/área — por si só, NÃO significa que o
// circuito está em risco de contato com água (uma luminária de teto
// na cozinha não tem o mesmo risco de choque que uma tomada de
// bancada). EQUIPAMENTO: item especificamente próximo/em contato com
// água — esse SIM indica risco real, para qualquer tipo de circuito
// (mesmo uma luminária instalada dentro do box precisa de DR).
const PALAVRAS_LOCAL_MOLHADO = [
  'banho', 'lavabo', 'banheiro', 'cozinha', 'lavanderia',
  'servico', 'area de serv', 'externo', 'varanda', 'sacada',
  'garagem', 'churrasq', 'piscina', 'jardim', 'quintal',
]
const PALAVRAS_EQUIPAMENTO_MOLHADO = [
  'chuveiro', 'ducha', 'banheira', 'hidro',
  'torneira', 'aquecedor de agua', 'aquecedor de água', 'boiler',
]

// Remove acentos (NFD + remoção de diacríticos) para comparação robusta
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Tipos de cômodo que são SEMPRE área molhada, independente do que a
// descrição do circuito diz — cobre o caso real mais comum: um TUE
// com descrição customizada (ex: "Máquina de lavar") não menciona o
// cômodo nem o nome do equipamento bate com PALAVRAS_AREA_MOLHADA,
// e o DR obrigatório falhava silenciosamente mesmo estando numa
// Lavanderia de verdade. Local físico deveria bastar sozinho — a
// norma exige DR pela ÁREA, não pelo nome que o engenheiro escolheu
// dar ao circuito.
const TIPOS_COMODO_MOLHADOS = ['Banho', 'Cozinha', 'Lavanderia', 'Garagem', 'Externo']

// tipoCircuito é opcional só por compatibilidade retroativa (call
// sites antigos que ainda não passam o tipo) — quando ausente, mantém
// o comportamento conservador anterior (aplica a todos os tipos).
// Quando presente, a regra de "cômodo sempre molhado" (banheiro,
// cozinha etc.) só vale para TUG e TUE — a norma exige DR para
// TOMADAS em área molhada e equipamentos de risco (chuveiro), não
// para o circuito de ILUMINAÇÃO do teto. Um "ILUM: Spots cozinha"
// não precisa de DR só porque está numa Cozinha — precisaria só se a
// própria descrição citasse um equipamento de risco (ex: luminária
// dentro do box do chuveiro, coberto pelas PALAVRAS_AREA_MOLHADA).
export function ehAreaMolhada(descricao: string, comodoTipo?: string, tipoCircuito?: string): boolean {
  const d = semAcento(descricao.toLowerCase())

  // Equipamento de risco (chuveiro, ducha, banheira...) — vale SEMPRE,
  // até para ILUM (ex: luminária dentro do box), porque indica contato
  // físico direto com água, não só "está no mesmo cômodo".
  if (PALAVRAS_EQUIPAMENTO_MOLHADO.some(p => d.includes(p))) return true

  // Daqui pra baixo: nome de LOCAL só (descrição ou tipo do cômodo).
  // Para ILUM isso não é motivo suficiente — a norma exige DR para
  // tomadas em área molhada e equipamentos de risco, não para o
  // circuito de iluminação de teto só por estar na mesma sala.
  if (tipoCircuito === 'ILUM') return false

  if (PALAVRAS_LOCAL_MOLHADO.some(p => d.includes(p))) return true
  if (comodoTipo && TIPOS_COMODO_MOLHADOS.includes(comodoTipo)) return true
  return false
}
