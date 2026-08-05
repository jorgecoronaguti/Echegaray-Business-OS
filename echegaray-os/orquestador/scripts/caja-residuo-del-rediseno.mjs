#!/usr/bin/env node
// QUÉ QUEDÓ EN "Caja" DEL DISEÑO VIEJO — Y POR QUÉ NINGÚN GENERADOR LO PUEDE SACAR.
//
// ═══ EL PROBLEMA, DICHO SIN ADORNOS (05/08/2026) ═══
//
// CAJA pasó de 143 filas a 45. Las 98 filas de abajo, y algunas celdas sueltas adentro de las 45,
// siguen mostrando contenido del layout anterior: `F143 = 30/12/1899`, dos importes de $54.036.925 en
// la fila del título del bloque 5. El auditor de pantalla los cuenta como defectos de CAJA, y tiene
// razón: están ahí y se leen.
//
// **Y NO LOS PUEDE BORRAR EL GENERADOR, A PROPÓSITO.** `lib/no-borrar.mjs` corrige toda escritura que
// deje vacía una celda que hoy tiene algo, sin condición y sin bypass: no la levanta
// `ORQ_SHEETS_DESCONGELAR`, ni `respetar:false`, ni `--force`. Esa regla existe porque este repo tiene
// SIETE pérdidas registradas y ninguna fue un borrado a propósito: todas fueron escrituras "válidas"
// que pusieron blancos encima de datos del dueño. Un generador que se achica de 143 filas a 45 es
// exactamente la silueta de una de esas siete.
//
// Es el mismo precedente que ya se pagó con las 66 celdas de prosa de la columna H: *"lo que este
// cambio garantiza es que el generador no las vuelva a producir; las que ya están las saca una
// persona, una vez, y esta vez no vuelven"*.
//
// ═══ QUÉ HACE ESTE SCRIPT, ENTONCES ═══
//
// LEE Y REPORTA. No escribe una celda. Su trabajo es que el borrado manual sea una decisión con
// evidencia y no un "borrá de la 46 para abajo", que es exactamente cómo se pierde trabajo.
//
// Por cada celda candidata dice su referencia A1, su contenido, y —lo que decide— si la escribió ESTE
// generador en alguna corrida anterior. Esa prueba sale de `public.sheet_huella_celda`, que guarda la
// huella de cada celda que el generador escribió. Una celda cuya huella coincide es MÍA y se puede
// borrar tranquilo; una que no coincide **puede ser del dueño** y este script no la recomienda: la
// lista aparte, para que la mire una persona.
//
//   node orquestador/scripts/caja-residuo-del-rediseno.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { leerHuellas, huellaDe, claveCelda } from '../lib/huella-celda.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { grilla, ANCHO } from '../lib/caja-grilla.mjs'
import { refsDelArchivo, rescatar } from '../lib/caja-refs.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'

const letra = (i) => String.fromCharCode(65 + i)
const vacia = (v) => v === undefined || v === null || v === VACIO || String(v).trim() === ''

/**
 * NÚCLEO PURO: las celdas que hoy tienen contenido y el diseño nuevo no reclama.
 *
 * DOS FAMILIAS, Y SE INFORMAN SEPARADAS PORQUE SE DECIDEN DISTINTO:
 *   · `afuera` — debajo del alto de la grilla nueva. El generador ni las mira: nunca las va a limpiar
 *     ni las va a pisar. Son residuo puro.
 *   · `adentro` — dentro de las 45 filas, en una celda que el generador declara SUYA Y VACÍA (el
 *     centinela). Ahí sí intentó limpiarlas y `no-borrar` se lo impidió, así que van a seguir ahí en
 *     cada corrida.
 *
 * @param {any[][]} actual lo que hay hoy en la pestaña
 * @param {any[][]} nueva la grilla que el generador escribe hoy
 * @param {(fila:number,col:number)=>boolean} esMia si la huella prueba que la escribió el generador
 */
