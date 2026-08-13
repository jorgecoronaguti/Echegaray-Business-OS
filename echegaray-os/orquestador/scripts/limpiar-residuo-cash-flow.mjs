#!/usr/bin/env node
// SACAR DE LAS DOS PESTAÑAS DE CASH FLOW EL RESIDUO QUE DEJÓ LA VERIFICACIÓN DEL ATAJO.
//
// ═══ QUÉ HAY QUE SACAR, Y POR QUÉ SIGUE AHÍ ═══
//
// A la vista, en la última fila de cada pestaña: `Cash Flow Semanal!A107 = "AH7"` y
// `Cash Flow Mensual!A109 = "I7"` (verificado con captura el 13/08/2026). No los escribió el dueño.
// Los escribe `verificarPresentacion` de `flujo-caja-rehacer-todo.mjs`: para saber a qué celda apunta
// el atajo pega su expresión en una celda de apunte, lee el resultado y repone lo que había. Reponer
// lo que había es escribir VACÍO sobre LLENO, y ahí `no-borrar` hace lo único que sabe hacer —gana el
// destino—. El OS se pisaba a sí mismo cada dos horas y el log lo llamaba "tuyo".
//
// LA RECURRENCIA YA ESTÁ CERRADA en el propio control (repone con `vaciarPropio`, ver allá). Esto
// limpia lo que YA quedó publicado, que no se cura solo.
//
// ═══ POR QUÉ NO ES UN `clearValues` NI UN BARRIDO ═══
//
// Este repo tiene seis pérdidas de trabajo del dueño registradas por scripts que borraron "lo que
// parecía suyo". Acá no se borra nada que no se pueda probar del OS, y la prueba no la firma este
// script: la calcula `esApunteDelAtajo` contra la geometría que el generador DECLARA (la fila de
// encabezados y las columnas de tiempo de esa vista), y el vaciado en sí lo decide `no-borrar`
// releyendo el destino. Si entre la lectura y la escritura el dueño escribe cualquier otra cosa ahí,
// ya no coincide y la celda se conserva.
//
// Sin `--aplicar` no escribe una sola celda.
//
//   node orquestador/scripts/limpiar-residuo-cash-flow.mjs
//   node orquestador/scripts/limpiar-residuo-cash-flow.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { esApunteDelAtajo } from '../lib/cash-flow-hoy.mjs'
import { grillaSemanal, PESTANA_SEMANAL } from '../lib/cash-flow-semanas.mjs'
import { grillaMeses, PESTANA_MENSUAL } from '../lib/cash-flow-meses.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const AÑO = Number(process.env.ORQ_CF_ANIO || 2026)
const APLICAR = process.argv.includes('--aplicar')

/**
 * CUÁNTOS RESIDUOS ES CREÍBLE ENCONTRAR. La celda de apunte es UNA por pestaña; el layout anterior
 * pudo dejar la suya una fila más arriba. Tres ya no es un residuo conocido sino algo que no entiendo,
 * y entonces no escribo: lo mira una persona.
 */
const TOPE = 3

/**
 * NÚCLEO PURO: qué celdas de la columna A son residuo del apunte. Devuelve `[{fila, valor}]`.
 *
 * Dos condiciones, las dos contra la geometría que el generador declara y ninguna contra el valor "a
 * ojo": la celda está DEBAJO de la última fila de contenido del cuadro (ahí el generador no escribe
 * nada, es la zona de los gráficos) y su texto es una referencia A1 a la fila de encabezados de ESTA
 * vista, en una de SUS columnas de tiempo.
 */
export function residuosDeApunte(colA = [], meta) {
  const geo = { filaCabecera: meta.cab.fila, col0: meta.cab.col0, colFin: meta.cab.colTotal }
  const out = []
  colA.forEach((fila, i) => {
    const n = i + 1
    if (n <= meta.filaFin) return
    const valor = (fila || [])[0]
    if (esApunteDelAtajo(valor, geo)) out.push({ fila: n, valor: String(valor).trim() })
  })
  return out
}

const ref = (p) => (/[^A-Za-z0-9_]/.test(p) ? `'${p}'` : p)

async function limpiar(google, pestana, meta) {
  const colA = await google.readSheetValues(ID, `${ref(pestana)}!A1:A${meta.footprint.filas}`)
    .catch((e) => { throw new Error(`no pude leer "${pestana}" (${e.message}). NO escribo a ciegas.`) })
  const hallados = residuosDeApunte(colA, meta)
  if (!hallados.length) {
    console.log(`  ✓ ${pestana}: sin residuo del apunte debajo de la fila ${meta.filaFin}`)
    return 0
  }
  for (const h of hallados) {
    console.log(`  · ${pestana}!A${h.fila} = "${h.valor}" — referencia a la fila ${meta.cab.fila} `
      + `(la de encabezados) en una columna de tiempo de esta vista: es el apunte del atajo`)
  }
  if (hallados.length > TOPE) {
    console.warn(`  ⛔ ${pestana}: ${hallados.length} candidatos y el tope es ${TOPE}. No escribo — miralo antes.`)
    return 0
  }
  if (!APLICAR) {
    console.log(`  (ensayo) vaciaría ${hallados.length} celda(s) de ${pestana}. Agregá --aplicar para escribir.`)
    return 0
  }
  // La escritura pasa por la MISMA guarda que el generador. `mios` lleva los textos que se acaban de
  // leer en el destino; `no-borrar` los vuelve a leer y decide él. Lo que no coincida vuelve intacto.
  const data = hallados.map((h) => ({ range: `${ref(pestana)}!A${h.fila}`, values: [['']] }))
  const r = await google.batchUpdateValues(ID, data, { vaciarPropio: { mios: hallados.map((h) => h.valor) } })
  if (r?.protegido) {
    console.warn(`  ⛔ ${pestana}: la guarda no dejó pasar la escritura: ${r.motivo ?? 'sin motivo'}`)
    return 0
  }
  return hallados.length
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hoy = new Date()
  const vistas = [
    [PESTANA_SEMANAL, grillaSemanal({ hoy, anio: AÑO, refs: {} }).meta],
    [PESTANA_MENSUAL, grillaMeses({ anio: AÑO, refs: {}, hoy }).meta],
  ]
  let n = 0
  for (const [pestana, meta] of vistas) n += await limpiar(google, pestana, meta)
  if (!APLICAR) return console.log('\n  --aplicar para escribir. Nada se tocó.')
  console.log(`\n  ${n} celda(s) vaciada(s). RELEÉ LAS DOS PESTAÑAS: lo que quedó es la evidencia, no este mensaje.`)
}

main().catch((e) => { console.error(`  ⛔ ${e.message}`); process.exitCode = 1 })
