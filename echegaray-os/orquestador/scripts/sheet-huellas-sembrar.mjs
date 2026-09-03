#!/usr/bin/env node
// SIEMBRA LAS HUELLAS QUE LOS ESCRITORES CRUDOS NUNCA DEJARON.
//
// ═══ EL PROBLEMA QUE RESUELVE (03/09) ═══
//
// La propiedad por celda decide con una evidencia POSITIVA: "esta celda la escribí yo". Los pasos que
// escriben con `updateCells` o con `values` crudos nunca dejaron esa evidencia —la huella vivía sólo
// adentro de `escribirPreservando`—, así que al enchufar la guarda universal sus celdas caerían en el
// último cuadrante: **sin huella y con contenido → es del dueño → no la piso**. Media docena de
// pestañas quedarían congeladas sin que nadie las hubiera editado, que es exactamente el "candado de
// mierda" que el dueño mandó a apagar el 05/08.
//
// ═══ DE DÓNDE SALE LA EVIDENCIA, Y POR QUÉ ES LEGÍTIMA ═══
//
// El pipeline saca un SNAPSHOT de cada pestaña ANTES de tocar nada (`orq.sheet_snapshots`, tool
// 'flujo-caja-rehacer'). Entre ese snapshot y la hoja de ahora, lo que CAMBIÓ lo escribió el OS en esa
// corrida: nadie más estuvo escribiendo en el medio. Esa diferencia es la prueba, y es del mismo tipo
// que la que usa la huella normal (yo escribí esto).
//
// LO QUE NO CAMBIÓ NO SE SIEMBRA, y es la mitad importante. Una celda idéntica antes y después puede
// ser mía (la reescribí igual) o suya (nunca la toqué), y no hay forma de distinguirlo desde acá.
// Reclamarla sería fabricar la evidencia que este mecanismo existe para no fabricar. Quedan sin huella
// y por lo tanto protegidas — del lado del dueño, que es el lado correcto de la duda.
//
// Tampoco se pisa una huella que ya existe: si el OS ya selló esa celda, su registro manda.
//
//   node orquestador/scripts/sheet-huellas-sembrar.mjs [--dry] [--pestana "CAJA"]
//
// SE CORRE UNA VEZ, desde el árbol principal. No es un paso del pipeline.

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { formaDe, LARGO_FORMA } from '../lib/huella-forma.mjs'
import { huellaDe } from '../lib/huella-celda.mjs'
import { letraCol } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const SOLO = (() => { const i = process.argv.indexOf('--pestana'); return i > 0 ? process.argv[i + 1] : null })()

/** Una celda del snapshot (`{f,v}`) o de la hoja viva, como texto comparable. Puro. */
export function textoDe(c) {
  if (!c) return ''
  const v = c.f ?? c.v ?? c.formula ?? c.valor ?? ''
  return v == null ? '' : String(v)
}

/**
 * NÚCLEO PURO: las celdas que CAMBIARON entre el snapshot y la hoja viva, y que hoy tienen contenido.
 * Ésas las escribió el OS en la corrida. Las que no cambiaron no se reclaman: ver el encabezado.
 */
export function celdasQueEscribioElOs(antes = [], ahora = []) {
  const out = []
  for (let i = 0; i < ahora.length; i++) {
    const fa = ahora[i] || []
    for (let j = 0; j < fa.length; j++) {
      const nuevo = textoDe(fa[j])
      if (!formaDe(nuevo)) continue          // hoy está vacía: no hay nada que reclamar
      if (textoDe((antes[i] || [])[j]) === nuevo) continue // no cambió: puede ser suya, no la reclamo
      out.push({ fila: i + 1, col: j, valor: nuevo })
    }
  }
  return out
}

/** El último snapshot pre-corrida de cada pestaña. */
async function snapshotsPorPestana() {
  const { rows } = await query(
    `select distinct on (pestana) pestana, grid, created_at
       from orq.sheet_snapshots where file_id = $1 and tool = 'flujo-caja-rehacer'
      order by pestana, created_at desc`, [ID])
  return rows
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const snaps = (await snapshotsPorPestana()).filter((s) => !SOLO || s.pestana === SOLO)
  if (!snaps.length) { console.log('no hay snapshots de "flujo-caja-rehacer" para este archivo'); return }
  console.log(`${snaps.length} pestaña(s) con snapshot previo${DRY ? ' — (--dry) no escribo nada en la base' : ''}\n`)

  let total = 0; let yaTenian = 0
  for (const s of snaps) {
    let vivo
    try {
      const g = await google.readSheetGrid(ID, s.pestana)
      vivo = (g.filas || []).map((f) => (f || []).map((c) => ({ f: c?.formula ?? null, v: c?.valor ?? null })))
    } catch (e) {
      console.log(`  ${s.pestana.padEnd(26)} NO PUDE LEERLA (${String(e.message).slice(0, 60)})`)
      continue
    }
    const cambiadas = celdasQueEscribioElOs(s.grid ?? [], vivo)
    // Las que ya tienen huella no se tocan: el registro del OS manda sobre esta deducción.
    const { rows } = await query('select fila, col from public.sheet_huella_celda where file_id = $1 and pestana = $2', [ID, s.pestana])
    const existentes = new Set(rows.map((r) => `${r.fila}:${r.col}`))
    const aSembrar = cambiadas.filter((c) => !existentes.has(`${c.fila}:${c.col}`))
    yaTenian += cambiadas.length - aSembrar.length
    total += aSembrar.length
    const muestra = aSembrar.slice(0, 5).map((c) => `${letraCol(c.col)}${c.fila}`).join(', ')
    console.log(`  ${s.pestana.padEnd(26)} ${String(aSembrar.length).padStart(5)} a sembrar `
      + `(de ${cambiadas.length} cambiadas; ${cambiadas.length - aSembrar.length} ya tenían huella)`
      + (muestra ? `  ej: ${muestra}` : ''))
    if (DRY || !aSembrar.length) continue
    for (let i = 0; i < aSembrar.length; i += 400) {
      const tanda = aSembrar.slice(i, i + 400)
      const vals = tanda.map((_, k) => `($1,$2,$${k * 5 + 3},$${k * 5 + 4},$${k * 5 + 5},$${k * 5 + 6},$${k * 5 + 7}, now())`).join(',')
      await query(
        `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, valor, escrito_en)
         values ${vals} on conflict (file_id, pestana, fila, col) do nothing`,
        [ID, s.pestana, ...tanda.flatMap((c) => [c.fila, c.col, formaDe(c.valor).slice(0, LARGO_FORMA), huellaDe(c.valor) ?? '', String(c.valor).slice(0, LARGO_FORMA)])])
    }
  }
  console.log(`\n${DRY ? '(--dry) sembraría' : 'sembré'} ${total} huella(s); ${yaTenian} ya estaban.`)
  console.log('Lo que NO cambió entre el snapshot y hoy queda SIN huella a propósito: podría ser tuyo.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => { console.error('ERROR:', e.message); await closePool(); process.exit(1) })
}
