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
// Nunca toca las ARRAYFORMULA (Rubro de caja, Fecha de caja, Familia, Sub-rubro, las «(OS)»), ni la
// fecha prevista (vencimientos reales pegados), ni Detalles / Obra.
// Antes de escribir respalda los valores previos de Importe, IVA, Total, Monto Pagado y Estado en
// `--respaldo` (JSON), para que la orden sea reversible. Después relee y verifica que el archivo
// diga lo que escribió.
//
// ═══ LAS COLUMNAS SALEN DE LA FILA DE RÓTULOS VIVA, NUNCA DE UNA LETRA (18/09/2026) ═══
//
// El bisturí nació el 11/09 con índices fijos (Estado = X = 23, Total = O = 14). El 14/09 el dueño
// insertó «Obra» en L y todo lo que está a la derecha se corrió una letra: con esos índices, hoy
// escribiría «ELIMINADO» en «Monto Parcial 2» (X) y el cero en «IVA» (O) en vez de en «Total» (P) —
// sin un solo error, y CAJA seguiría sumando la fila. Desde hoy cada corrida lee `Compras!3:3` y
// resuelve cada columna por su rótulo (`colDe`); un rótulo que falta aborta con su nombre. El `COL`
// exportado es el resuelto contra la medición del 18/09 (`encabezado-vivo-compras.mjs`): sirve a los
// tests y como valor por defecto de las funciones puras, no para escribir.
//
//   node orquestador/scripts/compras-marcar-eliminado.mjs --lista batch.json            → sólo muestra
//   node orquestador/scripts/compras-marcar-eliminado.mjs --lista batch.json --aplicar  → escribe y verifica
//
// Se corre desde un checkout CON base (candados y huellas viven en Postgres): sin base, la guarda
// falla cerrada. Cada fila pedida se verifica por huella antes y se relee entera después.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { columnasDe, PESTANAS, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { letraDe } from '../lib/comprobantes/contrato-columnas.mjs'
import { COMPRAS_1809 } from '../lib/comprobantes/encabezado-vivo-compras.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Compras'
const FILA0 = PESTANAS.Compras.primeraFila
export const MARCA = 'ELIMINADO'

/** Los rótulos (fila 3 de Compras) de las columnas que este bisturí lee; escribe sólo Estado, e Importe/IVA o Total. */
export const ROTULOS = Object.freeze({
  id: 'ID', fecha: 'Fecha factura', proveedor: 'Proveedor', cliente: 'Cliente / Asignación', neto: 'Importe',
  iva: 'IVA', total: 'Total', pagado: 'Monto Pagado', estado: 'Estado',
})

/**
 * Las columnas (índice 0) resueltas contra una fila de rótulos. Un rótulo que falta lanza con su nombre.
 * @param {any[]} encabezado  `Compras!A3:BZ3` tal como se leyó
 */
export function colDe(encabezado = []) {
  const c = columnasDe(encabezado, ROTULOS, PESTANA)
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.indice]))
}

/** El contrato resuelto contra la medición del 18/09/2026. Para tests y valores por defecto; el que escribe usa `colDe(viva)`. */
export const COL = Object.freeze(colDe(COMPRAS_1809))

const cent = (x) => Math.round((Number(x) || 0) * 100)
const norm = (x) => String(x ?? '').trim()
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
export const iso = (s) => (Number.isFinite(Number(s)) && Number(s) > 0
  ? new Date(Math.round((Number(s) - 25569) * 86400000)).toISOString().slice(0, 10) : norm(s).slice(0, 10))
const esFormula = (x) => typeof x === 'string' && x.startsWith('=')

/** La huella de una fila del Sheet, en la misma forma que la trae la lista. */
export function huella(f = [], col = COL) {
  return { id: Number(f[col.id]) || null, fecha: iso(f[col.fecha]), proveedor: norm(f[col.proveedor]), cliente: norm(f[col.cliente]), total: Number(f[col.total]) || 0 }
}
const mismaHuella = (a, b) => a.id === (Number(b.id) || null) && a.fecha === iso(b.fecha) && a.proveedor === norm(b.proveedor)
  && a.cliente === norm(b.cliente) && cent(a.total) === cent(b.total)
// Una fila que YA quedó marcada tiene el importe en cero, así que su huella ya no trae el importe
// pedido: se la reconoce por el resto de la huella más la marca. Sin esto el bisturí no es
// idempotente —la segunda corrida ve 28 «problemas» y se niega a terminar las 11 que faltaban—.
const yaMarcada = (f, b, col) => {
  const a = huella(f, col)
  return norm(f[col.estado]).toUpperCase() === MARCA && cent(a.total) === 0 && a.id === (Number(b.id) || null)
    && a.fecha === iso(b.fecha) && a.proveedor === norm(b.proveedor) && a.cliente === norm(b.cliente)
}
const coincide = (f, b, col) => mismaHuella(huella(f, col), b) || yaMarcada(f, b, col)

