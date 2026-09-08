#!/usr/bin/env node
// RETIRA DE «Compras» LAS FILAS QUE EL DUEÑO MARCÓ «Cancelado» PORQUE EL CONCEPTO YA SALE POR OTRA PESTAÑA.
//
// Orden del dueño (08/09/2026): quitar de Compras los conceptos de salarios, cargas, gremiales, impuestos
// y banco que ya están contemplados en otra pestaña. A la mañana se marcaron «Cancelado» con el motivo en
// la fila («sale por Jornales por Quincena» / «sale por Cargas Sociales»); acá se archivan y se borran.
//
// QUÉ HACE, EN ORDEN — y cada paso verifica el EFECTO antes del siguiente:
//   1. Lee Compras y elige SÓLO las filas con Estado = «Cancelado» y motivo «sale por …». Nada más.
//   2. Copia la fila entera (A→AN, valores) a `_COMPRAS_RETIRADAS` + Fila original · Motivo · Cubierta
//      por · Retirada el. Crea la pestaña si no existe. Relee y compara conteo y suma de Total.
//   3. Recién entonces BORRA las filas (deleteDimension, tramos contiguos, de abajo hacia arriba).
//      Compras es pestaña del dueño y esto es una edición de datos que él ordenó: la guarda por celda
//      se salta con `yaGuardado`, a propósito y sólo acá. El congelador NO se salta: si está puesto, aborta.
//   4. Relee Compras: conteo −N, ninguna Cancelada con motivo, y las ARRAYFORMULA (AB..AN) siguen vivas.
//
// QUÉ HACE CON LAS EDICIONES DEL DUEÑO (Regla 0), declarado y no heredado:
//   · `_COMPRAS_RETIRADAS` — la crea este script, está oculta y sólo se le APENDAN filas. No hay
//     rótulo de una persona que preservar, así que no pasa por `escribirPreservando`. La exención
//     está declarada en `lib/regla-cero-obligatoria.test.mjs` y ese test COMPRUEBA que todas las
//     escrituras de valores de este archivo apunten acá: si una apuntara a otra pestaña, da rojo.
//   · Compras — no se le escribe un solo valor: se le BORRAN filas (`deleteDimension`), que es la
//     edición de datos que el dueño ordenó. La guarda por celda se saltea con `yaGuardado`, a
//     propósito y sólo acá; el congelador NO se saltea.
//   · `_COMPRAS_RETIRADAS` NO es un paso del pipeline: es un archivo de una sola vez y envejecer es
//     su trabajo. Por eso está en `SIN_GENERADOR`, no en `PASOS`.
//
// Lo que NO hace: no toca AC/AD/AE/AF/AJ, no regenera nada (libro, vistas y CAJA se corren después,
// por separado, y se comparan contra la foto previa), no decide qué está «cubierto» —eso lo decidió el
// dueño al marcar la fila.
//
//   node orquestador/scripts/compras-retirar-canceladas.mjs            # dry: lista y no escribe
//   node orquestador/scripts/compras-retirar-canceladas.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { accessTokenFor } from '../lib/google-oauth.mjs'
import { indiceDe } from '../lib/comprobantes/contrato-columnas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const CUENTA = 'jorge@ecsas.com.ar'
const APLICAR = process.argv.includes('--aplicar')
const HOY = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ARCHIVO = '_COMPRAS_RETIRADAS'
const EXTRA = ['Fila original', 'Motivo', 'Cubierta por', 'Retirada el']
const FILA_ENCABEZADO = 3
const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** NÚCLEO PURO: ¿esta fila es una Cancelada con motivo «sale por …»? Devuelve el motivo o null. */
export function motivoDeRetiro(fila, ix) {
  const estado = String(fila[ix.X] ?? '').trim()
  if (!/^cancelado$/i.test(estado)) return null
  const texto = [fila[ix.K], fila[ix.L]].map((x) => String(x ?? '')).join(' · ')
  const m = texto.match(/sale por ([^·]+)/i)
  return m ? m[1].trim() : null
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

const lector = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ix = Object.fromEntries(['K', 'L', 'O', 'X'].map((l) => [l, indiceDe(l)]))
const enc = (await lector.readSheetValues(ID, `Compras!A${FILA_ENCABEZADO}:AN${FILA_ENCABEZADO}`))[0]
const raw = await lector.readSheetValues(ID, `Compras!A${FILA_ENCABEZADO + 1}:AN6000`, { render: 'UNFORMATTED_VALUE' })
const fmt = await lector.readSheetValues(ID, `Compras!A${FILA_ENCABEZADO + 1}:AN6000`, { render: 'FORMATTED_VALUE' })
const antes = raw.filter((r) => r.length && String(r[2] ?? '') !== '').length

const elegidas = []
for (const [i, r] of raw.entries()) {
  const motivo = motivoDeRetiro(r, ix)
  if (!motivo) continue
  const fila = i + FILA_ENCABEZADO + 1
  // La fila archivada lleva VALORES: número donde hay número, y el texto tal como se ve donde el valor
  // crudo es un serial de fecha (así el archivo se lee sin formato heredado). Las fórmulas no viajan.
  const valores = enc.map((_, c) => {
    const v = r[c], f = fmt[i]?.[c]
    if (typeof v === 'number' && /^\d{2}\/\d{2}\/\d{4}$/.test(String(f ?? ''))) return f
    return v ?? ''
  })
  elegidas.push({ fila, motivo, total: Number(r[ix.O]) || 0, valores: [...valores, fila, motivo, motivo, HOY] })
}
const total = elegidas.reduce((a, e) => a + e.total, 0)
console.log(`Compras: ${antes} filas con fecha · ${elegidas.length} Cancelada(s) con motivo · Total ${$(total)}`)
for (const e of elegidas) console.log(`  f${e.fila} · ${e.valores[4]} · ${e.valores[10]} · ${$(e.total)} · ${e.motivo}`)
const porMotivo = new Map(); for (const e of elegidas) porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + 1)
console.log('Por cubierta:', [...porMotivo].map(([k, n]) => `${k}=${n}`).join(' · '))
if (!elegidas.length) { console.log('Nada que retirar.'); process.exit(0) }
if (!APLICAR) { console.log('\n(dry) Nada escrito. Correr con --aplicar.'); process.exit(0) }

