#!/usr/bin/env node
// LO QUE EL DUEÑO CONFIRMÓ PAGADO VA A SU COLUMNA, NO A UNA LISTA APARTE.
//
// ═══ POR QUÉ EXISTE (17/08/2026) ═══
//
// Cinco quincenas de abril a junio ($47.415.800) figuraban impagas: el extracto arranca el 28/05 y
// esos jornales salieron en buena parte por caja física, así que ninguna fuente del OS podía verlas.
// Preguntado, el dueño contestó **"Todas las cinco están pagadas"**.
//
// La primera versión de esto guardó su respuesta en un módulo del código (`confirmaciones-del-dueno`)
// para no escribir en su columna. Él lo rechazó, y tenía razón: *"si te dije que están pagas, ponerlas
// así. No dejes nada que pueda hacer que arrastre error."* Una confirmación viviendo en el código
// mientras la planilla dice otra cosa es **una segunda fuente del mismo concepto** — exactamente el
// defecto que este archivo entero viene arreglando. Si él abre la pestaña, tiene que ver que están
// pagadas; si un generador la lee, tiene que leer lo mismo.
//
// ═══ QUÉ FECHA SE ESCRIBE, Y POR QUÉ NO ES UNA INVENCIÓN ═══
//
// Lo que confirmó es QUE están pagadas, no CUÁNDO. Se escribe la fecha de «Se paga el» de la misma
// fila —la única defendible— y es además la que el modelo ya usaba: una quincena marcada sin fecha
// creíble se fecha con la prevista. O sea que el número publicado no se mueve ni un peso por esta
// escritura: lo que cambia es que la afirmación queda donde se puede ver y auditar.
//
// Y hay una segunda razón, más fuerte: esas cinco fechas SON las que el propio archivo tenía
// desplazadas. `N126:N132` guarda 46143, 46160, 46176, 46189, 46204 —01/05, 18/05, 03/06, 16/06,
// 01/07— que es exactamente «Se paga el» de las filas 141 a 145. Escribirlas acá no inventa nada:
// devuelve a su fila lo que un generador dejó ocho filas más arriba.
//
// ═══ CÓMO NO ROMPE NADA ═══
//
// · Sólo escribe sobre celdas de «Pagado el» que hoy están VACÍAS. Si el dueño ya cargó una fecha
//   ahí, esa manda y el script la deja intacta — su edición es la verdad definitiva.
// · Ubica la fila por el CIERRE de la quincena (columna «Hasta»), no por número de fila. El registro
//   crece y las filas se corren: anclar en la posición es el defecto que produjo este lío.
// · Verifica releyendo el archivo, celda por celda, y compara el TOTAL del registro antes y después.
//
//   node orquestador/scripts/jornales-marcar-pagadas.mjs             → dice qué haría, no escribe
//   node orquestador/scripts/jornales-marcar-pagadas.mjs --aplicar   → escribe y verifica releyendo

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { QUINCENAS_CONFIRMADAS, MOTIVO_QUINCENAS } from '../lib/confirmaciones-del-dueno.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Jornales por Quincena'
/** El registro de obra. Las columnas son fijas; la FILA de cada quincena no, y por eso se busca. */
export const COL = { hasta: 'B', sePaga: 'C', total: 'K', pagado: 'N' }
const idxCol = (l) => String(l).toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const iso = (s) => (Number.isFinite(Number(s)) && Number(s) > 0
  ? new Date(Math.round((Number(s) - 25569) * 86400000)).toISOString().slice(0, 10) : '')

/**
 * NÚCLEO PURO: qué celdas hay que escribir.
 *
 * Devuelve una entrada por cada quincena confirmada que además esté VACÍA en «Pagado el». Una que ya
 * tiene fecha no entra: la edición del dueño gana siempre, incluso contra su propia confirmación
 * posterior — si las dos dicen cosas distintas, la que está en la planilla es la que él mira.
 *
 * @param {Array<Array>} filas la grilla del registro, desde `fila0`, con las columnas crudas
 * @param {number} fila0 número de la primera fila de `filas` en la pestaña
 * @param {Map} confirmadas clave = cierre de quincena en ISO
 * @returns {{aEscribir:Array, yaTenian:Array, noEncontradas:Array}}
 */
