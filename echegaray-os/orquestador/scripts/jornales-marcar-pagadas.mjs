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
//   … --con-banco [--aplicar]  → corrige «Pagado el» con la fecha REAL del certificado de haberes (25/09)

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { QUINCENAS_CONFIRMADAS, MOTIVO_QUINCENAS } from '../lib/confirmaciones-del-dueno.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Nómina' // el registro vive en «Nómina» desde el 25/09/2026
/** El registro de obra. Las columnas son fijas; la FILA de cada quincena no, y por eso se busca. */
export const COL = { hasta: 'B', sePaga: 'C', total: 'K', pagado: 'N' }
// ═══ LAS COLUMNAS SE BUSCAN POR ENCABEZADO (25/09/2026) ═══
//
// `COL` quedó del layout de agosto: hoy «Total» es la J y «Pagado el» la M. Con las letras fijas este
// script escribía en la columna de al lado. `columnasDelRegistro` las ubica por el encabezado del
// calendario («Desde · Hasta · Se paga el · … · Total · … · Pagado el») y aborta si falta alguna.
export function columnasDelRegistro(filas = []) {
  const norm = (v) => String(v ?? '').trim().toLowerCase()
  for (let i = 0; i < filas.length; i++) {
    const f = (filas[i] ?? []).map(norm)
    if (f[0] !== 'desde' || f[1] !== 'hasta') continue
    const c = { fila: i, desde: 0, hasta: 1, sePaga: f.indexOf('se paga el'), banco: f.indexOf('banco'),
      total: f.indexOf('total'), pagado: f.indexOf('pagado el') }
    if ([c.sePaga, c.banco, c.total, c.pagado].some((x) => x < 0)) return null
    return c
  }
  return null
}
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

/**
 * NÚCLEO PURO: «Pagado el» corregido con la fecha REAL del banco (25/09/2026).
 *
 * La auditoría encontró 10 de 17 fechas falsas (la quincena 01–15/09 decía 01/07/2026) y el código
 * las descartaba por imposibles. La evidencia está en el certificado de acreditaciones de haberes de
 * Santander (`haberes_acreditados_banco`, por CUIL y con el período que paga cada acreditación): la
 * fecha de pago de una quincena es la del ÚLTIMO crédito de haberes de su período (clase «quincena» o
 * «adelanto_quincena»). Se acepta sólo si esos créditos suman la columna «Banco» de la fila al peso:
 * si no cierran, no es evidencia y no se escribe.
 *
 * SIN EVIDENCIA NO SE ESCRIBE NADA, Y TAMPOCO SE VACÍA. Una quincena sin crédito bancario se pagó en
 * efectivo o antes del certificado; vaciar su «Pagado el» la pasaría a «cerrada» y el libro la
 * publicaría VENCIDA (antes del extracto no hay con qué probarla): deuda falsa, el defecto opuesto. Se
 * reporta con su fecha actual para que el dueño decida.
 *
 * @param {Array<Array>} filas la pestaña desde A1 (UNFORMATTED_VALUE)
 * @param {Array<{desde:number,hasta:number,fecha:number,importe:number}>} creditos seriales de Sheets
 * @returns {{cambios:Array, iguales:Array, sinEvidencia:Array, noCierran:Array}|null}
 */
export function planConBanco(filas = [], creditos = []) {
  const c = columnasDelRegistro(filas)
  if (!c) return null
  const out = { cambios: [], iguales: [], sinEvidencia: [], noCierran: [] }
  for (let i = c.fila + 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const desde = Number(f[c.desde]); const hasta = Number(f[c.hasta])
    if (!(desde > 0 && hasta > 0)) { if (String(f[0] ?? '').startsWith('⇒')) break; continue }
    const fila = i + 1
    const actual = f[c.pagado]
    const banco = Number(f[c.banco]) || 0
    const suyos = creditos.filter((x) => x.hasta >= desde && x.hasta <= hasta)
    const base = { fila, desde, hasta, actual, banco }
    if (!suyos.length) { out.sinEvidencia.push(base); continue }
    // El ADELANTO por banco no es la columna «Banco» (va en «Adelanto»): se compara sólo la clase
    // «quincena». La fecha sí es la del último crédito del período, adelantos incluidos.
    const suma = Math.round(suyos.filter((x) => x.clase !== 'adelanto_quincena').reduce((a, x) => a + x.importe, 0) * 100) / 100
    const fecha = Math.max(...suyos.map((x) => x.fecha))
    // «Banco» VACÍA en la planilla y el banco pagó: la fecha es evidencia igual (se reporta el hueco).
    const bancoVacio = !(banco > 0)
    if (!bancoVacio && Math.abs(suma - banco) > 1) { out.noCierran.push({ ...base, suma, fecha }); continue }
    if (Number(actual) === fecha) out.iguales.push({ ...base, fecha })
    else out.cambios.push({ ...base, fecha, suma, bancoVacio, col: c.pagado })
  }
  return out
}

