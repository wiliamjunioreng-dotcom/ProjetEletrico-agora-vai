// src/pages/Auditoria.tsx
// ════════════════════════════════════════════════════════════════
// AUDITORIA DE PROJETO — revisão técnica visual completa
//
// Conecta todos os engines em um único painel acionável:
//   - Verificações NBR 5410 §5, §6, §9 (proteção, seção, terminais)
//   - Proteção funcional (comprimento máximo, curva, loop)
//   - Balanceamento de fases
//   - Sugestões proativas (circuitos dedicados, DR, redistribuição)
//
// Hierarquia clara:
//   ⛔ CRÍTICO — risco de segurança, não entregar sem corrigir
//   ⚠ ATENÇÃO — violação normativa, precisa justificar
//   💡 SUGESTÃO — melhoria de qualidade, projetista decide
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { buildAllViewModels } from '../store/circuitViewModel'
import { verificarProjetoNBR9 } from '../core/rules/nbr5410_s9'
import { resolverCircuito } from '../core/pipeline'
import type { CircuitoPipelined } from '../core/pipeline'

interface ItemAuditoria {
  nivel:    'critico' | 'atencao' | 'sugestao' | 'ok'
  categoria: string
  titulo:   string
  detalhe:  string
  acao?:    string          // texto descritivo da ação
  norma?:   string
  circuito?: string
  comodo?:  string
  // Navegação contextual: onde ir quando clicar
  nav_pagina?:   string    // 'circuitos' | 'comodos' | 'balanceamento'
  nav_circuito?: string    // ID do circuito a focar
  // Correção de um clique
  fix?: {
    circuito_id:     string
    override_secao?: number
    override_in?:    number
    override_curva?: 'B'|'C'|'D'
    motivo:          string
  }
}

const CORES = {
  critico:  { bg: 'var(--red-dim)',    borda: 'var(--red)',    txt: 'var(--red)'    },
  atencao:  { bg: 'var(--amber-dim)',  borda: 'var(--amber)',  txt: 'var(--amber)'  },
  sugestao: { bg: 'var(--blue-dim)',   borda: 'var(--blue)',   txt: 'var(--blue)'   },
  ok:       { bg: 'transparent',       borda: 'var(--green)',  txt: 'var(--green)'  },
}

const ICONES = { critico: '⛔', atencao: '⚠', sugestao: '💡', ok: '✓' }

