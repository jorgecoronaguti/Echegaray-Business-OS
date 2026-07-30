// EL CLIENTE DE GOOGLE DEL OS — una sola definición de "con qué identidad escribe el OS".
//
// Estaba dentro del handler de comunicación, y con la pantalla de asistencia apareció un
// SEGUNDO proceso que necesita exactamente el mismo cliente. Copiarlo era garantizar que
// algún día uno de los dos escribiera con otra identidad — y la identidad acá no es un
// detalle: la protección de ediciones distingue al OS de una persona por el email
// `gserviceaccount.com` en el historial de Drive. Dos identidades = el candado automático
// dejando de reconocer una de las dos escrituras del propio OS.

import { makeGoogleClient, WORKSPACE_SCOPES } from './google.mjs'
import { operadorEmail, getTokenFor } from './google-oauth.mjs'
import { loadConfig } from './config.mjs'

/**
 * Cliente de Google del OS: actúa como la operadora con la que ya lee y escribe los Sheets
 * de la empresa. Se arma una vez y lo comparten todos los consumidores.
 * @param {{config?:object}} [o] `config` ya cargada (el worker la tiene); si falta, se carga.
 */
export function googleDelOs({ config } = {}) {
  const cfg = config ?? loadConfig()
  const op = operadorEmail()
  return op
    ? makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
    : makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES })
}
