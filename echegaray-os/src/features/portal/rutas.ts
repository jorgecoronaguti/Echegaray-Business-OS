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
