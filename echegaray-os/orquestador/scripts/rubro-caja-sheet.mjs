#!/usr/bin/env node
// Escribe en Compras las dos columnas que definen la caja: QUÉ es cada gasto y CUÁNDO sale la plata.
//
// Hasta hoy esa regla vivía en una columna auxiliar escondida del Cash Flow Semanal (BF1) y cada
// pestaña que la necesitaba se la volvía a escribir. Resultado medido: el Mensual no tenía la línea
// de servicios recurrentes ($9.825.332 afuera del año) y los dos leían Estructura de un rango
// muerto ($33.223.269 en $0). Con la regla en Compras hay un solo lugar donde mirar y donde
// corregir, y el dueño la ve.
//
//   node orquestador/scripts/rubro-caja-sheet.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { formulaRubro, formulaFechaCaja, RUBROS } from '../lib/rubro-caja.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')

// AC y AD: las dos primeras columnas libres después de "Estado Carga" (AB).
const COL_RUBRO = 28 // 0-based → AC
const COL_FECHA = 29 // 0-based → AD

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // EL CANDADO TAMBIÉN ACÁ (24/07). Escribe columnas de "Compras" por rango suelto (no pasa por
  // escribirPreservando). Compras es fuente y rara vez se canda, pero si el dueño la tomó, se respeta.
  const { estaBloqueada } = await import('../lib/pestana-bloqueada.mjs')
  if (await estaBloqueada({}, ID, 'Compras').catch(() => false)) {
    console.log('🔒 "Compras" está bajo tu control (candado): no la toco.')
    return
  }
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === 'Compras')
  if (!hoja) throw new Error('no encontré la pestaña Compras')
  const { sheetId, cols: columnCount } = hoja

  const fRubro = formulaRubro()
  const fFecha = formulaFechaCaja()
  console.log(`Compras: ${columnCount} columnas · ${RUBROS.length} rubros`)
  console.log(`AC3 Rubro de caja  →  ${fRubro.slice(0, 90)}…`)
  console.log(`AD3 Fecha de caja  →  ${fFecha.slice(0, 90)}…`)
  if (DRY) return console.log('\n--dry: no escribí nada.')

  const req = []
  // Ensanchar la grilla si hace falta: la API rechaza escribir fuera del rango declarado.
  if (columnCount < COL_FECHA + 1) {
    req.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: COL_FECHA + 1 - columnCount } })
  }

  const celda = (v, { formula = false, negrita = false, fondo = null, fmt = null } = {}) => ({
    userEnteredValue: formula ? { formulaValue: v } : { stringValue: v },
    userEnteredFormat: {
      ...(negrita ? { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } : {}),
      ...(fondo ? { backgroundColor: fondo } : {}),
      ...(fmt ? { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } : {}),
    },
  })
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }

  // Encabezados en la fila 3, igual que el resto de Compras.
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: COL_RUBRO, endColumnIndex: COL_FECHA + 1 },
      rows: [{ values: [celda('Rubro de caja', { negrita: true, fondo: AZUL }), celda('Fecha de caja', { negrita: true, fondo: AZUL })] }],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  // Las fórmulas: una sola celda cada una, ARRAYFORMULA derrama sobre todas las filas.
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: COL_RUBRO, endColumnIndex: COL_FECHA + 1 },
      rows: [{ values: [celda(fRubro, { formula: true }), celda(fFecha, { formula: true, fmt: 'DATE' })] }],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  req.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: COL_RUBRO, endIndex: COL_FECHA + 1 },
      properties: { pixelSize: 190 },
      fields: 'pixelSize',
    },
  })

  await google.spreadsheetBatchUpdate(ID, req)

  // Verificar sobre el resultado REAL, no sobre la intención: leer lo que quedó y contarlo.
  const filas = await google.readSheetValues(ID, 'Compras!AC4:AD1000')
  const acc = new Map()
  let vacias = 0
  for (const f of filas) {
    const r = String(f?.[0] ?? '').trim()
    if (!r) continue
    if (!f?.[1]) vacias++
    acc.set(r, (acc.get(r) ?? 0) + 1)
  }
  console.log('\nQUEDÓ ESCRITO:')
  for (const [k, v] of [...acc].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
  const sc = acc.get('SIN CLASIFICAR') ?? 0
  console.log(`\n  sin clasificar: ${sc}${sc ? '  ⚠ HAY GASTOS QUE NO CAEN EN NINGÚN RUBRO' : '  ✓'}`)
  console.log(`  sin fecha de caja: ${vacias}${vacias ? '  ⚠ esos gastos no aparecen en ninguna semana' : '  ✓'}`)
  if (sc) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