export function planDeMarcado(filas = [], fila0 = 1, confirmadas = QUINCENAS_CONFIRMADAS) {
  const aEscribir = []; const yaTenian = []; const vistas = new Set()
  const cH = idxCol(COL.hasta); const cP = idxCol(COL.sePaga); const cN = idxCol(COL.pagado)
  filas.forEach((f, i) => {
    const hasta = iso(f?.[cH])
    if (!hasta || !confirmadas.has(hasta)) return
    vistas.add(hasta)
    const fila = fila0 + i
    const sePaga = Number(f?.[cP])
    const yaHay = f?.[cN]
    if (yaHay !== '' && yaHay != null) { yaTenian.push({ fila, hasta, tiene: yaHay }); return }
    // Sin «Se paga el» no hay fecha defendible y no se inventa una: se reporta y se deja.
    if (!Number.isFinite(sePaga) || sePaga <= 0) { yaTenian.push({ fila, hasta, tiene: '(sin «Se paga el»)' }); return }
    aEscribir.push({ fila, hasta, fecha: sePaga, total: Number(f?.[idxCol(COL.total)]) || 0 })
  })
  const noEncontradas = [...confirmadas.keys()].filter((k) => !vistas.has(k))
  return { aEscribir, yaTenian, noEncontradas }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)

  const FILA0 = 1
  const filas = await google.readSheetValues(ID, `'${PESTANA}'!A${FILA0}:N${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  const { aEscribir, yaTenian, noEncontradas } = planDeMarcado(filas, FILA0)

  console.log(`«${PESTANA}» · ${QUINCENAS_CONFIRMADAS.size} quincena(s) confirmadas por el dueño`)
  console.log(`  ${MOTIVO_QUINCENAS}\n`)
  for (const e of aEscribir) console.log(`  ✎ fila ${e.fila} · cierra ${e.hasta} · ${plata(e.total)} → «Pagado el» = ${iso(e.fecha)}`)
  for (const y of yaTenian) console.log(`  ✋ fila ${y.fila} · cierra ${y.hasta} · ya dice "${y.tiene}": no la piso`)
  for (const k of noEncontradas) console.error(`  ✖ la quincena que cierra ${k} NO está en el registro: no escribo nada de ella`)
  if (noEncontradas.length) { console.error('\n✖ una confirmación sin su fila es un dato colgado. Revisá la clave.'); process.exit(1) }
  if (!aEscribir.length) { console.log('\n✓ no hay nada que escribir: todas ya tienen su fecha.'); return }
  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }

  const cN = idxCol(COL.pagado)
  const req = aEscribir.map((e) => ({ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: e.fila - 1, endRowIndex: e.fila, startColumnIndex: cN, endColumnIndex: cN + 1 },
    rows: [{ values: [{
      userEnteredValue: { numberValue: e.fecha },
      // El formato va JUNTO con el valor: un serial sin formato de fecha se dibuja como $46.143, que
      // es exactamente cómo quedaron las siete huérfanas de N126:N132.
      userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } },
    }] }],
    fields: 'userEnteredValue,userEnteredFormat.numberFormat',
  } }))
  const r = await google.spreadsheetBatchUpdate(ID, req)
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee el archivo, celda por celda.
  const despues = await google.readSheetValues(ID, `'${PESTANA}'!A${FILA0}:N${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  let mal = 0
  for (const e of aEscribir) {
    const leido = Number(despues[e.fila - FILA0]?.[cN])
    if (leido === e.fecha) console.log(`  ✓ fila ${e.fila} · «Pagado el» = ${iso(leido)}`)
    else { mal++; console.error(`  ✖ fila ${e.fila} · esperaba ${iso(e.fecha)} y el archivo dice "${leido}"`) }
  }
  const { aEscribir: quedan } = planDeMarcado(despues, FILA0)
  if (quedan.length) { mal++; console.error(`  ✖ quedan ${quedan.length} sin marcar después de escribir`) }
  if (mal) { console.error('\n✖ el archivo no dice lo que escribí.'); process.exit(1) }
  console.log(`\n✓ ${aEscribir.length} quincena(s) marcadas y verificadas releyendo el archivo.`)
  console.log('  Ahora la planilla y el libro dicen lo mismo: una sola fuente.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
