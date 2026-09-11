// MARCAR ELIMINADO EN COMPRAS — el bisturí que aplica una orden del dueño fila por fila.
//
// POR QUÉ (11/09/2026). El dueño: «de la pestaña Compras, marcá como ELIMINADO todos los conceptos
// que no sean gastos de Estructura, Mantenimiento o Civil: todo debe estar contemplado, pasado y
// futuro, en las pestañas que corresponden». La marca es la SUYA, leída de las seis filas que él ya
// había eliminado (f458, f467-469, f612, f715): la columna X dice «ELIMINADO» y el importe queda en
// cero. El cero no es cosmético: CAJA suma Compras por SUMIFS sin mirar X, y `sync-compras` tampoco
// filtra anuladas para `costos_obra`. Una fila con X=ELIMINADO y O=4.500.000 seguiría contando.
//
// LO QUE ESTE SCRIPT NO DECIDE: qué filas. Recibe una lista (`--lista archivo.json`) que salió de un
// análisis con el libro `_MOVIMIENTOS` a la vista (ver docs/engineering/COMPRAS-LIMPIEZA-2026-09-11.md)
// y la aplica. Cada fila de la lista trae su HUELLA —id de A, fecha, proveedor, cliente, importe—: si
// la huella no coincide con lo que hay en esa fila del Sheet (la pestaña se reordenó, se insertó una
// fila, el dueño cambió algo), el script no escribe ESA fila y lo dice. Nunca marca por número de fila
// a secas: marcar la fila equivocada borra plata de una compra real, que es el único error que esta
// pestaña no perdona.
//
// CÓMO ESCRIBE. X ← «ELIMINADO». El importe: si O es fórmula (=N+M o =M, las filas del cargador y
// las de nómina de junio) se escribe 0 en M (y en N si tenía un número) y O cae a 0 sola; si O es un
// número tipeado (las filas viejas de nómina) se escribe 0 en O. Se escribe 0 y no vacío a propósito:
// la guarda anti-borrado del cliente de Google descarta una celda que se vacía sobre un valor (medido
// el 11/09: 11 filas quedaron con X=ELIMINADO y el importe intacto). El 0 es además la marca del
// dueño (f612: M=0, N y O fórmula).
// Nunca toca AB/AC/AD/AE/AF/AJ–AN (ARRAYFORMULA), ni Q (vencimientos reales pegados), ni K.
// Antes de escribir respalda los valores previos de M, N, O, T y X en `--respaldo` (JSON), para que
// la orden sea reversible. Después relee y verifica que el archivo diga lo que escribió.
//
//   node orquestador/scripts/compras-marcar-eliminado.mjs --lista batch.json            → sólo muestra
//   node orquestador/scripts/compras-marcar-eliminado.mjs --lista batch.json --aplicar  → escribe y verifica
//
// Se corre desde el checkout principal, nunca desde un worktree (regla del Sheet real).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Compras'
const FILA0 = 4
export const MARCA = 'ELIMINADO'

/** Columnas (índice 0) que este bisturí lee; escribe sólo X, y M/N u O. */
export const COL = { id: 0, fecha: 2, proveedor: 4, cliente: 9, neto: 12, iva: 13, total: 14, pagado: 19, estado: 23 }

const cent = (x) => Math.round((Number(x) || 0) * 100)
const norm = (x) => String(x ?? '').trim()
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
export const iso = (s) => (Number.isFinite(Number(s)) && Number(s) > 0
  ? new Date(Math.round((Number(s) - 25569) * 86400000)).toISOString().slice(0, 10) : norm(s).slice(0, 10))
const esFormula = (x) => typeof x === 'string' && x.startsWith('=')

/** La huella de una fila del Sheet, en la misma forma que la trae la lista. */
export function huella(f = []) {
  return { id: Number(f[COL.id]) || null, fecha: iso(f[COL.fecha]), proveedor: norm(f[COL.proveedor]), cliente: norm(f[COL.cliente]), total: Number(f[COL.total]) || 0 }
}
const mismaHuella = (a, b) => a.id === (Number(b.id) || null) && a.fecha === iso(b.fecha) && a.proveedor === norm(b.proveedor)
  && a.cliente === norm(b.cliente) && cent(a.total) === cent(b.total)

/**
 * NÚCLEO PURO: qué celdas escribir por cada fila pedida.
 *
 * @param {Array<Array>} valores   la grilla de Compras desde `fila0`, render UNFORMATTED_VALUE
 * @param {Array<Array>} formulas  la misma grilla con render FORMULA (para saber si O es fórmula)
 * @param {number} fila0
 * @param {Array<{fila:number,id:number,fecha:string,proveedor:string,cliente:string,total:number}>} pedidas
 * @returns {{aEscribir:Array, yaEstaban:Array, problemas:Array}}
 */
