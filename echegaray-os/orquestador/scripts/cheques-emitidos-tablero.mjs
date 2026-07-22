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

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')
const BANDA = 8 // filas de resumen que se insertan arriba del registro

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

  // ¿Ya está la banda puesta? (idempotencia): si A1 dice el eyebrow, no volver a insertar filas.
  const cab = await google.readSheetValues(ID, `${PESTANA}!A1`)
  const yaTiene = /TESORER/i.test(cab?.[0]?.[0] ?? '')
  // El encabezado del registro (TIPO|Nro|…) queda en la fila BANDA+1: si insertamos, el viejo de la
  // fila 1 baja; si la banda ya estaba, ya vive ahí.
  const HDR = BANDA + 1

  if (DRY) {
    console.log(`(--dry) ${yaTiene ? 'banda ya presente — sólo reformatea' : `inserta ${BANDA} filas de resumen`}. Encabezado del registro en fila ${HDR}.`)
    console.log('Resumen = SUMIF/COUNTIF/MINIFS sobre la columna K (DEBITADO) — 0 números pegados.')
    return
  }

  if (!yaTiene) {
    await google.spreadsheetBatchUpdate(ID, [{
      insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: BANDA }, inheritFromBefore: false },
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

  // BANDA-RESUMEN (todo fórmula). Fila 1 eyebrow · 2 título · 3 fecha · 4 hairline · 5 rótulos · 6 números.
  const filas = [
    ['ECHEGARAY CONSTRUCCIONES · TESORERÍA', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Cheques emitidos — pendientes de debitar', '', '', '', '', '', '', '', '', '', '', '', ''],
    [`Al ${hoy} · en pesos · el saldo del banco ya no los tiene descontados`, '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['COMPROMETIDO NO DEBITADO', '', '', 'CANTIDAD', '', 'PRÓXIMO A DEBITAR', '', 'ECHEQ / FÍSICO', '', '', '', '', ''],
    // PRÓXIMO A DEBITAR va como TEXTO (TEXT(...)) a propósito: esta celda vive en la columna F, que es
    // la del IMPORTE en el ledger, y CAJA suma F2:F400. Si el próximo fuera una fecha (número de serie),
    // CAJA lo sumaría como si fuera plata. Como texto, ISNUMBER=FALSO y CAJA lo saltea. Se ve igual.
    [`=${outstanding}`, '', '', `=SUMPRODUCT((UPPER(${K})<>"SI")*ISNUMBER(${F}))`, '', `=IFERROR(TEXT(MINIFS(${I};${K};"<>SI";${F};">0");"dd/mm/yy");"")`, '',
      `=IFERROR(SUMIFS(${F};${K};"NO";${A};"ECHEQ")&"  ·  "&SUMIFS(${F};${K};"NO";${A};"FISICO");"")`, '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  await google.batchUpdateValues(ID, [{ range: `${PESTANA}!A1`, values: filas }])

  // ── FORMATO: piel de statement ──────────────────────────────────────────────────────────────────
  const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, fontSize: size, italic, fontFamily: 'Arial' })
  const cell = (r, c0, c1, fmt) => ({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: fmt }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,numberFormat,backgroundColor)' } })
  const money = { type: 'NUMBER', pattern: '$#,##0' }
  const hair = (r) => ({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 13 }, bottom: { style: 'SOLID', width: 1, color: HAIR } } })

  const reqs = [
    // Sin reja: es el mayor "tell" de planilla.
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: HDR } }, fields: 'gridProperties(hideGridlines,frozenRowCount)' } },
    // Limpiar el fondo de la banda (por si heredó la barra azul).
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: 13 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } }, fields: 'userEnteredFormat.backgroundColor' } },
    cell(0, 0, 13, { textFormat: txt(MUTED, { bold: true, size: 8 }), horizontalAlignment: 'LEFT' }),
    cell(1, 0, 13, { textFormat: txt(INK, { bold: true, size: 15 }), horizontalAlignment: 'LEFT' }),
    cell(2, 0, 13, { textFormat: txt(MUTED, { size: 9, italic: true }), horizontalAlignment: 'LEFT' }),
    hair(3),
    cell(4, 0, 13, { textFormat: txt(MUTED, { bold: true, size: 8 }), horizontalAlignment: 'LEFT' }),
    // El número héroe (comprometido) en acento; el resto en tinta.
    cell(5, 0, 3, { textFormat: txt(ACENTO, { bold: true, size: 18 }), numberFormat: money, horizontalAlignment: 'LEFT' }),
    cell(5, 3, 6, { textFormat: txt(INK, { bold: true, size: 14 }), horizontalAlignment: 'LEFT' }),
    cell(5, 5, 7, { textFormat: txt(INK, { size: 11 }), numberFormat: { type: 'DATE', pattern: 'dd/mm/yy' }, horizontalAlignment: 'LEFT' }),
    cell(5, 7, 9, { textFormat: txt(INK, { size: 11 }), horizontalAlignment: 'LEFT' }),
    hair(6),
    // Encabezados del registro: versalita en tinta con hairline (sin barra azul).
    { repeatCell: { range: { sheetId, startRowIndex: HDR - 1, endRowIndex: HDR, startColumnIndex: 0, endColumnIndex: 13 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(INK, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    hair(HDR - 1),
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)

  // Verificar: releer el número héroe y la cuenta.
  const chk = await google.readSheetValues(ID, `${PESTANA}!A6:H6`)
  console.log(`✔ ${PESTANA} reformateada. Comprometido no debitado: ${chk?.[0]?.[0]} · cantidad: ${chk?.[0]?.[3]} · próximo: ${chk?.[0]?.[5]}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
