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
// ═══ Y POR QUÉ NO HAY UNA LÍNEA DE JAVASCRIPT ═══
//
// Las etapas son `<Link>` y la búsqueda es un `form` GET sobre la misma pantalla. El filtro viaja
// en la URL, así que se comparte, se recarga y vuelve con el botón de atrás — y la tabla sigue
// siendo un server component que lee de Postgres. El middleware recuerda el último para la próxima
// visita: ver `services/vistaRecordada.ts`.

import Link from 'next/link'
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
      {/* EL BUSCADOR DE UNA LISTA VA SIN CAJA: sólo hairline inferior e icono. Un campo con borde
          completo encima de una tabla sin caja es la caja que la tabla no tiene. */}
      <form action={base} method="get" className="flex w-[260px] max-w-full items-center gap-2 border-b border-line">
        {Object.entries(extra).map(([k, v]) => v
          ? <input key={k} type="hidden" name={k} value={v} />
          : null)}
        {filtro.etapa && <input type="hidden" name="etapa" value={filtro.etapa} />}
        {/* LA LUPA VA COMO SVG Y NO COMO CARÁCTER. `⌕` (U+2315) no existe en IBM Plex Sans: en la
            captura del 20/08 salía como el rectángulo del glifo faltante, justo delante del
            placeholder. Un icono que depende de que la fuente lo tenga es un icono que un día no
            está — y no falla, se dibuja mal. */}
        <svg aria-hidden width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor"
             strokeWidth="1.8" className="shrink-0 text-faint">
          <circle cx="9" cy="9" r="6" />
          <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
        </svg>
        <input
          name="q"
          defaultValue={filtro.q}
          placeholder="Buscar obra o cliente"
          aria-label="Buscar obra o cliente"
          data-testid="buscar-obra"
          className="h-control min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint max-lg:h-control-movil"
        />
      </form>

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
