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

import type { ReactNode } from 'react'
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

export function FiltrosSuaves({ opciones, conteo, rotulo, testid = 'filtros', desplazable, verTodoHref, despues }: {
  opciones: OpcionFiltro[]
  /**
   * `{ n, total }`. La fila que recorta la población lo escribe SIEMPRE, aunque no filtre nada
   * (`22v2:399`); `undefined` es para la segunda fila de filtros — ver abajo.
   *
   * `sustantivo` DICE DE QUÉ SON ESOS DOS NÚMEROS. «5/5» solo es una cifra sin rótulo, y el dueño
   * ya marcó ese defecto en la cabecera de Clientes («un 5 suelto pegado a $ 251.494.283»). Es
   * opcional porque las otras seis pantallas que usan este control todavía lo escriben pelado: se
   * les agrega cuando cada una se toque, no de prepo desde acá — cambiar siete pantallas en un
   * cambio que el dueño pidió para una es cómo se rompe lo que ya funcionaba.
   *
   * ═══ `undefined` = ESTA FILA NO LLEVA CONTEO (16/09/2026) ═══
   *
   * Una pantalla con dos filas de filtros no puede escribir el mismo par de números dos veces: el
   * segundo repetido deja de decir cuánto se está viendo y pasa a ser ruido que hay que descartar. El
   * conteo lo escribe la fila de arriba, que es la que dice cuánta población quedó a la vista.
   */
  conteo?: { n: number; total: number; sustantivo?: string }
  /**
   * QUÉ EJE CORTA ESTA FILA («Obra»). Sólo hace falta cuando hay MÁS DE UNA fila de filtros: dos
   * hileras de pastillas idénticas se leen como una sola lista de opciones excluyentes, y ahí elegir
   * una obra parece apagar «Plantel». Una palabra apagada al principio del renglón lo resuelve sin
   * agregar una caja ni un párrafo.
   */
  rotulo?: string
  testid?: string
  /**
   * EN EL TELÉFONO, UNA SOLA FILA QUE SE DESPLAZA DE COSTADO (30/09/2026). Ocho chips con conteo
   * envueltos ocupan cinco renglones a 390px y empujan la lista fuera de la primera pantalla; en una
   * fila con scroll horizontal la lista queda a la vista y el dedo sigue alcanzando todos. Sólo
   * actúa por debajo de `md`: en escritorio los chips se envuelven como siempre.
   */
  desplazable?: boolean
  /** Si hay algo activo, «Ver todo» lo limpia de un clic. `undefined` = no hay nada que limpiar. */
  verTodoHref?: string
  /** Otro control en la MISMA línea, a continuación de las opciones (p. ej. un rango de fechas). */
  despues?: ReactNode
}) {
  return (
    <div data-testid={testid} className={`max-md:!gap-1.5 ${desplazable ? 'max-md:!flex-nowrap max-md:overflow-x-auto' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
      {rotulo && (
        <span style={{ fontSize: '11.5px', color: V.tenue, marginRight: 3 }} data-testid={`${testid}-rotulo`}>
          {rotulo}
        </span>
      )}
      {opciones.map((o) => (
        <Link
          key={o.clave}
          href={o.href}
          // NO SE PRECARGA — ver `shared/components/prefetch-en-listas.test.ts`. Cada pastilla
          // apunta a ESTA MISMA pantalla con otra query, y el destino es `force-dynamic`: precargar
          // dispara un render de servidor entero por chip y el payload no se reusa al hacer clic.
          // Medido el 07/09/2026 en `/documentos`: 25 renders de más por cada visita.
          prefetch={false}
          data-testid={`${testid}-${o.clave}`}
          aria-current={o.activo ? 'true' : undefined}
          // EN EL TELÉFONO, LA PASTILLA DE M03 (24/09/2026): 36px de alto y texto de 13 — un chip de 22px
          // no es un blanco para el dedo. El fondo del activo y el peso no cambian: es la misma señal.
          className={`hover:bg-surface-sunken ${desplazable ? 'max-md:shrink-0 max-md:whitespace-nowrap' : ''} max-md:!inline-flex max-md:min-h-[36px] max-md:items-center max-md:!rounded-[16px] max-md:!px-3 max-md:!text-[13px]`}
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
      {verTodoHref && (
        <Link
          href={verTodoHref}
          prefetch={false}
          data-testid={`${testid}-ver-todo`}
          className={`underline ${desplazable ? 'max-md:shrink-0 max-md:whitespace-nowrap' : ''} max-md:!inline-flex max-md:min-h-[36px] max-md:items-center max-md:!px-3 max-md:!text-[13px]`}
          style={{ fontSize: '12px', padding: '4px 9px', color: V.tinta, fontWeight: 500 }}
        >
          Ver todo
        </Link>
      )}
      {despues}
      {conteo && (
        <span
          className="font-mono tabular-nums"
          style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.lupa }}
          data-testid={`${testid}-conteo`}
        >
          {conteo.n}/{conteo.total}{conteo.sustantivo ? ` ${conteo.sustantivo}` : ''}
        </span>
      )}
    </div>
  )
}
