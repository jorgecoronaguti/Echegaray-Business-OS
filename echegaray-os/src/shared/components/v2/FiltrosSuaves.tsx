// LOS FILTROS DEL PATRÓN v2 — `22v2:109-114`.
//
// ═══ POR QUÉ NO ES `FiltrosURL` ═══
//
// El chip del canon de agosto es una PASTILLA CON BORDE que se llena de grafito al activarse. El v2
// borra el borde y baja el activo a un fondo #F2F1ED con el texto en negrita: es la misma decisión
// del criterio 3 —sin cajas— aplicada al control más chico de la pantalla. Un chip con borde arriba
// de una tabla sin borde vuelve a dibujar la caja que la tabla acaba de perder.
//
// Siguen siendo ENLACES y no botones: el filtro puesto viaja en la URL, se comparte por chat, se
// recarga y vuelve con el botón de atrás. Y el conteo `n/total` que los cierra es lo que quedó del
// pie de totales del porte anterior: dice cuánto de la cartera se está viendo, sin un bloque gris.

import Link from 'next/link'
import { V } from './patron'

export interface OpcionFiltro {
  clave: string
  etiqueta: string
  href: string
  activo: boolean
  /**
   * CUÁNTOS HAY EN ESE CORTE — la población entera, no la página que se está viendo.
   *
   * El handoff v4 sacó la banda de señales de las pantallas de área con una condición: el recorte
   * que aísla lo incompleto tiene que decir cuántos son. Sin el número, «Sin CUIT» es una puerta a
   * ciegas y el trabajo pendiente deja de tener tamaño.
   *
   * `undefined` = este corte no cuenta nada (Todos, Activos). `null` = NO SE PUDO CONTAR, y
   * entonces no se dibuja: un 0 ahí afirmaría que no queda ninguno.
   */
  cuenta?: number | null
}

export function FiltrosSuaves({ opciones, conteo, testid = 'filtros' }: {
  opciones: OpcionFiltro[]
  /** `{ n, total }`. Se dibuja siempre: el mockup lo escribe aunque no filtre nada (`22v2:399`). */
  conteo: { n: number; total: number }
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
      {opciones.map((o) => (
        <Link
          key={o.clave}
          href={o.href}
          data-testid={`${testid}-${o.clave}`}
          aria-current={o.activo ? 'true' : undefined}
          className="hover:bg-[#EFEEEA]"
          style={{
            fontSize: '12px', padding: '4px 9px', borderRadius: 6,
            color: o.activo ? V.tinta : V.apagado,
            fontWeight: o.activo ? 600 : 400,
            background: o.activo ? V.hover : 'transparent',
          }}
        >
          {o.etiqueta}
          {/* SIN LECTURA NO HAY NÚMERO — NUNCA UN CERO POR DEFECTO. */}
          {o.cuenta != null && (
            <span
              className="font-mono tabular-nums"
              data-testid={`${testid}-${o.clave}-cuenta`}
              style={{ marginLeft: 5, fontSize: '10.5px', color: o.activo ? V.tenue : V.lupa }}
            >
              {o.cuenta}
            </span>
          )}
        </Link>
      ))}
      <span
        className="font-mono tabular-nums"
        style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.lupa }}
        data-testid={`${testid}-conteo`}
      >
        {conteo.n}/{conteo.total}
      </span>
    </div>
  )
}
