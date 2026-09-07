#!/usr/bin/env node
// LAS HUELLAS DE FORMATO QUE DESCRIBEN UN LAYOUT QUE YA NO EXISTE.
//
// ═══ POR QUÉ EXISTE (07/09/2026) ═══
//
// El dueño: «proveedores quedó sin diseño». Y el formateador, en la misma corrida:
//
//   Proveedores  ⚠ el título usa Calibri y el estándar es Arial · 896 celda(s) fuera de Arial
//   🎨 "Proveedores"!A1:A31: no re-aplico el formato — ese rango ya tiene un formato que yo no puse.
//
// Las dos cosas a la vez: la pestaña perdió la piel Y el generador se niega a reponerla. La causa
// está en la base: sus huellas de formato apuntan a `A157:P269` y `G264:G267`, rangos del layout de
// ANTES de que la pestaña se compactara. La guarda compara el formato de hoy contra una huella que
// describe otra pestaña, no coincide, y concluye —bien, con la información que tiene— que lo cambió
// una persona. Es la Regla 0 protegiendo un fantasma.
//
// LO QUE ESTE SCRIPT BORRA, Y LO QUE NO: sólo las huellas cuyo rango CAE FUERA de la pestaña actual.
// Una huella que todavía apunta a una celda que existe puede estar describiendo formato real del
// dueño y no se toca. `--todas` existe para una pestaña íntegramente generada que se rehízo entera,
// y hay que pedirlo escribiendo el nombre: no hay forma de correrlo sobre el archivo completo.
//
//   node orquestador/scripts/olvidar-huella-de-formato.mjs <pestaña> [--todas] [--aplicar]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const args = process.argv.slice(2)
const PESTANA = args.find((a) => !a.startsWith('--'))
const TODAS = args.includes('--todas')
const APLICAR = args.includes('--aplicar')

/** NÚCLEO PURO: la última fila y columna que toca un rango A1, o `null` si no se puede leer. */
export function alcanceDeRango(rango) {
  const t = String(rango ?? '')
  if (t === '*' || !t) return null
  const filas = t.match(/^ROWS:(\d+)-(\d+)$/)
  if (filas) return { fila: Number(filas[2]), col: 0 }
  const cols = t.match(/^COLUMNS:(\d+)-(\d+)$/)
  if (cols) return { fila: 0, col: Number(cols[2]) }
  const m = [...t.matchAll(/([A-Z]+)(\d+)/g)]
  if (!m.length) return null
  const aNum = (s) => [...s].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0)
  return { fila: Math.max(...m.map((x) => Number(x[2]))), col: Math.max(...m.map((x) => aNum(x[1]))) }
}

/** NÚCLEO PURO: ¿esta huella describe un rango que en la pestaña de hoy ya no existe? */
export function quedoFuera(rango, { filas, cols }) {
  const a = alcanceDeRango(rango)
  if (!a) return false                          // '*' y lo que no se entiende: no se toca
  return a.fila > filas || a.col > cols
}

async function main() {
  if (!PESTANA) { console.error('falta el nombre de la pestaña'); process.exit(1) }
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === PESTANA)
  if (!hoja) { console.error(`no existe la pestaña "${PESTANA}"`); process.exit(1) }

  const r = await query(
    'select rango_a1, tipo from public.sheet_huella_formato where file_id = $1 and pestana = $2',
    [ID, PESTANA],
  )
  const todas = r.rows ?? r
  const fuera = TODAS ? todas : todas.filter((h) => quedoFuera(h.rango_a1, { filas: hoja.rows, cols: hoja.cols }))

  console.log(`"${PESTANA}" mide hoy ${hoja.rows} × ${hoja.cols} · ${todas.length} huella(s) de formato`)
  console.log(`${fuera.length} ${TODAS ? 'a olvidar (--todas)' : 'apuntan fuera de la pestaña'}`)
  for (const h of fuera.slice(0, 12)) console.log(`      ${h.rango_a1} (${h.tipo})`)
  if (fuera.length > 12) console.log(`      … y ${fuera.length - 12} más`)

  if (!APLICAR) { console.log('\n(sin --aplicar: no borré nada)'); return }
  if (!fuera.length) return
  await query(
    'delete from public.sheet_huella_formato where file_id = $1 and pestana = $2 and rango_a1 = any($3)',
    [ID, PESTANA, fuera.map((h) => h.rango_a1)],
  )
  console.log(`\n🧹 ${fuera.length} huella(s) olvidadas. Corré el generador de la pestaña para que reponga la piel.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1) })
