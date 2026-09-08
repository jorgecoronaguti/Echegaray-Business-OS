// DÓNDE TRABAJÓ — el bloque del Resumen que muestra TODAS sus obras, cerradas incluidas.
//
// El dueño: *«si hay obras que ya no están activas como La Estrella Galpón 9, o San Francisco con
// Mampostería, etc., dejarlo reflejado en la ficha de cada persona; son obras que estuvieron
// activas dentro de la misma plataforma»*.
//
// ═══ LA CERRADA SE VE IGUAL QUE LA ACTIVA ═══
//
// Ni tachada, ni gris, ni en un plegable «ver más». La obra cerrada es la mitad del historial de una
// persona: apagarla la convierte en letra chica. Lo único que la distingue es un punto de estado y
// la palabra al lado — la misma gramática de `FilaTarjeta`, que ya dibuja «Obras donde trabajó» en
// el canónico 20.
//
// ═══ QUÉ NO SE PINTA ═══
//
// Cuando el catálogo no trajo la obra —RLS, o la fila ya no existe— `activa` es `null` y NO se
// escribe ni «activa» ni «cerrada»: un control que no pudo mirar no dice «no está».

import Link from 'next/link'
import { TarjetaFicha } from './FichaCanonica'
import { fecha } from '@/features/obras/components/formato'
import type { ObraTrabajada, TramoProgramado } from '../services/obrasDePersona'

const ICONO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
  </svg>
)

const hs = (n: number): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** El punto de estado y su palabra. `null` = no se pudo leer, y entonces no se afirma nada. */
function Estado({ activa }: { activa: boolean | null }) {
  if (activa == null) return <span className="text-faint">estado sin leer</span>
  return (
    <>
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${activa ? 'bg-pos' : 'bg-line-strong'}`}
        aria-hidden
      />
      <span className={activa ? 'text-muted' : 'text-faint'}>{activa ? 'activa' : 'cerrada'}</span>
    </>
  )
}

/**
 * LO QUE TODAVÍA NO PASÓ — abajo, chico, y sólo si hay algo.
 *
 * ═══ POR QUÉ NO ES UNA FILA MÁS DE LA LISTA DE ARRIBA ═══
 *
 * Esa lista publica horas por obra. Un pase programado no tiene ninguna, y meterlo ahí obligaría a
 * escribirle «0,0 HH» al lado — un número que se lee como «fue y no trabajó». La lista de arriba ya
 * descarta por la misma razón las obras donde sólo hubo ausencias.
 *
 * ═══ Y POR QUÉ NO SE DIBUJA VACÍO ═══
 *
 * Casi nadie tiene un pase programado. Un rótulo «Programado —» permanente en todas las fichas es
 * ruido en el bloque que contesta la pregunta principal, que es dónde trabajó.
 */
function Programados({ tramos }: { tramos: TramoProgramado[] }) {
  return (
    <div className="border-t border-line-hairline px-3.5 py-2.5" data-testid="programados-persona">
      <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
        Programado
      </h4>
      <ul>
        {tramos.map((t) => (
          <li
            key={t.id} data-testid="fila-programado"
            className="flex items-baseline gap-2 py-0.5 text-[12px]"
          >
            <span className="min-w-0 flex-1 truncate text-ink">{t.nombre}</span>
            <span className="shrink-0 text-[11px] text-faint">
              {fecha(t.desde)}
              {' → '}
              {/* SIN `hasta` NO SE INVENTA UN FIN. «hasta nuevo aviso» es lo que dice la base: el
                  tramo sigue abierto hasta que alguien decida otra cosa. */}
              {t.hasta ? fecha(t.hasta) : 'hasta nuevo aviso'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ObrasDeLaPersona({ obras, programados = [], hrefAsignaciones }: {
  obras: ObraTrabajada[]
  /** Sus pases futuros. Vacío = no tiene ninguno, y entonces la sección no existe. */
  programados?: TramoProgramado[]
  /** El historial de ASIGNACIONES —dónde se lo puso, con o sin horas— vive en su solapa. */
  hrefAsignaciones: string
}) {
  return (
    <TarjetaFicha
      titulo="Obras en las que trabajó" icono={ICONO} testid="bloque-obras-persona"
      indicador={obras.length > 0
        ? `${obras.length}`
        : <span className="font-sans text-[11.5px] text-faint">—</span>}
    >
      {obras.length === 0
        ? (
            <p className="px-3.5 py-3 text-[12px] text-faint" data-testid="obras-persona-vacio">
              {/* NO ES «NO TRABAJÓ EN NINGUNA OBRA»: es que no hay horas imputadas a su nombre. */}
              Sin horas imputadas a su nombre en ninguna obra. Se cargan desde la solapa Personal de
              la obra o desde Campo · Asistencia.
            </p>
          )
        : obras.map((o) => (
            <Link
              key={o.id} href={`/obras/${o.id}`} prefetch={false} data-testid="fila-obra-persona"
              data-activa={o.activa == null ? 'sin-dato' : o.activa ? 'si' : 'no'}
              className="flex items-center gap-3 border-b border-line-hairline px-3.5 py-2.5 transition-colors last:border-0 hover:bg-canvas"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[12.5px] text-ink">{o.nombre}</span>
                  {o.vigente && (
                    <span className="shrink-0 text-[10.5px] text-muted" data-testid="obra-vigente">
                      asignación vigente
                    </span>
                  )}
                </span>
                <span className="mt-px block truncate text-[11px] text-faint">
                  <Estado activa={o.activa} />
                  {' · '}
                  {/* PRIMER Y ÚLTIMO DÍA CON HORAS SUYAS, no las fechas de la obra: la obra puede
                      haber empezado dos años antes de que esta persona pisara el terreno. */}
                  {o.primer === o.ultimo
                    ? fecha(o.primer)
                    : `${fecha(o.primer)} a ${fecha(o.ultimo)}`}
                  {' · '}
                  {o.dias} {o.dias === 1 ? 'día' : 'días'}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-soft">
                {hs(o.horas)} <span className="text-[10.5px] text-faint">HH</span>
              </span>
              <span className="shrink-0 text-[13px] text-line-strong" aria-hidden>›</span>
            </Link>
          ))}

      {programados.length > 0 && <Programados tramos={programados} />}

      {/* ESTE BLOQUE REEMPLAZÓ A «ESTUVO ANTES EN», que listaba las asignaciones CERRADAS.
          Decían casi lo mismo y el nuevo dice más: incluye las obras donde hay horas aunque nadie
          haya cerrado la asignación, trae el estado de hoy, los días y las HH. Dos bloques con la
          misma respuesta obligan a decidir cuál mirar. El historial de asignaciones no se pierde:
          es su propia solapa, y se llega desde acá. */}
      <div className="border-t border-line-hairline px-3.5 py-2.5">
        <Link href={hrefAsignaciones} prefetch={false}
          className="text-[12px] font-medium text-ink hover:underline" data-testid="ir-a-asignaciones">
          Ver el historial de asignaciones →
        </Link>
      </div>
    </TarjetaFicha>
  )
}
