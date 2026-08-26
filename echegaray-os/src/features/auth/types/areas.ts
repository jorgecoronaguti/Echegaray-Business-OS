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
  '/administracion/usuarios', '/flujo-caja', '/ingenieria-financiera', '/calendario-financiero',
  '/calendario-caja', '/scorecard-finanzas', '/reportes', '/aprobaciones', '/operarios',
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
  // `/administracion/cronograma` entra el 26/08/2026 con el portal del cliente. Ahí se edita lo que
  // un cliente ve de SU plata: contrato, certificaciones, facturas, recibos, montos y fechas. Es
  // precio y es cobro; el jefe de obra no lo ve, igual que no ve un presupuesto.
  '/administracion/cronograma',
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