export function planDeEliminacion(valores = [], formulas = [], fila0 = FILA0, pedidas = []) {
  const aEscribir = []; const yaEstaban = []; const problemas = []
  for (const p of pedidas) {
    // Primero la fila declarada; si su huella no coincide, se busca la huella en toda la pestaña.
    let idx = p.fila - fila0
    if (!(idx >= 0 && idx < valores.length && mismaHuella(huella(valores[idx]), p))) {
      const hits = valores.map((f, i) => (mismaHuella(huella(f), p) ? i : -1)).filter((i) => i >= 0)
      if (hits.length !== 1) { problemas.push({ ...p, cuantas: hits.length, motivo: hits.length ? 'huella repetida' : 'la fila declarada no coincide y la huella no está' }); continue }
      idx = hits[0]
    }
    const v = valores[idx]; const fm = formulas[idx] ?? []
    const fila = fila0 + idx
    const estado = norm(v[COL.estado])
    const totalCero = cent(v[COL.total]) === 0
    if (estado.toUpperCase() === MARCA && totalCero) { yaEstaban.push({ ...p, fila }); continue }
    const oEsFormula = esFormula(fm[COL.total])
    const nTieneNumero = !esFormula(fm[COL.iva]) && norm(fm[COL.iva]) !== '' && cent(fm[COL.iva]) !== 0
    aEscribir.push({
      ...p, fila, oEsFormula, nTieneNumero,
      antes: { M: v[COL.neto] ?? '', N: v[COL.iva] ?? '', O: fm[COL.total] ?? '', T: fm[COL.pagado] ?? '', X: fm[COL.estado] ?? '' },
    })
  }
  return { aEscribir, yaEstaban, problemas }
}

/** Las requests de batchUpdate para una fila del plan. */
export function requestsDe(e, sheetId) {
  const celda = (col, value) => ({ updateCells: {
    range: { sheetId, startRowIndex: e.fila - 1, endRowIndex: e.fila, startColumnIndex: col, endColumnIndex: col + 1 },
    rows: [{ values: [value == null ? {} : { userEnteredValue: value }] }],
    fields: 'userEnteredValue',
  } })
  const req = [celda(COL.estado, { stringValue: MARCA })]
  if (!e.oEsFormula) req.push(celda(COL.total, { numberValue: 0 }))
  else {
    req.push(celda(COL.neto, { numberValue: 0 }))
    if (e.nTieneNumero) req.push(celda(COL.iva, { numberValue: 0 }))
  }
  return req
}

function args(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null }

async function main() {
  const lista = args('--lista'); const aplicar = process.argv.includes('--aplicar')
  if (!lista) throw new Error('falta --lista archivo.json')
  const pedidas = JSON.parse(readFileSync(lista, 'utf8'))
  const respaldo = args('--respaldo') || `orquestador/datos/respaldos/compras-eliminadas-${new Date().toISOString().slice(0, 10)}.json`

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)
  const rango = `'${PESTANA}'!A${FILA0}:X${hoja.rows}`
  const [valores, formulas] = await Promise.all([
    google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, rango, { render: 'FORMULA' }),
  ])
  const { aEscribir, yaEstaban, problemas } = planDeEliminacion(valores, formulas, FILA0, pedidas)

  console.log(`«${PESTANA}» · ${pedidas.length} fila(s) pedidas · ${aEscribir.length} a marcar · ${yaEstaban.length} ya marcadas · ${problemas.length} con problema`)
  for (const p of problemas) console.error(`  ✖ fila ${p.fila} · ${p.proveedor} ${p.fecha} ${plata(p.total)}: ${p.motivo} (${p.cuantas})`)
  for (const y of yaEstaban) console.log(`  ✋ fila ${y.fila} ya está ${MARCA} en cero`)
  for (const e of aEscribir) console.log(`  ✎ fila ${e.fila} · ${e.proveedor} · ${e.cliente} · ${e.fecha} · ${plata(e.total)} · X "${e.antes.X}" → ${MARCA} · ${e.oEsFormula ? (e.nTieneNumero ? 'M y N → 0' : 'M → 0') : 'O → 0'}`)
  if (problemas.length) { console.error('\n✖ una fila sin huella única no se escribe. No toqué nada.'); process.exit(1) }
  if (!aEscribir.length) { console.log('\n✓ no hay nada que escribir.'); return }
  const total = aEscribir.reduce((s, e) => s + e.total, 0)
  console.log(`\n  total a poner en cero: ${plata(total)}`)
  if (!aplicar) { console.log('(sin --aplicar: no escribí nada)'); return }

  mkdirSync(dirname(respaldo), { recursive: true })
  writeFileSync(respaldo, JSON.stringify({ archivo: ID, pestana: PESTANA, cuando: new Date().toISOString(), filas: aEscribir }, null, 1))
  console.log(`  respaldo de lo que piso: ${respaldo}`)

  const r = await google.spreadsheetBatchUpdate(ID, aEscribir.flatMap((e) => requestsDe(e, hoja.sheetId)))
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee el archivo, celda por celda.
  const despues = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
  let mal = 0
  for (const e of aEscribir) {
    const f = despues[e.fila - FILA0] ?? []
    const ok = norm(f[COL.estado]) === MARCA && cent(f[COL.total]) === 0
    if (ok) console.log(`  ✓ fila ${e.fila} · X = ${MARCA} · O = 0`)
    else { mal++; console.error(`  ✖ fila ${e.fila} · X = "${norm(f[COL.estado])}" · O = ${f[COL.total]}`) }
  }
  if (mal) { console.error('\n✖ el archivo no dice lo que escribí.'); process.exit(1) }
  console.log(`\n✓ ${aEscribir.length} fila(s) por ${plata(total)} marcadas ${MARCA}. Reversible con el respaldo.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
