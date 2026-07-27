#!/usr/bin/env node
// "Cheques Recibidos" — LAS DOS COLUMNAS QUE FALTABAN: ¿CUÁNDO SE VUELVE PLATA ESTE CHEQUE?
//
// ═══ QUÉ HACE (T05) ═══
//
// El registro dice qué entró y qué pasó con cada valor, pero no lo MÁS importante: cuándo se cobra.
// Este script AGREGA, a la derecha del registro y sin tocar nada de lo que ya está, dos columnas:
//   · "Fecha de cobro"  — la fecha de pago del eCHEQ (desde cuándo es depositable/cobrable).
//   · "Días a vencer"   — VIVA: =Fecha de cobro − HOY. Negativo = ya vencido/cobrable (rojo). Vacía si
//                          todavía no se sabe la fecha de cobro (blank-safe, nunca 0 ni #VALUE).
//
// ═══ POR QUÉ ES UN SCRIPT APARTE Y NO SE REGENERA LA PESTAÑA ═══
//
// "Cheques Recibidos" está bajo control del dueño (candado): rediseñó el registro a mano —agregó
// Librador y CUIT (columnas F y G)— y el generador cheques-recibidos-pestana.mjs NO conoce esas
// columnas. Regenerar la pestaña las borraría. Regla de oro: el OS nunca pisa lo que hizo una persona.
// Por eso esto es ADITIVO: escribe SÓLO las dos columnas nuevas (a la derecha de "Qué significa"),
// preservando todo lo demás, y es idempotente (si las columnas ya existen, reusa su lugar).
//
// La fecha de cobro sale de lib/cheques-recibidos.mjs (`fechaPago`), que hoy la tiene sólo donde se
// pudo sourcear con evidencia (cheque 514, Mineral Del Río $290.000 → 31/07/2026, del prototipo del
// dueño en la copia del Sheet). Donde falta, la columna queda vacía y se PRESERVA lo que el dueño haya
// tipeado: es una columna de captura. No se inventa una fecha.
//
// ═══ CÓMO SE APLICA AL REAL ═══
//   1) el dueño DESCANDA "Cheques Recibidos" y toma snapshot;
//   2) node orquestador/scripts/cheques-recibidos-cobro.mjs           (o --dry para previsualizar)
//   3) el dueño revisa y vuelve a candar.
// El formato de las dos columnas se aplica siempre (el formato no está candado); los VALORES sólo se
// escriben si la pestaña está escribible (descandada y sin edición humana pendiente de firma).
//
//   Validación en la COPIA: ORQ_CASHFLOW_ID=<copia> ORQ_CR_PESTANA=CR_TEST node …/cheques-recibidos-cobro.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as CR from '../lib/cheques-recibidos.mjs'
import { escribirPreservando, letraCol } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = process.env.ORQ_CR_PESTANA || 'Cheques Recibidos'
const DRY = process.argv.includes('--dry')

const COL_COBRO = 'Fecha de cobro'
const COL_DIAS = 'Días a vencer'

// Colores del estándar statement, tomados del formato REAL del registro (mismos hairlines y tinta).
const HAIR = { red: 0.8784314, green: 0.8862745, blue: 0.9019608 }
const HEADER_BG = { red: 0.93333334, green: 0.9411765, blue: 0.9529412 }
const INK = { red: 0.12156863, green: 0.16078432, blue: 0.21568628 }
const BLANCO = { red: 1, green: 1, blue: 1 }
const borde = (color = HAIR) => ({ style: 'SOLID', width: 1, color })

/** Localiza el registro: fila de encabezado ("N° operación") y las filas de detalle (op numérica). */
function ubicarRegistro(filas) {
  const headerRow = filas.findIndex((f) => String(f?.[0] ?? '').trim() === 'N° operación')
  if (headerRow < 0) throw new Error('no encontré el encabezado "N° operación" del registro')
  const detalle = []
  for (let i = headerRow + 1; i < filas.length; i++) {
    const a = String(filas[i]?.[0] ?? '').trim()
    if (!/^\d+$/.test(a)) break
    detalle.push({ fila1: i + 1, op: a }) // fila 1-based
  }
  if (!detalle.length) throw new Error('el registro no tiene filas de detalle')
  return { headerRow1: headerRow + 1, detalle, header: filas[headerRow] }
}

