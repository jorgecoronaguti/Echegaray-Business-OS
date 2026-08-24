'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CONTEXTOS, contextoActivo, conObra, volverDe } from '../services/navegacion'
import { IconoAvance, IconoGente, IconoHoy, IconoTareas } from './Iconos'

// EL MARCO DEL JEFE DE OBRA EN EL TELÉFONO — el hermano mayor de `ShellEmpleado`, no la web achicada.
//
// ═══ QUÉ CAMBIA RESPECTO DEL EMPLEADO, Y POR QUÉ ═══
//
// El empleado navega SU día y todo lo suyo cabe en una secuencia vertical sin tarjetas. El jefe
// navega UNA OBRA con varios frentes abiertos a la vez, y esa comparación —cómo va cada frente, a
// quién le falta gente— necesita bloques separables. Por eso acá el contenido vive en PANELES
// blancos sobre el canvas, que es lo que pide `LAYOUT_RESPONSIVE.md` §Paneles. Más densidad, mismas
// reglas físicas: una columna, objetivos de 44px para arriba, la acción del día fija abajo.
//
// ═══ ESTO NO ES ESCRITORIO REDUCIDO, Y TAMPOCO SE ESTIRA ═══
//
// El contrato es explícito: *«Más información que empleado, pero optimizado para teléfono y campo.
// No desktop reducido.»* No hay un `lg:` que abra dos columnas ni que suba la barra al header: si
// el jefe abre esto en una notebook ve la misma pantalla, centrada. Lo que necesita del escritorio
// —Gantt, economía, cronograma— ya existe en `/obras/<obra>` y es OTRO producto.
//
// ═══ LA BARRA ES FIJA Y EL CONTENIDO LE DEJA LUGAR ═══
//
// Sin el `pb`, la última fila de cualquier lista queda tapada por la barra y nadie la puede tocar.
// Es la misma trampa que ya pagó el perfil empleado.

const ALTO_BARRA = 58

// LA FORMA DE CADA CONTEXTO, ACÁ Y NO EN `navegacion.ts`. Ese archivo es el que corre bajo
// `node --test`, y el runner no entiende JSX: por eso la lógica de la barra vive separada de su
// dibujo. Se mapea por `href`, que es la clave que ese módulo declara — si mañana aparece un cuarto
// contexto sin icono, la barra lo dibuja igual con su palabra en vez de romperse.
const ICONO: Record<string, (p: { className?: string }) => ReactNode> = {
  '/obra/hoy': IconoHoy,
  '/obra/tareas': IconoTareas,
  '/obra/avance': IconoAvance,
  '/obra/personas': IconoGente,
}

export function ShellJefe({
  iniciales,
  children,
}: {
  iniciales: string
  children: ReactNode
}) {
  // La ruta la pone el navegador: un layout de App Router no la recibe, y pasarla por `headers()`
  // volvería dinámica toda pantalla sólo para encender un rótulo.
  const pathname = usePathname() ?? ''
  const params = useSearchParams()
  const obraId = params?.get('obra') ?? null
  // `/obra/avance` son dos pantallas: J03 con barra, y el formulario de UNA tarea con flecha. El
  // porqué está en `navegacion.ts`; acá sólo se le pasa cuál de las dos es.
  const conActividad = !!params?.get('actividad')
  const activo = contextoActivo(pathname, conActividad)
  const volver = volverDe(pathname, obraId, conActividad)

  return (
    <div className="mx-auto min-h-screen w-full max-w-[520px] bg-canvas" data-testid="shell-jefe">
      <header className="sticky top-0 z-10 flex h-[52px] items-center gap-2 border-b border-line bg-surface px-4">
        {volver && (
          <Link
            href={volver}
            data-testid="volver-jefe"
            aria-label="Volver"
            className="-ml-2 flex h-[44px] w-[44px] items-center justify-center text-[22px] text-ink"
          >
            ‹
          </Link>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="h-[22px] w-[22px]" />
        <span className="text-[12.5px] font-semibold tracking-[0.12em] text-ink">ECHEGARAY</span>
        {!volver && (
          <span
            data-testid="iniciales-jefe"
            className="ml-auto flex h-[32px] w-[32px] items-center justify-center rounded-full bg-accent text-[11.5px] font-semibold text-white"
          >
            {iniciales}
          </span>
        )}
      </header>

      {/* El `padding` va por estilo y no por clase: `pb-[${ALTO_BARRA}px]` interpolado no existe
          como texto en el fuente, y Tailwind sólo genera las clases que puede LEER. */}
      <main style={activo ? { paddingBottom: ALTO_BARRA } : undefined}>{children}</main>

      {activo && (
        <nav
          data-testid="barra-jefe"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto flex h-[58px] max-w-[520px] border-t border-line bg-surface"
        >
          {CONTEXTOS.map((c) => {
            const Icono = ICONO[c.href]
            const encendido = activo === c.href
            return (
              <Link
                key={c.href}
                href={conObra(c.href, obraId)}
                data-testid={c.testid}
                aria-current={encendido ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-[3px] text-[11.5px] ${
                  encendido ? 'font-semibold text-ink' : 'text-muted'
                }`}
              >
                {encendido && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-marca" />}
                {Icono && <Icono className="h-[21px] w-[21px]" />}
                <span>{c.label}</span>
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}

/**
 * EL PIE DE ACCIÓN — la única primaria de la pantalla, fija abajo.
 *
 * Va con un ESPACIADOR del mismo alto en el flujo normal, no con un `padding-bottom` puesto a ojo
 * en la pantalla: el pie mide distinto en cada una (un botón, dos, o el bloque de valores del
 * masivo) y un padding fijo tapa la última fila de la más alta y deja un hueco en la más baja.
 */
export function PieDeAccion({
  children, sobreBarra = false, testid = 'pie-accion',
}: {
  children: ReactNode
  /** La pantalla tiene barra de contextos: el pie se apoya arriba de ella. */
  sobreBarra?: boolean
  testid?: string
}) {
  // El espaciador se MIDE, no se estima. El pie del avance masivo crece cuando aparece el aviso de
  // precisión, y un alto escrito a mano tapa la última tarea de la lista justo cuando el jefe la
  // necesita. `ResizeObserver` lo sigue solo; hasta que mide, el espaciador es 0 y no hay salto
  // visible porque el pie está fijo y no ocupaba lugar de todos modos.
  const [alto, setAlto] = useState(0)
  const pie = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = pie.current
    if (!el) return
    const ro = new ResizeObserver(() => setAlto(el.offsetHeight))
    ro.observe(el)
    setAlto(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  return (
    <>
      <div aria-hidden data-testid="espaciador-pie" style={{ height: alto }} />
      <div
        ref={pie}
        data-testid={testid}
        style={{ bottom: sobreBarra ? ALTO_BARRA : 0 }}
        className="fixed inset-x-0 z-20 mx-auto max-w-[520px] border-t border-line bg-canvas px-4 pb-3 pt-3"
      >
        {children}
      </div>
    </>
  )
}
