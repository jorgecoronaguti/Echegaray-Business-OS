#!/usr/bin/env node
// Escribe en Compras las dos columnas que definen la caja: QUÉ es cada gasto y CUÁNDO sale la plata.
//
// Hasta hoy esa regla vivía en una columna auxiliar escondida del Cash Flow Semanal (BF1) y cada
// pestaña que la necesitaba se la volvía a escribir. Resultado medido: el Mensual no tenía la línea
// de servicios recurrentes ($9.825.332 afuera del año) y los dos leían Estructura de un rango
// muerto ($33.223.269 en $0). Con la regla en Compras hay un solo lugar donde mirar y donde
// corregir, y el dueño la ve.
//
// ═══ LAS COLUMNAS SALEN DEL RÓTULO (14/09/2026) ═══
//
// Eran `COL_RUBRO_CAJA`/`COL_FECHA_CAJA` (AC/AD). Con «Obra» insertada en L son AD/AE, y AC pasa a ser
// la 1.ª «Rubro de caja», la fósil: una corrida con la letra vieja le escribía el ancla encima. Ahora
// se resuelven contra la fila de rótulos viva, pasan por el portón de escritores
// (`compras-layout.mjs`) y las fórmulas se anclan traducidas a ese mismo layout.
//
//   node orquestador/scripts/rubro-caja-sheet.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { formulaRubro, formulaFechaCaja, RUBROS } from '../lib/rubro-caja.mjs'
import { ESPECIES, FIELDS, FILA0 } from '../lib/compras-especies.mjs'
import { lectorDeEncabezados } from '../lib/columnas-por-encabezado.mjs'
import { columnaParaEscribir, portonDeRequests } from '../lib/compras-layout.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const ESCRITOR = 'rubro-caja-sheet'

/**
 * NÚCLEO PURO: los requests contra la fila de rótulos viva. Las dos columnas tienen que ser vecinas
 * (rubro y fecha, en ese orden): el ancla se escribe en un solo `updateCells` de dos celdas.
 */
export function requestsDeRubroCaja(encabezado, { sheetId, filas }) {
  const colRubro = columnaParaEscribir(encabezado, ESCRITOR, 'rubro')
  const colFecha = columnaParaEscribir(encabezado, ESCRITOR, 'fechaCaja')
  if (colFecha.indice !== colRubro.indice + 1) {
    throw new Error(`rubro-caja: «Fecha de caja» (${colFecha.letra}) ya no está al lado de «Rubro de caja» (${colRubro.letra}): no escribo`)
  }
  const celda = (v, { formula = false, negrita = false, fondo = null } = {}) => ({
    userEnteredValue: formula ? { formulaValue: v } : { stringValue: v },
    userEnteredFormat: {
      ...(negrita ? { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } : {}),
      ...(fondo ? { backgroundColor: fondo } : {}),
    },
  })
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const [a, b] = [colRubro.indice, colFecha.indice + 1]
  const req = [
    // Encabezados en la fila 3, igual que el resto de Compras.
    { updateCells: {
      range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: a, endColumnIndex: b },
      rows: [{ values: [celda('Rubro de caja', { negrita: true, fondo: AZUL }), celda('Fecha de caja', { negrita: true, fondo: AZUL })] }],
      fields: 'userEnteredValue,userEnteredFormat',
    } },
    // Las fórmulas: una sola celda cada una, ARRAYFORMULA derrama sobre todas las filas.
    { updateCells: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: a, endColumnIndex: b },
      rows: [{ values: [celda(formulaRubro(encabezado), { formula: true }), celda(formulaFechaCaja(encabezado), { formula: true })] }],
      fields: 'userEnteredValue,userEnteredFormat',
    } },
    { updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: a, endIndex: b },
      properties: { pixelSize: 190 }, fields: 'pixelSize',
    } },
    // ═══ EL VALOR VA SÓLO AL ANCLA; EL FORMATO VA A TODO EL DERRAME (15/08/2026) ═══
    //
    // El derrame no hereda el formato del ancla: medido el 15/08, 699 celdas de la fecha de caja con
    // `numberFormat: undefined` dibujaban el serial pelado, y `cruce-banco.mjs` las perdía al parsear.
    // La máscara `FIELDS` nombra sólo `userEnteredFormat.*`: este request no puede tocar un valor.
    { repeatCell: {
      range: { sheetId, startRowIndex: FILA0 - 1, endRowIndex: filas, startColumnIndex: colFecha.indice, endColumnIndex: colFecha.indice + 1 },
      cell: { userEnteredFormat: ESPECIES.fecha }, fields: FIELDS,
    } },
  ]
  return { req: portonDeRequests(encabezado, ESCRITOR, req), colRubro, colFecha }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // EL CANDADO TAMBIÉN ACÁ (24/07). Si el dueño tomó Compras, se respeta.
  const { estaBloqueada } = await import('../lib/pestana-bloqueada.mjs')
  if (await estaBloqueada({}, ID, 'Compras').catch(() => false)) {
    console.log('🔒 "Compras" está bajo tu control (candado): no la toco.')
    return
  }
  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === 'Compras')
  if (!hoja) throw new Error('no encontré la pestaña Compras')
  const encabezado = await lectorDeEncabezados(google, ID).encabezado('Compras')
  const { req, colRubro, colFecha } = requestsDeRubroCaja(encabezado, { sheetId: hoja.sheetId, filas: hoja.rows })

  console.log(`Compras: ${hoja.cols} columnas · ${RUBROS.length} rubros`)
  console.log(`${colRubro.letra}3 Rubro de caja  →  ${formulaRubro(encabezado).slice(0, 90)}…`)
  console.log(`${colFecha.letra}3 Fecha de caja  →  ${formulaFechaCaja(encabezado).slice(0, 90)}…`)
  if (DRY) return console.log('\n--dry: no escribí nada.')

  await google.spreadsheetBatchUpdate(ID, req)

  // Verificar sobre el resultado REAL, no sobre la intención: leer lo que quedó y contarlo.
  const filas = await google.readSheetValues(ID, `Compras!${colRubro.letra}4:${colFecha.letra}1000`)
  const acc = new Map()
  let vacias = 0
  for (const f of filas) {
    const r = String(f?.[0] ?? '').trim()
    if (!r) continue
    if (!f?.[1]) vacias++
    acc.set(r, (acc.get(r) ?? 0) + 1)
  }
  console.log('\nQUEDÓ ESCRITO:')
  for (const [k, v] of [...acc].sort((x, y) => y[1] - x[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
  const sc = acc.get('SIN CLASIFICAR') ?? 0
  console.log(`\n  sin clasificar: ${sc}${sc ? '  ⚠ HAY GASTOS QUE NO CAEN EN NINGÚN RUBRO' : '  ✓'}`)
  console.log(`  sin fecha de caja: ${vacias}${vacias ? '  ⚠ esos gastos no aparecen en ninguna semana' : '  ✓'}`)
  // NO se sale con código de error por "sin clasificar" (25/07): es un hallazgo de calidad de dato,
  // no una falla del pipeline. Un exit≠0 queda para una excepción real, que atrapa el catch de abajo.
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
