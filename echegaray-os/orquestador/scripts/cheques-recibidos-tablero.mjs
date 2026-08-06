#!/usr/bin/env node
// "Cheques Recibidos" — EL DUEÑO DE LA CABECERA (filas 1 a 26). El registro NO se toca.
//
// ═══ LO QUE ESTE SCRIPT NO PUEDE HACER, NUNCA ═══
//
// El registro de esta pestaña es el DERRAME de una sola QUERY puesta en A28 sobre `_CHEQUES_RAW`.
// Escribir un valor —cualquiera— adentro de ese rectángulo no devuelve un error: deja la QUERY en
// `#REF!` y la pestaña se queda sin registro. Por eso:
//
//   · la escritura es un rectángulo CERRADO de 26 filas, calculado por lib/cheques-recibidos-cabecera;
//   · antes de escribir se COMPRUEBA que el registro siga donde dice el contrato (encabezado en la 27,
//     QUERY en la 28). Si no está, ABORTA sin tocar nada: la cabecera se habrá corrido y escribirla a
//     ciegas sería escribir arriba del derrame;
//   · después de escribir se RE-LEE la fila 28 y se exige que la QUERY siga entera. La evidencia es
//     del efecto, no del intento: que la API conteste 200 no prueba nada.
//
// Del registro sólo se toca el FORMATO NUMÉRICO de dos columnas (E fecha, F importe), que hoy están
// corridas —E dibuja un importe como fecha y F muestra 661598,92 sin moneda—. Es `repeatCell` de
// formato: no escribe ni un valor.
//
// ═══ POR QUÉ ESTE ARCHIVO REEMPLAZA A DOS ═══
//
// `cheques-recibidos-pestana.mjs` y `cheques-recibidos-cobro.mjs` describían una pestaña con columnas
// "N° operación / Movimiento / Qué significa" que YA NO EXISTE (el registro por operación contaba el
// mismo cheque tres veces: el endoso de $20.000.000 figuraba dos veces). El pipeline ya declaraba
// `cheques-recibidos-tablero.mjs` como dueño desde el 01/08 — y ese archivo no existía: el paso
// fallaba en cada corrida y la pestaña envejecía sin que nada avisara.
//
//   node orquestador/scripts/cheques-recibidos-tablero.mjs [--dry] [--pestana "Cheques Recibidos"]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { firmaGuardia, sellarFirma } from '../lib/firma-tab.mjs'
import { reglaError } from '../lib/formato-condicional.mjs'
import {
  grilla, valorSelector, reglasCondicionales, reglasABorrar,
  BANDA, ANCHO, FILA_TITULO, FILA_FRESCURA, FILA_ROTULOS, FILA_VALORES, FILA_CAL, FILA_DIAS,
  FILA_SEM0, SEMANAS, FILA_RESUMEN, FILA_CARTERA, FILA_TRAMO0, FILA_ESTADO0, FILA_REGISTRO,
  COL_CAL0, COL_CAL1, TRAMOS, TERMINALES, INDICADORES,
  FILA_HDR_REGISTRO, FILA_QUERY_REGISTRO, ANCLA_REGISTRO, PREFIJO_QUERY,
  COL_FECHA_REGISTRO, COL_IMPORTE_REGISTRO,
} from '../lib/cheques-recibidos-cabecera.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
/** El pipeline le dice a qué pestaña escribir: el real o una copia de prueba. */
const iPest = process.argv.indexOf('--pestana')
const PESTANA = iPest >= 0 ? String(process.argv[iPest + 1] ?? '') : 'Cheques Recibidos'

const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
const BLANCO = { red: 1, green: 1, blue: 1 }
/** Amarillo = "acá podés escribir". La ÚNICA celda de captura de la cabecera es el selector de mes. */
const CAPTURA = { red: 1, green: 0.98, blue: 0.86 }

