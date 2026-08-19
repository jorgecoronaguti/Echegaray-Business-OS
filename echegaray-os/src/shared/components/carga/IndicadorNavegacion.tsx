'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { abreNavegacionInterna } from './navegacion'

// LA BARRA QUE DICE QUE EL SISTEMA ESTÁ TRABAJANDO — una sola, arriba de todo, para todo el OS.
//
// El `loading.tsx` de cada ruta ya reemplaza el CONTENIDO por su esqueleto; esto es la señal que
// aparece incluso cuando el esqueleto todavía no está montado, y la que sigue viéndose en las
// navegaciones que Next resuelve sin cambiar de segmento (un filtro, `?archivadas=1`).
//
// SE ESCUCHA EL CLIC EN `document`, EN CAPTURA, Y NO SE TOCA EL EVENTO. No se llama a
// `preventDefault`, no se navega a mano, no se envuelve ningún `<Link>`: si este componente se
// borrara entero, la aplicación navegaría exactamente igual. Esa es la condición para poder poner un
// escucha global sobre TODOS los links del sistema sin volverse dueño de la navegación.
//
// SE APAGA CON EL CAMBIO DE RUTA, que es el hecho —no un temporizador que adivina—. El límite de
// 2 minutos es sólo para que un clic que terminó en nada (una redirección del middleware al mismo
// lugar, una respuesta que nunca llegó) no deje la barra corriendo para siempre.
const LIMITE_MS = 120_000

// ═══ POR QUÉ ADEMÁS DE LA BARRA HAY UN CARTEL, Y NO ES ADORNO ═══
//
// Medido sobre el build de producción el 19/08: cuando el PREFETCH del link todavía no volvió —que
// es el caso real, porque en producción el prefetch tarda lo mismo que la página—, el router de Next
// **no monta el `loading.tsx`**: deja la pantalla anterior tal cual, sin cambiar siquiera la URL,
// hasta que llega la respuesta. O sea que los esqueletos, solos, no cubren el caso que el dueño
// reportó. La única señal en esa ventana es ésta.
//
// El cartel espera medio segundo: una navegación que se resuelve rápido no tiene que hacer parpadear
// nada. La barra sí aparece de una — es fina y no molesta.
const CARTEL_MS = 500

export function IndicadorNavegacion() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // LA RUTA COMO CADENA, incluida la query: `/obras` y `/obras?archivadas=1` son la misma `pathname`
  // y son dos cargas distintas. Sin la query, la segunda no apagaría nunca el indicador.
  const rutaActual = `${pathname}?${searchParams}`

  // EL ESTADO ES «DESDE DÓNDE SE PIDIÓ IR A OTRA PARTE», NO UN BOOLEANO.
  //
  // Con un booleano hacía falta un efecto que lo apagara al cambiar de ruta —y apagar algo desde un
  // efecto es una segunda pasada de render, además de lo que `react-hooks/set-state-in-effect`
  // prohíbe acá—. Guardando la ruta de ORIGEN, el indicador se apaga solo: en cuanto la ruta que
  // devuelve el router deja de ser aquella, la navegación terminó. El hecho apaga la señal, no un
  // temporizador que adivina.
  const [pedido, setPedido] = useState<{ desde: string; n: number } | null>(null)
  const activo = pedido !== null && pedido.desde === rutaActual

  useEffect(() => {
    function alClic(e: MouseEvent) {
      const ancla = (e.target as Element | null)?.closest?.('a')
      if (!ancla) return
      if (
        abreNavegacionInterna({
          href: ancla.getAttribute('href'),
          target: ancla.getAttribute('target'),
          descarga: ancla.hasAttribute('download'),
          conModificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
          botonPrincipal: e.button === 0,
          yaPrevenido: e.defaultPrevented,
          urlActual: window.location.href,
        })
      ) {
        setPedido({ desde: `${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`, n: Date.now() })
      }
    }
    // También los formularios que hacen POST a una Server Action y terminan en `redirect()`: el alta
    // de una obra tarda lo mismo que una navegación y hasta hoy tampoco mostraba nada.
    function alEnviar() {
      setPedido({ desde: `${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`, n: Date.now() })
    }
    document.addEventListener('click', alClic, true)
    document.addEventListener('submit', alEnviar, true)
    return () => {
      document.removeEventListener('click', alClic, true)
      document.removeEventListener('submit', alEnviar, true)
    }
  }, [])

  // El cartel se cuelga del pedido concreto que lo disparó: cuando empieza otra navegación, `n`
  // cambia y el cartel vuelve a esperar su medio segundo sin que nadie lo apague a mano.
  const [cartelDe, setCartelDe] = useState<number | null>(null)
  useEffect(() => {
    if (!activo || pedido === null) return
    const aparece = setTimeout(() => setCartelDe(pedido.n), CARTEL_MS)
    const limite = setTimeout(() => setPedido(null), LIMITE_MS)
    return () => {
      clearTimeout(aparece)
      clearTimeout(limite)
    }
  }, [activo, pedido])

  if (!activo) return null
  const cartel = cartelDe === pedido.n

  return (
    <div
      data-testid="indicador-navegacion"
      role="progressbar"
      aria-label="Cargando la pantalla"
      aria-busy="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <div className="h-[3px] overflow-hidden bg-marca-soft">
        <div className="h-full w-1/3 rounded-full bg-marca motion-safe:animate-barra-carga" />
      </div>
      {cartel && (
        <div className="flex justify-center">
          <span
            data-testid="cartel-cargando"
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-pop"
          >
            <Rueda />
            Cargando…
          </span>
        </div>
      )}
    </div>
  )
}

/** La ruedita que pidió el dueño, textual: *"un timer, una ruedita o algo q me indique q esta
 *  cargando"*. SVG y no una imagen: pesa nada y hereda el color del texto. */
function Rueda() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="motion-safe:animate-spin">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
