#!/usr/bin/env node
// LA PESTAÑA CAJA — DISPONIBILIDADES, COMPROMISOS EMITIDOS Y LÍNEAS DE CRÉDITO.
//
// POR QUÉ EXISTE (20/07). Era la única pestaña vacía del archivo, y por eso el número más grande del
// cuadro no significaba nada: "flujo acumulado −$433.811.452" es un DELTA, no un saldo. Sin saldo
// inicial, un cash flow dice cuánto se mueve pero no puede contestar la única pregunta que se le
// hace: qué día te quedás sin plata.
//
// LO QUE ESTA PESTAÑA NO HACE, A PROPÓSITO: no lleva movimientos. Cada cobro está en Cobranzas, cada
// pago en Compras y cada cheque en Cheques Emitidos. Un libro de movimientos acá sería la tercera
// copia de la misma plata, y el día que no coincidan nadie sabría cuál tiene razón. Esta pestaña
// aporta el ÚNICO dato que no existe en ninguna otra: cuánta plata hay de verdad.
//
// LA DISTINCIÓN QUE MÁS IMPORTA, Y QUE EL PEDIDO ORIGINAL MEZCLABA: el cupo disponible de la tarjeta
// NO es efectivo. Es capacidad de endeudarse. Sumarlo a las disponibilidades sería contar como plata
// propia una deuda que todavía no se tomó — el error clásico que hace que una empresa se crea
// líquida el día antes de no poder pagar sueldos. Por eso va en su propio bloque, DEBAJO del total,
// y no suma. Misma lógica, al revés, con los cheques emitidos y no debitados: esa plata está en la
// cuenta pero ya no es tuya, así que resta.
//
// NOMBRES DE PLAN DE CUENTAS, NO COLOQUIALES. "Caja grande" es Caja en pesos; "caja chica" es Fondo
// fijo; los cheques de terceros que todavía no se depositaron son Valores a depositar. Son los
// rótulos que usa cualquier contador argentino, y el día que esto se cruce con la contabilidad los
// dos lados van a estar hablando el mismo idioma.
//
// IDEMPOTENCIA CON DATO HUMANO ADENTRO: esta es la ÚNICA pestaña del archivo donde se carga un
// número a mano, y el agente la reescribe cada 2 horas. Antes de reescribirla se leen los valores
// cargados y se vuelven a poner en su lugar, buscándolos POR EL NOMBRE DE LA CUENTA y no por número
// de fila. Si se hiciera por fila, agregar una cuenta correría todo y los saldos quedarían en la
// cuenta equivocada, en silencio.
//
//   node orquestador/scripts/caja-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { CUENTAS, CARGA, filaDeCuenta } from '../lib/caja-disponibilidades.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'
const DRY = process.argv.includes('--dry')
const ANCHO = 6

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/** Dónde quedó cada línea del Cash Flow Mensual, buscada POR RÓTULO y no por número de fila. */
function ubicarEnCashFlow(colA, rotulo) {
  const i = colA.findIndex((f) => String(f?.[0] ?? '').trim().toLowerCase().startsWith(rotulo.toLowerCase()))
  return i < 0 ? null : i + 1
}

