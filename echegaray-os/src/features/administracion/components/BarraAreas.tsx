'use client'

// LA BARRA DE NIVEL 2 DE ADMINISTRACIÓN — siete destinos en tres grupos (00 · Home Navegación v2).
//
// Porte literal del `.dc.html`: banda blanca con filo inferior, ítems de 12,5px con `padding:10px
// 11px`, contador mono de 10,5px pegado al nombre, y entre grupos un FILO de 1×15px — no una caja,
// no un título de grupo, no un espacio más grande. Lo que separa es el cambio de naturaleza:
// trabajo · con quién · qué se consulta.
//
// ═══ ES UNA SOLA BARRA, NO DOS (25/08/2026) ═══
//
// Acá había dos componentes: éste, con el contador, sólo en la entrada; y `NavAdministracionTabs`,
// sin contador, en las otras doce pantallas. Cada uno con SU lista de secciones, y un test que leía
// el código fuente del otro con una expresión regular para detectar que no se desincronizaran. Ese
// test existía porque ya había pasado. Ahora la lista vive en `services/areasAdmin.ts`, la importan
// los dos, y el detector sobra.
//
// El contador es opcional y eso NO es un capricho: adentro de Personas, saber cuántos documentos
// hay no decide nada, y cada número cuesta una consulta por página vista. Donde no se pagó, no se
// dibuja — y `null` no se dibuja como 0.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import { C } from '@/shared/components/canon'
import { areaActiva, hayFiloAntes, type AreaAdmin } from '../services/areasAdmin'

export function BarraAreas({ areas }: { areas: AreaAdmin[] }) {
  const activa = areaActiva(usePathname())
  return (
    // `nav-admin-secciones` es el nombre que la barra del área ya tenía en el resto de las
    // pantallas: para quien prueba, ésta ES esa barra.
    <nav
      data-testid="nav-admin-secciones"
      style={{
        background: C.superficie,
        borderBottom: `1px solid ${C.linea}`,
        display: 'flex',
        alignItems: 'stretch',
        padding: '0 20px',
        flexShrink: 0,
        // Siete destinos no entran en 390px. Scrollea POR DENTRO: con `body { overflow-x: clip }`,
        // lo que sobraba de esta barra era la única causa del desborde lateral en el teléfono.
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {areas.map((a, i) => {
        const esActiva = a.clave === activa
        return (
          <Fragment key={a.clave}>
            {hayFiloAntes(areas, i) && (
              <span
                aria-hidden
                data-testid="filo-grupo"
                style={{ alignSelf: 'center', width: 1, height: 15, background: C.linea, margin: '0 9px' }}
              />
            )}
            <Link
              href={a.href}
              // `prefetch={false}`: apuntan a rutas `force-dynamic` donde el prefetch dispara un
              // render RSC completo por solapa visible — siete renders de servidor, para nada.
              prefetch={false}
              data-testid={`ir-${a.clave}`}
              aria-current={esActiva ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '12.5px',
                color: esActiva ? C.tinta : C.apagado,
                fontWeight: esActiva ? 600 : 400,
                // GRAFITO Y NO AMARILLO: el amarillo es del nivel 1, donde «Administración» ya está
                // encendida. Dos marcas iguales de «acá estás» no dicen ninguna de las dos.
                boxShadow: esActiva ? `inset 0 -2px 0 ${C.grafito}` : 'none',
                padding: '10px 11px',
                whiteSpace: 'nowrap',
              }}
            >
              {a.titulo}
              {/* SIN LECTURA NO HAY CONTADOR — NUNCA UN CERO. Si la consulta falló el número no
                  aparece; un «0» diría «no hay ninguno», que es otra afirmación. */}
              {a.cuenta !== null && (
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: '10.5px', color: esActiva ? C.tenue : C.inerte }}
                >
                  {a.cuenta}
                </span>
              )}
            </Link>
          </Fragment>
        )
      })}
    </nav>
  )
}
