// COMPARAR UN SECRETO, BIEN. Ocho líneas que ya estaban escritas dos veces.
//
// POR QUÉ EXISTE ESTE ARCHIVO. `comando-asistencia.mjs` tenía su propia versión y el
// endpoint de acciones necesitaba la misma: una tercera copia era garantizar que algún día
// una de las tres se comparara con `===`. Vive acá, al lado de sus dos usuarios, y no en
// `lib/`: no es una utilidad de dominio, es el borde HTTP de la comunicación.
//
// POR QUÉ NO `===`. Comparar dos strings con `===` corta en el primer byte distinto, así
// que el TIEMPO de la respuesta cuenta cuántos caracteres acertó quien prueba. Con
// suficientes intentos eso permite adivinar el secreto de a un byte. `timingSafeEqual`
// tarda lo mismo siempre.

import { timingSafeEqual } from 'node:crypto'

const esTexto = (v) => typeof v === 'string' && v.length > 0

/**
 * ¿Son el mismo secreto? Falso si falta cualquiera de los dos.
 *
 * Ojo con la longitud: `timingSafeEqual` tira si los buffers miden distinto, así que se
 * compara antes. Eso filtra el largo del secreto, que no es lo que hay que proteger.
 */
export function igualEnTiempoConstante(a, b) {
  if (!esTexto(a) || !esTexto(b)) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

/**
 * El secreto que viaja en la query (`?t=…`) de una URL de callback.
 *
 * Mattermost guarda la URL de integración del botón en su base y NO se la manda al cliente
 * (verificado contra el servidor real: `props.attachments[].actions[]` llega sin el bloque
 * `integration`, ni siquiera con un token de API). Por eso la query es un lugar legítimo
 * para el secreto: sólo el servidor de Mattermost la conoce.
 *
 * @param {string} url  la URL cruda del pedido (`req.url`), o una URL completa
 * @returns {string|null}
 */
export function secretoDeUrl(url) {
  const u = String(url ?? '')
  const q = u.indexOf('?')
  if (q < 0) return null
  const t = new URLSearchParams(u.slice(q + 1)).get('t')
  return esTexto(t) ? t : null
}

/**
 * Le cuelga el secreto a la URL de callback. Un solo lugar arma la URL que se guarda en el
 * mensaje, así que no puede pasar que el servidor exija un secreto que los botones no llevan.
 *
 * @param {string} url       URL base del callback
 * @param {string|null} sec  secreto, o nada
 */
export function urlConSecreto(url, sec) {
  const base = String(url ?? '')
  if (!esTexto(base) || !esTexto(sec)) return base
  return `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(sec)}`
}

/** URL por defecto del callback. Se resuelve en cada llamada: el proceso puede no tener el
 *  entorno cargado al momento de importar el módulo (el worker lo arma después). */
export const URL_ACCION_BASE = 'https://chat.ecsas.com.ar/asistencia/accion'

/**
 * La URL de callback con el secreto puesto, tal como sale del entorno. La usan las TRES
 * puertas que publican botones —el slash command, la mención `@os asistencia` y el
 * re-render de cada click—: si cada una armara la suya, alcanzaría con que una se olvidara
 * el secreto para que sus botones murieran en producción y en ningún test.
 */
export function urlAccionDeEntorno(env = process.env) {
  return urlConSecreto(env.ASISTENCIA_ACCION_URL || URL_ACCION_BASE, env.ASISTENCIA_ACCION_SECRETO || null)
}
