'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { firmaValida, svgDeFirma, type Trazo } from '@/shared/firma/firma'
import { firmarConformidadAction } from '../acciones'
import { Contorno, Primario } from './Piezas'

// M02 · FIRMAR LA CONFORMIDAD — el recuadro para firmar con el dedo, y sus dos botones.
//
// ═══ SIN LIBRERÍA DE FIRMA ═══
//
// Un `<canvas>` con pointer events alcanza: el dedo dibuja, se guardan los puntos, y lo que viaja a la
// base es el SVG que arma `firma.ts` (no una imagen del canvas, que pesaría diez veces más y dependería
// de la densidad de la pantalla). `touch-action: none` es lo que evita que el dedo, en vez de firmar,
// desplace la página.
//
// «Confirmar» se enciende cuando hay una firma de verdad (`firmaValida`), no con cualquier toque.

export function FirmarConformidad({ entrega, volverA }: { entrega: string; volverA: string }) {
  const router = useRouter()
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)
  const [valida, setValida] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    redibujar(ctx, trazos.current)
  }, [])

  useEffect(() => {
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [ajustar])

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
    const r = await firmarConformidadAction({ entrega, trazo: svg })
    if (!r.ok) { setEnviando(false); setError(r.error); return }
    router.replace(volverA)
    router.refresh()
  }

  return (
    <>
      <div style={{
        flex: 1, minHeight: 260, background: C.surface, border: `1px solid ${C.lineaFuerte}`, borderRadius: R.tarjeta,
        position: 'relative', overflow: 'hidden',
      }}>
        <canvas
          ref={lienzo}
          data-testid="lienzo-firma"
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
      {error && <div data-testid="firma-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1 }}><Contorno onClick={rehacer} activo={!enviando} testid="firma-rehacer">Rehacer</Contorno></div>
        <div style={{ flex: 1.4 }}>
          <Primario alto={52} activo={valida && !enviando} onClick={confirmar} testid="firma-confirmar">
            {enviando ? 'Guardando…' : 'Confirmar'}
          </Primario>
        </div>
      </div>
    </>
  )
}

function redibujar(ctx: CanvasRenderingContext2D, trazos: readonly Trazo[]) {
  for (const t of trazos) {
    if (!t.length) continue
    ctx.beginPath()
    ctx.moveTo(t[0].x, t[0].y)
    for (const p of t.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
}
