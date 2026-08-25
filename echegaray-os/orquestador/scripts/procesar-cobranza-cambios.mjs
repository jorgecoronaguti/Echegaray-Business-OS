#!/usr/bin/env node
// Arranque del worker de la cola que escribe en la pestaña Cobranzas. La lógica vive en
// `comunicacion/cobranzas/cola-cambios.mjs` (probada con dobles); acá sólo se cablean Postgres y
// Google y se reporta lo que pasó.
//
//   node orquestador/scripts/procesar-cobranza-cambios.mjs
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { procesarCola } from '../comunicacion/cobranzas/cola-cambios.mjs'

async function main() {
  const port = { query: (sql, params) => query(sql, params) }
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const c = await procesarCola({ port, google })
  // Se reporta SIEMPRE, incluso el cero: un worker que calla cuando no hizo nada es
  // indistinguible de uno que se rompió.
  console.log(`cola de Cobranzas: ${c.aplicado} aplicados · ${c.rechazado} rechazados · `
    + `${c.diferido} diferidos · ${c.error} con error · ${c.reciclados} reciclados`)
  await closePool()
}
main().catch(async (e) => { console.error(e); await closePool().catch(() => {}); process.exit(1) })