export function residuo(actual = [], nueva = [], esMia = () => false) {
  const out = { afuera: [], adentro: [] }
  for (const [i, fila] of actual.entries()) {
    for (const [j, v] of (fila ?? []).entries()) {
      if (j >= ANCHO || vacia(v)) continue
      const declarada = nueva[i]?.[j]
      const dentro = i < nueva.length
      if (dentro && !vacia(declarada)) continue          // el generador la reescribe: no es residuo
      if (dentro && declarada === undefined) continue    // es del dueño por diseño (el arqueo)
      out[dentro ? 'adentro' : 'afuera'].push({
        ref: `${letra(j)}${i + 1}`, fila: i + 1, col: j, valor: String(v).slice(0, 60), mia: esMia(i + 1, j),
      })
    }
  }
  return out
}

async function main() {
  // SIN `scopes`: el cliente sale con los permisos de SOLO LECTURA, que es el default. No es una
  // convención de estilo — es que este script NO PUEDE escribir aunque alguien le agregue una llamada
  // por error. Un reporte sobre qué borrar tiene que ser incapaz de borrar.
  const google = makeGoogleClient({ config: loadConfig() })
  const hojas = await google.getSheetMeta(ID)
  const tab = hallarPestana(hojas, PESTAÑA).title

  const previo = await google.readSheetGrid(ID, `${tab}!A1:I`).catch(() => ({ filas: [] }))
  const refs = await refsDelArchivo(google, ID, hojas)
  const g = grilla(rescatar(previo.filas ?? []), refs)
  // SE LEE LA FÓRMULA, NO EL VALOR: una celda con `=SUM(...)` que muestra "" TIENE contenido, y
  // borrarla es borrar. La huella se calcula sobre la misma forma con la que se guardó.
  const actual = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}`, { render: 'FORMULA' })

  let huellas = new Map()
  try { huellas = await leerHuellas(ID, PESTAÑA) } catch (e) {
    console.log(`  ⚠ sin huellas (${e.message}): no puedo probar qué celda es mía. Todo va a la lista de "mirar a mano".`)
  }
  const esMia = (fila, col) => {
    const h = huellas.get(claveCelda(fila, col))
    return Boolean(h) && h.huella === huellaDe(actual[fila - 1]?.[col])
  }

  const r = residuo(actual, g.filas, esMia)
  const total = r.afuera.length + r.adentro.length
  console.log(`\n"${tab}": la grilla nueva mide ${g.filas.length} filas y la pestaña llega hasta la ${actual.length}.`)
  console.log(`${total} celda(s) con contenido que el diseño nuevo no reclama.\n`)

  const listar = (titulo, celdas) => {
    if (!celdas.length) return
    console.log(`── ${titulo} (${celdas.length}) ──`)
    for (const c of celdas.slice(0, 40)) console.log(`   ${c.mia ? '✔ mía  ' : '? mirar'}  ${c.ref.padEnd(6)} ${c.valor}`)
    if (celdas.length > 40) console.log(`   … y ${celdas.length - 40} más`)
    console.log()
  }
  listar('DEBAJO DE LA GRILLA NUEVA — el generador ni las mira', r.afuera)
  listar('ADENTRO — el generador las declara suyas y vacías, y no-borrar se lo impide', r.adentro)

  const mias = [...r.afuera, ...r.adentro].filter((c) => c.mia)
  const dudosas = [...r.afuera, ...r.adentro].filter((c) => !c.mia)
  console.log('── QUÉ HACER ──')
  if (!total) {
    console.log('   Nada: no quedó residuo del diseño viejo.')
  } else {
    console.log(`   ${mias.length} celda(s) tienen la huella de este generador: son mías y se pueden borrar.`)
    console.log(`   ${dudosas.length} celda(s) NO se pueden probar mías. Las mira una persona antes de tocarlas.`)
    const f = [...r.afuera, ...r.adentro].map((c) => c.fila)
    if (f.length) console.log(`   El residuo va de la fila ${Math.min(...f)} a la ${Math.max(...f)}.`)
    console.log('\n   ⚠ NO lo borra este script y NO lo va a borrar ningún generador: lib/no-borrar.mjs')
    console.log('     corrige toda escritura que deje vacía una celda con contenido, sin bypass y a')
    console.log('     propósito (siete pérdidas registradas). Lo borra una persona, una vez, mirando')
    console.log('     esta lista — y no vuelve, porque el generador nuevo ya no las produce.')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
