// LOS FILTROS DE LA CARTERA — un renglón, dos controles, y nada más.
//
// ═══ POR QUÉ NO PARECEN SOLAPAS ═══
//
// El lineamiento del dueño es explícito: *"máximo dos niveles de navegación visibles"*. Arriba ya
// hay dos —Administración/Obras, y Resumen/Gantt—. Un tercer renglón de enlaces subrayados en
// amarillo, que es como se ven los filtros de Personal, se leería como un tercer nivel de
// navegación: la misma forma significa lo mismo, y acá significa otra cosa.
//
// Por eso son PASTILLAS: se leen como controles de la tabla, no como pantallas a las que se entra.
// El amarillo aparece sólo en el borde de la que está puesta —acento, no relleno— y el resto vive
// en gris. Sin sombras, sin gradientes, sin un cuadro alrededor.
//
// ═══ Y POR QUÉ NO HAY UNA LÍNEA DE JAVASCRIPT ═══
//
// Las pastillas son `<Link>` y la búsqueda es un `form` GET sobre la misma pantalla, igual que
// `BarraFiltros` en Administración. El filtro viaja en la URL, así que se comparte, se recarga y
// vuelve con el botón de atrás — y la tabla sigue siendo un server component que lee de Postgres.
// El middleware recuerda el último para la próxima visita: ver `services/vistaRecordada.ts`.

import Link from 'next/link'
import { ETAPAS, ETAPA_LABEL, type Etapa } from '../types'
import { CLAVE_LIMPIAR } from '../services/vistaRecordada'
import type { FiltroObras } from '../services/filtroObras'

const PASTILLA = 'shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors'
const PUESTA = 'border-marca bg-marca-soft font-medium text-ink'
const SUELTA = 'border-line text-muted hover:text-ink'

export function FiltrosObras({
  filtro, base, extra = {}, resultados, total,
}: {
  filtro: FiltroObras
  /** `/obras` o `/obras/gantt`: los dos comparten los mismos filtros. */
  base: string
  /** Lo que hay que conservar al filtrar: el orden elegido, las archivadas. */
  extra?: Record<string, string | undefined>
  resultados: number
  total: number
}) {
  const href = (etapa: Etapa | null) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
    if (filtro.q) q.set('q', filtro.q)
    // `etapa=` VACÍA y no ausente: es lo que distingue «quiero verlas todas» de «no elegí nada», y
    // sin esa diferencia la preferencia guardada volvería a filtrar sola en la próxima visita.
    q.set('etapa', etapa ?? '')
    return `${base}?${q}`
  }
  const filtrando = filtro.etapa !== null || filtro.q !== ''

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="filtros-obras">
      <form action={base} method="get" className="flex items-center gap-1.5">
        {Object.entries(extra).map(([k, v]) => v
          ? <input key={k} type="hidden" name={k} value={v} />
          : null)}
        {filtro.etapa && <input type="hidden" name="etapa" value={filtro.etapa} />}
        <input
          name="q"
          defaultValue={filtro.q}
          placeholder="Buscar obra o cliente"
          data-testid="buscar-obra"
          className="h-7 w-48 rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink placeholder:text-faint focus:border-marca focus:outline-none"
        />
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={href(null)} data-testid="etapa-todas" aria-current={filtro.etapa === null ? 'true' : undefined}
          className={`${PASTILLA} ${filtro.etapa === null ? PUESTA : SUELTA}`}>Todas</Link>
        {ETAPAS.map((e) => (
          <Link key={e} href={href(e)} data-testid={`etapa-${e}`} aria-current={filtro.etapa === e ? 'true' : undefined}
            className={`${PASTILLA} ${filtro.etapa === e ? PUESTA : SUELTA}`}>{ETAPA_LABEL[e]}</Link>
        ))}
      </div>

      {/* CUÁNTAS QUEDARON, sólo cuando hay filtro. Una tabla acortada sin decir por qué se lee como
          una tabla a la que le faltan obras. Y el camino de vuelta al estado de fábrica —que además
          borra lo recordado— está acá y no escondido en un menú. */}
      {filtrando && (
        <span className="text-[12px] text-faint" data-testid="filtro-resultado">
          {resultados} de {total}
          {' · '}
          <Link href={`${base}?${CLAVE_LIMPIAR}=1`} data-testid="limpiar-filtros" className="text-muted underline underline-offset-2 hover:text-ink">
            quitar filtros
          </Link>
        </span>
      )}
    </div>
  )
}
