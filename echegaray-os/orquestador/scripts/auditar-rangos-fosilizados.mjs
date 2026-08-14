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
// ═══ Y LOS RANGOS CON NOMBRE, QUE ES LA MISMA MENTIRA SIN LA LETRA A LA VISTA (03/08) ═══
//
// Un rango A1 corto al menos se LEE en la fórmula. Un nombre no dice a dónde apunta: `OFICINA_BANCO`
// se lee igual de bien sobre el bloque de oficina que sobre doce celdas en blanco de otro layout. De
// 47 nombres del archivo había TRES apuntando a celdas sin un solo dato, y dos líneas de CAJA valían
// $0 por eso — sin un error, sin un descuadre. Este auditor los agrega:
//   · CIEGO    — ninguna celda con dato Y hay fórmulas que lo leen: esas fórmulas dan 0 hoy;
//   · HUÉRFANO — nadie lo lee. No hace daño todavía; es exactamente cómo nace un ciego.
//
//   node orquestador/scripts/auditar-rangos-fosilizados.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { diagnosticarRango } from '../lib/cobranzas-por-cliente.mjs'
import { clasificarNombrados } from '../lib/rangos-con-nombre.mjs'
import { mientenPorEspecie } from '../lib/rangos-nombrados.mjs'
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

/**
 * NÚCLEO PURO: la última fila de la TABLA DE CARGA, cortando antes del cuadro de control.
 *
 * POR QUÉ NO ES "la última fila con datos" (21/07). En Tarjeta de Credito la tabla de consumos
 * termina en la fila 31 y JUSTO DEBAJO, en las mismas columnas, el OS escribe un cuadro de control
 * con conceptos, montos y diferencias —filas anchas de verdad—. Medir "hasta dónde hay filas
 * anchas" contaba el control como tabla y daba la 56: el auditor marcaba el rango $E$3:$E$31 como
 * fosilizado cuando cubre toda la tabla real. Un auditor que grita por algo correcto se deja de
 * mirar (regla 11).
 *
 * La tabla de carga es CONTIGUA; el cuadro de control está separado por un hueco. Se corta en el
 * primer hueco de dos o más filas sin ancho suficiente. Los demás Sheets de carga tienen rangos
 * amplios (390, 400, 800) muy por encima de su tabla, así que este corte no los afecta.
 *
 * @param {Array<Array<any>>} filas
 * @param {number} anchoMin celdas llenas que hacen a una fila "de tabla"
 * @returns {number} última fila (1-based) de la tabla contigua
 */
