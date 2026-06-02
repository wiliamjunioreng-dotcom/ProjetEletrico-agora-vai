// src/core/visualizationEngine.ts
// ════════════════════════════════════════════════════════════════
// VISUALIZATION ENGINE — domínio → representação visual
//
// REGRAS ABSOLUTAS:
//   ✗ Não recalcular nada elétrico
//   ✗ Não validar normas
//   ✗ Não duplicar lógica de domínio
//   ✓ Apenas transformar coordenadas de metros → pixels
//   ✓ Apenas derivar cor/espessura do estado calculado
//   ✓ Apenas agrupar elementos para renderização
//
// Entrada: domínio (pontos, segmentos, circuitos calculados)
// Saída:   ElectricalOverlay (SVG-ready, efêmero, reconstruível)
// ════════════════════════════════════════════════════════════════

import type { PontoEletrico } from '../types/geometry'
import type { CircuitViewModel } from '../store/circuitViewModel'

// ── Sistema de coordenadas ────────────────────────────────────────
export interface Calibracao {
  readonly escala_px_m:  number   // pixels por metro
  readonly offset_x_px:  number   // deslocamento X em pixels
  readonly offset_y_px:  number   // deslocamento Y em pixels
}

export function metrosParaPixels(
  x_m: number, y_m: number, cal: Calibracao
): { x: number; y: number } {
  return {
    x: x_m * cal.escala_px_m + cal.offset_x_px,
    y: y_m * cal.escala_px_m + cal.offset_y_px,
  }
}

// ── Tipos visuais ─────────────────────────────────────────────────
// Ponto de instalação no canvas
export interface PontoVisual {
  readonly id:         string
  readonly tipo:       string
  readonly x_px:       number
  readonly y_px:       number
  readonly circuito_id?: string
  readonly cor:        string
  readonly tamanho_px: number
  readonly alerta:     'critico' | 'aviso' | 'ok' | 'nenhum'
  readonly tooltip:    string
}

// Linha de condutores entre pontos
export interface CondutorVisual {
  readonly id:         string
  readonly x1_px:      number
  readonly y1_px:      number
  readonly x2_px:      number
  readonly y2_px:      number
  readonly circuito_id: string
  readonly cor:        string
  readonly espessura:  number    // px — baseado na seção do cabo
  readonly alerta:     'critico' | 'aviso' | 'ok'
  readonly tooltip:    string
}

// Alerta visual (badge flutuante)
export interface AlertaVisual {
  readonly id:     string
  readonly x_px:   number
  readonly y_px:   number
  readonly nivel:  'critico' | 'aviso' | 'info'
  readonly icone:  string    // '⛔' | '⚠' | '💡'
  readonly texto:  string
}

// Overlay completo — entregue ao renderer SVG
export interface ElectricalOverlay {
  readonly pontos:    PontoVisual[]
  readonly condutores: CondutorVisual[]
  readonly alertas:   AlertaVisual[]
  // Seleção contextual
  readonly selecionado_id?:    string   // circuito_id ou ponto_id
  readonly ids_em_foco:        Set<string>   // pontos/condutores destacados
}

// ── Paleta de cores por circuito ─────────────────────────────────
const PALETA_CIRCUITO = [
  '#2563eb', '#16a34a', '#d97706', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#7c3aed',
  '#0284c7', '#15803d', '#b45309', '#6d28d9',
]

function corCircuito(idx: number): string {
  return PALETA_CIRCUITO[idx % PALETA_CIRCUITO.length]
}

// ── Cor de alerta → cor visual ────────────────────────────────────
function corAlerta(nivel: 'critico' | 'aviso' | 'ok' | 'nenhum'): string {
  return { critico:'#ef4444', aviso:'#f59e0b', ok:'#22c55e', nenhum:'#6b7280' }[nivel]
}

// ── Espessura por seção de cabo ───────────────────────────────────
export function espessuraPorSecao(secao_mm2: number | null | undefined): number {
  if (!secao_mm2) return 1.5
  if (secao_mm2 >= 6)   return 3.5
  if (secao_mm2 >= 4)   return 3.0
  if (secao_mm2 >= 2.5) return 2.5
  return 1.5  // 1.5mm²
}

// ── Nível de alerta do circuito ───────────────────────────────────
function nivelCircuito(vm: CircuitViewModel): 'critico' | 'aviso' | 'ok' {
  const r = vm.resultado
  if (!r) return 'ok'
  if (r.comprimento_max_m != null && r.comprimento_max_m < vm.comprimento_m) return 'critico'
  if (vm.violacoes.some(v => v.mensagem.toLowerCase().includes('bloq'))) return 'critico'
  if (vm.violacoes.length > 0 || r.curva_adequada === false) return 'aviso'
  return 'ok'
}

