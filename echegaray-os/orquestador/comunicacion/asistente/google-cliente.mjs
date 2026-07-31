// CON QUÉ CUENTA DE GOOGLE SE EJECUTA UN PEDIDO DEL ASISTENTE.
//
// El OS ya sabe hablar con Google (lib/google.mjs) y ya sabe qué cuentas lo autorizaron
// (lib/google-oauth.mjs). Lo que faltaba es la decisión de IDENTIDAD para un pedido de
// chat: cuando Rodrigo escribe "creame el evento", el evento tiene que caer en la agenda
// de Rodrigo — no en la del dueño porque su token es el que está a mano. Ese error no se
// nota nunca desde el chat: se nota cuando alguien no ve la reunión que le confirmaron.
//
// Por eso acá conviven dos preguntas distintas:
//   ¿hay ALGUNA cuenta con la que leer?      → googleDisponible      (Drive: leer es inocuo)
//   ¿está la cuenta DE ESTA PERSONA?         → googlePropioDisponible (Calendar/Tasks: escribe
//                                              en la agenda de alguien, y tiene que ser la suya)
//
// Y el clasificador de errores, que existe para que la persona lea "conectá tu Google" y el
// log guarde el 403 con su cuerpo — nunca al revés, y nunca un token en ninguno de los dos.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../../lib/google.mjs'
import { operadorPara, tieneToken, getTokenFor, hayCuentaAutorizada } from '../../lib/google-oauth.mjs'
import { loadConfig } from '../../lib/config.mjs'
import { ERROR, errorAsistente } from './contratos.mjs'

/** Marca en el cliente con qué cuenta quedó armado. Symbol.for para que sobreviva a que
 *  dos módulos carguen copias distintas de este archivo (worker + web). */
export const CUENTA = Symbol.for('asistente.google.cuenta')

/** Lo que hay que configurar para que esto funcione de verdad. Se nombra en el mensaje de
 *  error y en la doc: un "no tengo acceso" sin decir QUÉ falta no es honesto, es cómodo. */
export const CONFIG_REQUERIDA = Object.freeze([
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT',
])

const MSG_SIN_ACCESO =
  'No tengo acceso a tu Google. Entrá a "Conectar con Google" en el OS y autorizá Drive, '
  + 'Calendar y Tareas; después volvé a pedírmelo.'

// ── Secretos ─────────────────────────────────────────────────────────────────

/** Saca del texto cualquier cosa con forma de credencial ANTES de que llegue a un log.
 *  El cuerpo de un 400 de Google puede traer el token que se mandó: eso no se guarda. */
export function sinSecretos(texto, max = 300) {
  return String(texto ?? '')
    .replace(/Bearer\s+[\w.\-]+/gi, 'Bearer ***')
    .replace(/\bya29\.[\w.\-]+/g, 'ya29.***')
    .replace(/"(access_token|refresh_token|id_token|client_secret|code)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
    .replace(/\b(access_token|refresh_token|client_secret)=[^&\s]+/gi, '$1=***')
    .slice(0, max)
}

// ── Identidad ────────────────────────────────────────────────────────────────

/** Con qué cuenta quedó armado este cliente: `{email, propia}` o null si no lo sabemos. */
export function cuentaDe(google) {
  return google?.[CUENTA] ?? null
}

/**
 * ¿Este cliente puede ejecutar algo que escribe en la agenda/tareas de una persona?
 *
 * Sólo se niega cuando SABEMOS que la cuenta resuelta es de otro. Si el cliente vino armado
 * por otra capa y no trae marca, no se bloquea: la decisión de identidad es de quien la
 * conoce, y adivinar acá dejaría capacidades muertas sin que nadie entienda por qué.
 */
export function permiteEfectoExterno(google) {
  const c = cuentaDe(google)
  return c ? c.propia === true : true
}

/**
 * Cliente de Google para ejecutar ESTE pedido.
 *
 * Prioridad: la cuenta de quien pide, si autorizó la suya. Si no autorizó, cae a la cuenta
 * operadora del OS — que alcanza para LEER Drive y no alcanza para escribir en la agenda de
 * nadie (por eso el cliente queda marcado con `propia:false`).
 *
 * @returns {Promise<object|null>} null si no hay ninguna cuenta utilizable.
 */
export async function googleDe({ identidad, config, deps = {} } = {}) {
  const resolverOperador = deps.operadorPara ?? operadorPara
  const tokenPara = deps.getTokenFor ?? getTokenFor
  const crear = deps.crearCliente ?? ((cfg, getToken) => makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken }))
  const email = String(identidad?.email ?? '').toLowerCase() || null
  let cuenta = null
  try { cuenta = await resolverOperador(email) } catch { cuenta = null }
  if (!cuenta) return null
  const cfg = config ?? (deps.loadConfig ?? loadConfig)()
  const cliente = crear(cfg, tokenPara(cuenta))
  if (!cliente) return null
  try { cliente[CUENTA] = { email: cuenta, propia: Boolean(email) && cuenta === email } } catch { /* cliente congelado: sin marca */ }
  return cliente
}

