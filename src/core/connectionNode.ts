// src/core/connectionNode.ts
// ════════════════════════════════════════════════════════════════
// CONNECTION NODE — topologia elétrica local
//
// Problema: a caixa elétrica é uma mini-topologia.
//   O cabo entra, deriva, continua, termina.
//   Hoje o sistema sabe ONDE está a caixa, mas não o que acontece DENTRO.
//
// ConnectionNode modela:
//   quais condutores ENTRAM na caixa;
//   quais SAEM;
//   quais DERIVAM (ponto de ramificação);
//   quais TERMINAM (ponto de consumo final);
//   quais EMENDAM (continuidade com outro condutor).
//
// Isso permite:
//   - verificar completude de circuito (retorno chegou na lâmpada?)
//   - calcular corrente real por condutor
//   - identificar emendas fora de caixa (proibido pela NBR)
//   - calcular ocupação interna da caixa
//   - gerar memorial de ligações (esquema interno)
//
// Referência:
//   NBR 5410 §6.2.12 — dispositivos de conexão
//   NBR 5410 §6.1.3 — continuidade de condutores
// ════════════════════════════════════════════════════════════════

import type { FuncaoCondutor } from './condutor'

// ── Papel do condutor na conexão ─────────────────────────────────
export type PapelCondutor =
  | 'entrada'     // condutor chega pelo eletroduto de entrada
  | 'saida'       // condutor sai pelo eletroduto de saída
  | 'derivacao'   // ponto onde a corrente se divide
  | 'termino'     // condutor termina aqui (ponto de consumo)
  | 'emenda'      // condutor é emendado a outro (mudança de bitola)
  | 'continuidade' // passa pela caixa sem derivar (caixa de passagem)

// ── Condutor no nó ────────────────────────────────────────────────
export interface CondutorNoNo {
  readonly condutor_id:  string
  readonly circuito_id:  string
  readonly funcao:       FuncaoCondutor
  readonly papel:        PapelCondutor
  readonly secao_mm2:    number
  readonly cor:          string
  // Para emendas: ID do condutor que continua daqui
  readonly emendado_com?: string   // ID de CondutorContinuo
  // Para derivações: IDs dos condutores que partem desta bifurcação
  readonly derivado_em?:  string[] // IDs de CondutorContinuo
}

// ── ConnectionNode ────────────────────────────────────────────────
export interface ConnectionNode {
  readonly id:           string
  // Tipo de nó (herdado do NoInfra)
  readonly tipo:         'caixa' | 'derivacao' | 'passagem' | 'quadro' | 'ponto_consumo'
  // Referências
  readonly caixa_id?:    string   // CaixaFisica correspondente
  readonly ponto_id?:    string   // PontoEletrico (para pontos de consumo)
  readonly no_infra_id?: string   // NoInfra correspondente
  // Topologia interna
  readonly condutores:   readonly CondutorNoNo[]
  // Eletrodutos conectados
  readonly eletroduto_entrada_ids: readonly string[]
  readonly eletroduto_saida_ids:   readonly string[]
  // Verificação normativa
  readonly avisos:       readonly AvisoConexao[]
}

export interface AvisoConexao {
  readonly tipo:     'EMENDA_FORA_CAIXA' | 'CONDUTOR_SOLTO' | 'FASE_SEM_RETORNO' |
                     'NEUTRO_FALTANDO'   | 'PE_FALTANDO'    | 'OCUPACAO_CAIXA'
  readonly descricao: string
  readonly severidade: 'erro' | 'aviso'
}

// ── Construir ConnectionNode a partir dos condutores ─────────────
export function buildConnectionNode(
  id:             string,
  tipo:           ConnectionNode['tipo'],
  condutores_in:  { condutor_id: string; circuito_id: string; funcao: FuncaoCondutor;
                    secao_mm2: number; cor: string }[],
  condutores_out: { condutor_id: string; circuito_id: string; funcao: FuncaoCondutor;
                    secao_mm2: number; cor: string }[],
  eletroduto_entrada_ids: string[] = [],
  eletroduto_saida_ids:   string[] = [],
  caixa_id?:      string,
  ponto_id?:      string,
  no_infra_id?:   string,
): ConnectionNode {
  const condutores: CondutorNoNo[] = []

  // Classificar condutores por papel
  const ids_in  = new Set(condutores_in.map(c => c.condutor_id))
  const ids_out = new Set(condutores_out.map(c => c.condutor_id))

  // Condutores que entram
  for (const c of condutores_in) {
    const sai = ids_out.has(c.condutor_id)
    condutores.push({
      ...c,
      papel: tipo === 'passagem' ? 'continuidade'
           : tipo === 'ponto_consumo' ? 'termino'
           : sai ? 'continuidade'
           : 'entrada',
    })
  }

  // Condutores que só saem (derivações)
  for (const c of condutores_out) {
    if (!ids_in.has(c.condutor_id)) {
      condutores.push({ ...c, papel: 'derivacao' })
    }
  }

  // Verificar avisos normativos
  const avisos = verificarConexao(condutores, tipo)

  return {
    id, tipo, caixa_id, ponto_id, no_infra_id,
    condutores,
    eletroduto_entrada_ids,
    eletroduto_saida_ids,
    avisos,
  }
}

