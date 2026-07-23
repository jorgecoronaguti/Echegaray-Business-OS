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

const hoy = new Date().toLocaleDateString('es-AR')

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) { console.error(`No existe la pestaña ${PESTANA}`); process.exit(1) }
  const sheetId = hoja.sheetId

  // ¿Cuántas filas ocupa hoy la banda? Se DEDUCE de dónde está el encabezado del registro (col A =
  // "TIPO"), no de un flag en A1: así el ancho de la banda puede cambiar sin duplicarla ni romperla.
  const colA = await google.readSheetValues(ID, `${PESTANA}!A1:A40`)
  const iHdr = (colA || []).findIndex((f) => /^TIPO$/i.test(String(f?.[0] ?? '').trim()))
  const bandaActual = iHdr >= 0 ? iHdr : 0
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
    // ═══ EL SUBTÍTULO ES UNA LÍNEA, NO UN PÁRRAFO ═══
    //
    // POR QUÉ (23/07, al VER la pestaña). El subtítulo viejo tenía 290 caracteres y se escribía en
    // A2 con wrapStrategy WRAP: envuelto dentro de una columna de 200 px daría ocho renglones, y la
    // fila mide 34 px — o sea que se veían dos y el resto quedaba CORTADO, sin ningún error. Un
    // texto largo en la grilla se desparrama o se corta; ninguna de las dos cosas se lee.
    // Ahora dice lo que la gramática pide —qué contesta · de qué fuente sale · a qué fecha— en una
    // sola línea que desborda sobre las columnas vacías de al lado, como el sumario de un statement.
    fila13(`Cuánto de lo que la empresa ya firmó todavía no salió de la cuenta · fuente: el registro de abajo, que carga Administración, cruzado con Compras y con el extracto · al ${hoy} · en pesos`),
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
  await google.batchUpdateValues(ID, [{ range: `${PESTANA}!A1`, values: filas }])

  // ── FORMATO: la misma piel de statement que "Cheques Recibidos" (lib/estilo-statement.mjs) ──────
  // skinRequests resuelve título, secciones (MAYÚSCULAS), encabezados y totales (⇒) a partir del
  // contenido: reja apagada, fondo blanco, tinta, hairlines y CERO barras de color.
  const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, fontSize: size, italic, fontFamily: 'Arial' })
  const money = { type: 'NUMBER', pattern: '$#,##0' }
  const reqs = [
    // ═══ LA PIEL LLEGA HASTA EL FINAL DE LA HOJA, NO HASTA DONDE ESCRIBE EL GENERADOR ═══
    //
    // POR QUÉ (23/07, al VER la pestaña). skinRequests sin `filasHoja` sólo repinta las filas que el
    // generador escribe —las 12 de la banda—, y el REGISTRO, que es el 90% de lo que se ve, seguía
    // con la piel de un formateador anterior: las columnas C, E, I y L en AZUL puro sobre un relleno
    // celeste (98/99/100) y con borde en los cuatro lados de cada celda. En pantalla eso es un
    // formulario con reja y con texto que parece hipervínculo, exactamente lo contrario del
    // statement sin color que pide el estándar — y ningún auditor lo levantaba porque el VALOR de la
    // celda estaba perfecto. La validación de datos (los desplegables que puso el dueño en E, K, L y
    // M) NO se toca: acá sólo se cambia fondo, borde y tipografía.
    ...skinRequests({ sheetId, filas, cols: 13, congeladas: HDR, filasHoja: hoja.rows || 400 }),
    // La nota bajo el título, gris y chica. OVERFLOW, nunca WRAP: ver el comentario del subtítulo.
    { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 13 }, cell: { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } },
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
    // ═══ LA REGLA DEL TÍTULO DEL REGISTRO, DEL ANCHO DEL REGISTRO ═══
    //
    // POR QUÉ (23/07, al VER la pestaña). skinRequests dibuja la regla de una sección del ancho de
    // "su bloque", y ese ancho lo mide dentro de las filas que le pasa el generador. El título del
    // registro es la ÚLTIMA fila de la banda: abajo no hay nada que mirar, así que el ancho daba 1 y
    // la línea salía de una sola columna, colgada sobre la nada arriba de una tabla de trece. Eso es
    // literalmente lo que el dueño llama "líneas marcadas que se cortan". La sección abre una tabla
    // de 13 columnas: su regla mide 13.
    { updateBorders: { range: { sheetId, startRowIndex: BANDA - 1, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: 13 }, top: { style: 'SOLID', width: 1, color: HAIR } } },
    // ═══ ANCHOS: UN RÓTULO QUE NO ENTRA EN SU COLUMNA NO SE LEE, SE ADIVINA ═══
    //
    // POR QUÉ (23/07, al VER la pestaña). Con A en 172 px el titular salía "Comprometido, no debitad"
    // —cortado a mitad de palabra, y encima es EL renglón que la pestaña existe para contestar—; con
    // el prefijo "⇒" entra todavía menos. Y con D en 76 px la columna "fecha gral" mostraba
    // "diciembre 2" y "noviembre ¿" en las CIEN filas del registro. Nada de esto levanta un error:
    // el valor de la celda está intacto, sólo que nadie lo puede leer.
    // B: 121 px dejaban el titular de 16 pt terminando a cuatro píxeles de la explicación de al lado
    // ("…$11.076.832Ya salió de tus manos"). El número que la pestaña existe para contestar necesita
    // aire propio, no encajar por poco.
    ...[[0, 205], [1, 142], [3, 108]].map(([i, px]) => ({
      updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
    })),
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)

  // Verificar: releer el número héroe y la cuenta.
  const chk = await google.readSheetValues(ID, `${PESTANA}!B6:B10`)
  console.log(`✔ ${PESTANA} · comprometido no debitado ${chk?.[0]?.[0]} · echeq ${chk?.[1]?.[0]} · físico ${chk?.[2]?.[0]} · ${chk?.[3]?.[0]} cheques · próximo ${chk?.[4]?.[0]}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
