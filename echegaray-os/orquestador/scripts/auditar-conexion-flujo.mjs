#!/usr/bin/env node
/**
 * EL MAPA DE CONEXIÓN DEL FLUJO DE FONDOS — pestaña por pestaña: quién la escribe, de qué se
 * alimenta, cuán viva está y hacia dónde apunta.
 *
 * SÓLO LEE. No escribe una celda del archivo real y no puede: `auditar()` recibe el cliente de
 * Google y su test lo llama con un doble que EXPLOTA si alguien toca un método de escritura. Si
 * mañana alguien agrega un `batchUpdateValues`, el test se pone rojo antes de que llegue al Sheet.
 *
 * POR QUÉ EXISTE (13/08/2026). Pedido textual del dueño: *"todo el sheet flujo de fondos tiene q
 * estar conectado entre si y con carpetas, sheets y apis q lo alimentan"*. Lo que quiere es que
 * ninguna pestaña sea una isla con números pegados. Los tres controles que ya existían miran cada
 * uno una parte —quién es el dueño, cuántos números están pegados, si un rango con nombre quedó
 * vacío— y **ninguno mira el conjunto**: no había forma de ver una pestaña huérfana ni una
 * referencia que apunta al vacío. `_MOVIMIENTOS` es el precedente pagado: existía, tenía generador,
 * nadie lo corría, y los dos cash flows recalcularon una semana sobre un libro viejo.
 *
 * LAS CUATRO PREGUNTAS Y DE DÓNDE SALE CADA RESPUESTA — ninguna se contesta con una tabla tipeada:
 *
 *   1. QUIÉN LA ESCRIBE   → `lib/flujo-caja-pasos.mjs`, el registro de los pasos del pipeline.
 *   2. DE QUÉ SE ALIMENTA → del CÓDIGO del script dueño y de sus imports (`lib/conexion-fuentes`).
 *   3. CUÁN VIVA ESTÁ     → los dos renders de la API: FORMULA y FORMATTED_VALUE.
 *   4. HACIA DÓNDE APUNTA → las referencias de sus propias fórmulas (`lib/conexion-flujo`).
 *
 *   node orquestador/scripts/auditar-conexion-flujo.mjs [--json]
 *
 * SALE CON 1 si hay referencias rotas, una pestaña sin dueño que otras leen, o un bloque de importes
 * pegados en una pestaña que el OS calcula.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { PASOS } from '../lib/flujo-caja-pasos.mjs'
import { SIN_GENERADOR } from './auditar-duenos-pestanas.mjs'
import { PESTANAS } from './formato-pestanas.mjs'
import { clasificarCelda, referenciasDeFormula, vitalidad, bloquesPegados, construirGrafo, colLetra } from '../lib/conexion-flujo.mjs'
import { fuentesDeCadena, librosComunes } from '../lib/conexion-fuentes.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DIR_SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
// LECTURA Y NADA MÁS, TAMBIÉN EN EL PERMISO. El resto de los auditores pide WRITE_SCOPES por inercia;
// acá el token que se emite no alcanza para escribir aunque el código quisiera.
const SCOPES_LECTURA = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
]

const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const raya = (n = 108) => '─'.repeat(n)

/** El rango A1 de la pestaña ENTERA. El alto y el ancho se preguntan, no se declaran: un auditor con
 *  ventana fija informó 34 números pegados donde había 79 — el defecto entra por abajo. */
function rangoCompleto({ title, rows, cols }) {
  return `'${String(title).replace(/'/g, "''")}'!A1:${colLetra(Math.max(1, cols || 26) - 1)}${rows || 1000}`
}

