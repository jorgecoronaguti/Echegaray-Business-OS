#!/usr/bin/env node
// QUÉ LE HIZO LA ÚLTIMA CORRIDA AL SHEET — celda por celda, contra la foto previa. SÓLO LECTURA.
//
// ═══ POR QUÉ (03/09) ═══
//
// «La evidencia es del efecto, no del intento»: que un pipeline diga "14/14 pestañas rehechas" no
// prueba que no haya borrado nada. Hasta hoy la única forma de saberlo era abrir el historial de
// Google pestaña por pestaña, que no dice qué celda cambió.
//
// El pipeline ya fotografía cada pestaña ANTES de tocarla (`orq.sheet_snapshots`, tool
// 'flujo-caja-rehacer'). Esto compara esa foto con la hoja viva y clasifica cada diferencia. Es lo que
// se corre DESPUÉS de cada corrida para probar el efecto — y lo primero que hay que mirar cuando el
// dueño dice "me pisaste algo".
//
// LAS SEIS CATEGORÍAS, de la más grave a la más inocua:
//   borradas       tenía algo y hoy está vacía        ← ninguna debería aparecer nunca
//   fórmula→valor  tenía fórmula y hoy hay un número  ← el cálculo se aplanó: se rompió el origen
//   valor→fórmula  al revés (normalmente es una mejora del OS, pero se mira)
//   fórmula ≠      la fórmula cambió
//   valor ≠        cambió un número o un texto        ← lo esperable de una corrida
//   nuevas         estaba vacía y ahora tiene algo
//
//   node orquestador/scripts/sheet-diff-snapshot.mjs [--base HH:MM] [--pestana "CAJA"] [--muestras 12]
//
// `--base HH:MM` usa el snapshot más reciente ANTERIOR a esa hora de hoy (para saltearse corridas
// intermedias). Sin él, el más reciente de cada pestaña.

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { letraCol } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const arg = (nombre) => { const i = process.argv.indexOf(nombre); return i > 0 ? process.argv[i + 1] : null }

const ref = (r, c) => `${letraCol(c)}${r + 1}`
const norm = (c) => ({ f: c?.f ?? c?.formula ?? null, v: c?.v == null ? (c?.valor ?? '') : c.v })
const vacia = (c) => c.f === null && (c.v === '' || c.v === null)

/** NÚCLEO PURO: el diff celda por celda entre dos grillas `[[{f,v}]]`, clasificado. */
export function diffGrillas(antes = [], ahora = []) {
  const out = { borradas: [], formulaAValor: [], valorAFormula: [], formulaCambiada: [], valorCambiado: [], nuevas: [] }
  const filas = Math.max(antes.length, ahora.length)
  for (let r = 0; r < filas; r++) {
    const cols = Math.max((antes[r] ?? []).length, (ahora[r] ?? []).length)
    for (let c = 0; c < cols; c++) {
      const x = norm((antes[r] ?? [])[c]); const y = norm((ahora[r] ?? [])[c])
      if (x.f === y.f && String(x.v) === String(y.v)) continue
      const item = { ref: ref(r, c), antes: x.f ?? x.v, ahora: y.f ?? y.v }
      if (!vacia(x) && vacia(y)) out.borradas.push(item)
      else if (vacia(x) && !vacia(y)) out.nuevas.push(item)
      else if (x.f !== null && y.f === null) out.formulaAValor.push(item)
      else if (x.f === null && y.f !== null) out.valorAFormula.push(item)
      else if (x.f !== null && y.f !== null) { if (x.f !== y.f) out.formulaCambiada.push(item) }
      else out.valorCambiado.push(item)
    }
  }
  return out
}

/** Cuántas diferencias SOSPECHOSAS tiene un diff (las tres primeras categorías). Puro. */
export function sospechosas(d) {
  return d.borradas.length + d.formulaAValor.length + d.formulaCambiada.length
}

/** La línea de resumen de una pestaña. Pura, para que el formato se pueda probar. */
export function lineaResumen(pestana, d) {
  return `${String(pestana).padEnd(28)} borradas=${d.borradas.length} f→v=${d.formulaAValor.length} `
    + `v→f=${d.valorAFormula.length} fórmula≠=${d.formulaCambiada.length} valor≠=${d.valorCambiado.length} `
    + `nuevas=${d.nuevas.length}${sospechosas(d) ? '  ⚠' : ''}`
}

async function snapshots(base) {
  const cond = base
    ? `and created_at at time zone 'America/Argentina/San_Juan' < (current_date + $2::time)`
    : ''
  const { rows } = await query(
    `select distinct on (pestana) pestana, grid, created_at from orq.sheet_snapshots
      where file_id = $1 and tool = 'flujo-caja-rehacer' ${cond}
      order by pestana, created_at desc`, base ? [ID, base] : [ID])
  return rows
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const base = arg('--base')
  const solo = arg('--pestana')
  const muestras = Number(arg('--muestras') ?? 8)
  const snaps = (await snapshots(base)).filter((s) => !solo || s.pestana === solo)
  if (!snaps.length) { console.log('no hay snapshots que comparar'); return }

  const detalle = []
  let alerta = 0
  for (const s of snaps) {
    let vivo
    try {
      const g = await google.readSheetGrid(ID, s.pestana)
      vivo = (g.filas || []).map((f) => (f || []).map((c) => ({ f: c?.formula ?? null, v: c?.valor ?? null })))
    } catch (e) {
      console.log(`${s.pestana.padEnd(28)} NO PUDE LEERLA (${String(e.message).slice(0, 60)})`)
      continue
    }
    const d = diffGrillas(s.grid ?? [], vivo)
    console.log(lineaResumen(s.pestana, d))
    if (sospechosas(d)) alerta++
    detalle.push(`\n### ${s.pestana}  (foto: ${new Date(s.created_at).toLocaleString('es-AR')})`)
    for (const k of ['borradas', 'formulaAValor', 'valorAFormula', 'formulaCambiada', 'valorCambiado', 'nuevas']) {
      if (!d[k].length) continue
      detalle.push(`- ${k} (${d[k].length}):`)
      for (const it of d[k].slice(0, muestras)) {
        detalle.push(`    ${it.ref}: «${String(it.antes).slice(0, 70)}» → «${String(it.ahora).slice(0, 70)}»`)
      }
    }
  }
  console.log(detalle.join('\n'))
  console.log(alerta
    ? `\n⚠ ${alerta} pestaña(s) con diferencias SOSPECHOSAS (borradas / fórmula aplanada / fórmula cambiada): miralas una por una.`
    : '\n✓ ninguna celda borrada ni fórmula aplanada entre la foto previa y ahora.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => { console.error('ERROR:', e.message); await closePool(); process.exit(1) })
}
