// EL ENLACE PERSONAL DE INGRESO AL PORTAL — núcleo puro (sin Next ni base), con su prueba.
//
// Hasta el 25/09/2026 el portal abría la sesión de un cliente con sólo escribir un mail habilitado: sin
// código, sin clave. Quien supiera el correo de un contacto veía las obras, facturas, pagos y documentos
// de ese cliente. Ahora se entra con un enlace que Administración copia desde la ficha del cliente
// («Copiar enlace de ingreso») y le manda a esa persona.
//
// El enlace lleva 32 bytes al azar (256 bits: adivinarlo no es un riesgo). En la base se guarda sólo el
// SHA-256 del token: leer `cliente_acceso` no alcanza para armar un enlace. Generar uno nuevo pisa el
// hash y el anterior deja de servir.
import { createHash, randomBytes } from 'node:crypto'

export const RUTA_INGRESO_CON_ENLACE = '/portal/ingresar'

/** 32 bytes en base64url: 43 caracteres, sin relleno. */
export function nuevoToken(): string {
  return randomBytes(32).toString('base64url')
}

/** La forma de un token: se mira ANTES de consultar la base, así un valor raro no llega a PostgREST. */
export function pareceToken(t: string | null | undefined): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
}

/** Lo que se guarda: el SHA-256 en hex. Nunca el token. */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** El enlace entero, con la base del sitio (la de producción, no localhost). */
export function enlaceDeIngreso(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}${RUTA_INGRESO_CON_ENLACE}?t=${token}`
}
