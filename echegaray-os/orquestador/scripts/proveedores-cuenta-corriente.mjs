#!/usr/bin/env node
// EL ORIGEN DEL CUIT QUE MUESTRA LA SECCIÓN 2 — la columna derivada en Compras y su auxiliar.
//
// ESTE SCRIPT YA NO ESCRIBE LA SECCIÓN 2. La dinámica es de `proveedores-seccion2-pivot.mjs`; acá
// quedó lo que esa dinámica necesita para existir y que no puede hacer sola: el CUIT dentro de su
// ORIGEN. Un bloque, un dueño.
//
// ═══ EL CUIT, Y POR QUÉ HIZO FALTA UNA COLUMNA EN COMPRAS ═══
//
// Una dinámica sólo puede mostrar columnas de SU ORIGEN. El CUIT vivía tipeado a mano en la sección
// —22 valores que no existían en ningún otro lado— y cualquier rediseño los borraba. Ahora vive en
// `public.proveedores` (la fuente única) y llega a Compras por una columna derivada con VLOOKUP
// contra la pestaña auxiliar `_PROVEEDORES_OS`.
//
// ═══ LAS COLUMNAS SALEN DEL RÓTULO (14/09/2026) ═══
//
// Eran `COL_CUIT = 38` (AM) y `OFF = {proveedor: 4, total: 14, comercial: 35}`. Con «Obra» insertada
// en L el CUIT pasa a la AN, el Total a la P y el comercial a la AK: la corrida siguiente le habría
// escrito el VLOOKUP encima al «Saldo pendiente (OS)». La columna ya no se crea al final si falta.
//
//   node orquestador/scripts/proveedores-cuenta-corriente.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-cuenta-corriente.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { ALTO_MINIMO_AUX, COL_NOTA_AUX, ENCABEZADOS_AUX, filasDeLaAuxiliar } from '../lib/proveedores-auxiliar.mjs'
import { COMPRAS, columnasDe, lectorDeEncabezados, rangoColumna, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { columnaParaEscribir, portonDeRequests } from '../lib/compras-layout.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const AUX = '_PROVEEDORES_OS'
const PESTAÑA = 'Proveedores'
const ESCRITOR = 'proveedores-cuenta-corriente'

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/**
 * NÚCLEO PURO: la fórmula del CUIT y sus dos requests, contra la fila viva y por el portón.
 *
 * UN CUIT QUE FALTA SE ESCRIBE VACÍO, NUNCA "(falta)" (04/08): la palabra repetida decenas de veces
 * era lo más frecuente del cuadro y no informaba nada. El hueco se CUENTA en el control de carga.
 */
export function requestsDelCuit(encabezado, sheetId) {
  const col = columnaParaEscribir(encabezado, ESCRITOR, 'cuit')
  const { proveedor } = columnasDe(encabezado, { proveedor: COMPRAS.proveedor }, 'Compras')
  const e = `$${proveedor.letra}$4:$${proveedor.letra}`
  const formula = `=ARRAYFORMULA(IF(${e}="";"";IFERROR(VLOOKUP(${e};${AUX}!$A:$B;2;FALSE);"")))`
  const celda = (fila, valor) => ({ updateCells: {
    range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: col.indice, endColumnIndex: col.indice + 1 },
    rows: [{ values: [{ userEnteredValue: valor }] }], fields: 'userEnteredValue' } })
  const req = [celda(2, { stringValue: 'CUIT (OS)' }), celda(3, { formulaValue: formula })]
  return { col, formula, req: portonDeRequests(encabezado, ESCRITOR, req) }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // TODOS los proveedores con nombre, no sólo los que tienen CUIT: la auxiliar también lleva las notas.
  const { rows: proveedores } = await query(
    "select nombre, cuit from public.proveedores where trim(coalesce(nombre,'')) <> '' order by nombre")
  const { rows: notas } = await query(
    "select proveedor, nota from public.proveedor_notas where trim(coalesce(nota,'')) <> '' order by proveedor")
  const filasAux = filasDeLaAuxiliar({ proveedores, notas })
  const encabezado = await lectorDeEncabezados(google, ID).encabezado('Compras')
  const cols = columnasDe(encabezado, { proveedor: COMPRAS.proveedor, total: COMPRAS.total, comercial: COMPRAS.comercial }, 'Compras')
  const compras = await google.readSheetValues(ID, rangoFilas('Compras', 4), { render: 'UNFORMATTED_VALUE' })
  const comerciales = new Map()
  for (const f of compras ?? []) {
    const p = String(f?.[cols.proveedor.indice] ?? '').trim()
    if (!p || String(f?.[cols.comercial.indice] ?? '').trim() !== '1') continue
    const o = comerciales.get(p) ?? { n: 0, t: 0 }
    o.n += 1; o.t += Number(f?.[cols.total.indice]) || 0
    comerciales.set(p, o)
  }
  const total = [...comerciales.values()].reduce((a, x) => a + x.t, 0)

  console.log(`PROVEEDORES COMERCIALES ${comerciales.size} · COMPRADO ${plata(total)}`)
  console.log(`en la base: ${proveedores.filter((p) => p.cuit).length} con CUIT · ${notas.length} con nota`
    + ` ⇒ ${filasAux.length - 1} filas en ${AUX}`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sidProv = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const compraMeta = meta.find((s) => s.title === 'Compras')
  if (!Number.isInteger(sidProv) || !compraMeta) throw new Error('no pude resolver las pestañas: no escribo a ciegas')
  const cuit = requestsDelCuit(encabezado, compraMeta.sheetId)

  // ── 1. La pestaña auxiliar. UN SOLO DUEÑO Y LAS TRES COLUMNAS DESDE EL ARRANQUE (05/08). Es del OS.
  const ANCHO_AUX = ENCABEZADOS_AUX.length
  let aux = meta.find((s) => s.title === AUX)
  if (!aux) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: AUX, hidden: true, gridProperties: { rowCount: 500, columnCount: ANCHO_AUX } } } }], { espejo: true })
    aux = (await google.getSheetMeta(ID)).find((s) => s.title === AUX)
    console.log(`  creada la pestaña auxiliar ${AUX} (oculta)`)
  }
  const alto = Math.max(filasAux.length, ALTO_MINIMO_AUX)
  const crecer = []
  if ((aux.cols ?? 0) < ANCHO_AUX) crecer.push({ appendDimension: { sheetId: aux.sheetId, dimension: 'COLUMNS', length: ANCHO_AUX - (aux.cols ?? 0) } })
  if ((aux.rows ?? 0) < alto) crecer.push({ appendDimension: { sheetId: aux.sheetId, dimension: 'ROWS', length: alto - (aux.rows ?? 0) } })
  if (crecer.length) {
    await google.spreadsheetBatchUpdate(ID, crecer, { espejo: true })
    console.log(`  ${AUX}: grilla agrandada a ${alto} filas × ${ANCHO_AUX} columnas`)
  }
  // Las filas de más van con `null` explícito: es lo que BORRA la fila de un proveedor que ya no está.
  const vacia = () => ({ values: Array.from({ length: ANCHO_AUX }, () => ({ userEnteredValue: null })) })
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: {
    range: { sheetId: aux.sheetId, startRowIndex: 0, endRowIndex: alto, startColumnIndex: 0, endColumnIndex: ANCHO_AUX },
    rows: [
      ...filasAux.map((f) => ({ values: f.map((v) => ({ userEnteredValue: v ? { stringValue: String(v) } : null })) })),
      ...Array.from({ length: Math.max(0, alto - filasAux.length) }, vacia),
    ],
    fields: 'userEnteredValue' } }], { espejo: true })
  console.log(`  ${AUX}: ${filasAux.length - 1} proveedores con su CUIT y su nota (columna ${COL_NOTA_AUX})`)

  // ── 2. La columna derivada en Compras. UNA sola ancla con ARRAYFORMULA.
  await google.spreadsheetBatchUpdate(ID, cuit.req, { espejo: true })

  const cuitsEnCompras = (await google.readSheetValues(ID, rangoColumna('Compras', cuit.col.letra, 4), { render: 'FORMATTED_VALUE' }) ?? [])
    .filter((r) => String(r?.[0] ?? '').trim()).length
  console.log(`  Compras ${cuit.col.letra} «CUIT (OS)»: ${cuitsEnCompras} filas con CUIT resuelto`)
  console.log('\n(la dinámica de la sección 2 se escribe con proveedores-seccion2-pivot.mjs)')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
