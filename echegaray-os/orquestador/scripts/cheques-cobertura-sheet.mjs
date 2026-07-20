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
import { repartirCobertura, aCubrirPorMes, normComprobante, esLlaveUtil } from '../lib/cheques-cobertura.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cash Flow Mensual'
const DRY = process.argv.includes('--dry')
const ANCHO = 6
const FIRMA = 'CHEQUES Y TARJETA — ¿están contemplados en las líneas de arriba?'

const num = (s) => parseFloat(String(s ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const ars = (x) => Math.round(x)

async function leer(google) {
  const compras = await google.readSheetValues(ID, 'Compras!A4:AD800')
  // La llave: el número de comprobante de la factura. Es lo único que comparten las tres planillas.
  const enCompras = new Set(
    compras.filter((f) => num(f?.[14]) > 0).map((f) => normComprobante(f?.[7])).filter(esLlaveUtil),
  )
  const cheques = (await google.readSheetValues(ID, 'Cheques!A2:L400'))
    .filter((f) => num(f?.[5]) > 0)
    .map((f) => ({ tipo: f[0], proveedor: f[4], monto: num(f[5]), comprobante: f[7], fecha_pago: f[9], debitado: f[10] }))
  const tarjeta = (await google.readSheetValues(ID, 'Tarjeta de Credito!A3:K400'))
    .filter((f) => num(f?.[4]) > 0)
    .map((f) => ({ proveedor: f[2], monto: num(f[4]), comprobante: f[6], fecha_pago: f[8], debitado: f[9] }))
  return { enCompras, cheques, tarjeta }
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
  push(['  · SIN factura en Compras', ch.sin_registrar.length, ars(ch.monto_sin_registrar), '', '', '⚠ Plata que sale y que NINGUNA línea del cash flow ve. No es un problema del cash flow: es una compra que nadie registró.'])
  push(['  · sin número de comprobante cargado', ch.sin_numero, '', '', '', 'Sin número no se puede cruzar. Puede estar en Compras y no saberlo.'])
  push()
  push(['TARJETA DE CRÉDITO — total', tarjeta.length, ars(tj.total), '', '', ''])
  push(['  · ya contemplados', tj.contemplados.length, ars(tj.monto_contemplado), '', '', ''])
  push(['  · SIN factura en Compras', tj.sin_registrar.length, ars(tj.monto_sin_registrar), '', '', '⚠ Ídem: falta cargarlas en Compras.'])
  push()
  const fFalta = filas.length + 1
  push(['⇒ TOTAL QUE FALTA CARGAR EN COMPRAS', ch.sin_registrar.length + tj.sin_registrar.length, ars(ch.monto_sin_registrar + tj.monto_sin_registrar), '', '', 'Hasta que estas facturas se carguen, el cash flow subestima los egresos en este monto.'])
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
  console.log(`CHEQUES  ${datos.cheques.length} · contemplados ${g.ch.contemplados.length} (${ars(g.ch.monto_contemplado).toLocaleString('es-AR')}) · sin registrar ${g.ch.sin_registrar.length} (${ars(g.ch.monto_sin_registrar).toLocaleString('es-AR')})`)
  console.log(`TARJETA  ${datos.tarjeta.length} · contemplados ${g.tj.contemplados.length} (${ars(g.tj.monto_contemplado).toLocaleString('es-AR')}) · sin registrar ${g.tj.sin_registrar.length} (${ars(g.tj.monto_sin_registrar).toLocaleString('es-AR')})`)
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

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F}:C${F + filas.length - 1}`)
  console.log(`\nEscrito en la fila ${F}:`)
  for (const f of v) if (f?.[0] && (f?.[2] || f?.[1])) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(6)}${String(f[2] ?? '').padStart(16)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
