#!/usr/bin/env node
// "Cheques Recibidos" — LA PESTAÑA CONTESTA UNA PREGUNTA:
//
//        ¿CUÁNTO VALOR TENGO EN CARTERA, DÓNDE ESTÁ Y CUÁNDO SE VUELVE PLATA?
//
// ═══ POR QUÉ SE REHIZO (23/07) ═══
//
// El dueño: "no se entiende qué carajo significan las cosas". La banda anterior mostraba un CONTEO
// DE OPERACIONES POR TIPO —"Aceptación 11 · Custodia 10 · Depósito 4 · Endoso 1 · Rescate 4 · Total
// 30"—. Eso es el log del homebanking, no información de negocio: no dice cuánta plata hay, ni dónde
// está, ni cuándo se convierte en caja. Peor: una OPERACIÓN NO ES UN CHEQUE (el mismo eCHEQ figura
// como Aceptación y después como Depósito), así que "30 operaciones" no es ninguna cantidad real —el
// endoso de $20.000.000 figura dos veces, como Rescate y como Endoso—.
//
// Ahora la banda está EN PESOS y en los tres estados que cambian una decisión:
//   · EN CARTERA (custodia) → sigue siendo tuyo, TODAVÍA NO ES CAJA.
//   · DEPOSITADO            → ya es caja, dejó de ser un valor.
//   · ENDOSADO              → se entregó a un tercero para pagarle: SALIÓ, no entra.
// "Rescate" desaparece de la banda: es el paso interno de sacar un valor de custodia, previo a
// depositarlo o endosarlo. No mueve plata por sí solo y sumarlo era ruido puro ($65.000.000 de ruido).
//
// ═══ DE DÓNDE SALE LA POSICIÓN (y por qué NO se calcula acá) ═══
//
// Este registro es una CAPTURA de la pantalla de operaciones del banco al 22/07, y está incompleta:
// por identidad (entró − depositado − endosado) daría $50.290.000 en cartera, mientras el EXTRACTO
// —que es la fuente— declara $10.290.000. Publicar el número derivado sería inventar $40.000.000.
// Entonces: la POSICIÓN la manda CAJA (que la toma del extracto) y acá se REFERENCIA por rótulo;
// la diferencia se muestra como lo que es, un control que no cierra y hay que cerrar bajando el
// resto del historial del banco. Regla 9: un concepto vive en un solo lugar.
//
// ═══ SIMETRÍA CON "Cheques Emitidos" (las dos se leen igual) ═══
// Son las DOS correcciones al saldo bancario del manual de conciliación: los emitidos no debitados
// lo BAJAN, los valores en cartera lo SUBEN cuando se depositen. Mismo orden, mismo vocabulario,
// misma gramática (lib/patron-pestana.mjs), misma piel (lib/estilo-statement.mjs).
//
// ═══ FUENTES (consultadas el 23/07/2026) ═══
//   · AccountingTools — undeposited checks: cheques recibidos y todavía no depositados; no son caja.
//     https://www.accountingtools.com/articles/undeposited-checks
//   · AccountingTools — bank balance vs book balance; adjusted cash balance = saldo del extracto
//     + depósitos en tránsito − cheques emitidos no debitados.
//     https://www.accountingtools.com/articles/the-difference-between-bank-balance-and-book-balance
//   · Sage — outstanding checks / depósitos en tránsito en la conciliación bancaria.
//     https://www.sage.com/en-us/blog/outstanding-checks-bank-reconciliation/
//   · Formato de modelos de banca de inversión (negrita sólo en líneas clave, borde arriba de los
//     totales, negativos entre paréntesis, cifras tabulares a la derecha, whitespace estructurado).
//     https://ibinterviewquestions.com/guides/valuation-investment-banking/formatting-standards-color-conventions-ib-models
//
//   node orquestador/scripts/cheques-recibidos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as CR from '../lib/cheques-recibidos.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { skinRequests, INK, MUTED } from '../lib/estilo-statement.mjs'
import { seccion, total, sub } from '../lib/patron-pestana.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = 'Cheques Recibidos'
const DRY = process.argv.includes('--dry')

