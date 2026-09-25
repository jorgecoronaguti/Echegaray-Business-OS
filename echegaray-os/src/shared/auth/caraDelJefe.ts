// LA CARA DE COMPUTADORA DEL JEFE DE OBRA — a dónde va cada pantalla del teléfono cuando el jefe
// la abre desde una PC. Módulo puro (sin `@/`), probado con `node --test`.
//
// ═══ POR QUÉ EXISTE (dueño, 25/09/2026) ═══
//
// «El jefe en la PC entra a su pantalla de teléfono. ¿Qué sería eso? Tiene que tener un diseño de
// computadora». Desde el 24/09 todo lo del jefe desembocaba en `/obra/hoy` (J01) en cualquier aparato:
// en la computadora eso era la columna de 390 px en el medio de un monitor, y hasta la solapa «Obras»
// lo llevaba ahí.
//
// ═══ EL APARATO ELIGE LA CARA, NO EL INICIO ═══
//
// La regla del 24/09 («el inicio no depende de la detección del aparato») sigue en pie para el
// INICIO: `destinoDeLaHome('jefe_obra')` es `/obra/hoy` desde cualquier lado, y así lo prueban sus
// tests. Lo que decide el aparato es con qué CARA se dibuja ese inicio: en el teléfono, J01; en la
// computadora, la misma obra en el ERP de escritorio. Esta función es esa traducción, y el middleware
// la aplica sólo cuando el navegador NO se declara teléfono (`pareceTelefono`).
//
// Si el aparato miente (un iPad que se presenta como Mac), el jefe cae en la cara de escritorio, que
// es responsive y bajo `md` lleva la MISMA barra de abajo que J01: se equivoca hacia una pantalla que
// funciona, nunca hacia una columna estirada.
//
// ═══ NO ES UNA CERRADURA ═══
//
// Todas las rutas de destino ya eran del jefe (`puedeVerRuta`). Esto sólo elige cuál de sus dos
// caras ve; qué filas salen lo sigue decidiendo la base (`ve_obra()`, `ve_efectivo_entrega()`).

/** La portada de escritorio del jefe: sus obras y el día de la que eligió. */
export const INICIO_JEFE_ESCRITORIO = '/obras/hoy'

/** Mi efectivo, en su versión de computadora (Mi cuenta). */
export const EFECTIVO_ESCRITORIO = '/mi-cuenta/efectivo'

/** Un id de obra de la URL o de la cookie. La misma forma que exige `fichaDeGestionPara`. */
const ID_OBRA = /^[a-z0-9][a-z0-9-]{0,99}$/i

function idValido(v: string | null | undefined): string | null {
  const id = (v ?? '').trim()
  return id && ID_OBRA.test(id) ? id : null
}

function portada(obra: string | null): string {
  return obra ? `${INICIO_JEFE_ESCRITORIO}?obra=${encodeURIComponent(obra)}` : INICIO_JEFE_ESCRITORIO
}

/**
 * La ruta de escritorio para una ruta del teléfono del jefe, o `null` si esta ruta no es del teléfono
 * del jefe (se deja pasar).
 *
 * `recordada` es la obra de la cookie `os_obra` (la última que el jefe abrió): una pantalla de la
 * barra sin `?obra=` tiene que abrir la MISMA obra que venía mirando, no la portada.
 */
export function caraDeEscritorioDelJefe(
  pathname: string,
  params: URLSearchParams,
  recordada?: string | null,
): string | null {
  const ruta = pathname.replace(/\/+$/, '') || '/'

  // MI EFECTIVO: lo que se MIRA y se FIRMA tiene cara de computadora. Rendir un gasto (la foto del
  // ticket) y declarar una devolución siguen en el teléfono: son actos de obra con la cámara en la mano.
  if (ruta === '/mi-informacion/efectivo' || ruta.startsWith('/mi-informacion/efectivo/rendiciones')) {
    return EFECTIVO_ESCRITORIO
  }
  if (ruta === '/mi-informacion/efectivo/firmar') {
    const entrega = idValido(params.get('entrega'))
    return entrega ? `${EFECTIVO_ESCRITORIO}?firmar=${encodeURIComponent(entrega)}` : EFECTIVO_ESCRITORIO
  }

  if (ruta !== '/obra' && !ruta.startsWith('/obra/')) return null

  const obra = idValido(params.get('obra')) ?? idValido(recordada)
  const ficha = obra ? `/obras/${encodeURIComponent(obra)}` : null

  if (ruta === '/obra/efectivo') return EFECTIVO_ESCRITORIO
  if (ruta === '/obra/hoy' || ruta === '/obra') return portada(obra)
  // Sin obra no hay ficha que abrir: la portada deja elegir.
  if (!ficha) return INICIO_JEFE_ESCRITORIO

  if (ruta === '/obra/tareas' || ruta === '/obra/frente') return `${ficha}?vista=tareas`
  if (ruta === '/obra/avance-masivo') return `${ficha}?vista=tareas&sub=parte`
  if (ruta === '/obra/personas') return `${ficha}?vista=personal`
  if (ruta === '/obra/avance') {
    // `/obra/avance?actividad=` es el formulario de UNA tarea: su par de escritorio es la pantalla
    // entera de avance de esa actividad. Sin actividad es J03 (cómo viene la obra) = el Resumen.
    const actividad = idValido(params.get('actividad'))
    return actividad ? `${ficha}/avance/${encodeURIComponent(actividad)}` : ficha
  }
  return portada(obra)
}
