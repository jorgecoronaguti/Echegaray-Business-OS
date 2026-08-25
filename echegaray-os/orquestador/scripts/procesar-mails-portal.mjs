#!/usr/bin/env node
// Arranque del worker de la cola de mails al cliente. La lógica vive en
// `comunicacion/portal/cola-mails.mjs`.
//
//   node orquestador/scripts/procesar-mails-portal.mjs
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { procesarCola } from '../comunicacion/portal/cola-mails.mjs'

async function main() {
  const port = { query: (sql, params) => query(sql, params) }
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const c = await procesarCola({ port, google })
  console.log(`cola de mails: ${c.enviado} enviados · ${c.cancelado} cancelados · `
    + `${c.error} con error · ${c.reciclados} reciclados`)
  await closePool()
}
main().catch(async (e) => { console.error(e); await closePool().catch(() => {}); process.exit(1) })