/** Los dos renders del archivo entero. Dos llamadas por lote, no una por pestaña. */
async function leerRenders(g, id, hojas, render, lote = 10) {
  const out = new Map()
  for (let i = 0; i < hojas.length; i += lote) {
    const tanda = hojas.slice(i, i + lote)
    const qs = tanda.map((h) => `ranges=${encodeURIComponent(rangoCompleto(h))}`).join('&')
    const j = await g.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`
      + `/values:batchGet?${qs}&valueRenderOption=${render}&majorDimension=ROWS`)
    ;(j.valueRanges || []).forEach((vr, k) => out.set(tanda[k].title, vr.values || []))
  }
  return out
}

/**
 * LAS TABLAS DINÁMICAS NATIVAS Y SOBRE QUÉ PESTAÑA SE ARMAN.
 *
 * POR QUÉ NO ALCANZA CON LAS FÓRMULAS. Una dinámica no tiene fórmula: sus celdas vuelven VACÍAS con
 * render FORMULA y llenas con FORMATTED_VALUE. Sin esta lectura, "Deuda viva (OS)" —dos dinámicas
 * sobre Compras— salía como pestaña huérfana y sin fuente determinable, que es falso: está conectada,
 * sólo que por un camino que las fórmulas no muestran. Y las dinámicas ya rompieron cosas acá (un
 * pivot huérfano duplicaba Proveedores), así que verlas es parte del mapa, no un lujo.
 *
 * Una sola llamada con máscara de campos: 3 KB para el archivo entero.
 */
async function leerDinamicas(g, id, hojas) {
  const porId = new Map(hojas.map((h) => [h.sheetId, h.title]))
  const campos = 'sheets(properties(title),data(rowData(values(pivotTable(source)))))'
  const j = await g.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`
    + `?includeGridData=true&fields=${encodeURIComponent(campos)}`)
  const out = new Map()
  for (const s of j.sheets || []) {
    const celdas = (s.data || []).flatMap((d) => d.rowData || [])
      .flatMap((r) => (r.values || []).filter((v) => v?.pivotTable?.source))
    if (!celdas.length) continue
    out.set(s.properties?.title, celdas.map(({ pivotTable: p }) => ({
      origen: porId.get(p.source.sheetId) ?? `sheetId ${p.source.sheetId}`,
      rango: `${colLetra(p.source.startColumnIndex ?? 0)}${(p.source.startRowIndex ?? 0) + 1}`
        + `:${colLetra((p.source.endColumnIndex ?? 1) - 1)}${p.source.endRowIndex ?? ''}`,
    })))
  }
  return out
}

/** NÚCLEO: qué dice una pestaña de sí misma — su vitalidad, a quién cita y qué bloques tiene pegados. */
export function analizarPestana(titulo, formulas, vistas) {
  const clases = []
  const refPestanas = new Map()
  const refNombres = new Map()
  let refsRotas = 0
  const suma = (m, k) => m.set(k, (m.get(k) ?? 0) + 1)
  const alto = Math.max(formulas.length, vistas.length)
  const externas = new Set()
  for (let f = 0; f < alto; f++) {
    const ancho = Math.max(formulas[f]?.length ?? 0, vistas[f]?.length ?? 0)
    for (let c = 0; c < ancho; c++) {
      const cruda = formulas[f]?.[c]
      const clase = clasificarCelda(cruda, vistas[f]?.[c])
      if (clase !== 'vacia') clases.push(clase)
      if (clase !== 'formula') continue
      const r = referenciasDeFormula(cruda)
      for (const p of r.pestanas) suma(refPestanas, p)
      for (const n of r.nombres) suma(refNombres, n)
      for (const e of r.externas) externas.add(e)
      if (r.errores.length) refsRotas++
    }
  }
  return {
    titulo,
    vitalidad: vitalidad(clases),
    refPestanas,
    refNombres,
    refsRotas,
    externas: [...externas],
    bloques: bloquesPegados(formulas, vistas),
  }
}

/** El registro de pasos, invertido: pestaña → scripts que la declaran suya. */
function duenosPorPestana(pasos = PASOS) {
  const m = new Map()
  for (const [script, , pestanas] of pasos) {
    for (const p of pestanas || []) m.set(p, [...(m.get(p) ?? []), script])
  }
  return m
}

/** El texto de un script del pipeline, o null si ya no existe (un paso que apunta al vacío). */
function cargarArchivo(ruta) {
  try { return readFileSync(ruta, 'utf8') } catch { return null }
}

/**
 * LA AUDITORÍA COMPLETA. Recibe el cliente de Google ya construido para que el test pueda pasarle un
 * doble de sólo lectura — un control que se prueba con el objeto real no prueba que no escriba.
 */