export default function Auditoria() {
  const { circuitos_raw, comodos, projeto, setPagina, setCircuitoFoco, updateCircuito, historico } = useProjectStore()
  const [showTimeline, setShowTimeline] = useState(false)

  // Aplicar correção de um clique
  function applyFix(fix: NonNullable<ItemAuditoria['fix']>) {
    updateCircuito(fix.circuito_id, {
      ...(fix.override_secao ? { override_secao_mm2: fix.override_secao } : {}),
      ...(fix.override_in    ? { override_in_disj: fix.override_in }       : {}),
      ...(fix.override_curva ? { override_curva: fix.override_curva }       : {}),
      override_motivo: fix.motivo,
    })
  }

  // ── Montar mapa de pipeline REAL ──────────────────────────────
  // BUG CRÍTICO CORRIGIDO: a versão anterior procurava uma propriedade
  // `.pipeline` em circuitos_calc que NUNCA é definida em lugar nenhum
  // do código (circuitos_calc vem de engine.ts/dimensionarCircuito,
  // que não anexa dados de pipeline). Isso fazia pipelineMap ficar
  // SEMPRE VAZIO, e por consequência vm.resultado SEMPRE null —
  // ou seja, nenhum alerta crítico de proteção/curva/fator de
  // segurança jamais disparava na Auditoria, silenciosamente.
  // Corrigido para chamar resolverCircuito() diretamente, igual ao
  // padrão já usado (corretamente) em Circuitos.tsx.
  const pipelineMap = useMemo(() => {
    const m = new Map<string, CircuitoPipelined>()
    circuitos_raw.filter((r: any) => r.tipo !== 'RESERVA').forEach((raw: any) => {
      if ((raw.potencia_va ?? 0) > 0) {
        try {
          m.set(raw.id, resolverCircuito({
            id: raw.id, descricao: raw.descricao, tipo: raw.tipo,
            fase: raw.fase, potencia_va: raw.potencia_va,
            potencia_real_w: raw.potencia_real_w,
            comprimento_m: raw.comprimento_m ?? 0,
            n_agrup: raw.n_agrup ?? 1,
            v_fase: projeto.v_fase,
            metodo: projeto.metodo_instalacao,
            isolacao: projeto.isolacao as any,
            material: projeto.material_cabo as any,
            t_amb: projeto.t_amb,
            du_max_pct: projeto.du_max_pct,
            du_ramal_pct: projeto.du_ramal_pct,
            icc_rede_ka: projeto.icc_rede_ka,
            secao_minima_preset_mm2: (projeto as any).secao_minima_preset_mm2,
          }))
        } catch { /* circuito inválido — ignora */ }
      }
    })
    return m
  }, [circuitos_raw, projeto])

  const vms = useMemo(() =>
    buildAllViewModels(
      (circuitos_raw as any[]).filter(r => r.tipo !== 'RESERVA'),
      pipelineMap,
      projeto.du_max_pct ?? 4
    ),
    [circuitos_raw, pipelineMap, projeto.du_max_pct]
  )

  // ── Coletar todos os itens de auditoria ──────────────────────
  const itens: ItemAuditoria[] = useMemo(() => {
    const lista: ItemAuditoria[] = []

    // 1. Circuitos: proteção funcional
    for (const vm of vms) {
      const r = vm.resultado
      if (!r) continue

      // Proteção não funcional — CRÍTICO
      if (r.comprimento_max_m != null && r.comprimento_max_m < vm.comprimento_m) {
        // Gerar fix automático para a melhor sugestão
        const best = vm.sugestoes_correcao.find(s => s.tipo === 'AUMENTAR_SECAO' || s.tipo === 'TROCAR_CURVA')
        lista.push({
          nivel: 'critico', categoria: 'Proteção',
          titulo: `${vm.numero} — Proteção não funcional`,
          detalhe: `Comprimento ${vm.comprimento_m}m excede limite de ${r.comprimento_max_m.toFixed(0)}m para ${r.curva} ${r.in_disj}A`,
          acao: vm.sugestoes_correcao[0]?.descricao,
          norma: 'IEC 60364-4-41 §411.4.4',
          circuito: vm.descricao,
          nav_pagina: 'circuitos',
          nav_circuito: vm.id,
          fix: best ? {
            circuito_id: vm.id,
            override_secao: best.tipo === 'AUMENTAR_SECAO'
              ? Number(best.parametros_depois['secao_mm2']) : undefined,
            override_curva: best.tipo === 'TROCAR_CURVA'
              ? String(best.parametros_depois['curva']) as 'B'|'C'|'D' : undefined,
            motivo: `Aplicado pela Auditoria: ${best.descricao}`,
          } : undefined,
        })
      }

      // Curva inadequada — ATENÇÃO
      if (r.curva_adequada === false) {
        lista.push({
          nivel: 'atencao', categoria: 'Proteção',
          titulo: `${vm.numero} — Curva ${r.curva} pode causar disparo intempestivo`,
          detalhe: r.justificativa_curva ?? 'Verificar compatibilidade da curva com a carga',
          norma: 'IEC 60898-1',
          circuito: vm.descricao,
        })
      }

      // Violações normativas — CRÍTICO ou ATENÇÃO
      for (const v of vm.violacoes) {
        const nivel = v.mensagem.toLowerCase().includes('bloq') ? 'critico' : 'atencao'
        lista.push({
          nivel, categoria: 'NBR 5410',
          titulo: v.titulo,
          detalhe: v.mensagem,
          acao: v.acao,
          norma: v.codigo,
          circuito: vm.descricao,
          nav_pagina: 'circuitos',
          nav_circuito: vm.id,
        })
      }

      // Fator de segurança baixo — SUGESTÃO
      if (r.fator_seguranca != null && r.fator_seguranca > 0 && r.fator_seguranca < 1.5) {
        lista.push({
          nivel: 'sugestao', categoria: 'Margem',
          titulo: `${vm.numero} — Margem de proteção baixa (${r.fator_seguranca.toFixed(1)}×)`,
          detalhe: 'Fator de segurança abaixo de 1.5 — considere aumentar a seção',
          circuito: vm.descricao,
        })
      }
    }

    // 2. Balanceamento de fases — ATENÇÃO se desequilíbrio > 20%
    if (vms.length > 0) {
      const carga_fase = { R: 0, S: 0, T: 0 } as Record<string, number>
      for (const vm of vms) {
        const f = String(vm.fase).charAt(0)
        if (f in carga_fase && vm.resultado) {
          carga_fase[f] += vm.resultado.secao_mm2 > 0 ? (vm.params.potencia_va ?? 0) : 0
        }
      }
      const vals = Object.values(carga_fase)
      const media = vals.reduce((s, v) => s + v, 0) / 3
      if (media > 0) {
        const deseq = Math.max(...vals.map(v => Math.abs(v - media))) / media * 100
        if (deseq > 20) {
          lista.push({
            nivel: 'atencao', categoria: 'Balanceamento',
            titulo: `Desequilíbrio de fases: ${deseq.toFixed(0)}%`,
            detalhe: `R=${(carga_fase.R/1000).toFixed(1)}kVA · S=${(carga_fase.S/1000).toFixed(1)}kVA · T=${(carga_fase.T/1000).toFixed(1)}kVA`,
            acao: 'Redistribuir circuitos entre as fases na página Balanceamento',
            norma: 'NBR 5410',
          })
        }
      }
    }

    // 3. Cômodos — §9 NBR 5410
    const violacoesNBR9 = verificarProjetoNBR9(comodos)
    for (const { comodo_nome, violacoes } of violacoesNBR9) {
      for (const v of violacoes) {
        lista.push({
          nivel: 'atencao', categoria: 'Terminais',
          titulo: v.descricao.split(':')[0] || v.descricao,
          detalhe: v.descricao,
          norma: v.norma,
          comodo: comodo_nome,
        })
      }
    }

    // 4. Sugestões proativas
    // Circuitos TUG com potência alta → sugerir TUE dedicado
    for (const vm of vms) {
      if (vm.tipo === 'TUG' && vm.params.potencia_va > 1500) {
        lista.push({
          nivel: 'sugestao', categoria: 'Circuitos',
          titulo: `${vm.numero} — Carga ${(vm.params.potencia_va/1000).toFixed(1)}kVA em circuito TUG`,
          detalhe: 'Cargas acima de 1500VA se beneficiam de circuito TUE dedicado (menor queda, melhor proteção)',
          acao: 'Considerar criar circuito TUE exclusivo para esta carga',
          norma: 'NBR 5410 §9.5.4',
          circuito: vm.descricao,
        })
      }
    }

    return lista
  }, [vms, comodos])

  // ── Contadores por nível ──────────────────────────────────────
  const n_critico  = itens.filter(i => i.nivel === 'critico').length
  const n_atencao  = itens.filter(i => i.nivel === 'atencao').length
  const n_sug      = itens.filter(i => i.nivel === 'sugestao').length
  const aprovado   = n_critico === 0 && n_atencao === 0

  // ── Agrupar por categoria ─────────────────────────────────────
  if (vms.length === 0) {
    return (
      <div className="page" style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Nenhum circuito para auditar</div>
          <div style={{ fontSize: 12 }}>Adicione cômodos e circuitos para iniciar a auditoria.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* ── Veredicto ─────────────────────────────────────────── */}
      <div style={{
        padding: '16px 20px', borderRadius: 10, marginBottom: 16,
        background: aprovado ? 'var(--green-dim)' : n_critico > 0 ? 'var(--red-dim)' : 'var(--amber-dim)',
        border: `1.5px solid ${aprovado ? 'var(--green)' : n_critico > 0 ? 'var(--red)' : 'var(--amber)'}`,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 28 }}>{aprovado ? '✅' : n_critico > 0 ? '⛔' : '⚠'}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15,
            color: aprovado ? 'var(--green)' : n_critico > 0 ? 'var(--red)' : 'var(--amber)' }}>
            {aprovado
              ? 'Projeto aprovado — todos os critérios normativos atendidos'
              : n_critico > 0
              ? `${n_critico} problema${n_critico > 1 ? 's' : ''} crítico${n_critico > 1 ? 's' : ''} — não entregar sem corrigir`
              : `${n_atencao} item${n_atencao > 1 ? 's' : ''} para revisar antes da entrega`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            {n_critico > 0 && `⛔ ${n_critico} crítico${n_critico>1?'s':''} · `}
            {n_atencao > 0 && `⚠ ${n_atencao} atenção · `}
            {n_sug > 0 && `💡 ${n_sug} sugestão${n_sug>1?'ões':''} · `}
            {vms.length} circuitos analisados
          </div>
        </div>
      </div>

      {/* ── Itens por nível de prioridade ─────────────────────── */}
      {(['critico', 'atencao', 'sugestao'] as const).map(nivel => {
        const nivel_itens = itens.filter(i => i.nivel === nivel)
        if (nivel_itens.length === 0) return null
        const cor = CORES[nivel]
        const icone = ICONES[nivel]
        const labels = { critico: 'CRÍTICOS', atencao: 'ATENÇÃO', sugestao: 'SUGESTÕES' }

        return (
          <div key={nivel} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.06em',
              color: cor.txt, marginBottom: 8, textTransform: 'uppercase' }}>
              {icone} {labels[nivel]} ({nivel_itens.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nivel_itens.map((item, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: cor.bg, borderLeft: `3px solid ${cor.borda}`,
                  cursor: item.nav_pagina ? 'pointer' : 'default',
                  transition: 'opacity .15s',
                }}
                  onClick={() => {
                    if (item.nav_pagina) {
                      if (item.nav_circuito) setCircuitoFoco(item.nav_circuito)
                      setPagina(item.nav_pagina)
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: cor.txt }}>
                      {item.titulo}
                      {item.nav_pagina && <span style={{ fontSize: 10, marginLeft: 6, opacity: .7 }}>→ ver</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 8, whiteSpace: 'nowrap' }}>
                      {item.categoria}
                      {item.circuito && ` · ${item.circuito}`}
                      {item.comodo && ` · ${item.comodo}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{item.detalhe}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {item.acao && (
                      <div style={{ fontSize: 10, color: cor.txt, fontStyle: 'italic' }}>→ {item.acao}</div>
                    )}
                    {item.fix && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          applyFix(item.fix!)
                        }}
                        style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                          background: cor.borda, color: '#fff', border: 'none', fontWeight: 600,
                        }}>
                        ✓ Aplicar correção
                      </button>
                    )}
                  </div>
                  {item.norma && (
                    <div style={{ fontSize: 9, color: 'var(--text4)', marginTop: 3 }}>{item.norma}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {historico.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => setShowTimeline(s => !s)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 0',
              fontSize:11, color:'var(--text3)', fontWeight:600, letterSpacing:'.06em',
              textTransform:'uppercase', display:'flex', alignItems:'center', gap:6 }}>
            🕐 HISTÓRICO DE DECISÕES ({historico.length})
            <span style={{ fontSize:10 }}>{showTimeline ? '▲' : '▼'}</span>
          </button>
          {showTimeline && (
            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
              {[...historico].reverse().map(entry => (
                <div key={entry.id} style={{
                  display:'flex', gap:10, padding:'6px 10px',
                  borderRadius:6, background:'var(--surface2)', fontSize:11 }}>
                  <div style={{ color:'var(--text4)', whiteSpace:'nowrap', fontFamily:'var(--mono)', fontSize:10 }}>
                    {new Date(entry.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                  <div style={{ color: entry.tipo==='override' ? 'var(--blue)' : 'var(--text3)' }}>
                    {entry.tipo==='override' ? '✏' : '📋'}{' '}{entry.descricao}
                    {entry.autor && <span style={{color:'var(--text4)'}}> — {entry.autor}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Checklist de entrega ──────────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.06em',
          color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase' }}>
          Checklist de Emissão
        </div>
        {[
          { ok: n_critico === 0,                      label: 'Sem erros críticos de segurança' },
          { ok: n_atencao === 0,                      label: 'Todos os critérios NBR 5410 atendidos' },
          { ok: vms.every(v => v.resultado?.icc_ok !== false), label: 'Proteção contra curto-circuito verificada' },
          { ok: vms.every(v => v.resultado?.du_ok !== false),  label: 'Queda de tensão dentro do limite' },
          { ok: vms.some(v => v.resultado?.idr),              label: 'IDR presente em áreas molhadas' },
          { ok: vms.length > 0,                       label: 'Pelo menos 1 circuito dimensionado' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 8px',
            borderRadius: 6, marginBottom: 4,
            background: item.ok ? 'var(--green-dim)' : 'var(--surface2)',
          }}>
            <span style={{ fontSize: 14, minWidth: 20 }}>{item.ok ? '✅' : '◻'}</span>
            <span style={{ fontSize: 12, color: item.ok ? 'var(--text)' : 'var(--text3)' }}>
              {item.label}
            </span>
          </div>
        ))}
        {aprovado && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: 'var(--green-dim)', border: '1.5px solid var(--green)',
            textAlign: 'center', fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>
            ✅ Projeto apto para emissão — pode gerar memorial e ART
          </div>
        )}
      </div>
    </div>
  )
}