/**
 * NÚCLEO PURO: qué celdas escribir por cada fila pedida.
 *
 * @param {Array<Array>} valores   la grilla de Compras desde `fila0`, render UNFORMATTED_VALUE
 * @param {Array<Array>} formulas  la misma grilla con render FORMULA (para saber si O es fórmula)
 * @param {number} fila0
 * @param {Array<{fila:number,id:number,fecha:string,proveedor:string,cliente:string,total:number}>} pedidas
 * @param {object} col  las columnas resueltas por rótulo (`colDe`)
 * @returns {{aEscribir:Array, yaEstaban:Array, problemas:Array}}
 */
export function planDeEliminacion(valores = [], formulas = [], fila0 = FILA0, pedidas = [], col = COL) {
  const aEscribir = []; const yaEstaban = []; const problemas = []
  for (const p of pedidas) {
    // Primero la fila declarada; si su huella no coincide, se busca la huella en toda la pestaña.
    let idx = p.fila - fila0
    if (!(idx >= 0 && idx < valores.length && coincide(valores[idx], p, col))) {
      const hits = valores.map((f, i) => (coincide(f, p, col) ? i : -1)).filter((i) => i >= 0)
      if (hits.length !== 1) { problemas.push({ ...p, cuantas: hits.length, motivo: hits.length ? 'huella repetida' : 'la fila declarada no coincide y la huella no está' }); continue }
      idx = hits[0]
    }
    const v = valores[idx]; const fm = formulas[idx] ?? []
    const fila = fila0 + idx
    const estado = norm(v[col.estado])
    const totalCero = cent(v[col.total]) === 0
    if (estado.toUpperCase() === MARCA && totalCero) { yaEstaban.push({ ...p, fila }); continue }
    const oEsFormula = esFormula(fm[col.total])
    const nTieneNumero = !esFormula(fm[col.iva]) && norm(fm[col.iva]) !== '' && cent(fm[col.iva]) !== 0
    // `antes` conserva las claves históricas (M/N/O/T/X = neto/iva/total/pagado/estado del layout del 11/09)
    // y agrega la letra real de cada una en `letras`, para que el respaldo sea legible con cualquier layout.
    aEscribir.push({
      ...p, fila, oEsFormula, nTieneNumero,
      antes: { M: v[col.neto] ?? '', N: v[col.iva] ?? '', O: fm[col.total] ?? '', T: fm[col.pagado] ?? '', X: fm[col.estado] ?? '' },
      letras: { neto: letraDe(col.neto), iva: letraDe(col.iva), total: letraDe(col.total), pagado: letraDe(col.pagado), estado: letraDe(col.estado) },
    })
  }
  return { aEscribir, yaEstaban, problemas }
}

/** Las requests de batchUpdate para una fila del plan, sobre las columnas resueltas. */
export function requestsDe(e, sheetId, col = COL) {
  const celda = (col, value) => ({ updateCells: {
    range: { sheetId, startRowIndex: e.fila - 1, endRowIndex: e.fila, startColumnIndex: col, endColumnIndex: col + 1 },
    rows: [{ values: [value == null ? {} : { userEnteredValue: value }] }],
    fields: 'userEnteredValue',
  } })
  const req = [celda(col.estado, { stringValue: MARCA })]
  if (!e.oEsFormula) req.push(celda(col.total, { numberValue: 0 }))
  else {
    req.push(celda(col.neto, { numberValue: 0 }))
    if (e.nTieneNumero) req.push(celda(col.iva, { numberValue: 0 }))
  }
  return req
}

