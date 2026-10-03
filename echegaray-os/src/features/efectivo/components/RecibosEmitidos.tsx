'use client'

// RECIBOS EMITIDOS — los recibos de pago en efectivo a terceros, el último primero (dueño, 02/10/2026).
//
// Dos acciones y ninguna más: «Imprimir» (el mismo PDF, de la foto guardada) y «Anular» con motivo.
// Un recibo no se borra ni se renumera: el anulado sigue existiendo, pero NO en la lista de trabajo.
//
// REDISEÑO (dueño, 03/10/2026, con la captura de diez anulados tachados y su motivo en rojo: «eso es un desastre»).
// Es una TABLA: columnas alineadas, importe a la derecha, concepto en una línea (entero al pasar el cursor). Los
// anulados salen de la vista por defecto —el patrón de todo sistema de facturación: lo anulado es una vista aparte— y
// se abren con «Anulados (n)»: apagados, con la marca «Anulado» y el motivo en una línea gris. Sin tachado, sin rojo:
// el rojo es para un problema por resolver y un recibo bien anulado no lo es.

import { useRouter } from 'next/navigation'
import { useState, useTransition, type CSSProperties } from 'react'
import { pesos } from '../logica/entregas'
import { fechaImpresa, urlDelReciboPago } from '../logica/reciboPago'
import { anularReciboPagoAction } from '../services/reciboPagoAcciones'
import type { ReciboEmitido } from '../services/reciboPagoDatos'
import { ErrorPanel } from './Piezas'
import { MONO, V, botonClaro, botonPeligro, campo, eyebrow } from './estilo'

const COLUMNAS = '96px 84px minmax(140px, 1.2fr) minmax(120px, 2fr) 112px 128px'
const CELDA: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const ACCION: CSSProperties = {
  border: 0, background: 'transparent', padding: 0, fontSize: '12.5px', color: V.tintaSuave, cursor: 'pointer',
  textDecoration: 'underline', textUnderlineOffset: 3,
}

export function RecibosEmitidos({ recibos }: { recibos: ReciboEmitido[] }) {
  const [verAnulados, setVerAnulados] = useState(false)
  const vigentes = recibos.filter((r) => !r.anulado)
  const anulados = recibos.length - vigentes.length
  const visibles = verAnulados ? recibos : vigentes
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="recibos-emitidos">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={eyebrow}>Recibos emitidos · {vigentes.length}</div>
        {anulados > 0 && (
          <button type="button" onClick={() => setVerAnulados((v) => !v)} style={ACCION} aria-pressed={verAnulados} data-testid="recibos-ver-anulados">
            {verAnulados ? 'Ocultar anulados' : `Anulados (${anulados})`}
          </button>
        )}
      </div>
      {visibles.length === 0 ? (
        <div style={{ fontSize: '13px', color: V.apagado }}>Todavía no se emitió ningún recibo de pago.</div>
      ) : (
        <div style={{ border: `1px solid ${V.linea}`, borderRadius: 8, overflowX: 'auto', background: '#FFFFFF' }}>
          <div style={{ minWidth: 760 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, columnGap: 16, padding: '8px 16px', borderBottom: `1px solid ${V.linea}`, ...eyebrow }}>
              <span>N°</span><span>Fecha</span><span>A nombre de</span><span>Concepto</span><span style={{ textAlign: 'right' }}>Importe</span><span />
            </div>
            {visibles.map((r, i) => <Renglon key={r.id} r={r} primero={i === 0} />)}
          </div>
        </div>
      )}
    </section>
  )
}

function Renglon({ r, primero }: { r: ReciboEmitido; primero: boolean }) {
  const router = useRouter()
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const tono = r.anulado ? V.tenue : undefined

  const anular = () => empezar(async () => {
    const x = await anularReciboPagoAction({ id: r.id, motivo })
    if (!x.ok) { setError(x.error); return }
    setAnulando(false)
    router.refresh()
  })

  return (
    <div style={{ padding: '8px 16px', borderTop: primero ? 0 : `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={`recibo-${r.codigo}`}>
      <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, columnGap: 16, alignItems: 'center', fontSize: '13px', minHeight: 24, color: tono }}>
        <span style={{ ...CELDA, fontFamily: MONO, fontSize: '12px' }}>{r.codigo}</span>
        <span style={{ ...CELDA, color: tono ?? V.apagado }}>{fechaImpresa(r.fecha)}</span>
        <span style={{ ...CELDA, fontWeight: r.anulado ? 400 : 500 }} title={r.aNombreDe}>{r.aNombreDe}</span>
        <span style={{ ...CELDA, color: tono ?? V.tintaSuave }} title={r.concepto}>{r.concepto}</span>
        <span style={{ ...CELDA, fontFamily: MONO, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pesos(r.importe)}</span>
        <span style={{ display: 'inline-flex', gap: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
          {r.anulado ? (
            <span style={{ fontSize: '11.5px', color: V.tenue, border: `1px solid ${V.linea}`, borderRadius: 4, padding: '0 6px', lineHeight: '18px' }} data-testid="recibo-anulado">Anulado</span>
          ) : (
            <>
              <a href={urlDelReciboPago(r.id, false)} target="_blank" rel="noopener" style={ACCION} data-testid="recibo-reimprimir">Imprimir</a>
              {!anulando && <button type="button" onClick={() => setAnulando(true)} style={ACCION} data-testid="recibo-anular">Anular</button>}
            </>
          )}
        </span>
      </div>
      {r.anulado && r.anuladoMotivo && (
        <div style={{ ...CELDA, fontSize: '12px', color: V.tenue, paddingLeft: 112 }} title={r.anuladoMotivo}>{r.anuladoMotivo}</div>
      )}
      {anulando && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={motivo} onChange={(e) => { setMotivo(e.target.value); setError(null) }} maxLength={400} autoFocus
            placeholder="Por qué se anula" style={{ ...campo, flex: '1 1 240px' }} aria-label="Motivo de la anulación" data-testid="recibo-anular-motivo"
          />
          <button type="button" onClick={anular} disabled={pendiente} style={{ ...botonPeligro, opacity: pendiente ? 0.6 : 1 }} data-testid="recibo-anular-confirmar">
            {pendiente ? 'Anulando…' : `Anular ${r.codigo}`}
          </button>
          <button type="button" onClick={() => { setAnulando(false); setMotivo(''); setError(null) }} style={botonClaro}>Cancelar</button>
          <ErrorPanel texto={error} />
        </div>
      )}
    </div>
  )
}
