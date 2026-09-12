// LOS DOS NIVELES DE USUARIO DEL ERP — y nada más.
//
// El dueño (18/08), textual: *"DOS NIVELES DE USUARIO. Sólo: ADMINISTRACIÓN / OBRAS"* ·
// *"No crear más niveles de usuario"*.
//
// ═══ POR QUÉ NO SE CREAN ROLES NUEVOS ═══
//
// `perfiles.rol` ya tiene cuatro valores en producción (`direccion`, `administracion`, `jefe_obra`,
// `campo`) con usuarios reales colgando de ellos y policies de RLS escritas contra esos literales.
// Agregar dos valores más significaría migrar los cuatro, reescribir cada policy y quedarse con seis
// nombres para dos ideas. Lo que hacía falta no era un rol: era la AGRUPACIÓN, que es esto.
//
// La granularidad futura tampoco pide roles nuevos: pide filas en `usuario_obra`. El nivel dice QUÉ
// PUEDE HACER; la asignación dice SOBRE QUÉ OBRAS. Son dos ejes y se mantienen separados a propósito.

import type { Rol } from './index'

/** Las dos áreas de producto. Son las dos únicas entradas de la navegación global. */
export type Area = 'administracion' | 'obras'

/**
 * ═══ DOS PREGUNTAS QUE HASTA HOY ERAN UNA (19/08/2026) ═══
 *
 * El dueño: *"quiero que los usuarios con permisos de «jefe de obra» pueda acceder a administracion,
 * solo no quiero que vean los montos de venta de las obras"* y, precisando: *"los costos de las obras
 * que se han estipulado en la cotización… y lo que se lleva gastado, sí tienen que ver"*.
 *
 * `esAdministracion()` respondía a la vez «¿administra los maestros?» y «¿ve cuánto se vendió?»,
 * porque hasta hoy eran la misma gente. Se parte en dos, y la línea es COSTO / PRECIO:
 *
 *   `esAdministracion()`  administra personas, legajos, cuadrillas, clientes y proveedores, y ve el
 *                         COSTO de su obra —el presupuestado y el gastado—. Incluye al jefe de obra.
 *   `veEconomia()`        ve el PRECIO: contratado, monto presupuestado, margen, certificado,
 *                         facturado, cobrado. Y administra usuarios, que es la puerta a todo eso.
 *
 * Los dos fallan cerrado: un rol desconocido, o un usuario sin perfil, no es ninguna de las dos
 * cosas. El modo de fallar de un default permisivo es publicar lo que se vendió cada obra.
 *
 * ESTO ES LA PUERTA, NO LA CERRADURA. La base decide qué filas y qué columnas devuelve —
 * `es_administracion()` y `ve_economia()` en Postgres— y eso vale también para una llamada directa a
 * PostgREST que no pasa por ninguna ruta de Next.
 */
export function areaDe(rol: Rol | null | undefined): Area {
  return rol === 'direccion' || rol === 'administracion' || rol === 'jefe_obra'
    ? 'administracion'
    : 'obras'
}

/** ¿Administra los maestros y ve el COSTO de su obra? Dirección, Administración y Jefe de Obra. */
export const esAdministracion = (rol: Rol | null | undefined) => areaDe(rol) === 'administracion'

/**
 * ¿Ve el PRECIO? Cuánto se contrató, cuánto se presupuestó, el margen y lo certificado.
 *
 * También gobierna el alta de usuarios y el cambio de rol: si un jefe de obra pudiera ascender a
 * alguien —o ascenderse—, todo lo de arriba sería decorativo.
 */
export const veEconomia = (rol: Rol | null | undefined) =>
  rol === 'direccion' || rol === 'administracion'

/**
 * QUIÉN ENTRA A LIQUIDACIÓN DE HORAS. Dueño, 09/09/2026: *«sólo con nivel de usuario
 * administrador»*.
 *
 * Hoy devuelve el mismo conjunto que `veEconomia`, y aun así es una función aparte: `veEconomia`
 * gobierna la plata de las OBRAS, y el día que alguien la abra a un rol más —un cliente que mira su
 * certificado, un rol nuevo de compras— los sueldos del plantel se abrirían con ella sin que nadie
 * lo decida. Su gemela en Postgres es `public.liquida_sueldos()`, y por el mismo motivo tampoco es
 * `ve_economia()`.
 *
 * JEFE DE OBRA NO. `esAdministracion` lo incluye desde el 19/08/2026 y entra a esta misma pantalla
 * a cargar asistencia: usar esa función acá le abriría los sueldos de todos.
 */
