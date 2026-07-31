// EL CLIENTE DE GOOGLE DEL OS — una sola definición de "con qué identidad escribe el OS".
//
// Estaba dentro del handler de comunicación, y con la pantalla de asistencia apareció un
// SEGUNDO proceso que necesita exactamente el mismo cliente. Copiarlo era garantizar que
// algún día uno de los dos escribiera con otra identidad — y la identidad acá no es un
// detalle: la protección de ediciones distingue al OS de una persona por el email
// `gserviceaccount.com` en el historial de Drive. Dos identidades = el candado automático
// dejando de reconocer una de las dos escrituras del propio OS.
//
// ── EL DEFECTO QUE TUVO, Y POR QUÉ NO SE ARREGLABA CON UN `await` ─────────────────────
//
// Hasta el 31/07 acá decía:
//
//     const op = operadorEmail()                       // ← async, sin await
//     return op ? makeGoogleClient({ …, getToken: getTokenFor(op) }) : makeGoogleClient({ … })
//
// `operadorEmail` es `async`, así que `op` era una **Promise**. Una Promise siempre es
// truthy, con lo cual el ternario tomaba SIEMPRE la primera rama y armaba el cliente con
// `getTokenFor(<Promise>)`. Ese getToken termina en `accessTokenFor`, que hace
// `String(email).toLowerCase()` → `"[object promise]"`, busca esa fila en
// `orq.google_tokens`, no la encuentra y devuelve `null`. Y `makeGoogleClient`, ante un
// getToken que devuelve null, cae al Service Account.
//
// O sea: la rama del `else` era inalcanzable y el efecto neto era **siempre el Service
// Account**, en silencio, con una query inútil a la base por cada token pedido (el caché de
// `userToken` sólo guarda valores truthy, así que reintentaba en cada llamada).
//
// La tentación es agregar el `await`. Sería peor que el bug: la cuenta operadora hoy
// resuelve a una persona real (`ORQ_GOOGLE_IMPERSONATE`), y este cliente es con el que se
// ESCRIBE JORNALES. Escribir la planilla como esa persona hace que el historial de Drive
// deje de decir `gserviceaccount.com`, y `ES_CUENTA_OS` (historial-ediciones.mjs) es
// justamente cómo el OS distingue su propia escritura de una edición del dueño.
//
// Siendo exactos, porque exagerar un riesgo también es fabricar: JORNALES se escribe con
// `compartida: true` y `evaluarBloqueadas` sale antes de la firma con ese flag, así que hoy
// el auto-candado NO se dispararía sobre esa planilla. Lo que sí cambiaría es el actor en el
// historial de Drive de un archivo que administración mira todos los días, y cualquier
// pestaña futura que este cliente escriba SIN `compartida` sí se auto-candaría. Ninguna de
// las dos cosas avisa: sólo pasan.
//
// El arreglo real es hacer la identidad EXPLÍCITA en vez de derivarla de un ternario que
// nadie podía leer: este cliente es el INSTITUCIONAL del OS, es el Service Account, y se
// declara como tal. No hay resolución asíncrona que pueda salir mal porque ya no hay
// resolución — no queda ninguna Promise que alguien pueda interpretar como un email.
//
// ── LAS TRES IDENTIDADES, Y DÓNDE VIVE CADA UNA ──────────────────────────────────────
//
//   institucional  service_account  → acá (`googleDelOs`). JORNALES y el pipeline de Sheets.
//   operadora      operator_oauth   → `await operadorEmail()` + `getTokenFor(op)`, el patrón
//                                     que ya usan handlers/specialist.mjs,
//                                     handlers/operation_execute.mjs, interactive-server.mjs,
//                                     os.mjs y los scripts de sync. Todos ESPERAN el email.
//   personal       user_oauth       → comunicacion/asistente/google-cliente.mjs (`googleDe`),
//                                     la cuenta de quien pide. Nunca cae al Service Account:
//                                     si no es la suya, el cliente queda marcado
//                                     `propia:false` y `permiteEfectoExterno` bloquea la
//                                     escritura en la agenda de nadie.
//
// Las tres dejan marcado en el cliente con qué identidad quedó armado (ver `identidadDe`),
// para que un log pueda decirlo sin exponer un solo token.

