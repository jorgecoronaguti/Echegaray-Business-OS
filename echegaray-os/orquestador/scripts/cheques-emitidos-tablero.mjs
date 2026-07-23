#!/usr/bin/env node
// "Cheques Emitidos" AL ESTÁNDAR MINIMALISTA + CLASE MUNDIAL (regla del dueño, 22/07).
//
// QUÉ ES ESTA PESTAÑA. Un registro de cheques emitidos de tesorería: cada cheque/echeq que la empresa
// libró, con su fecha de pago y si el banco ya lo DEBITÓ. Es pestaña de CARGA manual (columnas A–L las
// llena el dueño); la columna M es el cruce del OS contra Compras. NO se toca el dato: se le pone una
// piel de statement y una banda-resumen arriba.
//
// QUÉ ES "WORLD CLASS" ACÁ (best practices de registro de cheques de tesorería + búsqueda del 22/07,
// ver Sources en el commit): lo que un tesorero mira NO es la lista, es el OUTSTANDING — los cheques
// EMITIDOS Y NO DEBITADOS, que son plata comprometida que todavía no salió de la cuenta y que la
// disponibilidad neta tiene que descontar. Eso va de titular. La lista es la evidencia, no el héroe.
//
// MINIMALISMO: sin reja (gridlines off), sin barra de color; jerarquía por tipografía y hairlines;
// totales rulados; números tabulares; la banda-resumen es TODO fórmula sobre el propio registro
// (regla de oro: ni un número pegado). Se inserta arriba, así el registro no se desarma y el dueño
// sigue cargando abajo.
//
//   node orquestador/scripts/cheques-emitidos-tablero.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')
const BANDA = 12 // filas de resumen arriba del registro. MISMA estructura que 'Cheques Recibidos':
// título · nota · aire · SECCIÓN posición (Concepto|Monto|Qué significa) · aire · SECCIÓN registro.

// Paleta sobria de statement (misma identidad que CAJA).
const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
const NEG = { red: 0.61, green: 0.17, blue: 0.17 }

