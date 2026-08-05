#!/usr/bin/env node
// ESCRIBE LA COLUMNA DE AGING EN COMPRAS — una sola ancla, después de todo lo que existe.
//
// El criterio y su porqué están en `orquestador/lib/proveedores-aging.mjs`, con 9 tests.
// Acá sólo está la puerta al archivo: agrega la columna si falta, escribe el rótulo y el ancla, y
// VERIFICA RELEYENDO. La respuesta de la API no prueba nada; lo que prueba es el dato en su destino.
//
//   node orquestador/scripts/proveedores-aging-columna.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-aging-columna.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { formulaAging, ROTULO, COL, TRAMOS, SIN_FECHA } from '../lib/proveedores-aging.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const letra = (n) => { let s = ''; let x = n + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = (x - 1 - r) / 26 } return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const compras = meta.find((s) => s.title === 'Compras')
  if (!compras) throw new Error('no encontré la pestaña Compras: no escribo a ciegas')

  const col = letra(COL.aging)
  console.log(`COLUMNA ${col} · "${ROTULO}" · grilla ${compras.rows}×${compras.cols}`)
  console.log(formulaAging())

  // Guarda: la columna destino tiene que estar VACÍA o ser mía. Si tiene otra cosa, es del dueño.
  if (compras.cols > COL.aging) {
    const ocupada = await google.readSheetValues(ID, `Compras!${col}3:${col}`, { render: 'FORMATTED_VALUE' })
    const rotuloActual = String(ocupada?.[0]?.[0] ?? '').trim()
    const conDato = (ocupada ?? []).slice(1).filter((f) => String(f?.[0] ?? '').trim()).length
    if (rotuloActual && rotuloActual !== ROTULO) {
      throw new Error(`la columna ${col} ya dice "${rotuloActual}" (${conDato} filas con dato). No es mía: no la piso.`)
    }
  }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  if (compras.cols <= COL.aging) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: {
      sheetId: compras.sheetId, dimension: 'COLUMNS', length: COL.aging + 1 - compras.cols } }], { espejo: true })
    console.log(`  agregada(s) ${COL.aging + 1 - compras.cols} columna(s) al final`)
  }

  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: COL.aging, endColumnIndex: COL.aging + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO } }] }], fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: COL.aging, endColumnIndex: COL.aging + 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formulaAging() } }] }], fields: 'userEnteredValue' } },
    // Texto explícito: si hereda formato de fecha, "8 a 30 días" se convierte en un número.
    { repeatCell: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: compras.rows, startColumnIndex: COL.aging, endColumnIndex: COL.aging + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT', pattern: '@' }, horizontalAlignment: 'LEFT' } },
      fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
  ], { espejo: true })

  // ── LA EVIDENCIA: el dato releído del archivo, cruzado contra el saldo que ya calcula Compras.
  const filas = await google.readSheetValues(ID, `Compras!A4:${col}`, { render: 'UNFORMATTED_VALUE' })
  const porTramo = new Map()
  let sinTramoConSaldo = 0
  let conTramoSinSaldo = 0
  for (const f of filas ?? []) {
    const saldo = Number(f?.[COL.saldo]) || 0
    const tramo = String(f?.[COL.aging] ?? '').trim()
    if (Math.round(saldo) > 0 && !tramo) { sinTramoConSaldo++; continue }
    if (!tramo) continue
    if (Math.round(saldo) <= 0) { conTramoSinSaldo++; continue }
    const o = porTramo.get(tramo) ?? { n: 0, t: 0 }
    o.n++; o.t += saldo
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

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
