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
import { repartirCobertura, aCubrirPorMes, normComprobante, esLlaveUtil, hallarPestana, MARCAS, marcaDe } from '../lib/cheques-cobertura.mjs'
import { INSTRUMENTOS, formulasInstrumento } from '../lib/cash-flow-lineas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cash Flow Mensual'
const DRY = process.argv.includes('--dry')
const ANCHO = 6
const FIRMA = 'CHEQUES Y TARJETA — ¿están contemplados en las líneas de arriba?'

/** dd/mm/yyyy → Date. La pestaña es es-AR: el 2/1/2026 es el 2 de enero, no el 1 de febrero. */
const fechaAR = (s) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(s ?? '').trim())
  if (!m) return null
  const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(a, Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(+d) ? null : d
}

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
  // SE GUARDA LA FILA DE CADA UNO. La marca que el OS escribe al lado tiene que caer en SU fila, y
  // filtrar antes de saber la fila corría todas las marcas hacia arriba en cuanto aparecía un
  // importe en cero. Una marca en la fila equivocada es peor que ninguna: acusa al cheque de al lado.
  const crudoCh = await google.readSheetValues(ID, `${CH}!A2:L400`)
  const crudoTj = await google.readSheetValues(ID, `${INSTRUMENTOS.tarjeta.pestaña}!A3:K400`)
  // fecha = la fecha REAL de pago (columna I). fecha_pago es su rótulo "julio 26", que es formato.
  const cheques = crudoCh.map((f, i) => ({ fila: i + 2, tipo: f[0], proveedor: f[4], monto: num(f[5]), comprobante: f[7], fecha: fechaAR(f[8]), fecha_pago: f[9], debitado: f[10] })).filter((c) => c.monto > 0)
  const tarjeta = crudoTj.map((f, i) => ({ fila: i + 3, proveedor: f[2], monto: num(f[4]), comprobante: f[6], fecha_pago: f[8], debitado: f[9] })).filter((c) => c.monto > 0)
  return { enCompras, cheques, tarjeta, pestanaCheques: CH, filasCh: crudoCh.length + 1, filasTj: crudoTj.length + 2 }
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
  // TODO ESTE BLOQUE ES FÓRMULA. Antes eran veinte números calculados acá y pegados: el día que se
  // cargaba una factura que faltaba, el bloque seguía acusando el faltante hasta la próxima corrida
  // del agente. Ahora cuenta las marcas que el OS escribe al lado de cada cheque, así que se mueve
  // solo y cualquiera puede verificarlo filtrando la pestaña.
  const F = { cheques: formulasInstrumento(INSTRUMENTOS.cheques, MARCAS), tarjeta: formulasInstrumento(INSTRUMENTOS.tarjeta, MARCAS) }
  push(['CHEQUES — total emitido', F.cheques.total.cantidad, F.cheques.total.monto, '', '', ''])
  push(['  · ya contemplados (su factura está en Compras)', F.cheques.contemplados.cantidad, F.cheques.contemplados.monto, '', '', 'Ya están en el cash flow, en el rubro de esa factura. Sumarlos de nuevo sería duplicar.'])
  push(['  · FALTA la factura en Compras (confirmado)', F.cheques.falta.cantidad, F.cheques.falta.monto, '', '', '⚠ Tienen número de comprobante y ese número NO está en Compras. Plata que sale y que ninguna línea del cash flow ve.'])
  push(['  · sin N° de comprobante — no se puede saber', F.cheques.sinNumero.cantidad, F.cheques.sinNumero.monto, '', '', 'Su factura puede estar en Compras perfectamente. Cargando el N° de comprobante en la pestaña Cheques se resuelve solo.'])
  push()
  push(['TARJETA DE CRÉDITO — total', F.tarjeta.total.cantidad, F.tarjeta.total.monto, '', '', ''])
  push(['  · ya contemplados', F.tarjeta.contemplados.cantidad, F.tarjeta.contemplados.monto, '', '', ''])
  push(['  · FALTA la factura (confirmado)', F.tarjeta.falta.cantidad, F.tarjeta.falta.monto, '', '', ''])
  push(['  · sin N° de comprobante', F.tarjeta.sinNumero.cantidad, F.tarjeta.sinNumero.monto, '', '', ''])
  push()
  const fFalta = filas.length + 1
  // Los #{n} son números de fila RELATIVOS al bloque: el bloque no sabe todavía en qué fila del
  // Cash Flow va a caer. Se reemplazan por la fila real recién cuando se sabe. Escribir la fila
  // directo daba una referencia que apuntaba al vacío en cuanto el cuadro crecía una línea.
  push(['⇒ FALTA CARGAR, CONFIRMADO', `=B#{${fFalta - 8}}+B#{${fFalta - 3}}`, `=C#{${fFalta - 8}}+C#{${fFalta - 3}}`, '', '', 'El cash flow subestima los egresos AL MENOS en esto. Es la misma plata que muestra la línea "Pagos con cheque y tarjeta sin factura registrada" del cuadro de arriba.'])
  push(['⇒ Sin poder verificar (falta el N° de comprobante)', `=B#{${fFalta - 7}}+B#{${fFalta - 2}}`, `=C#{${fFalta - 7}}+C#{${fFalta - 2}}`, '', '', 'No es un faltante: es una ignorancia. Se resuelve cargando el número en Cheques y Tarjeta.'])
  push()
  push(['CHEQUES A CUBRIR — los que todavía no se debitaron'])
  push(['Otra pregunta, y es de tesorería: no importa si la factura está registrada, importa cuánta plata tiene que haber en la cuenta y cuándo. Un cheque emitido es un compromiso más firme que una factura con fecha prevista.'])
  push(['Mes de pago', 'Cantidad', 'Monto', '', '', ''])
  const c0 = filas.length + 1
  // El mes es el que escribe la propia pestaña en su columna de mes: no se recalcula acá.
  for (const m of cubrir.por_mes) {
    if (!m.anio) { push([`${m.mes}  ⚠ sin fecha de pago cargada`, m.cantidad, '']); continue }
    const f = F.cheques.aCubrir(m.anio, m.num)
    push([m.mes, f.cantidad, f.monto])
  }
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
  const filas = g.filas.map((f) => f.map((c) => {
    if (typeof c !== 'string') return c
    const conSum = c.startsWith('=SUM(')
      ? c.replace(/([BC])(\d+):([BC])(\d+)/, (_, a, x, b, y) => `${a}${Number(x) + F - 1}:${b}${Number(y) + F - 1}`)
      : c
    return conSum.replace(/#\{(\d+)\}/g, (_, n) => String(Number(n) + F - 1))
  }))
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
    // NO SE TOCAN LOS ANCHOS DE COLUMNA. Este bloque vive al pie del Cash Flow Mensual, que es una
    // pestaña COMPARTIDA: arriba, la columna F es el mes de mayo. Ensancharla a 460px para que
    // entrara la explicación de este bloque descuadraba el cuadro entero — el dueño lo vio como
    // "quedan descuadradas". El texto desborda a la derecha sobre celdas vacías, que es gratis.
    // Regla general: un script que escribe en una pestaña que no es suya no cambia su geometría.
  ])

  await marcarInstrumentos(google, datos)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F}:C${F + filas.length - 1}`)
  console.log(`\nEscrito en la fila ${F}:`)
  for (const f of v) if (f?.[0] && (f?.[2] || f?.[1])) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(6)}${String(f[2] ?? '').padStart(16)}`)
}