/** ¿Hay alguna cuenta con la que el OS pueda mirar Google para este usuario?
 *  `deps` es la puerta de inyección (las capacidades le pasan `ctx.googleDeps`): sin ella un
 *  test de `habilitada` terminaría consultando la base de PRODUCCIÓN para decidir si ofrece
 *  una capacidad. */
export async function googleDisponible(ctx, deps = {}) {
  if (ctx?.google) return true
  const hayAlguna = deps.hayCuentaAutorizada ?? hayCuentaAutorizada
  try { return (await hayAlguna()) === true } catch { return false }
}

/** ¿Autorizó ESTA persona su propia cuenta? Es el requisito de todo lo que escribe en su
 *  agenda o en sus tareas: sin esto la capacidad no se ofrece, para no prometer algo que
 *  terminaría creando el evento en la cuenta equivocada. */
export async function googlePropioDisponible(ctx, deps = {}) {
  const email = String(ctx?.identidad?.email ?? '').toLowerCase()
  if (!email) return false
  if (cuentaDe(ctx?.google)?.propia === true) return true
  const tiene = deps.tieneToken ?? tieneToken
  try { return (await tiene(email)) === true } catch { return false }
}

// ── Errores ──────────────────────────────────────────────────────────────────

const statusDe = (e) => {
  const n = Number(e?.status)
  if (Number.isFinite(n) && n > 0) return n
  const m = String(e?.message ?? e).match(/\b(\d{3})\b/)
  return m ? Number(m[1]) : 0
}

/**
 * Un error de Google → el código de error del asistente + una frase que una persona
 * entiende. El detalle técnico va en `detalle` (log/auditoría), nunca en `mensaje`.
 *
 * @param {unknown} e
 * @param {{que?:string}} [o] cómo nombrar lo que no se encontró ("el archivo", "la lista").
 */
export function clasificarErrorGoogle(e, { que = 'eso' } = {}) {
  const detalle = sinSecretos(e?.message ?? e)
  const status = statusDe(e)
  const sinCuenta = /invalid_grant|unauthorized_client|insufficient|delegat|credencial de Google ausente|sin cuenta Google/i
  if (status === 401 || status === 403 || sinCuenta.test(detalle)) {
    return errorAsistente(ERROR.GOOGLE_SIN_ACCESO, MSG_SIN_ACCESO, detalle)
  }
  if (status === 404 || /no encontrad|not found/i.test(detalle)) {
    return errorAsistente(ERROR.NO_ENCONTRADO, `No encontré ${que}.`, detalle)
  }
  if (status === 429 || (status >= 500 && status < 600)) {
    return errorAsistente(ERROR.TEMPORAL, 'Google no me está respondiendo en este momento. Probá de nuevo en un rato.', detalle)
  }
  return errorAsistente(ERROR.DEFINITIVO, 'No pude hacerlo en Google. Ya quedó registrado para revisarlo.', detalle)
}

/** El error de "no hay cuenta conectada", con el mismo texto en todos lados. */
export const errorSinCuenta = () => errorAsistente(
  ERROR.GOOGLE_SIN_ACCESO, MSG_SIN_ACCESO,
  `sin cuenta Google conectada (requiere ${CONFIG_REQUERIDA.join(', ')} + consentimiento del usuario)`,
)

/** El error de "tu cuenta no está, y esto escribiría en la de otro". */
export const errorCuentaAjena = (google) => errorAsistente(
  ERROR.GOOGLE_SIN_ACCESO,
  'Esto lo tengo que hacer en TU cuenta de Google y todavía no la conectaste. Entrá a "Conectar con Google" en el OS y lo hago.',
  `cuenta resuelta ${cuentaDe(google)?.email ?? '(desconocida)'} ≠ cuenta del solicitante`,
)
