#!/usr/bin/env node
// MIDE EL ALINEAMIENTO DE LA HUELLA CONTRA LA PESTAÑA VIVA. NO ESCRIBE NADA.
//
// ═══ POR QUÉ HACÍA FALTA (15/08/2026) ═══
//
// El alineamiento de la huella decidía en silencio y sólo se podía leer DE PASO, en el log de una
// corrida que además escribía. Para saber si el sello de "Proveedores" mejoró había que correr el
// generador contra el archivo del dueño — o sea, la única forma de medir era intervenir. Eso es
// exactamente lo que este repo no puede hacer desde un worktree: una escritura de Proveedores desde
// un worktree ya borró la pestaña entera.
//
// Lo que mide es LA MISMA PREGUNTA que se hace `aplicarHuella` al arrancar la corrida siguiente:
// ¿las formas que sellé caen donde mi mapa dice, sobre la pestaña de HOY? Si la respuesta es sí, la
// corrida siguiente va a poder decidir celda por celda —y limpiar su residuo—. Si es no, no decide.
//
// UN CONTROL NO SE VALIDA CONTRA LA INFORMACIÓN QUE PRODUCE: la fuente del mapa es Postgres
// (`sheet_huella_celda`, lo que la última corrida SELLÓ) y la fuente de la pestaña es la API de
// Sheets leída en el momento. No se le pregunta al generador qué cree que escribió.
//
// LA VENTANA SALE DE LA HUELLA, NO DE UN RECTÁNGULO TIPEADO. Anclar la medición en una fila fija es
// el mismo defecto que persigue el resto de este archivo: la pestaña se mueve y la medición pasa a
// describir otra cosa. El rectángulo es el bounding box de lo que hay sellado.
//
//   node orquestador/scripts/medir-huella-pestana.mjs Proveedores Materiales
//
// Sale con código ≠0 si alguna pestaña pedida NO alinea: es un medidor, y su forma de avisar es esa.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { leerHuellas, mejorDesplazamiento, UMBRAL_ALINEACION, MIN_COMPARABLES } from '../lib/huella-celda.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { query, closePool } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: el rectángulo que ocupa un mapa de huellas.
 *
 * Devuelve `null` cuando no hay una sola huella — que NO es lo mismo que un rectángulo vacío: es
 * "esta pestaña nunca se selló", el estado en el que estuvieron Proveedores y Materiales hasta hoy y
 * el que hace que la alineación no llegue nunca a medirse.
 *
 * @param {Map<string, object>} huellas lo que devuelve `leerHuellas`
 * @returns {{fila0:number, filaN:number, col0:number, colN:number, celdas:number}|null}
 */
export function ventanaDeHuellas(huellas) {
  let fila0 = Infinity; let filaN = -Infinity; let col0 = Infinity; let colN = -Infinity; let n = 0
  for (const clave of huellas.keys()) {
    const [f, c] = String(clave).split(':').map(Number)
    if (!Number.isFinite(f) || !Number.isFinite(c)) continue
    fila0 = Math.min(fila0, f); filaN = Math.max(filaN, f)
    col0 = Math.min(col0, c); colN = Math.max(colN, c)
    n++
  }
  return n ? { fila0, filaN, col0, colN, celdas: n } : null
}

/**
 * NÚCLEO PURO: el veredicto legible de una medición.
 *
 * Se separa del transporte para poder probarlo sin Sheet ni base. `fraccion` es el número que decide
 * —el mismo que compara `mejorDesplazamiento` contra `UMBRAL_ALINEACION`—; el resto es para leerlo.
 */
export function veredicto(pestana, alineacion, ventana) {
  const pct = (alineacion.fraccion * 100).toFixed(1)
  return {
    pestana,
    alineada: alineacion.alineada,
    fraccion: alineacion.fraccion,
    comparables: alineacion.comparables,
    off: alineacion.off,
    celdasSelladas: ventana?.celdas ?? 0,
    linea: `${pestana}: ${pct}% (${alineacion.comparables} comparables, corrimiento ${alineacion.off ?? 0}) `
      + `— umbral ${(UMBRAL_ALINEACION * 100).toFixed(0)}% · ${alineacion.alineada ? 'ALINEA' : 'NO ALINEA'} · ${alineacion.motivo}`,
  }
}

async function medir(google, pestana) {
  const huellas = await leerHuellas(ID, pestana)
  const ventana = ventanaDeHuellas(huellas)
  if (!ventana) {
    console.log(`${pestana}: SIN HUELLA — 0 celdas selladas. La alineación no llega a medirse y `
      + '`aplicarHuella` no recorre una sola celda: ninguna de las cuatro evidencias de propiedad decide.')
    return { pestana, alineada: false, fraccion: 0, comparables: 0, celdasSelladas: 0 }
  }
  // Se lee EXACTAMENTE el rectángulo sellado y con render FORMULA, que es el render con el que se
  // selló: comparar el valor calculado contra la fórmula da desalineado por construcción.
  const rango = `${refPestana(pestana)}!${letra(ventana.col0)}${ventana.fila0}:${letra(ventana.colN)}${ventana.filaN}`
  const actual = await google.readSheetValues(ID, rango, { render: 'FORMULA' })
  const alineacion = mejorDesplazamiento(actual, huellas, { fila0: ventana.fila0, col0: ventana.col0 })
  const v = veredicto(pestana, alineacion, ventana)
  console.log(v.linea)
  console.log(`  rectángulo sellado ${rango} · ${ventana.celdas} celdas con huella`)
  if (alineacion.comparables < MIN_COMPARABLES) console.log(`  ⚠ menos de ${MIN_COMPARABLES} comparables: el número no es un juicio, es una casualidad`)
  return v
}

async function main() {
  const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const pestanas = pedidas.length ? pedidas : ['Proveedores', 'Materiales']
  const config = loadConfig()
  const google = makeGoogleClient({ config })
  const r = await query(
    `select pestana, count(*) as n, max(escrito_en) as ultimo,
            count(*) filter (where borrada_en is not null) as borradas,
            count(*) filter (where abandonada_en is not null) as abandonadas
       from public.sheet_huella_celda where file_id = $1 and pestana = any($2) group by pestana`,
    [ID, pestanas],
  )
  for (const x of r.rows) {
    console.log(`${x.pestana}: ${x.n} celdas selladas · ${x.borradas} marcadas borrada_en · ${x.abandonadas} abandonadas · último sello ${x.ultimo?.toISOString?.() ?? x.ultimo}`)
  }
  const out = []
  for (const p of pestanas) out.push(await medir(google, p))
  await closePool()
  const mal = out.filter((v) => !v.alineada)
  if (mal.length) {
    console.log(`\n✗ ${mal.length} pestaña(s) sin mapa de posición: ${mal.map((v) => v.pestana).join(', ')}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ todas alinean: la corrida siguiente puede decidir celda por celda')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
