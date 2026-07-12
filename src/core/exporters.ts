// src/core/exporters.ts
// Exportação nativa sem dependências externas
// XLSX via formato XML/ZIP-less (Excel 2003 XML) — abre no Excel e LibreOffice
// PDF via HTML + window.print() — sem jsPDF

import type { CircuitResult } from './engine'
import type { DemandaResult } from '../types/electrical'

// ── Tipos ─────────────────────────────────────────────────────
interface ProjetoExport {
  nome: string
  empresa?: string
  endereco: string
  projetista: string
  crea: string
  ano: string
  concessionaria: string
  sistema: string
  v_fase: number
  v_linha: number
  metodo_instalacao: string
  isolacao: string
  t_amb: number
  du_max_pct: number
  aterramento: string
}

// ── Download helper ────────────────────────────────────────────
function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── XLSX nativo via XML do Excel 2003 ─────────────────────────
// Abre perfeitamente no Excel 365, 2019, 2016, LibreOffice
function xmlEscape(s: string | number | undefined): string {
  if (s === undefined || s === null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}


export function exportarQDFL_XLSX(
  projeto: ProjetoExport,
  circuitos: CircuitResult[],
  demanda: DemandaResult | null
): void {
  const ci = circuitos.filter(c => c.potencia_va > 0)

  // Cabeçalho do QDFL
  const headerRow = [
    'N°','Descricao','Tipo','Fase','V(V)','Ib(A)','Ft','Fa','Fs',
    'Secao Fase(mm2)','Secao PE(mm2)','In(A)','Iz\'(A)','dU(%)','Status','IDR'
  ]

  const rows = ci.map((c, i) => [
    String(i + 1).padStart(2, '0'),
    c.descricao,
    c.tipo,
    c.fase,
    c.tensao_v.toFixed(0),
    c.ib.toFixed(2),
    c.ft.toFixed(3),
    c.fa.toFixed(3),
    c.fs.toFixed(2),
    c.secao_fase > 0 ? String(c.secao_fase) : '—',
    c.secao_pe  > 0 ? String(c.secao_pe)   : '—',
    c.in_disj   > 0 ? String(c.in_disj)    : '—',
    c.iz_efetiva > 0 ? c.iz_efetiva.toFixed(1) : '—',
    c.du_calc   > 0 ? c.du_calc.toFixed(2)  : '—',
    c.status,
    c.idr ? 'IDR 30mA' : '—',
  ])

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="bold"><Font ss:Bold="1"/></Style>
  <Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#1B2A3B" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style>
  <Style ss:ID="ok"><Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="warn"><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>
  <Style ss:ID="err"><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>
  <Style ss:ID="title"><Font ss:Size="14" ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="QDFL">
  <Table>
   <Column ss:Width="30"/>
   <Column ss:Width="200"/>
   <Column ss:Width="60"/>
   <Column ss:Width="50"/>
   <Column ss:Width="60"/>
   <Column ss:Width="60"/>
   <Column ss:Width="50"/>
   <Column ss:Width="50"/>
   <Column ss:Width="50"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="50"/>
   <Column ss:Width="60"/>
   <Column ss:Width="60"/>
   <Column ss:Width="70"/>
   <Column ss:Width="70"/>
   <Row><Cell ss:MergeAcross="15"><Data ss:Type="String">ProjetEletrico — ${xmlEscape(projeto.nome)}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="15"><Data ss:Type="String">${xmlEscape(projeto.endereco)} | ${xmlEscape(projeto.concessionaria)} ${projeto.sistema} ${projeto.v_fase}/${projeto.v_linha}V | Metodo ${xmlEscape(projeto.metodo_instalacao)} | ${xmlEscape(projeto.isolacao)} ${projeto.t_amb}°C</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="15"><Data ss:Type="String">RT: ${xmlEscape(projeto.projetista)} — ${xmlEscape(projeto.crea)} — ${xmlEscape(projeto.ano)}</Data></Cell></Row>
   <Row/>
   <Row>${headerRow.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>
   ${rows.map((r, i) => {
     const st = ci[i]?.status ?? ''
     const stStyle = st === 'OK' ? 'ok' : st === 'LIMITE' ? 'warn' : st === 'ERRO' ? 'err' : ''
     const cells = r.map((v, j) => {
       const isNum = j >= 4 && j <= 13 && v !== '—'
       const style = j === 14 && stStyle ? ` ss:StyleID="${stStyle}"` : ''
       const type  = isNum ? 'Number' : 'String'
       const val   = isNum ? parseFloat(v) : v
       return `<Cell${style}><Data ss:Type="${type}">${xmlEscape(val)}</Data></Cell>`
     }).join('')
     return `<Row>${cells}</Row>`
   }).join('\n   ')}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Demanda">
  <Table>
   <Row><Cell ss:StyleID="header"><Data ss:Type="String">Parametro</Data></Cell><Cell ss:StyleID="header"><Data ss:Type="String">Valor</Data></Cell><Cell ss:StyleID="header"><Data ss:Type="String">Unidade</Data></Cell></Row>
   ${demanda ? [
     ['Carga Instalada (CI)', demanda.ci_kw.toFixed(3), 'kW'],
     ['Fator de Demanda (FD)', (demanda.fd * 100).toFixed(1), '%'],
     ['Demanda Maxima', demanda.dem_kw.toFixed(3), 'kW'],
     ['Corrente de Demanda', demanda.i_dem.toFixed(2), 'A'],
     ['Disjuntor Geral', String(demanda.in_geral), 'A'],
     ['Tipo Ligacao CEMIG', demanda.tipo_ligacao_cemig, ''],
     ['Ramal Minimo', String(demanda.ramal_min_mm2), 'mm²'],
     ['Circuitos Ativos', String(demanda.n_ativos), 'un'],
     ['Reservas QD', String(demanda.n_reservas), 'un'],
     ['Total Posicoes QD', String(demanda.n_total_qd), 'posicoes'],
   ].map(([k, v, u]) =>
     `<Row><Cell><Data ss:Type="String">${k}</Data></Cell><Cell><Data ss:Type="String">${v}</Data></Cell><Cell><Data ss:Type="String">${u}</Data></Cell></Row>`
   ).join('\n   ') : ''}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Violacoes">
  <Table>
   <Row>${['Circuito','Codigo','Descricao','Norma','Severidade','Calculado','Limite'].map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>
   ${ci.flatMap(c =>
     (c.violacoes ?? []).map(v =>
       `<Row><Cell><Data ss:Type="String">${xmlEscape(c.descricao)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v.codigo)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v.descricao)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v.norma)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v.severidade)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v.valor_calculado)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v.valor_limite)}</Data></Cell></Row>`
     )
   ).join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`

  const filename = `QDFL_${(projeto.nome || 'projeto').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xls`
  download(xml, filename, 'application/vnd.ms-excel')
}

// ── CSV simples ────────────────────────────────────────────────
export function exportarQDFL_CSV(
  projeto: ProjetoExport,
  circuitos: CircuitResult[]
): void {
  const ci = circuitos.filter(c => c.potencia_va > 0)
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

  const header = ['N°','Descricao','Tipo','Fase','V(V)','Pot.Dim(VA)','Pot.Real(W)','Ib(A)','Ft','Fa','Secao(mm2)','PE(mm2)','In(A)','Iz\'(A)','dU(%)','Status','IDR']
  const rows   = ci.map((c, i) => [
    i + 1, c.descricao, c.tipo, c.fase,
    c.tensao_v.toFixed(0),
    c.potencia_va,                                          // Pot. Dimensionamento (VA)
    (c as any).potencia_real_w ?? '—',                      // Pot. Real instalada (W)
    c.ib.toFixed(2), c.ft.toFixed(3), c.fa.toFixed(3),
    c.secao_fase || '—', c.secao_pe || '—', c.in_disj || '—',
    c.iz_efetiva ? c.iz_efetiva.toFixed(1) : '—',
    c.du_calc ? c.du_calc.toFixed(2) : '—',
    c.status, c.idr ? 'IDR 30mA' : '—',
  ])

  const csv = [
    `# ProjetEletrico — ${projeto.nome}`,
    `# ${projeto.endereco}`,
    `# RT: ${projeto.projetista} — ${projeto.crea}`,
    '',
    header.map(esc).join(';'),
    ...rows.map(r => r.map(esc).join(';')),
  ].join('\n')

  const filename = `QDFL_${(projeto.nome || 'projeto').replace(/\s+/g, '_')}.csv`
  download('\uFEFF' + csv, filename, 'text/csv;charset=utf-8')
}

// ── Memorial descritivo HTML ───────────────────────────────────
export function exportarMemorial(
  projeto: ProjetoExport,
  circuitos: CircuitResult[],
  demanda: DemandaResult | null
): void {
  const ci = circuitos.filter(c => c.potencia_va > 0)
  const n_ok  = ci.filter(c => c.status === 'OK').length
  const n_err = ci.filter(c => c.status === 'ERRO').length
  const data  = new Date().toLocaleDateString('pt-BR')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Memorial Descritivo — ${projeto.empresa ? projeto.empresa + " — " : ""}${projeto.nome}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000;
         background: white; padding: 2cm; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 6pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1px solid #000; padding-bottom: 3pt; }
  h3 { font-size: 12pt; margin: 10pt 0 4pt; }
  p  { margin: 4pt 0; line-height: 1.5; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
  th, td { border: 1px solid #000; padding: 4pt 6pt; }
  th { background: #1b2a3b; color: white; font-weight: bold; text-align: center; }
  td { text-align: center; }
  td.l { text-align: left; }
  .ok   { color: #059669; font-weight: bold; }
  .warn { color: #d97706; font-weight: bold; }
  .err  { color: #dc2626; font-weight: bold; }
  .assinatura { margin-top: 40pt; display: flex; justify-content: space-around; }
  .assinatura div { text-align: center; border-top: 1px solid #000; padding-top: 6pt; width: 200pt; }
  @media print {
    body { padding: 1.5cm; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="no-print" style="position:fixed;top:10px;right:10px;display:flex;gap:8px">
  <button onclick="window.print()" style="padding:8px 16px;background:#0696d7;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">
    Imprimir / Salvar PDF
  </button>
</div>

${projeto.empresa ? `<p style="text-align:center;font-weight:700;font-size:13pt;color:#1B2A3B;margin-bottom:2pt">${projeto.empresa}</p>` : ''}
<h1>MEMORIAL DESCRITIVO E DE CÁLCULO<br>INSTALAÇÃO ELÉTRICA RESIDENCIAL</h1>
<p style="text-align:center;margin:6pt 0">NBR 5410:2004+Em1:2008 | CEMIG ND-5.1 | NR-10 | NBR 5419:2015</p>

<h2>1. IDENTIFICAÇÃO DA OBRA</h2>
<table>
  <tr><th style="width:35%">Item</th><th>Dados</th></tr>
  <tr><td class="l"><b>Empresa</b></td><td class="l">${projeto.empresa || '—'}</td></tr>
  <tr><td class="l"><b>Nome do Projeto</b></td><td class="l">${projeto.nome}</td></tr>
  <tr><td class="l"><b>Endereço</b></td><td class="l">${projeto.endereco}</td></tr>
  <tr><td class="l"><b>Responsável Técnico</b></td><td class="l">${projeto.projetista}</td></tr>
  <tr><td class="l"><b>Registro CREA</b></td><td class="l">${projeto.crea}</td></tr>
  <tr><td class="l"><b>Concessionária</b></td><td class="l">${projeto.concessionaria}</td></tr>
  <tr><td class="l"><b>Data</b></td><td class="l">${data}</td></tr>
</table>

<h2>2. PARÂMETROS DE DIMENSIONAMENTO</h2>
<table>
  <tr><th>Parâmetro</th><th>Valor</th><th>Referência NBR 5410</th></tr>
  <tr><td class="l">Sistema</td><td>${projeto.sistema} ${projeto.v_fase}/${projeto.v_linha}V</td><td>Item 4.1</td></tr>
  <tr><td class="l">Método de Instalação</td><td>${projeto.metodo_instalacao}</td><td>Tabela 33</td></tr>
  <tr><td class="l">Isolação do Condutor</td><td>${projeto.isolacao}</td><td>Tabela 36</td></tr>
  <tr><td class="l">Temperatura Ambiente</td><td>${projeto.t_amb}°C</td><td>Tabela 40</td></tr>
  <tr><td class="l">dU Máximo Circuitos</td><td>${projeto.du_max_pct}%</td><td>Item 6.2.7.2</td></tr>
  <tr><td class="l">Esquema de Aterramento</td><td>${projeto.aterramento}</td><td>Item 4.2</td></tr>
</table>

<h2>3. DEMANDA E DIMENSIONAMENTO GERAL</h2>
${demanda ? `
<p>A carga instalada total é de <b>${demanda.ci_kw.toFixed(2)} kW</b>. Aplicando o fator de demanda de
<b>${(demanda.fd * 100).toFixed(0)}%</b> conforme CEMIG ND-5.1, a demanda máxima resultante é de
<b>${demanda.dem_kw.toFixed(2)} kW</b>, correspondendo a uma corrente de demanda de
<b>${demanda.i_dem.toFixed(2)} A</b>.</p>
<br>
<table>
  <tr><th>Item</th><th>Valor</th></tr>
  <tr><td class="l">Carga Instalada (CI)</td><td><b>${demanda.ci_kw.toFixed(2)} kW</b></td></tr>
  <tr><td class="l">Fator de Demanda (FD) — CEMIG ND-5.1</td><td>${(demanda.fd*100).toFixed(0)}%</td></tr>
  <tr><td class="l">Demanda Máxima</td><td><b>${demanda.dem_kw.toFixed(2)} kW</b></td></tr>
  <tr><td class="l">Corrente de Demanda</td><td>${demanda.i_dem.toFixed(2)} A</td></tr>
  <tr><td class="l">Disjuntor Geral</td><td><b>${demanda.in_geral} A</b></td></tr>
  <tr><td class="l">Tipo de Ligação CEMIG</td><td>${demanda.tipo_ligacao_cemig}</td></tr>
  <tr><td class="l">Ramal Mínimo</td><td>${demanda.ramal_min_mm2} mm²</td></tr>
  <tr><td class="l">Quadro de Distribuição</td><td>${demanda.n_ativos} ativos + ${demanda.n_reservas} reservas = ${demanda.n_total_qd} posições</td></tr>
</table>` : '<p>Sem dados de demanda.</p>'}

<h2>4. QUADRO DE DISTRIBUIÇÃO (QDFL)</h2>
<p>Os circuitos foram dimensionados conforme os critérios da NBR 5410 — tripartida Ib ≤ In ≤ Iz',
queda de tensão máxima de ${projeto.du_max_pct}% e seção mínima de 1,5 mm² (iluminação) e 2,5 mm² (tomadas).</p>
<br>
<table>
  <tr>
    <th style="width:30px">N°</th>
    <th style="width:200px">Descrição</th>
    <th>Tipo</th><th>Fase</th><th>V(V)</th>
    <th>Ib(A)</th><th>Ft</th><th>Fa</th>
    <th>Seção(mm²)</th><th>PE(mm²)</th>
    <th>In(A)</th><th>Iz'(A)</th>
    <th>dU(%)</th><th>Lim.(m)</th><th>Status</th><th>IDR</th>
  </tr>
  ${ci.map((c, i) => {
    const stc = c.status==='OK'?'ok':c.status==='LIMITE'?'warn':'err'
    const dc  = c.du_calc<=3.5?'ok':c.du_calc<=4?'warn':'err'
    return `<tr>
      <td>${String(i+1).padStart(2,'0')}</td>
      <td class="l">${c.descricao}</td>
      <td>${c.tipo}</td><td>${c.fase}</td><td>${c.tensao_v.toFixed(0)}</td>
      <td>${c.ib.toFixed(2)}</td><td>${c.ft.toFixed(3)}</td><td>${c.fa.toFixed(3)}</td>
      <td>${c.secao_fase || '—'}</td><td>${c.secao_pe || '—'}</td>
      <td>${c.in_disj || '—'}</td><td>${c.iz_efetiva ? c.iz_efetiva.toFixed(1) : '—'}</td>
      <td class="${dc}">${c.du_calc ? c.du_calc.toFixed(2)+'%' : '—'}</td>
      <td class="${(c as any).comprimento_max_m && (c as any).comprimento_m > (c as any).comprimento_max_m ? 'err' : 'ok'}">${(c as any).comprimento_max_m ? (c as any).comprimento_max_m.toFixed(0)+'m' : '—'}</td>
      <td class="${stc}">${c.status}</td>
      <td>${c.idr ? 'IDR 30mA' : '—'}</td>
    </tr>`
  }).join('')}
</table>

<h2>5. CRITÉRIOS DE PROJETO — DECISÕES TÉCNICAS</h2>
<p>As decisões de dimensionamento seguem a cadeia normativa: <b>Ib ≤ In ≤ Iz'</b> (NBR 5410 §5.1.3.1).
A curva do disjuntor é selecionada pelo comportamento elétrico real da carga (inrush, partida, regime).</p>
<br>
<table>
  <tr><th>Circuito</th><th>Curva</th><th>Motivo da curva</th><th>Lim.(m)</th><th>Fator seg.</th></tr>
  ${ci.map(c => `<tr>
    <td class="l">${c.descricao}</td>
    <td>${c.curva || '—'}</td>
    <td class="l" style="font-size:10px">${(c as any).justificativa_curva || '—'}</td>
    <td class="${(c as any).comprimento_max_m && (c as any).comprimento_m > (c as any).comprimento_max_m ? 'err' : 'ok'}">${(c as any).comprimento_max_m ? (c as any).comprimento_max_m.toFixed(0)+'m' : '—'}</td>
    <td class="${(c as any).fator_seguranca >= 1.5 ? 'ok' : (c as any).fator_seguranca >= 1 ? 'warn' : 'err'}">${(c as any).fator_seguranca ? (c as any).fator_seguranca.toFixed(1)+'×' : '—'}</td>
  </tr>`).join('')}
</table>
<br>

<h2>6. RESUMO DE CONFORMIDADE</h2>
<p>Total de circuitos: <b>${ci.length}</b> | Conformes: <b class="ok">${n_ok}</b> | Com erro: <b class="${n_err>0?'err':'ok'}">${n_err}</b></p>
<p>A coluna <b>Lim.(m)</b> indica o comprimento máximo para que a proteção magnética atue conforme IEC 60364-4-41 (Sistema TN, t ≤ 0,4s). Circuitos que excedam este limite devem ter IDR 30mA ou comprimento reduzido.</p>
${n_err > 0 ? `<br><p><b>ATENÇÃO:</b> Existem ${n_err} circuito(s) com violação normativa. Revisar antes da entrega.</p>` : '<br><p>Todos os circuitos atendem integralmente à NBR 5410:2004+Em1:2008.</p>'}

${ci.flatMap(c => c.violacoes ?? []).length > 0 ? `
<h3>5.1 Violações Normativas</h3>
<table>
  <tr><th>Circuito</th><th>Violação</th><th>Norma</th><th>Severidade</th></tr>
  ${ci.flatMap(c => (c.violacoes ?? []).map(v => `
  <tr>
    <td class="l">${c.descricao}</td>
    <td class="l">${v.descricao}</td>
    <td class="l">${v.norma}</td>
    <td class="${v.severidade === 'erro_bloqueante' ? 'err' : 'warn'}">${v.severidade}</td>
  </tr>`)).join('')}
</table>` : ''}

<h2>7. PROTEÇÃO CONTRA CHOQUES ELÉTRICOS</h2>
<p>O sistema de proteção contra choques elétricos atende ao esquema <b>${projeto.aterramento}</b>
conforme NBR 5410 item 4.2. Os circuitos em áreas molhadas são protegidos por dispositivos de
proteção diferencial-residual (IDR) com sensibilidade de 30 mA (alta sensibilidade),
conforme NBR 5410 item 5.1.3.6.1.</p>
<p>Dispositivos de proteção contra surtos (DPS) classe II devem ser instalados na entrada do
quadro de distribuição conforme NBR 5410 item 7.4.</p>

<h2>8. DECLARAÇÃO DE RESPONSABILIDADE TÉCNICA</h2>
<p>Eu, <b>${projeto.projetista}</b>, inscrito no CREA sob o n° <b>${projeto.crea}</b>,
declaro ser o responsável técnico pelo presente projeto elétrico, elaborado em conformidade com
as normas NBR 5410:2004+Em1:2008, CEMIG ND-5.1, NR-10 e NBR 5419:2015.</p>

<div class="assinatura">
  <div>
    <p>${projeto.projetista}</p>
    <p>${projeto.crea}</p>
    <p>Responsável Técnico</p>
  </div>
  <div>
    <p>______________________</p>
    <p>Contratante</p>
    <p>${data}</p>
  </div>
</div>

</body>
</html>`

  const filename = `Memorial_${(projeto.nome || 'projeto').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.html`
  download(html, filename, 'text/html;charset=utf-8')
  
  // Abrir em nova aba para impressão imediata
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ── Exportar via backend Python (server.js + gerar_qdfl.py) ───
export async function exportarQDFL_Python(
  projeto: any,
  circuitos: CircuitResult[],
  demanda: DemandaResult | null
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const dados = { projeto, circuitos, demanda }
    const nome  = (projeto.nome || 'QDFL').replace(/\s+/g, '_')
    const filename = `QDFL_${nome}_${new Date().toISOString().slice(0,10)}.xlsx`

    const resp = await fetch('http://127.0.0.1:3847/api/export-qdfl', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ data: dados, filename }),
    })

    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    return await resp.json()
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Detectar modo de operação ─────────────────────────────────
export function isServerMode(): boolean {
  try {
    return window.location.port === '3847' || window.location.hostname === '127.0.0.1'
  } catch {
    return false
  }
}
