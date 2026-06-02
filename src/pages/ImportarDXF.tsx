// src/pages/ImportarDXF.tsx
// ════════════════════════════════════════════════════════════════
// TELA DE REVISÃO DE IMPORTAÇÃO DXF
// Redundância: o engenheiro revisa ANTES de confirmar
// ════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback } from 'react'
import { importarDXF, converterParaComodo } from '../core/dxfImporter'
import type { ComodoDetectado } from '../core/dxfImporter'
import { useProjectStore } from '../store/projectStore'

const TIPOS_COMODO = ['Social','Cozinha','Banho','Lavanderia','Garagem','Externo'] as const

export default function ImportarDXF() {
  const { addComodo, setPagina } = useProjectStore()

  const [etapa, setEtapa]         = useState<'upload'|'revisao'|'ok'>('upload')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro]           = useState<string|null>(null)
  const [avisos, setAvisos]       = useState<string[]>([])
  const [comodos, setComodos]     = useState<ComodoDetectado[]>([])
  const [escala_mm, setEscalaMm]  = useState('1')  // mm por unidade DXF
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Upload e parse ─────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setCarregando(true)
    setErro(null)
    try {
      const texto = await file.text()
      const resultado = await importarDXF(texto, parseFloat(escala_mm) || 1)
      setComodos(resultado.comodos)
      setAvisos(resultado.avisos)
      setEtapa('revisao')
    } catch (e) {
      setErro('Erro ao ler o DXF: ' + String(e))
    } finally {
      setCarregando(false)
    }
  }, [escala_mm])

  // ── Confirmar e importar para o projeto ────────────────────────
  function confirmar() {
    const confirmados = comodos.filter(c => c.confirmado)
    confirmados.forEach(c => addComodo(converterParaComodo(c, (c as any).tipo_manual ?? 'Social') as any))
    setEtapa('ok')
    setTimeout(() => setPagina('comodos'), 1500)
  }

  // ── Upload ──────────────────────────────────────────────────────
  if (etapa === 'upload') return (
    <div className="page" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="card">
        <div className="card-header">📐 Importar planta DXF</div>
        <div style={{ padding: 24 }}>

          <div style={{ marginBottom: 16 }}>
            <div className="flabel">Escala do DXF</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
              Quantos milímetros equivale a 1 unidade no arquivo DXF?
              (Padrão: 1mm = 1 unidade. Para metros: use 1000)
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="finput" type="number" value={escala_mm}
                onChange={e => setEscalaMm(e.target.value)}
                style={{ width: 100 }} min={0.001} step={0.001} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>mm por unidade</span>
            </div>
          </div>

          <div
            style={{
              border: '2px dashed var(--border)', borderRadius: 10,
              padding: 40, textAlign: 'center', cursor: 'pointer',
              background: 'var(--surface2)',
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Arraste o arquivo DXF aqui
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              ou clique para selecionar
            </div>
            <button className="btn primary" disabled={carregando}>
              {carregando ? 'Processando...' : 'Selecionar arquivo DXF'}
            </button>
            <input ref={inputRef} type="file" accept=".dxf" style={{ display:'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          {erro && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--red-dim)',
              borderRadius: 8, color: 'var(--red)', fontSize: 12 }}>
              {erro}
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text4)' }}>
            💡 Dica: peça ao arquiteto o arquivo em DXF (AutoCAD: Arquivo → Salvar como → DXF)
          </div>
        </div>
      </div>
    </div>
  )

  // ── Revisão ─────────────────────────────────────────────────────
  if (etapa === 'revisao') return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="card">
        <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>✅ Revisão — {comodos.filter(c=>c.confirmado).length} de {comodos.length} cômodos detectados</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={() => setEtapa('upload')}>← Voltar</button>
            <button className="btn primary"
              onClick={confirmar}
              disabled={comodos.filter(c=>c.confirmado).length === 0}>
              Confirmar e importar →
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {avisos.length > 0 && (
            <div style={{ marginBottom: 12, padding: 10, background: 'var(--amber-dim)',
              borderRadius: 8, fontSize: 11, color: 'var(--amber)' }}>
              {avisos.map((a,i) => <div key={i}>⚠ {a}</div>)}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
            Verifique os cômodos detectados. Edite os nomes, tipos ou desmarque os que não devem ser importados.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {comodos.map((c, i) => (
              <div key={c.id} style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 140px 90px 80px 80px 60px',
                gap: 8, alignItems: 'center',
                padding: '8px 10px', borderRadius: 8,
                background: c.confirmado ? 'var(--surface2)' : 'var(--surface3)',
                opacity: c.confirmado ? 1 : 0.5,
                border: `1px solid ${c.confirmado ? 'var(--border)' : 'transparent'}`,
              }}>
                {/* Checkbox */}
                <input type="checkbox" checked={c.confirmado}
                  onChange={e => setComodos(prev => prev.map((x,j) =>
                    j===i ? {...x, confirmado: e.target.checked} : x
                  ))} />

                {/* Nome */}
                <input className="finput" value={c.nome_final}
                  onChange={e => setComodos(prev => prev.map((x,j) =>
                    j===i ? {...x, nome_final: e.target.value} : x
                  ))}
                  style={{ fontSize: 12 }}
                  placeholder="Nome do cômodo" />

                {/* Tipo */}
                <select className="fselect"
                  value={(c as any).tipo_manual ?? 'Social'}
                  onChange={e => setComodos(prev => prev.map((x,j) =>
                    j===i ? {...x, tipo_manual: e.target.value} : x
                  ))}>
                  {TIPOS_COMODO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* Área */}
                <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                  {c.area_m2.toFixed(1)} m²
                </div>

                {/* Perímetro */}
                <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                  {c.perimetro_m.toFixed(1)} m
                </div>

                {/* Layer */}
                <div style={{ fontSize: 9, color: 'var(--text4)', textAlign: 'center',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={c.layer}>
                  {c.layer}
                </div>

                {/* Nome original DXF */}
                <div style={{ fontSize: 9, color: 'var(--text4)', textAlign: 'center',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={c.nome_dxf}>
                  {c.nome_dxf}
                </div>
              </div>
            ))}

            {comodos.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                <div>Nenhum cômodo detectado no DXF.</div>
                <div style={{ fontSize: 11, marginTop: 8 }}>
                  Verifique se o arquivo tem polilínhas fechadas e tente ajustar a escala.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // ── Sucesso ──────────────────────────────────────────────────────
  return (
    <div className="page" style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Importação concluída!</div>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Redirecionando para Cômodos...</div>
    </div>
  )
}
