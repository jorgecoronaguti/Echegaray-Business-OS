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
//
// ═══ Y SI EL STICKY IGUAL NO LA SOSTIENE, SE MIDE Y SE FIJA (16/09/2026) ═══
//
// El dueño, en Chrome sobre Mac, ve la fila «Persona + días» irse con la página. `sticky` depende de la
// cadena entera de ancestros y de cosas que este archivo no controla; en vez de afirmar que anda, el
// componente MIDE en cada scroll dónde quedó la cabecera. Si el envoltorio ya pasó bajo el header y la
// cabecera se fue con él, el sticky falló: de ahí en más la cabecera va `position: fixed` bajo el header,
// con el borde y el ancho del envoltorio, y un espaciador de su alto ocupa su lugar para que la tabla no
// salte. La decisión es pura y está probada en `cabeceraFija.ts`; acá sólo se cablea.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ALTO_HEADER_APP } from './patron'
import { elStickyFallo, mismoModo, modoDeCabecera, type ModoDeCabecera } from './cabeceraFija'

/** El envoltorio de los rótulos: pegado bajo el header de la app y recortado sin volverse scroller. */
const CABECERA_PEGAJOSA: CSSProperties = {
  position: 'sticky', top: ALTO_HEADER_APP, zIndex: 4, overflow: 'clip',
}

/**
 * EL MEDIDOR DEL STICKY. Escucha el scroll en captura —así ve también el de un ancestro que scrollee por su
 * cuenta, que es justo el caso en que el sticky se pierde—, el `resize` y el tamaño del envoltorio. Con el
 * sticky caído queda latcheado: una vez que falló, no se le vuelve a creer.
 */
function useCabeceraFija(activa: boolean) {
  const envoltorio = useRef<HTMLDivElement>(null)
  const cabecera = useRef<HTMLDivElement>(null)
  const stickyRoto = useRef(false)
  const [modo, setModo] = useState<ModoDeCabecera>({ modo: 'flujo' })
  const [altoCabecera, setAltoCabecera] = useState(0)
  useEffect(() => {
    if (!activa) return
    const medir = () => {
      const env = envoltorio.current?.getBoundingClientRect()
      const cab = cabecera.current?.getBoundingClientRect()
      if (!env || !cab) return
      const m = { envoltorio: env, cabecera: { top: cab.top, height: cab.height }, techo: ALTO_HEADER_APP }
      if (!stickyRoto.current && elStickyFallo(m)) stickyRoto.current = true
      const siguiente = modoDeCabecera(m, stickyRoto.current)
      setAltoCabecera((a) => (a === cab.height ? a : cab.height))
      setModo((actual) => (mismoModo(actual, siguiente) ? actual : siguiente))
    }
    medir()
    window.addEventListener('scroll', medir, { capture: true, passive: true })
    window.addEventListener('resize', medir)
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    if (envoltorio.current) observador?.observe(envoltorio.current)
    return () => {
      window.removeEventListener('scroll', medir, { capture: true })
      window.removeEventListener('resize', medir)
      observador?.disconnect()
    }
  }, [activa])
  return { refEnvoltorio: envoltorio, refCabecera: cabecera, modo, altoCabecera }
}

/** El estilo de la cabecera según lo medido: el `sticky` de siempre, o fija donde el sticky no llegó. */
function estiloDeCabecera(modo: ModoDeCabecera): CSSProperties {
  if (modo.modo === 'flujo') return CABECERA_PEGAJOSA
  return { position: 'fixed', top: modo.top, left: modo.left, width: modo.width, zIndex: 4, overflow: 'clip' }
}

export function CintaHorizontal(
  { children, testid, cabecera, marcoPropio }: {
    children: ReactNode
    testid?: string
    /**
     * Los rótulos de las columnas. Se dibujan AFUERA del scroller y se corren con él.
     *
     * COMO FUNCIÓN, RECIBE EL CORRIMIENTO. Lo necesita quien tiene una columna fija a la izquierda: adentro de
     * este envoltorio `position: sticky` NO sirve —no hay scrollport que lo ancle, el movimiento es un
     * `transform`— así que el rótulo de esa columna se contra-desplaza con el mismo número. Sin eso, el nombre
     * de la columna se va de pantalla y sus celdas se quedan: números con un rótulo que no es el suyo.
     */
    cabecera?: ReactNode | ((corrimiento: number) => ReactNode)
    /**
     * EL QUE LLAMA TRAE SU PROPIO MARCO. Liquidación ya tiene uno (`MARCO_SCROLL` de `solapas/tabla.tsx`): su
     * degradado de borde y su canal de 20 px no son decoración, son lo que hace funcionar la columna fija
     * (`COLUMNA_FIJA` frena en `-CANAL_SCROLL`). Con esto, la cinta aporta SÓLO lo que la tabla no puede tener
     * sola —la cabecera pegada a la ventana— y no dibuja su propio aviso: dos señales de «hay más» encima es
     * ruido, y una tabla con dos marcos deja de leerse como un objeto.
     */
    marcoPropio?: CSSProperties
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
  const { refEnvoltorio, refCabecera, modo, altoCabecera } = useCabeceraFija(cabecera != null)

  return (
    <div ref={refEnvoltorio} style={{ position: 'relative' }}>
      {/* EL ESPACIADOR: con la cabecera fija, ocupa su lugar en el flujo para que la tabla no suba de golpe. */}
      {cabecera && modo.modo === 'fija' && (
        <div aria-hidden style={{ height: altoCabecera }} data-testid={testid ? `${testid}-espaciador` : undefined} />
      )}
      {cabecera && (
        <div
          ref={refCabecera}
          style={estiloDeCabecera(modo)}
          className="bg-canvas"
          data-testid={testid ? `${testid}-cabecera` : undefined}
          data-modo={modo.modo}
        >
          {/* El fondo opaco es obligatorio: sin él las filas se leen ENCIMA de los rótulos al pasar
              por debajo. Va en el envoltorio y no acá para que cubra todo el ancho visible aunque la
              fila de rótulos esté corrida. */}
          <div style={{ transform: `translateX(${-corrimiento}px)` }}>
            {typeof cabecera === 'function' ? cabecera(corrimiento) : cabecera}
          </div>
        </div>
      )}
      <div
        ref={montar}
        onScroll={(e) => medir(e.currentTarget)}
        style={marcoPropio ?? { overflowX: 'auto' }}
        data-testid={testid}
      >
        {children}
      </div>
      {/* FUERA DEL ELEMENTO QUE SCROLLEA: adentro se arrastraría con el contenido y la sombra
          terminaría en el medio de la tabla. `pointer-events-none` para que no coma clics.
          `from-line-strong` Y NO `from-ink/15`: en este Tailwind los colores del tema son
          `rgb(var(--os-…) / <alpha-value>)` y el gradiente con modificador de opacidad no genera
          regla — la sombra no existiría. */}
      {quedaALaDerecha && !marcoPropio && (
        <div
          aria-hidden
          data-testid={testid ? `${testid}-hay-mas` : undefined}
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-line-strong to-transparent"
        />
      )}
    </div>
  )
}
