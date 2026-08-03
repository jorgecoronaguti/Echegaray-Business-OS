// EL CLIENTE DE MATTERMOST *DEL OS*, armado una sola vez desde el entorno.
//
// POR QUÉ EXISTE. La verificación de membresía de canal (`lib/permiso-de-canal.mjs`) hace falta en
// cuatro bordes distintos: la guarda de asistencia, la de comprobantes, el ruteador de acciones y el
// flujo conversacional. Ninguno de esos cuatro tiene por qué saber de dónde sale un token, y hacer
// que cada uno construya el suyo obligaría a enhebrar el cliente por seis firmas de función — o,
// peor, a que cada uno leyera el entorno a su manera.
//
// Es exactamente el mismo patrón que `googleDelOs()`: una sola fábrica, memoizada, que devuelve
// `null` cuando el entorno no está configurado en vez de tirar. Devolver `null` no afloja nada: el
// llamador lo trata como "no pude verificar" y, siendo fail-closed, deniega.
//
// NUNCA IMPRIME EL TOKEN, ni truncado, ni en un log de depuración. Lo único que se puede saber
// desde afuera es si HAY configuración (`hayMattermost()`), nunca cuál.

import { MattermostCliente } from '../../../communication-service/src/channels/mattermost/mattermost-cliente.mjs'

let memo // undefined = todavía no se intentó · null = no hay configuración

/** ¿El entorno tiene con qué hablarle a Mattermost? Sin revelar con qué. */
export function hayMattermost(env = process.env) {
  return Boolean(env.MM_BASE_URL && env.MM_BOT_TOKEN)
}

/**
 * Cliente institucional, memoizado. `null` si falta configuración.
 *
 * @param {{env?:object, log?:object}} [o]
 * @returns {{miembroDeCanal:Function}|null}
 */
export function mattermostDelOs({ env = process.env, log = null } = {}) {
  if (memo !== undefined) return memo
  if (!hayMattermost(env)) {
    log?.warn?.('mattermost: sin MM_BASE_URL/MM_BOT_TOKEN — la membresía de canal no se va a poder verificar')
    memo = null
    return memo
  }
  try {
    memo = new MattermostCliente({ baseUrl: env.MM_BASE_URL, token: env.MM_BOT_TOKEN })
  } catch (e) {
    // El mensaje del constructor no lleva el token (dice qué falta, no qué vale).
    log?.error?.('mattermost: no se pudo construir el cliente', { detalle: String(e?.message ?? e).slice(0, 120) })
    memo = null
  }
  return memo
}

/** Para los tests: olvidar el cliente memoizado. */
export function _resetMattermostDelOs() { memo = undefined }
