#!/usr/bin/env node
// EL RANGO QUE SE QUEDÓ CORTO — EL DEFECTO QUE NO DA ERROR NI DESCUADRA.
//
// POR QUÉ EXISTE (21/07). El dueño: "hay montos que salen en Cobranzas que tienen fechas
// actualizadas y no se están viendo reflejados los cambios". Los cash flows estaban impecables. El
// culpable era un cuadro que leía `$G$5:$G$58` cuando la pestaña ya tenía 60 filas: $4.435.450
// afuera, sin un error, sin un descuadre, sin nada que mirar.
//
// ES EL DEFECTO MÁS TRAICIONERO DE ESTE ARCHIVO porque empeora solo. El rango se escribe una vez con
// la cantidad de filas que hay ESE día; a partir de ahí, cada fila que se carga queda afuera y la
// diferencia crece sin que ninguna suma se rompa. Un cuadro con un rango corto no está roto: está
// mintiendo despacio.
//
// LO QUE HACE ESTE AUDITOR: recorre TODAS las fórmulas de TODAS las pestañas, extrae hasta qué fila
// lee cada rango, y lo compara con cuántas filas de datos tiene de verdad la pestaña que referencia.
// Reporta dos cosas:
//   · FOSILIZADO — el rango termina antes de la última fila con datos: ya hay plata invisible;
//   · SIN MARGEN — todavía alcanza, pero por menos de 40 filas: es la próxima en fallar.
//
//   node orquestador/scripts/auditar-rangos-fosilizados.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { diagnosticarRango } from '../lib/cobranzas-por-cliente.mjs'
import { PESTANAS } from './formato-pestanas.mjs'

