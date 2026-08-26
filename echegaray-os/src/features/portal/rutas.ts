// LAS RUTAS DEL PORTAL, EN UN SOLO LUGAR.
//
// Viven fuera de `services/portalActions.ts` por una razón del framework, no de estilo: un archivo
// `'use server'` sólo puede exportar funciones asíncronas, y una constante exportada ahí adentro
// rompe el build entero con un error que no menciona la constante.

/** La pantalla del cliente (`29`). */
export const RUTA_PORTAL = '/portal'

/** El ingreso sin contraseña (`30`). Es pública: llega sin sesión por definición. */
export const RUTA_PORTAL_INGRESAR = '/portal/ingresar'

/** Una obra concreta del cliente. */
export const rutaObraPortal = (obraId: string) => `/portal/obra/${encodeURIComponent(obraId)}`

/**
 * ¿ESTA RUTA ES DEL PORTAL? `/portales` y `/portal-interno` NO lo son: se compara el segmento.
 */
export function esRutaPortal(pathname: string): boolean {
  return pathname === RUTA_PORTAL || pathname.startsWith(`${RUTA_PORTAL}/`)
}

/**
 * ¿A DÓNDE HAY QUE MANDAR A ESTA PERSONA? `null` = se queda donde está.
 *
 * ═══ EL CONFINAMIENTO ES EN LAS DOS DIRECCIONES ═══
 *
 * El `cliente` es el primer rol EXTERNO del sistema: no es un empleado con menos permisos, es
 * alguien de otra empresa. El cliente no sale de /portal, y nadie de adentro entra a /portal.
 *
 * La segunda mitad suele olvidarse y no es cosmética: /portal dibuja lo que ve el cliente, filtrado
 * por `cliente_de_sesion()`, que para un empleado devuelve NULL. Vería una pantalla vacía y creería
 * que el cliente no tiene nada.
 *
 * Se resuelve acá, en una función pura, y no con dos `if` sueltos en el middleware, porque es la
 * regla de aislamiento entre una empresa y sus clientes: tiene que poder probarse sin levantar Next.
 *
 * Un rol desconocido o ausente NO es cliente y NO entra al portal: falla cerrado en las dos puertas.
 *
 * ═══ POR QUÉ VIVE ACÁ Y NO EN `types.ts` ═══
 *
 * La importa el MIDDLEWARE, que corre en el runtime edge en cada request. `types.ts` tiene los
 * esquemas de Zod del portal y sus `z.object(...)` se ejecutan al importar el módulo: colgar el
 * confinamiento de ahí metía Zod entero en el middleware. Acá el archivo no importa nada.
 */
export function destinoPorRol(
  rol: string | null | undefined,
  pathname: string,
  /** La petición trae una sesión de portal firmada (la cookie de la VISTA PREVIA). */
  conSesionDePortal = false,
): string | null {
  // El cliente sólo existe dentro del portal.
  if (rol === 'cliente') return esRutaPortal(pathname) ? null : RUTA_PORTAL

  // ═══ LA EXCEPCIÓN: LA VISTA PREVIA DE DIRECCIÓN (26/08/2026) ═══
  //
  // El confinamiento de arriba existe porque un empleado dentro de `/portal` vería una pantalla
  // vacía —las consultas filtran por el cliente de la sesión— y concluiría que el cliente no tiene
  // nada cargado. Eso sigue siendo cierto para quien entra sin querer.
  //
  // No lo es para quien entra A PROPÓSITO desde la ficha del cliente: `/portal/vista-previa/<x>`
  // comprueba la sesión del OS y el permiso económico, y firma una cookie de portal acotada a ESE
  // cliente. Con esa cookie las consultas devuelven lo que el cliente ve, que es exactamente lo que
  // se fue a mirar. Sin la excepción, el enlace de la ficha rebotaba a `/flujo-caja`.
  //
  // ESTO ES LA PUERTA, NO LA CERRADURA: acá sólo se mira que la cookie EXISTA. Que sea válida, que
  // esté firmada y que ese cliente exista lo decide el servidor en cada pantalla.
  if (esRutaVistaPrevia(pathname)) return null
  if (esRutaPortal(pathname) && conSesionDePortal) return null

  // Y el portal sólo existe para el cliente. Incluye al rol nulo: un usuario autenticado sin perfil
  // no puede colarse a la vista del cliente.
  if (esRutaPortal(pathname)) return '/'

  return null
}

/** La puerta de la vista previa: `/portal/vista-previa/<cliente>`. */
export function esRutaVistaPrevia(pathname: string): boolean {
  return pathname === RUTA_VISTA_PREVIA || pathname.startsWith(`${RUTA_VISTA_PREVIA}/`)
}

export const RUTA_VISTA_PREVIA = '/portal/vista-previa'
