#!/usr/bin/env node
// ESCRIBE LA COLUMNA DE AGING EN COMPRAS — una sola ancla, en «Tramo de vencimiento (OS)».
//
// El criterio y su porqué están en `orquestador/lib/proveedores-aging.mjs`, con sus tests.
// Acá sólo está la puerta al archivo: escribe el rótulo y el ancla, y VERIFICA RELEYENDO.
//
// ═══ LA COLUMNA SALE DEL RÓTULO (14/09/2026) ═══
//
// Era `COL.aging = 39` (AN), y `COL.saldo = 37` para verificar. Con «Obra» insertada en L el tramo
// pasa a la AO y el saldo a la AM. La columna ya no se crea al final si falta: existe desde el 04/08,
// y un rótulo que no está es un error con su nombre, no una columna nueva en un lugar supuesto.
//
//   node orquestador/scripts/proveedores-aging-columna.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-aging-columna.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { formulaAging, ROTULO, TRAMOS, SIN_FECHA } from '../lib/proveedores-aging.mjs'
import { COMPRAS, lectorDeEncabezados, rangoFilas, ubicarColumna } from '../lib/columnas-por-encabezado.mjs'
import { columnaParaEscribir, portonDeRequests } from '../lib/compras-layout.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const ESCRITOR = 'proveedores-aging-columna'
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/** NÚCLEO PURO: rótulo, ancla y formato de texto de la columna, contra la fila viva y por el portón. */
export function requestsDeAging(encabezado, { sheetId, filas }) {
  const col = columnaParaEscribir(encabezado, ESCRITOR, 'tramo')
  const rango = (desde, hasta) => ({ sheetId, startRowIndex: desde, endRowIndex: hasta, startColumnIndex: col.indice, endColumnIndex: col.indice + 1 })
  const req = [
    { updateCells: { range: rango(2, 3), rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO } }] }], fields: 'userEnteredValue' } },
    { updateCells: { range: rango(3, 4), rows: [{ values: [{ userEnteredValue: { formulaValue: formulaAging(encabezado) } }] }], fields: 'userEnteredValue' } },
    // Texto explícito: si hereda formato de fecha, "8 a 30 días" se convierte en un número.
    { repeatCell: {
      range: rango(2, filas),
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT', pattern: '@' }, horizontalAlignment: 'LEFT' } },
      fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
  ]
  return { col, req: portonDeRequests(encabezado, ESCRITOR, req) }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const compras = (await google.getSheetMeta(ID)).find((s) => s.title === 'Compras')
  if (!compras) throw new Error('no encontré la pestaña Compras: no escribo a ciegas')
  const encabezado = await lectorDeEncabezados(google, ID).encabezado('Compras')
  const { col, req } = requestsDeAging(encabezado, { sheetId: compras.sheetId, filas: compras.rows })
  const saldo = ubicarColumna(encabezado, COMPRAS.saldo, 'Compras')
  console.log(`COLUMNA ${col.letra} · "${ROTULO}" · saldo en ${saldo.letra} · grilla ${compras.rows}×${compras.cols}`)
  console.log(formulaAging(encabezado))
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  await google.spreadsheetBatchUpdate(ID, req, { espejo: true })

  // ── LA EVIDENCIA: el dato releído del archivo, cruzado contra el saldo que ya calcula Compras.
  const filas = await google.readSheetValues(ID, rangoFilas('Compras', 4), { render: 'UNFORMATTED_VALUE' })
  const porTramo = new Map()
  let sinTramoConSaldo = 0
  let conTramoSinSaldo = 0
  for (const f of filas ?? []) {
    const s = Number(f?.[saldo.indice]) || 0
    const tramo = String(f?.[col.indice] ?? '').trim()
    if (Math.round(s) > 0 && !tramo) { sinTramoConSaldo++; continue }
    if (!tramo) continue
    if (Math.round(s) <= 0) { conTramoSinSaldo++; continue }
    const o = porTramo.get(tramo) ?? { n: 0, t: 0 }
    o.n++; o.t += s
    porTramo.set(tramo, o)
  }
  console.log('\nLEÍDO DEL ARCHIVO')
  let total = 0
  for (const r of [...TRAMOS.map((t) => t.rotulo), SIN_FECHA]) {
    const o = porTramo.get(r)
    if (!o) continue
    total += o.t
    console.log(`  ${r.padEnd(24)} ${plata(o.t).padStart(14)}  ${String(o.n).padStart(3)} factura(s)`)
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${plata(total).padStart(14)}`)
  console.log(sinTramoConSaldo ? `✗ ${sinTramoConSaldo} fila(s) con saldo y SIN tramo` : '✓ ninguna fila con saldo quedó sin tramo')
  console.log(conTramoSinSaldo ? `✗ ${conTramoSinSaldo} fila(s) con tramo y sin saldo` : '✓ ninguna fila pagada entró al aging')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
