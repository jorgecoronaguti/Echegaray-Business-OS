#!/usr/bin/env node
// RETIRA DE «Compras» LAS FILAS QUE EL DUEÑO MARCÓ «Cancelado» PORQUE EL CONCEPTO YA SALE POR OTRA PESTAÑA.
//
// Orden del dueño (08/09/2026): quitar de Compras los conceptos de salarios, cargas, gremiales, impuestos
// y banco que ya están contemplados en otra pestaña. A la mañana se marcaron «Cancelado» con el motivo en
// la fila («sale por Jornales por Quincena» / «sale por Cargas Sociales»); acá se archivan y se borran.
//
// QUÉ HACE, EN ORDEN — y cada paso verifica el EFECTO antes del siguiente:
//   1. Lee Compras y elige SÓLO las filas con Estado = «Cancelado» y motivo «sale por …». Nada más.
//   2. Copia la fila entera (valores) a `_COMPRAS_RETIRADAS` + Fila original · Motivo · Cubierta
//      por · Retirada el. Crea la pestaña si no existe. Relee y compara conteo y suma de Total.
//   3. Recién entonces BORRA las filas (deleteDimension, tramos contiguos, de abajo hacia arriba).
//      Compras es pestaña del dueño y esto es una edición de datos que él ordenó: la guarda por celda
//      se salta con `yaGuardado`, a propósito y sólo acá. El congelador NO se salta: si está puesto, aborta.
//   4. Relee Compras: conteo −N, ninguna Cancelada con motivo, y la ARRAYFORMULA del rubro sigue viva.
//
// QUÉ HACE CON LAS EDICIONES DEL DUEÑO (Regla 0), declarado y no heredado:
//   · `_COMPRAS_RETIRADAS` — la crea este script, está oculta y sólo se le APENDAN filas. La exención
//     está declarada en `lib/regla-cero-obligatoria.test.mjs` y ese test COMPRUEBA que todas las
//     escrituras de valores de este archivo apunten acá: si una apuntara a otra pestaña, da rojo.
//   · Compras — no se le escribe un solo valor: se le BORRAN filas (`deleteDimension`).
//   · `_COMPRAS_RETIRADAS` NO es un paso del pipeline: es un archivo de una sola vez.
//
// ═══ LAS COLUMNAS SALEN DEL RÓTULO (14/09/2026) ═══
//
// Leía K/L/O/X por letra y hasta la AN. Con «Obra» insertada en L el motivo se buscaba en «Obra» en vez
// de en «Concepto» y el Total en el IVA. Además, el archivo guarda filas ENTERAS bajo la fila de rótulos
// con la que se creó: si esa fila no coincide con la de Compras hoy, apendar mezclaría dos layouts en
// las mismas columnas. Se aborta y se dice, en vez de archivar corrido.
//
// Lo que NO hace: no toca las columnas del dueño, no regenera nada, no decide qué está «cubierto».
//
//   node orquestador/scripts/compras-retirar-canceladas.mjs            # dry: lista y no escribe
//   node orquestador/scripts/compras-retirar-canceladas.mjs --aplicar

