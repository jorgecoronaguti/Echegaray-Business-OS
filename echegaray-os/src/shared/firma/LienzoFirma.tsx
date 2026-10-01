'use client'

// EL RECUADRO PARA FIRMAR — una sola vez, para la conformidad de la entrega y para el recibo del gasto manual.
//
// ═══ SIN LIBRERÍA DE FIRMA ═══
//
// Un `<canvas>` con pointer events alcanza: el dedo (o el mouse) dibuja, se guardan los puntos, y lo que viaja
// a la base es el SVG que arma `firma.ts` (no una imagen del canvas, que pesaría diez veces más y dependería
// de la densidad de la pantalla). `touch-action: none` es lo que evita que el dedo, en vez de firmar,
// desplace la página.
//
// Avisa por `onCambio` con el SVG listo cuando hay una firma de verdad (`firmaValida`, no cualquier toque) y
// con `null` cuando no la hay: quien lo usa decide cuándo se enciende su botón. `reinicio` borra el recuadro
// cada vez que cambia de valor (el botón «Rehacer» vive afuera, porque en cada pantalla es otro botón).

import { useCallback, useEffect, useRef, type PointerEvent as EventoPuntero } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { svgDeFirma, type Trazo } from './firma'

export function LienzoFirma({ onCambio, reinicio = 0, minAlto = 260, testid = 'lienzo-firma' }: {
  onCambio: (svg: string | null) => void
  reinicio?: number
  minAlto?: number
  testid?: string
}) {
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)

  // El canvas se dimensiona a su caja real × densidad de pantalla: si no, la firma sale borrosa y
  // corrida respecto del dedo.
  const ajustar = useCallback(() => {
    const c = lienzo.current
    if (!c) return
    const caja = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(caja.width * dpr)
    c.height = Math.round(caja.height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C.ink
    for (const t of trazos.current) {
      if (!t.length) continue
      ctx.beginPath()
      ctx.moveTo(t[0].x, t[0].y)
      for (const p of t.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [ajustar])

  // `reinicio` en 0 es el estado de montaje: no hay nada que borrar ni que avisar.
  useEffect(() => {
    if (!reinicio) return
    trazos.current = []
    ajustar()
    onCambio(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambia `reinicio`
  }, [reinicio])

  const punto = (e: EventoPuntero<HTMLCanvasElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(caja.width, e.clientX - caja.left)),
      y: Math.max(0, Math.min(caja.height, e.clientY - caja.top)),
    }
  }

  const empezar = (e: EventoPuntero<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dibujando.current = true
    trazos.current.push([punto(e)])
  }

  const mover = (e: EventoPuntero<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    const actual = trazos.current[trazos.current.length - 1]
    const p = punto(e)
    const previo = actual[actual.length - 1]
    actual.push(p)
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(previo.x, previo.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const terminar = () => {
    dibujando.current = false
    const caja = lienzo.current?.getBoundingClientRect()
    // NUNCA UN SVG DE UN TOQUE SUELTO: `svgDeFirma` devuelve null si no es firma o si se pasa del tope.
    onCambio(caja ? svgDeFirma(trazos.current, caja.width, caja.height) : null)
  }

  return (
    <div style={{
      flex: 1, minHeight: minAlto, background: C.surface, border: `1px solid ${C.lineaFuerte}`, borderRadius: R.tarjeta,
      position: 'relative', overflow: 'hidden',
    }}>
      <canvas
        ref={lienzo}
        data-testid={testid}
        aria-label="Recuadro para firmar con el dedo"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
      />
      <div style={{ position: 'absolute', bottom: 18, left: 24, right: 24, borderBottom: `1px solid ${C.linea}`, pointerEvents: 'none' }} />
      <div style={{
        position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: C.faint,
        pointerEvents: 'none',
      }}>
        firmá arriba de la línea
      </div>
    </div>
  )
}
