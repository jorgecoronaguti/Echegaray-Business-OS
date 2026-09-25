#!/usr/bin/env node
// Arranque del worker de la cola de mails al cliente. La lógica vive en
// `comunicacion/portal/cola-mails.mjs`.
//
//   ORQ_MAIL_DESDE=<ISO> node orquestador/scripts/procesar-mails-portal.mjs
//
// ═══ CON QUÉ CUENTA MANDA (25/09/2026) ═══
//
// Hasta hoy armaba el cliente de Google sin `getToken` ni `impersonate`, o sea como la CUENTA DE
// SERVICIO, y con scopes de Drive/Sheets. `gmailSend` pega a `users/me/messages/send`: con el robot
// eso no manda desde administracion@ — no manda desde nadie. Nunca se notó porque el worker nunca se
// instaló. Ahora actúa COMO el remitente por OAuth (`orq.google_tokens`) y con `soloUsuario`: si esa
// cuenta no está conectada, rompe; jamás cae al robot.
//
// El token se pide ANTES de tomar un mail. Si no hay, no se toma ninguno: tomar uno y fallar gasta un
// intento, y a los tres el mail queda en `error` sin que nadie lo haya intentado de verdad.
//
// Cola vacía → no se toca Google. Es el caso de casi todas las corridas (cada 2 minutos).
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { accessTokenFor } from '../lib/google-oauth.mjs'
import {
  procesarCola, contarCola, desdeDelEntorno, marcarSinCuenta, REMITENTE,
} from '../comunicacion/portal/cola-mails.mjs'

async function main() {
  const desde = desdeDelEntorno()
  const port = { query: (sql, params) => query(sql, params) }

  const { nuevos, retenidos } = await contarCola(port, { desde })
  if (retenidos) {
    console.log(`cola de mails: ${retenidos} pedidos antes del ${desde.toISOString()} RETENIDOS `
      + '(no se mandan: los decide el dueño)')
  }
  if (!nuevos) {
    console.log('cola de mails: nada para mandar')
    return
  }

  const token = await accessTokenFor(REMITENTE)
  if (!token) {
    // La ficha del cliente lo lee de la fila: «sale cuando esté conectada la cuenta que envía».
    await marcarSinCuenta(port, { desde })
    console.error(`cola de mails: ${nuevos} esperan y NO se mandó ninguno — ${REMITENTE} no tiene su Google `
      + 'conectado (orq.google_tokens) o el token no refresca. Los mails siguen pendientes, sin gastar intentos.')
    process.exitCode = 1
    return
  }
  const google = makeGoogleClient({
    config: loadConfig(), scopes: WRITE_SCOPES, getToken: async () => token, soloUsuario: true,
  })
  const c = await procesarCola({ port, google, desde })
  console.log(`cola de mails: ${c.enviado} enviados · ${c.cancelado} cancelados · `
    + `${c.error} con error · ${c.reciclados} reciclados`)
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => closePool().catch(() => {}))
