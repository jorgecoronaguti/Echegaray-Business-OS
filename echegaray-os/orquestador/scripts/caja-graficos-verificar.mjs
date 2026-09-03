#!/usr/bin/env node
// ¿LOS CUATRO GRÁFICOS DE CAJA ESTÁN DONDE TIENEN QUE ESTAR? — LEE, NO ESCRIBE.
//
// POR QUÉ EXISTE (03/09/2026). El arreglo del 02/09 —la hoja tiene que llegar hasta la última fila que
// ocupan los gráficos, no hasta su ancla— se cerró con la evidencia del REQUEST. El 03/09 a las 08:25
// el dueño vio la pestaña rota otra vez: la hoja había quedado en 55 filas y el editor vivo de Google
// subió el bloque 3 encima del bloque 2. Nadie se enteró en veinticuatro horas porque nadie volvió a
// LEER la hoja. Esto es esa lectura, y se puede correr sola: un control que sólo existe adentro del
// generador no sirve para contestar "¿está bien AHORA?".
//
// NO ESCRIBE NADA, Y NO PUEDE: el cliente se construye con los scopes de sólo lectura, así que no es
// una promesa del comentario sino una imposibilidad del token. Por eso se puede correr desde un
// worktree, donde escribir el Sheet real está prohibido.
//
//   node orquestador/scripts/caja-graficos-verificar.mjs
//   → exit 0 si el layout está bien · exit 1 si no

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import {
  leerLayoutDeGraficos, verificarLayoutGraficos, layoutEsperado, anclasDeCharts, FILA_FINAL_DE_GRAFICOS,
} from '../lib/caja-graficos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const tab = hallarPestana(await google.getSheetMeta(ID), PESTAÑA).title
  const { rows, charts } = await leerLayoutDeGraficos(google, ID, tab)

  console.log(`${tab} — ${rows} fila(s) de grilla (el layout de gráficos necesita ${FILA_FINAL_DE_GRAFICOS + 1})`)
  console.log(`${charts.length} gráfico(s) en la pestaña:`)
  // Se imprime SIEMPRE lo leído, esté bien o mal: un veredicto sin los números que lo produjeron
  // obliga a volver a mirar el archivo para poder discutirlo.
  const esperados = layoutEsperado()
  for (const c of anclasDeCharts(charts)) {
    const e = esperados.find((x) => x.titulo === c.titulo)
    const donde = `fila ${c.fila + 1} · x=${c.x}px`
    const debe = e ? (e.fila === c.fila && e.x === c.x ? '✓' : `✗ le corresponde fila ${e.fila + 1} · x=${e.x}px`) : '· no es del generador'
    console.log(`  ${c.titulo} → ${donde} ${debe}`)
  }

  const { ok, problemas } = verificarLayoutGraficos({ rows, charts })
  if (ok) return console.log('\n✓ el layout de gráficos de CAJA está como corresponde')
  console.log('')
  for (const p of problemas) console.log(`✗ ${p}`)
  console.log('\nSe arregla corriendo el generador desde el árbol principal: node orquestador/scripts/caja-pestana.mjs')
  process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
