#!/usr/bin/env node
// LAS DOS VISTAS DE CASH FLOW, REHECHAS COMO BLOQUES — el que escribe.
//
// ═══ QUÉ REEMPLAZA (05/08/2026) ═══
//
// A `cash-flow-rehacer.mjs`, que escribía las mismas dos pestañas como una matriz de 51 columnas por
// mes/semana. El dueño: *"no quiero que parezcan una planilla"*. El diseño nuevo —una agenda diaria y
// doce bloques mensuales— vive en lib/cash-flow-agenda.mjs y lib/cash-flow-meses.mjs; acá está sólo lo
// que toca la red.
//
// UNA PESTAÑA, UN ESCRITOR. Los dos generadores no pueden convivir: el que escribe último sella la
// firma y el otro se auto-canda en la corrida siguiente ("candado falso por dos escritores", memoria
// del proyecto). Por eso `cash-flow-rehacer.mjs` queda como módulo —sus funciones puras las siguen
// usando otros tests— pero deja de correr en el pipeline: la lista de PASOS apunta acá.
//
//   node orquestador/scripts/cash-flow-vistas.mjs [--dry]

import { pathToFileURL } from 'node:url'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { publicar } from '../lib/rangos-nombrados.mjs'
import { CAJA as N_CAJA } from '../lib/rangos-nombrados.mjs'
import { DESDE_CAJA } from '../lib/caja-anexo-nombres.mjs'
import { FOOTPRINT, rectangulo, letra } from '../lib/cash-flow-bloques.mjs'
import { grillaAgenda, PESTANA_SEMANAL } from '../lib/cash-flow-agenda.mjs'
import { grillaMeses, destinosNombrados, PESTANA_MENSUAL } from '../lib/cash-flow-meses.mjs'
import {
  grillaPresupuesto, rescatarPresupuesto, formatoPresupuesto,
  PESTANA_PRESUPUESTO, ANCHO_PRESUPUESTO,
} from '../lib/cash-flow-presupuesto.mjs'
import { pielBloques, reglasCondicionales, borrarCondicionales } from '../lib/cash-flow-piel-bloques.mjs'
import { requestsDeGraficosBloques } from '../lib/cash-flow-graficos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const AÑO = Number(process.env.ORQ_CF_ANIO || 2026)
/** La columna donde se anclan los gráficos + margen: la hoja tiene que llegar hasta ahí o la API rechaza. */
const COLS_HOJA = 62

/**
 * Los rangos con nombre de CAJA que las vistas necesitan. Si no existen todavía, se devuelve null y la
 * vista lo DICE en vez de referenciar una celda inventada — un ancla mal apuntada es un cuadro entero
 * mintiendo con cara de correcto.
 */
async function refsDeCaja(google) {
  const nombres = await google.getNamedRanges(ID).catch(() => [])
  const hay = (n) => (nombres.some((x) => x.name === n) ? n : null)
  const refs = { saldo: hay(N_CAJA.total), fecha: hay(N_CAJA.fecha), minima: hay(DESDE_CAJA.minima) }
  for (const [k, v] of Object.entries(refs)) if (!v) console.warn(`  ⚠ falta el rango con nombre de ${k}: la vista lo va a declarar vacío`)
  return refs
}

/** Asegura que la pestaña exista y tenga sitio para lo que se va a escribir. NUNCA la achica. */
async function asegurarHoja(google, titulo, { filas, cols }) {
  // `hallarPestana` TIRA cuando la pestaña no existe — no devuelve null. En el arranque en frío
  // (_PRESUPUESTO_MENSUAL todavía sin crear) eso rompía el --dry y habría roto la corrida real.
  const buscar = (hojas) => { try { return hallarPestana(hojas, titulo) } catch { return null } }
  let hoja = buscar(await google.getSheetMeta(ID))
  if (!hoja && DRY) { console.log(`  ✚ (--dry) la pestaña ${titulo} no existe: se crearía en la corrida real`); return null }
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: titulo, gridProperties: { rowCount: filas, columnCount: cols, frozenRowCount: 2 } } },
    }])
    hoja = buscar(await google.getSheetMeta(ID))
    console.log(`  ✚ creé la pestaña ${titulo}`)
    return hoja
  }
  const props = {}
  if ((hoja.rows ?? 0) < filas) props.rowCount = filas
  if ((hoja.cols ?? 0) < cols) props.columnCount = cols
  if (Object.keys(props).length) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: props }, fields: Object.keys(props).map((k) => `gridProperties.${k}`).join(',') },
    }])
    hoja = buscar(await google.getSheetMeta(ID))
  }
  return hoja
}

