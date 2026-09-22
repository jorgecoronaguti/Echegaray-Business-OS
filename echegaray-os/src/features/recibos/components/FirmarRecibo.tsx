'use client'

// M10 · FIRMAR EL RECIBO — el recuadro para firmar con el dedo, y sus dos botones.
//
// Mismo lienzo que la conformidad del efectivo (`efectivo/campo/components/FirmarConformidad.tsx`, otra
// rama al 22/09): un `<canvas>` con pointer events, `touch-action: none` para que el dedo firme en vez
// de desplazar la página, y lo que viaja a la base es el SVG de `firma.ts`. Al unificar, queda uno.
// «Confirmar» se enciende con una firma de verdad (`firmaValida`), no con cualquier toque.

import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { firmaValida, svgDeFirma, type Trazo } from '@/shared/firma/firma'
import { firmarReciboAction } from '../acciones'

export function FirmarRecibo({ recibo }: { recibo: string }) {
  const router = useRouter()
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)
  const [valida, setValida] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El canvas se dimensiona a su caja real × densidad de pantalla: si no, la firma sale borrosa y corrida.
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

  const punto = (e: EventoPuntero<HTMLCanvasElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(caja.width, e.clientX - caja.left)), y: Math.max(0, Math.min(caja.height, e.clientY - caja.top)) }
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
    setValida(firmaValida(trazos.current))
  }
  const rehacer = () => {
    trazos.current = []
    setValida(false)
    setError(null)
    const c = lienzo.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }
  const confirmar = async () => {
    const c = lienzo.current
    if (!c) return
    const caja = c.getBoundingClientRect()
    const svg = svgDeFirma(trazos.current, caja.width, caja.height)
    if (!svg) { setError('Firmá arriba de la línea: el trazo es muy corto.'); return }
    setEnviando(true)
    setError(null)
    const r = await firmarReciboAction({ recibo, trazo: svg })
    if (!r.ok) { setEnviando(false); setError(r.error); return }
    router.refresh()
  }

  return (
    <>
      <div style={{ flex: 1, minHeight: 260, background: C.surface, border: `1px solid ${C.lineaFuerte}`, borderRadius: R.tarjeta, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={lienzo} data-testid="lienzo-firma-recibo" aria-label="Recuadro para firmar con el dedo"
          onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }} />
        <div style={{ position: 'absolute', bottom: 18, left: 24, right: 24, borderBottom: `1px solid ${C.linea}`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: C.faint, pointerEvents: 'none' }}>
          firmá arriba de la línea
        </div>
      </div>
      {error && <div data-testid="firma-recibo-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={rehacer} disabled={enviando} data-testid="firma-recibo-rehacer" style={{
          flex: 1, height: 52, borderRadius: R.control, border: `1px solid ${C.lineaFuerte}`, background: C.surface,
          color: C.inkSuave, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer',
        }}>Rehacer</button>
        <button type="button" onClick={confirmar} disabled={!valida || enviando} data-testid="firma-recibo-confirmar" style={{
          flex: 1.4, height: 52, borderRadius: R.control, border: 0, fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
          background: valida && !enviando ? C.marca : C.inerte, color: valida && !enviando ? C.ink : C.faint,
          cursor: valida && !enviando ? 'pointer' : 'default',
        }}>{enviando ? 'Guardando…' : 'Confirmar'}</button>
      </div>
    </>
  )
}
