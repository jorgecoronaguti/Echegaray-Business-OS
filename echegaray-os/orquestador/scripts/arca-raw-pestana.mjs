#!/usr/bin/env node
// _ARCA_RAW — LOS COMPROBANTES DE ARCA ADENTRO DEL SHEET, PARA QUE EL IVA SEA UNA FÓRMULA.
//
// POR QUÉ EXISTE (21/07). El dueño abrió una celda, vio un número donde esperaba una fórmula y
// escribió: "la pestaña no es un documento que se actualice de manera automática, esto me genera
// dudas respecto a TODO el sheet. Reglas de oro SIEMPRE EN TODO."
//
// El censo le dio la razón: Impuestos y Financieros tenía 21 fórmulas y 136 números pegados. Y la
// causa era estructural, no un descuido. El IVA sale de los comprobantes de ARCA, que viven en
// Postgres. Como el Sheet no los tenía, yo calculaba el cuadro en JavaScript y pegaba el resultado.
// Se veía bien y no se actualizaba solo — exactamente lo que la regla existe para impedir.
//
// ═══ LA REGLA QUE ESTO APLICA ═══
//
// "Si el insumo no está en el Sheet, se trae el INSUMO — no se pega el RESULTADO."
//
// Es la misma solución que el archivo ya usaba para los jornales: _J_OBREROS y _J_OFICINA son
// espejos del Sheet de JORNALES, y la pestaña de quincenas los referencia con fórmulas. Acá pasa lo
// mismo con ARCA. Una vez que los 459 comprobantes están en una pestaña, el cuadro de IVA se puede
// escribir entero con SUMIFS y deja de haber un solo número pegado.
//
// ═══ ESTO ES UNA RÉPLICA, Y SE DECLARA COMO TAL ═══
//
// No es "el dato": es una COPIA de lo que había en la base al momento del corte. Por eso la fila 1
// dice la fecha y la hora, cuántos comprobantes trajo y de dónde salen. Una réplica que no dice
// cuándo se sacó envejece en silencio, que es el defecto que ya rompió el espejo de JORNALES y el
// IPC en este mismo archivo.
//
// EL SIGNO VA CALCULADO EN LA COLUMNA, NO APLICADO AL IMPORTE. Una nota de crédito se guarda con su
// importe positivo y una columna aparte que dice −1. Así el que mira la pestaña ve el comprobante
// como lo emitió el proveedor, y las fórmulas de arriba multiplican. Guardar el importe ya negado
// escondería el dato original.
//
//   node orquestador/scripts/arca-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { signo, NOMBRE } from '../lib/comprobante-arca.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_ARCA_RAW'
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es contrato: las fórmulas de Impuestos las referencian. */
export const COLUMNAS = [
  ['Período', 'texto'],
  ['Libro', 'texto'],
  ['Fecha', 'fecha'],
  ['Tipo', 'texto'],
  ['Cód.', 'texto'],
  ['Signo', 'cantidad'],
  ['Punto vta', 'texto'],
  ['Número', 'texto'],
  ['CUIT', 'texto'],
  ['Razón social', 'texto'],
  ['Neto gravado', 'moneda'],
  ['IVA', 'moneda'],
  ['Total', 'moneda'],
]

/** Dónde vive cada columna, para que las fórmulas no la busquen por posición a ojo. */
export const COL = {
  periodo: 'A', libro: 'B', fecha: 'C', tipo: 'D', codigo: 'E', signo: 'F',
  puntoVenta: 'G', numero: 'H', cuit: 'I', nombre: 'J', neto: 'K', iva: 'L', total: 'M',
}
export const FILA0 = 4   // la primera fila de datos

