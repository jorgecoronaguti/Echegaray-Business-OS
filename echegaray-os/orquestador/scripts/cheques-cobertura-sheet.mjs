#!/usr/bin/env node
// Escribe en el Cash Flow Mensual el bloque que contesta: ¿los cheques y la tarjeta están o no?
//
// "¿Qué pasó con los cheques a cubrir en los cash flows, en qué concepto están?" y "¿todo lo que se
// contempla en Compras está en algún concepto del cash flow?".
//
// LA RESPUESTA CORTA: lo que está en Compras sí está — el control de partición da $0 y eso ya está
// escrito al pie de las dos pestañas. Pero la pregunta buena era la otra: hay pagos que NO están en
// Compras, y por lo tanto no están en ninguna línea del cash flow. Son cheques y tarjeta sin factura
// registrada. Por eso este bloque no suma nada al cash flow: MIDE lo que falta cargar.
//
// POR QUÉ NO SE SUMA UNA LÍNEA "CHEQUES". Porque 39 de los 89 cheques ($38.388.505) pagan facturas
// que YA están en Compras y ya viajaron al cash flow por su rubro. Sumarlos otra vez sería duplicar
// $38,4M — exactamente lo que la regla de oro prohíbe. El cheque es el instrumento, no el concepto.
//
//   node orquestador/scripts/cheques-cobertura-sheet.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { repartirCobertura, aCubrirPorMes, normComprobante, esLlaveUtil, hallarPestana } from '../lib/cheques-cobertura.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cash Flow Mensual'
const DRY = process.argv.includes('--dry')
const ANCHO = 6
const FIRMA = 'CHEQUES Y TARJETA — ¿están contemplados en las líneas de arriba?'

