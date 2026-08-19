// «ORDENAR POR» DEL GANTT — la misma decisión que la tabla, con la forma que el Gantt permite.
//
// El Gantt no tiene `<thead>`: su columna fija es una grilla flexible al lado del lienzo de barras,
// así que no hay dónde colgar un encabezado clickeable sin ensanchar la columna y comerse el lienzo.
// La tira resuelve lo mismo en una línea de once píxeles y no le saca ancho a las barras.
//
// EL ORDEN NATURAL DEL GANTT ES EL CRONOLÓGICO y por eso está primero y es el que se puede volver a
// elegir: es el que hace que las barras bajen en diagonal y se lea la secuencia de la cartera. El
// resto son preguntas puntuales — "cuál está más atrasada", "cuánto avanzó cada una".

import Link from 'next/link'
import type { CampoOrden, Direccion } from '../services/ordenObras'
import { proximaDireccion } from '../services/ordenObras'

/** Sólo lo que el Gantt MUESTRA. Ordenar por una columna invisible desordena la pantalla a la vista. */
const DEL_GANTT: { campo: CampoOrden; label: string }[] = [
  { campo: 'nombre', label: 'obra' },
  { campo: 'cliente', label: 'cliente' },
  { campo: 'etapa', label: 'etapa' },
  { campo: 'plazo', label: 'atraso' },
  { campo: 'avance', label: 'avance' },
]

export function OrdenGantt({ activo, dir, archivadas }: { activo: CampoOrden | null; dir: Direccion; archivadas: boolean }) {
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (archivadas) p.set('archivadas', '1')
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    const s = p.toString()
    return `/obras/gantt${s ? `?${s}` : ''}`
  }
  return (
    <div data-testid="orden-gantt" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="text-faint">Ordenar por</span>
      <Link
        href={q({})}
        data-testid="orden-gantt-cronologico"
        data-activo={activo === null ? 'si' : undefined}
        className={activo === null ? 'text-ink' : 'hover:text-ink'}
      >
        fecha de inicio
      </Link>
      {DEL_GANTT.map(({ campo, label }) => {
        const esActivo = activo === campo
        return (
          <Link
            key={campo}
            href={q({ orden: campo, dir: proximaDireccion(campo, activo, esActivo ? dir : null) })}
            data-testid={`orden-gantt-${campo}`}
            data-activo={esActivo ? dir : undefined}
            className={`inline-flex items-center gap-0.5 ${esActivo ? 'text-ink' : 'hover:text-ink'}`}
          >
            {label}
            {esActivo && <span aria-hidden className="text-marca">{dir === 'asc' ? '▲' : '▼'}</span>}
          </Link>
        )
      })}
    </div>
  )
}