/**
 * Marca cada cheque y cada consumo de tarjeta en su propia pestaña: ¿su factura está en Compras?
 *
 * El resumen del Cash Flow dice cuánto falta; acá se ve CUÁL. Sin esto, "$33,5M sin factura" es un
 * número que nadie puede accionar — hay que poder abrir la pestaña, filtrar por la marca y cargar
 * esas facturas.
 *
 * DESDE EL 21/07 ESTA COLUMNA NO ES SÓLO INFORMATIVA: la línea "Pagos con cheque y tarjeta sin
 * factura registrada" de los dos cash flow la SUMA. Antes ese total lo calculaba este código y se
 * pegaba como número en el cuadro — el día que se cargaran las facturas, el cuadro iba a seguir
 * mostrando el mismo importe hasta la próxima corrida. Ahora el cruce se sigue haciendo en código
 * (normalizar "0001-000036" contra "1-36" en una celda sería ilegible) pero el resultado queda
 * escrito fila por fila y el total lo hace el Sheet. Por eso ahora también se marca la TARJETA:
 * antes sólo se marcaban los cheques y la mitad del número no tenía dónde apoyarse.
 */
async function marcarInstrumentos(google, datos) {
  const hojas = await google.getSheetMeta(ID)
  const objetivo = [
    { ...INSTRUMENTOS.cheques, pestaña: datos.pestanaCheques, items: datos.cheques, hasta: datos.filasCh },
    { ...INSTRUMENTOS.tarjeta, items: datos.tarjeta, hasta: datos.filasTj },
  ]
  for (const o of objetivo) {
    const hoja = hojas.find((h) => h.title === o.pestaña)
    if (!hoja) { console.log(`⚠ no encontré la pestaña ${o.pestaña}: no marco nada`); continue }
    const COL = o.colMarca // índice 0-based de la columna de marcas
    // Escribir en una columna sin mirar TODA su altura ya me costó pisar el desglose de retenciones
    // de Cobranzas. Se verifica que lo que hay ahí sea mío antes de tocarla.
    if (hoja.cols > COL) {
      const letraCol = letra(COL)
      const zona = await google.readSheetValues(ID, `${o.pestaña}!${letraCol}1:${letraCol}${hoja.rows}`)
      const mio = (t) => t.startsWith('✓') || t.startsWith('⚠') || t.startsWith('Estado en el OS')
      const ocupada = zona.some((f) => { const t = String(f?.[0] ?? '').trim(); return t && !mio(t) })
      if (ocupada) throw new Error(`me niego a escribir: la columna ${letraCol} de ${o.pestaña} tiene contenido que no reconozco.`)
    } else {
      await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: COL + 1 - hoja.cols } }])
    }

    // Una marca por FILA REAL de la pestaña, no una por item: las filas sin importe quedan vacías y
    // las demás no se corren.
    const porFila = new Map(o.items.map((i) => [i.fila, marcaDe(i.comprobante, datos.enCompras)]))
    const marcas = []
    for (let f = o.filaCab + 1; f <= o.hasta; f++) marcas.push([porFila.get(f) ?? ''])
    const hoy = new Date().toLocaleDateString('es-AR')
    const letraCol = letra(COL)
    await google.batchUpdateValues(ID, [
      { range: `${o.pestaña}!${letraCol}${o.filaCab}`, values: [[`Estado en el OS · al ${hoy}`]] },
      { range: `${o.pestaña}!${letraCol}${o.filaCab + 1}:${letraCol}${o.filaCab + marcas.length}`, values: marcas },
    ])
    await google.spreadsheetBatchUpdate(ID, [
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: o.filaCab - 1, endRowIndex: o.filaCab, startColumnIndex: COL, endColumnIndex: COL + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: o.filaCab, endRowIndex: o.filaCab + marcas.length, startColumnIndex: COL, endColumnIndex: COL + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 } } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat' } },
      { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: COL, endIndex: COL + 1 }, properties: { pixelSize: 380 }, fields: 'pixelSize' } },
      { setBasicFilter: { filter: { range: { sheetId: hoja.sheetId, startRowIndex: o.filaCab - 1, endRowIndex: o.filaCab + marcas.length, startColumnIndex: 0, endColumnIndex: COL + 1 } } } },
    ])
    const faltan = marcas.filter((m) => m[0] === MARCAS.falta).length
    console.log(`${o.pestaña}: ${o.items.length} marcados en la columna ${letraCol} · ${faltan} necesitan que se cargue la factura`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
