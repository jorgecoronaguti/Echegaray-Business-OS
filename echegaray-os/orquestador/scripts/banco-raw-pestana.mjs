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
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { query } from '../lib/db.mjs'

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
  // ═══ EL EXTRACTO SALE DE LA BASE, NO DEL CÓDIGO ═══
  //
  // Hasta hoy los movimientos eran un array escrito a mano en lib/banco-santander.mjs: cargar el
  // extracto del día significaba editar JavaScript, y un dato operativo que sólo se actualiza
  // tocando el código no se actualiza — envejece. Ahora entran por
  // `scripts/importar-banco.mjs` (CSV o pegado), con deduplicación y verificación de la cadena de
  // saldos, y esta réplica los lee de `public.banco_movimientos`.
  //
  // SI LA BASE NO CONTESTA, SE USA EL ARRAY. No es pereza: dejar la pestaña en cero porque falló una
  // conexión sería mucho peor que mostrar el último extracto conocido — de _BANCO_RAW cuelgan por
  // fórmula la disponibilidad de CAJA, el impuesto al cheque y el cruce de Cheques.
  //
  // El ORDEN es contrato: primero la cadena con saldo corrido, y al final los movimientos del día
  // (sin saldo), para que el último saldo de la réplica sea el DECLARADO por el banco y CAJA muestre
  // lo que hay hoy, no el último saldo corrido del detalle.
  let movs = null
  try {
    const { rows } = await query(
      `select fecha, concepto, importe, saldo_despues as saldo
         from public.banco_movimientos
        order by (saldo_despues is null), fecha, id`,
    )
    if (rows.length) {
      movs = rows.map((r) => ({
        fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
        concepto: r.concepto,
        importe: Number(r.importe),
        saldo: r.saldo == null ? undefined : Number(r.saldo),
      }))
      console.log(`fuente: public.banco_movimientos — ${movs.length} movimiento(s)`)
    }
  } catch (e) {
    console.warn(`⚠ no pude leer public.banco_movimientos (${String(e.message).slice(0, 70)}): uso el extracto del código`)
  }
  if (!movs) {
    console.log('fuente: el array del código (la base todavía no tiene movimientos — corré importar-banco.mjs --sembrar)')
    movs = [
      ...[...BANCO.MOVIMIENTOS].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
      ...(BANCO.MOVIMIENTOS_DIA ?? []),
    ]
  }
  const datos = movs.map(fila)
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

  // NO se borra nada escrito por una persona (regla de oro): se arma la grilla completa
  // —título, nota, encabezados y datos— y se FUSIONA con lo que hay. Ver lib/preservar-anotaciones.mjs.
  const gridRaw = [
    [`_BANCO_RAW — extracto del ${BANCO.CUENTA?.banco ?? 'Santander'} ${BANCO.CUENTA?.numero ?? ''} · corte del banco ${BANCO.CORTE} · réplica del ${corte}`],
    [`${datos.length} movimientos. NO se carga a mano: la reescribe el agente desde la réplica del extracto. Existe para que los números de CAJA que hoy salen del banco sean FÓRMULAS y no valores calculados afuera y pegados. La columna "Naturaleza" NO está en el extracto: la deduce el OS —un depósito de efectivo y un cobro son las dos cosas un ingreso para el banco, y sólo una es plata nueva—.`],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]
  // ═══ LA COLA DE UNA CORRIDA ANTERIOR ═══
  //
  // Esta réplica puede ACORTARSE: si un movimiento se borra de la base (una carga equivocada que se
  // deshace), la grilla nueva tiene menos filas y las de más abajo SOBREVIVEN — el precio declarado
  // de no borrar nunca. Y sobreviven en silencio: el extracto muestra un movimiento que ya no
  // existe, la cadena de saldos no cierra, y de acá cuelga la disponibilidad de CAJA.
  //
  // Se extiende con el centinela VACIO, que significa "es mi celda y va vacía": limpia lo que dejó
  // este generador y CONSERVA cualquier anotación de una persona en una columna que no ocupa.
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:${String.fromCharCode(64 + COLUMNAS.length)}1000`).catch(() => [])
  let ultimaConDato = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultimaConDato = i + 1 })
  if (ultimaConDato > gridRaw.length) {
    console.log(`  cola de una corrida anterior: limpio las filas ${gridRaw.length + 1}–${ultimaConDato}`)
    for (let i = gridRaw.length; i < ultimaConDato; i++) gridRaw.push(Array(COLUMNAS.length).fill(VACIO))
  }
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, gridRaw, { anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

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
