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
// ═══ PRESUPUESTOS VUELVE A NIVEL 2 (dueño, 21/09/2026) ═══
//
// Textual, mirando la barra: *«"presupuestos" es una sección dentro de CRM admin»*.
//
// Había subido a nivel 1 el 25/08 por el mockup «00 · Home Navegación v2», que lo dibujaba al lado
// de Obras con el `title` *«Comercial, no administración: vive al lado de Obras»*. El dueño lo
// revierte: un presupuesto se hace PARA UN CLIENTE, y el cliente vive en Administración. Vuelve a
// la barra del área, al lado de Clientes, y `/presupuestos` vuelve a pintar «Administración» como
// activa — que es lo que hacían `/documentos` y `/flujo-caja` desde la corrección del 24/08
// (fdfdb03e, *«la nav perdía el "dónde estoy" en las rutas de primer nivel»*), y ahora otra vez las
// tres por la misma regla.
//
// LA VE SÓLO QUIEN PUEDE ABRIRLA, y eso no cambia: `/presupuestos` sigue en `RUTAS_SOLO_ECONOMIA`
// —un presupuesto ES precio— así que al jefe de obra no se le dibuja la sección.

import type { Rol } from './index'
import { AREA_HREF, AREA_LABEL, INICIO_JEFE_TELEFONO, areasDe, puedeVerRuta } from './areas.ts'
export { INICIO_JEFE_TELEFONO }

export interface SolapaNav {
  clave: string
  label: string
  href: string
}

/**
 * ANALÍTICAS, CUARTO DESTINO (dueño, 17/09/2026 · «Analíticas v6»). Tampoco es un nivel de usuario: es
 * la lectura económica de la cartera entera —gasto contra contrato, caja, nómina, cobranza— y por eso
 * la ve sólo quien ve economía. La ruta está en `RUTAS_SOLO_ECONOMIA` y la base cierra la puerta
 * (`analiticas_costos` devuelve null sin `ve_economia()`): la solapa no es la cerradura.
 */
const ANALITICAS: SolapaNav = { clave: 'analiticas', label: 'Analíticas', href: '/analiticas' }

/**
 * HERRAMIENTAS, CUARTO DESTINO, AL FINAL (dueño, 21/09/2026). Textual: menú de nivel 1
 * «Administración · Obras · Analíticas · Herramientas». No es un nivel de usuario: es el inventario de
 * herramientas, equipos y rodados, y lo ven TODOS los niveles con los mismos permisos («todos los niveles
 * de usuario con permisos iguales»). Sin perfil (`null`) no se dibuja: sin saber quién entró se cae al
 * nivel menos privilegiado, y el cliente del portal no tiene barra del OS.
 */
const HERRAMIENTAS: SolapaNav = { clave: 'herramientas', label: 'Herramientas', href: '/herramientas' }

/**
 * LAS SOLAPAS QUE ESTE ROL VE, en el orden del mockup.
 *
 * El nivel Obras ve una sola y por eso su navegación no dibuja una barra de un elemento: dibuja el
 * nombre del área, que es información y no un botón que no lleva a ningún lado.
 */
export function solapasDeNav(rol: Rol | null | undefined): SolapaNav[] {
  const areas = areasDe(rol).map((a) => ({ clave: a, label: AREA_LABEL[a], href: AREA_HREF[a] }))
  const destinos = [ANALITICAS].filter((d) => puedeVerRuta(rol, d.href))
  const herramientas = rol && rol !== 'cliente' ? [HERRAMIENTAS] : []
  // HERRAMIENTAS ANTES QUE ANALÍTICAS (dueño, 23/09/2026: «cambiar de lugar analíticas con herramientas»).
  return [...areas, ...herramientas, ...destinos]
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
/**
 * @param telefono ¿La petición viene de un teléfono? (`pareceTelefonoSegun(headers())`). Sólo cambia
 *   el inicio del jefe de obra. Por defecto `false`: escritorio, que es lo que siempre fue.
 */
export function destinoDeLaHome(rol: Rol | null | undefined, telefono = false): string {
  // El empleado no entra por el área: entra por su día. `/obras` —que sería su primera solapa— no
  // está en `CAMPO_RUTAS_PERMITIDAS` y el middleware lo rebotaría igual.
  if (rol === 'campo') return '/hoy'
  // ═══ EL JEFE DE OBRA EN EL TELÉFONO ENTRA POR SU OBRA (dueño, 23/09/2026) ═══
  //
  // J01–J06 (`/obra/*`) existían sin una sola puerta: `destinoDeLaHome('jefe_obra')` lo dejaba en
  // la cartera de clientes de escritorio, y desde ahí no había enlace a `/obra/hoy`. El dueño
  // resolvió la duda 3 del mapa de pantallas: en el teléfono su inicio es `/obra/hoy`; en
  // escritorio sigue en Administración. Es el dispositivo el que decide, no el rol solo.
  if (rol === 'jefe_obra' && telefono) return INICIO_JEFE_TELEFONO
  // ═══ EN EL TELÉFONO, TAMBIÉN DIRECCIÓN Y ADMINISTRACIÓN ENTRAN POR CAMPO (dueño, 23/09/2026) ═══
  //
  // «Ésa es la vista con mi usuario admin»: la cartera de Clientes de escritorio dibujada en el celular.
  // El teléfono es para operar (parte, material, problema, asistencia, herramientas, movimientos); la
  // computadora es para administrar. Con el mismo usuario, el dispositivo elige la cara.
  // 24/09/2026 el dueño eligió para Administración una barra de gestión propia (Obras · Personal ·
  // Compras · Datos · Más): su inicio en el teléfono pasa a ser Obras, el primero de la barra. Trabajo
  // (`/campo`) sigue a un toque, dentro de «Más».
  if ((rol === 'direccion' || rol === 'administracion') && telefono) return '/obras'
  // ═══ YA NO HAY HOME ECONÓMICA (27/08/2026) ═══
  //
  // Hasta hoy esto devolvía `/flujo-caja` a quien pudiera abrirla, por la decisión del 09/07. El
  // dueño la retiró: *«hay una de flujo-caja que está deprecada y se accede por error o saliendo de
  // una página»*. Sin destino especial, cada nivel entra por la primera solapa de su área — que es
  // la que la barra ya pinta como activa, así que entrar y volver son el mismo lugar.
  return solapasDeNav(rol)[0].href
}

export function solapaActiva(pathname: string, solapas: SolapaNav[]): string | null {
  if (solapas.length === 1) return solapas[0].clave
  if (/^\/analiticas(\/|$)/.test(pathname)) return 'analiticas'
  // `/h/<código>` es la puerta del QR: abre la ficha de Herramientas.
  if (/^\/(herramientas|h)(\/|$)/.test(pathname)) return 'herramientas'
  // `/integraciones` («Fuentes») cuelga de Administración desde el 23/09/2026 (dueño, duda 6 del
  // mapa de pantallas): es el estado de las conexiones del OS, no una pantalla de obra.
  if (/^\/(administracion|clientes|documentos|presupuestos|integraciones)(\/|$)/.test(pathname)) return 'administracion'
  if (/^\/(obras|obra|campo|hoy|mi-trabajo|mi-informacion)(\/|$)/.test(pathname)) {
    return 'obras'
  }
  return null
}
