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
import { Fragment, useEffect, useRef, useState } from 'react'
import { C } from '@/shared/components/canon'
import { areaActiva, hayFiloAntes, type AreaAdmin } from '../services/areasAdmin'

/** El degradado que avisa que la barra sigue. 26px es el ancho de media letra: insinúa, no tapa. */
const VELO = 26

export function BarraAreas({ areas }: { areas: AreaAdmin[] }) {
  const activa = areaActiva(usePathname())
  const caja = useRef<HTMLElement>(null)
  // QUÉ LADO SIGUE. `false/false` mientras no se midió: un velo dibujado sin medir sería un aviso
  // de que hay más donde no hay nada, y eso es peor que no avisar.
  const [sigue, setSigue] = useState({ izq: false, der: false })

  // ═══ LA BARRA SE CORTABA SIN AVISO (26/08/2026, medido a 390x844) ═══
  //
  // Siete destinos miden 803px y el teléfono tiene 390: la barra ya scrolleaba por dentro
  // (`overflowX: auto`), pero con `scrollbarWidth: none` no quedaba NADA que dijera que había más.
  // Se leía «Trabajo · Clientes · Personal · Proveedores · Co…» y Compras, Base maestra y
  // Documentos no existían para quien mira. Peor: estando en `/administracion/compras`, la solapa
  // encendida quedaba fuera de vista, así que la barra no decía dónde estoy parado.
  //
  // Se arregla con lo que se puede MEDIR en el navegador y no con una decoración fija: el velo se
  // dibuja sólo si de ese lado queda contenido, y desaparece al llegar al final.
  //
  // `scrollLeft` directo y NO `scrollIntoView`: éste último arrastra también a los ancestros y
  // movería la página entera.
  //
  // ═══ SE MIDEN LOS HIJOS, NO LA CAJA (26/08/2026) ═══
  //
  // La primera versión observaba sólo el `<nav>`, y en `/administracion/compras` no hacía nada:
  // `scrollLeft` quedaba en 0 con la solapa encendida a 362px y el velo apagado con 662px de
  // contenido en 390. La caja mide SIEMPRE el ancho de la pantalla —ese es su trabajo—, así que su
  // `ResizeObserver` no se dispara nunca; lo que cambia de ancho es el CONTENIDO cuando termina de
  // cargar la tipografía. Midiendo sólo la caja, la primera pasada leía anchos de la fuente de
  // reserva y no volvía a leerse jamás.
  useEffect(() => {
    const n = caja.current
    if (!n) return
    let ubicada = false
    const ajustar = () => {
      const encendida = n.querySelector('[aria-current="page"]')
      // Una sola vez: después de esto el scroll es de quien mira, y reubicarlo en cada medición le
      // arrancaría la barra de la mano.
      if (!ubicada && encendida instanceof HTMLElement && n.scrollWidth > n.clientWidth) {
        n.scrollLeft = Math.max(0, encendida.offsetLeft - 20)
        ubicada = true
      }
      setSigue({
        izq: n.scrollLeft > 1,
        der: n.scrollLeft + n.clientWidth < n.scrollWidth - 1,
      })
    }
    ajustar()
    n.addEventListener('scroll', ajustar, { passive: true })
    const observador = new ResizeObserver(ajustar)
    observador.observe(n)
    for (const hijo of Array.from(n.children)) observador.observe(hijo)
    return () => {
      n.removeEventListener('scroll', ajustar)
      observador.disconnect()
    }
  }, [activa, areas.length])

  return (
    // `nav-admin-secciones` es el nombre que la barra del área ya tenía en el resto de las
    // pantallas: para quien prueba, ésta ES esa barra.
    // El velo vive en un envoltorio POSICIONADO y por fuera del contenedor de scroll: adentro se
    // correría con el contenido, y un `position: absolute` dentro de un scroll container sin
    // posicionar escapa del recorte y ensancha el documento (ver `globals.css`, canon).
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <nav
        ref={caja}
        data-testid="nav-admin-secciones"
        data-sigue={sigue.der ? 'derecha' : undefined}
        style={{
          background: C.superficie,
          borderBottom: `1px solid ${C.linea}`,
          display: 'flex',
          alignItems: 'stretch',
          padding: '0 20px',
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
      {/* `aria-hidden` y sin eventos: es una señal para el ojo, no un control. Quien navega con
          teclado o lector de pantalla llega a las solapas escondidas igual, tabulando. */}
      {sigue.izq && <span aria-hidden style={velo('izquierda')} />}
      {sigue.der && <span aria-hidden data-testid="velo-hay-mas" style={velo('derecha')} />}
    </div>
  )
}

function velo(lado: 'izquierda' | 'derecha'): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    bottom: 1,
    width: VELO,
    pointerEvents: 'none',
    [lado === 'derecha' ? 'right' : 'left']: 0,
    background: `linear-gradient(to ${lado === 'derecha' ? 'left' : 'right'}, ${C.superficie}, transparent)`,
  }
}
