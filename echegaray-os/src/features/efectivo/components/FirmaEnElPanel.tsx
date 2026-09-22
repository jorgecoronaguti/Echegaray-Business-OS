'use client'

// LA FIRMA DE QUIEN RECIBE EL VUELTO — el recuadro del panel D06.
//
// ═══ POR QUÉ SE FIRMA ACÁ Y NO DESPUÉS ═══
//
// El diseño de D06 promete «el comprobante de devolución con las dos firmas». Quien aprieta «Registrar y
// cerrar» ES quien está recibiendo el efectivo, con la persona enfrente: si la firma se pidiera en un
// segundo paso, nadie vuelve y el comprobante queda sin firmar para siempre. La otra firma —la de quien
// devuelve— es del teléfono de esa persona, igual que la conformidad de D02.
//
// SIN LIBRERÍA: un `<canvas>` con pointer events. Lo que viaja a la base es el SVG que arma
// `shared/firma/firma.ts`, no una imagen del canvas —que pesaría diez veces más y dependería de la
// densidad de la pantalla—. `touch-action: none` evita que el dedo, en vez de firmar, corra la página.

import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { firmaValida, svgDeFirma, type Trazo } from '@/shared/firma/firma'
import { V, eyebrow } from './estilo'

export function FirmaEnElPanel({ rotulo, onCambio }: { rotulo: string; onCambio: (svg: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)
  const [hay, setHay] = useState(false)

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
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = V.tinta
    for (const t of trazos.current) {
      ctx.beginPath()
      t.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
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
    return {
      x: Math.max(0, Math.min(caja.width, e.clientX - caja.left)),
      y: Math.max(0, Math.min(caja.height, e.clientY - caja.top)),
    }
  }

  const avisar = () => {
    const ok = firmaValida(trazos.current)
    setHay(ok)
    // NUNCA UN SVG DE UN TOQUE SUELTO: `firmaValida` es lo que distingue una firma de un punto.
    const caja = lienzo.current?.getBoundingClientRect()
    onCambio(ok && caja ? svgDeFirma(trazos.current, caja.width, caja.height) : null)
  }

  const limpiar = () => { trazos.current = []; ajustar(); avisar() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="firma-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={eyebrow}>{rotulo}</span>
        {hay && (
          <button type="button" onClick={limpiar} style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.apagado }} data-testid="firma-limpiar">
            borrar
          </button>
        )}
      </div>
      <canvas
        ref={lienzo}
        style={{ width: '100%', height: 86, border: `1px solid ${hay ? V.grafito : V.lineaFuerte}`, borderRadius: 6, background: '#FFFFFF', touchAction: 'none', cursor: 'crosshair' }}
        data-testid="firma-lienzo"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dibujando.current = true; trazos.current.push([punto(e)]) }}
        onPointerMove={(e) => {
          if (!dibujando.current) return
          const actual = trazos.current[trazos.current.length - 1]
          const p = punto(e)
          const previo = actual[actual.length - 1]
          actual.push(p)
          const ctx = e.currentTarget.getContext('2d')
          if (!ctx) return
          ctx.beginPath(); ctx.moveTo(previo.x, previo.y); ctx.lineTo(p.x, p.y); ctx.stroke()
        }}
        onPointerUp={() => { dibujando.current = false; avisar() }}
        onPointerCancel={() => { dibujando.current = false; avisar() }}
      />
    </div>
  )
}