const num = (s) => parseFloat(String(s ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const ars = (x) => Math.round(x)

async function leer(google) {
  const hojas = await google.getSheetMeta(ID)
  const CH = hallarPestana(hojas, 'Cheques').title
  const compras = await google.readSheetValues(ID, 'Compras!A4:AD800')
  // La llave: el número de comprobante de la factura. Es lo único que comparten las tres planillas.
  const enCompras = new Set(
    compras.filter((f) => num(f?.[14]) > 0).map((f) => normComprobante(f?.[7])).filter(esLlaveUtil),
  )
  const cheques = (await google.readSheetValues(ID, `${CH}!A2:L400`))
    .filter((f) => num(f?.[5]) > 0)
    .map((f) => ({ tipo: f[0], proveedor: f[4], monto: num(f[5]), comprobante: f[7], fecha_pago: f[9], debitado: f[10] }))
  const tarjeta = (await google.readSheetValues(ID, 'Tarjeta de Credito!A3:K400'))
    .filter((f) => num(f?.[4]) > 0)
    .map((f) => ({ proveedor: f[2], monto: num(f[4]), comprobante: f[6], fecha_pago: f[8], debitado: f[9] }))
  return { enCompras, cheques, tarjeta, pestanaCheques: CH }
}

function grilla({ enCompras, cheques, tarjeta }) {
  const ch = repartirCobertura(cheques, enCompras)
  const tj = repartirCobertura(tarjeta, enCompras)
  const cubrir = aCubrirPorMes(cheques)
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }

  push([FIRMA])
  push(['El cheque y la tarjeta son CÓMO se paga, no QUÉ se compró: el concepto es el de la factura, y por eso viajan al cash flow desde Compras. Este bloque no suma nada — mide cuánto de cada instrumento tiene su factura cargada y cuánto no. Se cruza por número de comprobante.'])
  push()
  push(['', 'Cantidad', 'Monto', '', '', 'Qué significa'])
  push(['CHEQUES — total emitido', cheques.length, ars(ch.total), '', '', ''])
  push(['  · ya contemplados (su factura está en Compras)', ch.contemplados.length, ars(ch.monto_contemplado), '', '', 'Ya están en el cash flow, en el rubro de esa factura. Sumarlos de nuevo sería duplicar.'])
  push(['  · FALTA la factura en Compras (confirmado)', ch.falta_factura.length, ars(ch.monto_falta_factura), '', '', '⚠ Tienen número de comprobante y ese número NO está en Compras. Plata que sale y que ninguna línea del cash flow ve.'])
  push(['  · sin N° de comprobante — no se puede saber', ch.sin_numero_comprobante.length, ars(ch.monto_sin_numero), '', '', 'Su factura puede estar en Compras perfectamente. Cargando el N° de comprobante en la pestaña Cheques se resuelve solo.'])
  push()
  push(['TARJETA DE CRÉDITO — total', tarjeta.length, ars(tj.total), '', '', ''])
  push(['  · ya contemplados', tj.contemplados.length, ars(tj.monto_contemplado), '', '', ''])
  push(['  · FALTA la factura (confirmado)', tj.falta_factura.length, ars(tj.monto_falta_factura), '', '', ''])
  push(['  · sin N° de comprobante', tj.sin_numero_comprobante.length, ars(tj.monto_sin_numero), '', '', ''])
  push()
  const fFalta = filas.length + 1
  push(['⇒ FALTA CARGAR, CONFIRMADO', ch.falta_factura.length + tj.falta_factura.length, ars(ch.monto_falta_factura + tj.monto_falta_factura), '', '', 'El cash flow subestima los egresos AL MENOS en esto.'])
  push(['⇒ Sin poder verificar (falta el N° de comprobante)', ch.sin_numero_comprobante.length + tj.sin_numero_comprobante.length, ars(ch.monto_sin_numero + tj.monto_sin_numero), '', '', 'No es un faltante: es una ignorancia. Se resuelve cargando el número en Cheques y Tarjeta.'])
  push()
  push(['CHEQUES A CUBRIR — los que todavía no se debitaron'])
  push(['Otra pregunta, y es de tesorería: no importa si la factura está registrada, importa cuánta plata tiene que haber en la cuenta y cuándo. Un cheque emitido es un compromiso más firme que una factura con fecha prevista.'])
  push(['Mes de pago', 'Cantidad', 'Monto', '', '', ''])
  const c0 = filas.length + 1
  for (const m of cubrir.por_mes) push([m.mes, m.cantidad, ars(m.monto)])
  const c1 = filas.length
  push(['TOTAL A CUBRIR', `=SUM(B${c0}:B${c1})`, `=SUM(C${c0}:C${c1})`, '', '', 'Compromiso en firme ya emitido.'])
  return { filas, fFalta, c0, c1, ch, tj, cubrir }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const datos = await leer(google)
  const g = grilla(datos)
  console.log(`CHEQUES  ${datos.cheques.length} · contemplados ${g.ch.contemplados.length} (${ars(g.ch.monto_contemplado).toLocaleString('es-AR')}) · falta factura ${g.ch.falta_factura.length} (${ars(g.ch.monto_falta_factura).toLocaleString('es-AR')}) · sin N° ${g.ch.sin_numero_comprobante.length} (${ars(g.ch.monto_sin_numero).toLocaleString('es-AR')})`)
  console.log(`TARJETA  ${datos.tarjeta.length} · contemplados ${g.tj.contemplados.length} (${ars(g.tj.monto_contemplado).toLocaleString('es-AR')}) · falta factura ${g.tj.falta_factura.length} · sin N° ${g.tj.sin_numero_comprobante.length}`)
  console.log(`A CUBRIR ${ars(g.cubrir.total).toLocaleString('es-AR')} en ${g.cubrir.por_mes.length} meses`)
  if (DRY) return

  // Idempotente: si el bloque ya está, se rehace en su lugar; si no, va después de lo último.
  const actual = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}200`)
  const yaEsta = actual.findIndex((f) => String(f?.[0] ?? '').startsWith('CHEQUES Y TARJETA'))
  let F
  if (yaEsta >= 0) { F = yaEsta + 1; await google.clearValues(ID, `${PESTAÑA}!A${F}:${letra(ANCHO - 1)}200`) } else {
    let fin = 0
    actual.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) fin = i + 1 })
    F = fin + 3
  }
  // Las filas con fórmula traen referencias relativas al bloque: se corrigen al saber dónde cae.
  const filas = g.filas.map((f) => f.map((c) => (typeof c === 'string' && c.startsWith('=SUM(') ? c.replace(/([BC])(\d+):([BC])(\d+)/, (_, a, x, b, y) => `${a}${Number(x) + F - 1}:${b}${Number(y) + F - 1}`) : c)))
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A${F}:${letra(ANCHO - 1)}${F + filas.length - 1}`, values: filas }])

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  const sheetId = hoja.sheetId
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } } }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(F - 1, F), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(F, F + 1), cell: { userEnteredFormat: { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: rg(F + g.fFalta - 2, F + g.fFalta - 1), cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } }, backgroundColor: { red: 1, green: 0.93, blue: 0.93 } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 460 }, fields: 'pixelSize' } },
  ])

  await marcarPestanaCheques(google, datos)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F}:C${F + filas.length - 1}`)
  console.log(`\nEscrito en la fila ${F}:`)
  for (const f of v) if (f?.[0] && (f?.[2] || f?.[1])) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(6)}${String(f[2] ?? '').padStart(16)}`)
}

