#!/usr/bin/env node
// _BANCO_RAW — EL EXTRACTO DEL SANTANDER ADENTRO DEL SHEET.
//
// POR QUÉ EXISTE (21/07). Es el tercer insumo que se trae con el mismo criterio, después de
// _ARCA_RAW (libro de IVA) y _F931_RAW (las DDJJ leídas del PDF). La regla es siempre la misma:
//
//     Si el insumo no está en el archivo, se trae el INSUMO — no se pega el RESULTADO.
//
// Sin el extracto adentro, tres números de CAJA tenían que calcularse en JavaScript y pegarse: los
// depósitos de efectivo de la ventana, el saldo de la cuenta y la cartera de echeqs. Un número
// pegado envejece en silencio: se agrega un movimiento y el cuadro sigue mostrando el de ayer.
//
// ═══ Y ADEMÁS DESBLOQUEA DOS DE LAS TRES ALERTAS DE CAJA ═══
//
// El bloque "LO QUE NO CIERRA" muestra $20.000.000 de echeqs que el cash flow espera y ya se
// entregaron, y $15.730.646 de efectivo cobrado que no se depositó. Las dos preguntas se contestan
// mirando movimientos del banco, y hasta hoy la respuesta vivía en un array de JavaScript que nadie
// podía abrir desde el Sheet.
//
// ES UNA RÉPLICA, Y SE DECLARA COMO TAL: la fila 1 dice de qué cuenta es, a qué fecha está cortada y
// de dónde salió. Una réplica que no dice cuándo se sacó envejece sin gritar — el defecto que ya
// rompió el espejo de JORNALES y el IPC en este mismo archivo.
//
//   node orquestador/scripts/banco-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as BANCO from '../lib/banco-santander.mjs'
import * as E from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_BANCO_RAW'
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es contrato: las fórmulas de CAJA lo referencian. */
export const COLUMNAS = [
  ['Fecha', 'fecha'], ['Concepto', 'texto'], ['Importe', 'monedaExacta'], ['Saldo después', 'monedaExacta'],
  ['Entra o sale', 'texto'], ['Naturaleza', 'texto'],
]
export const COL = { fecha: 'A', concepto: 'B', importe: 'C', saldo: 'D', signo: 'E', naturaleza: 'F' }
export const FILA0 = 4

/**
 * NÚCLEO PURO: una fila de la réplica.
 *
 * La NATURALEZA no está en el extracto: la deduce el OS (lib/banco-santander.mjs) y por eso se
 * escribe en su propia columna, al lado del concepto original y sin tocarlo. Un depósito de efectivo
 * y un cobro son las dos cosas un "ingreso" para el banco, y sólo una es plata nueva.
 */
export function fila(m) {
  const entra = Number(m.importe) >= 0
  return [
    String(m.fecha ?? ''),
    String(m.concepto ?? ''),
    Number(m.importe) || 0,
    Number(m.saldo) || 0,
    entra ? 'entra' : 'sale',
    // LA NATURALEZA SE ESCRIBE PARA TODOS, TAMBIÉN PARA LO QUE SALE (21/07).
    //
    // Antes sólo se llenaba en los ingresos, y eso dejaba la mitad más grande del extracto sin
    // clasificar: 65 de los 70 movimientos son egresos. Sin naturaleza en la columna, la pregunta
    // "¿cuánto salió del banco en cheques, y la pestaña de Cheques Emitidos lo tiene?" no se podía
    // contestar con una fórmula — había que calcularla afuera y pegar el resultado.
    //
    // Es la columna que hace posible la conciliación por naturaleza: cada peso que salió tiene una
    // pestaña donde debería estar registrado, y ahora el Sheet lo puede preguntar solo.
    BANCO.clasificarMovimiento(m.concepto ?? ''),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const movs = [...BANCO.MOVIMIENTOS].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  // Los movimientos del día (22/07 sin saldo corrido + el hold sin detalle) van DESPUÉS de la cadena
  // ordenada, para que el último saldo de la réplica sea el DECLARADO por el banco y CAJA muestre lo
  // que hay hoy, no el último saldo corrido del detalle. Ver MOVIMIENTOS_DIA en la lib.
  const datos = [...movs, ...(BANCO.MOVIMIENTOS_DIA ?? [])].map(fila)
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')

  console.log(`${datos.length} movimientos del extracto · corte del banco ${BANCO.CORTE}`)
  const entran = datos.filter((f) => f[4] === 'entra')
  console.log(`  entran ${entran.length} por ${Math.round(entran.reduce((s, f) => s + f[2], 0)).toLocaleString('es-AR')} · salen ${datos.length - entran.length}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: datos.length + 40, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(datos.length + FILA0 + 20, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }

  await google.clearValues(ID, `${PESTAÑA}!A1:Z${alto}`)
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!A1`, values: [[`_BANCO_RAW — extracto del ${BANCO.CUENTA?.banco ?? 'Santander'} ${BANCO.CUENTA?.numero ?? ''} · corte del banco ${BANCO.CORTE} · réplica del ${corte}`]] },
    { range: `${PESTAÑA}!A2`, values: [[`${datos.length} movimientos. NO se carga a mano: la reescribe el agente desde la réplica del extracto. Existe para que los números de CAJA que hoy salen del banco sean FÓRMULAS y no valores calculados afuera y pegados. La columna "Naturaleza" NO está en el extracto: la deduce el OS —un depósito de efectivo y un cobro son las dos cosas un ingreso para el banco, y sólo una es plata nueva—.`]] },
    { range: `${PESTAÑA}!A3:${COL.naturaleza}3`, values: [COLUMNAS.map(([n]) => n)] },
    { range: `${PESTAÑA}!A${FILA0}`, values: datos },
  ])

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 1 ? 300 : j >= 4 ? 110 : E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // VERIFICACIÓN: el saldo de la última fila del extracto tiene que ser el que declara el banco.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.saldo}${FILA0}:${COL.saldo}${FILA0 + datos.length}`)
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  console.log(`${PESTAÑA}: ${datos.length} movimientos · ${escritas} escritos`)
  if (escritas !== datos.length) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
