#!/usr/bin/env node
// PESTAÑA "Cheques Recibidos" — el registro de operaciones eCHEQ que la empresa RECIBIÓ.
//
// Es el espejo de "Cheques Emitidos", del lado de lo que entra. Réplica de la pantalla del banco
// (lib/cheques-recibidos.mjs) con CORTE y ORIGEN declarados. NO suma la columna Importe entre filas
// —una operación no es un cheque— y NO incluye las Emisión (esas están en Cheques Emitidos, regla 9).
//
// PIEL DE STATEMENT (como Impuestos y Proveedores, "como se vería en JPMorgan"): reja apagada, fondo
// blanco, sin barras de color; la estructura se marca con tipografía (tinta INK, versalita apagada
// MUTED) y líneas finas (HAIR). Menos es más: se quitaron las columnas Hora, Estado (todas
// "Aceptada") y Recepción, que no cambiaban ninguna decisión. Ver lib/estilo-statement.mjs.
//
//   node orquestador/scripts/cheques-recibidos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as CR from '../lib/cheques-recibidos.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { skinRequests, INK, MUTED } from '../lib/estilo-statement.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = 'Cheques Recibidos'
const DRY = process.argv.includes('--dry')

/** Columnas del detalle: [encabezado, unidad de formato]. Mínimas, en el orden en que se lee. */
const COLUMNAS = [
  ['N° operación', 'texto'], ['Fecha', 'fecha'], ['Operación', 'texto'],
  ['Cheques', 'cantidad'], ['Importe', 'monedaExacta'], ['Qué significa para la cartera', 'texto'],
]
const ANCHO = { 0: 116, 1: 100, 2: 116, 3: 78, 4: 158, 5: 420 }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ops = [...CR.OPERACIONES] // ya vienen ordenadas por fecha desc
  const ancho = COLUMNAS.length

  const filas = []
  const push = (r = []) => { filas.push(r); return filas.length } // nº de fila (1-based)

  push(['Cheques recibidos'])
  push([`Operaciones eCHEQ recibidas · Santander · corte ${CR.CORTE}. Registro auditable: cada fila es una operación, no un cheque —un valor pasa por Aceptación → Custodia → Depósito o Endoso—, así que el Importe no se suma entre filas. La cartera vigente HOY la manda CAJA. Las emitidas viven en "Cheques Emitidos".`])
  push([])

  // ── 1 · ACTIVIDAD: cuántas veces pasó cada estado. Conteos por fórmula viva (0 pegados). NO se
  //        muestra un importe por tipo: el mismo valor aparece como Aceptación Y Custodia, así que
  //        cualquier suma alarma sin decir nada. La plata real va por fila abajo y la cartera en CAJA.
  push(['1 · ACTIVIDAD RECIBIDA — ¿QUÉ PASÓ CON LOS VALORES QUE ENTRARON?'])
  push(['Tipo', 'Operaciones', 'Qué significa'])
  const filasResumen = CR.TIPOS.map((t) => ({ tipo: t, fila: push([t, '', CR.lectura(t)]) }))
  const fTotalRes = push(['⇒ Total de operaciones', '', 'Una operación no es un cheque: la cartera vigente HOY la manda CAJA'])
  push([])

  // ── 2 · EL REGISTRO, operación por operación ────────────────────────────────────────────────────
  push(['2 · EL REGISTRO, OPERACIÓN POR OPERACIÓN'])
  push(COLUMNAS.map(([n]) => n))
  const det0 = filas.length + 1
  for (const o of ops) push([o.op, o.fecha, o.tipo, o.cheques, o.importe, CR.lectura(o.tipo)])
  const det1 = filas.length
  const colTipo = `$C$${det0}:$C$${det1}`

  for (const { tipo, fila } of filasResumen) filas[fila - 1][1] = `=CONTAR.SI(${colTipo};"${tipo}")`
  filas[fTotalRes - 1][1] = `=CONTARA(${colTipo})`

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
  await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto, columnCount: Math.max(ancho + 1, hoja.cols ?? 0) } }, fields: 'gridProperties(rowCount,columnCount)' } }])

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
  // La piel statement resuelve título, secciones (MAYÚSCULAS), encabezados (Tipo/N°/Fecha), totales
  // (⇒), reja apagada, fondo blanco y hairlines a partir del contenido escrito.
  const reqs = skinRequests({ sheetId: hoja.sheetId, filas, cols: ancho, congeladas: 2 })
  // La nota bajo el título: gris apagado, chica.
  reqs.push({ repeatCell: { range: rg(1, 2, 0, ancho), cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: MUTED }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } })
  reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })
  // Formato de número por columna en el detalle + alto de fila parejo.
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(det0 - 1, det1, j, j + 1), cell: { userEnteredFormat: E.celda(unidad, { color: INK }) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ANCHO[j] ?? E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  // El resumen: col B = cantidad de operaciones (entero), alineada a la derecha.
  reqs.push({ repeatCell: { range: rg(filasResumen[0].fila - 1, fTotalRes, 1, 2), cell: { userEnteredFormat: E.celda('cantidad', { color: INK }) }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── VERIFICACIÓN ──────────────────────────────────────────────────────────────────────────────
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${det0}:E${det1}`)
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  const errores = v.flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  console.log(`  detalle: ${escritas}/${ops.length} operaciones · ${errores} celdas en error · piel statement aplicada`)
  if (escritas !== ops.length || errores) process.exitCode = 1
  else console.log('  ✓ sin celdas en error')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