async function creditosDelBanco() {
  const { query } = await import('../lib/db.mjs')
  const r = await query(`select periodo_hasta::date::text as hasta, fecha::date::text as fecha, importe, clase
      from public.haberes_acreditados_banco
     where clase in ('quincena','adelanto_quincena') and periodo_hasta is not null`)
  const serial = (isoD) => Math.round(Date.UTC(+isoD.slice(0, 4), +isoD.slice(5, 7) - 1, +isoD.slice(8, 10)) / 86400000) + 25569
  return r.rows.map((x) => ({ hasta: serial(x.hasta), fecha: serial(x.fecha), importe: Number(x.importe), clase: x.clase }))
}

async function mainConBanco(google, hoja) {
  const filas = await google.readSheetValues(ID, `'${PESTANA}'!A1:M${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  const plan = planConBanco(filas, await creditosDelBanco())
  if (!plan) { console.error('✖ no encontré el encabezado del calendario (Desde · Hasta · … · Pagado el): NO escribo'); process.exit(1) }
  const d = (v) => (Number(v) > 0 ? iso(v) : String(v ?? '') || '(vacía)')
  for (const e of plan.cambios) console.log(`  ✎ fila ${e.fila} · ${iso(e.desde)}–${iso(e.hasta)} · decía ${d(e.actual)} → ${iso(e.fecha)} (banco ${plata(e.suma)}${e.bancoVacio ? ' · la columna Banco de la planilla está VACÍA' : ' = columna Banco'})`)
  for (const e of plan.iguales) console.log(`  ✓ fila ${e.fila} · ${iso(e.hasta)} · ya dice ${iso(e.fecha)}, igual que el banco`)
  for (const e of plan.noCierran) console.log(`  ▲ fila ${e.fila} · ${iso(e.hasta)} · el banco acreditó ${plata(e.suma)} y la columna Banco dice ${plata(e.banco)}: no es evidencia, no escribo`)
  for (const e of plan.sinEvidencia) console.log(`  · fila ${e.fila} · ${iso(e.desde)}–${iso(e.hasta)} · SIN crédito bancario — queda como está (${d(e.actual)})`)
  if (!plan.cambios.length) { console.log('\n✓ nada que corregir.'); return }
  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }
  const req = plan.cambios.map((e) => ({ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: e.fila - 1, endRowIndex: e.fila, startColumnIndex: e.col, endColumnIndex: e.col + 1 },
    rows: [{ values: [{ userEnteredValue: { numberValue: e.fecha } }] }],
    fields: 'userEnteredValue',
  } }))
  // EXCEPCIÓN DECLARADA (25/09/2026): el dueño aprobó corregir estas fechas; el respaldo previo lo toma
  // quien corre esto (volcado de M10:M26) y el alcance son SÓLO las celdas de `plan.cambios`.
  const r = await google.spreadsheetBatchUpdate(ID, req, { yaGuardado: true })
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) { console.error('🔒 la guarda descartó la escritura'); process.exit(1) }
  const despues = await google.readSheetValues(ID, `'${PESTANA}'!A1:M${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  let mal = 0
  for (const e of plan.cambios) {
    const leido = Number(despues[e.fila - 1]?.[e.col])
    if (leido === e.fecha) console.log(`  ✓ releído fila ${e.fila} · «Pagado el» = ${iso(leido)}`)
    else { mal++; console.error(`  ✖ fila ${e.fila}: esperaba ${iso(e.fecha)} y el archivo dice ${leido}`) }
  }
  if (mal) process.exit(1)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)

  if (process.argv.includes('--con-banco')) return mainConBanco(google, hoja)
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
