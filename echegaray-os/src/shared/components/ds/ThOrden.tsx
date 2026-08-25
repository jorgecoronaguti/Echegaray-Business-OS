// EL ENCABEZADO QUE ORDENA — un `<Link>`, no un botón con estado de cliente.
//
// Subió de `features/obras` a `shared/` el 21/08/2026: la tabla ordenable la necesitan Obras,
// Tareas, Personal, Proveedores y Compras, y la segunda copia es la que un día va a marcar el
// activo distinto o perder un filtro al ordenar.
//
// El orden viaja en la URL (`?orden=avance&dir=desc`) por tres razones concretas, y ninguna es de
// gusto: la pantalla sigue siendo un server component (ordenar en el cliente obligaría a bajar todo
// el listado y volverlo interactivo), el orden elegido se puede COMPARTIR y volver a abrir, y el
// botón "atrás" del navegador deshace el orden como cualquier otra navegación.
//
// `extra` es lo que hay que CONSERVAR de la query actual —las archivadas, la vista, el buscador—:
// cambiar el orden no puede hacer desaparecer las filas que el que mira acababa de mostrar. Es el
// defecto clásico de las tablas ordenables y se evita acá, una sola vez.
//
// La celda la dibuja `Th` y no este archivo: los 10px en versalitas, el interletrado y el `faint`
// son del encabezado de TODA tabla del OS. Acá vive sólo lo que este encabezado agrega.

import Link from 'next/link'
import { Th } from './Tabla'
import type { Direccion } from '@/shared/services/orden'

export function ThOrden({
  campo, etiqueta, activo, dir, proxima, base, extra = {}, alineado = 'left', className = '',
}: {
  /** La clave del campo tal como viaja en la URL. */
  campo: string
  etiqueta: string
  /** El campo por el que se está ordenando ahora, o `null` si manda el orden de la fuente. */
  activo: string | null
  dir: Direccion
  /** La dirección con la que abre ESTE encabezado si se lo toca. La decide el dominio. */
  proxima: Direccion
  /** La ruta sobre la que se arma el enlace: `/obras`, `/obras/gantt`, `/proveedores`… */
  base: string
  extra?: Record<string, string | undefined>
  alineado?: 'left' | 'right'
  className?: string
}) {
  const esActivo = activo === campo
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  q.set('orden', campo)
  q.set('dir', proxima)

  return (
    <Th num={alineado === 'right'} className={className}>
      <Link
        href={`${base}?${q}`}
        prefetch={false}
        data-testid={`orden-${campo}`}
        data-activo={esActivo ? dir : undefined}
        // El aria dice el estado REAL de la columna. `none` no es "no se puede ordenar": es "no
        // está ordenada por acá".
        aria-sort={esActivo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-ink ${esActivo ? 'text-ink' : ''}`}
      >
        {etiqueta}
        {/* LA FLECHA SÓLO EN LA COLUMNA ACTIVA. Un triangulito gris en las siete columnas es ruido:
            lo que hay que ver de un vistazo es por cuál está ordenada, no que todas se pueden. */}
        <span aria-hidden className={esActivo ? 'text-ink' : 'text-transparent'}>
          {esActivo && dir === 'asc' ? '▲' : '▼'}
        </span>
      </Link>
    </Th>
  )
}