const gw = makeGoogleClient({ auth: { getAccessToken: () => accessTokenFor(CUENTA) } })
const meta = await gw.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=sheets.properties`)
const hojaCompras = meta.sheets.find((s) => s.properties.title === 'Compras')?.properties
if (!hojaCompras) throw new Error('no existe la pestaña Compras')
const abortaSi = (res, paso) => {
  if (res?.protegido || res?.congelado || res?.frenados?.length) throw new Error(`${paso}: la escritura no pasó — ${JSON.stringify(res).slice(0, 300)}`)
}

// 2. ARCHIVO
let hojaArchivo = meta.sheets.find((s) => s.properties.title === ARCHIVO)?.properties
if (!hojaArchivo) {
  const r = await gw.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: ARCHIVO, hidden: true, gridProperties: { rowCount: 200, columnCount: enc.length + EXTRA.length, frozenRowCount: 1 } } } }], { yaGuardado: true })
  abortaSi(r, 'crear archivo')
  hojaArchivo = r.replies?.[0]?.addSheet?.properties
  const w = await gw.updateSheetValues(ID, `'${ARCHIVO}'!A1`, [[...enc, ...EXTRA]], { yaGuardado: true })
  abortaSi(w, 'encabezado archivo')
}
const yaArchivadas = (await lector.readSheetValues(ID, `'${ARCHIVO}'!A1:AR5000`, { render: 'UNFORMATTED_VALUE' })).filter((r) => r.length && r[0] !== '')
const w2 = await gw.appendSheetValues(ID, `'${ARCHIVO}'!A1`, elegidas.map((e) => e.valores), { yaGuardado: true })
abortaSi(w2, 'append archivo')
const releidas = (await lector.readSheetValues(ID, `'${ARCHIVO}'!A1:AR5000`, { render: 'UNFORMATTED_VALUE' })).filter((r) => r.length && r[0] !== '')
const nuevas = releidas.slice(yaArchivadas.length)
const sumaArchivo = nuevas.reduce((a, r) => a + (Number(r[ix.O]) || 0), 0)
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
const despues = await lector.readSheetValues(ID, `Compras!A${FILA_ENCABEZADO + 1}:AN6000`, { render: 'UNFORMATTED_VALUE' })
const conFecha = despues.filter((r) => r.length && String(r[2] ?? '') !== '').length
const quedan = despues.filter((r) => motivoDeRetiro(r, ix)).length
const arrayVivas = despues.slice(0, 50).filter((r) => String(r[indiceDe('AC')] ?? '') !== '').length
console.log(`Compras después: ${conFecha} filas con fecha (antes ${antes}, Δ ${conFecha - antes}) · Canceladas con motivo que quedan: ${quedan} · AC viva en ${arrayVivas}/50 primeras filas`)
if (conFecha !== antes - elegidas.length || quedan !== 0 || arrayVivas < 40) { console.error('✖ la relectura no cierra'); process.exit(1) }
console.log('✓ retiro cerrado en el Sheet. Ahora: libro → vistas → CAJA → sync-compras.')