const hoy = new Date().toLocaleDateString('es-AR')

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) { console.error(`No existe la pestaña ${PESTANA}`); process.exit(1) }
  const sheetId = hoja.sheetId

  // ¿Cuántas filas ocupa hoy la banda? Se DEDUCE de dónde está el encabezado del registro (col A =
  // "TIPO"), no de un flag en A1: así el ancho de la banda puede cambiar sin duplicarla ni romperla.
  // ═══ NO ANCLAR EN UN RÓTULO QUE EL DUEÑO PUEDE BORRAR (23/07) ═══
  //
  // Esto se rompió en vivo el mismo día que se activó la Regla 0. El dueño había borrado la columna
  // de rótulos de la banda —incluido el "TIPO" del encabezado—; el generador no encontró su ancla,
  // dedujo `bandaActual = 0` y **insertó 12 filas**: la pestaña quedó con dos bandas, una huérfana
  // arriba, y el registro corrido doce renglones. Peor: al quedar A1 vacía por el insert, la
  // detección automática dio por borrados textos que él nunca tocó, y el error se realimentaba.
  //
  // La lección es general: **un ancla tiene que ser algo que el generador controla, no un texto que
  // una persona puede editar legítimamente.** Se ancla en la ESTRUCTURA del registro —la primera
  // fila que tiene FISICO/ECHEQ en A, o encabezados propios del registro en B/C— y el rótulo queda
  // sólo como último recurso.
  const cabecera = (await google.readSheetValues(ID, `${PESTANA}!A1:C40`)) || []
  let iHdr = cabecera.findIndex((f) => /^TIPO$/i.test(String(f?.[0] ?? '').trim()))
  if (iHdr < 0) {
    // El encabezado es la fila JUSTO ANTERIOR al primer cheque del registro.
    const iPrimerCheque = cabecera.findIndex((f) => /^(FISICO|ECHEQ)$/i.test(String(f?.[0] ?? '').trim()))
    if (iPrimerCheque > 0) iHdr = iPrimerCheque - 1
  }
  if (iHdr < 0) {
    // Último recurso: la fila que trae los encabezados propios del registro en B/C.
    iHdr = cabecera.findIndex((f) => /^nro$/i.test(String(f?.[1] ?? '').trim()))
  }
  if (iHdr < 0) {
    console.error(`No encuentro dónde arranca el registro de "${PESTANA}". NO inserto filas a ciegas: `
      + 'hacerlo duplica la banda y corre el registro entero. Revisá la pestaña.')
    process.exit(1)
  }
  const bandaActual = iHdr
  const HDR = BANDA + 1

  if (DRY) {
    console.log(`(--dry) banda actual ${bandaActual} filas → ${BANDA}. Encabezado del registro quedará en la fila ${HDR}.`)
    console.log('Resumen = SUMIF/COUNTIF/MINIFS sobre la columna K (DEBITADO) — 0 números pegados.')
    return
  }

  // Ajustar la banda al alto exacto: insertar las que faltan o quitar las que sobran.
  if (bandaActual < BANDA) {
    await google.spreadsheetBatchUpdate(ID, [{
      insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: BANDA - bandaActual }, inheritFromBefore: false },
    }])
  } else if (bandaActual > BANDA) {
    await google.spreadsheetBatchUpdate(ID, [{
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: bandaActual - BANDA } },
    }])
  }

  // Rangos abiertos del registro (desde el header). Referencia LOCAL (misma hoja): sin el prefijo
  // 'Cheques Emitidos'! — el nombre con espacio necesitaría comillas y no hace falta acá.
  const F = `$F$${HDR}:$F` // Monto
  const K = `$K$${HDR}:$K` // DEBITADO SI/NO
  const A = `$A$${HDR}:$A` // TIPO (FISICO/ECHEQ)
  const I = `$I$${HDR}:$I` // fecha de pago
  // NO DEBITADO = todo lo que NO dice "SI", no sólo lo que dice "NO". Un DEBITADO en blanco es un
  // cheque que todavía no se debitó (default seguro, igual que CAJA): contarlo sólo cuando dice "NO"
  // sub-contaba $5,18M en 8 cheques con la celda vacía. El IF(ISNUMBER(F)) evita que las filas vacías
  // del rango abierto sumen. Mismo criterio que la línea de cheques de CAJA (K<>"SI").
  const outstanding = `SUMPRODUCT((UPPER(${K})<>"SI")*IF(ISNUMBER(${F});${F};0))`

  // BANDA-RESUMEN — MISMA ESTRUCTURA QUE "Cheques Recibidos", para que las dos pestañas se lean igual:
  // título · nota · aire · SECCIÓN (Concepto|Monto|Qué significa) · aire · SECCIÓN del registro.
  // Todo fórmula sobre el propio registro: ni un número pegado.
  //
  // LOS VALORES VAN EN LA COLUMNA B, NUNCA EN LA F. La F es la del IMPORTE del registro y CAJA suma
  // F2:F400: cualquier cifra de la banda puesta ahí se sumaba a los cheques como si fuera uno más
  // (ya pasó con la fecha del próximo a debitar, que entraba como su número de serie).
  const echeq = `SUMPRODUCT((UPPER(${K})<>"SI")*(${A}="ECHEQ")*IF(ISNUMBER(${F});${F};0))`
  const fisico = `SUMPRODUCT((UPPER(${K})<>"SI")*(${A}="FISICO")*IF(ISNUMBER(${F});${F};0))`
  const fila13 = (a = '', b = '', c = '') => [a, b, c, '', '', '', '', '', '', '', '', '', '']
  const filas = [
    fila13('Cheques emitidos'),
    fila13(`Registro de tesorería · al ${hoy} · en pesos. Cada cheque librado por la empresa, con su fecha de pago y si el banco ya lo debitó. Lo que importa es lo NO debitado: plata firmada que todavía no salió de la cuenta y que la disponibilidad neta ya descuenta.`),
    fila13(),
    fila13('1 · POSICIÓN DE CHEQUES EMITIDOS — ¿CUÁNTO YA SALIÓ DE TUS MANOS Y TODAVÍA NO SE DEBITÓ?'),
    fila13('Concepto', 'Monto', 'Qué significa'),
    fila13('⇒ Comprometido, no debitado', `=${outstanding}`, 'Ya salió de tus manos, todavía no de la cuenta'),
    fila13('   · en echeq', `=${echeq}`, ''),
    fila13('   · en cheque físico', `=${fisico}`, ''),
    fila13('Cheques pendientes', `=SUMPRODUCT((UPPER(${K})<>"SI")*ISNUMBER(${F}))`, 'Cantidad, no plata'),
    // MINIFS con criterio "<>SI" deja la celda VACÍA (no da error, no escribe nada): se usa "NO",
    // que además es exacto porque todos los DEBITADO en blanco ya se completaron con NO.
    fila13('Próximo a debitar', `=IFERROR(TEXT(MINIFS(${I};${K};"NO");"dd/mm/yy");"—")`, 'La fecha más cercana de las pendientes'),
    fila13(),
    fila13('2 · EL REGISTRO, CHEQUE POR CHEQUE'),
  ]
  // ═══ DESARMAR LOS MERGES DE LA BANDA ANTES DE ESCRIBIR ═══
  // Una celda COMBINADA sólo acepta escritura en su ancla: escribir en cualquier otra celda del merge
  // se ignora EN SILENCIO —sin error, sin valor—. El diseño viejo tenía la banda con títulos
  // combinados a lo ancho, y por eso la fórmula del próximo a debitar nunca llegaba a B10: no fallaba,
  // desaparecía. Es la trampa de celdas combinadas que la skill de Sheets marca como "asesino
  // silencioso" en zonas de datos.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: 13 } },
  }]).catch(() => {})
  // ═══ REGLA 0 — LO QUE EL DUEÑO EDITÓ GANA, Y EL GENERADOR SE ADAPTA ═══
  //
  // POR QUÉ ACÁ Y NO EN escribirPreservando (23/07). El dueño: "no estás respetando q yo hago
  // ediciones en las pestañas y me las ignoras". Esta banda se escribe en CRUDO, no por fusión: no
  // lleva los centinelas VACIO, así que pasarla por `escribirPreservando` haría revivir los valores
  // viejos de la propia banda —el defecto que ya se pagó en Proveedores, con proveedores duplicados
  // y el total al doble—. Se aplica entonces sólo la mitad que corresponde: respetar SUS textos.
  //
  // Alcanza a los rótulos: si él reescribió el subtítulo o borró una etiqueta, eso vale. Los importes
  // y las fórmulas los sigue mandando el generador, que es lo que la pestaña existe para calcular.
  // El TEXTO QUE SE VE, no la fórmula: ver lib/preservar-anotaciones.mjs.
  const previo = await google.readSheetValues(ID, `'${PESTANA}'!A1:M${filas.length}`).catch(() => [])
  const { grid: filasFinal, respetadas, ediciones } = await conEdicionesRespetadas(ID, PESTANA, filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}") en vez de escribir "${String(r.mio).slice(0, 44)}"`)
  await google.batchUpdateValues(ID, [{ range: `${PESTANA}!A1`, values: filasFinal }])
  await guardarRegistro(ID, PESTANA, filasFinal, ediciones, previo)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // ── FORMATO: la misma piel de statement que "Cheques Recibidos" (lib/estilo-statement.mjs) ──────
  // skinRequests resuelve título, secciones (MAYÚSCULAS), encabezados y totales (⇒) a partir del
  // contenido: reja apagada, fondo blanco, tinta, hairlines y CERO barras de color.
  const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, fontSize: size, italic, fontFamily: 'Arial' })
  const money = { type: 'NUMBER', pattern: '$#,##0' }
  // ═══ SE FORMATEA LO QUE QUEDÓ ESCRITO, NO LO QUE SE QUISO ESCRIBIR (23/07) ═══
  //
  // El dueño: "has dejado roto el formato de la pestaña cheques emitidos". Y lo estaba. Él había
  // borrado la columna de rótulos de la banda; la Regla 0 respetó esos borrados en los VALORES, pero
  // al formateador se le seguía pasando la grilla ORIGINAL. Resultado: dibujaba la regla del título
  // de cada sección —y medía el ancho de cada bloque— como si los rótulos siguieran ahí. En pantalla
  // quedaban DOS LÍNEAS COLGADAS SOBRE LA NADA, que es justo lo que el minimalismo no perdona: una
  // regla existe para separar contenido, y ahí no había contenido que separar.
  //
  // La clasificación de cada fila (título, sección, encabezado, total) sale de la columna A. Si esa
  // columna quedó vacía porque una persona la vació, la fila deja de ser una sección — y tiene que
  // dejar de tener su regla. Pasar la grilla final es lo que hace que el formato siga a la realidad.
  const reqs = [
    ...skinRequests({ sheetId, filas: filasFinal, cols: 13, congeladas: HDR }),
    // La nota bajo el título, gris y chica.
    // Si el dueño borró el subtítulo, su fila no lleva alto especial: sería un renglón alto y vacío.
    ...(String(filasFinal[1]?.[0] ?? '').trim() ? [
      { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 13 }, cell: { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    ] : []),
    // Los importes de la posición: moneda, a la derecha, tabulares.
    { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT', textFormat: txt(INK, { bold: false, size: 11 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // El titular, en acento y grande: es lo que el tesorero mira primero.
    { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT', textFormat: txt(ACENTO, { bold: true, size: 16 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // Cantidad de cheques: entero, no plata. Y el próximo a debitar: texto.
    { repeatCell: { range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT', textFormat: txt(INK, { size: 11 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT', textFormat: txt(INK, { size: 11 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // La columna "Qué significa": explicación, nunca plata.
    { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 10, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // Encabezado del registro: versalita apagada con hairline, igual que en Recibidos.
    { repeatCell: { range: { sheetId, startRowIndex: HDR - 1, endRowIndex: HDR, startColumnIndex: 0, endColumnIndex: 13 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    { updateBorders: { range: { sheetId, startRowIndex: HDR - 1, endRowIndex: HDR, startColumnIndex: 0, endColumnIndex: 13 }, bottom: { style: 'SOLID', width: 1, color: HAIR } } },
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)

  // Verificar: releer el número héroe y la cuenta.
  const chk = await google.readSheetValues(ID, `${PESTANA}!B6:B10`)
  console.log(`✔ ${PESTANA} · comprometido no debitado ${chk?.[0]?.[0]} · echeq ${chk?.[1]?.[0]} · físico ${chk?.[2]?.[0]} · ${chk?.[3]?.[0]} cheques · próximo ${chk?.[4]?.[0]}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
