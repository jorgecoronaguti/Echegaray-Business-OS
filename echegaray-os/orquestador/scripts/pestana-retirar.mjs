#!/usr/bin/env node
// RETIRAR UNA PESTAÑA DEL SHEET — SÓLO SI NADIE LA MIRA, Y CON EL PDF GUARDADO ANTES.
//
// ═══ POR QUÉ ES UN SCRIPT Y NO UN CLIC ═══
//
// Borrar una pestaña a mano es un gesto de dos segundos y una pérdida irreversible: Sheets no avisa
// que un rango con nombre queda colgando, que un gráfico de otra hoja se alimentaba de ahí, ni que
// once fórmulas del Cash Flow la citaban. El modo de fallar de esas tres cosas NO es un error rojo —
// es un `#REF!` en una celda que nadie mira, o peor, un cero plausible. Este repositorio ya perdió
// una pestaña entera por una escritura hecha sin mirar antes.
//
// Entonces el retiro se hace con el archivo delante y en este orden, que no es negociable:
//
//   1. SE PREGUNTA QUIÉN LA MIRA. Cuatro fuentes, las cuatro por API: rangos con nombre apuntados a
//      su `sheetId`, gráficos (los anclados en ella Y los de cualquier otra hoja que la tengan como
//      fuente), rangos protegidos, y las fórmulas de TODAS las demás pestañas que la citen por
//      nombre. Si aparece uno solo, no se borra: se lista y se sale con código 1.
//   2. SE GUARDA EL PDF. Es el respaldo que un tercero puede mirar después; la copia de valores no
//      alcanza, porque lo que se pierde también es cómo se veía.
//   3. RECIÉN AHÍ SE BORRA. Si el paso 2 falla, no hay paso 3. Un borrado cuyo respaldo no se pudo
//      escribir es exactamente el caso que este script existe para impedir.
//
// EL DEFAULT ES `--dry`: sin `--aplicar` no se escribe nada y se imprime lo que haría. La primera
// versión de cualquier script que borra tiene que ser la que no borra.
//
//   node orquestador/scripts/pestana-retirar.mjs "Plantel"            → qué apunta ahí, y nada más
//   node orquestador/scripts/pestana-retirar.mjs "Plantel" --aplicar  → PDF de respaldo + borrado

import { mkdirSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { colLetra } from '../lib/sheet-formulas.mjs'
import { exportarPestanaPdf } from './exportar-pestana-pdf.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
/** Dónde queda el respaldo. Fuera del repo: es un archivo del negocio, no del código. */
export const RESPALDOS = process.env.ORQ_RESPALDOS || '/home/jorge/echegaray-os/respaldos'

/** Escapa un título para meterlo en una expresión regular: los hay con paréntesis y puntos. */
const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * NÚCLEO PURO: ¿esta fórmula cita a esa pestaña?
 *
 * Se busca la referencia de hoja —`Título!` o `'Título'!`— y no el título suelto: «Nómina» aparece
 * en decenas de rótulos y ninguno es una referencia. La comilla simple es opcional porque Sheets
 * sólo la escribe cuando el título tiene espacios, y las dos formas conviven en el mismo archivo.
 *
 * Un `INDIRECT("Plantel!A1")` cae adentro de este mismo patrón, y tiene que caer: es una referencia
 * que ninguna herramienta de Google reporta y que se rompe igual.
 */
export function citaLaPestana(formula, titulo) {
  const f = String(formula ?? '')
  if (!f.startsWith('=')) return false
  return new RegExp(`(^|[^A-Za-z0-9_'])'?${escapar(titulo)}'?!`).test(f)
}

/** Todos los `sheetId` que menciona un objeto anidado (la spec de un gráfico). PURA. */
export function sheetIdsDe(obj, vistos = new Set()) {
  if (!obj || typeof obj !== 'object') return vistos
  if (Array.isArray(obj)) { for (const x of obj) sheetIdsDe(x, vistos); return vistos }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'sheetId' && Number.isInteger(v)) vistos.add(v)
    else sheetIdsDe(v, vistos)
  }
  return vistos
}

/**
 * NÚCLEO PURO: quién apunta a la pestaña. Devuelve una lista de motivos; vacía = se puede retirar.
 *
 * @param {{titulo:string, sheetId:number}} objetivo
 * @param {{nombres?:Array, protegidos?:Array, graficos?:Array, formulas?:Array}} archivo
 *        `formulas` es [{ pestana, celda, formula }] de TODAS las demás pestañas.
 */