/**
 * Marca cada cheque en su propia pestaña: ¿su factura está cargada en Compras o no?
 *
 * El resumen del Cash Flow dice cuánto falta; acá se ve CUÁL. Sin esto, "$33,5M sin factura" es un
 * número que nadie puede accionar — hay que poder abrir la pestaña, filtrar por la marca y cargar
 * esas facturas.
 *
 * Se escribe como VALOR, no como fórmula: el cruce necesita normalizar el número de comprobante de
 * los dos lados ("0001-000036" vs "1-36") y eso en fórmula sería ilegible. El agente lo reescribe
 * cada 2 horas y la celda dice de cuándo es.
 */
async function marcarPestanaCheques(google, { enCompras, cheques, pestanaCheques }) {
  const hoja = hallarPestana(await google.getSheetMeta(ID), pestanaCheques)
  const COL = 12 // M: la primera libre después de "Unidad de Negocio"
  // La pestaña tiene 12 columnas exactas, así que M no existe todavía. Igual se verifica: escribir
  // sobre una columna sin mirar TODA su altura ya me costó pisar el desglose de retenciones de
  // Cobranzas.
  if (hoja.cols > COL) {
    const zona = await google.readSheetValues(ID, `${pestanaCheques}!M1:M${hoja.rows}`)
    // Reconocer la propia firma incluye el encabezado, que lleva la fecha de la última corrida.
    const mio = (t) => t.startsWith('✓') || t.startsWith('⚠') || t.startsWith('Estado en el OS')
    const ocupada = zona.some((f) => { const t = String(f?.[0] ?? '').trim(); return t && !mio(t) })
    if (ocupada) throw new Error(`me niego a escribir: la columna M de ${pestanaCheques} tiene contenido que no reconozco.`)
  } else {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: COL + 1 - hoja.cols } }])
  }

  const hoy = new Date().toLocaleDateString('es-AR')
  const marcas = cheques.map((c) => {
    const k = normComprobante(c.comprobante)
    if (!esLlaveUtil(k)) return ['⚠ sin N° de comprobante — no se puede cruzar']
    return enCompras.has(k)
      ? ['✓ su factura está en Compras']
      : ['⚠ FALTA cargar la factura en Compras — este pago no lo ve el cash flow']
  })
  await google.batchUpdateValues(ID, [
    { range: `${pestanaCheques}!M1`, values: [[`Estado en el OS · al ${hoy}`]] },
    { range: `${pestanaCheques}!M2:M${1 + marcas.length}`, values: marcas },
  ])
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: COL, endColumnIndex: COL + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 1, endRowIndex: 1 + marcas.length, startColumnIndex: COL, endColumnIndex: COL + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 } } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: COL, endIndex: COL + 1 }, properties: { pixelSize: 380 }, fields: 'pixelSize' } },
    { setBasicFilter: { filter: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1 + marcas.length, startColumnIndex: 0, endColumnIndex: COL + 1 } } } },
  ])
  const faltan = marcas.filter((m) => m[0].startsWith('⚠ FALTA')).length
  console.log(`Cheques: ${marcas.length} marcados en la columna M · ${faltan} necesitan que se cargue la factura`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
