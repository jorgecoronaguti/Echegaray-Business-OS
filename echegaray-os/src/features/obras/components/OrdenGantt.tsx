// «ORDENAR POR» DEL GANTT DE CARTERA — la misma decisión que la tabla, con la forma que el Gantt
// permite.
//
// El Gantt no tiene `<thead>` clickeable: su columna fija es una grilla al lado del lienzo de
// barras, y colgar un encabezado ordenable de cada rótulo ensancharía la columna a costa del
// lienzo. La tira resuelve lo mismo en una línea y no le saca ancho a las barras.
//
// ═══ CUATRO ÓRDENES, NO SEIS (Design Handoff V2, `design/screens/obras.md` §1h) ═══
//
// El handoff los fija: *"Orden: arranque (default), atraso, avance, nombre"*. Se retiran «cliente»
// y «etapa», que existían por simetría con la tabla del Resumen y no por una pregunta que alguien
// se haga frente a un Gantt: ordenar barras de tiempo por nombre de cliente rompe la diagonal y no
// contesta nada que la búsqueda no conteste mejor.
//
// EL ORDEN NATURAL DEL GANTT ES EL DE ARRANQUE y por eso está primero y se puede volver a elegir:
// es el que hace que las barras bajen en diagonal y se lea la secuencia de la cartera. El resto son
// preguntas puntuales — "cuál está más atrasada", "cuánto avanzó cada una".
//
// LAS ARCHIVADAS SE ALTERNAN DESDE ACÁ y no sólo tipeando `?archivadas=1`: era funcionalidad real
// sin ninguna puerta en la pantalla, que es la definición de una capacidad que no existe.

import Link from 'next/link'
import type { CampoOrden, Direccion } from '../services/ordenObras'
import { proximaDireccion } from '../services/ordenObras'

/** Sólo lo que el Gantt MUESTRA. Ordenar por una columna invisible desordena la pantalla a la vista. */
const DEL_GANTT: { campo: CampoOrden; label: string }[] = [
  { campo: 'plazo', label: 'Atraso' },
  { campo: 'avance', label: 'Avance' },
  { campo: 'nombre', label: 'Nombre' },
]

const OPCION = 'shrink-0 pb-[2px] text-[12.5px] transition-colors'
const PUESTA = 'font-medium text-ink shadow-[inset_0_-1.5px_0_var(--os-ink)]'
const SUELTA = 'text-muted hover:text-ink'

export function OrdenGantt({ activo, dir, archivadas, etapa, q: texto, atraso }: {
  activo: CampoOrden | null
  dir: Direccion
  archivadas: boolean
  /** El filtro puesto: cambiar el orden no puede devolver a la pantalla las obras que se filtraron. */
  etapa?: string
  q?: string
  atraso?: boolean
}) {
  const q = (extra: Record<string, string>, conArchivadas = archivadas) => {
    const p = new URLSearchParams()
    if (conArchivadas) p.set('archivadas', '1')
    if (etapa) p.set('etapa', etapa)
    if (texto) p.set('q', texto)
    if (atraso) p.set('atraso', '1')
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    const s = p.toString()
    return `/obras/gantt${s ? `?${s}` : ''}`
  }
  // Alternar las archivadas conserva el orden elegido: no es una decisión sobre cómo se lee la
  // pantalla, es una sobre qué obras entran.
  const ordenPuesto: Record<string, string> = activo ? { orden: activo, dir } : {}

  return (
    <div data-testid="orden-gantt" className="mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      <span className="shrink-0 text-[12px] text-faint">Ordenar por</span>
      <Link
        href={q({})}
        data-testid="orden-gantt-cronologico"
        data-activo={activo === null ? 'si' : undefined}
        className={`${OPCION} ${activo === null ? PUESTA : SUELTA}`}
      >
        Arranque
      </Link>
      {DEL_GANTT.map(({ campo, label }) => {
        const esActivo = activo === campo
        return (
          <Link
            key={campo}
            href={q({ orden: campo, dir: proximaDireccion(campo, activo, esActivo ? dir : null) })}
            data-testid={`orden-gantt-${campo}`}
            data-activo={esActivo ? dir : undefined}
            className={`${OPCION} ${esActivo ? PUESTA : SUELTA}`}
          >
            {label}
            {esActivo && <span aria-hidden className="pl-0.5">{dir === 'asc' ? '▲' : '▼'}</span>}
          </Link>
        )
      })}
      <span aria-hidden className="text-line-strong">·</span>
      <Link
        href={q(ordenPuesto, !archivadas)}
        data-testid="gantt-archivadas"
        className={`${OPCION} ${archivadas ? PUESTA : SUELTA}`}
      >
        {archivadas ? 'Ocultar las archivadas' : 'Ver también las archivadas'}
      </Link>
    </div>
  )
}
