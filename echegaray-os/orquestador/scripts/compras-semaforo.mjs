#!/usr/bin/env node
// LE DA DUEÑO AL SEMÁFORO DE `Compras!Z · Estado pago` — y le saca los cuatro glifos invisibles.
//
// ═══ QUÉ ARREGLA ═══
//
// 846 celdas de esa columna dibujan su estado con un emoji (`✅ 🔴 🟡 🟢`) que el exportador a PDF no
// embebe. En el papel —lo único con lo que el dueño da una pestaña por buena— quedan cuatro palabras
// sin señal. Es la peor concentración de `glifo_invisible` del archivo entero.
//
// El criterio, los glifos elegidos y el porqué de cada uno viven en `lib/glifos.mjs` (`SEMAFORO`); la
// fórmula y sus formas reconocibles, en `lib/compras-valores.mjs`, con tests. Acá sólo está la puerta
// al archivo: leer, probar que cada celda es la que creemos, escribir y RELEER.
//
// ═══ POR QUÉ ES QUIRÚRGICO Y NO UN REEMPLAZO POR PATRÓN ═══
//
// `Compras` es donde el dueño tipea todos los días. Este script no busca-y-reemplaza: reconstruye la
// fórmula de cada fila y sólo escribe si la que HAY es exactamente una de las tres formas conocidas
// (la vigente, la publicada con emoji, y la publicada con emoji y `#REF!`). Una sola celda que no
// encaje FRENA LA CORRIDA ENTERA sin escribir nada — puede ser una fila que el dueño ajustó a mano, y
// eso es verdad definitiva.
//
// La verificación no es que la API haya devuelto 200: se relee la columna y se exige que (1) las
// 1.136 fórmulas sean la nueva, (2) no quede un solo glifo invisible, (3) no aparezca ningún `#REF!`
// ni `#ERROR!`, y (4) el REPARTO por estado sea idéntico al de antes. Ese cuarto control se valida
// contra información que este script no produce: los estados salen de la columna `X`, que no se toca.
//
//   node orquestador/scripts/compras-semaforo.mjs             → dice qué haría, no escribe
//   node orquestador/scripts/compras-semaforo.mjs --aplicar   → escribe y verifica releyendo

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { glifosInvisibles } from '../lib/glifos.mjs'
import { COL, FILA0, ROTULO, esSemaforoConocido, formulaEstadoPago } from '../lib/compras-valores.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Compras'
const ERROR_DE_CELDA = /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i

const celda = (f, i) => String(f?.[i]?.[0] ?? '').trim()
/** Letra de columna → índice 0-based. 'A'→0, 'AB'→27. La coordenada del archivo es una letra. */
const idxCol = (l) => String(l).toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/** El reparto por ESTADO, ignorando el glifo: es lo que tiene que quedar igual antes y después. */
function repartoPorEstado(valores = []) {
  const m = new Map()
  valores.forEach((f, i) => {
    if (i + 1 < FILA0) return
    const t = String(f?.[0] ?? '').replace(/[^\wáéíóúüñ ]/gi, '').trim()
    if (!t) return
    m.set(t, (m.get(t) ?? 0) + 1)
  })
  return m
}

