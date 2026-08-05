#!/usr/bin/env node
// LA SECCIÓN 2 COMO TABLA DINÁMICA NATIVA — TODOS los proveedores, no los 30 más grandes.
//
// Listaba 30 y metía 74 en una línea "resto de proveedores comerciales (74)". Son 105 por
// $281.227.326: tres cuartas partes de la lista no se veían. Y cada fila era texto materializado por
// un generador, con `=COUNTIF(Compras!$E$4:$E;$A71)` colgando de un nombre escrito a mano.
//
// El CUIT llega por `Compras!AM`, la columna derivada que puso `proveedores-cuenta-corriente.mjs`
// desde `public.proveedores`. Va como segundo campo de fila: cada proveedor tiene uno solo, así que
// no agrupa y no deja ninguna celda vacía.
//
//   node orquestador/scripts/proveedores-seccion2-pivot.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-seccion2-pivot.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
const COLCHON = 10
/** offsets dentro del origen (que arranca en A) */
const OFF = Object.freeze({ proveedor: 4, total: 14, comercial: 35, cuit: 38 })

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/** Un proveedor por fila: cuánto se le compró y en cuántos comprobantes. */
const pivot = (fuente) => ({
  source: fuente,
  rows: [
    { sourceColumnOffset: OFF.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
    { sourceColumnOffset: OFF.cuit, showTotals: false, sortOrder: 'ASCENDING' },
  ],
  values: [
    { sourceColumnOffset: OFF.total, summarizeFunction: 'SUM', name: 'Comprado 2026' },
    { sourceColumnOffset: OFF.proveedor, summarizeFunction: 'COUNTA', name: 'Comprobantes' },
  ],
  // NUNCA por `condition`: un filtro por condición sobre una columna de grid descarta TODAS las
  // filas sin dar error, y la dinámica aparece perfecta y vacía.
  filterSpecs: [{ columnOffsetIndex: OFF.comercial, filterCriteria: { visibleValues: ['1'] } }],
  valueLayout: 'HORIZONTAL',
})

/** Dónde empieza y termina la sección 2, por su TÍTULO. */
function geometria(filas) {
  const t = (i) => String((filas[i] ?? [])[0] ?? '').trim()
  const i2 = filas.findIndex((_, i) => /^2\s*[·.\-]/.test(t(i)))
  if (i2 < 0) throw new Error('no encontré el título de la sección 2')
  const i3 = filas.findIndex((_, i) => i > i2 && /^3\s*[·.\-]/.test(t(i)))
  if (i3 < 0) throw new Error('no encontré el título de la sección 3: sin límite no escribo')
  const iCab = filas.findIndex((_, i) => i > i2 && i < i3 && /PROVEEDOR/i.test(t(i)))
  if (iCab < 0) throw new Error('no encontré la fila de rótulos de la sección 2')
  return { filaRotulos: iCab + 1, filaLimite: i3 + 1 }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const compras = await google.readSheetValues(ID, 'Compras!A4:AM', { render: 'UNFORMATTED_VALUE' })
  const comerciales = new Set((compras ?? [])
    .filter((f) => String(f?.[OFF.comercial] ?? '').trim() === '1' && String(f?.[OFF.proveedor] ?? '').trim())
    .map((f) => String(f[OFF.proveedor]).trim()))
  const total = (compras ?? [])
    .filter((f) => String(f?.[OFF.comercial] ?? '').trim() === '1')
    .reduce((a, f) => a + (Number(f?.[OFF.total]) || 0), 0)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const geo = geometria(visible)
  const alto = 1 + comerciales.size + 1 // rótulos + un proveedor por fila + la suma total
  const disponibles = geo.filaLimite - geo.filaRotulos - 1

  console.log(`PROVEEDORES ${comerciales.size} · COMPRADO ${plata(total)}`)
  console.log(`RÓTULOS fila ${geo.filaRotulos} · sección 3 en la ${geo.filaLimite} · necesita ${alto}, hay ${disponibles}`)
  const faltan = alto > disponibles ? alto - disponibles + COLCHON : 0
  if (faltan) console.log(`⚠ se insertan ${faltan} fila(s) antes de la sección 3`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sid = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const cm = meta.find((s) => s.title === 'Compras')
  if (!Number.isInteger(sid) || !(cm?.rows > 3)) throw new Error('no pude resolver las pestañas')

  if (faltan) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: {
      range: { sheetId: sid, dimension: 'ROWS', startIndex: geo.filaLimite - 1, endIndex: geo.filaLimite - 1 + faltan },
      inheritFromBefore: true } }], { espejo: true })
    geo.filaLimite += faltan
  }

  const iRot = geo.filaRotulos - 1
  const finIdx = geo.filaLimite - 1
  const vacias = Array.from({ length: finIdx - iRot }, () => ({ values: Array.from({ length: 6 }, () => ({ userEnteredValue: null })) }))
  const fmt = (col, numberFormat, align) => ({ repeatCell: {
    range: { sheetId: sid, startRowIndex: iRot, endRowIndex: iRot + alto, startColumnIndex: col, endColumnIndex: col + 1 },
    cell: { userEnteredFormat: { numberFormat, horizontalAlignment: align } },
    fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })
  const TXT = { type: 'TEXT', pattern: '@' }

  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: { range: { sheetId: sid, startRowIndex: iRot, endRowIndex: finIdx, startColumnIndex: 0, endColumnIndex: 6 },
      rows: vacias, fields: 'userEnteredValue,pivotTable' } },
    { updateCells: { range: { sheetId: sid, startRowIndex: iRot, endRowIndex: iRot + 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ pivotTable: pivot({ sheetId: cm.sheetId, startRowIndex: 2, endRowIndex: cm.rows, startColumnIndex: 0, endColumnIndex: OFF.cuit + 1 }) }] }],
      fields: 'pivotTable' } },
    fmt(0, TXT, 'LEFT'), fmt(1, TXT, 'LEFT'),
    fmt(2, { type: 'CURRENCY', pattern: '"$"#,##0' }, 'RIGHT'), fmt(3, { type: 'NUMBER', pattern: '0' }, 'RIGHT'),
    // Ninguna fila oculta: siete lo estuvieron en la sección 1 y el total cerraba igual.
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: iRot, endIndex: finIdx },
      properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })

  const vista = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaRotulos}:D${geo.filaLimite - 1}`)
  const filas = (vista ?? []).filter((f) => String(f?.[0] ?? '').trim())
  console.log(`\nLEÍDO DEL ARCHIVO: ${filas.length - 1} proveedores + la suma total`)
  for (const f of filas.slice(0, 6)) console.log('  ' + f.map((c) => String(c ?? '')).join(' | ').slice(0, 88))
  console.log('  …')
  for (const f of filas.slice(-2)) console.log('  ' + f.map((c) => String(c ?? '')).join(' | ').slice(0, 88))
}

main().catch((e) => { console.error(e); process.exit(1) })