export async function auditar(g, { id = ID, cargar = cargarArchivo } = {}) {
  const hojas = await g.getSheetMeta(id)
  const titulos = hojas.map((h) => h.title)
  const nombresDefinidos = (await g.getNamedRanges(id)).map((n) => n.name)
  const formulas = await leerRenders(g, id, hojas, 'FORMULA')
  const vistas = await leerRenders(g, id, hojas, 'FORMATTED_VALUE')

  const dinamicas = await leerDinamicas(g, id, hojas)

  const analisis = hojas.map((h) => {
    const a = analizarPestana(h.title, formulas.get(h.title) || [], vistas.get(h.title) || [])
    // La dinámica es una arista del grafo como cualquier otra: la pestaña LEE de su origen.
    for (const d of dinamicas.get(h.title) ?? []) a.refPestanas.set(d.origen, (a.refPestanas.get(d.origen) ?? 0) + 1)
    return { ...a, dinamicas: dinamicas.get(h.title) ?? [] }
  })
  const grafo = construirGrafo(analisis, titulos, nombresDefinidos)
  const duenos = duenosPorPestana()
  // DE CARGA es la que declara que sus números los pone una persona: los del formateador y los que
  // el registro de dueños exceptúa por escrito. En esas, un número pegado es el dato de origen.
  const carga = new Set([...PESTANAS.filter((p) => p.carga).map((p) => p.titulo), ...Object.keys(SIN_GENERADOR)])
  const cacheFuentes = new Map()
  // La plomería se deduce de los propios scripts del pipeline, no de una lista tipeada acá.
  const scripts = new Map([...new Set([...duenos.values()].flat())]
    .map((s) => [path.join(DIR_SCRIPTS, s), cargar(path.join(DIR_SCRIPTS, s))])
    .filter(([, src]) => src != null))
  const plomeria = librosComunes(scripts)

  const filas = analisis.map((a) => {
    const mios = duenos.get(a.titulo) ?? []
    const fuentes = []
    const faltantes = []
    for (const s of mios) {
      if (!cacheFuentes.has(s)) {
        cacheFuentes.set(s, fuentesDeCadena(cargar, path.join(DIR_SCRIPTS, s), { titulos, omitir: plomeria }))
      }
      const r = cacheFuentes.get(s)
      fuentes.push(...r.fuentes)
      if (r.faltantes.includes(path.join(DIR_SCRIPTS, s))) faltantes.push(s)
    }
    return {
      ...a,
      duenos: mios,
      scriptInexistente: faltantes,
      excepcion: SIN_GENERADOR[a.titulo] ?? null,
      esCarga: carga.has(a.titulo),
      citadaPor: [...(grafo.citadaPor.get(a.titulo) ?? new Map())],
      apunta: grafo.sale.get(a.titulo) ?? [],
      fuentes: dedup(fuentes),
    }
  })
  return { id, titulos, nombresDefinidos, filas, grafo, hallazgos: hallazgos(filas, grafo) }
}

const dedup = (fs) => [...new Map(fs.map((f) => [`${f.tipo}|${f.detalle}`, f])).values()]

/** Cuántas celdas de OTRAS pestañas leen ésta: es la medida de a cuánto contamina si se fosiliza. */
const celdasQueLaLeen = (fila) => fila.citadaPor.reduce((a, [, n]) => a + n, 0)

/**
 * ¿ES UNA RÉPLICA MATERIALIZADA? Se mide, no se declara con una lista de nombres.
 *
 * Una pestaña sin UNA SOLA fórmula y llena de números es, por construcción, la transcripción de una
 * fuente externa: el extracto del Santander, los comprobantes de ARCA, el espejo de JORNALES, el
 * libro de movimientos. Ahí el número pegado NO es una violación — es la regla ("traer el INSUMO,
 * no el resultado"). Reportarlas ahogaba los seis huecos reales de las pestañas calculadas entre
 * ochenta hallazgos de réplicas que funcionan bien.
 *
 * EL RIESGO DE UNA RÉPLICA ES OTRO Y ES PEOR: que su generador deje de correr. Eso lo mide la
 * columna "escribe" de este mismo mapa, y por eso una réplica SIN dueño sí es un hallazgo.
 */