/**
 * LA PESTAÑA DE CARGA DEL PRESUPUESTO. Se rescata lo tipeado ANTES de escribir y se vuelve a poner:
 * doble seguro sobre la fusión, porque acá lo que se puede perder es trabajo de una persona.
 */
async function rehacerPresupuesto(google) {
  const hoja = await asegurarHoja(google, PESTANA_PRESUPUESTO, { filas: 40, cols: ANCHO_PRESUPUESTO })
  if (!hoja && DRY) { console.log(`${PESTANA_PRESUPUESTO}: se crearía vacía · 0/12 meses con presupuesto cargado`); return { cargados: 0, hoja: null } }
  // Sin `UNFORMATTED_VALUE` un importe cargado vuelve como "$ 1.234" (texto) y se re-escribiría como
  // texto. `mesDeCelda` acepta las dos formas de la columna A justamente porque de esto depende no
  // perder lo cargado.
  const actual = await google.readSheetValues(ID, `${PESTANA_PRESUPUESTO}!A1:${letra(ANCHO_PRESUPUESTO - 1)}40`, { render: 'UNFORMATTED_VALUE' })
    .catch((e) => { throw new Error(`no pude leer "${PESTANA_PRESUPUESTO}" (${e.message}). NO escribo: sin esa lectura se pierde lo cargado.`) })
  const cargado = rescatarPresupuesto(actual)
  const { filas, destinos, cargados } = grillaPresupuesto({ anio: AÑO, cargado })
  console.log(`${PESTANA_PRESUPUESTO}: ${filas.length} filas · ${cargados}/12 meses con presupuesto cargado`)
  if (DRY) return { cargados, hoja }
  const escritura = await escribirPreservando(google, ID, refPestana(PESTANA_PRESUPUESTO), filas, { anchoHoja: ANCHO_PRESUPUESTO })
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.log(`  🔒 "${PESTANA_PRESUPUESTO}" bajo tu control: no escribí, no le toco el formato ni sus rangos con nombre.`)
    return { cargados, hoja }
  }
  await google.spreadsheetBatchUpdate(ID, formatoPresupuesto(hoja.sheetId, { filas: filas.length }))
  const { malApuntados } = await publicar(google, ID, hoja.sheetId, destinos, { titulo: PESTANA_PRESUPUESTO })
  for (const m of malApuntados) console.warn(`  ⚠ ${m.name} promete ${m.espera} y encontró ${m.encontro}`)
  console.log(`  🔖 ${destinos.length} rangos con nombre publicados`)
  return { cargados, hoja }
}

/**
 * Escribe una vista: valores con la Regla 0, después formato, después gráficos (cada cosa en su lote).
 *
 * Devuelve la hoja y si de verdad se escribió: una pestaña que NO se escribió no cambió de forma, así
 * que tampoco se le tocan el formato, los gráficos ni sus rangos con nombre. Reapuntar un nombre a una
 * grilla que no se escribió es lo que el 03/08 dejó CAJA_ARQUEO_ARS sobre una celda vacía.
 */
