#!/usr/bin/env node
// Arranque del worker que lleva al Sheet la obra elegida en la app para una fila de Compras (L) o de
// Cobranzas (H): una sola cola con `pestana` desde 20260915T2210. La lógica vive en
// `comunicacion/compras/cola-obra.mjs` (probada con dobles); acá sólo se cablean Postgres y Google y
// se reporta.
//
//   node orquestador/scripts/compras-obra-cola.mjs            # EN SECO: qué escribiría, sin tocar nada
//   node orquestador/scripts/compras-obra-cola.mjs --aplicar  # toma la cola, escribe y relee
//
// En seco por defecto: un generador sin bandera que escribe el Sheet real ya costó una pestaña entera.
import { makeGoogleClient, READONLY_SCOPES, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { procesarCola } from '../comunicacion/compras/cola-obra.mjs'

function reportarSeco(plan) {
  console.log(`cola de Obra (Compras · Cobranzas) EN SECO: ${plan.length} pendiente(s) · nada se escribió`)
  for (const p of plan) {
    const que = p.accion === 'escribir'
      ? `escribiría «${p.valor || '(vacía)'}» en ${p.celda} (hoy «${p.actual || 'vacía'}») · pidió ${p.actor}`
      : `${p.accion}: ${p.motivo ?? ''}${p.detalle ? ` — ${p.detalle}` : ''}`
    console.log(`  ${p.pestana ?? 'Compras'} fila ${p.fila} [${p.id}] ${que}`)
  }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const port = { query: (sql, params) => query(sql, params) }
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar ? WRITE_SCOPES : READONLY_SCOPES })
  const c = await procesarCola({ port, google, dry: !aplicar })
  if (c.dry) reportarSeco(c.plan)
  // Se reporta SIEMPRE, incluso el cero: un worker que calla es indistinguible de uno roto.
  else {
    console.log(`cola de Obra (Compras · Cobranzas): ${c.aplicado} aplicados · ${c.rechazado} rechazados · `
      + `${c.diferido} diferidos · ${c.error} con error · ${c.reciclados} reciclados`)
  }
  await closePool()
}
main().catch(async (e) => { console.error(e); await closePool().catch(() => {}); process.exit(1) })
