#!/usr/bin/env node
// PESTAÑA "Cheques Recibidos" — el registro de operaciones eCHEQ que la empresa RECIBIÓ.
//
// Es el espejo de "Cheques Emitidos", del lado de lo que entra. Réplica de la pantalla del banco
// (lib/cheques-recibidos.mjs) con CORTE y ORIGEN declarados. NO suma la columna Importe —una
// operación no es un cheque— y NO incluye las Emisión (esas están en Cheques Emitidos, regla 9).
//
// El resumen por tipo son fórmulas VIVAS (CONTAR.SI/SUMAR.SI sobre el detalle de la misma pestaña):
// ni un número pegado (regla 5). El importe bruto por tipo va rotulado como "no es cartera".
//
//   node orquestador/scripts/cheques-recibidos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as CR from '../lib/cheques-recibidos.mjs'
import * as E from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = 'Cheques Recibidos'
const DRY = process.argv.includes('--dry')

/** Columnas del detalle: [encabezado, unidad de formato]. El orden es el de la pantalla del banco. */
const COLUMNAS = [
  ['N° operación', 'texto'], ['Fecha', 'fecha'], ['Hora', 'texto'], ['Operación', 'texto'],
  ['Recepción', 'texto'], ['Cheques', 'cantidad'], ['Importe', 'monedaExacta'], ['Estado', 'texto'],
  ['Qué significa para la cartera', 'texto'],
]
const ANCHO = { 0: 108, 1: 94, 2: 62, 3: 108, 4: 104, 5: 74, 6: 150, 7: 92, 8: 360 }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const ops = [...CR.OPERACIONES] // ya vienen ordenadas por fecha desc

  // ── ARMADO DE LA GRILLA ───────────────────────────────────────────────────────────────────────
  const filas = []
  const push = (r = []) => { filas.push(r); return filas.length } // devuelve el nº de fila (1-based)

  push([`CHEQUES RECIBIDOS — operaciones eCHEQ · corte ${CR.CORTE} · réplica del ${corte}`])
  push([`${CR.ORIGEN}. Cada fila es una OPERACIÓN, no un cheque: el mismo valor pasa por Aceptación → Custodia → Depósito o Endoso, así que la columna Importe NO se suma (el endoso de $20.000.000 figura dos veces el mismo día). La cartera real de HOY la manda CAJA. Las Emisión NO están acá: viven en "Cheques Emitidos" (regla 9).`])
  push([])

  // Resumen por tipo — filas reservadas; las fórmulas se llenan cuando sé dónde queda el detalle.
  const bResumen = push(['RESUMEN POR OPERACIÓN — no es cartera, es cuántas veces pasó cada estado'])
  const cabRes = push(['Operación', 'Operaciones', 'Importe bruto (no sumar entre tipos)', '', '', '', '', '', 'Qué significa'])
  const filasResumen = CR.TIPOS.map((t) => ({ tipo: t, fila: push([t, '', '', '', '', '', '', '', CR.lectura(t)]) }))
  const fTotalRes = push(['Total de operaciones', '', '', '', '', '', '', '', 'Una operación no es un cheque: este total NO es plata'])
  push([])

  // Detalle
  const bDet = push(['EL REGISTRO, OPERACIÓN POR OPERACIÓN'])
  const cabDet = push(COLUMNAS.map(([n]) => n))
  const det0 = filas.length + 1
  for (const o of ops) {
    // La hora "15:46" se escribe con apóstrofo: sin él, USER_ENTERED la coacciona a fracción de día
    // (0,6569…) y la celda de texto muestra el número. Misma trampa que un comprobante guardado como fecha.
    push([o.op, o.fecha, `'${o.hora}`, o.tipo, o.recepcionAuto ? 'Automática' : '—', o.cheques, o.importe, o.estado, CR.lectura(o.tipo)])
  }
  const det1 = filas.length
  const colOp = `$D$${det0}:$D$${det1}`   // Operación
  const colImp = `$G$${det0}:$G$${det1}`  // Importe

  // Llenar las fórmulas del resumen ahora que el detalle tiene coordenadas.
  for (const { tipo, fila } of filasResumen) {
    filas[fila - 1][1] = `=CONTAR.SI(${colOp};"${tipo}")`
    filas[fila - 1][2] = `=SUMAR.SI(${colOp};"${tipo}";${colImp})`
  }
  filas[fTotalRes - 1][1] = `=CONTARA(${colOp})`

  const ancho = COLUMNAS.length
  console.log(`${PESTAÑA}: ${ops.length} operaciones recibidas · ${filas.length} filas`)
  if (DRY) { filas.slice(0, det0 + 1).forEach((f, i) => console.log(String(i + 1).padStart(3), JSON.stringify(f))); return }

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
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }

  await google.clearValues(ID, `${PESTAÑA}!A1:Z${alto}`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A1`, values: filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r }) }])

  // ── FORMATO ───────────────────────────────────────────────────────────────────────────────────
  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, ancho + 1),
    { repeatCell: { range: rg(0, 1, 0, ancho), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, ancho), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  // Encabezados de bloque y de tabla.
  for (const f of [bResumen, bDet]) reqs.push({ repeatCell: { range: rg(f - 1, f, 0, ancho), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11, foregroundColor: E.COLOR.texto } } }, fields: 'userEnteredFormat.textFormat' } })
  for (const f of [cabRes, cabDet]) reqs.push({ repeatCell: { range: rg(f - 1, f, 0, ancho), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } })
  // Formato por columna en el detalle.
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(det0 - 1, det1, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ANCHO[j] ?? E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  // Formato del resumen: col B = cantidad, col C = moneda.
  reqs.push({ repeatCell: { range: rg(filasResumen[0].fila - 1, fTotalRes, 1, 2), cell: { userEnteredFormat: E.celda('cantidad') }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  reqs.push({ repeatCell: { range: rg(filasResumen[0].fila - 1, fTotalRes, 2, 3), cell: { userEnteredFormat: E.celda('monedaExacta') }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── VERIFICACIÓN ──────────────────────────────────────────────────────────────────────────────
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${det0}:G${det1}`)
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  const errores = v.flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  console.log(`  detalle: ${escritas}/${ops.length} operaciones escritas · ${errores} celdas en error`)
  if (escritas !== ops.length || errores) process.exitCode = 1
  else console.log('  ✓ sin celdas en error')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