// EL UMBRAL ES 10% Y ESTÁ A LA VISTA A PROPÓSITO. `_MOVIMIENTOS` tiene 85 fórmulas sobre 16.000
// celdas (0,5%): son el encabezado, no un cuadro. Exigir CERO fórmulas la dejaba del lado de las
// calculadas y volvía a producir los 80 hallazgos falsos. Una pestaña entre 10% y 40% de fórmulas no
// es ninguna de las dos cosas y este auditor la va a tratar como calculada: mirarla vale la pena.
export const esReplica = (f) => f.duenos?.length > 0 && f.vitalidad.pegado > 0
  && f.vitalidad.pctViva !== null && f.vitalidad.pctViva < 10

/**
 * LOS HALLAZGOS, EN ORDEN DE GRAVEDAD. Primero lo que ya está roto, después lo que se va a romper
 * solo, al final lo que no se pudo determinar.
 */
export function hallazgos(filas, grafo) {
  const porTitulo = new Map(filas.map((f) => [f.titulo, f]))
  const rotas = grafo.rotas.map((r) => ({
    nivel: 1, tipo: 'REFERENCIA ROTA', pestana: r.pestana,
    detalle: `cita ${r.tipo} "${r.destino}" en ${r.celdas} celda(s) — no existe en el archivo`,
  }))
  const fosiles = filas
    .filter((f) => !f.duenos.length && !f.excepcion && celdasQueLaLeen(f) > 0)
    .map((f) => ({
      nivel: 2, tipo: 'SIN DUEÑO Y LEÍDA', pestana: f.titulo,
      detalle: `ningún paso del pipeline la escribe y ${celdasQueLaLeen(f)} fórmula(s) de `
        + `${f.citadaPor.length} pestaña(s) la leen: ${f.citadaPor.map(([p]) => p).join(', ')}`,
    }))
  const replicasCiegas = filas
    .filter((f) => esReplica(f) && f.duenos.length && !f.fuentes.length && !f.externas.length)
    .map((f) => ({
      nivel: 3, tipo: 'RÉPLICA SIN FUENTE', pestana: f.titulo,
      detalle: `${f.vitalidad.pegado} números transcriptos y en el código de ${f.duenos.join(', ')} no`
        + ' encontré la base, la API ni el archivo de donde salen: si la fuente cambia, nadie se entera',
    }))
  const pegados = filas.filter((f) => !f.esCarga && !esReplica(f)).flatMap((f) => f.bloques
    .filter((b) => Math.abs(b.suma) > 0)
    .map((b) => ({
      nivel: 3, tipo: 'IMPORTES PEGADOS', pestana: f.titulo,
      detalle: `${f.titulo}!${b.rango} — ${b.filas} importes pegados por ${pesos(b.suma)} que no se`
        + ' recalculan solos (el generador los escribió como número, no como fórmula)',
      suma: b.suma,
    })))
  const islas = grafo.huerfanas.map((t) => {
    const f = porTitulo.get(t)
    const quien = f?.duenos.length ? `la escribe ${f.duenos.join(', ')}` : (f?.excepcion ? 'la carga una persona' : 'no la escribe ningún paso')
    return {
      nivel: 4, tipo: 'HUÉRFANA', pestana: t,
      detalle: `${quien} y ninguna fórmula del archivo la cita ni ella cita a nadie: lo que diga no llega a ningún cuadro`,
    }
  })
  const oscuras = filas
    .filter((f) => !f.fuentes.length && !f.excepcion && !f.apunta.length && !f.externas.length && !f.dinamicas?.length)
    .map((f) => ({
      nivel: 5, tipo: 'FUENTE NO DETERMINABLE', pestana: f.titulo,
      detalle: f.duenos.length
        ? `la escribe ${f.duenos.join(', ')} y en ese código no encontré base, API, Drive ni otro Sheet`
        : 'no tiene dueño en el pipeline ni fórmulas que citen otra pestaña: no pude determinar de dónde sale',
    }))
  return [...rotas, ...fosiles, ...replicasCiegas,
    ...pegados.sort((a, b) => Math.abs(b.suma) - Math.abs(a.suma)), ...islas, ...oscuras]
}

