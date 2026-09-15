#!/usr/bin/env node
// Arranque del worker que lleva al Sheet la obra elegida en la app para una fila de Compras (L) o de
// Cobranzas (H): una sola cola con `pestana` desde 20260915T2210. La lógica vive en
// `comunicacion/compras/cola-obra.mjs` (probada con dobles); acá sólo se cablean Postgres y Google y
// se reporta.
//
//   node orquestador/scripts/compras-obra-cola.mjs            # EN SECO: qué escribiría, sin tocar nada
//   node orquestador/scripts/compras-obra-cola.mjs --aplicar  # toma la cola, escribe y relee
//
//   --reintentar-sin-huella   los cambios de Compras cerrados `rechazado` por `sin_huella` (encolados sin
//                             número de comprobante antes de que el worker supiera identificar la fila
//                             por proveedor|fecha|total de compra_sheet) vuelven a `pendiente`. En seco
//                             sólo los cuenta; con --aplicar los reencola y en la misma corrida los procesa.
//
// En seco por defecto: un generador sin bandera que escribe el Sheet real ya costó una pestaña entera.
import { makeGoogleClient, READONLY_SCOPES, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { contarSinHuella, procesarCola, reencolarSinHuella } from '../comunicacion/compras/cola-obra.mjs'

function reportarSeco(plan) {
  console.log(`cola de Obra (Compras · Cobranzas) EN SECO: ${plan.length} pendiente(s) · nada se escribió`)
  for (const p of plan) {
    const que = p.accion === 'escribir'
      ? `escribiría «${p.valor || '(vacía)'}» en ${p.celda} (hoy «${p.actual || 'vacía'}») · pidió ${p.actor}`
      : `${p.accion}: ${p.motivo ?? ''}${p.detalle ? ` — ${p.detalle}` : ''}`
    console.log(`  ${p.pestana ?? 'Compras'} fila ${p.fila} [${p.id}] ${que}${p.nota ? ` · ${p.nota}` : ''}`)
  }
}

/** Los `sin_huella` cerrados: se cuentan siempre que se pida; se reencolan sólo con --aplicar. */
async function reintentarSinHuella(port, aplicar) {
  const { n, desde, hasta } = await contarSinHuella(port)
  console.log(`rechazados por sin_huella: ${n}${n ? ` (del ${desde?.toISOString?.() ?? desde} al ${hasta?.toISOString?.() ?? hasta})` : ''}`)
  if (!aplicar || !n) return
  console.log(`  reencolados: ${await reencolarSinHuella(port)}`)
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const port = { query: (sql, params) => query(sql, params) }
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar ? WRITE_SCOPES : READONLY_SCOPES })
  if (process.argv.includes('--reintentar-sin-huella')) await reintentarSinHuella(port, aplicar)
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