/** Dónde poner las dos columnas: reusa las existentes si ya están (idempotente), si no a la derecha. */
function ubicarColumnas(header) {
  const idx = (nombre) => header.findIndex((c) => String(c ?? '').trim().toLowerCase() === nombre.toLowerCase())
  const yaCobro = idx(COL_COBRO)
  if (yaCobro >= 0) return { cobro0: yaCobro, dias0: yaCobro + 1 }
  // Primera columna vacía después del último encabezado con texto.
  let ultimo = -1
  header.forEach((c, i) => { if (String(c ?? '').trim()) ultimo = i })
  return { cobro0: ultimo + 1, dias0: ultimo + 2 }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(ID, `${PESTAÑA}!A1:Z80`)
  const { headerRow1, detalle, header } = ubicarRegistro(filas)
  const { cobro0, dias0 } = ubicarColumnas(header)
  const colCobro = letraCol(cobro0)
  const colDias = letraCol(dias0)

  // Mapa op → fecha de cobro (ISO), sólo donde hay dato con evidencia.
  const cobroDe = new Map(CR.OPERACIONES.map((o) => [String(o.op), CR.fechaCobro(o)]))

  // Grilla de DOS columnas, desde la fila de encabezado. '' = preservar lo que el dueño tipeó (la
  // fecha de cobro es una columna de captura); la fórmula de días la escribe siempre el OS (es viva).
  const grid = [[COL_COBRO, COL_DIAS]]
  for (const { fila1, op } of detalle) {
    const iso = cobroDe.get(op) || ''
    // Serial de fecha (número), no texto ISO: así se muestra dd/mm/yyyy en cualquier locale. '' = celda
    // de captura vacía → se preserva lo que el dueño haya tipeado.
    const cobro = iso ? CR.serialDeFecha(iso) : ''
    grid.push([cobro, CR.formulaDiasAVencer(colCobro, fila1)])
  }

  const conCobro = detalle.filter((d) => cobroDe.get(d.op)).length
  console.log(`${PESTAÑA}: registro en fila ${headerRow1}, ${detalle.length} operaciones · columnas ${colCobro}/${colDias} · ${conCobro} con fecha de cobro conocida`)
  if (DRY) {
    grid.forEach((r, i) => console.log(String(headerRow1 + i).padStart(3), JSON.stringify(r)))
    return
  }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no existe la pestaña "${PESTAÑA}" en ${ID}`)

  // Asegurar que la hoja tenga columnas hasta `dias0`.
  if ((hoja.cols ?? 0) <= dias0) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { columnCount: dias0 + 1 } }, fields: 'gridProperties.columnCount' } }])
  }

  // ── VALORES (guardado: no pisa una pestaña candada ni una edición humana) ──
  const res = await escribirPreservando(google, ID, `'${PESTAÑA}'`, grid, { fila0: headerRow1, col0: cobro0, anchoHoja: 2 })
  if (res.bloqueada || res.editadaPorHumano || res.reescrita) {
    console.log('  ⏸ los VALORES no se escribieron (pestaña protegida): descandá y aceptá el estado actual, después corré de nuevo. El formato sí se aplica abajo.')
  } else if (res.conservadas?.length) {
    console.log(`  ✋ ${res.conservadas.length} celda(s) de una persona — CONSERVADAS`)
  }

  // ── FORMATO (pasa siempre; el formato no está candado) ──
  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const detFin = detalle[detalle.length - 1].fila1 // 1-based última fila
  const headerFmt = {
    backgroundColor: HEADER_BG,
    borders: { bottom: borde() },
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'OVERFLOW_CELL',
    numberFormat: { type: 'TEXT' },
    textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true, foregroundColor: INK },
  }
  const dato = (numberFormat, alineacion) => ({
    backgroundColor: BLANCO,
    borders: { top: borde(), bottom: borde() },
    horizontalAlignment: alineacion,
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'CLIP',
    numberFormat,
    textFormat: { fontFamily: 'Arial', fontSize: 10, bold: false, foregroundColor: INK },
  })
  const FMT_FIELDS = 'userEnteredFormat(numberFormat,backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders,wrapStrategy)'
  const reqs = [
    // Encabezados I/J
    { repeatCell: { range: rg(headerRow1 - 1, headerRow1, cobro0, dias0 + 1), cell: { userEnteredFormat: headerFmt }, fields: FMT_FIELDS } },
    // Fecha de cobro: DATE dd/mm/yyyy, centrada (igual que la columna Fecha del registro)
    { repeatCell: { range: rg(headerRow1, detFin, cobro0, cobro0 + 1), cell: { userEnteredFormat: dato({ type: 'DATE', pattern: 'dd/mm/yyyy' }, 'CENTER') }, fields: FMT_FIELDS } },
    // Días a vencer: número entero, negativos en ROJO, vacío cuando no hay fecha
    { repeatCell: { range: rg(headerRow1, detFin, dias0, dias0 + 1), cell: { userEnteredFormat: dato({ type: 'NUMBER', pattern: '0;[Red]-0;"—"' }, 'CENTER') }, fields: FMT_FIELDS } },
    // Anchos
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: cobro0, endIndex: cobro0 + 1 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: dias0, endIndex: dias0 + 1 }, properties: { pixelSize: 96 }, fields: 'pixelSize' } },
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── VERIFICACIÓN ──
  const check = await google.readSheetValues(ID, `${PESTAÑA}!${colCobro}${headerRow1}:${colDias}${detFin}`)
  const errores = check.flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  console.log(`  columnas ${colCobro}/${colDias} escritas hasta la fila ${detFin} · ${errores} celdas en error`)
  if (errores) process.exitCode = 1
  else console.log('  ✓ sin celdas en error')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