const MONEDA = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' }
const ENTERO = { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' }
const FECHA = { type: 'DATE', pattern: 'dd/mm/yyyy' }
const MES = { type: 'DATE', pattern: 'mmmm yyyy' }
const TEXTO = { type: 'TEXT' }

const txt = (color, { bold = false, size = 10 } = {}) => ({ foregroundColor: color, bold, fontSize: size, fontFamily: 'Arial' })

/**
 * Los pedidos de FORMATO de la cabecera y de las dos columnas reparadas del registro.
 * Se calcula sobre la grilla YA ESCRITA: una regla de formato calculada sobre otra cosa aterriza
 * corrida, que es de dónde salieron las fechas dibujadas en la columna de plata.
 */
function requestsFormato(sheetId, filasHoja) {
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const cell = (range, userEnteredFormat, fields) => ({ repeatCell: { range, cell: { userEnteredFormat }, fields } })
  const F_TXT = 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,backgroundColor)'
  const F_NUM = 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)'
  const base = { numberFormat: TEXTO, textFormat: txt(INK), horizontalAlignment: 'LEFT', verticalAlignment: 'BOTTOM', wrapStrategy: 'OVERFLOW_CELL', backgroundColor: BLANCO }
  return [
    // 1 · La base de toda la banda. Va PRIMERO: lo que sigue la pisa donde corresponde. Sin esto, los
    // formatos corridos del diseño anterior sobreviven en las celdas que el nuevo no menciona.
    cell(r(0, BANDA), base, F_TXT),
    cell(r(FILA_TITULO - 1, FILA_TITULO, 0, 1), { textFormat: txt(INK, { bold: true, size: 16 }) }, 'userEnteredFormat.textFormat'),
    cell(r(FILA_FRESCURA - 1, FILA_FRESCURA), { textFormat: txt(MUTED, { size: 9 }) }, 'userEnteredFormat.textFormat'),
    // 2 · Las siete tarjetas: rótulo chico y apagado arriba, la cifra grande abajo.
    cell(r(FILA_ROTULOS - 1, FILA_ROTULOS, 0, INDICADORES.length), { textFormat: txt(MUTED, { bold: true, size: 9 }) }, 'userEnteredFormat.textFormat'),
    cell(r(FILA_VALORES - 1, FILA_VALORES, 0, INDICADORES.length),
      { numberFormat: MONEDA, textFormat: txt(ACENTO, { bold: true, size: 14 }), horizontalAlignment: 'LEFT' }, F_NUM),
    // 3 · El calendario. El selector es la única celda que escribe una persona: va en amarillo.
    cell(r(FILA_CAL - 1, FILA_CAL, 0, 1), { textFormat: txt(MUTED, { bold: true, size: 9 }) }, 'userEnteredFormat.textFormat'),
    cell(r(FILA_CAL - 1, FILA_CAL, COL_CAL0, COL_CAL0 + 1),
      { numberFormat: MES, textFormat: txt(INK, { bold: true, size: 11 }), horizontalAlignment: 'LEFT', backgroundColor: CAPTURA },
      'userEnteredFormat(numberFormat,textFormat,horizontalAlignment,backgroundColor)'),
    cell(r(FILA_DIAS - 1, FILA_DIAS, COL_CAL0, COL_CAL1), { textFormat: txt(MUTED, { size: 8 }), horizontalAlignment: 'CENTER' }, 'userEnteredFormat(textFormat,horizontalAlignment)'),
    // Las celdas-día llevan dos renglones (día y monto): sin WRAP el monto no se ve y la celda miente
    // por omisión. TOP para que el número del día quede alineado con el de al lado.
    cell(r(FILA_SEM0 - 1, FILA_SEM0 - 1 + SEMANAS, COL_CAL0, COL_CAL1),
      { numberFormat: TEXTO, textFormat: txt(INK, { size: 9 }), horizontalAlignment: 'LEFT', verticalAlignment: 'TOP', wrapStrategy: 'WRAP' }, F_TXT),
    // 4 · El resumen. Los rótulos de columna se alinean con sus cifras, no con el concepto.
    cell(r(FILA_RESUMEN - 1, FILA_RESUMEN, 1, 3), { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(textFormat,horizontalAlignment)'),
    cell(r(FILA_CARTERA - 1, FILA_ESTADO0 - 1 + TERMINALES.length, 1, 2), { numberFormat: MONEDA, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)'),
    cell(r(FILA_CARTERA - 1, FILA_ESTADO0 - 1 + TERMINALES.length, 2, 3), { numberFormat: ENTERO, textFormat: txt(MUTED), horizontalAlignment: 'RIGHT' }, F_NUM),
    // La línea del total: es la cifra de la que cuelga la partición de abajo.
    cell(r(FILA_CARTERA - 1, FILA_CARTERA, 0, 1), { textFormat: txt(ACENTO, { bold: true, size: 12 }) }, 'userEnteredFormat.textFormat'),
    cell(r(FILA_CARTERA - 1, FILA_CARTERA, 1, 2), { numberFormat: MONEDA, textFormat: txt(ACENTO, { bold: true, size: 12 }), horizontalAlignment: 'RIGHT' }, F_NUM),
    { updateBorders: { range: r(FILA_CARTERA - 1, FILA_CARTERA, 0, 3), top: { style: 'SOLID', width: 1, color: HAIR } } },
    // Los estados terminales van separados de la partición por una regla: no son cartera.
    { updateBorders: { range: r(FILA_ESTADO0 - 1, FILA_ESTADO0, 0, 3), top: { style: 'SOLID', width: 1, color: HAIR } } },
    cell(r(FILA_REGISTRO - 1, FILA_REGISTRO, 0, 1), { textFormat: txt(MUTED, { bold: true, size: 9 }) }, 'userEnteredFormat.textFormat'),
    { updateBorders: { range: r(FILA_REGISTRO - 1, FILA_REGISTRO, 0, ANCHO), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    // 5 · EL REGISTRO: SÓLO FORMATO NUMÉRICO, y sólo en las dos columnas que estaban corridas. La E
    // mostraba "$46.218,00" sobre una fecha y la F "661598,92" sin moneda. Ni un valor se escribe acá.
    cell(r(FILA_QUERY_REGISTRO - 1, Math.max(filasHoja, FILA_QUERY_REGISTRO), COL_FECHA_REGISTRO, COL_FECHA_REGISTRO + 1),
      { numberFormat: FECHA, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)'),
    cell(r(FILA_QUERY_REGISTRO - 1, Math.max(filasHoja, FILA_QUERY_REGISTRO), COL_IMPORTE_REGISTRO, COL_IMPORTE_REGISTRO + 1),
      { numberFormat: MONEDA, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)'),
    // 6 · Geometría: la cabecera y el encabezado del registro quedan siempre a la vista.
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: FILA_HDR_REGISTRO } }, fields: 'gridProperties.frozenRowCount' } },
    ...[[FILA_TITULO, 34], [FILA_VALORES, 30]].map(([f, px]) => (
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: f - 1, endIndex: f }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: FILA_SEM0 - 1, endIndex: FILA_SEM0 - 1 + SEMANAS }, properties: { pixelSize: 44 }, fields: 'pixelSize' } },
    // Los anchos son un COMPROMISO declarado: B..H tienen que ser iguales (son los siete días de la
    // semana) y abajo son las columnas del registro. La A lleva los conceptos largos.
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: COL_CAL0, endIndex: COL_CAL1 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: COL_CAL1, endIndex: COL_CAL1 + 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    // NINGUNA FILA OCULTA: lo que existe se ve. (El dueño, dos veces, sobre CAJA.)
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(filasHoja, BANDA) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ]
}