export const liquidaSueldos = (rol: Rol | null | undefined) =>
  rol === 'direccion' || rol === 'administracion'

/**
 * LAS ÁREAS QUE VE UN ROL EN LA NAVEGACIÓN GLOBAL.
 *
 * Administración ve las dos —necesita entrar a una obra igual que un jefe—; el nivel Obras ve una
 * sola, y por eso su navegación no dibuja una barra de un solo elemento: dibuja el nombre del área.
 */
export function areasDe(rol: Rol | null | undefined): Area[] {
  return esAdministracion(rol) ? ['administracion', 'obras'] : ['obras']
}

export const AREA_LABEL: Record<Area, string> = {
  administracion: 'Administración',
  obras: 'Obras',
}

export const AREA_HREF: Record<Area, string> = {
  administracion: '/administracion',
  obras: '/obras',
}

// ═══ A DÓNDE VA `/administracion`, Y POR QUÉ LA DECISIÓN VIVE ACÁ Y NO EN SU `page.tsx` ═══
//
// `/administracion` no dibuja nada desde el 09/09/2026: la entrada del área ES la sección Clientes
// (ver el encabezado de `src/app/(main)/administracion/page.tsx`). Eso se resolvía con un
// `redirect('/clientes')` dentro del Server Component, y ahí estaba el defecto medido el 12/09/2026.
//
// LO MEDIDO. `(main)/layout.tsx` es SÍNCRONO y cuelga el header de un `<Suspense>` a propósito: el
// documento sale por streaming y el navegador pinta el marco antes de saber quién entró. Consecuencia
// mecánica: cuando el `page.tsx` llama a `redirect()`, los encabezados YA se mandaron, así que Next
// no puede contestar un 307 y se cae a su plan B — mete en el HTML
// `<meta http-equiv="refresh" content="1;url=/clientes">`. Comprobado leyendo el documento real de
// producción, y la traza de consultas lo muestra como un hueco de 1.046 ms entre el último viaje del
// documento de `/administracion` y el primero de `/clientes`:
//
//   perfiles            0 →   93 ms     ← el documento de /administracion, que no dibuja nada
//   (nada)             93 → 1139 ms     ← UN SEGUNDO de meta refresh
//   pantalla_clientes 1139 → 1781 ms    ← el documento de /clientes, el que sí sirve
//
// O sea: un documento entero de 20 kB con sus 13 chunks de JavaScript y su hidratación, más un
// segundo de pantalla quieta, para llegar a donde el usuario iba. El aterrizaje de ingreso de
// dirección, administración y jefe de obra es ESTA ruta: se paga todos los días, en cada entrada.
//
// EL ARREGLO ES DE MOMENTO, NO DE DESTINO: la misma redirección, decidida en el middleware —que corre
// ANTES de que exista un byte de respuesta— es un 307 de verdad. El `page.tsx` se queda como red: si
// el middleware alguna vez no corriera, la ruta sigue llegando a Clientes en vez de dar 404. Las dos
// capas leen ESTA constante, así que el destino está escrito una sola vez.
export const ENTRADA_DE_ADMINISTRACION = '/clientes'

/** La ruta a la que `/administracion` manda, o `null` si esta ruta no es la entrada del área. Se
 *  compara el path EXACTO: `/administracion/compras` es una pantalla de verdad y no se toca. */
export function entradaDeArea(pathname: string): string | null {
  return pathname === AREA_HREF.administracion ? ENTRADA_DE_ADMINISTRACION : null
}

/**
 * ═══ LAS RUTAS QUE EL NIVEL «OBRAS» NO PUEDE ABRIR ═══
 *
 * Es una lista NEGRA a propósito, y es la excepción a la regla del guard de sesión (que es blanca).
 * Motivo: acá el default correcto es PERMITIR —el jefe de obra tiene que poder trabajar— y lo que se
 * cierra es lo sensible, que es una lista corta y conocida. En el guard de sesión el default correcto
 * es NEGAR, porque lo que se protege es todo.
 *
 * NO reemplaza al RLS: la base decide qué filas devuelve, y eso vale también para una llamada directa
 * a PostgREST que no pasa por ninguna ruta de Next. Esto es la puerta; el RLS es la cerradura.
 */
