'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { abreNavegacionInterna, pedidoVigente, type PedidoDeNavegacion } from './navegacion'

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
  const [pedidoGuardado, setPedido] = useState<PedidoDeNavegacion | null>(null)
  // UN PEDIDO CUMPLIDO SE BORRA, no sólo se ignora: si quedaba guardado, ATRÁS al origen lo revivía
  // (ver `pedidoVigente`). Se borra durante el render —el patrón de React para ajustar estado a una
  // prop que cambió— y no en un efecto, por la misma razón de arriba.
  const pedido = pedidoVigente(pedidoGuardado, rutaActual)
  if (pedidoGuardado !== null && pedido === null) setPedido(null)
  const activo = pedido !== null

  useEffect(() => {
    function alClic(e: MouseEvent) {
      const objetivo = e.target as Element | null
      const ancla = objetivo?.closest?.('a')
      if (!ancla) return
      // UN BOTÓN O UN CAMPO ADENTRO DE LA FILA-ENLACE es del control, no del enlace (dueño, 16/09/2026: «se queda
      // cargando en Plantel, Clientes, Compras»). Y la decisión se toma en un `setTimeout(0)`, como en `alEnviar`:
      // este escucha corre en captura, antes que React, y ahí `defaultPrevented` todavía no dice nada.
      const control = objetivo?.closest?.('button, input, select, textarea, label, summary, [role="button"], [role="separator"]')
      const dentroDeControl = control != null && ancla.contains(control)
      const desde = `${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`
      const clic = {
        href: ancla.getAttribute('href'),
        target: ancla.getAttribute('target'),
        descarga: ancla.hasAttribute('download'),
        conModificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
        botonPrincipal: e.button === 0,
        dentroDeControl,
        urlActual: window.location.href,
      }
      setTimeout(() => {
        if (abreNavegacionInterna({ ...clic, yaPrevenido: e.defaultPrevented })) setPedido({ desde, n: Date.now() })
      }, 0)
    }
    // ═══ UN GUARDADO EN EL LUGAR NO ES UNA NAVEGACIÓN (19/08/2026) ═══
    //
    // EL DEFECTO, reportado por el dueño con captura: guarda la obra, la pantalla dice
    // **"Obra guardada."** y al mismo tiempo sigue el cartel **"Cargando…"**, y hay que recargar a
    // mano. La causa está acá: este escucha se prendía con CUALQUIER `submit`, y el indicador sólo se
    // apaga cuando cambia la ruta. Un formulario contra una Server Action que guarda y se queda en la
    // misma pantalla NO cambia de ruta, así que la barra quedaba corriendo hasta el límite de dos
    // minutos, encima del mensaje de éxito. Es exactamente el modo de falla que este componente
    // declaró querer evitar —"una barra corriendo para siempre arriba de una pantalla que nunca
    // cambia"— y estaba entrando por la puerta de los formularios.
    //
    // CÓMO SE DISTINGUE, SIN ADIVINAR. `FormAccion` intercepta el envío con `preventDefault()` y
    // ejecuta la acción por `startTransition`: no hay navegación. Un formulario que sí navega —el
    // login, un POST nativo— no lo previene. Este escucha está en CAPTURA, así que corre ANTES que el
    // manejador de React y ahí `defaultPrevented` todavía es `false`; por eso la decisión se toma en
    // un `setTimeout(0)`, cuando el evento ya terminó de propagarse y la respuesta es definitiva.
    //
    // Y el guardado no se queda mudo: el propio botón de `FormAccion` dice "Guardando…" mientras
    // corre, que es la señal correcta para algo que pasa DENTRO de la pantalla y no entre pantallas.
    function alEnviar(e: Event) {
      const desde = `${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`
      setTimeout(() => {
        if (e.defaultPrevented) return
        setPedido({ desde, n: Date.now() })
      }, 0)
    }
    // ATRÁS/ADELANTE REEMPLAZA LO QUE SE HABÍA PEDIDO: el router aborta la navegación en curso
    // (los `ERR_ABORTED` del QA) y, si la historia devuelve a la misma ruta de origen, la ruta no
    // cambia y nada más apagaría el pedido abandonado.
    function alVolver() {
      setPedido(null)
    }
    document.addEventListener('click', alClic, true)
    document.addEventListener('submit', alEnviar, true)
    window.addEventListener('popstate', alVolver)
    return () => {
      document.removeEventListener('click', alClic, true)
      document.removeEventListener('submit', alEnviar, true)
      window.removeEventListener('popstate', alVolver)
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

  if (pedido === null) return null
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
