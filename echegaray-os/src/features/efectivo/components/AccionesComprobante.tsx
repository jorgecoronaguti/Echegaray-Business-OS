'use client'

// OBSERVAR Y DESCARTAR UN TICKET — lo único que la web hace sobre un comprobante rendido (D04 y D05).
//
// El ticket NO espera aprobación: el worker de la VM lo carga solo a Compras (dueño, 22/09/2026). Por eso
// acá no hay «imputar»: se pide el dato que falta (queda observado con el motivo) o se descarta lo que no
// rinde nada. Corregir una fila ya cargada se hace en Compras, que es la verdad del gasto.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { descartarComprobanteAction, observarComprobanteAction } from '../services/acciones'
import { ErrorPanel } from './Piezas'
import { V, areaTexto, botonClaroGrande, botonOscuro, botonPeligro, campo } from './estilo'

/** «Observar y pedir el dato»: el botón abre el campo; el pedido queda escrito en el ticket. */
export function ObservarComprobante({ id, abierto: abiertoInicial = false, persona, grande = true }: {
  id: string; abierto?: boolean; persona: string; grande?: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [falta, setFalta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={grande ? botonClaroGrande : { ...botonOscuro, height: 30, padding: '0 12px', fontSize: '12.5px' }} data-testid="observar-abrir">
        Observar y pedir el dato
      </button>
    )
  }
  const pedir = () => empezar(async () => {
    const r = await observarComprobanteAction({ id, falta })
    if (!r.ok) { setError(r.error); return }
    setFalta('')
    setAbierto(abiertoInicial)
    router.refresh()
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <textarea
        value={falta} onChange={(e) => { setFalta(e.target.value); setError(null) }} rows={2} maxLength={400}
        placeholder={`Qué le falta a este ticket (se lo pide a ${persona})`} style={areaTexto} aria-label="Qué falta" data-testid="observar-texto"
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={pedir} disabled={pendiente || !falta.trim()} style={{ ...botonOscuro, height: 30, padding: '0 12px', fontSize: '12.5px', opacity: pendiente || !falta.trim() ? 0.6 : 1 }} data-testid="observar-pedir">
          {pendiente ? 'Pidiendo…' : 'Pedir el dato'}
        </button>
        {!abiertoInicial && <button type="button" onClick={() => setAbierto(false)} style={{ fontSize: '12.5px', color: V.apagado }}>Cancelar</button>}
      </div>
      <ErrorPanel texto={error} />
    </div>
  )
}

/**
 * LA FOTO DEL TICKET — `D04`, el costado oscuro. Rotar gira la imagen acá (no toca el archivo); Ampliar la
 * abre sola en otra pestaña. Un PDF no se dibuja: se abre.
 */
export function FotoDelTicket({ url, esPdf, rotulo, pie }: { url: string | null; esPdf: boolean; rotulo: string; pie: string }) {
  const [giro, setGiro] = useState(0)
  const boton = { height: 30, padding: '0 12px', border: '1px solid #454543', borderRadius: 6, display: 'inline-flex', alignItems: 'center', color: '#FFFFFF', fontSize: '12.5px' } as const
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 420, borderRadius: 8, background: '#2A2A28', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: V.tenue, overflow: 'hidden' }}>
        {url && !esPdf ? (
          // eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage que vence a los 10 minutos: el optimizador de Next no puede cachearlo
          <img src={url} alt={rotulo} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `rotate(${giro}deg)`, transition: 'transform .15s' }} data-testid="foto-ticket" />
        ) : (
          <span style={{ fontSize: '12.5px' }}>{url ? 'El comprobante es un PDF: abrilo con «Ampliar».' : 'No hay archivo para mostrar.'}</span>
        )}
        <span style={{ fontSize: '12.5px' }}>{rotulo}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '12.5px' }}>
        {!esPdf && <button type="button" onClick={() => setGiro((g) => (g + 90) % 360)} style={boton} disabled={!url}>Rotar</button>}
        {url && <a href={url} target="_blank" rel="noreferrer" style={boton}>Ampliar</a>}
        <span style={{ marginLeft: 'auto', color: V.tenue }}>{pie}</span>
      </div>
    </div>
  )
}

/** «Descartar»: con motivo. La base no deja descartar lo que ya está en Compras. */
export function DescartarComprobante({ id, alTerminar }: { id: string; alTerminar: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} style={botonPeligro} data-testid="descartar-abrir">Descartar</button>
  }
  const descartar = () => empezar(async () => {
    const r = await descartarComprobanteAction({ id, motivo })
    if (!r.ok) { setError(r.error); return }
    router.push(alTerminar, { scroll: false })
  })
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se descarta" maxLength={400} style={{ ...campo, height: 34, width: 220 }} aria-label="Motivo del descarte" data-testid="descartar-motivo" />
      <button type="button" onClick={descartar} disabled={pendiente || !motivo.trim()} style={{ ...botonPeligro, height: 34 }} data-testid="descartar-confirmar">
        {pendiente ? 'Descartando…' : 'Descartar'}
      </button>
      <button type="button" onClick={() => setAbierto(false)} style={{ fontSize: '12.5px', color: V.apagado }}>Cancelar</button>
      <ErrorPanel texto={error} />
    </span>
  )
}