async function escribirVista(google, { filas, meta }, tipo, refs) {
  const hoja = await asegurarHoja(google, meta.pestana, { filas: FOOTPRINT.filas, cols: COLS_HOJA })
  const grid = rectangulo(filas, VACIO)
  console.log(`${meta.pestana}: ${meta.filaFin} filas de contenido en un footprint de ${grid.length}×${grid[0].length}`)
  if (DRY) {
    for (const f of filas.slice(0, 14)) console.log('  ', f.slice(0, 3).map((x) => String(x ?? '').slice(0, 52)).join(' | '))
    return { hoja, escrito: false }
  }
  const actual = await google.readSheetValues(ID, `${meta.pestana}!A1:${letra(FOOTPRINT.cols - 1)}${FOOTPRINT.filas}`)
    .catch((e) => { throw new Error(`no pude leer "${meta.pestana}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`) })
  const { grid: fusionada, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, meta.pestana, grid, actual)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}")`)
  const escritura = await escribirPreservando(google, ID, refPestana(meta.pestana), fusionada, {
    anchoHoja: FOOTPRINT.cols, respetar: false, // la Regla 0 ya se aplicó arriba, sobre la grilla entera
  })
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.log(`  🔒 "${meta.pestana}" bajo tu control: no escribí, y NO le toco el formato ni los gráficos.`)
    return { hoja, escrito: false }
  }
  await guardarRegistro(ID, meta.pestana, fusionada, ediciones, actual, candidatos)
    .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude guardar el registro de rótulos: ${e.message}`))

  // ── El formato, con las reglas condicionales borradas ANTES de re-crearse ──
  const cf = await google.getConditionalFormats(ID).catch(() => [])
  const cuantas = cf.find((c) => c.sheetId === hoja.sheetId)?.reglas ?? 0
  await google.spreadsheetBatchUpdate(ID, [
    ...borrarCondicionales(hoja.sheetId, cuantas),
    ...pielBloques({ sheetId: hoja.sheetId, meta, tipo, filasHoja: hoja.rows ?? 0, colsHoja: hoja.cols ?? 0 }),
    ...reglasCondicionales({ sheetId: hoja.sheetId, meta, refMinima: refs.minima }),
  ])
  console.log(`  🎨 formato aplicado · ${cuantas} regla(s) condicional(es) vieja(s) borrada(s)`)

  // ── Los gráficos, en su PROPIO lote: un addChart que falle no puede tirarse abajo el formato ──
  const g = tipo === 'mes'
    ? { aux: meta.aux }
    : { auxSemanas: { fila0: meta.aux.semanas.fila0, fila1: meta.aux.semanas.fila1, col: meta.aux.col } }
  const reqG = await requestsDeGraficosBloques(google, ID, hoja.sheetId, g, meta.pestana)
  if (reqG.length) {
    await google.spreadsheetBatchUpdate(ID, reqG).catch((e) => console.warn(`  ⚠ ${meta.pestana}: los gráficos fallaron (${e.message}); la tabla quedó bien`))
  }
  return { hoja, escrito: true }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const refs = await refsDeCaja(google)
  console.log(`Ancla de saldo: ${refs.saldo ?? '⚠ sin rango con nombre'} · piso: ${refs.minima ?? '(sin caja mínima)'}`)

  // El presupuesto VA PRIMERO: el Mensual cita sus rangos con nombre, y un nombre que todavía no
  // existe deja #NAME? en la pestaña que el dueño abre todos los días. Igual que _CAJA_ANEXO antes de CAJA.
  await rehacerPresupuesto(google)

  const hoy = new Date()
  // EL MENSUAL VA PRIMERO, y no es indistinto: publica CF_MESES —los doce meses del ejercicio— y la
  // proyección de comisiones del SEMANAL cuenta sobre ese rango. Al revés, la primera corrida dejaría
  // el semanal con #NAME? hasta la siguiente.
  const mensual = grillaMeses({ anio: AÑO, refs, hoy })
  const res = await escribirVista(google, mensual, 'mes', refs)
  if (res?.escrito) {
    const destinos = destinosNombrados(mensual.meta)
    await publicar(google, ID, res.hoja.sheetId, destinos, { titulo: PESTANA_MENSUAL })
    console.log(`  🔖 ${destinos.length} rango(s) con nombre publicados en ${PESTANA_MENSUAL}`)
  }
  await escribirVista(google, grillaAgenda({ hoy, refs }), 'dia', refs)
  if (DRY) return console.log('\n--dry: no escribí nada.')

  // ── VERIFICAR CONTRA EL SHEET, que es lo único que prueba una escritura ──
  for (const p of [PESTANA_SEMANAL, PESTANA_MENSUAL]) {
    const v = await google.readSheetValues(ID, `${p}!A1:${letra(FOOTPRINT.cols - 1)}${FOOTPRINT.filas}`).catch(() => [])
    const err = []
    v.forEach((f, i) => (f || []).forEach((c, j) => {
      if (/^#(REF|ERROR|N\/A|VALUE|¡|¿|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`)
    }))
    console.log(`\n${p}: ${err.length ? `⚠ ${err.length} celda(s) en error: ${err.slice(0, 6).join(' ')}` : '✓ sin errores'}`)
  }
}

// Importarlo para testear las grillas —que son puras— NO dispara main(): así el test no escribe nada.
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (ejecutadoDirecto) main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
