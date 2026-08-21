// LOS FILTROS DE LA CARTERA — un renglón, dos controles, y nada más.
//
// ═══ POR QUÉ YA NO SON PASTILLAS (Design Handoff V2) ═══
//
// Hasta el 20/08 esta barra dibujaba pastillas con borde amarillo. El razonamiento era evitar que
// se leyeran como un TERCER nivel de navegación, y era razonable — pero el handoff aprobado lo
// resuelve al revés y con una regla más simple: el nivel 3 es «texto subrayado en ink 1,5px», y una
// pastilla rellena queda reservada para una SECUENCIA (ciclo de vida, pasos del alta). Un filtro no
// es una secuencia. `COMPONENTS.md` §Filters: *"Texto en línea, activo subrayado; contador «N de M»
// a la derecha"*.
//
// El amarillo, además, no era suyo: `COLOR.md` lo reserva para identidad, selección y primaria. Un
// filtro puesto no es la marca de la empresa.
//
// ═══ EL CONTADOR SE MUESTRA SIEMPRE, «QUITAR FILTROS» NO ═══
//
// «5 de 5» sin filtro no es ruido: dice cuántas obras hay en la cartera y, sobre todo, deja el
// número en el mismo lugar de la pantalla antes y después de filtrar, así el ojo lo encuentra. Lo
// que aparece sólo cuando hay algo que quitar es el camino de vuelta — un «quitar filtros» sobre
// una tabla sin filtrar es una acción que no hace nada.
//
// ═══ LA BÚSQUEDA FILTRA AL TECLEAR, Y EL FILTRO SIGUE EN LA URL ═══
//
// Hasta el 21/08 la búsqueda era un `form` GET: había que apretar Enter y nada en la pantalla lo
// decía. El contrato de diseño pide lo contrario —*"Buscadores filtran al teclear, sin Enter ni
// botón Buscar"*— y Clientes y Cuentas ya lo cumplían, así que la misma lupa tenía dos
// comportamientos según en qué pantalla cayera.
//
// La caja de búsqueda es ahora `BuscadorURL` del design system, que es el ÚNICO buscador con estado
// en la URL del OS. Las etapas siguen siendo `<Link>` y el filtro sigue viajando en la URL, así que
// se comparte, se recarga y vuelve con el botón de atrás — y la tabla sigue siendo un server
// component que lee de Postgres. El middleware recuerda el último para la próxima visita: ver
// `services/vistaRecordada.ts`.

import Link from 'next/link'
import { BuscadorURL } from '@/shared/components/ds'
import { ETAPAS, ETAPA_LABEL, type Etapa } from '../types'
import { CLAVE_LIMPIAR } from '../services/vistaRecordada'
import type { FiltroObras } from '../services/filtroObras'

// El activo lleva el subrayado por `box-shadow` y no por `border-bottom`: un borde real corre el
// texto 1,5px hacia arriba y las cinco etapas dejan de estar en la misma línea de base.
const OPCION = 'shrink-0 pb-[2px] text-[12.5px] transition-colors'
const PUESTA = 'font-medium text-ink shadow-[inset_0_-1.5px_0_var(--os-ink)]'
const SUELTA = 'text-muted hover:text-ink'

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
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="filtros-obras">
      {/* La etapa viaja como campo oculto SÓLO si hay una puesta: buscar con «Todas» seleccionada
          tiene que dejar la URL sin `etapa`, igual que la dejaba el formulario. */}
      <BuscadorURL
        accion={base}
        q={filtro.q}
        placeholder="Buscar obra o cliente"
        oculto={{ ...extra, etapa: filtro.etapa ?? undefined }}
        ancho="w-[260px] max-w-full"
        testid="buscar-obra"
      />

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <Link href={href(null)} data-testid="etapa-todas" aria-current={filtro.etapa === null ? 'true' : undefined}
          className={`${OPCION} ${filtro.etapa === null ? PUESTA : SUELTA}`}>Todas</Link>
        {ETAPAS.map((e) => (
          <Link key={e} href={href(e)} data-testid={`etapa-${e}`} aria-current={filtro.etapa === e ? 'true' : undefined}
            className={`${OPCION} ${filtro.etapa === e ? PUESTA : SUELTA}`}>{ETAPA_LABEL[e]}</Link>
        ))}
      </div>

      {/* CUÁNTAS QUEDARON. Una tabla acortada sin decir por qué se lee como una tabla a la que le
          faltan obras. Y el camino de vuelta al estado de fábrica —que además borra lo recordado—
          está acá y no escondido en un menú. */}
      <span className="ml-auto shrink-0 font-mono text-[11.5px] tabular-nums text-faint" data-testid="filtro-resultado">
        {resultados} de {total}
        {filtrando && (
          <>
            {' · '}
            <Link href={`${base}?${CLAVE_LIMPIAR}=1`} data-testid="limpiar-filtros" className="font-sans text-muted underline underline-offset-2 hover:text-ink">
              quitar filtros
            </Link>
          </>
        )}
      </span>
    </div>
  )
}
