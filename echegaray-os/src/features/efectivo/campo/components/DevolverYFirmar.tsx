'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { MONO, mono } from '@/shared/components/movil/Piezas'
import { firmaValida, svgDeFirma, type Trazo } from '@/shared/firma/firma'
import { declararDevolucionAction } from '../acciones'
import { cifra } from '../logica'
import { Contorno, Pie, Primario, Rotulo } from './Piezas'

// M08 · DEVOLVER EL VUELTO — el monto, a quién, y la firma.
//
// ═══ QUÉ DECLARA ESTE BOTÓN, Y QUÉ NO ═══
//
// Declara que la persona devuelve ese monto y lo firma. NO da la plata por recibida: eso lo hace quien
// la cuenta, desde Administración, y recién ahí baja el saldo. Si bajara acá, declarar sería una forma
// de dejar de deber plata sin moverla de lugar. La pantalla lo dice con esas palabras.
//
// El teclado es `inputMode="numeric"`: en obra, con guantes, el teclado de texto para escribir un
// número es el camino más largo que existe. Sin centavos, porque la plata en la mano tampoco los tiene.

export interface EntregaParaDevolver {
  id: string
  codigo: string
  destino: string
  /** Lo que tiene en la mano de ESTA entrega, ya descontado lo declarado sin recibir. */
  disponible: number
}

export function DevolverYFirmar({ entregas, quienes, volverA }: {
  entregas: readonly EntregaParaDevolver[]
  /** A quién se la puede llevar: `{ id: personaId | null, nombre }`. El primero es el propuesto. */
  quienes: readonly { id: string | null; nombre: string }[]
  volverA: string
}) {
  const router = useRouter()
  const [entregaId, setEntregaId] = useState(entregas[0]?.id ?? '')
  const [quien, setQuien] = useState(quienes[0]?.id ?? null)
  const [monto, setMonto] = useState('')
  const [valida, setValida] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegida = entregas.find((e) => e.id === entregaId) ?? entregas[0] ?? null
  const importe = Number(monto.replace(/\D/g, '')) || 0
  const pasado = !!elegida && importe > elegida.disponible

  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)

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
    return {
      x: Math.max(0, Math.min(caja.width, e.clientX - caja.left)),
      y: Math.max(0, Math.min(caja.height, e.clientY - caja.top)),
    }
  }

  const borrarFirma = () => {
    trazos.current = []
    setValida(false)
    const c = lienzo.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }

  const devolver = async () => {
    const c = lienzo.current
    if (!c || !elegida || enviando) return
    const caja = c.getBoundingClientRect()
    const svg = svgDeFirma(trazos.current, caja.width, caja.height)
    if (!svg) { setError('Firmá arriba de la línea: el trazo es muy corto.'); return }
    setEnviando(true)
    setError(null)
    const r = await declararDevolucionAction({ entrega: elegida.id, monto: importe, trazo: svg, recibidaPor: quien })
    if (!r.ok) { setEnviando(false); setError(r.error); return }
    router.replace(volverA)
    router.refresh()
  }

  if (!elegida) return null

  return (
    <>
      {entregas.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }} data-testid="devolver-de-que-entrega">
          <Rotulo>De qué entrega</Rotulo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entregas.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEntregaId(e.id)}
                aria-pressed={e.id === entregaId}
                style={{
                  minHeight: 52, textAlign: 'left', padding: '0 16px', fontFamily: 'inherit', fontSize: 14.5,
                  background: C.surface, color: C.ink, cursor: 'pointer', borderRadius: R.control,
                  border: `${e.id === entregaId ? 2 : 1}px solid ${e.id === entregaId ? C.marca : C.linea}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}
              >
                <span>{e.codigo} · {e.destino}</span>
                <span style={{ ...mono, fontSize: 13.5, color: C.muted }}>{cifra(e.disponible)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Devuelvo</Rotulo>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: C.surface, borderRadius: R.tarjeta,
          border: `1px solid ${pasado ? C.neg : C.lineaFuerte}`, padding: '10px 16px', minHeight: 60,
        }}>
          <span style={{ ...mono, fontSize: 26, color: C.muted }}>$</span>
          <input
            type="text"
            inputMode="numeric"
            value={monto ? cifra(importe) : ''}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="0"
            aria-label="Cuánto devolvés"
            data-testid="devolver-monto"
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: MONO, fontSize: 30, fontWeight: 600, letterSpacing: '-.02em', color: C.ink, padding: 0,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Contorno alto={44} onClick={() => setMonto(String(Math.trunc(elegida.disponible)))} testid="devolver-todo">
              Todo
            </Contorno>
          </div>
        </div>
        {pasado && (
          <div data-testid="devolver-pasado" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>
            De {elegida.codigo} tenés {cifra(elegida.disponible)} para devolver.
          </div>
        )}
      </div>

      {quienes.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }} data-testid="devolver-a-quien">
          <Rotulo>A quién</Rotulo>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {quienes.map((q) => (
              <button
                key={q.nombre}
                type="button"
                onClick={() => setQuien(q.id)}
                aria-pressed={q.id === quien}
                style={{
                  minHeight: 48, padding: '0 16px', fontFamily: 'inherit', fontSize: 14.5, cursor: 'pointer',
                  background: C.surface, color: C.ink, borderRadius: R.control,
                  border: `${q.id === quien ? 2 : 1}px solid ${q.id === quien ? C.marca : C.linea}`,
                }}
              >
                {q.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Tu firma</Rotulo>
        <div style={{
          height: 150, background: C.surface, border: `1px solid ${C.lineaFuerte}`, borderRadius: R.tarjeta,
          position: 'relative', overflow: 'hidden',
        }}>
          <canvas
            ref={lienzo}
            data-testid="lienzo-firma-devolucion"
            aria-label="Recuadro para firmar la devolución con el dedo"
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
            onPointerUp={() => { dibujando.current = false; setValida(firmaValida(trazos.current)) }}
            onPointerCancel={() => { dibujando.current = false; setValida(firmaValida(trazos.current)) }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
          />
          <div style={{ position: 'absolute', bottom: 18, left: 24, right: 24, borderBottom: `1px solid ${C.linea}`, pointerEvents: 'none' }} />
          <div style={{
            position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 11.5,
            color: C.faint, pointerEvents: 'none',
          }}>
            firmá arriba de la línea
          </div>
        </div>
        {valida && <Contorno alto={44} onClick={borrarFirma} testid="devolver-rehacer-firma">Rehacer la firma</Contorno>}
      </div>

      <Pie>
        {error && <div data-testid="devolver-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
        <Primario
          activo={importe > 0 && !pasado && valida && !enviando}
          onClick={devolver}
          testid="devolver-y-firmar"
        >
          {enviando ? 'Guardando…' : 'Devolver y firmar'}
        </Primario>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, textAlign: 'center' }}>
          Queda tu firma. El saldo baja cuando {quienes.find((q) => q.id === quien)?.nombre ?? 'Administración'} cuente
          la plata y la reciba: hasta entonces sigue siendo tuya.
        </div>
      </Pie>
    </>
  )
}
