// src/pages/ART.tsx — Relatório ART para CREA
// Anotação de Responsabilidade Técnica — dados para preenchimento

import { useProjectStore } from '../store/projectStore'

export function ART() {
  const { projeto, circuitos_calc, demanda } = useProjectStore()
  const ci = circuitos_calc.filter(c => c.potencia_va > 0)
  const n_ok  = ci.filter(c => c.status === 'OK').length
  const conforme = n_ok === ci.length && ci.length > 0

  const p = projeto as any

  function gerarRelatorio() {
    const data = new Date().toLocaleDateString('pt-BR')
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Técnico — ${projeto.nome}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; padding: 2cm; }
  h1 { font-size: 14pt; text-align: center; margin-bottom: 4pt; text-transform: uppercase; }
  h2 { font-size: 11pt; margin: 14pt 0 5pt; background: #0f62fe; color: #fff; padding: 4pt 8pt; }
  h3 { font-size: 10pt; margin: 8pt 0 4pt; color: #333; }
  p  { margin: 3pt 0; line-height: 1.5; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
  th, td { border: 1px solid #ccc; padding: 4pt 6pt; }
  th { background: #f0f4ff; font-weight: bold; text-align: left; }
  .ok   { color: #0f9d58; font-weight: bold; }
  .err  { color: #da1e28; font-weight: bold; }
  .center { text-align: center; }
  .mono   { font-family: 'Courier New', monospace; }
  .sign   { margin-top: 48pt; display: flex; justify-content: space-around; }
  .sign-line { text-align: center; border-top: 1px solid #000; padding-top: 5pt; width: 200pt; }
  .seal   { border: 2px solid #0f62fe; padding: 10pt; text-align: center; margin: 10pt auto; width: 300pt; }
  @media print { body { padding: 1cm; } .no-print { display: none; } }
</style>
</head>
<body>

<div class="no-print" style="position:fixed;top:10px;right:10px;display:flex;gap:8px">
  <button onclick="window.print()" style="padding:8px 18px;background:#0f62fe;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px">
    Imprimir / Salvar PDF
  </button>
</div>

<div class="seal">
  <div style="font-size:13pt;font-weight:bold;color:#0f62fe">RELATÓRIO TÉCNICO</div>
  <div style="font-size:10pt;margin-top:3pt">Instalação Elétrica de Baixa Tensão</div>
  <div style="font-size:9pt;color:#666;margin-top:2pt">NBR 5410:2004+Em1:2008 · CEMIG ND-5.1 · NR-10</div>
</div>

<h2>1. IDENTIFICAÇÃO DA OBRA E DO RESPONSÁVEL TÉCNICO</h2>
<table>
  <tr><th style="width:35%">Item</th><th>Dados</th></tr>
  <tr><td><b>Nome do Projeto</b></td><td>${projeto.nome}</td></tr>
  <tr><td><b>Endereço da Obra</b></td><td>${p.endereco || '—'}</td></tr>
  <tr><td><b>Responsável Técnico</b></td><td>${p.projetista || '—'}</td></tr>
  <tr><td><b>Registro CREA</b></td><td>${p.crea || '—'}</td></tr>
  <tr><td><b>Concessionária</b></td><td>${p.concessionaria || 'CEMIG'}</td></tr>
  <tr><td><b>Data do relatório</b></td><td>${data}</td></tr>
  <tr><td><b>Ano do projeto</b></td><td>${p.ano || new Date().getFullYear()}</td></tr>
</table>

<h2>2. PARÂMETROS DO PROJETO ELÉTRICO</h2>
<table>
  <tr><th>Parâmetro</th><th>Valor adotado</th><th>Referência normativa</th></tr>
  <tr><td>Sistema de distribuição</td><td class="mono">${p.sistema || 'Bifasico'} — ${p.v_fase || 127}/${p.v_linha || 220} V</td><td>NBR 5410 item 4.1</td></tr>
  <tr><td>Esquema de aterramento</td><td class="mono">${p.aterramento || 'TN-S'}</td><td>NBR 5410 item 4.2</td></tr>
  <tr><td>Método de instalação</td><td class="mono">${p.metodo_instalacao || 'B1'} — eletroduto embutido em alvenaria</td><td>NBR 5410 Tabela 33</td></tr>
  <tr><td>Tipo de isolação</td><td class="mono">${p.isolacao || 'PVC'} 70°C</td><td>NBR 5410 Tabela 36</td></tr>
  <tr><td>Temperatura ambiente</td><td class="mono">${p.t_amb || 30}°C</td><td>NBR 5410 Tabela 40</td></tr>
  <tr><td>Queda de tensão máx.</td><td class="mono">${p.du_max_pct || 4}% (circuitos terminais)</td><td>NBR 5410 item 6.2.7.2</td></tr>
  <tr><td>Icc disponível na rede</td><td class="mono">${p.icc_rede_ka || 3} kA</td><td>IEC 60909 / Concessionária</td></tr>
  <tr><td>Fator de potência</td><td class="mono">${p.fp_global || 0.92}</td><td>CEMIG ND-5.1</td></tr>
</table>

<h2>3. RESUMO DA DEMANDA — CEMIG ND-5.1</h2>
<table>
  <tr><th>Item</th><th>Valor</th></tr>
  <tr><td>Carga instalada total (CI)</td><td class="mono"><b>${demanda ? demanda.ci_kw.toFixed(3) : '—'} kW</b></td></tr>
  <tr><td>Fator de demanda (FD)</td><td class="mono">${demanda ? (demanda.fd * 100).toFixed(0) : '—'}%</td></tr>
  <tr><td>Demanda máxima</td><td class="mono"><b>${demanda ? demanda.dem_kw.toFixed(3) : '—'} kW</b></td></tr>
  <tr><td>Corrente de demanda</td><td class="mono">${demanda ? demanda.i_dem.toFixed(2) : '—'} A</td></tr>
  <tr><td>Disjuntor geral</td><td class="mono"><b>${demanda ? demanda.in_geral : '—'} A — ${demanda ? demanda.tipo_ligacao_cemig : '—'}</b></td></tr>
  <tr><td>Seção do ramal de entrada</td><td class="mono">${demanda ? demanda.ramal_min_mm2 : '—'} mm² Cu</td></tr>
  <tr><td>Quadro de distribuição</td><td class="mono">${demanda ? demanda.n_total_qd : '—'} posições (${demanda ? demanda.n_ativos : '—'} ativos + ${demanda ? demanda.n_reservas : '—'} reservas)</td></tr>
</table>

<h2>4. QUADRO RESUMO DE CIRCUITOS</h2>
<table>
  <tr>
    <th class="center">N°</th>
    <th>Descrição</th>
    <th class="center">Tipo</th>
    <th class="center">Fase</th>
    <th class="center">Pot.(W)</th>
    <th class="center">Ib(A)</th>
    <th class="center">Seção(mm²)</th>
    <th class="center">In(A)</th>
    <th class="center">ΔV%</th>
    <th class="center">Status</th>
  </tr>
  ${ci.map((c, i) => `
  <tr>
    <td class="center mono">${String(i+1).padStart(2,'0')}</td>
    <td>${c.descricao}</td>
    <td class="center">${c.tipo}</td>
    <td class="center mono">${c.fase}</td>
    <td class="center mono">${c.potencia_va}</td>
    <td class="center mono">${c.ib.toFixed(2)}</td>
    <td class="center mono">${c.secao_fase || '—'}</td>
    <td class="center mono">${c.in_disj || '—'}</td>
    <td class="center mono ${c.du_calc <= 4 ? 'ok' : 'err'}">${c.du_calc > 0 ? c.du_calc.toFixed(2)+'%' : '—'}</td>
    <td class="center ${c.status === 'OK' ? 'ok' : 'err'}">${c.status}</td>
  </tr>`).join('')}
  ${ci.length === 0 ? '<tr><td colspan="10" style="text-align:center;color:#999">Nenhum circuito dimensionado</td></tr>' : ''}
</table>

<h2>5. DECLARAÇÃO DE CONFORMIDADE NORMATIVA</h2>
<p>
  O presente projeto elétrico foi elaborado em conformidade com as seguintes normas técnicas:
</p>
<ul style="margin: 8pt 0 8pt 20pt; line-height: 2;">
  <li><b>NBR 5410:2004+Em1:2008</b> — Instalações elétricas de baixa tensão</li>
  <li><b>CEMIG ND-5.1</b> — Fornecimento em tensão secundária de distribuição — critérios de dimensionamento</li>
  <li><b>NR-10</b> — Segurança em instalações e serviços em eletricidade</li>
  <li><b>NBR 5419:2015</b> — Proteção contra raios (SPDA)</li>
  <li><b>IEC 60909:2016</b> — Correntes de curto-circuito em sistemas CA</li>
  <li><b>NBR ISO/CIE 8995-1</b> — Iluminação de ambientes de trabalho</li>
</ul>
<p style="margin-top: 8pt">
  Todos os ${ci.length} circuitos foram dimensionados observando-se a tripartida normativa
  <b>Ib ≤ In ≤ Iz'</b> (item 5.1.3.1 da NBR 5410), com verificação da queda de tensão máxima
  de ${p.du_max_pct || 4}% e seleção de dispositivos de proteção conforme IEC 60898.
</p>
${ci.filter(c => c.idr).length > 0 ? `
<p style="margin-top: 5pt">
  <b>Proteção diferencial residual (IDR):</b> ${ci.filter(c => c.idr).length} circuito(s) em áreas molhadas
  possuem proteção IDR de 30 mA conforme item 5.1.3.6.1 da NBR 5410.
</p>` : ''}
<p style="margin-top: 8pt">
  <b>Conformidade:</b> <span class="${conforme ? 'ok' : 'err'}">${conforme ? `✓ ${n_ok}/${ci.length} circuitos conformes — aprovado` : `⚠ ${ci.length - n_ok} circuito(s) requerem revisão antes da entrega`}</span>
</p>

<h2>6. DECLARAÇÃO DE RESPONSABILIDADE TÉCNICA</h2>
<p>
  Eu, <b>${p.projetista || '___________________'}</b>, portador do registro no CREA
  n° <b>${p.crea || '___________________'}</b>, declaro ser o Responsável Técnico
  pelo projeto elétrico acima identificado, assumindo total responsabilidade técnica
  pelos serviços prestados, em conformidade com o Código de Ética Profissional do
  Sistema CONFEA/CREA e com as normas técnicas aplicáveis.
</p>
<p style="margin-top: 8pt">
  <b>Modalidade:</b> Projeto de instalação elétrica residencial de baixa tensão<br>
  <b>Atribuição:</b> Projeto e especificação técnica (sem execução)<br>
  <b>Data:</b> ${data}
</p>

<div class="sign">
  <div class="sign-line">
    <p>${p.projetista || '___________________'}</p>
    <p>${p.crea || 'CREA-MG ___________'}</p>
    <p>Responsável Técnico</p>
  </div>
  <div class="sign-line">
    <p>___________________</p>
    <p>Contratante / Cliente</p>
    <p>${data}</p>
  </div>
</div>

<div style="margin-top: 24pt; font-size: 8pt; color: #666; text-align: center; border-top: 1px solid #ddd; padding-top: 8pt;">
  Documento gerado por ProjetEletrico v2.0 · ${data} · NBR 5410:2004+Em1:2008
</div>

</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10000)

    // Download também
    const a = document.createElement('a')
    a.href = url
    a.download = `Relatorio_${(projeto.nome||'projeto').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.html`
    // Não fazer auto-download — só abrir para impressão
  }

  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Relatório Técnico / ART</div>
        <div className="page-sub">
          Dados para Anotação de Responsabilidade Técnica — CREA · NBR 5410
        </div>
      </div>
      <div className="page-actions">
        <button className="btn primary" onClick={gerarRelatorio} disabled={ci.length === 0}>
          Gerar relatório para impressão / PDF
        </button>
      </div>
    </div>

    <div className="page-scroll">
    <div className="page-pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

      {/* Identificação */}
      <div className="card">
        <div className="card-header">Identificação do responsável técnico</div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          {[
            ['Projetista (RT)', p.projetista || '—'],
            ['Registro CREA',   p.crea || '—'],
            ['Nome do projeto', projeto.nome],
            ['Endereço',        p.endereco || '—'],
            ['Concessionária',  p.concessionaria || 'CEMIG'],
            ['Ano',             p.ano || '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
          {(!p.projetista || !p.crea) && (
            <div style={{ padding: '8px 10px', background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6, fontSize: 11, color: 'var(--amber)' }}>
              Preencha o nome e CREA na aba <strong>Dados do Projeto</strong> antes de gerar o relatório.
            </div>
          )}
        </div>
      </div>

      {/* Resumo técnico */}
      <div className="card">
        <div className="card-header">Resumo técnico para ART</div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          {[
            ['Sistema', `${p.sistema || 'Bifasico'} ${p.v_fase || 127}/${p.v_linha || 220}V`],
            ['Método instalação', p.metodo_instalacao || 'B1'],
            ['CI instalada', demanda ? `${demanda.ci_kw.toFixed(2)} kW` : '—'],
            ['Demanda máxima', demanda ? `${demanda.dem_kw.toFixed(2)} kW` : '—'],
            ['Disjuntor geral', demanda ? `${demanda.in_geral}A` : '—'],
            ['Circuitos', `${ci.length} dimensionados · ${n_ok} conformes`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>{k}</span>
              <span style={{ fontWeight: 500, fontFamily: 'var(--mono)' }}>{v}</span>
            </div>
          ))}
          <div style={{
            padding: '8px 10px',
            background: conforme ? 'var(--green-dim)' : 'var(--red-dim)',
            border: `1px solid ${conforme ? 'var(--green)' : 'var(--red)'}`,
            borderRadius: 6, fontSize: 11,
            color: conforme ? 'var(--green)' : 'var(--red)',
          }}>
            {ci.length === 0
              ? 'Nenhum circuito dimensionado — complete o projeto antes de gerar a ART.'
              : conforme
                ? `✓ ${n_ok}/${ci.length} circuitos conformes — pronto para ART`
                : `⚠ ${ci.length - n_ok} circuito(s) com erro — revisar antes da ART`}
          </div>
        </div>
      </div>

      {/* Normas aplicáveis */}
      <div className="card">
        <div className="card-header">Normas aplicáveis ao projeto</div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          {[
            ['NBR 5410:2004+Em1:2008', 'Instalações elétricas de baixa tensão — norma principal'],
            ['CEMIG ND-5.1',           'Fornecimento em tensão secundária de distribuição'],
            ['NR-10',                  'Segurança em instalações e serviços em eletricidade'],
            ['NBR 5419:2015',          'Proteção de estruturas contra descargas atmosféricas'],
            ['IEC 60909:2016',         'Correntes de curto-circuito em sistemas CA'],
            ['NBR ISO/CIE 8995-1',     'Iluminação de ambientes de trabalho'],
            ['IEC 60898',              'Disjuntores para proteção de sobrecorrente'],
          ].map(([norma, desc]) => (
            <div key={norma} style={{ display: 'flex', gap: 10, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 170, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 600, flexShrink: 0, fontSize: 11 }}>{norma}</span>
              <span style={{ color: 'var(--text3)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Guia ART */}
      <div className="card">
        <div className="card-header">Guia — preenchimento da ART no CREA-MG</div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          <p style={{ color: 'var(--text3)', lineHeight: 1.6 }}>
            Para registrar a ART no CREA-MG, acesse o portal do CREA-MG e use os dados abaixo:
          </p>
          {[
            ['Tipo de serviço', 'Projeto — Instalação Elétrica Residencial'],
            ['Atividade técnica', 'Projeto de instalação elétrica de BT'],
            ['Tipo de obra', 'Residência unifamiliar / multifamiliar'],
            ['Norma principal', 'NBR 5410:2004+Em1:2008'],
            ['Potência instalada', demanda ? `${demanda.ci_kw.toFixed(2)} kW` : 'preencher'],
            ['Valor da obra', 'Informar conforme contrato'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>{k}</span>
              <span style={{ fontWeight: 500, color: 'var(--blue)' }}>{v}</span>
            </div>
          ))}
          <a href="https://www.crea-mg.org.br" target="_blank" rel="noopener noreferrer"
            style={{ marginTop: 4, color: 'var(--blue)', fontSize: 11, textDecoration: 'none', fontWeight: 500 }}>
            → Acessar portal CREA-MG
          </a>
        </div>
      </div>

    </div>
    </div>
  </>)
}