export function referenciasAPestana(objetivo, { nombres = [], protegidos = [], graficos = [], formulas = [] } = {}) {
  const { titulo, sheetId } = objetivo
  const out = []
  for (const n of nombres) {
    if (n?.range?.sheetId === sheetId) out.push({ tipo: 'rango con nombre', que: n.name, detalle: `apunta a «${titulo}»` })
  }
  for (const p of protegidos) {
    if (p?.sheetId === sheetId || p?.range?.sheetId === sheetId) {
      out.push({ tipo: 'rango protegido', que: p.description || `#${p.protectedRangeId}`, detalle: `protege «${titulo}»` })
    }
  }
  for (const h of graficos) {
    for (const c of h.charts ?? []) {
      // DOS FORMAS DE DEPENDER DE UNA PESTAÑA, Y LAS DOS CUENTAN: el gráfico DIBUJADO sobre ella
      // (se va con ella, y hay que saberlo) y el gráfico de otra hoja que LEE sus celdas — ése
      // queda vivo y vacío, que es peor porque sigue en pantalla diciendo algo falso.
      const anclado = h.sheetId === sheetId
      const lee = sheetIdsDe(c.spec ?? c).has(sheetId)
      if (anclado || lee) {
        out.push({
          tipo: 'gráfico', que: c.title || `#${c.chartId}`,
          detalle: anclado ? `está dibujado sobre «${titulo}»` : `en «${h.title}», se alimenta de «${titulo}»`,
        })
      }
    }
  }
  for (const f of formulas) {
    if (f.pestana === titulo) continue
    if (citaLaPestana(f.formula, titulo)) out.push({ tipo: 'fórmula', que: `${f.pestana}!${f.celda}`, detalle: String(f.formula).slice(0, 90) })
  }
  return out
}

/** El rango A1 que cubre la pestaña entera, para el PDF de respaldo. PURA. */
export const rangoDeLaHoja = (hoja) => `A1:${colLetra(Math.max(1, (hoja.cols ?? 26)) - 1)}${Math.max(1, hoja.rows ?? 200)}`

/** El nombre del respaldo lleva la fecha: dos retiros de la misma pestaña no se pisan. */
export const nombreDelRespaldo = (titulo, hoy = new Date()) =>
  `${hoy.toISOString().slice(0, 10)}-${String(titulo).replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/g, '_')}.pdf`

/**
 * LEE LAS CUATRO FUENTES Y DECIDE. No escribe: la escritura la hace `retirar` si esto viene limpio.
 *
 * Las fórmulas se leen pestaña por pestaña con `valueRenderOption=FORMULA`. Es una llamada por
 * pestaña y es el precio de la única pregunta que importa — «¿alguien la cita?»— que ninguna otra
 * fuente contesta.
 */
export async function inspeccionar(google, titulo, { id = ID } = {}) {
  const hojas = await google.getSheetMeta(id)
  const hoja = hojas.find((h) => h.title === titulo)
  if (!hoja) return { hoja: null, hojas, referencias: [] }
  const [nombres, protegidos, graficos] = await Promise.all([
    google.getNamedRanges(id),
    google.getProtectedRanges(id),
    graficosConSpec(google, id),
  ])
  const formulas = []
  for (const h of hojas) {
    if (h.title === titulo) continue
    const alto = Math.min(h.rows ?? 400, 2000)
    const ancho = colLetra(Math.min(Math.max(1, h.cols ?? 26), 60) - 1)
    const filas = await google.readSheetValues(id, `'${h.title}'!A1:${ancho}${alto}`, { render: 'FORMULA' })
      .catch(() => [])
    filas.forEach((f, i) => (f ?? []).forEach((c, j) => {
      if (typeof c === 'string' && c.startsWith('=')) formulas.push({ pestana: h.title, celda: `${colLetra(j)}${i + 1}`, formula: c })
    }))
  }
  return { hoja, hojas, referencias: referenciasAPestana({ titulo, sheetId: hoja.sheetId }, { nombres, protegidos, graficos, formulas }), leidas: formulas.length }
}

