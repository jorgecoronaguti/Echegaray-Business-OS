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
// Dentro de la caja del gráfico y al COSTADO de su columna: las de la primera mitad lo abren a la derecha, las
// de la segunda a la izquierda. No tapa la cifra ni la barra propia; sí parte de las vecinas mientras está
// abierto. Se cierra al sacar el mouse, tocar fuera o con Esc. La regla de apertura vive en
// `aperturaDeColumna.ts`.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DetalleDeColumna } from '../services/detalleColumna'
import { abreConTecla, siguienteApertura, type EventoDeColumna } from '../services/aperturaDeColumna'

export function ColumnaConDetalle({ detalle, colores, posicion, children }: {
  detalle: DetalleDeColumna
  /** La clase de fondo de cada tramo, en el orden de `detalle.filas`: el cuadradito que une fila y barra. */
  colores: string[]
  /** Dónde cae la columna en la fila, para no cortar el panel contra el borde. */
  posicion: 'inicio' | 'fin'
  /** La barra: valor, tramos y rótulo del mes. */
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const evento = (e: EventoDeColumna) => setAbierto((a) => siguienteApertura(a, e))
  const raiz = useRef<HTMLDivElement>(null)
  // TOCAR FUERA CIERRA: sin hover no hay «mouseleave» que lo haga.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) evento('fuera') }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])
  // AL COSTADO DE SU PROPIA COLUMNA, hacia el lado con más lugar: así no tapa la cifra ni la barra que se
  // está mirando (QA producción: arriba-izquierda las tapaba). Tapa las vecinas más lejanas, no la propia.
  const lado = posicion === 'inicio' ? 'left-full ml-2' : 'right-full mr-2'
  return (
    <div ref={raiz} className="relative flex h-full min-w-0 flex-col items-center justify-end gap-2"
      onMouseEnter={() => evento('entra')} onMouseLeave={() => evento('sale')}>
      <div role="button" tabIndex={0} aria-label={detalle.aria} aria-expanded={abierto}
        onClick={() => evento('toque')} onFocus={() => evento('foco')} onBlur={() => evento('desenfoco')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') evento('esc')
          else if (abreConTecla(e.key)) { e.preventDefault(); evento('tecla_abrir') }
        }}
        className="flex h-full w-full min-w-0 cursor-default flex-col items-center justify-end gap-2 rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-line-strong">
        {children}
      </div>
      {abierto ? (
        <div role="tooltip" className={`pointer-events-none absolute top-0 z-20 w-[160px] rounded-[4px] border border-line bg-canvas p-3 text-[11.5px] shadow-card lg:w-[208px] ${lado}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-ink">{detalle.titulo}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-ink">{detalle.total ?? 'sin medir'}</span>
          </div>
          {detalle.filas.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {detalle.filas.map((f, i) => (
                <li key={f.nombre} className="flex items-baseline justify-between gap-3 text-muted">
                  <span className="flex min-w-0 items-center gap-2"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-[1px] ${colores[i] ?? ''}`} />{f.nombre}</span><span className="shrink-0 whitespace-nowrap tabular-nums text-ink-soft">{f.importe}</span>
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
