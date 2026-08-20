// EL ENCABEZADO QUE ORDENA — un `<Link>`, no un botón con estado de cliente.
//
// El orden viaja en la URL (`?orden=avance&dir=desc`) por tres razones concretas, y ninguna es de
// gusto: la pantalla sigue siendo un server component (ordenar en el cliente obligaría a bajar todo
// el portafolio y volverlo interactivo), el orden elegido se puede COMPARTIR y volver a abrir, y el
// botón "atrás" del navegador deshace el orden como cualquier otra navegación.
//
// Se conserva `archivadas`: cambiar el orden no puede hacer desaparecer las obras que el que mira
// acababa de mostrar. Es el defecto clásico de las tablas ordenables y se evita acá, una sola vez.
//
// LA CELDA LA DIBUJA `Th` DEL DESIGN SYSTEM y no este archivo: los 10px en versalitas, el
// interletrado de 0,06em, el `faint` y el `first:pl-0` son del encabezado de TODA tabla del OS
// (`design/system/COMPONENTS.md` §Table). Acá vive sólo lo que este encabezado agrega —el enlace,
// la dirección y la flecha—, para que una tabla ordenable y una que no lo es midan igual.

import Link from 'next/link'
import { Th } from '@/shared/components/ds'
import { CAMPOS, proximaDireccion, type CampoOrden, type Direccion } from '../services/ordenObras'

export function ThOrden({
  campo, activo, dir, base, extra = {}, alineado = 'left', className = '',
}: {
  campo: CampoOrden
  /** El campo por el que se está ordenando ahora, o `null` si manda el orden de la fuente. */
  activo: CampoOrden | null
  dir: Direccion
  /** La ruta sobre la que se arma el enlace: `/obras` o `/obras/gantt`. */
  base: string
  /** Lo que hay que conservar de la query actual (por ejemplo `archivadas`). */
  extra?: Record<string, string | undefined>
  alineado?: 'left' | 'right'
  className?: string
}) {
  const esActivo = activo === campo
  const proxima = proximaDireccion(campo, activo, esActivo ? dir : null)
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  q.set('orden', campo)
  q.set('dir', proxima)

  return (
    <Th num={alineado === 'right'} className={className}>
      <Link
        href={`${base}?${q}`}
        data-testid={`orden-${campo}`}
        data-activo={esActivo ? dir : undefined}
        // El aria dice el estado REAL de la columna, que es lo que lee un lector de pantalla en una
        // tabla ordenable. `none` no es "no se puede ordenar": es "no está ordenada por acá".
        aria-sort={esActivo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-ink ${esActivo ? 'text-ink' : ''}`}
      >
        {CAMPOS[campo]}
        {/* LA FLECHA SÓLO EN LA COLUMNA ACTIVA. Un triangulito gris en las siete columnas es ruido:
            lo que hay que ver de un vistazo es por cuál está ordenada, no que todas se pueden. */}
        <span aria-hidden className={esActivo ? 'text-ink' : 'text-transparent'}>
          {esActivo && dir === 'asc' ? '▲' : '▼'}
        </span>
      </Link>
    </Th>
  )
}