import { makeGoogleClient, WORKSPACE_SCOPES } from './google.mjs'
import { loadConfig } from './config.mjs'

/** Los tres tipos de identidad con los que el OS puede hablarle a Google. */
export const IDENTIDAD = Object.freeze({
  INSTITUCIONAL: 'service_account',
  OPERADORA: 'operator_oauth',
  PERSONAL: 'user_oauth',
})

/** Marca de identidad en el cliente. `Symbol.for` para que sobreviva a que dos procesos
 *  (worker y web) carguen copias distintas de este módulo. */
export const IDENTIDAD_OS = Symbol.for('echegaray.google.identidad')

/** Cuenta lógica del cliente institucional. No es un email: la dirección real del Service
 *  Account no aporta nada a un log y no se imprime. */
export const CUENTA_INSTITUCIONAL = 'service-account'

/** La marca que pone el asistente cuando arma el cliente de una persona. Se lee acá para
 *  que "¿con qué identidad quedó este cliente?" tenga UNA respuesta, no una por capa. */
const CUENTA_ASISTENTE = Symbol.for('asistente.google.cuenta')

/**
 * Con qué identidad quedó armado este cliente: `{tipo, cuenta, propia}` o `null` si no se
 * sabe (un doble de prueba, o un cliente que armó una capa que todavía no marca).
 */
export function identidadDe(google) {
  const propia = google?.[IDENTIDAD_OS]
  if (propia) return propia
  const delAsistente = google?.[CUENTA_ASISTENTE]
  if (delAsistente) {
    return { tipo: IDENTIDAD.PERSONAL, cuenta: delAsistente.email ?? null, propia: delAsistente.propia === true }
  }
  return null
}

/**
 * Texto corto para logs. Nunca un token, nunca un secreto: sólo el tipo y —cuando es la
 * cuenta de una persona— su email, que ya viaja en la auditoría de todos modos.
 */
export function describirIdentidad(google) {
  const i = identidadDe(google)
  if (!i) return 'desconocida'
  if (i.tipo === IDENTIDAD.INSTITUCIONAL) return IDENTIDAD.INSTITUCIONAL
  return `${i.tipo}:${i.cuenta ?? '(sin cuenta)'}`
}

/**
 * Cliente INSTITUCIONAL de Google del OS: la cuenta de servicio.
 *
 * Es el que usa la asistencia para leer y escribir JORNALES, y es la identidad que el
 * candado de ediciones reconoce como "esto lo escribió el OS". No resuelve nada de forma
 * asíncrona a propósito: la identidad está decidida, no averiguada.
 *
 * Si un flujo necesita actuar como una PERSONA, no es este cliente — es `googleDe` del
 * asistente (la cuenta de quien pide) o el patrón de la cuenta operadora. Cambiar lo que
 * devuelve esta función cambia con qué nombre queda firmada la planilla de jornales.
 *
 * @param {{config?:object, log?:object, deps?:object}} [o] `config` ya cargada (el worker la
 *   tiene); si falta, se carga. `log` opcional: deja registrado con qué identidad se armó.
 *   `deps.crearCliente` es la puerta de inyección para las pruebas — sin ella, verificar que
 *   NO se pasa `getToken` obligaría a hablar con Google.
 */
export function googleDelOs({ config, log, deps = {} } = {}) {
  const cfg = config ?? (deps.loadConfig ?? loadConfig)()
  const crear = deps.crearCliente ?? makeGoogleClient
  // Sin `getToken`: el cliente autentica con la key del Service Account. Es la rama que el
  // ternario roto nunca alcanzaba y, a la vez, la única que corrió siempre.
  const cliente = crear({ config: cfg, scopes: WORKSPACE_SCOPES })
  try {
    cliente[IDENTIDAD_OS] = { tipo: IDENTIDAD.INSTITUCIONAL, cuenta: CUENTA_INSTITUCIONAL, propia: false }
  } catch { /* cliente congelado: se queda sin marca; no es motivo para no devolverlo */ }
  log?.debug?.('google: cliente institucional', { identidad: IDENTIDAD.INSTITUCIONAL })
  return cliente
}