import { COMPRAS, columnasDe, rangoEncabezado, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { normalizarRotulo } from '../lib/compras-columnas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const CUENTA = 'jorge@ecsas.com.ar'
const APLICAR = process.argv.includes('--aplicar')
const HOY = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ARCHIVO = '_COMPRAS_RETIRADAS'
const EXTRA = ['Fila original', 'Motivo', 'Cubierta por', 'Retirada el']
const FILA_ENCABEZADO = 3
const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** Las columnas que el retiro mira, por rótulo. */
export const columnasDelRetiro = (encabezado) => columnasDe(encabezado, {
  detalle: COMPRAS.detalle, concepto: COMPRAS.concepto, total: COMPRAS.total, estado: COMPRAS.estado, rubro: COMPRAS.rubro,
}, 'Compras')

/** NÚCLEO PURO: ¿esta fila es una Cancelada con motivo «sale por …»? Devuelve el motivo o null. */
export function motivoDeRetiro(fila, cols) {
  const estado = String(fila[cols.estado.indice] ?? '').trim()
  if (!/^cancelado$/i.test(estado)) return null
  const texto = [fila[cols.detalle.indice], fila[cols.concepto.indice]].map((x) => String(x ?? '')).join(' · ')
  const m = texto.match(/sale por ([^·]+)/i)
  return m ? m[1].trim() : null
}

/** NÚCLEO PURO: ¿el archivo tiene la misma fila de rótulos que Compras hoy? Un archivo nuevo, sí. */
export function mismoLayout(encabezadoArchivo = [], encabezado = []) {
  if (!encabezadoArchivo.length) return true
  return encabezado.every((r, i) => normalizarRotulo(r) === normalizarRotulo(encabezadoArchivo[i]))
}

/** NÚCLEO PURO: filas 1-based → tramos [start,end) 0-based, de abajo hacia arriba. */
export function tramosDescendentes(filas) {
  const s = [...new Set(filas)].sort((a, b) => a - b)
  const tramos = []
  for (const f of s) {
    const u = tramos.at(-1)
    if (u && u.endIndex === f - 1) u.endIndex = f
    else tramos.push({ startIndex: f - 1, endIndex: f })
  }
  return tramos.reverse()
}

async function main() {
  const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const { accessTokenFor } = await import('../lib/google-oauth.mjs')
  const lector = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const enc = (await lector.readSheetValues(ID, rangoEncabezado('Compras')))[0]
  const cols = columnasDelRetiro(enc)
  const DATOS = rangoFilas('Compras', FILA_ENCABEZADO + 1, 6000)
  const raw = await lector.readSheetValues(ID, DATOS, { render: 'UNFORMATTED_VALUE' })
  const fmt = await lector.readSheetValues(ID, DATOS, { render: 'FORMATTED_VALUE' })
  const conFecha = (filas) => filas.filter((r) => r.length && String(r[2] ?? '') !== '').length
  const antes = conFecha(raw)

  const elegidas = []
  for (const [i, r] of raw.entries()) {
    const motivo = motivoDeRetiro(r, cols)
    if (!motivo) continue
    const fila = i + FILA_ENCABEZADO + 1
    // La fila archivada lleva VALORES: número donde hay número, y el texto tal como se ve donde el valor
    // crudo es un serial de fecha (así el archivo se lee sin formato heredado). Las fórmulas no viajan.
    const valores = enc.map((_, c) => {
      const v = r[c], f = fmt[i]?.[c]
      if (typeof v === 'number' && /^\d{2}\/\d{2}\/\d{4}$/.test(String(f ?? ''))) return f
      return v ?? ''
    })
    elegidas.push({ fila, motivo, total: Number(r[cols.total.indice]) || 0, valores: [...valores, fila, motivo, motivo, HOY] })
  }
  const total = elegidas.reduce((a, e) => a + e.total, 0)
  console.log(`Compras: ${antes} filas con fecha · ${elegidas.length} Cancelada(s) con motivo · Total ${$(total)}`)
  for (const e of elegidas) console.log(`  f${e.fila} · ${e.valores[4]} · ${e.valores[cols.detalle.indice]} · ${$(e.total)} · ${e.motivo}`)
  if (!elegidas.length) { console.log('Nada que retirar.'); return }
  if (!APLICAR) { console.log('\n(dry) Nada escrito. Correr con --aplicar.'); return }

  const gw = makeGoogleClient({ auth: { getAccessToken: () => accessTokenFor(CUENTA) } })
  const meta = await gw.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=sheets.properties`)
  const hojaCompras = meta.sheets.find((s) => s.properties.title === 'Compras')?.properties
  if (!hojaCompras) throw new Error('no existe la pestaña Compras')
  const abortaSi = (res, paso) => {
    if (res?.protegido || res?.congelado || res?.frenados?.length) throw new Error(`${paso}: la escritura no pasó — ${JSON.stringify(res).slice(0, 300)}`)
  }

  // 2. ARCHIVO
  const hojaArchivo = meta.sheets.find((s) => s.properties.title === ARCHIVO)?.properties
  const RANGO_ARCHIVO = `'${ARCHIVO}'!A1:BZ5000`
  if (!hojaArchivo) {
    const r = await gw.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: ARCHIVO, hidden: true, gridProperties: { rowCount: 200, columnCount: enc.length + EXTRA.length, frozenRowCount: 1 } } } }], { yaGuardado: true })
    abortaSi(r, 'crear archivo')
    const w = await gw.updateSheetValues(ID, `'${ARCHIVO}'!A1`, [[...enc, ...EXTRA]], { yaGuardado: true })
    abortaSi(w, 'encabezado archivo')
  }
  const yaArchivadas = (await lector.readSheetValues(ID, RANGO_ARCHIVO, { render: 'UNFORMATTED_VALUE' })).filter((r) => r.length && r[0] !== '')
  if (!mismoLayout(yaArchivadas[0] ?? [], enc)) {
    throw new Error(`${ARCHIVO} tiene la fila de rótulos de otro layout de Compras: apendar mezclaría columnas. NO archivo ni borro nada — decidí si el archivo recibe la columna nueva.`)
  }
  const w2 = await gw.appendSheetValues(ID, `'${ARCHIVO}'!A1`, elegidas.map((e) => e.valores), { yaGuardado: true })
  abortaSi(w2, 'append archivo')
  const releidas = (await lector.readSheetValues(ID, RANGO_ARCHIVO, { render: 'UNFORMATTED_VALUE' })).filter((r) => r.length && r[0] !== '')
  const nuevas = releidas.slice(yaArchivadas.length)
  const sumaArchivo = nuevas.reduce((a, r) => a + (Number(r[cols.total.indice]) || 0), 0)
  if (nuevas.length !== elegidas.length || Math.abs(sumaArchivo - total) > 0.5) {
    throw new Error(`el archivo no refleja lo elegido: ${nuevas.length} filas / ${$(sumaArchivo)} vs ${elegidas.length} / ${$(total)} — NO borro nada`)
  }
  console.log(`✓ ${ARCHIVO}: +${nuevas.length} filas, Total ${$(sumaArchivo)} (releído)`)

  // 3. BORRAR
  const tramos = tramosDescendentes(elegidas.map((e) => e.fila))
  const r3 = await gw.spreadsheetBatchUpdate(ID, tramos.map((t) => ({ deleteDimension: { range: { sheetId: hojaCompras.sheetId, dimension: 'ROWS', ...t } } })), { yaGuardado: true })
  abortaSi(r3, 'borrar filas')
  console.log(`✓ borrados ${tramos.length} tramo(s): ${tramos.map((t) => `${t.startIndex + 1}-${t.endIndex}`).join(', ')}`)

  // 4. RELEER
  const despues = await lector.readSheetValues(ID, DATOS, { render: 'UNFORMATTED_VALUE' })
  const quedan = despues.filter((r) => motivoDeRetiro(r, cols)).length
  const arrayVivas = despues.slice(0, 50).filter((r) => String(r[cols.rubro.indice] ?? '') !== '').length
  console.log(`Compras después: ${conFecha(despues)} filas con fecha (antes ${antes}, Δ ${conFecha(despues) - antes}) · Canceladas con motivo que quedan: ${quedan} · rubro vivo en ${arrayVivas}/50 primeras filas`)
  if (conFecha(despues) !== antes - elegidas.length || quedan !== 0 || arrayVivas < 40) { console.error('✖ la relectura no cierra'); process.exitCode = 1; return }
  console.log('✓ retiro cerrado en el Sheet. Ahora: libro → vistas → CAJA → sync-compras.')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