function grilla(cargado, refs) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  // El valor que el dueño ya había cargado para una cuenta, o vacío la primera vez.
  const previo = (cuenta, campo) => cargado.get(cuenta)?.[campo] ?? ''

  push(['CAJA Y BANCOS — DISPONIBILIDADES'])
  push(['Esta es la ÚNICA pestaña del archivo donde se carga un número a mano: cuánta plata hay. Todo lo demás se calcula solo. Las celdas de las columnas B, C, E y F de los bloques 1 y 3 son para completar; el resto son fórmulas y se pisan en cada corrida del agente.'])
  push()

  // ── 1 · DISPONIBILIDADES ────────────────────────────────────────────────────────────────────────
  push(['1 · DISPONIBILIDADES — lo que hay HOY'])
  const cab1 = push(['Cuenta', 'Saldo', 'Fecha del saldo', 'Antigüedad', 'Origen del dato', 'Declarado por'])
  const d0 = filas.length + 1
  for (const c of CUENTAS) {
    const f = filas.length + 1
    push([
      c.nombre,
      // Una cuenta con fórmula NO se carga a mano: el OS la sabe calcular y pisarla sería perder
      // el dato. Sólo las que el OS no puede saber quedan como celda de carga.
      c.formula ?? previo(c.nombre, 'saldo'),
      c.formula ? '=TODAY()' : previo(c.nombre, 'fecha'),
      // La antigüedad no es decorativa: un saldo de hace 20 días avisando que tiene 20 días vale
      // muchísimo más que el mismo saldo mudo. Arriba de una semana, avisa.
      `=IF(C${f}="";"⚠ sin cargar";IF(TODAY()-C${f}>7;"⚠ "&TEXT(TODAY()-C${f};"0")&" días";TEXT(TODAY()-C${f};"0")&" días"))`,
      previo(c.nombre, 'origen') || c.origenSugerido,
      previo(c.nombre, 'quien'),
    ])
  }
  const d1 = filas.length
  const fTotal = push(['TOTAL DISPONIBILIDADES', `=SUM(B${d0}:B${d1})`, '', '', '', 'Es el "Efectivo al inicio" que usan los dos cash flows.'])
  push()

  // ── 2 · COMPROMISOS YA EMITIDOS ─────────────────────────────────────────────────────────────────
  push(['2 · COMPROMISOS YA EMITIDOS — plata que sigue en la cuenta pero ya no es tuya'])
  const fCh = push(['Cheques de pago diferido emitidos, no debitados',
    // Sale de la propia pestaña de cheques: acá no se copia ningún importe.
    `=SUMPRODUCT((UPPER('${refs.cheques}'!$K$2:$K$400)<>"SI")*IF(ISNUMBER('${refs.cheques}'!$F$2:$F$400);'${refs.cheques}'!$F$2:$F$400;0))`,
    '', '', `Pestaña ${refs.cheques}, columna DEBITADO distinta de SI`, 'Se calcula solo'])
  const fNeta = push(['DISPONIBILIDAD NETA', `=B${fTotal}-B${fCh}`, '', '', '',
    'Lo que queda después de cubrir los cheques ya firmados. Es el número con el que conviene decidir.'])
  push()

  // ── 3 · LÍNEAS DE CRÉDITO ───────────────────────────────────────────────────────────────────────
  push(['3 · LÍNEAS DE CRÉDITO — NO son efectivo, y por eso no suman arriba'])
  push(['El margen de una tarjeta es capacidad de endeudarse, no plata propia. Sumarlo a las disponibilidades es el error que hace que una empresa se crea líquida el día antes de no poder pagar sueldos.'])
  const cab3 = push(['Línea', 'Importe', '', '', 'Origen del dato', 'Declarado por'])
  const fLim = push([CARGA.limiteTarjeta, previo(CARGA.limiteTarjeta, 'saldo'), '', '', previo(CARGA.limiteTarjeta, 'origen') || 'Resumen de la tarjeta', previo(CARGA.limiteTarjeta, 'quien')])
  const fCons = push(['Tarjeta de crédito — consumos pendientes de débito',
    `=SUMPRODUCT((UPPER('${refs.tarjeta}'!$J$3:$J$400)<>"SI")*IF(ISNUMBER('${refs.tarjeta}'!$E$3:$E$400);'${refs.tarjeta}'!$E$3:$E$400;0))`,
    '', '', `Pestaña ${refs.tarjeta}, columna DEBITADO distinta de SI`, 'Se calcula solo'])
  push(['Tarjeta de crédito — margen disponible', `=IF(B${fLim}="";"⚠ falta el límite acordado";B${fLim}-B${fCons})`, '', '', '',
    'Cuánto se puede seguir comprando sin efectivo. Es un colchón, no un activo.'])
  push()

  // ── 4 · CONCILIACIÓN ────────────────────────────────────────────────────────────────────────────
  push(['4 · CONCILIACIÓN — ¿el cash flow explica la plata que hay?'])
  push(['El control que mide si el archivo sirve. Si la diferencia es chica, el cuadro es confiable. Si es grande, hay plata moviéndose fuera del Sheet y hay que buscarla antes de decidir con estos números.'])
  const fDecl = push(['Disponibilidad declarada (bloque 1)', `=B${fTotal}`, '', '', '', 'Lo que dicen el extracto y el arqueo.'])
  const fProy = push(['Efectivo al cierre que proyecta el Cash Flow al mes de la fecha del saldo',
    refs.cierre
      ? `=IFERROR(INDEX('Cash Flow Mensual'!$B$${refs.cierre}:$M$${refs.cierre};MATCH(EOMONTH(MAX($C$${d0}:$C$${d1});0);ARRAYFORMULA(EOMONTH('Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab};0));0));"⚠ sin saldo cargado")`
      : '⚠ no encontré la línea de cierre en el Cash Flow Mensual',
    '', '', 'Cash Flow Mensual, línea "Efectivo y equivalentes al cierre"', 'Se calcula solo'])
  push(['⇒ Diferencia', `=IFERROR(B${fDecl}-B${fProy};"")`, '', '', '',
    'Distinto de cero = movimientos que el archivo no ve. No es un error de fórmula: es trabajo de carga.'])
  push()

  // ── 5 · ALERTA ──────────────────────────────────────────────────────────────────────────────────
  push(['5 · ALERTA DE CAJA — las dos fechas que se usan para decidir'])
  const fMin = push(['Caja mínima deseada', "=N('01_Valores Iniciales'!$B$3)", '', '', '01_Valores Iniciales', ''])
  const rangoCierre = refs.cierre ? `'Cash Flow Mensual'!$B$${refs.cierre}:$M$${refs.cierre}` : null
  const rangoMes = refs.cab ? `'Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab}` : null
  const primerMes = (cond) => (rangoCierre
    ? `=IFERROR(TEXT(INDEX(${rangoMes};MATCH(1;ARRAYFORMULA(--((${rangoCierre}+$B$${fTotal})${cond})),0));"mmmm yyyy");"ningún mes del año")`
    : '⚠ falta la línea de cierre')
  push(['Primer mes por debajo de la caja mínima', primerMes(`<$B$${fMin}`), '', '', '',
    'Suma el saldo real de hoy a la proyección del cash flow. Sin saldo cargado, arranca de cero y la fecha es más pesimista de lo real.'])
  push(['Primer mes con caja negativa', primerMes('<0'), '', '', '',
    '⚠ Ojo: los ingresos de octubre en adelante están en $0 porque no hay obra facturada. Esta fecha es un PISO, no un pronóstico.'])
  push()
  push(['CÓMO SE ACTUALIZA ESTO'])
  push(['· Los saldos (columna B de los bloques 1 y 3) se cargan a mano o pegando el extracto en el chat: el OS lo lee y los completa.'])
  push(['· No hay integración con el banco. La API de banca empresa se pide al banco y hoy no está contratada — hasta entonces, el saldo entra por extracto, captura o arqueo.'])
  push(['· Todo lo demás de esta pestaña se recalcula solo cada 2 horas junto con el resto del archivo.'])

  return { filas, d0, d1, cab1, cab3, fTotal, fNeta, fCh, fLim, fCons, fDecl }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)
  const tab = hoja.title

  // Lo que el dueño ya cargó, rescatado ANTES de reescribir, indexado por nombre de cuenta.
  const previo = await google.readSheetValues(ID, `${tab}!A1:F80`).catch(() => [])
  const cargado = new Map()
  for (const f of previo) {
    const cuenta = String(f?.[0] ?? '').trim()
    if (!cuenta || !filaDeCuenta(cuenta)) continue
    cargado.set(cuenta, { saldo: f?.[1] ?? '', fecha: f?.[2] ?? '', origen: f?.[4] ?? '', quien: f?.[5] ?? '' })
  }

  // Las referencias a otras pestañas se resuelven por rótulo, no se adivinan.
  const colA = await google.readSheetValues(ID, 'Cash Flow Mensual!A1:A80')
  const refs = {
    cheques: hallarPestana(hojas, 'Cheques').title,
    tarjeta: hallarPestana(hojas, 'Tarjeta').title,
    cierre: ubicarEnCashFlow(colA, 'Efectivo y equivalentes al cierre'),
    cab: ubicarEnCashFlow(colA, 'Período'),
  }
  const g = grilla(cargado, refs)
  console.log(`${tab}: ${g.filas.length} filas · ${CUENTAS.length} cuentas · ${cargado.size} con dato ya cargado`)
  console.log(`  cierre del Cash Flow en la fila ${refs.cierre ?? '?'} · encabezado en la ${refs.cab ?? '?'}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  await google.clearValues(ID, `${tab}!A1:Z80`)
  await google.batchUpdateValues(ID, [{ range: `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g)

  const v = await google.readSheetValues(ID, `${tab}!A1:F${g.filas.length}`)
  const sinCargar = v.filter((f) => filaDeCuenta(String(f?.[0] ?? '').trim()) && !String(f?.[1] ?? '').trim())
  console.log(`\nQUEDÓ ESCRITO. Total disponibilidades: ${v[g.fTotal - 1]?.[1] || '—'}`)
  console.log(`  Cheques emitidos sin debitar: ${v[g.fCh - 1]?.[1] || '—'}`)
  console.log(`  Disponibilidad neta: ${v[g.fNeta - 1]?.[1] || '—'}`)
  if (sinCargar.length) console.log(`  ⚠ ${sinCargar.length} cuentas sin saldo cargado: ${sinCargar.map((f) => f[0]).join(' · ')}`)
}