/**
 * LAS RUTAS DEL DINERO. Las únicas que el jefe de obra no abre.
 *
 * `/administracion` y `/clientes` SALIERON de esta lista: el jefe de obra entra a administrar
 * personas, legajos, cuadrillas, clientes y proveedores. Lo que no ve son los montos de venta, y eso
 * lo cierran los grants de columna y `ve_economia()` en la base, no una lista de rutas.
 *
 * `/administracion/usuarios` SÍ queda cerrada, y no por económica: es la puerta a cambiar roles.
 */
export const RUTAS_SOLO_ECONOMIA = [
  '/administracion/usuarios', '/calendario-financiero',
  '/reportes', '/aprobaciones',
  // CUATRO SALIERON DE ACÁ PORQUE SALIERON DEL REPOSITORIO (27/08/2026):
  // `/ingenieria-financiera` (superconjunto de `/calendario-financiero`), `/calendario-caja`,
  // `/scorecard-finanzas` y `/operarios` (reemplazada por `/administracion/usuarios`). Ninguna
  // estaba enlazada desde ningún lado. Una entrada acá para una ruta que no existe hace creer que
  // hay una puerta cerrada donde no hay ninguna puerta, y el próximo que busque dónde se decide ese
  // acceso va a mirar acá.
  // `/presupuestos` entra el 21/08/2026 con el módulo. Un presupuesto ES precio: costo unitario,
  // margen, cascada y precio de venta. La base ya lo cierra —`cotizaciones_select` exige
  // `ve_economia()`— y esta lista es lo que hace que el jefe de obra ni siquiera vea la solapa.
  // Sin ella la pantalla sería más ancha que la base: un botón que lleva a «no hay nada».
  '/presupuestos',
  // `/documentos` entra el 21/08/2026 con la vista transversal del archivo. Las tres carpetas raíz
  // del índice de Drive son `administracion`, `archivo-fiscal` y `libro-sueldos`: la lista incluye
  // presupuestos de clientes, declaraciones juradas y libros de sueldos.
  //
  // LA CERRADURA YA ESTÁ PUESTA (21/08/2026, migración 5100). Hasta ese día esta línea decía que la
  // puerta no tenía cerradura detrás: `drive_index` era `using (true)` y cualquiera con sesión le
  // pedía a PostgREST el catálogo completo sin pasar por esta ruta. Ahora la policy dice lo MISMO
  // que esta lista —el catálogo entero es de `ve_economia()`— y el que no ve economía sólo alcanza
  // los archivos con vínculo propio (su legajo, sus obras, los del cliente si administra). La ruta
  // y la base ya no se contradicen.
  '/documentos',
  // `/administracion/cronograma` y `/administracion/portal` estuvieron acá menos de un día
  // (26/08/2026): eran dos pantallas del portal que duplicaban lo que la ficha del cliente ya
  // administraba en sus solapas 31 y 32. Se retiraron con sus rutas. Quién entra al portal y qué ve
  // se decide en la ficha del cliente, que es donde el dueño lo pidió: «es un crm ahi tiene q estar
  // todo». `/clientes` ya está más abajo, del lado de `veEconomia`.
] as const

/**
 * ═══ LA EXCEPCIÓN, Y POR QUÉ ES UNA SOLA (19/08/2026) ═══
 *
 * El dueño corrigió la política: *"Un usuario Obras debe poder consultar clientes, contactos… VER
 * INFORMACIÓN OPERATIVA ≠ ADMINISTRAR EL MAESTRO."*
 *
 * La distinción cae exactamente entre la CARTERA y la FICHA. `/clientes` es la pantalla donde se
 * administra el maestro —se da de alta, se archiva, se ve la cartera entera— y sigue siendo de
 * Administración. `/clientes/<cliente>` es la ficha de UN cliente: de quién es la obra, quién es el
 * contacto, qué documentos hay. Eso es información de ejecución y se abre, en modo lectura (los
 * formularios no se dibujan, y la RLS rechaza la escritura de todos modos).
 */
const FICHA_DE_CLIENTE = /^\/clientes\/[^/]+/

export function puedeVerRuta(rol: Rol | null | undefined, pathname: string): boolean {
  if (veEconomia(rol)) return true
  if (FICHA_DE_CLIENTE.test(pathname)) return true
  return !RUTAS_SOLO_ECONOMIA.some((r) => pathname === r || pathname.startsWith(r + '/'))
}
