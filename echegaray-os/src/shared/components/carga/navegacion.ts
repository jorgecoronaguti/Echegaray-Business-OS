// ¿ESTE CLIC ABRE UNA NAVEGACIÓN DE SERVIDOR? — la decisión, separada del componente que la usa.
//
// El dueño (hoy), textual: *"al acceder al «obras» la app no responde, no se mueve, nada"*. No era
// una impresión: TODA página del grupo `(main)` es un server component con `dynamic =
// 'force-dynamic'`, así que entre el clic y el primer píxel nuevo hay un render completo de servidor
// —medido contra producción, 95 s— durante el cual el navegador deja la pantalla ANTERIOR intacta.
// Sin un indicador, "está cargando" y "no hizo nada" se ven exactamente igual.
//
// El indicador se prende con el CLIC porque es el único momento del que el router no avisa: Next no
// expone eventos de navegación (no hay `router.events` en App Router), y `useLinkStatus` sólo existe
// adentro de un `<Link>` — sirve para el link, no para una barra global. Prender con el clic es
// además lo que hace que la señal aparezca ANTES de que React empiece la transición.
//
// POR QUÉ ESTA FUNCIÓN VIVE SOLA Y NO ADENTRO DEL COMPONENTE: prender la barra cuando el clic NO va
// a navegar es peor que no tenerla — queda una barra corriendo para siempre arriba de una pantalla
// que nunca cambia, y el usuario aprende a no mirarla. Todos esos casos (nueva pestaña, descarga,
// mailto, link externo, ancla a la misma página) son decisiones puras y se prueban sin navegador.

export type ClicDeNavegacion = {
  /** `href` crudo del ancla, tal como está escrito en el HTML. */
  href: string | null
  /** `target` del ancla. Cualquier cosa distinta de `_self` abre afuera de esta pestaña. */
  target?: string | null
  /** El ancla tiene atributo `download`. */
  descarga?: boolean
  /** Ctrl/Cmd/Shift/Alt apretados: el navegador abre en otra pestaña o ventana. */
  conModificador?: boolean
  /** Botón principal del mouse (0). El del medio abre en pestaña nueva. */
  botonPrincipal?: boolean
  /** Alguien ya llamó a `preventDefault()`: el clic lo maneja otro. */
  yaPrevenido?: boolean
  /** URL completa de la pantalla actual (`window.location.href`). */
  urlActual: string
}

/**
 * `true` sólo cuando el clic va a producir una navegación de App Router a OTRA ruta de este mismo
 * sitio — que es exactamente el caso en el que hay una espera de servidor que mostrar.
 */
export function abreNavegacionInterna(c: ClicDeNavegacion): boolean {
  if (!c.href) return false
  if (c.yaPrevenido) return false
  if (c.descarga) return false
  if (c.conModificador) return false
  if (c.botonPrincipal === false) return false
  if (c.target && c.target !== '_self') return false

  let destino: URL
  let actual: URL
  try {
    actual = new URL(c.urlActual)
    destino = new URL(c.href, c.urlActual)
  } catch {
    return false
  }

  // `mailto:`, `tel:`, `blob:`, `javascript:` — no son navegaciones de página.
  if (destino.protocol !== 'http:' && destino.protocol !== 'https:') return false
  if (destino.origin !== actual.origin) return false

  // MISMA RUTA = NO HAY ESPERA. Un `#seccion` de la misma página, o el link a la pantalla donde ya
  // estoy parado, no dispara render de servidor: la barra se prendería y no se apagaría nunca.
  if (destino.pathname === actual.pathname && destino.search === actual.search) return false

  return true
}