export function ultimaFilaDeTabla(filas = [], anchoMin = 4) {
  let u = 0
  let hueco = 0
  for (let i = 0; i < filas.length; i++) {
    const llenas = (filas[i] || []).filter((c) => String(c ?? '').trim()).length
    if (llenas >= anchoMin) { u = i + 1; hueco = 0 }
    else if (u > 0 && ++hueco >= 2) break
  }
  return u
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
    ultima.set(h.title, ultimaFilaDeTabla(v, ANCHO_MIN))
  }

  const fosilizados = [], sinMargen = []
  // La grilla de cada pestaña y TODAS las fórmulas del libro se guardan: las necesita la segunda
  // mitad del auditor, la de los rangos con nombre, y releerlas sería pagar el doble por lo mismo.
  const grillas = new Map()
  const formulas = []
  for (const h of meta) {
    const gr = await google.readSheetGrid(ID, `'${h.title}'!A1:BZ${Math.min(h.rows ?? 200, 300)}`).catch(() => null)
    if (!gr) continue
    grillas.set(h.title, gr)
    gr.filas.forEach((fila, i) => fila.forEach((c, j) => {
      if (!c?.formula) return
      formulas.push(c.formula)
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

  await auditarNombrados(google, meta, grillas, formulas)
}

/**
 * Cuántas celdas de un rango con nombre tienen contenido, mirando la grilla ya leída.
 * Devuelve `null` cuando el rango cae fuera de lo que se leyó: NO se puede decir que está vacío un
 * rango que no se miró — declarar "no verificable" es la única respuesta honesta ahí.
 */
export function contarConDato(grilla, rango) {
  const r0 = rango.startRowIndex ?? 0
  const r1 = rango.endRowIndex ?? 0
  const c0 = rango.startColumnIndex ?? 0
  const c1 = rango.endColumnIndex ?? 0
  if (r1 > grilla.filas.length || c1 > 78 /* hasta BZ */) return null
  let con = 0, total = 0
  for (let i = r0; i < r1; i++) {
    for (let j = c0; j < c1; j++) {
      total++
      const c = grilla.filas[i]?.[j]
      if (c && (c.formula != null || (c.valor != null && String(c.valor).trim() !== ''))) con++
    }
  }
  return { con, total }
}

async function auditarNombrados(google, meta, grillas, formulas) {
  const porId = new Map(meta.map((h) => [h.sheetId, h.title]))
  const nombrados = []
  const noVerificables = []
  // La PRIMERA celda de cada nombre, sin formatear: es la que promete la especie. Sale de la grilla
  // que ya se leyó —no hay una llamada más— y `valor` viene crudo por `readSheetGrid`, que es lo que
  // hace falta: "$209.231.271" formateado es un string igual que un número de comprobante.
  const conValor = []
  for (const nr of await google.getNamedRanges(ID)) {
    const hoja = porId.get(nr.range?.sheetId) ?? null
    const gr = hoja ? grillas.get(hoja) : null
    const cuenta = gr ? contarConDato(gr, nr.range ?? {}) : null
    if (!cuenta) { noVerificables.push({ nombre: nr.name, hoja }); continue }
    nombrados.push({ nombre: nr.name, hoja, conDato: cuenta.con, celdas: cuenta.total })
    const c = gr.filas[nr.range?.startRowIndex ?? 0]?.[nr.range?.startColumnIndex ?? 0]
    conValor.push({ nombre: nr.name, hoja, valor: c?.valor ?? null })
  }

  const clasificados = clasificarNombrados(nombrados, formulas)
  const ciegos = clasificados.filter((n) => n.estado === 'ciego')
  const huerfanos = clasificados.filter((n) => n.estado === 'huérfano')

  console.log(`\nRANGOS CON NOMBRE — ${clasificados.length} verificados de ${clasificados.length + noVerificables.length}`)
  if (ciegos.length) {
    console.log('⚠ RANGOS CIEGOS — apuntan a celdas vacías y hay fórmulas leyéndolos: esas fórmulas valen 0 HOY:')
    for (const n of ciegos) console.log(`   ${n.nombre} → ${n.hoja}, ${n.celdas} celda(s), NINGUNA con dato · ${n.usos} fórmula(s) lo leen`)
  }
  if (huerfanos.length) {
    console.log('· HUÉRFANOS — ninguna fórmula los lee. Sin dueño, se quedan anclados al layout viejo:')
    for (const n of huerfanos) console.log(`   ${n.nombre} → ${n.hoja}, ${n.conDato}/${n.celdas} celda(s) con dato`)
  }
  for (const n of noVerificables) console.log(`   ? ${n.nombre} → ${n.hoja ?? 'sin pestaña'}: fuera del tramo leído, NO se puede afirmar que esté vacío`)

  // ═══ LA OTRA MITAD DE LA PREGUNTA: NO SI HAY ALGO, SINO SI ES LO QUE PROMETE (14/08/2026) ═══
  //
  // "Ciego" caza el nombre que apunta a celdas VACÍAS. El defecto que costó los diez días de agosto es
  // el gemelo que este auditor no veía: el nombre que apunta a celdas LLENAS DE OTRA COSA. Los doce
  // `ARCA_*` vivían sobre `Proveedores!B124:C129` —CUITs y números de comprobante— y para este auditor
  // estaban impecables: tenían dato. `ARCA_FALTAN_MONTO`, que sí lee Materiales!B53, publicaba
  // "0038-00025483" donde promete plata.
  //
  // No hace falta adivinar la especie: `ESPECIE` (lib/rangos-nombrados.mjs) ya la declara para los
  // nombres que la tienen declarada, y ése es todo el alcance — un nombre sin especie declarada no se
  // juzga. Un auditor que inventa el criterio con el que audita no audita nada.
  const mienten = mientenPorEspecie(conValor)
  if (mienten.length) {
    console.log('⚠ RANGOS QUE MIENTEN — la celda tiene otra cosa que la que el nombre promete:')
    for (const m of mienten) {
      console.log(`   ${m.nombre} → ${m.hoja}: ${JSON.stringify(m.valor)} (${m.encontro}, promete ${m.espera}). Toda pestaña que lo cite muestra eso HOY.`)
    }
  }

  if (!ciegos.length && !huerfanos.length && !mienten.length) console.log('✓ ningún rango con nombre apunta a celdas vacías ni a otra especie')
  if (ciegos.length || mienten.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
