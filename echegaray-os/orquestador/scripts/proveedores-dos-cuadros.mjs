#!/usr/bin/env node
// LA SECCIÓN 1 DE PROVEEDORES, EN DOS TABLAS DINÁMICAS NATIVAS.
//
// El pedido: "necesito ver los totales de lo que le debo a cada proveedor y luego ver dentro cada
// operación". Una sola dinámica no puede: la API de Sheets NO emite el subtotal de un nivel externo
// —sólo el gran total del pie—, y está medido contra el archivo real con dos y con seis niveles.
// `showTotals: true` en el proveedor no produce la fila "Alumetal · total".
//
// Entonces son dos, las dos vivas y las dos dinámicas:
//   A · QUIÉN Y CUÁNTO  — una línea por proveedor: cuánto se le debe y en cuántas facturas.
//   B · CADA OPERACIÓN  — una línea por factura: número, cuándo, obra, con qué se paga, categoría.
//
// Las dos cuelgan del mismo origen (la grilla entera de Compras) y del mismo filtro, así que no
// pueden decir cosas distintas: si una compra entra, entra en las dos.
//
//   node orquestador/scripts/proveedores-dos-cuadros.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-dos-cuadros.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { diferenciasDeHuella, huellaProtegida } from '../lib/proveedores-bloque-vivo.mjs'
import { COL, filtros, fuenteCompras, geometriaDeLaSeccion, PENDIENTE } from '../lib/proveedores-pivot-seccion1.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const T = { type: 'TEXT', pattern: '@' }
const PLATA = { type: 'CURRENCY', pattern: '"$"#,##0' }
const FECHA = { type: 'DATE', pattern: 'dd/mm/yyyy' }
const ENTERO = { type: 'NUMBER', pattern: '0' }

/** A · una línea por proveedor. COUNTA sobre el proveedor —no sobre el comprobante—: hay una factura
 *  sin número y contando comprobantes mostraba "0 facturas" a quien se le deben $100.000. */
const cuadroTotales = (fuente) => ({
  source: fuente,
  rows: [{ sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } }],
  values: [
    { sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Se le debe' },
    { sourceColumnOffset: COL.proveedor, summarizeFunction: 'COUNTA', name: 'Facturas' },
  ],
  filterSpecs: filtros(),
  valueLayout: 'HORIZONTAL',
})