async function formatear(google, sheetId, g) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.93, green: 0.94, blue: 0.95 }
  const AMARILLO = { red: 1, green: 0.98, blue: 0.86 } // las celdas de carga: se ven distintas a propósito
  const VERDE = { red: 0.85, green: 0.92, blue: 0.85 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, n, 2, 3), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 3, 4), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 4, 6), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'CLIP' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })

  for (const c of [g.cab1, g.cab3]) {
    fmt(r(c - 1, c), 'userEnteredFormat',
      { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER' })
  }
  // LAS CELDAS DE CARGA EN AMARILLO. Es la diferencia más importante de la pestaña: lo que una
  // persona escribe tiene que verse distinto de lo que el sistema calcula, o nadie sabe qué puede
  // tocar sin romper nada.
  // Sólo las cuentas SIN fórmula se pintan de amarillo: el amarillo significa "esto lo cargás vos".
  CUENTAS.forEach((c, i) => {
    if (c.formula) return
    fmt(r(g.d0 - 1 + i, g.d0 + i, 1, 3), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
    fmt(r(g.d0 - 1 + i, g.d0 + i, 4, 6), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
  })
  fmt(r(g.fLim - 1, g.fLim, 1, 2), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
  fmt(r(g.fTotal - 1, g.fTotal), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: GRIS })
  fmt(r(g.fNeta - 1, g.fNeta), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, fontSize: 10 }, backgroundColor: VERDE })
  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    if (/^\d · |^CÓMO SE ACTUALIZA/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    if (/^⇒/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
  })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 380 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 6 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
