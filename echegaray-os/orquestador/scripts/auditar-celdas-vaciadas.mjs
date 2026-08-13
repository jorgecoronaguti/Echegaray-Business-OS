#!/usr/bin/env node
// ¿QUÉ CELDAS QUE VOS VACIASTE REESCRIBIRÍA LA PRÓXIMA CORRIDA? — ANTES de que corra.
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// El dueño, reincidente: *"seguís sin respetar q si hay celdas con contenido q yo borro, no las
// vuelvas a escribir"*. El mecanismo existe desde el 05/08 y en algunos lados anda: CAJA loguea
// "🚫 vos vaciaste la celda A17: no vuelvo a escribir …". La pregunta que nadie podía contestar era
// DÓNDE NO ANDA, y la única forma de enterarse era que él viera volver algo suyo dos horas después.
//
// Este auditor NO escribe una celda. Contesta tres cosas, en orden de gravedad:
//
//   1. SIN MECANISMO — pestañas del archivo que un generador escribe y que NO tienen una sola huella
//      sellada. Ahí un borrado tuyo no se puede ni detectar: no hay con qué probar que la celda era
//      mía. Es el agujero estructural, no un caso puntual.
//   2. EN RIESGO — celdas ya marcadas como vaciadas por vos que la próxima corrida repondría.
//   3. SIN VEREDICTO DE POSICIÓN — pestañas donde el mapa de coordenadas no alinea. Ya no son un
//      agujero (se decide por forma), pero es donde el mecanismo trabaja con la prueba más débil, y
//      el número tiene que estar a la vista.
//
// ES LA MEDICIÓN QUE CONVIERTE ESTO EN VERIFICABLE. Se corre antes y después de tocar el mecanismo, y
// la diferencia entre las dos salidas es la evidencia. Sale ≠0 si hay algo en riesgo.
//
//   node orquestador/scripts/auditar-celdas-vaciadas.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { claveCelda, mejorDesplazamiento } from '../lib/huella-celda.mjs'
import { formaComparable, formaDe, formasAusentes, formasPresentes } from '../lib/huella-forma.mjs'
import { esEspejo } from '../lib/no-borrar.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const L = (j) => { let s = ''; for (let n = j; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const ref = (t) => (/[^A-Za-z0-9_]/.test(t) ? `'${t.replace(/'/g, "''")}'` : t)

/** El mapa sellado del archivo, agrupado por pestaña. Es la única fuente de "esta celda la escribí yo". */
async function huellasPorPestana(fileId) {
  const r = await query(
    'select pestana, fila, col, forma, huella, borrada_en from public.sheet_huella_celda where file_id = $1',
    [fileId],
  )
  const out = new Map()
  for (const x of r.rows) {
    if (!out.has(x.pestana)) out.set(x.pestana, new Map())
    out.get(x.pestana).set(claveCelda(x.fila, x.col), {
      forma: x.forma, huella: x.huella, borrada: Boolean(x.borrada_en), fila: x.fila, col: x.col,
    })
  }
  return out
}

/**
 * NÚCLEO PURO: el veredicto por celda marcada. Una marca está PROTEGIDA si la próxima corrida la va a
 * respetar, y EN RIESGO si la va a reponer.
 *
 * Con el mapa alineado, la celda se defiende por su coordenada (el camino fuerte). Sin mapa, se
 * defiende por su FORMA: si esa forma ya no está en ninguna parte de la pestaña, la supresión se
 * vuelve a emitir. Si la forma reapareció en otro lado, la marca ya no aplica y hay que decirlo.
 */
export function veredictoDeMarcas(marcadas = [], alineada = false, presentes = new Set()) {
  return marcadas.map((m) => {
    if (alineada) return { ...m, estado: 'PROTEGIDA', por: 'coordenada sellada' }
    if (!presentes.has(formaComparable(m.forma))) return { ...m, estado: 'PROTEGIDA', por: 'forma ausente de la pestaña' }
    return { ...m, estado: 'EN RIESGO', por: 'sin mapa de posición y su forma volvió a aparecer en la pestaña' }
  })
}

async function main() {
  const google = makeGoogleClient(loadConfig(), { scopes: WRITE_SCOPES })
  const porPestana = await huellasPorPestana(ID)
  const meta = await google.getSheetMeta(ID)

  // 1 · SIN MECANISMO: pestañas del archivo sin una sola huella. Los espejos `_*` quedan afuera: son
  // réplicas byte a byte de una fuente externa y no llevan huella por diseño.
  const sinHuella = meta.filter((m) => !esEspejo(m.title) && !porPestana.has(m.title)).map((m) => m.title)
  if (sinHuella.length) {
    console.log(`\n⛔ SIN MECANISMO — ${sinHuella.length} pestaña(s) sin una sola celda sellada por el OS.`)
    console.log('   Un borrado tuyo ahí no se puede ni detectar: no hay evidencia de que la celda fuera mía.')
    for (const t of sinHuella) console.log(`   · ${t}`)
  }

  let enRiesgo = 0
  const sinMapa = []
  for (const [tab, huellas] of porPestana) {
    const maxFila = Math.max(...[...huellas.values()].map((h) => h.fila))
    const maxCol = Math.max(...[...huellas.values()].map((h) => h.col))
    const actual = await google
      .readSheetValues(ID, `${ref(tab)}!A1:${L(maxCol)}${maxFila + 6}`, { render: 'FORMULA' })
      .catch((e) => { console.warn(`   ⚠ no pude leer "${tab}": ${e.message}`); return null })
    if (!actual) continue

    const al = mejorDesplazamiento(actual, huellas, { fila0: 1, col0: 0 })
    const presentes = formasPresentes(actual)
    const marcadas = [...huellas.values()].filter((h) => h.borrada)
    const veredictos = veredictoDeMarcas(marcadas, al.alineada, presentes)
    const riesgo = veredictos.filter((v) => v.estado === 'EN RIESGO')
    enRiesgo += riesgo.length

    if (!al.alineada) {
      // Sin mapa, lo que la próxima corrida va a respetar sale de la forma. Se muestra el número para
      // que se vea que el mecanismo NO está apagado en esas pestañas, que es como estuvo hasta hoy.
      const { confirmadas, nuevas } = formasAusentes(huellas, presentes)
      sinMapa.push({ tab, fraccion: al.fraccion, confirmadas: confirmadas.size, nuevas: nuevas.size })
    }
    for (const v of riesgo) {
      console.log(`\n🔴 ${tab}!${L(v.col)}${v.fila} — la próxima corrida REPONE "${String(v.forma).slice(0, 50)}"`)
      console.log(`   ${v.por}`)
    }
    const vivasHoy = marcadas.filter((m) => formaDe((actual[m.fila - 1] || [])[m.col])).length
    if (marcadas.length) {
      console.log(`\n✔ ${tab}: ${marcadas.length} celda(s) que vaciaste · ${veredictos.filter((v) => v.estado === 'PROTEGIDA').length} protegidas`
        + `${vivasHoy ? ` · ${vivasHoy} con contenido hoy (la marca ya no corre: alguien las volvió a llenar)` : ''}`)
    }
  }

  if (sinMapa.length) {
    console.log('\n⚠ SIN VEREDICTO DE POSICIÓN — acá el mecanismo decide por FORMA, que es la prueba más débil:')
    for (const s of sinMapa) {
      console.log(`   · ${s.tab.padEnd(24)} alineación ${s.fraccion.toFixed(2)} · ${s.confirmadas} borrado(s) ya confirmado(s) · ${s.nuevas} forma(s) mía(s) que hoy no están`)
    }
  }

  console.log(`\n${enRiesgo ? '🔴' : '✅'} ${enRiesgo} celda(s) que vaciaste volverían en la próxima corrida.`)
  if (sinHuella.length) console.log(`   Y ${sinHuella.length} pestaña(s) escriben sin poder detectar un borrado tuyo (arriba).`)
  process.exitCode = enRiesgo ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