/** B · una línea por factura, con todo lo que hace falta para decidir un pago. */
const cuadroDetalle = (fuente) => ({
  source: fuente,
  rows: [
    { sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
    { sourceColumnOffset: COL.comprobante, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.proximoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.obra, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.tipoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.categoria, showTotals: false, sortOrder: 'ASCENDING' },
  ],
  values: [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Importe' }],
  filterSpecs: filtros(),
  valueLayout: 'HORIZONTAL',
})

/** El formato de un bloque, columna por columna. Una dinámica usa el formato que la celda ya tenía:
 *  sin declararlo, el comprobante 826666 se ve como 01/05/4163 y una fecha como $46.238. */
function formato(sheetId, desde, alto, cols) {
  return cols.map((numberFormat, c) => ({ repeatCell: {
    range: { sheetId, startRowIndex: desde, endRowIndex: desde + alto, startColumnIndex: c, endColumnIndex: c + 1 },
    cell: { userEnteredFormat: { numberFormat, horizontalAlignment: numberFormat === T ? 'LEFT' : 'RIGHT' } },
    fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } }))
}

const texto = (sheetId, fila, valor, bold = false) => ({ updateCells: {
  range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: 0, endColumnIndex: 1 },
  rows: [{ values: [{ userEnteredValue: { stringValue: valor }, userEnteredFormat: { textFormat: { bold } } }] }],
  fields: 'userEnteredValue,userEnteredFormat.textFormat.bold' } })

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const pendientes = (compras ?? []).filter((f) => String(f?.[COL.estado] ?? '').trim() === PENDIENTE
    && String(f?.[COL.comercial] ?? '').trim() === '1')
  const proveedores = new Set(pendientes.map((f) => String(f?.[COL.proveedor] ?? '').trim())).size
  const total = pendientes.reduce((a, f) => a + (Number(f?.[COL.saldo]) || 0), 0)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const antes = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const geo = geometriaDeLaSeccion(visible)

  // A: rótulo + un proveedor por fila. B: subtítulo + rótulo + una factura por fila + suma total.
  const altoA = 1 + proveedores
  const altoB = 2 + pendientes.length + 1
  const necesita = altoA + 1 + altoB
  const disponibles = geo.filaLimite - geo.filaEncabezado

  console.log(`PROVEEDORES ${proveedores} · FACTURAS ${pendientes.length} · TOTAL ${plata(total)}`)
  console.log(`A (quién y cuánto) ${altoA} filas · B (cada operación) ${altoB} filas · necesita ${necesita}, hay ${disponibles}`)
  const COLCHON = 4
  const faltan = necesita > disponibles ? necesita - disponibles + COLCHON : 0
  if (faltan) console.log(`⚠ se insertan ${faltan} fila(s) antes de la sección 2 (fila ${geo.filaLimite})`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const compraMeta = meta.find((s) => s.title === 'Compras')
  if (!Number.isInteger(sheetId) || !(compraMeta?.rows > 3)) throw new Error('no pude resolver las pestañas: no escribo a ciegas')
  const fuente = fuenteCompras({ sheetId: compraMeta.sheetId, filas: compraMeta.rows })

  if (faltan) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: geo.filaLimite - 1, endIndex: geo.filaLimite - 1 + faltan },
      inheritFromBefore: true } }], { espejo: true })
    geo.filaLimite += faltan
  }

  // La huella se toma DESPUÉS de insertar: si no, compara filas corridas y grita diferencias falsas.
  const base = faltan ? await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' }) : antes
  const huellaAntes = huellaProtegida(base, { ...geo, ancho: 7 })

  const iA = geo.filaEncabezado - 1          // el rótulo del cuadro A
  const iSub = iA + altoA + 1                // el subtítulo del cuadro B
  const iB = iSub + 1                        // el rótulo del cuadro B
  const finIdx = geo.filaLimite - 1

  const vacias = Array.from({ length: finIdx - iA }, () => ({ values: Array.from({ length: 7 }, () => ({ userEnteredValue: null })) }))
  const anclaPivot = (fila, pivot) => ({ updateCells: {
    range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: 0, endColumnIndex: 1 },
    rows: [{ values: [{ pivotTable: pivot }] }], fields: 'pivotTable' } })

  await google.spreadsheetBatchUpdate(ID, [
    // Limpiar el ancho entero del bloque, incluidas las dinámicas viejas.
    { updateCells: { range: { sheetId, startRowIndex: iA, endRowIndex: finIdx, startColumnIndex: 0, endColumnIndex: 7 },
      rows: vacias, fields: 'userEnteredValue,pivotTable' } },
    anclaPivot(iA, cuadroTotales(fuente)),
    texto(sheetId, iSub, 'Cada operación', true),
    anclaPivot(iB, cuadroDetalle(fuente)),
    ...formato(sheetId, iA, altoA, [T, PLATA, ENTERO]),
    ...formato(sheetId, iB, altoB, [T, T, FECHA, T, T, T, PLATA]),
    // Ninguna fila del cuadro puede quedar oculta: siete lo estuvieron y el total cerraba igual.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: iA, endIndex: finIdx },
      properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })

  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const dif = diferenciasDeHuella(huellaAntes, huellaProtegida(despues, { ...geo, ancho: 7 }))
  if (dif.length) {
    console.error(`\n✗✗ SALIÓ DE SU RANGO — ${dif.length} celda(s) protegidas cambiaron:`)
    for (const d of dif.slice(0, 20)) console.error(`   ${d.dir}: "${d.antes}" → "${d.despues}"`)
    process.exitCode = 1
    return
  }
  console.log('✓ ni una celda protegida cambió (columna H y sección 2, verificadas releyendo)')

  const vista = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaEncabezado}:G${geo.filaLimite - 1}`)
  console.log('\nLEÍDO DEL ARCHIVO:')
  for (const f of vista ?? []) {
    const t = (f ?? []).map((c) => String(c ?? '')).join(' | ')
    console.log('  ' + (t.replace(/[| ]/g, '') ? t.slice(0, 104) : '·'))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
