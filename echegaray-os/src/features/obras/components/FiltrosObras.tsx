// LOS FILTROS DE LA CARTERA — un renglón, dos controles, y nada más.
//
// ═══ CHIPS CON SU CONTEO (Design canónico 01 · 23/08) ═══
//
// Hasta el 20/08 esto eran pastillas con borde amarillo; el handoff V2 las bajó a texto subrayado.
// El Design canónico las vuelve a subir, pero a otra cosa distinta de las dos: un chip con BORDE
// hairline, el conteo en mono al lado del rótulo, y GRAFITO relleno cuando está puesto.
//
// Los dos cambios que importan no son de forma:
//
//   · EL CONTEO VA EN EL CHIP. «Con atraso 3» contesta la pregunta antes de que nadie toque nada:
//     el filtro deja de ser sólo una acción y pasa a ser un dato de la cartera. Un chip en 0 se
//     dibuja igual y apagado — que no haya ninguna obra en esa etapa ES la respuesta.
//   · EL AMARILLO SIGUE SIN SER SUYO. El puesto se marca con grafito, no con la marca: `COLOR.md`
//     reserva el amarillo para identidad, primaria y selección de fila. Un filtro puesto no es la
//     marca de la empresa, y un chip amarillo al lado del botón amarillo de «Nueva obra» haría que
//     el ojo lea dos primarias.
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
import type { ReactNode } from 'react'
import { BuscadorURL } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import { ETAPAS, ETAPA_LABEL, type Etapa } from '../types'
import { CLAVE_LIMPIAR } from '../services/vistaRecordada'
import { hayFiltro, type FiltroObras } from '../services/filtroObras'

const CHIP = 'inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 py-[3px] text-[12px] transition-colors'
const PUESTA = 'border-accent bg-accent text-white'
const SUELTA = 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'

/** Cuántas obras hay detrás de cada chip. `undefined` = la pantalla no las contó, y entonces el chip
 *  no miente con un número: se dibuja sin él. */
export interface ConteosObras {
  todas: number
  porEtapa: Partial<Record<Etapa, number>>
  atraso: number
}

function Chip({ href, puesta, testid, n, icono, children }: {
  href: string; puesta: boolean; testid: string; n?: number; icono?: ReactNode; children: ReactNode
}) {
  return (
    <Link href={href} prefetch={false} data-testid={testid} aria-current={puesta ? 'true' : undefined}
      className={`${CHIP} ${puesta ? PUESTA : SUELTA}`}>
      {icono}
      {children}
      {n != null && (
        <span className={`font-mono text-[10.5px] tabular-nums ${puesta ? 'text-white/70' : 'text-faint'}`}>{n}</span>
      )}
    </Link>
  )
}

export function FiltrosObras({
  filtro, base, extra = {}, resultados, total, conteos,
}: {
  filtro: FiltroObras
  /** `/obras` o `/obras/gantt`: los dos comparten los mismos filtros. */
  base: string
  /** Lo que hay que conservar al filtrar: el orden elegido, las archivadas. */
  extra?: Record<string, string | undefined>
  resultados: number
  total: number
  conteos?: ConteosObras
}) {
  const url = (p: { etapa?: Etapa | null; atraso?: boolean }) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
    if (filtro.q) q.set('q', filtro.q)
    // `etapa=` VACÍA y no ausente: es lo que distingue «quiero verlas todas» de «no elegí nada», y
    // sin esa diferencia la preferencia guardada volvería a filtrar sola en la próxima visita.
    q.set('etapa', (p.etapa === undefined ? filtro.etapa : p.etapa) ?? '')
    // EL ATRASO SE COMBINA CON LA ETAPA, no la reemplaza: «terminación y con atraso» es la pregunta
    // que hace alguien que está por cerrar obras, y un chip que pisa al otro la vuelve imposible.
    if (p.atraso === undefined ? filtro.atraso : p.atraso) q.set('atraso', '1')
    return `${base}?${q}`
  }
  const filtrando = hayFiltro(filtro)

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="filtros-obras">
      {/* La etapa viaja como campo oculto SÓLO si hay una puesta: buscar con «Todas» seleccionada
          tiene que dejar la URL sin `etapa`, igual que la dejaba el formulario. */}
      <BuscadorURL
        accion={base}
        q={filtro.q}
        placeholder="Buscar obra o cliente"
        oculto={{ ...extra, etapa: filtro.etapa ?? undefined, atraso: filtro.atraso ? '1' : undefined }}
        ancho="w-[260px] max-w-full"
        testid="buscar-obra"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href={url({ etapa: null })} puesta={filtro.etapa === null} testid="etapa-todas" n={conteos?.todas}>
          Todas
        </Chip>
        {ETAPAS.map((e) => (
          <Chip key={e} href={url({ etapa: e })} puesta={filtro.etapa === e} testid={`etapa-${e}`}
            n={conteos?.porEtapa[e]}>{ETAPA_LABEL[e]}</Chip>
        ))}
        {/* CON ATRASO NO ES UNA ETAPA: es el mismo estado que pinta el semáforo de la línea de
            tiempo, preguntado desde acá. Por eso alterna —tocarlo de nuevo lo saca— en vez de
            comportarse como una etapa más. */}
        <Chip href={url({ atraso: !filtro.atraso })} puesta={filtro.atraso === true} testid="filtro-atraso"
          n={conteos?.atraso} icono={<IconoProblema className="h-3.5 w-3.5" />}>Con atraso</Chip>
      </div>

      {/* CUÁNTAS QUEDARON. Una tabla acortada sin decir por qué se lee como una tabla a la que le
          faltan obras. Y el camino de vuelta al estado de fábrica —que además borra lo recordado—
          está acá y no escondido en un menú. */}
      <span className="ml-auto shrink-0 font-mono text-[11.5px] tabular-nums text-faint" data-testid="filtro-resultado">
        {resultados} de {total}
        {filtrando && (
          <>
            {' · '}
            <Link href={`${base}?${CLAVE_LIMPIAR}=1`} prefetch={false} data-testid="limpiar-filtros" className="font-sans text-muted underline underline-offset-2 hover:text-ink">
              quitar filtros
            </Link>
          </>
        )}
      </span>
    </div>
  )
}
