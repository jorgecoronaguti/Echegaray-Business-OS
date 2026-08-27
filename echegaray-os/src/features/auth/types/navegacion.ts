// LAS SOLAPAS DE NIVEL 1 — lo que dice DÓNDE ESTOY en la barra de la aplicación.
//
// ═══ POR QUÉ NO SON LAS `Area` ═══
//
// `Area` es el NIVEL DE USUARIO y el dueño lo fijó en dos, textual: *"DOS NIVELES DE USUARIO. Sólo:
// ADMINISTRACIÓN / OBRAS. No crear más niveles de usuario"*. `ROLES_DE_AREA`, `usuario.area` y la
// pantalla de cuentas cuelgan de eso. Presupuestos NO es un nivel de usuario: es un DESTINO de la
// navegación, y meterlo en `Area` habría convertido «a qué solapa entro» en «qué clase de usuario
// soy», que son dos preguntas distintas con la misma palabra.
//
// ═══ PRESUPUESTOS SUBE A NIVEL 1 (00 · Home Navegación v2, zip del 25/08/2026) ═══
//
// El mockup dibuja tres solapas —Administración · Obras · Presupuestos— y le pone al tercero este
// `title`: *«Comercial, no administración: vive al lado de Obras»*. Hasta hoy `/presupuestos` era
// nivel 2 de Administración: estaba en la barra del área y su layout dibujaba esa barra.
//
// ESTO CONTRADICE UNA REGLA VIGENTE Y HAY QUE MIRARLO. El 24/08 se corrigió el header para que
// `/presupuestos`, `/documentos` y `/flujo-caja` pintaran «Administración» como activa (commit
// fdfdb03e: *«la nav perdía el "dónde estoy" en las rutas de primer nivel»*). Desde acá,
// `/presupuestos` pinta SU PROPIA solapa. El PROPÓSITO de aquella corrección se conserva —ninguna
// ruta de primer nivel se queda sin decir dónde estás— y su letra cambia sólo para Presupuestos:
// `/documentos` y `/flujo-caja` siguen pintando Administración, y el test lo fija.
//
// LA VE SÓLO QUIEN PUEDE ABRIRLA. `/presupuestos` está en `RUTAS_SOLO_ECONOMIA`: un presupuesto ES
// precio. Al jefe de obra no se le dibuja la solapa, igual que antes no se le dibujaba la sección.

import type { Rol } from './index'
import { AREA_HREF, AREA_LABEL, areasDe, puedeVerRuta } from './areas.ts'

export interface SolapaNav {
  clave: string
  label: string
  href: string
}

/** `/presupuestos` es la única solapa de nivel 1 que no es un área de usuario. */
const PRESUPUESTOS: SolapaNav = { clave: 'presupuestos', label: 'Presupuestos', href: '/presupuestos' }

/**
 * LAS SOLAPAS QUE ESTE ROL VE, en el orden del mockup.
 *
 * El nivel Obras ve una sola y por eso su navegación no dibuja una barra de un elemento: dibuja el
 * nombre del área, que es información y no un botón que no lleva a ningún lado.
 */
export function solapasDeNav(rol: Rol | null | undefined): SolapaNav[] {
  const areas = areasDe(rol).map((a) => ({ clave: a, label: AREA_LABEL[a], href: AREA_HREF[a] }))
  return puedeVerRuta(rol, PRESUPUESTOS.href) ? [...areas, PRESUPUESTOS] : areas
}

/**
 * QUÉ SOLAPA ESTÁ ENCENDIDA. Sale de la RUTA y no de un estado: la misma URL abierta en otra
 * pestaña se pinta igual.
 *
 * El orden importa: Presupuestos se evalúa ANTES que Administración, porque su ruta es de primer
 * nivel y hasta hoy la absorbía la expresión de Administración.
 *
 * Con una sola solapa visible, esa es la activa: quien sólo ve Obras está siempre en Obras, incluso
 * en `/campo` o en `/mi-informacion`, que no empiezan con `/obras`.
 */
/**
 * ═══ LA HOME ERA INALCANZABLE, Y HACÍA NUEVE MESES QUE LO ERA (27/08/2026) ═══
 *
 * `/` redirige a `/flujo-caja` desde el 09/07/2026 —*«el OS se enfoca en Flujo de Caja: el home es
 * el espejo del Sheet»*—, y `/flujo-caja` no está en ninguna barra: no es una de las tres solapas de
 * nivel 1 (el mockup 00 v2 dibuja tres y un test lo fija) ni uno de los siete destinos de
 * Administración (ídem). Efecto medido en el árbol: en todo `src/` no hay un solo `<Link>` que
 * lleve ahí. Se entra al sistema y se aterriza en la home; en cuanto se toca cualquier solapa, no
 * hay forma de volver salvo escribir la URL.
 *
 * SE ARREGLA POR LA MARCA, NO CON UNA CUARTA SOLAPA. El isotipo ya se anuncia como
 * `«Echegaray Construcciones — inicio»` y llevaba a `solapas[0]`, que es la entrada del ÁREA, no el
 * inicio: el aria-label decía una cosa y el `href` hacía otra. Ahora apunta a `/` y esta función
 * decide qué es «inicio» para cada nivel. Agregar una cuarta solapa habría cambiado un contrato de
 * diseño que el dueño aprobó, y eso no lo decide una limpieza de rutas.
 *
 * ES ROL A ROL PORQUE UN REDIRECT FIJO REBOTA. Con `/` → `/flujo-caja` para todos, un jefe de obra
 * hacía dos saltos (`/` → `/flujo-caja` → `/obras`, porque la ruta está en `RUTAS_SOLO_ECONOMIA`) y
 * un empleado tres. El destino se decide con el MISMO portero que el middleware: si `puedeVerRuta`
 * dice que no, no se lo manda ahí.
 */
export function destinoDeLaHome(rol: Rol | null | undefined): string {
  // El empleado no entra por el área: entra por su día. `/obras` —que sería su primera solapa— no
  // está en `CAMPO_RUTAS_PERMITIDAS` y el middleware lo rebotaría igual.
  if (rol === 'campo') return '/hoy'
  if (puedeVerRuta(rol, HOME_ECONOMICA)) return HOME_ECONOMICA
  return solapasDeNav(rol)[0].href
}

/** La home que fijó el dueño el 09/07/2026. La abre quien puede abrirla, y nadie más. */
const HOME_ECONOMICA = '/flujo-caja'

export function solapaActiva(pathname: string, solapas: SolapaNav[]): string | null {
  if (solapas.length === 1) return solapas[0].clave
  if (/^\/presupuestos(\/|$)/.test(pathname)) return 'presupuestos'
  if (/^\/(administracion|clientes|documentos|flujo-caja)(\/|$)/.test(pathname)) return 'administracion'
  if (/^\/(obras|obra|integraciones|campo|hoy|mi-trabajo|mi-informacion)(\/|$)/.test(pathname)) {
    return 'obras'
  }
  return null
}