// ── Verificação normativa local ───────────────────────────────────
function verificarConexao(
  condutores: CondutorNoNo[],
  tipo:       ConnectionNode['tipo']
): AvisoConexao[] {
  const avisos: AvisoConexao[] = []

  // Circuitos presentes (por ID)
  const circ_condutores = new Map<string, FuncaoCondutor[]>()
  for (const c of condutores) {
    const lista = circ_condutores.get(c.circuito_id) ?? []
    lista.push(c.funcao)
    circ_condutores.set(c.circuito_id, lista)
  }

  for (const [circ_id, funcoes] of circ_condutores) {
    // Verificar PE presente
    if (!funcoes.includes('terra')) {
      avisos.push({
        tipo: 'PE_FALTANDO', severidade: 'erro',
        descricao: `Circuito ${circ_id}: condutor PE (terra) ausente — obrigatório NBR 5410 §6.1.1`,
      })
    }

    // Para circuitos de iluminação: verificar retorno
    if (funcoes.includes('retorno') && !funcoes.includes('neutro') && tipo === 'ponto_consumo') {
      avisos.push({
        tipo: 'NEUTRO_FALTANDO', severidade: 'aviso',
        descricao: `Circuito ${circ_id}: neutro ausente no ponto de luz`,
      })
    }

    // Fase sem neutro (em circuito monofásico)
    if (funcoes.includes('fase') && !funcoes.includes('neutro') &&
        !funcoes.includes('retorno') && tipo !== 'derivacao') {
      avisos.push({
        tipo: 'FASE_SEM_RETORNO', severidade: 'aviso',
        descricao: `Circuito ${circ_id}: fase sem neutro ou retorno`,
      })
    }
  }

  // Condutores soltos (entram mas não têm papel definido)
  const soltos = condutores.filter(c => !c.papel)
  if (soltos.length > 0) {
    avisos.push({
      tipo: 'CONDUTOR_SOLTO', severidade: 'erro',
      descricao: `${soltos.length} condutor(es) sem papel definido neste nó`,
    })
  }

  return avisos
}

// ── Consultas ao nó ───────────────────────────────────────────────
// Condutores que TERMINAM aqui (pontos de consumo)
export function condutoresTermino(node: ConnectionNode): CondutorNoNo[] {
  return node.condutores.filter(c => c.papel === 'termino')
}

// Condutores que DERIVAM aqui (ramificações)
export function condutoresDeriv(node: ConnectionNode): CondutorNoNo[] {
  return node.condutores.filter(c => c.papel === 'derivacao')
}

// Condutores que CONTINUAM (passagem)
export function condutoresContinuidade(node: ConnectionNode): CondutorNoNo[] {
  return node.condutores.filter(c => c.papel === 'continuidade')
}

// Corrente total no nó (soma das cargas dos circuitos que terminam)
export function n_circuitos(node: ConnectionNode): number {
  return new Set(node.condutores.map(c => c.circuito_id)).size
}

// ── Rede de ConnectionNodes ───────────────────────────────────────
export interface ConnectionNetwork {
  readonly nodes: Map<string, ConnectionNode>
  // Índice: condutor_id → nodes onde aparece
  readonly condutor_index: Map<string, string[]>
}

export function buildConnectionNetwork(nodes: ConnectionNode[]): ConnectionNetwork {
  const node_map = new Map<string, ConnectionNode>()
  const cond_idx = new Map<string, string[]>()

  for (const node of nodes) {
    node_map.set(node.id, node)
    for (const c of node.condutores) {
      const lista = cond_idx.get(c.condutor_id) ?? []
      lista.push(node.id)
      cond_idx.set(c.condutor_id, lista)
    }
  }

  return { nodes: node_map, condutor_index: cond_idx }
}

// Trajetória de um condutor: lista de nós por onde passa em ordem
export function trajetoriaCondutor(
  condutor_id: string,
  network:     ConnectionNetwork
): ConnectionNode[] {
  const node_ids = network.condutor_index.get(condutor_id) ?? []
  return node_ids.map(id => network.nodes.get(id)!).filter(Boolean)
}

// Verificar completude de circuito: todos os condutores chegam ao destino?
export function verificarCircuito(
  circuito_id: string,
  network:     ConnectionNetwork
): { completo: boolean; terminados: number; derivados: number; avisos: string[] } {
  const avisos: string[] = []
  let terminados = 0, derivados = 0

  for (const [, node] of network.nodes) {
    const do_circ = node.condutores.filter(c => c.circuito_id === circuito_id)
    terminados += do_circ.filter(c => c.papel === 'termino').length
    derivados  += do_circ.filter(c => c.papel === 'derivacao').length
  }

  if (terminados === 0) {
    avisos.push(`Circuito ${circuito_id}: nenhum condutor chegou ao ponto de consumo`)
  }

  return { completo: terminados > 0, terminados, derivados, avisos }
}