/** NÚCLEO PURO: una fila de la réplica a partir de un comprobante. */
export function fila(c) {
  const s = signo(c.tipo_comprobante)
  return [
    // EL APÓSTROFO NO ES DECORATIVO. USER_ENTERED parsea "2026-06" como una FECHA al escribirlo, y el
    // formato TEXT que se aplica después no lo revierte. Probado: la columna quedó con el serial
    // 46023, los COUNTIFS seguían andando (Sheets coacciona el criterio) pero los SUMPRODUCT daban
    // CERO porque comparaban un número contra un texto. Un cuadro de IVA en cero que no da error.
    c.periodo ? `'${c.periodo}` : '',
    c.tipo_libro === 'E' ? 'Ventas' : 'Compras',
    c.fecha_emision instanceof Date ? c.fecha_emision.toISOString().slice(0, 10) : String(c.fecha_emision ?? ''),
    NOMBRE?.[String(c.tipo_comprobante ?? '').trim()] ?? `Código ${c.tipo_comprobante ?? '?'}`,
    String(c.tipo_comprobante ?? ''),
    // NULL cuando el código no se reconoce: mejor que la fórmula de arriba deje de sumar esa fila a
    // que la sume con el signo equivocado. Asumir +1 fue el bug que costó $41,9M de error.
    s === null ? '' : s,
    String(c.punto_venta ?? ''),
    String(c.numero ?? ''),
    String(c.emisor_cuit ?? ''),
    String(c.emisor_nombre ?? ''),
    Number(c.neto_gravado) || 0,
    Number(c.total_iva) || 0,
    Number(c.imp_total) || 0,
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { rows } = await query(
    `select periodo, tipo_libro, fecha_emision, tipo_comprobante, punto_venta, numero,
            emisor_cuit, emisor_nombre,
            neto_gravado::float8 neto_gravado, total_iva::float8 total_iva, imp_total::float8 imp_total
       from comprobantes_arca
      order by fecha_emision, tipo_libro, numero`)

  const datos = rows.map(fila)
  const sinSigno = datos.filter((f) => f[5] === '').length
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    if (DRY) { console.log(`(--dry) habría creado la pestaña ${PESTAÑA} con ${datos.length} comprobantes`); return }
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: Math.max(datos.length + 20, 600), columnCount: COLUMNAS.length + 2, frozenRowCount: 3 } } },
    }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  if (DRY) { console.log(`(--dry) ${datos.length} comprobantes, ${sinSigno} sin signo reconocido`); return }

  // La grilla tiene que alcanzar ANTES de escribir: un rango que excede la hoja hace fallar el
  // batch entero y no escribe nada.
  const filasNecesarias = datos.length + FILA0 + 20
  if ((hoja.rows ?? 0) < filasNecesarias) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filasNecesarias } }, fields: 'gridProperties.rowCount' },
    }])
  }

  // NO se borra nada escrito por una persona (regla de oro): se arma la grilla completa
  // —título, nota, encabezados y datos— y se FUSIONA con lo que hay. Ver lib/preservar-anotaciones.mjs.
  const gridRaw = [
    [`_ARCA_RAW — réplica de los comprobantes de ARCA · corte ${corte}`],
    [`${datos.length} comprobantes. NO se carga a mano: la reescribe el agente en cada corrida desde la base del OS, que a su vez los trae de ARCA. Existe para que el cuadro de IVA de "Impuestos y Financieros" sea una fórmula sobre datos que están en el archivo, y no un número calculado afuera y pegado.${sinSigno ? ` ${ALERTA} ${sinSigno} comprobante(s) con un código que no sé si suma o resta: su columna Signo está vacía y las fórmulas NO los cuentan.` : ''}`],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]
  // LA COLA DE UNA CORRIDA ANTERIOR (13/08). Esta réplica se ACORTA sola: una nota de crédito que se
  // corrige de signo, un período que se vuelve a bajar de ARCA con menos comprobantes, un duplicado
  // que se borra de la base. Sin esto las filas de más abajo sobreviven y el libro de IVA del Sheet
  // sigue mostrando un comprobante que ARCA ya no tiene — y de este espejo cuelgan las fórmulas de
  // "Impuestos y financiero". Un espejo con cola miente igual que un cuadro con cola.
  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, gridRaw, { ancho: COLUMNAS.length, tope: filasNecesarias })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, cola.filas, { respetar: false, espejo: true /* espejo de una fuente externa (ARCA): copia byte a byte, sin candado ni firma ni Regla 0 — no hay nada del dueño que proteger, y respetar congelaría el nombre de un campo de ARCA si cambiara */, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, filasNecesarias, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, filasNecesarias, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    const ancho = unidad === 'moneda' ? E.ANCHO.numero : unidad === 'fecha' ? E.ANCHO.fecha : j === 9 ? E.ANCHO.texto : E.ANCHO.angosta
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ancho }, fields: 'pixelSize' } })
  })
  for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 300))

  // VERIFICACIÓN: releer y confirmar que el total del Sheet es el mismo que el de la base.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.total}${FILA0}:${COL.total}${FILA0 + datos.length}`)
  const enSheet = v.filter((f) => String(f?.[0] ?? '').trim()).length
  console.log(`${PESTAÑA}: ${datos.length} comprobantes en la base · ${enSheet} escritos${sinSigno ? ` · ⚠ ${sinSigno} sin signo reconocido` : ''}`)
  if (enSheet !== datos.length) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
