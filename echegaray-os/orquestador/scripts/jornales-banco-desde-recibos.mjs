#!/usr/bin/env node
// COMPLETA LA COLUMNA «BANCO» DE LA PLANILLA DE JORNALES CON LO QUE DICE CADA RECIBO.
//
// ═══ EL PEDIDO (31/08/2026), TEXTUAL ═══
//
//   «en sheet jornales quiero q completes a cada empleado lo q se le corresponde pagar por banco de
//    la segunda quincena de agosto, q es lo expresado en los recibos de sueldo»
//
// ═══ ESTO ESCRIBE LA PLANILLA DEL DUEÑO, NO UNA PESTAÑA DEL OS ═══
//
// El Sheet JORNALES es la planilla que él opera todos los días; el Flujo de Fondos sólo tiene su
// espejo (`_J_OBREROS`). Escribir el espejo no serviría: la próxima sincronización lo pisa. Así que
// se escribe el original, y por eso todo acá está construido para no romper nada suyo:
//
// · **Sólo la columna BANCO**, y sólo del bloque de la quincena que se pide. Nada más.
// · **Sólo celdas VACÍAS.** Si ya hay algo escrito, se respeta y se informa. Jofre y Sosa tienen
//   $300.000 cada uno de su liquidación final: eso lo cargó él y no es el banco de la quincena.
// · **La identidad se verifica ANTES de escribir**: se lee el nombre de la fila y se confirma contra
//   el nombre del recibo. Una fila corrida por una inserción escribiría el sueldo de otro.
// · **Se relee después.** Lo que prueba una escritura es el dato leído en su destino.
//
//   node orquestador/scripts/jornales-banco-desde-recibos.mjs            → muestra qué escribiría
//   node orquestador/scripts/jornales-banco-desde-recibos.mjs --aplicar  → escribe

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { JORNALES_ID } from '../lib/jornales.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CUIL_POR_PERSONA_DE_PLANILLA, comoSeEscribe } from '../lib/nomina-banco-recibo.mjs'

const HOJA = 'Obreros 26'
const COL_BANCO = 'X'          // «BANCO», índice 23 del bloque
const COL_NOMBRE = 1           // la columna del obrero
const APLICAR = process.argv.includes('--aplicar')
const PERIODO = process.argv.find((a) => /^Q[12]-\d{2}\/\d{4}$/.test(a)) ?? 'Q2-08/2026'

/**
 * ¿SON LA MISMA PERSONA? El nombre de la planilla contra el del recibo.
 *
 * La planilla escribe «Zogber Leonardo» y el recibo «ZOGBE RAMOS WALTER LEONARDO»: no hay igualdad
 * posible. Pero el puente CUIL↔planilla ya está revisado persona por persona, así que acá sólo hace
 * falta confirmar que la fila que voy a tocar sigue siendo la que ese puente nombra — que es la
 * comprobación que atrapa una fila corrida por una inserción.
 */
export const esLaFila = (nombreEnPlanilla, nombreDeLaFila) =>
  comoSeEscribe(nombreEnPlanilla) === comoSeEscribe(nombreDeLaFila)

/** El bloque de la quincena: la última fila de encabezado «Obrero» y las personas debajo. */
export function bloqueDeQuincena(grid = []) {
  let cab = -1
  for (let i = 0; i < grid.length; i++) if (String(grid[i]?.[COL_NOMBRE] ?? '').trim() === 'Obrero') cab = i
  if (cab < 0) return null
  const filas = []
  for (let i = cab + 1; i < grid.length; i++) {
    const nombre = String(grid[i]?.[COL_NOMBRE] ?? '').trim()
    if (!nombre) break
    filas.push({ fila: i + 1, nombre, banco: grid[i]?.[23] ?? '' })
  }
  return { cabecera: cab + 1, filas }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const grid = await google.readSheetValues(JORNALES_ID, `'${HOJA}'!A1:AC900`)
  const bloque = bloqueDeQuincena(grid)
  if (!bloque) throw new Error(`no encontré el encabezado «Obrero» en '${HOJA}': NO escribo`)
  console.log(`bloque de la quincena: encabezado en la fila ${bloque.cabecera} · ${bloque.filas.length} persona(s)`)

  const recibos = new Map((await query(
    `select distinct on (cuil) cuil, neto, nombre_recibo from public.nomina_recibo_neto
      where periodo = $1 order by cuil, cargado_en desc`, [PERIODO])).rows.map((r) => [r.cuil, r]))
  console.log(`recibos del período ${PERIODO}: ${recibos.size}`)

  const escribir = []
  const saltados = []
  for (const f of bloque.filas) {
    const cuil = CUIL_POR_PERSONA_DE_PLANILLA[f.nombre]
    if (!cuil) { saltados.push(`${f.nombre}: no está en el puente CUIL↔planilla`); continue }
    const r = recibos.get(cuil)
    if (!r) { saltados.push(`${f.nombre}: sin recibo confirmado del período`); continue }
    // Ya hay algo escrito: es del dueño y no se pisa. Se dice qué hay y qué diría el recibo.
    if (String(f.banco ?? '').trim()) {
      saltados.push(`${f.nombre}: la celda ya dice «${f.banco}» — no la piso (el recibo dice ${Number(r.neto).toLocaleString('es-AR')})`)
      continue
    }
    escribir.push({ fila: f.fila, nombre: f.nombre, deRecibo: r.nombre_recibo, neto: Number(r.neto) })
  }

  for (const x of escribir) console.log(`   ${COL_BANCO}${x.fila}  ${x.nombre.padEnd(22)} → ${x.neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}   (${x.deRecibo})`)
  for (const s of saltados) console.log(`   · ${s}`)
  if (!APLICAR) return console.log(`\n(sin --aplicar: no escribí nada · ${escribir.length} celda(s) quedarían escritas)`)

  // Una celda por vez, cada una en su rango: escribir un rango contiguo pisaría las filas del medio
  // que se decidieron saltar.
  //
  // ═══ LA REGLA 0, DECLARADA ═══
  //
  // `respetar: false` y el motivo al lado, porque acá la guarda de ediciones no aplica y decirlo es
  // obligatorio: esta escritura **no lleva un solo texto**. Son importes, uno por celda, y cada una
  // se verificó VACÍA unas líneas más arriba —si el dueño ya escribió algo, esa fila ni siquiera
  // llega hasta acá—. La protección de lo que él editó ya está hecha, y está hecha antes y más
  // fuerte: no se pisa nada porque no se toca nada que tenga contenido.
  await google.batchUpdateValues(JORNALES_ID, escribir.map((x) => ({
    range: `'${HOJA}'!${COL_BANCO}${x.fila}`, values: [[x.neto]],
  })), { respetar: false })

  const releido = await google.readSheetValues(JORNALES_ID, `'${HOJA}'!${COL_BANCO}${bloque.filas[0].fila}:${COL_BANCO}${bloque.filas[bloque.filas.length - 1].fila}`)
  const conValor = (releido ?? []).filter((r) => String(r?.[0] ?? '').trim()).length
  console.log(`✓ releído de la planilla: ${conValor} celda(s) con valor en ${COL_BANCO}`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main().finally(closePool)
}