// ── Builder principal ─────────────────────────────────────────────
export function buildElectricalOverlay(
  pontos:       PontoEletrico[],
  vms:          CircuitViewModel[],
  cal:          Calibracao,
  selecionado?: string   // circuito_id ou ponto_id em foco
): ElectricalOverlay {
  // Mapa circuito_id → índice de cor
  const circ_idx = new Map<string, number>()
  vms.forEach((vm, i) => circ_idx.set(vm.id, i))

  // Mapa circuito_id → alerta
  const circ_alerta = new Map<string, 'critico' | 'aviso' | 'ok'>()
  vms.forEach(vm => circ_alerta.set(vm.id, nivelCircuito(vm)))

  // Mapa circuito_id → vm
  const vm_map = new Map(vms.map(vm => [vm.id, vm]))

  // ── Pontos visuais ────────────────────────────────────────────
  const pontos_vis: PontoVisual[] = pontos.map(p => {
    const px = metrosParaPixels(p.x, p.y, cal)
    const circ_id = p.carga_ids?.[0] ? undefined : undefined  // fallback
    const idx     = circ_id ? (circ_idx.get(circ_id) ?? 0) : 0
    const alerta  = circ_id ? (circ_alerta.get(circ_id) ?? 'nenhum') : 'nenhum'
    const vm      = circ_id ? vm_map.get(circ_id) : undefined

    return {
      id:          p.id,
      tipo:        p.tipo,
      x_px:        px.x,
      y_px:        px.y,
      circuito_id: circ_id,
      cor:         alerta !== 'nenhum' ? corAlerta(alerta) : corCircuito(idx),
      tamanho_px:  alerta === 'critico' ? 12 : 9,
      alerta,
      tooltip:     vm
        ? `${vm.numero} — ${vm.descricao}\n${vm.resultado?.secao_mm2 ?? '?'}mm² · ${vm.resultado?.in_disj ?? '?'}A ${vm.resultado?.curva ?? ''}`
        : p.tipo,
    }
  })

  // ── Alertas flutuantes (circuitos críticos sem ponto físico) ──
  const alertas_vis: AlertaVisual[] = []
  for (const vm of vms) {
    const nivel = nivelCircuito(vm)
    if (nivel !== 'ok') {
      // Encontrar pontos deste circuito
      const pontos_circ = pontos_vis.filter(p => p.circuito_id === vm.id)
      if (pontos_circ.length > 0) {
        const p = pontos_circ[0]  // alerta no primeiro ponto
        alertas_vis.push({
          id:    `alerta-${vm.id}`,
          x_px:  p.x_px + 10,
          y_px:  p.y_px - 10,
          nivel,
          icone: nivel === 'critico' ? '⛔' : '⚠',
          texto: vm.violacoes[0]?.mensagem ?? 'Verificar circuito',
        })
      }
    }
  }

  // ── Contexto de foco (seleção contextual) ──────────────────────
  const ids_em_foco = new Set<string>()
  if (selecionado) {
    // Destacar todos os pontos do circuito selecionado
    pontos_vis
      .filter(p => p.circuito_id === selecionado)
      .forEach(p => ids_em_foco.add(p.id))
    // Destacar todas as linhas do circuito
    ids_em_foco.add(selecionado)
  }

  return {
    pontos:      pontos_vis,
    condutores:  [],  // populado quando temos segmentos com coordenadas
    alertas:     alertas_vis,
    selecionado_id: selecionado,
    ids_em_foco,
  }
}

// ── Heatmap de ocupação de eletroduto ────────────────────────────
// Recebe taxa de ocupação (0-1) → cor gradiente
export function corOcupacao(taxa: number): string {
  if (taxa > 0.9) return '#ef4444'  // vermelho — crítico
  if (taxa > 0.7) return '#f59e0b'  // âmbar — atenção
  if (taxa > 0.4) return '#3b82f6'  // azul — normal
  return '#22c55e'  // verde — folgado
}

// Heatmap de queda de tensão (0-7% → verde-vermelho)
export function corQueda(du_pct: number): string {
  if (du_pct > 5)   return '#ef4444'
  if (du_pct > 3.5) return '#f59e0b'
  if (du_pct > 2)   return '#3b82f6'
  return '#22c55e'
}

// Heatmap de fator de segurança (< 1 → crítico, > 1.5 → ok)
export function corFatorSeguranca(fator: number): string {
  if (fator < 1.0)  return '#ef4444'
  if (fator < 1.5)  return '#f59e0b'
  return '#22c55e'
}
