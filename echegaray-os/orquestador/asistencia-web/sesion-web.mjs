// SESIÓN DE LA PANTALLA — cookie firmada, sin base y sin estado en el servidor.
//
// POR QUÉ EXISTE. El enlace que emite Mattermost es de UN SOLO USO (lo consume el frente
// C contra Postgres). Ese enlace abre el HTML y se quema ahí. Si las tres llamadas de la
// API viajaran con el mismo token, la primera lo consumiría y la pantalla quedaría muerta
// a los dos segundos. Entonces: el token se canjea UNA vez por una sesión corta de
// navegador, y la API se autentica con esa sesión.
//
// La sesión NO lleva permisos: lleva la identidad real de Mattermost (userId, username).
// Quién puede escribir lo sigue decidiendo `asistencia-permisos.mjs` en cada pedido, y la
// auditoría se sigue firmando con esa identidad. Una cookie robada no gana atribuciones
// que la persona no tuviera.
//
// Formato: base64url(payload JSON) '.' base64url(HMAC-SHA256). Sin dependencias.

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'

export const NOMBRE_COOKIE = 'asistencia_sesion'

/** Vida de la sesión de pantalla. Corta a propósito: es una carga, no un portal. */
export const TTL_SEGUNDOS = Number(process.env.ORQ_ASISTENCIA_WEB_TTL ?? 4 * 3600)

const b64u = (buf) => Buffer.from(buf).toString('base64url')

function firmar(secreto, texto) {
  return createHmac('sha256', String(secreto)).update(texto).digest()
}

/** Comparación en tiempo constante, tolerante a largos distintos. */
function igual(a, b) {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Emite el valor de la cookie de sesión.
 * @returns {{valor:string, expira:string, sid:string}}
 */
export function emitirSesion({ secreto, userId, username = null, ttlSegundos = TTL_SEGUNDOS, ahora = Date.now() } = {}) {
  if (!secreto) throw new Error('sesion-web: falta el secreto de firma')
  if (!userId) throw new Error('sesion-web: falta la identidad de la plataforma')
  const exp = Math.floor(ahora / 1000) + Number(ttlSegundos)
  const sid = randomUUID()
  const payload = b64u(JSON.stringify({ u: String(userId), n: username ? String(username) : null, exp, sid }))
  return {
    valor: `${payload}.${b64u(firmar(secreto, payload))}`,
    expira: new Date(exp * 1000).toISOString(),
    sid,
  }
}

/**
 * Verifica la cookie. Fail-closed: cualquier duda es `invalida`, nunca "pasá igual".
 * @returns {{ok:true, userId:string, username:string|null, sid:string}
 *          |{ok:false, motivo:'ausente'|'invalida'|'expirada'}}
 */
export function verificarSesion({ secreto, valor, ahora = Date.now() } = {}) {
  if (!secreto) return { ok: false, motivo: 'invalida' }
  const crudo = typeof valor === 'string' ? valor.trim() : ''
  if (!crudo) return { ok: false, motivo: 'ausente' }
  const corte = crudo.lastIndexOf('.')
  if (corte <= 0) return { ok: false, motivo: 'invalida' }
  const payload = crudo.slice(0, corte)
  let firma
  try {
    firma = Buffer.from(crudo.slice(corte + 1), 'base64url')
  } catch {
    return { ok: false, motivo: 'invalida' }
  }
  if (!igual(firma, firmar(secreto, payload))) return { ok: false, motivo: 'invalida' }
  let datos
  try {
    datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, motivo: 'invalida' }
  }
  if (!datos?.u || !Number.isFinite(Number(datos.exp))) return { ok: false, motivo: 'invalida' }
  if (Number(datos.exp) * 1000 <= ahora) return { ok: false, motivo: 'expirada' }
  return { ok: true, userId: String(datos.u), username: datos.n ?? null, sid: String(datos.sid ?? '') }
}

/** Lee una cookie del header sin parsear de más. */
export function leerCookie(cabecera, nombre = NOMBRE_COOKIE) {
  const linea = typeof cabecera === 'string' ? cabecera : ''
  for (const parte of linea.split(';')) {
    const i = parte.indexOf('=')
    if (i < 0) continue
    if (parte.slice(0, i).trim() !== nombre) continue
    return decodeURIComponent(parte.slice(i + 1).trim())
  }
  return null
}

/** Arma el `Set-Cookie`. `Secure` es el default: en producción esto va detrás de HTTPS. */
export function armarCookie({ valor, ruta = '/asistencia', ttlSegundos = TTL_SEGUNDOS, segura = true } = {}) {
  const partes = [
    `${NOMBRE_COOKIE}=${encodeURIComponent(valor)}`,
    `Path=${ruta}`,
    `Max-Age=${Math.max(0, Math.floor(ttlSegundos))}`,
    'HttpOnly',
    'SameSite=Strict',
  ]
  if (segura) partes.push('Secure')
  return partes.join('; ')
}
