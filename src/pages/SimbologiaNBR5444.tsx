// src/pages/SimbologiaNBR5444.tsx
// ════════════════════════════════════════════════════════════════
// Legenda de símbolos elétricos — NBR 5444
//
// NÃO é ferramenta de desenho. O programa nunca desenha a planta —
// isso é feito pelo projetista no CAD. Esta página é referência
// consultiva: mostra o símbolo oficial, a altura de instalação, o
// tipo de caixa e a citação exata da norma, para o profissional ter
// ao lado enquanto desenha manualmente no AutoCAD — sem precisar
// abrir o PDF da NBR 5444 à parte.
// ════════════════════════════════════════════════════════════════
import { SIMBOLOS_NBR5444, PALETA_SIMBOLOS, COR_CIRCUITO } from '../core/nbr5444'
import type { TipoPontoEletrico } from '../types/geometry'

const CAIXA_LABEL: Record<string, string> = {
  '4x2': 'Caixa 4×2"', '4x4': 'Caixa 4×4"', octogonal: 'Caixa octogonal',
  passagem: 'Caixa de passagem', nenhuma: 'Sem caixa embutida',
}

function CartaoSimbolo({ tipo }: { tipo: TipoPontoEletrico }) {
  const s = SIMBOLOS_NBR5444[tipo]
  if (!s) return null
  const compat = s.regras.circuitos_compativeis

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '18px 12px', background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--border)', height: 96,
      }}>
        <svg viewBox="-0.15 -0.15 0.3 0.3" width={64} height={64}
          style={{ overflow: 'visible' }}>
          <path d={s.path} fill="none" stroke="var(--text)" strokeWidth={0.006}
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{s.nome}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.4 }}>{s.descricao}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4,
          borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
            <span style={{ color: 'var(--text4)' }}>Altura de instalação</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)' }}>
              {s.regras.altura_m > 0 ? `${s.regras.altura_m.toFixed(2)}m` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
            <span style={{ color: 'var(--text4)' }}>Caixa</span>
            <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{CAIXA_LABEL[s.regras.caixa]}</span>
          </div>
          {s.regras.dist_min_m > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
              <span style={{ color: 'var(--text4)' }}>Distância mínima</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)' }}>
                {s.regras.dist_min_m}m
              </span>
            </div>
          )}
          {compat.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {compat.map(c => (
                <span key={c} className="badge" style={{
                  background: `${COR_CIRCUITO[c] ?? 'var(--text4)'}18`,
                  color: COR_CIRCUITO[c] ?? 'var(--text4)',
                }}>{c}</span>
              ))}
            </div>
          )}
        </div>

        {s.regras.referencia_nbr && (
          <div style={{
            fontSize: 9.5, color: 'var(--gold-dark)', background: 'var(--gold-dim)',
            padding: '5px 8px', borderRadius: 6, marginTop: 4, lineHeight: 1.4,
          }}>
            📖 {s.regras.referencia_nbr}
          </div>
        )}
      </div>
    </div>
  )
}

export function SimbologiaNBR5444() {
  return (<>
    <div className="page-header">
      <div>
        <div className="page-title">Legenda de Símbolos Elétricos</div>
        <div className="page-sub">NBR 5444 — referência para desenho no CAD, não editável aqui</div>
      </div>
    </div>

    <div className="page-scroll">
      <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div className="toast-bar info" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📖</span>
          <span>
            Esta tela não desenha nada — é consulta. Use como referência rápida da
            simbologia oficial (altura de instalação, tipo de caixa, distância mínima
            e o item exato da norma) enquanto você desenha a planta no AutoCAD.
          </span>
        </div>

        {PALETA_SIMBOLOS.map(grupo => (
          <div key={grupo.grupo}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              {grupo.grupo}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {grupo.simbolos.map(tipo => <CartaoSimbolo key={tipo} tipo={tipo} />)}
            </div>
          </div>
        ))}

      </div>
    </div>
  </>)
}