/** El estado de vitalidad en una palabra: la réplica y la pestaña de carga tienen su propia vara. */
function veredicto(f) {
  const v = f.vitalidad
  if (!v.conDato) return 'VACÍA'
  if (esReplica(f)) return `RÉPLICA — ${v.pegado} números transcriptos, sin fórmula POR DISEÑO (el riesgo es la frescura)`
  if (f.esCarga) return `carga manual — ${v.pctViva}% viva`
  if (v.pctViva === null) return '—'
  return `${v.pctViva}% viva (${v.pegado} importe(s) pegado(s))`
}

function imprimirMapa(r) {
  console.log(`\nMAPA DE CONEXIÓN — ${r.filas.length} pestañas · ${r.nombresDefinidos.length} rangos con nombre`)
  console.log(raya())
  for (const f of r.filas) {
    const dueno = f.duenos.length ? f.duenos.join(' + ') : (f.excepcion ? 'la carga una persona' : '⚠ NADIE')
    console.log(`\n▸ ${f.titulo}`)
    console.log(`    escribe    ${dueno}`)
    const fuentes = f.fuentes.map((x) => x.tipo + (x.detalle ? ` (${x.detalle})` : ''))
    if (f.externas.length) fuentes.push(`IMPORTRANGE → ${f.externas.join(', ')}`)
    for (const d of f.dinamicas ?? []) fuentes.push(`tabla dinámica sobre ${d.origen}!${d.rango}`)
    if (!fuentes.length && f.excepcion) fuentes.push(`una persona — ${f.excepcion}`)
    if (!fuentes.length && f.apunta.length) fuentes.push(`fórmulas sobre ${f.apunta.join(', ')}`)
    console.log(`    se alimenta ${fuentes.length ? fuentes.join(' · ') : '⚠ NO PUDE DETERMINARLA'}`)
    console.log(`    vitalidad  ${veredicto(f)} — ${f.vitalidad.formula} fórmula, ${f.vitalidad.derramada} derramada, ${f.vitalidad.pegado} pegada, ${f.vitalidad.texto} texto`)
    console.log(`    apunta a   ${f.apunta.length ? f.apunta.join(', ') : '—'}`)
    console.log(`    la leen    ${f.citadaPor.length ? f.citadaPor.map(([p, n]) => `${p} (${n})`).join(', ') : '—'}`)
  }
}

function imprimirHallazgos(r) {
  console.log(`\n\nHALLAZGOS, POR GRAVEDAD`)
  console.log(raya())
  if (!r.hallazgos.length) { console.log('  ✓ ninguna pestaña desconectada, huérfana ni con referencias rotas.'); return }
  // SE CORTA POR TIPO, NO POR TOTAL: un tipo con cien casos no puede tapar a otro con dos. El listado
  // completo sale por `--json`, que es lo que consume quien va a arreglarlos.
  let nivel = 0
  const vistos = new Map()
  for (const h of r.hallazgos) {
    if (h.nivel !== nivel) { nivel = h.nivel; console.log('') }
    const n = (vistos.get(h.tipo) ?? 0) + 1
    vistos.set(h.tipo, n)
    if (n <= 12) console.log(`  ${h.nivel <= 3 ? '✗' : '·'} ${h.tipo.padEnd(24)} ${h.pestana.padEnd(24)} ${h.detalle}`)
  }
  for (const [tipo, n] of vistos) if (n > 12) console.log(`    … y ${n - 12} ${tipo} más (el listado entero, con --json)`)
}

async function main() {
  const json = process.argv.includes('--json')
  const g = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  const r = await auditar(g)
  if (json) {
    console.log(JSON.stringify({
      id: r.id,
      pestanas: r.filas.map((f) => ({
        titulo: f.titulo, duenos: f.duenos, fuentes: f.fuentes, externas: f.externas,
        dinamicas: f.dinamicas, esReplica: esReplica(f),
        vitalidad: f.vitalidad, apunta: f.apunta, citadaPor: f.citadaPor, bloquesPegados: f.bloques,
      })),
      hallazgos: r.hallazgos,
    }, null, 2))
  } else {
    imprimirMapa(r)
    imprimirHallazgos(r)
    console.log(`\n${raya()}`)
  }
  process.exitCode = r.hallazgos.some((h) => h.nivel <= 3) ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
}