/** ¿El registro sigue donde dice el contrato? Núcleo puro para poder probarlo sin red. */
export function registroIntacto(colA = []) {
  const hdr = String(colA[FILA_HDR_REGISTRO - 1]?.[0] ?? '').trim()
  const query = String(colA[FILA_QUERY_REGISTRO - 1]?.[0] ?? '').trim()
  return hdr === ANCLA_REGISTRO && query.startsWith(PREFIJO_QUERY)
}

async function main() {
  if (DRY) {
    const { filas } = grilla({ selector: '=EOMONTH(TODAY();-1)+1' })
    filas.forEach((f, i) => console.log(String(i + 1).padStart(3), JSON.stringify(f.map((c) => String(c).slice(0, 46)))))
    console.log(`(--dry) ${filas.length} filas × ${ANCHO} columnas. No toqué nada.`)
    return
  }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) { console.error(`No existe la pestaña "${PESTANA}"`); process.exitCode = 1; return }
  const { sheetId } = hoja

  // ── EL CANDADO, ANTES QUE NADA ───────────────────────────────────────────────────────────────────
  // Si el dueño (o el auto-candado) tomó la pestaña, no se le toca ni el formato. Sin bypass: destrabar
  // es una decisión de él, no de un generador que corre cada dos horas.
  const { estaBloqueada } = await import('../lib/pestana-bloqueada.mjs')
  if (await estaBloqueada({}, ID, PESTANA).catch(() => false)) {
    console.log(`🔒 "${PESTANA}" está bajo control (candado): no la toco.`)
    return
  }

  // ── LA GUARDA DE GEOMETRÍA ───────────────────────────────────────────────────────────────────────
  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA: si no se puede leer, no se puede decidir dónde
  // empieza el registro, y escribir a ciegas es escribir arriba de la QUERY.
  const colA = await google.readSheetValues(ID, `'${PESTANA}'!A1:A${FILA_QUERY_REGISTRO}`, { render: 'FORMULA' })
    .catch((e) => { throw new Error(`no pude leer "${PESTANA}" (${e.message}). NO escribo.`) })
  if (!registroIntacto(colA)) {
    console.error(`ABORTA: el registro de "${PESTANA}" no está donde dice el contrato.`)
    console.error(`  Esperaba "${ANCLA_REGISTRO}" en A${FILA_HDR_REGISTRO} y la QUERY en A${FILA_QUERY_REGISTRO}.`)
    console.error(`  Hay: A${FILA_HDR_REGISTRO}="${String(colA[FILA_HDR_REGISTRO - 1]?.[0] ?? '').slice(0, 40)}" · `
      + `A${FILA_QUERY_REGISTRO}="${String(colA[FILA_QUERY_REGISTRO - 1]?.[0] ?? '').slice(0, 40)}"`)
    console.error('  Escribir la cabecera con el registro corrido lo dejaría en #REF!. Revisar a mano.')
    process.exitCode = 1
    return
  }

  const firma = await firmaGuardia(google, ID, PESTANA, `'${PESTANA}'`)
  if (firma.editada) {
    console.log(`  ✋ NO escribo: la firma dice que "${PESTANA}" la editaste vos. Lo que hay es tuyo.`)
    return
  }

  // ── EL SELECTOR DE MES SE PRESERVA ───────────────────────────────────────────────────────────────
  // Se lee en sus dos especies porque el render FORMULA devuelve la fórmula pero una fecha tipeada
  // vuelve como texto: escribirla de vuelta así la convertiría en TEXTO y el calendario entero
  // quedaría en #VALUE!.
  const celda = `'${PESTANA}'!${String.fromCharCode(65 + COL_CAL0)}${FILA_CAL}`
  const prevF = await google.readSheetValues(ID, celda, { render: 'FORMULA' }).catch(() => null)
  const prevV = await google.readSheetValues(ID, celda, { render: 'UNFORMATTED_VALUE' }).catch(() => null)
  const selector = valorSelector({ formula: prevF?.[0]?.[0], crudo: prevV?.[0]?.[0] })
  const { filas } = grilla({ selector })

  // ── LOS MERGES DE LA BANDA SE DESARMAN ANTES DE ESCRIBIR ─────────────────────────────────────────
  // Una celda COMBINADA sólo acepta escritura en su ancla: el resto se ignora EN SILENCIO. Los dos
  // merges huérfanos del diseño anterior (A18:J18 y A24:J24) caían sobre filas de dato y por eso tres
  // fórmulas no se escribían nunca. El diseño nuevo no tiene ni un merge: el aire lo hacen las filas
  // vacías, que no esconden nada.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: ANCHO } },
  }]).catch(() => {})

  const escrito = await google.escribirValoresPorCeldas(ID, sheetId, filas)
  if (escrito?.protegido) {
    console.log(`  ✋ NO escribo: la guarda central frenó "${PESTANA}"${escrito.motivo ? ` (${escrito.motivo})` : ''}.`)
    return
  }

  // ── LA EVIDENCIA ES DEL EFECTO ───────────────────────────────────────────────────────────────────
  // Dos preguntas, y las dos se le hacen a la pestaña: ¿aterrizó lo mío?, ¿sigue entero lo ajeno?
  const releido = await google.readSheetValues(ID, `'${PESTANA}'!A1:J${FILA_QUERY_REGISTRO}`, { render: 'FORMULA' })
  const vino = String(releido?.[FILA_REGISTRO - 1]?.[0] ?? '')
  if (vino !== 'REGISTRO') {
    throw new Error(`la escritura NO aterrizó: A${FILA_REGISTRO} tendría que decir "REGISTRO" y dice "${vino.slice(0, 40)}".`)
  }
  if (!registroIntacto(releido)) {
    throw new Error(`ROMPÍ EL REGISTRO: la QUERY de A${FILA_QUERY_REGISTRO} ya no está. Restaurar desde el historial YA.`)
  }

  const reglas = (await google.apiGetSheets(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}?fields=sheets(properties(sheetId),conditionalFormats)`)
    .catch(() => null))?.sheets?.find((s) => s.properties?.sheetId === sheetId)?.conditionalFormats ?? []
  const borrar = reglasABorrar(reglas)
  if (borrar.length) console.log(`  🧹 ${borrar.length} regla(s) condicional(es) mías, borradas antes de reponerlas`)
  const condicionales = [reglaError(sheetId, ANCHO, BANDA), ...reglasCondicionales(sheetId)]
    .map((q, i) => ({ addConditionalFormatRule: { ...q.addConditionalFormatRule, index: i } }))
  await google.spreadsheetBatchUpdate(ID, [
    ...borrar.map((i) => ({ deleteConditionalFormatRule: { sheetId, index: i } })),
    ...requestsFormato(sheetId, hoja.rows ?? BANDA),
    ...condicionales,
  ])
  await sellarFirma(google, ID, PESTANA, `'${PESTANA}'`)

  // ── EL RESUMEN SALE DE RELEER LA PESTAÑA, NO DE LO QUE SE PRETENDIÓ ESCRIBIR ─────────────────────
  const v = await google.readSheetValues(ID, `'${PESTANA}'!A1:J${BANDA}`)
  const errores = (v || []).flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV|NUM)/i.test(String(c ?? ''))).length
  const fila = (f) => (v?.[f - 1] ?? [])
  console.log(`✔ ${PESTANA} — cabecera de ${BANDA} filas`)
  console.log(`  ${INDICADORES.map((ind, i) => `${ind.rotulo} ${fila(FILA_VALORES)[i] ?? '—'}`).join(' · ')}`)
  console.log(`  en cartera ${fila(FILA_CARTERA)[1] ?? '—'} (${fila(FILA_CARTERA)[2] ?? '—'} cheques)`)
  TRAMOS.forEach((t, i) => console.log(`    ${t.rotulo.padEnd(24)} ${fila(FILA_TRAMO0 + i)[1] ?? '—'}`))
  TERMINALES.forEach((t, i) => console.log(`  ${t.rotulo.padEnd(26)} ${fila(FILA_ESTADO0 + i)[1] ?? '—'}`))
  console.log(`  ${errores} celda(s) en error`)
  if (errores) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