/**
 * Los gráficos CON su especificación entera: `getCharts` sólo trae el título, y con el título no se
 * puede saber de dónde saca los datos — que es justo lo que hay que preguntar antes de borrar.
 */
async function graficosConSpec(google, id) {
  // Se pide por `getGridData` con una máscara propia: `ranges` acota la grilla (una celda), y el
  // `fields` trae los gráficos de TODAS las hojas igual, porque `charts` cuelga de la hoja y no de
  // los datos. Sin la máscara, la respuesta traería el archivo entero.
  const j = await google.getGridData(id, 'A1:A1', 'sheets(properties(sheetId,title),charts(chartId,spec))').catch(() => null)
  if (!j) return []
  return (j.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId,
    title: s.properties?.title,
    charts: (s.charts ?? []).map((c) => ({ chartId: c.chartId, title: c.spec?.title ?? '', spec: c.spec ?? null })),
  }))
}

/**
 * EL RETIRO COMPLETO. Devuelve qué pasó, para que el llamador (o un test) lo verifique.
 *
 * `exportar` y `crearCarpeta` entran por parámetro porque son los dos efectos del mundo real: un
 * test los reemplaza y puede afirmar el ORDEN —respaldo antes que borrado— que es la única garantía
 * que este script promete.
 */
export async function retirar(google, titulo, {
  id = ID, aplicar = false, dir = RESPALDOS, hoy = new Date(),
  exportar = exportarPestanaPdf, crearCarpeta = (d) => mkdirSync(d, { recursive: true }), log = console.log,
} = {}) {
  const { hoja, referencias, leidas } = await inspeccionar(google, titulo, { id })
  if (!hoja) { log(`no existe una pestaña llamada «${titulo}» — no hay nada que retirar`); return { estado: 'no-existe' } }
  log(`«${titulo}» · sheetId ${hoja.sheetId} · ${hoja.rows}×${hoja.cols} · ${leidas} fórmula(s) leídas en las demás pestañas`)
  if (referencias.length) {
    log(`✗ NO se puede retirar: ${referencias.length} referencia(s) apuntan a «${titulo}»`)
    for (const r of referencias.slice(0, 20)) log(`   · ${r.tipo.padEnd(16)} ${r.que} — ${r.detalle}`)
    return { estado: 'referenciada', referencias }
  }
  log(`✓ nada apunta a «${titulo}»: 0 rangos con nombre, 0 gráficos, 0 rangos protegidos, 0 fórmulas`)
  if (!aplicar) { log('(sin --aplicar: no toqué el archivo)'); return { estado: 'dry', referencias: [] } }
  crearCarpeta(dir)
  const salida = `${dir}/${nombreDelRespaldo(titulo, hoy)}`
  // EL RESPALDO PRIMERO, Y SI FALLA NO SE BORRA NADA. No se atrapa el error a propósito: un catch
  // acá convertiría «no pude guardar el PDF» en un borrado sin respaldo, que es el peor final posible.
  const pdf = await exportar({ titulo, rango: rangoDeLaHoja(hoja), salida, id })
  log(`respaldo: ${salida}${pdf?.bytes ? ` (${pdf.bytes} bytes)` : ''}`)
  // `borrarPestanas` es el permiso explícito que la guarda central exige para un `deleteSheet`: sin
  // él la guarda lo descarta y la corrida diría que borró sin haber borrado.
  await google.spreadsheetBatchUpdate(id, [{ deleteSheet: { sheetId: hoja.sheetId } }], { borrarPestanas: [titulo] })
  // LO QUE PRUEBA EL BORRADO ES LA LECTURA DE DESPUÉS, no el 200 de la API.
  const quedan = (await google.getSheetMeta(id)).some((h) => h.title === titulo)
  if (quedan) { log(`✗ la pestaña «${titulo}» sigue en el archivo después del borrado`); return { estado: 'no-borro', respaldo: salida } }
  log(`✓ «${titulo}» retirada. El respaldo queda en ${salida}`)
  return { estado: 'retirada', respaldo: salida }
}

async function main() {
  const titulo = process.argv[2]
  if (!titulo) { console.error('Uso: pestana-retirar.mjs "<título>" [--aplicar]'); process.exit(1) }
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const r = await retirar(google, titulo, { aplicar: process.argv.includes('--aplicar') })
  if (r.estado === 'referenciada' || r.estado === 'no-borro') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