// ═══ SÓLO SE AUDITAN LAS PESTAÑAS DONDE LAS FILAS CRECEN ═══
//
// La primera versión de este auditor miraba todas y reportó 90 "defectos" que no lo eran: en una
// pestaña calculada, `=SUM(E17:E21)` es el total de un bloque de cinco filas, no un rango que se
// quedó corto. Un auditor que grita por noventa cosas bien hechas logra que nadie mire la lista —el
// mismo error que ya cometió el detector de textos cortados con sus 688 falsos positivos.
//
// El defecto sólo existe donde alguien AGREGA FILAS: las cuatro pestañas de carga del dueño y las
// réplicas _RAW, que crecen cuando llega un extracto o un libro nuevo.
const CRECEN = new Set([
  ...PESTANAS.filter((p) => p.carga).map((p) => p.titulo),
])
// LAS RÉPLICAS _RAW QUEDAN AFUERA, aunque también crezcan: sus consumidores leen SUB-BLOQUES a
// propósito —el cuadro de jornales lee un tramo distinto de _J_OBREROS por cada quincena— y cada uno
// de esos tramos parecía un rango corto. Otros 77 falsos positivos. Donde el defecto es real es
// donde alguien AGREGA UNA FILA AL FINAL, que son las cuatro pestañas de carga.
const esQueCrece = (t) => CRECEN.has(t)

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const L = (j) => { let s = ''; for (let n = j; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: los rangos de fila que usa una fórmula, con la pestaña a la que apuntan.
 * Un rango sin pestaña delante apunta a la propia — que es donde vivía el defecto real.
 */
export function rangosDe(formula, pestanaPropia) {
  const out = []
  const re = /(?:'([^']+)'|([A-Za-z_][\w]*))?!?\$?([A-Z]{1,2})\$?(\d{1,5}):\$?([A-Z]{1,2})\$?(\d{1,5})/g
  for (const m of String(formula ?? '').matchAll(re)) {
    const [, comillas, simple, colIni, filaIni, colFin, filaFin] = m
    // SÓLO LOS RANGOS QUE RECORREN FILAS. Un `$X$61:$AA$61` suma cuatro columnas de una fila: no
    // tiene nada que ver con cuántas filas tiene la pestaña, y sin este filtro el auditor reportaba
    // una "fosilización" por cada fila de cada tabla horizontal del archivo.
    const alto = Number(filaFin) - Number(filaIni)
    if (alto < 5) continue
    if (colIni !== colFin) continue
    out.push({ hoja: comillas ?? simple ?? pestanaPropia, fin: Number(filaFin) })
  }
  return out
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)

  // ═══ HASTA DÓNDE LLEGA LA TABLA, QUE NO ES HASTA DÓNDE HAY TEXTO ═══
  //
  // Medir "la última fila con algo en la columna A" da mal: debajo de la tabla, estas pestañas
  // tienen bloques de control con títulos y notas de una sola celda. En Tarjeta de Credito la tabla
  // termina en la 31 y hay texto hasta la 57, así que el auditor reportaba 26 filas invisibles que
  // no existen.
  //
  // Una FILA DE TABLA es ancha —tiene cliente, monto, fecha, estado—; un rótulo de bloque es una
  // celda sola. Cuatro columnas con contenido separan una cosa de la otra.
  const ANCHO_MIN = 4
  const ultima = new Map()
  for (const h of meta) {
    const v = await google.readSheetValues(ID, `'${h.title}'!A1:P${Math.min(h.rows ?? 400, 1000)}`).catch(() => [])
    let u = 0
    v.forEach((r, i) => {
      const llenas = (r || []).filter((c) => String(c ?? '').trim()).length
      if (llenas >= ANCHO_MIN) u = i + 1
    })
    ultima.set(h.title, u)
  }

  const fosilizados = [], sinMargen = []
  for (const h of meta) {
    const gr = await google.readSheetGrid(ID, `'${h.title}'!A1:BZ${Math.min(h.rows ?? 200, 300)}`).catch(() => null)
    if (!gr) continue
    gr.filas.forEach((fila, i) => fila.forEach((c, j) => {
      if (!c?.formula) return
      for (const r of rangosDe(c.formula, h.title)) {
        if (!esQueCrece(r.hoja)) continue
        // EL RANGO ACUMULATIVO NO ES UN RANGO CORTO. `COUNTIFS($AD$4:$AD292;…)` escrito en la fila
        // 292 crece con su propia fila a propósito: es como se ordena la deuda sin usar RANK. Se
        // reconoce porque el rango termina justo en la fila de la fórmula.
        if (r.fin === i + 1 && r.hoja === h.title) continue
        const u = ultima.get(r.hoja)
        if (u == null || u < 5) continue
        const d = diagnosticarRango(r.fin, u)
        const donde = { celda: `${h.title}!${L(j)}${i + 1}`, apunta: r.hoja, fin: r.fin, datos: u, perdidas: d.perdidas }
        if (d.fosilizado) fosilizados.push(donde)
        else if (d.sinMargen) sinMargen.push(donde)
      }
    }))
  }

  const resumir = (lista) => {
    // Una fórmula repetida en 30 filas es UN defecto, no treinta: se agrupa por pestaña y tope.
    const m = new Map()
    for (const d of lista) {
      const k = `${d.apunta}|${d.fin}`
      if (!m.has(k)) m.set(k, { ...d, celdas: [] })
      m.get(k).celdas.push(d.celda)
    }
    return [...m.values()]
  }

  const F = resumir(fosilizados), S = resumir(sinMargen)
  if (F.length) {
    console.log('⚠ RANGOS FOSILIZADOS — ya hay filas cargadas que estas fórmulas NO están mirando:')
    for (const d of F) console.log(`   lee ${d.apunta} hasta la ${d.fin} y hay datos hasta la ${d.datos} (${d.perdidas} fila/s afuera)\n      ${d.celdas.length} celda(s), p.ej. ${d.celdas.slice(0, 3).join(', ')}`)
    console.log()
  }
  if (S.length) {
    console.log('· SIN MARGEN — todavía alcanzan, pero por menos de 40 filas:')
    for (const d of S) console.log(`   lee ${d.apunta} hasta la ${d.fin}, datos hasta la ${d.datos} · ${d.celdas.length} celda(s), p.ej. ${d.celdas[0]}`)
    console.log()
  }
  if (!F.length && !S.length) console.log('✓ ningún rango se quedó corto ni está por quedarse')
  if (F.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
