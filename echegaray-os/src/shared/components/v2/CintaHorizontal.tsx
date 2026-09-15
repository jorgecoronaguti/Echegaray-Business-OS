'use client'

// LA TABLA ANCHA SCROLLEA ADENTRO SUYO, NUNCA LA PÁGINA — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Medido en producción en `/administracion/compras` a 390px: `document.body.scrollWidth` = 1046
// contra 390 de pantalla. La fila de la lista declara nueve columnas inelásticas (914px de tracks +
// 112 de `gap` = 1026) y esos 1026 empujaban la PÁGINA: al deslizar para ver el importe se iban de
// pantalla el header, la navegación y los chips, y no había forma de volver sin scrollear de vuelta.
//
// La regla es de la shell y ya tenía test propio (`tests/shell-dos-areas.spec.ts`: «en el teléfono
// el shell no empuja la página de costado»): la página NO se desplaza de costado; el contenido ancho
// se desplaza DENTRO de su contenedor.
//
// ═══ POR QUÉ ES UN COMPONENTE CLIENTE Y LA TABLA NO ═══
//
// La sombra del borde sólo significa algo si aparece cuando queda contenido y se apaga al llegar al
// final, y eso hay que MEDIRLO en el navegador. Envolver la tabla entera en un componente cliente
// para eso mandaría cada fila al bundle; acá el que necesita estado es el contenedor, y las filas
// entran como `children` ya renderizadas en el servidor.
//
// Es el mismo patrón que `GrillaAsistenciaObra` estrenó hoy en Asistencia, extraído acá para que no
// haya dos versiones de la misma cinta.
//
// ═══ LA CABECERA PEGAJOSA VA AFUERA DEL QUE SCROLLEA, Y ES LA ÚNICA FORMA (15/09/2026) ═══
//
// Pedido del dueño: los nombres de las columnas quedan fijos arriba mientras la lista corre debajo.
// El camino obvio —`position: sticky; top: 45px` sobre la fila de rótulos, dentro de la cinta— NO
// funciona, y el motivo es de especificación, no de navegador: un elemento con `overflow-x: auto`
// ES un contenedor de scroll, y `sticky` mide su desplazamiento contra el scrollport MÁS CERCANO.
// Ese scrollport sería la cinta, que no se desplaza verticalmente: la cabecera quedaría clavada en
// su lugar del documento y se iría con la página, o peor, se correría 45px hacia abajo dejando un
// hueco. El defecto se ve sólo en un navegador y se lee como «el sticky no anda».
//
// Por eso los rótulos salen del elemento que scrollea y viven en un envoltorio propio, pegado a la
// VENTANA (su scrollport más cercano ya es el documento: `body` lleva `overflow-x: clip`, que no
// crea contenedor de scroll). Para que sigan alineados con las columnas se los corre con
// `translateX(-scrollLeft)` del mismo `onScroll` que ya alimentaba la sombra: un solo medidor, un
// solo estado, imposible que la cabecera y las filas se desfasen por tener dos fuentes.
//
// `overflow: clip` en el envoltorio y no `hidden`: `hidden` también crea contenedor de scroll y
// volvería a robarle el anclaje al `sticky` que está en ese mismo elemento.

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { ALTO_HEADER_APP } from './patron'

/** El envoltorio de los rótulos: pegado bajo el header de la app y recortado sin volverse scroller. */
const CABECERA_PEGAJOSA: CSSProperties = {
  position: 'sticky', top: ALTO_HEADER_APP, zIndex: 4, overflow: 'clip',
}

export function CintaHorizontal(
  { children, testid, cabecera }: {
    children: ReactNode
    testid?: string
    /** Los rótulos de las columnas. Se dibujan AFUERA del scroller y se corren con él. */
    cabecera?: ReactNode
  },
) {
  const [quedaALaDerecha, setQuedaALaDerecha] = useState(false)
  const [corrimiento, setCorrimiento] = useState(0)
  const medir = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    // Un píxel de tolerancia: con zoom o pantallas fraccionarias `scrollLeft` es decimal y la
    // igualdad exacta dejaría la sombra encendida para siempre en el final del recorrido.
    setQuedaALaDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    setCorrimiento(el.scrollLeft)
  }, [])
  // El `ref` mide al MONTAR: un estado que arranca en `false` y sólo se actualiza al scrollear nunca
  // le mostraría la sombra a quien todavía no scrolleó, que es justo a quien hay que avisarle.
  const montar = useCallback((el: HTMLDivElement | null) => { medir(el) }, [medir])

  return (
    <div style={{ position: 'relative' }}>
      {cabecera && (
        <div
          style={CABECERA_PEGAJOSA}
          className="bg-canvas"
          data-testid={testid ? `${testid}-cabecera` : undefined}
        >
          {/* El fondo opaco es obligatorio: sin él las filas se leen ENCIMA de los rótulos al pasar
              por debajo. Va en el envoltorio y no acá para que cubra todo el ancho visible aunque la
              fila de rótulos esté corrida. */}
          <div style={{ transform: `translateX(${-corrimiento}px)` }}>{cabecera}</div>
        </div>
      )}
      <div
        ref={montar}
        onScroll={(e) => medir(e.currentTarget)}
        style={{ overflowX: 'auto' }}
        data-testid={testid}
      >
        {children}
      </div>
      {/* FUERA DEL ELEMENTO QUE SCROLLEA: adentro se arrastraría con el contenido y la sombra
          terminaría en el medio de la tabla. `pointer-events-none` para que no coma clics.
          `from-line-strong` Y NO `from-ink/15`: en este Tailwind los colores del tema son
          `rgb(var(--os-…) / <alpha-value>)` y el gradiente con modificador de opacidad no genera
          regla — la sombra no existiría. */}
      {quedaALaDerecha && (
        <div
          aria-hidden
          data-testid={testid ? `${testid}-hay-mas` : undefined}
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-line-strong to-transparent"
        />
      )}
    </div>
  )
}
