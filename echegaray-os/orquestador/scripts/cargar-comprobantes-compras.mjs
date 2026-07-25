#!/usr/bin/env node
// CARGA UN FAJO DE COMPROBANTES (fotografiados) A LA PESTAÑA "Compras" — íntegro y sin nada suelto.
//
// El OS lee cada foto y arma el JSON de entrada; este script lo escribe en Compras respetando el
// contrato de columnas (lib/carga-comprobantes.mjs): toca SÓLO las columnas del comprobante, estampa
// las fórmulas por fila copiándolas de la última fila (PASTE_FORMULA, Google ajusta las referencias)
// y NO escribe en las columnas de ARRAYFORMULA (AC/AD/AE/AF/AJ) — escribir ahí, aunque sea "",
// bloquea el derrame. Como los cruces del Sheet (Cash Flow, Proveedores, CAJA, Cheques) ya son
// fórmulas ABIERTAS sobre Compras, un comprobante bien cargado se propaga solo.
//
// FLUJO: cruza contra ARCA (duplicados) → matchea proveedor contra el desplegable estricto → asegura
// la grilla → escribe input → estampa fórmulas → verifica (sin #ERROR, totales) → reporta nuevos
// proveedores y duplicados. Después conviene: node scripts/sync-compras.mjs (→ Supabase, regla #6).
//
//   node orquestador/scripts/cargar-comprobantes-compras.mjs --file fajo.json [--dry]

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { matchProveedor, valoresInput, validar, discrepanciaNeto, GRUPOS_FORMULA } from '../lib/carga-comprobantes.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const ADD_PROV = process.argv.includes('--add-proveedores')
const fileArg = (process.argv.find((a) => a.startsWith('--file=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--file') + 1]

const idx = (l) => { let c = 0; for (const ch of l) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1 } // 'A'->0, 'AA'->26

/** Lista viva del desplegable ESTRICTO de proveedores (columna E). */
async function listaProveedores(google) {
  const sheets = await google.readSheetValidations(ID, ['Compras!E4:E12'])
  const s = (sheets || []).find((x) => /^compras$/i.test(x.properties?.title))
  for (const row of s?.data?.[0]?.rowData || []) {
    const dv = (row.values || [])[0]?.dataValidation
    if (dv?.condition?.type === 'ONE_OF_LIST') return dv.condition.values.map((v) => v.userEnteredValue)
  }
  return []
}

/** Comprobantes de ARCA para detectar duplicados: clave laxa por número y por CUIT. */
async function indiceArca() {
  const { rows } = await query('select emisor_cuit, punto_venta, numero, imp_total::float8 imp_total from comprobantes_arca').catch(() => ({ rows: [] }))
  const porNumero = new Map()
  for (const r of rows) {
    const num = String(r.numero ?? '').replace(/\D/g, '').replace(/^0+/, '')
    if (num) porNumero.set(num, r)
  }
  return { porNumero, total: rows.length }
}

async function main() {
  if (!fileArg) { console.error('Falta --file <fajo.json> (array de comprobantes parseados de las fotos)'); process.exit(1) }
  const comprobantes = JSON.parse(readFileSync(fileArg, 'utf8'))
  if (!Array.isArray(comprobantes) || !comprobantes.length) { console.error('El JSON tiene que ser un array de comprobantes no vacío'); process.exit(1) }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === 'Compras')
  const [lista, arca, colE] = await Promise.all([
    listaProveedores(google), indiceArca(), google.readSheetValues(ID, 'Compras!E1:E'),
  ])
  let ultima = 0
  colE.forEach((r, i) => { if (r[0] != null && r[0] !== '') ultima = i + 1 })

  // Preparar cada fila: validar, matchear proveedor, cruzar ARCA.
  const plan = []
  const nuevos = new Set(); const dupes = []; const rechazos = []; const percep = []
  for (const [i, c] of comprobantes.entries()) {
    const prov = matchProveedor(c.proveedor, lista)
    const cc = { ...c, proveedor: prov.valor }
    const problemas = validar(cc)
    if (problemas.length) { rechazos.push({ i, proveedor: c.proveedor, problemas }); continue }
    if (prov.esNuevo) nuevos.add(prov.valor)
    const num = String(c.numero ?? '').replace(/\D/g, '').replace(/^0+/, '')
    const enArca = num && arca.porNumero.get(num)
    if (enArca) dupes.push({ i, numero: c.numero, arcaTotal: enArca.imp_total })
    const dif = discrepanciaNeto(c)
    if (dif) percep.push({ i, proveedor: prov.valor, dif })
    plan.push({ valores: valoresInput(cc), nuevo: prov.esNuevo })
  }

  const desde = ultima + 1
  const hasta = ultima + plan.length
  console.log(`Compras: última fila con datos = ${ultima}. Se cargan ${plan.length} comprobante(s) → filas ${desde}..${hasta}.`)
  if (rechazos.length) { console.log(`\n⚠ ${rechazos.length} NO se cargan (dato insuficiente, no se inventa):`); rechazos.forEach((r) => console.log(`   #${r.i} ${r.proveedor || '(sin proveedor)'}: ${r.problemas.join('; ')}`)) }
  if (nuevos.size) console.log(`\n⚠ Proveedores NUEVOS (no están en el desplegable estricto — confirmá antes de fijarlos): ${[...nuevos].join(' · ')}`)
  if (percep.length) console.log(`\nℹ Percepción/impuesto interno absorbido en Importe (M = Total − IVA, para que el Total cierre): ${percep.map((p) => `${p.proveedor} (+$${Math.round(p.dif).toLocaleString('es-AR')})`).join(' · ')}`)
  if (dupes.length) console.log(`\nℹ Ya figuran en ARCA (posible duplicado, revisá): ${dupes.map((d) => `${d.numero} ($${Math.round(d.arcaTotal).toLocaleString('es-AR')})`).join(' · ')}`)
  if (!plan.length) { console.log('\nNada cargable.'); await closePool(); return }

  if (DRY) {
    console.log('\n(--dry) Muestra de la primera fila a escribir:')
    console.log('  ', JSON.stringify(plan[0].valores))
    console.log(`  Fórmulas a estampar por copyPaste desde la fila ${ultima}: ${GRUPOS_FORMULA.map((g) => g[0] === g[1] ? g[0] : g.join(':')).join(' ')}`)
    await closePool(); return
  }

  // Grilla: tiene que alcanzar ANTES de escribir, o el batch falla entero.
  if ((hoja.rows ?? 0) < hasta + 5) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: hasta + 20 } }, fields: 'gridProperties.rowCount' } }])
  }

  // 0) PROVEEDORES NUEVOS → al desplegable estricto (si se pidió), para que queden fijos y matcheen
  //    en la próxima carga. Se reescribe la validación de toda la columna E con la lista ampliada.
  if (ADD_PROV && nuevos.size) {
    const listaFinal = [...lista, ...nuevos]
    await google.spreadsheetBatchUpdate(ID, [{
      setDataValidation: {
        range: { sheetId: hoja.sheetId, startRowIndex: 3, endRowIndex: Math.max(hoja.rows ?? 0, hasta + 20), startColumnIndex: idx('E'), endColumnIndex: idx('E') + 1 },
        rule: { condition: { type: 'ONE_OF_LIST', values: listaFinal.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
      },
    }])
    console.log(`  + ${nuevos.size} proveedor(es) agregado(s) al desplegable: ${[...nuevos].join(' · ')}`)
  }

  // 1) VALORES de input y de imputación (obra), una columna por vez. NO toca fórmulas, derivadas
  //    (AC/AD/AE/AF/AJ) ni lo que el dueño completa aparte (Unidad de Negocio, Detalle).
  const letras = [...new Set(plan.flatMap((p) => Object.keys(p.valores)))]
  const data = letras.map((L) => ({
    range: `Compras!${L}${desde}:${L}${hasta}`,
    values: plan.map((p) => [p.valores[L] ?? '']),
  }))
  // REGLA 0 — NO APLICA, Y ESTÁ DECIDIDO: respetar: false.
  // Este cargador AGREGA filas de comprobante al final de "Compras". No escribe un solo rótulo:
  // escribe datos —CUIT, número, importe, fecha— en filas que antes no existían. No hay texto de
  // una persona debajo que se pueda pisar, porque debajo no había nada.
  await google.batchUpdateValues(ID, data)

  // 2) FÓRMULAS por fila: copiar de la última fila con datos a las nuevas (Google reajusta refs).
  const reqs = GRUPOS_FORMULA.map(([a, b]) => ({
    copyPaste: {
      source: { sheetId: hoja.sheetId, startRowIndex: ultima - 1, endRowIndex: ultima, startColumnIndex: idx(a), endColumnIndex: idx(b) + 1 },
      destination: { sheetId: hoja.sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: idx(a), endColumnIndex: idx(b) + 1 },
      pasteType: 'PASTE_FORMULA', pasteOrientation: 'NORMAL',
    },
  }))
  // EL DUEÑO TRABAJA CON UN FILTRO ACTIVO EN COMPRAS (23/07). Con un filtro puesto, copyPaste
  // revienta con "This operation is not supported on a range with a filtered out row" y, peor, el
  // batch es atómico: si tiraba la excepción, el script salía con error dejando las filas a medias.
  // Pero al AGREGAR datos debajo de columnas con fórmula consistente, Google AUTO-EXTIENDE esas
  // fórmulas por-fila solo. Entonces: si el copyPaste falla por el filtro, se verifica que la fórmula
  // clave (O = total) haya bajado sola a todas las filas nuevas. Si bajó, se sigue; si no, se falla
  // fuerte. No se toca el filtro del dueño (Regla 0: su vista es suya).
  try {
    await google.spreadsheetBatchUpdate(ID, reqs)
  } catch (e) {
    if (!/filtered out row/i.test(String(e?.message ?? e))) throw e
    const g = await google.readSheetGrid(ID, `Compras!O${desde}:O${hasta}`)
    const todasConFormula = g.filas.length === plan.length && g.filas.every((f) => f[0]?.formula)
    if (!todasConFormula) throw new Error('hay un filtro activo en Compras y la fórmula de Total (O) no se auto-extendió a todas las filas nuevas — quitá el filtro y volvé a correr')
    console.log('ℹ Compras tiene un filtro activo: copyPaste no aplica sobre filas filtradas, pero Google auto-extendió las fórmulas por fila (verificado en la columna O = Total). No se tocó tu filtro.')
  }

  // 3) VERIFICAR: releer id (A), total (O) y rubro de caja (AC) de las filas nuevas.
  const check = await google.readSheetGrid(ID, `Compras!A${desde}:AD${hasta}`)
  let errores = 0; let sinRubro = 0
  for (const f of check.filas) {
    const val = (i) => f[i]?.valor ?? ''
    if (/#(ERROR|REF|N\/A|VALUE|¿NOMBRE|NAME)/i.test([val(0), val(14), val(28)].join(' '))) errores++
    if (!val(28)) sinRubro++
  }
  console.log(`\n✔ Escritas ${plan.length} fila(s). ${errores ? `⚠ ${errores} con #ERROR — revisar.` : 'Sin #ERROR.'}`)
  if (sinRubro) console.log(`ℹ ${sinRubro} sin Rubro de caja (AC) todavía: se clasifican cuando completes la Unidad de Negocio (I).`)
  console.log('\nSIGUIENTE: node orquestador/scripts/sync-compras.mjs  (espeja a Supabase, regla #6).')
  await closePool()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
