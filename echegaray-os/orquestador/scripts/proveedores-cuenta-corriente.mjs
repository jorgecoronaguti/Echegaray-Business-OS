#!/usr/bin/env node
// EL ORIGEN DEL CUIT QUE MUESTRA LA SECCIÓN 2 — la columna derivada en Compras y su auxiliar.
//
// ESTE SCRIPT YA NO ESCRIBE LA SECCIÓN 2. La dinámica es de `proveedores-seccion2-pivot.mjs`; acá
// quedó lo que esa dinámica necesita para existir y que no puede hacer sola: el CUIT dentro de su
// ORIGEN. Un bloque, un dueño — el encabezado decía otra cosa y un encabezado que miente sobre lo
// que hace el archivo es cómo vuelven los dos dueños.
//
// ═══ EL CUIT, Y POR QUÉ HIZO FALTA UNA COLUMNA EN COMPRAS ═══
//
// Una dinámica sólo puede mostrar columnas de SU ORIGEN. El CUIT no estaba en Compras: vivía tipeado
// a mano en esta misma sección —22 valores que no existían en ningún otro lado— y por eso cualquier
// rediseño los borraba. Ahora viven en `public.proveedores` (la fuente única) y llegan a Compras por
// una columna derivada con VLOOKUP contra la pestaña auxiliar `_PROVEEDORES_OS`.
//
// Con el CUIT en el origen, el pivot lo lleva como segundo campo de fila: cada proveedor tiene uno
// solo, así que no agrupa nada y no deja ninguna celda en blanco.
//
//   node orquestador/scripts/proveedores-cuenta-corriente.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-cuenta-corriente.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const AUX = '_PROVEEDORES_OS'
const PESTAÑA = 'Proveedores'
/** La columna derivada del CUIT en Compras. Va después de todo lo que hay: no desplaza nada. */
const COL_CUIT = 38 // índice 0 = A ⇒ 38 = AM
const OFF = Object.freeze({ proveedor: 4, total: 14, comercial: 35 })

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const conGuiones = (c) => {
  const d = String(c ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(c ?? '')
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const { rows: proveedores } = await query(
    'select nombre, cuit from public.proveedores where cuit is not null and trim(nombre) <> \'\' order by nombre')
  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const comerciales = new Map()
  for (const f of compras ?? []) {
    const p = String(f?.[OFF.proveedor] ?? '').trim()
    if (!p || String(f?.[OFF.comercial] ?? '').trim() !== '1') continue
    const o = comerciales.get(p) ?? { n: 0, t: 0 }
    o.n += 1; o.t += Number(f?.[OFF.total]) || 0
    comerciales.set(p, o)
  }
  const total = [...comerciales.values()].reduce((a, x) => a + x.t, 0)

  console.log(`PROVEEDORES COMERCIALES ${comerciales.size} · COMPRADO ${plata(total)}`)
  console.log(`CUIT en la base: ${proveedores.length}`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sidProv = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const compraMeta = meta.find((s) => s.title === 'Compras')
  if (!Number.isInteger(sidProv) || !compraMeta) throw new Error('no pude resolver las pestañas: no escribo a ciegas')

  // ── 1. La pestaña auxiliar con los CUIT de la base. Se rehace entera: es del OS, no del dueño.
  let aux = meta.find((s) => s.title === AUX)
  if (!aux) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: AUX, hidden: true, gridProperties: { rowCount: 500, columnCount: 2 } } } }], { espejo: true })
    aux = (await google.getSheetMeta(ID)).find((s) => s.title === AUX)
    console.log(`  creada la pestaña auxiliar ${AUX} (oculta)`)
  }
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: {
    range: { sheetId: aux.sheetId, startRowIndex: 0, endRowIndex: Math.max(proveedores.length + 1, 200), startColumnIndex: 0, endColumnIndex: 2 },
    rows: [
      { values: [{ userEnteredValue: { stringValue: 'Proveedor' } }, { userEnteredValue: { stringValue: 'CUIT' } }] },
      ...proveedores.map((p) => ({ values: [
        { userEnteredValue: { stringValue: p.nombre } },
        { userEnteredValue: { stringValue: conGuiones(p.cuit) } },
      ] })),
      ...Array.from({ length: Math.max(0, 199 - proveedores.length) }, () => ({ values: [{ userEnteredValue: null }, { userEnteredValue: null }] })),
    ],
    fields: 'userEnteredValue' } }], { espejo: true })
  console.log(`  ${AUX}: ${proveedores.length} CUIT escritos desde public.proveedores`)

  // ── 2. La columna derivada en Compras. UNA sola ancla con ARRAYFORMULA: escribir el derrame
  // rompería la fórmula, y escribir en una columna que ya existe pisaría datos del dueño.
  if (compraMeta.cols <= COL_CUIT) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: {
      sheetId: compraMeta.sheetId, dimension: 'COLUMNS', length: COL_CUIT + 1 - compraMeta.cols } }], { espejo: true })
    console.log(`  Compras: agregada(s) ${COL_CUIT + 1 - compraMeta.cols} columna(s) al final para el CUIT`)
  }
  // ═══ UN CUIT QUE FALTA SE ESCRIBE VACÍO, NUNCA "(falta)" (04/08) ═══
  //
  // En el archivo vivo esta fórmula tenía `"(falta)"` como valor de respaldo, y el resultado era una
  // columna de la cuenta corriente con "(falta)" repetido decenas de veces: la palabra más frecuente
  // de todo el cuadro. Un rótulo que se repite en la mayoría de las filas deja de informar y pasa a
  // ser ruido — y encima corre el ojo hacia la única columna que no decide nada.
  //
  // El hueco no se tapa ni se disimula: se CUENTA. Cuántos proveedores comerciales no tienen CUIT es
  // una línea del control de carga de la sección 5, donde se puede accionar. Sesenta etiquetas no
  // dicen más que un número, dicen menos.
  const formula = `=ARRAYFORMULA(IF($E$4:$E="";"";IFERROR(VLOOKUP($E$4:$E;${AUX}!$A:$B;2;FALSE);"")))`
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId: compraMeta.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: COL_CUIT, endColumnIndex: COL_CUIT + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'CUIT (OS)' } }] }], fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId: compraMeta.sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: COL_CUIT, endColumnIndex: COL_CUIT + 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }], fields: 'userEnteredValue' } },
  ], { espejo: true })

  const cuitsEnCompras = (await google.readSheetValues(ID, 'Compras!AM4:AM', { render: 'FORMATTED_VALUE' }) ?? [])
    .filter((r) => String(r?.[0] ?? '').trim()).length
  console.log(`  Compras!AM: ${cuitsEnCompras} filas con CUIT resuelto`)
  console.log('\n(la dinámica de la sección 2 se escribe con proveedores-seccion2-pivot.mjs)')
}

main().catch((e) => { console.error(e); process.exit(1) })
