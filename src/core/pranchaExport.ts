// src/core/pranchaExport.ts
// ════════════════════════════════════════════════════════════════
// PRANCHA PDF — documento técnico completo para emissão
//
// Gera um HTML printável (Ctrl+P → PDF) com:
//   - Cabeçalho técnico (projeto, responsável, data)
//   - Planta baixa elétrica (SVG embarcado)
//   - QDFL resumido
//   - Nota de rodapé com referências normativas
//
// Estratégia: HTML → window.print() → PDF do navegador
// Zero dependência de biblioteca externa.
// ════════════════════════════════════════════════════════════════

import type { DemandaResult } from '../types/electrical'

export interface DadosPrancha {
  projeto_nome:  string
  projetista:    string
  crea:          string
  data:          string
  endereco:      string
  svg_planta?:   string   // SVG serializado da planta
  circuitos:     {
    id: string; descricao: string; tipo: string
    potencia_va: number; secao_fase: number
    in_disj: number; curva: string; idr: boolean
    du_pct: number; fase: string; status: string
  }[]
  demanda?:      DemandaResult
}

export function gerarPranchaHTML(dados: DadosPrancha): string {
  const data_fmt = dados.data || new Date().toLocaleDateString('pt-BR')
  const ci_total = dados.circuitos.reduce((s, c) => s + c.potencia_va, 0) / 1000

  const linhas_qdfl = dados.circuitos.map((c, i) => {
    const ok = c.status === 'OK' || c.status === 'LIMITE'
    return `<tr class="${ok ? '' : 'err'}">
      <td>${String(i+1).padStart(2,'0')}</td>
      <td>${c.descricao}</td>
      <td>${c.tipo}</td>
      <td>${c.potencia_va}</td>
      <td>${c.secao_fase}</td>
      <td>${c.in_disj}A ${c.curva}</td>
      <td>${c.idr ? '✓ 30mA' : '—'}</td>
      <td>${c.du_pct?.toFixed(1) ?? '—'}%</td>
      <td>${c.fase}</td>
      <td class="${ok ? 'ok' : 'err'}">${c.status}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Prancha — ${dados.projeto_nome}</title>
  <style>
    @page { size: A3 landscape; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; font-size: 9pt; color: #1a1a2e; margin: 0; }

    /* Cabeçalho */
    .cabecalho { display: grid; grid-template-columns: 1fr auto; border: 1.5px solid #1a1a2e; margin-bottom: 8mm; }
    .cab-info { padding: 6mm; }
    .cab-projeto { font-size: 14pt; font-weight: 700; color: #1B2A3B; margin-bottom: 3mm; }
    .cab-linha { font-size: 8pt; color: #555; margin: 1mm 0; }
    .cab-logo { width: 40mm; background: #1B2A3B; display: flex; align-items: center; justify-content: center; color: white; font-size: 10pt; font-weight: 700; padding: 4mm; text-align: center; }
    .cab-selos { border-left: 1px solid #ccc; }
    .selo { padding: 3mm 5mm; border-bottom: 1px solid #ddd; font-size: 7pt; }
    .selo label { display: block; color: #888; font-size: 6pt; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1mm; }

    /* Planta */
    .bloco-planta { border: 1px solid #ccc; margin-bottom: 6mm; padding: 4mm; }
    .bloco-titulo { font-size: 8pt; font-weight: 700; color: #1B2A3B; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3mm; border-bottom: 1px solid #e0e0e0; padding-bottom: 2mm; }
    .svg-container { display: flex; justify-content: center; }
    .svg-container svg { max-width: 100%; max-height: 120mm; }

    /* QDFL */
    table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
    th { background: #1B2A3B; color: white; padding: 2mm 3mm; text-align: center; font-size: 7pt; font-weight: 600; }
    td { padding: 1.5mm 3mm; border-bottom: 1px solid #eee; text-align: center; }
    tr:nth-child(even) { background: #f8fafc; }
    tr.err td { color: #dc2626; }
    td.ok { color: #16a34a; font-weight: 600; }
    td.err { color: #dc2626; font-weight: 700; }

    /* Resumo */
    .resumo { display: flex; gap: 5mm; margin-bottom: 6mm; }
    .resumo-item { flex: 1; border: 1px solid #ddd; padding: 3mm; border-radius: 3px; text-align: center; }
    .resumo-val { font-size: 14pt; font-weight: 700; color: #1B2A3B; }
    .resumo-lbl { font-size: 6.5pt; color: #888; text-transform: uppercase; letter-spacing: .05em; }

    /* Rodapé */
    .rodape { margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #ccc; font-size: 6.5pt; color: #888; display: flex; justify-content: space-between; }

    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>

<!-- Cabeçalho -->
<div class="cabecalho">
  <div class="cab-info">
    <div class="cab-projeto">Projeto Elétrico — ${dados.projeto_nome}</div>
    <div class="cab-linha">📍 ${dados.endereco || 'Endereço não informado'}</div>
    <div class="cab-linha">👤 Responsável Técnico: ${dados.projetista} &nbsp;|&nbsp; CREA: ${dados.crea}</div>
    <div class="cab-linha">📅 Data de emissão: ${data_fmt}</div>
  </div>
  <div class="cab-selos">
    <div class="selo"><label>Revisão</label>00</div>
    <div class="selo"><label>Escala</label>1:50</div>
    <div class="selo"><label>Folha</label>01/01</div>
    <div class="selo" style="background:#1B2A3B;color:white;font-weight:700;font-size:8pt;text-align:center;padding:4mm">
      ProjetEletrico
    </div>
  </div>
</div>

<!-- Resumo KPIs -->
<div class="resumo">
  <div class="resumo-item">
    <div class="resumo-val">${dados.circuitos.length}</div>
    <div class="resumo-lbl">Circuitos</div>
  </div>
  <div class="resumo-item">
    <div class="resumo-val">${ci_total.toFixed(1)} kW</div>
    <div class="resumo-lbl">CI Instalada</div>
  </div>
  ${dados.demanda ? `
  <div class="resumo-item">
    <div class="resumo-val">${dados.demanda.dem_kw.toFixed(1)} kW</div>
    <div class="resumo-lbl">Demanda (fd=${dados.demanda.fd})</div>
  </div>
  <div class="resumo-item">
    <div class="resumo-val">${dados.demanda.in_geral}A</div>
    <div class="resumo-lbl">DG Geral</div>
  </div>
  <div class="resumo-item">
    <div class="resumo-val">${dados.demanda.tipo_ligacao_cemig}</div>
    <div class="resumo-lbl">Ligação</div>
  </div>` : ''}
  <div class="resumo-item">
    <div class="resumo-val">${dados.circuitos.filter(c=>c.status==='OK'||c.status==='LIMITE').length}/${dados.circuitos.length}</div>
    <div class="resumo-lbl">Conformes</div>
  </div>
</div>

${dados.svg_planta ? `
<!-- Planta Baixa Elétrica -->
<div class="bloco-planta">
  <div class="bloco-titulo">📐 Planta Baixa Elétrica</div>
  <div class="svg-container">${dados.svg_planta}</div>
</div>` : ''}

<!-- QDFL -->
<div class="bloco-titulo">⚡ Quadro de Distribuição — Circuitos</div>
<table>
  <tr>
    <th>#</th><th>Descrição</th><th>Tipo</th>
    <th>P(VA)</th><th>S(mm²)</th><th>Proteção</th>
    <th>IDR</th><th>ΔU</th><th>Fase</th><th>Status</th>
  </tr>
  ${linhas_qdfl}
</table>

<!-- Rodapé -->
<div class="rodape">
  <span>Projeto dimensionado conforme ABNT NBR 5410:2004+Em1:2008 | IEC 60898-1 | IEC 60364-4-41</span>
  <span>ProjetEletrico — gerado em ${data_fmt}</span>
</div>

</body>
</html>`
}

export function abrirPrancha(dados: DadosPrancha): void {
  const html = gerarPranchaHTML(dados)
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) {
    win.onload = () => {
      setTimeout(() => { win.print() }, 500)
      URL.revokeObjectURL(url)
    }
  }
}