const mismoReparto = (a, b) => a.size === b.size && [...a].every(([k, n]) => b.get(k) === n)

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: APLICAR ? WRITE_SCOPES : undefined })
  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTANA}: no escribo a ciegas`)

  // EL RÓTULO ES LA LLAVE. Si la columna dice otra cosa, alguien movió las columnas y esto no es mío.
  const cab = String((await google.readSheetValues(ID, `${PESTANA}!${COL.semaforo}3`))?.[0]?.[0] ?? '').trim()
  if (cab !== ROTULO.semaforo) {
    throw new Error(`${COL.semaforo}3 dice "${cab}" y no "${ROTULO.semaforo}". No es mi columna: no la piso.`)
  }

  const rango = `${PESTANA}!${COL.semaforo}1:${COL.semaforo}${hoja.rows}`
  const antes = await google.readSheetValues(ID, rango, { render: 'FORMULA' })
  const antesVisto = await google.readSheetValues(ID, rango, { render: 'FORMATTED_VALUE' })

  const conFormula = []
  const ajenas = []
  let alDia = 0
  for (let i = 0; i < antes.length; i++) {
    const fila = i + 1
    if (fila < FILA0) continue
    const t = celda(antes, i)
    if (!t.startsWith('=')) continue
    conFormula.push(fila)
    if (t === formulaEstadoPago(fila)) alDia++
    else if (!esSemaforoConocido(t, fila)) ajenas.push({ fila, t })
  }
  const invisibles = antesVisto.filter((f) => glifosInvisibles(String(f?.[0] ?? '')).length).length
  console.log(`${PESTANA}!${COL.semaforo} · ${conFormula.length} fórmula(s) de la fila ${conFormula[0]} a la `
    + `${conFormula[conFormula.length - 1]} · ${alDia} ya al día · ${invisibles} celda(s) con glifo invisible`)

  if (ajenas.length) {
    console.error(`\n✖ ${ajenas.length} celda(s) no son ninguna de las formas conocidas. No escribo nada:`)
    for (const a of ajenas.slice(0, 10)) console.error(`   ${COL.semaforo}${a.fila}  ${a.t.slice(0, 110)}`)
    process.exit(1)
  }
  if (!conFormula.length) throw new Error('no encontré una sola fórmula: un rango vacío no se "arregla" solo')

  const desde = conFormula[0]
  const hasta = conFormula[conFormula.length - 1]
  const huecos = hasta - desde + 1 - conFormula.length
  if (huecos) throw new Error(`hay ${huecos} fila(s) sin fórmula dentro del bloque ${desde}-${hasta}: `
    + 'escribir el bloque entero les pondría una que nadie pidió')

  const repartoAntes = repartoPorEstado(antesVisto)
  console.log('\nREPARTO POR ESTADO (de la columna X, que no se toca):')
  for (const [k, n] of [...repartoAntes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}× ${k}`)
  console.log(`\nla fila ${desde} pasa a:\n  ${formulaEstadoPago(desde)}`)

  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }

  const filas = conFormula.map((f) => ({ values: [{ userEnteredValue: { formulaValue: formulaEstadoPago(f) } }] }))
  const col = idxCol(COL.semaforo)
  const r = await google.spreadsheetBatchUpdate(ID, [{ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: col, endColumnIndex: col + 1 },
    rows: filas,
    fields: 'userEnteredValue',
  } }])
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee la columna y se cuenta lo que quedó.
  const despues = await google.readSheetValues(ID, rango, { render: 'FORMULA' })
  const visto = await google.readSheetValues(ID, rango, { render: 'FORMATTED_VALUE' })
  const malas = conFormula.filter((f) => celda(despues, f - 1) !== formulaEstadoPago(f))
  const ciegas = visto.map((f, i) => [i + 1, String(f?.[0] ?? '')]).filter(([, v]) => glifosInvisibles(v).length)
  const errores = visto.map((f, i) => [i + 1, String(f?.[0] ?? '')]).filter(([, v]) => ERROR_DE_CELDA.test(v))
  const repartoDespues = repartoPorEstado(visto)

  console.log(`\nDESPUÉS  ${conFormula.length - malas.length}/${conFormula.length} fórmulas al día · `
    + `${ciegas.length} glifo(s) invisible(s) · ${errores.length} celda(s) en error`)
  let mal = false
  if (malas.length) { console.error(`✖ ${malas.length} celda(s) no quedaron escritas: ${malas.slice(0, 8).join(', ')}`); mal = true }
  if (ciegas.length) { console.error(`✖ siguen ${ciegas.length} con glifo invisible: ${ciegas.slice(0, 5).map(([f, v]) => `${COL.semaforo}${f}="${v}"`).join(' ')}`); mal = true }
  if (errores.length) { console.error(`✖ ${errores.length} celda(s) en error: ${errores.slice(0, 5).map(([f, v]) => `${COL.semaforo}${f}="${v}"`).join(' ')}`); mal = true }
  if (!mismoReparto(repartoAntes, repartoDespues)) {
    console.error('✖ el reparto por estado CAMBIÓ. La columna X no se tocó, así que esto es la fórmula diciendo otra cosa:')
    for (const k of new Set([...repartoAntes.keys(), ...repartoDespues.keys()])) {
      const a = repartoAntes.get(k) ?? 0; const d = repartoDespues.get(k) ?? 0
      if (a !== d) console.error(`   ${k}: ${a} → ${d}`)
    }
    mal = true
  } else {
    console.log('✓ el reparto por estado es idéntico: cambió el glifo, no la información')
  }
  if (mal) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message ?? e); process.exit(1) })
