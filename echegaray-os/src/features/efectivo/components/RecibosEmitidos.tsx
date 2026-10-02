'use client'

// RECIBOS EMITIDOS — los recibos de pago en efectivo a terceros, el último primero (dueño, 02/10/2026).
//
// Dos acciones y ninguna más: «Volver a imprimir» (el mismo PDF, de la foto guardada) y «Anular» con motivo.
// Un recibo no se borra ni se renumera: anulado queda en la lista, tachado, con el motivo a la vista.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { pesos } from '../logica/entregas'
import { fechaImpresa } from '../logica/reciboPago'
import { anularReciboPagoAction } from '../services/reciboPagoAcciones'
import type { ReciboEmitido } from '../services/reciboPagoDatos'
import { ErrorPanel } from './Piezas'
import { MONO, V, botonClaro, botonPeligro, campo, eyebrow } from './estilo'

export function RecibosEmitidos({ recibos }: { recibos: ReciboEmitido[] }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="recibos-emitidos">
      <div style={eyebrow}>Recibos emitidos</div>
      {recibos.length === 0 ? (
        <div style={{ fontSize: '13px', color: V.apagado }}>Todavía no se emitió ningún recibo de pago.</div>
      ) : (
        <div style={{ border: `1px solid ${V.linea}`, borderRadius: 10, overflow: 'hidden' }}>
          {recibos.map((r, i) => <Renglon key={r.id} r={r} primero={i === 0} />)}
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
  const tachado = r.anulado ? { textDecoration: 'line-through', color: V.tenue } : undefined

  const anular = () => empezar(async () => {
    const x = await anularReciboPagoAction({ id: r.id, motivo })
    if (!x.ok) { setError(x.error); return }
    setAnulando(false)
    router.refresh()
  })

  return (
    <div style={{ padding: '10px 14px', borderTop: primero ? 0 : `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column', gap: 6 }} data-testid={`recibo-${r.codigo}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: '13px' }}>
        <span style={{ fontFamily: MONO, fontSize: '12px', ...tachado }}>{r.codigo}</span>
        <span style={{ color: V.apagado, ...tachado }}>{fechaImpresa(r.fecha)}</span>
        <span style={{ fontWeight: 500, ...tachado }}>{r.aNombreDe}</span>
        <span style={{ fontFamily: MONO, ...tachado }}>{pesos(r.importe)}</span>
        <span style={{ color: V.tintaSuave, flex: '1 1 180px', minWidth: 0, ...tachado }}>{r.concepto}</span>
        <span style={{ display: 'inline-flex', gap: 8, marginLeft: 'auto' }}>
          <a href={`/administracion/compras/recibo-pago/${r.id}`} target="_blank" rel="noopener" style={botonClaro} data-testid="recibo-reimprimir">
            Volver a imprimir
          </a>
          {!r.anulado && !anulando && (
            <button type="button" onClick={() => setAnulando(true)} style={botonClaro} data-testid="recibo-anular">Anular</button>
          )}
        </span>
      </div>
      {r.anulado && (
        <div style={{ fontSize: '12px', color: V.neg }}>Anulado{r.anuladoMotivo ? `: ${r.anuladoMotivo}` : ''}</div>
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