const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }

// LAS DOS COLUMNAS "Fecha de cobro" y "Días a vencer" (¿cuándo se vuelve caja este cheque?) NO viven
// acá: el dueño rediseñó esta pestaña a mano (agregó Librador/CUIT) y la candó, así que regenerarla la
// rompería. Se agregan de forma ADITIVA con orquestador/scripts/cheques-recibidos-cobro.mjs, que
// preserva todo lo existente. La fecha de cobro sale de `fechaPago` en lib/cheques-recibidos.mjs.

/** Columnas del detalle: [encabezado, unidad de formato]. Mínimas, en el orden en que se lee. */
const COLUMNAS = [
  ['N° operación', 'texto'], ['Fecha', 'fecha'], ['Operación', 'texto'],
  ['Cheques', 'cantidad'], ['Importe', 'monedaExacta'], ['Qué significa para la cartera', 'texto'],
]
const ANCHO = { 0: 116, 1: 100, 2: 116, 3: 78, 4: 158, 5: 520 }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ops = [...CR.OPERACIONES] // ya vienen ordenadas por fecha desc
  const ancho = COLUMNAS.length

  const filas = []
  const push = (r = []) => { filas.push(r); return filas.length } // nº de fila (1-based)

  push(['Cheques recibidos'])
  push([`Cuánta plata tengo en valores de terceros y cuándo se vuelve caja · Santander, operaciones eCHEQ · corte ${CR.CORTE} · en pesos`])
  push([])

  // ── 1 · LA POSICIÓN. La cartera vigente la manda el EXTRACTO, no este historial: se referencia a
  //        CAJA por RÓTULO (CAJA se reescribe entera y sus filas se corren; una referencia por celda
  //        apunta a otra cosa mañana, en silencio). Si el rótulo cambia, la celda lo GRITA.
  push([seccion(1, '¿cuánto valor tengo y cuándo se vuelve caja?')])
  push(['Concepto', 'Monto', 'Qué significa'])
  const fCartera = push([total('En cartera — todavía no es caja'),
    // ═══ EL RÓTULO SE BUSCA CON COMODÍN (05/08) ═══
    //
    // Era un MATCH exacto contra "Valores a depositar" y la fila de CAJA se llama "Valores a depositar
    // ‖ no suma al total": el sufijo explica por qué no suma, y es información que el lector necesita.
    // Con el match exacto esta celda publicaba "⚠ no está en CAJA" sobre un dato que estaba ahí — el
    // mismo defecto que dejó a Cheques Emitidos sin saldo. Un rótulo es para quien lee, y va a cambiar;
    // el comodín ata el contrato al COMIENZO del rótulo, que es lo que identifica a la fila.
    '=IFERROR(INDEX(CAJA!$E$1:$E$200;MATCH("Valores a depositar*";CAJA!$A$1:$A$200;0));"⚠ no está en CAJA")',
    'Valores de terceros en custodia en el banco: siguen siendo tuyos, pero recién son plata el día que se depositan. La posición la manda el extracto (pestaña CAJA).'])
  const fEndosado = push(['Endosado a un tercero — ya salió', '',
    'Se entregó a un proveedor para pagarle: es un pago hecho, NO un ingreso que va a entrar.'])
  push([])

  // ── 2 · EL CIRCUITO de lo que este registro vio pasar, en pesos. El "Rescate" NO va: es el paso
  //        interno previo a depositar o endosar, no mueve plata.
  push([seccion(2, '¿qué pasó con todo lo que entró? — el circuito de este registro')])
  push(['Concepto', 'Monto', 'Qué significa'])
  const fEntro = push(['Entró — valores aceptados', '',
    'Todo lo que este registro vio entrar, desde la operación más vieja hasta el corte.'])
  const fDeposito = push([sub('se hizo caja — depositado'), '',
    'Acreditado en la cuenta: dejó de ser un valor y pasó a ser plata.'])
  const fControl = push([total('Falta bajar del banco'), '',
    'Entró menos depositado, endosado y en cartera: el registro NO cierra. No es plata que aparezca — es historial de operaciones que falta capturar.'])
  push([])

  // ── 3 · EL REGISTRO, operación por operación ────────────────────────────────────────────────────
  push([seccion(3, 'el registro, operación por operación')])
  push(COLUMNAS.map(([n]) => n))
  const det0 = filas.length + 1
  for (const o of ops) push([o.op, o.fecha, o.tipo, o.cheques, o.importe, CR.lectura(o.tipo)])
  const det1 = filas.length
  const colTipo = `$C$${det0}:$C$${det1}`
  const colImporte = `$E$${det0}:$E$${det1}`
  const porTipo = (t) => `=SUMIF(${colTipo};"${t}";${colImporte})`

  filas[fEndosado - 1][1] = porTipo('Endoso')
  filas[fEntro - 1][1] = porTipo('Aceptación')
  filas[fDeposito - 1][1] = porTipo('Depósito')
  filas[fControl - 1][1] = `=IF(ISNUMBER(B${fCartera});B${fEntro}-B${fDeposito}-B${fEndosado}-B${fCartera};"⚠ falta la cartera de CAJA")`

  console.log(`${PESTAÑA}: ${ops.length} operaciones recibidas · ${filas.length} filas`)
  if (DRY) { filas.forEach((f, i) => console.log(String(i + 1).padStart(3), JSON.stringify(f))); return }

  // ── ESCRITURA ─────────────────────────────────────────────────────────────────────────────────
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: filas.length + 30, columnCount: ancho + 1, frozenRowCount: 2 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(filas.length + 20, 60)
  // Se limpia hasta el final de la HOJA (la vieja o la nueva, la que sea más larga): resetear sólo
  // lo que uno escribe deja colgando las reglas de una corrida anterior más larga.
  const filasHoja = Math.max(hoja.rows ?? 0, alto)
  await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto, columnCount: Math.max(ancho + 1, hoja.cols ?? 0) } }, fields: 'gridProperties(rowCount,columnCount)' } }])

  // ═══ DESARMAR LOS MERGES DE LA BANDA ANTES DE ESCRIBIR ═══
  // Un diseño anterior había combinado C:E en la banda y A:B en el subtítulo. Una celda COMBINADA
  // hace DOS daños: se come la escritura que no cae en su ancla (sin error, sin valor) y CORTA el
  // desborde del texto de la izquierda. Se vio mirando el render (23/07): los títulos de sección
  // salían partidos —"1 · ¿CUÁNTO VALOR TENGO Y CUÁ|"— y ninguna fórmula fallaba.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: det0, startColumnIndex: 0, endColumnIndex: Math.max(ancho, hoja.cols ?? ancho) } },
  }]).catch(() => {})

  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  // El generador es DUEÑO de toda su grilla (esta pestaña no tiene columnas del dueño): sus vacíos se
  // LIMPIAN. Con '' sobrevivía el texto de la corrida anterior y salían secciones duplicadas.
  const gridCR = filas.map((f) => {
    const r = [...f].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
    while (r.length < ancho) r.push(VACIO)
    return r
  })
  const { conservadas } = await escribirPreservando(google, ID, `'${PESTAÑA}'`, gridCR, { anchoHoja: Math.max(ancho, hoja.cols ?? ancho) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  // ── FORMATO ───────────────────────────────────────────────────────────────────────────────────
  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const txt = (color, { bold = false, size = 10 } = {}) => ({ foregroundColor: color, bold, fontSize: size, fontFamily: 'Arial' })
  const money = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' } // negativos entre paréntesis (norma IB)
  // La piel statement resuelve título, secciones, encabezados, totales (⇒), reja apagada, fondo
  // blanco y hairlines a partir del contenido REALMENTE escrito. `filasHoja` limpia lo que quedó
  // de una corrida anterior más larga: si no, sobreviven reglas grises colgando sobre la nada.
  const reqs = skinRequests({ sheetId: hoja.sheetId, filas, cols: ancho, congeladas: 2, titular: fCartera, filasHoja })
  // ═══ LA BANDA DESBORDA, NO SE CORTA ═══
  // Sin esto la pestaña heredaba el CLIP de la versión anterior y se veía —render mirado, 23/07— con
  // los títulos de sección partidos al medio ("1 · ¿CUÁNTO VALOR TENGO Y CUÁ|") y el titular cortado.
  // Un rótulo que no entra en su celda no es un rótulo: es un error de imprenta. Como las columnas
  // de la derecha de la banda están vacías, desbordar lo muestra entero sin ensanchar nada.
  reqs.push({ repeatCell: { range: rg(0, det0 - 2, 0, ancho), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } })
  // El subtítulo: gris, chico, en UNA línea que desborda sobre las columnas vacías.
  reqs.push({ repeatCell: { range: rg(1, 2, 0, ancho), cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: MUTED }, wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } })
  // Formato de número por columna en el detalle + ancho de columna.
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(det0 - 1, det1, j, j + 1), cell: { userEnteredFormat: E.celda(unidad, { color: INK }) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ANCHO[j] ?? E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  // TODOS los importes de la banda: moneda, a la derecha, DESDE la fila del encabezado — así el
  // rótulo "Monto" se alinea con sus cifras en las dos secciones y no una a cada lado.
  reqs.push({ repeatCell: { range: rg(fCartera - 2, fControl, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  // La columna "Qué significa": explicación, nunca plata. SÓLO en las filas de datos: sobre un
  // encabezado saldría en redonda al lado de "Concepto" y "Monto" en versalita.
  for (const [r0, r1] of [[fCartera - 1, fEndosado], [fEntro - 1, fControl]]) {
    reqs.push({ repeatCell: { range: rg(r0, r1, 2, 3), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } })
  }
  // EL TITULAR: la cifra en 16 pt y acento (nadie más usa ese color), y su RÓTULO en 12 pt — no en
  // los 13 que pone la piel: a 13 el rótulo no entra en su columna y se corta a la mitad (visto en
  // el render). Un rótulo cortado no es un titular. Mismo criterio que en "Cheques Emitidos".
  reqs.push({ repeatCell: { range: rg(fCartera - 1, fCartera, 0, 1), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 12 }) } }, fields: 'userEnteredFormat.textFormat' } })
  reqs.push({ repeatCell: { range: rg(fCartera - 1, fCartera, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT', textFormat: txt(ACENTO, { bold: true, size: 16 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } })
  // La columna A tiene que dar lugar al concepto de la banda Y al N° de operación del registro.
  reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 270 }, fields: 'pixelSize' } })
  reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── VERIFICACIÓN ──────────────────────────────────────────────────────────────────────────────
  const banda = await google.readSheetValues(ID, `${PESTAÑA}!A1:C${fControl}`)
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${det0}:E${det1}`)
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  const errores = [...v.flat(), ...banda.flat()].filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  console.log(`  en cartera ${banda?.[fCartera - 1]?.[1]} · endosado ${banda?.[fEndosado - 1]?.[1]} · entró ${banda?.[fEntro - 1]?.[1]} · depositado ${banda?.[fDeposito - 1]?.[1]} · falta bajar ${banda?.[fControl - 1]?.[1]}`)
  console.log(`  detalle: ${escritas}/${ops.length} operaciones · ${errores} celdas en error`)
  if (escritas !== ops.length || errores) process.exitCode = 1
  else console.log('  ✓ sin celdas en error')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
