#!/usr/bin/env node
// OCULTA LAS PESTAÑAS QUE SON PURA CAPTURA. El criterio vive en lib/pestanas-visibles.mjs.
//
//   node orquestador/scripts/ocultar-espejos.mjs [--dry] [--mostrar]
//
// `--mostrar` hace lo contrario: las vuelve a mostrar todas. Existe porque una acción que no se
// puede deshacer con un comando no es reversible aunque en teoría lo sea.
//
// NO escribe una sola celda: cambia la propiedad `hidden` de la pestaña. Por eso no pasa por
// `escribirPreservando` ni por `no-borrar` — no hay contenido que preservar ni que borrar.
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { getTokenFor, accessTokenFor, OAUTH_SCOPES } from '../lib/google-oauth.mjs'
import { ESPEJOS_A_OCULTAR, A_LA_VISTA_A_PROPOSITO, pedidosDeOcultar } from '../lib/pestanas-visibles.mjs'

const CUENTA = process.env.ORQ_SHEET_CUENTA || 'jorge@ecsas.com.ar'
const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

async function main() {
  const seco = process.argv.includes('--dry')
  const mostrar = process.argv.includes('--mostrar')
  const tok = await accessTokenFor(CUENTA)
  const meta = await (await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${FLUJO}?fields=sheets(properties(sheetId,title,hidden))`,
    { headers: { Authorization: `Bearer ${tok}` } })).json()
  const hojas = (meta.sheets || []).map((s) => s.properties)

  if (mostrar) {
    const req = hojas.filter((h) => ESPEJOS_A_OCULTAR.includes(h.title) && h.hidden)
      .map((h) => ({ updateSheetProperties: { properties: { sheetId: h.sheetId, hidden: false }, fields: 'hidden' } }))
    console.log(`vuelvo a mostrar ${req.length} pestaña(s)`)
    if (!seco && req.length) await batch(tok, req)
    return
  }

  const { cambios, yaOcultas, noEstan } = pedidosDeOcultar(hojas)
  console.log(`visibles hoy: ${hojas.filter((h) => !h.hidden).length} de ${hojas.length}`)
  if (yaOcultas.length) console.log(`  · ya estaban ocultas: ${yaOcultas.join(', ')}`)
  if (noEstan.length) console.log(`  ⚠ no encontré en el archivo: ${noEstan.join(', ')}`)
  for (const [n, motivo] of Object.entries(A_LA_VISTA_A_PROPOSITO)) console.log(`  👁 ${n} se queda a la vista: ${motivo}`)
  if (!cambios.length) { console.log('nada que ocultar.'); return }
  console.log(`\nocultar ${cambios.length}: ${ESPEJOS_A_OCULTAR.filter((n) => !yaOcultas.includes(n) && !noEstan.includes(n)).join(', ')}`)
  if (seco) { console.log('\n(--dry) no toqué nada.'); return }
  await batch(tok, cambios)
  console.log('✓ ocultas. Para revertir: node orquestador/scripts/ocultar-espejos.mjs --mostrar')
}

async function batch(tok, requests) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${FLUJO}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!r.ok) throw new Error(`batchUpdate ${r.status}: ${String(await r.text()).slice(0, 250)}`)
}

main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