/** Una fila leída, como texto `LETRA rótulo: valor` de las celdas no vacías — para releer y mostrar. */
export function filaLegible(encabezado = [], f = [], fm = []) {
  const partes = []
  f.forEach((v, i) => {
    const formula = typeof fm[i] === 'string' && fm[i].startsWith('=') ? ` «${fm[i].slice(0, 40)}»` : ''
    if ((v !== '' && v != null) || formula) partes.push(`${letraDe(i)} ${encabezado[i] ?? '?'}: ${JSON.stringify(v)}${formula}`)
  })
  return partes.join(' · ')
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
  // ── LA FILA DE RÓTULOS VIVA decide dónde está cada columna. Se lee UNA vez por corrida.
  const [encabezado = []] = await google.readSheetValues(ID, rangoFilas(PESTANA, PESTANAS.Compras.filaEncabezado, PESTANAS.Compras.filaEncabezado))
  const col = colDe(encabezado)
  const letras = Object.fromEntries(Object.entries(col).map(([k, i]) => [k, letraDe(i)]))
  console.log(`«${PESTANA}» · columnas por rótulo: ${Object.entries(letras).map(([k, l]) => `${k}=${l}`).join(' ')}`)
  const rango = rangoFilas(PESTANA, FILA0, hoja.rows)
  const [valores, formulas] = await Promise.all([
    google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, rango, { render: 'FORMULA' }),
  ])
  const { aEscribir, yaEstaban, problemas } = planDeEliminacion(valores, formulas, FILA0, pedidas, col)

  console.log(`${pedidas.length} fila(s) pedidas · ${aEscribir.length} a marcar · ${yaEstaban.length} ya marcadas · ${problemas.length} con problema`)
  for (const p of problemas) console.error(`  ✖ fila ${p.fila} · ${p.proveedor} ${p.fecha} ${plata(p.total)}: ${p.motivo} (${p.cuantas})`)
  for (const y of yaEstaban) console.log(`  ✋ fila ${y.fila} ya está ${MARCA} en cero`)
  for (const e of aEscribir) {
    const que = e.oEsFormula ? (e.nTieneNumero ? `${letras.neto} y ${letras.iva} → 0` : `${letras.neto} → 0`) : `${letras.total} → 0`
    console.log(`  ✎ fila ${e.fila} · ${e.proveedor} · ${e.cliente} · ${e.fecha} · ${plata(e.total)} · ${letras.estado} "${e.antes.X}" → ${MARCA} · ${que}`)
  }
  if (problemas.length) { console.error('\n✖ una fila sin huella única no se escribe. No toqué nada.'); process.exit(1) }
  if (!aEscribir.length) { console.log('\n✓ no hay nada que escribir.'); return }
  const total = aEscribir.reduce((s, e) => s + e.total, 0)
  console.log(`\n  total a poner en cero: ${plata(total)}`)
  // Las filas pedidas y sus vecinas, ANTES, enteras: es lo que el respaldo guarda y lo que se compara después.
  const vecinas = [...new Set(aEscribir.flatMap((e) => [e.fila - 1, e.fila, e.fila + 1]))].sort((a, b) => a - b)
  const foto = (grilla, grillaF) => Object.fromEntries(vecinas.map((n) => [n, { valores: grilla[n - FILA0] ?? [], formulas: grillaF?.[n - FILA0] ?? [] }]))
  const antes = foto(valores, formulas)
  for (const n of vecinas) console.log(`  ${aEscribir.some((e) => e.fila === n) ? '→' : ' '} f${n} ANTES  ${filaLegible(encabezado, antes[n].valores, antes[n].formulas)}`)
  if (!aplicar) { console.log('(sin --aplicar: no escribí nada)'); return }

  mkdirSync(dirname(respaldo), { recursive: true })
  writeFileSync(respaldo, JSON.stringify({ archivo: ID, pestana: PESTANA, cuando: new Date().toISOString(), columnas: letras, encabezado, filas: aEscribir, filasEnteras: antes }, null, 1))
  console.log(`  respaldo de lo que piso: ${respaldo}`)

  // Las celdas que se pisan son del DUEÑO (sin huella del OS): la guarda por celda las respetaría y la
  // orden no aterrizaría. La orden es suya y textual, así que el bisturí pasa con `yaGuardado` y pone
  // las guardas propias: huella de fila verificada arriba, respaldo entero, relectura celda por celda abajo.
  const r = await google.spreadsheetBatchUpdate(ID, aEscribir.flatMap((e) => requestsDe(e, hoja.sheetId, col)), { yaGuardado: true })
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee el archivo, celda por celda, y las filas enteras.
  const [despues, despuesF] = await Promise.all([
    google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, rango, { render: 'FORMULA' }),
  ])
  let mal = 0
  for (const e of aEscribir) {
    const f = despues[e.fila - FILA0] ?? []
    const ok = norm(f[col.estado]) === MARCA && cent(f[col.total]) === 0
    if (ok) console.log(`  ✓ fila ${e.fila} · ${letras.estado} = ${MARCA} · ${letras.total} = 0`)
    else { mal++; console.error(`  ✖ fila ${e.fila} · ${letras.estado} = "${norm(f[col.estado])}" · ${letras.total} = ${f[col.total]}`) }
  }
  const post = foto(despues, despuesF)
  for (const n of vecinas) {
    console.log(`  ${aEscribir.some((e) => e.fila === n) ? '→' : ' '} f${n} DESPUÉS ${filaLegible(encabezado, post[n].valores, post[n].formulas)}`)
    // Una vecina que cambió es un error del bisturí: se grita.
    if (!aEscribir.some((e) => e.fila === n) && JSON.stringify(post[n].formulas) !== JSON.stringify(antes[n].formulas)) { mal++; console.error(`  ✖ la fila vecina ${n} cambió y no estaba en la orden`) }
  }
  writeFileSync(respaldo, JSON.stringify({ archivo: ID, pestana: PESTANA, cuando: new Date().toISOString(), columnas: letras, encabezado, filas: aEscribir, filasEnteras: antes, filasEnterasDespues: post }, null, 1))
  if (mal) { console.error('\n✖ el archivo no dice lo que escribí.'); process.exit(1) }
  console.log(`\n✓ ${aEscribir.length} fila(s) por ${plata(total)} marcadas ${MARCA}. Reversible con el respaldo.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
