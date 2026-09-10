#!/usr/bin/env node
// ¿EL ESPEJO DICE LO MISMO QUE LA PESTAÑA? — medición, fila por fila, columna por columna.
//
// Reportado por el dueño (10/09/2026): «está mal el emparejamiento de la pestaña Compras del Sheet
// con la sección Compras de app.ecsas: hay gastos sin su comprobante y reflejan datos errados».
//
// Un espejo que se reescribe entero no puede «correrse» solo — pero SÍ puede quedar viejo (el timer
// caído es un espejo congelado que nadie ve congelado) y sus VÍNCULOS de adjuntos sí se corren,
// porque `compra_adjunto.fila_compras` es un número de renglón y el ID de la pestaña es `=ROW()-4`.
// Este script mide las dos cosas y NO escribe nada: es el termómetro, no el remedio.
//
//   node orquestador/scripts/auditar-espejo-compras.mjs [--peores N] [--json]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { PRIMERA_FILA, claveDeCompra, contratoDeColumnas, filaACompra } from '../lib/compras-fila.mjs'
import { compararEspejo, COLUMNAS_COMPARADAS, desfasajeDeFilas } from '../lib/compras-espejo-auditoria.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const PEORES = Number(arg('--peores', 30))

/** La pestaña del dueño, entera, tal como la lee el sync. Sólo lectura. */
async function leerPestana() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(CASHFLOW_ID, 'Compras!A3:BZ6000', { render: 'UNFORMATTED_VALUE' })
  if (!filas.length) throw new Error('no leí nada de Compras')
  const idx = contratoDeColumnas(filas[0])
  const out = []
  for (const [i, f] of filas.slice(1).entries()) {
    const c = filaACompra(f, idx, i + PRIMERA_FILA)
    if (!c) continue
    c.clave = claveDeCompra(c)
    out.push(c)
  }
  return out
}

async function main() {
  const sheet = await leerPestana()
  const { rows: espejo } = await query(
    `select ${['fila', ...COLUMNAS_COMPARADAS].join(', ')} from public.compra_sheet order by fila`)
  const r = compararEspejo(sheet, espejo)
  const desf = desfasajeDeFilas(sheet, espejo)

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, desf }, null, 2)); await closePool(); return
  }

  console.log(`Sheet: ${sheet.length} filas de datos · espejo: ${espejo.length} filas`)
  console.log(`faltan en el espejo: ${r.faltan.length}${r.faltan.length ? ` (${r.faltan.slice(0, 10).join(', ')}…)` : ''}`)
  console.log(`sobran en el espejo: ${r.sobran.length}${r.sobran.length ? ` (${r.sobran.slice(0, 10).join(', ')}…)` : ''}`)
  console.log(`filas con al menos una celda distinta: ${r.filasConDiferencia} de ${r.filasComparadas}`)
  console.log(`desfasaje de renglón: ${desf.corrido === null ? 'no detectado' : `${desf.corrido} (desde la fila ${desf.desde})`}`)
  console.log('\ncolumna                  celdas distintas')
  for (const [col, n] of Object.entries(r.porColumna).sort((a, b) => b[1] - a[1])) {
    if (n) console.log(`${col.padEnd(24)} ${n}`)
  }
  console.log(`\nlas ${Math.min(PEORES, r.peores.length)} peores filas:`)
  for (const f of r.peores.slice(0, PEORES)) {
    console.log(`  fila ${f.fila} (${f.diferencias.length}) ${f.detalle}`)
  }
  await closePool()
}
main().catch(async (e) => { console.error('auditar-espejo-compras falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
