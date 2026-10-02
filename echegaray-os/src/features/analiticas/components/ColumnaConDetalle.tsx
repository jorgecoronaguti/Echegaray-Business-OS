'use client'

// UNA COLUMNA DEL GRÁFICO CON SU DETALLE (dueño, 02/10/2026).
//
// ═══ POR QUÉ ES UN COMPONENTE DE CLIENTE Y NO CSS PURO ═══
//
// El detalle tiene que abrirse al pasar el mouse, con foco de teclado y AL TOCAR en el teléfono. El truco
// de `group-hover` / `:focus` cubre las dos primeras, pero en iOS Safari tocar un `div` o un `button` no
// le da foco: en el teléfono —donde el dueño y los jefes miran esto— nunca se abriría. Por eso un estado
// mínimo: `abierto` por toque, por hover o por foco. No existe un tooltip canónico en el repo (`ds/Ayuda`
// es un `details` para texto de ayuda, no para un dato de una barra) y un `title` nativo tarda y no anda
// en el teléfono.
//
// ═══ DÓNDE SE DIBUJA ═══
//
// Dentro de la caja del gráfico (arriba, sobre la columna), no fuera: la caja puede desplazarse de costado
// y `overflow-x: auto` recorta lo que sobresale hacia arriba. Las primeras columnas alinean el panel a la
// izquierda, las últimas a la derecha y las del medio lo centran, para que no se corte contra el borde.
// Tapa parte de las barras vecinas mientras está abierto; se cierra al sacar el mouse o tocar otra cosa.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DetalleDeColumna } from '../services/detalleColumna'

export function ColumnaConDetalle({ detalle, colores, posicion, children }: {
  detalle: DetalleDeColumna
  /** La clase de fondo de cada tramo, en el orden de `detalle.filas`: el cuadradito que une fila y barra. */
  colores: string[]
  /** Dónde cae la columna en la fila, para no cortar el panel contra el borde. */
  posicion: 'inicio' | 'medio' | 'fin'
  /** La barra: valor, tramos y rótulo del mes. */
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  // TOCAR FUERA CIERRA: sin hover no hay «mouseleave» que lo haga.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])
  const lado = posicion === 'inicio' ? 'left-0' : posicion === 'fin' ? 'right-0' : 'left-1/2 -translate-x-1/2'
  return (
    <div ref={raiz} className="relative flex h-full min-w-0 flex-col items-center justify-end gap-2"
      onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
      <div role="button" tabIndex={0} aria-label={detalle.aria} aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)} onFocus={() => setAbierto(true)} onBlur={() => setAbierto(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false) }}
        className="flex h-full w-full min-w-0 cursor-default flex-col items-center justify-end gap-2 rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-line-strong">
        {children}
      </div>
      {abierto ? (
        <div role="tooltip" className={`pointer-events-none absolute top-0 z-20 w-[200px] rounded-[4px] border border-line bg-canvas p-3 text-[11.5px] shadow-card ${lado}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-ink">{detalle.titulo}</span>
            <span className="font-semibold tabular-nums text-ink">{detalle.total ?? 'sin medir'}</span>
          </div>
          {detalle.filas.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {detalle.filas.map((f, i) => (
                <li key={f.nombre} className="flex items-baseline justify-between gap-3 text-muted">
                  <span className="flex items-center gap-2"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-[1px] ${colores[i] ?? ''}`} />{f.nombre}</span><span className="tabular-nums text-ink-soft">{f.importe}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {detalle.notas.length ? <div className="mt-2 text-muted">{detalle.notas.join(' · ')}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
