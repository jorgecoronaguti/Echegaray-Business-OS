#!/usr/bin/env node
// LAS DOS VISTAS DE CASH FLOW, COMO MATRIZ — el que escribe.
//
// ═══ QUÉ CAMBIÓ (06/08/2026) ═══
//
// Las dos pestañas dejan de ser bloques verticales y vuelven a ser lo que un cash flow es en cualquier
// empresa: **una fila por concepto, el tiempo a la derecha**. El diseño vive en lib/cash-flow-semanas.mjs
// (13 semanas) y lib/cash-flow-meses.mjs (12 meses); acá está sólo lo que toca la red.
//
// UNA PESTAÑA, UN ESCRITOR. `cash-flow-rehacer.mjs` —la matriz de 51 columnas de julio— queda como
// módulo (sus funciones puras las siguen usando otros tests) pero NO corre en el pipeline: dos
// escritores sobre una misma pestaña producen el candado falso (el que escribe último sella la firma
// y el otro se auto-canda en la corrida siguiente).
//
// LA HOJA SE ACHICA. Venían de 220×65 y 220×62 para mostrar 15 columnas: el resto era zona auxiliar
// oculta y el ancla de los gráficos. Ahora el footprint es el de la matriz y lo que sobra se BORRA —
// después de escribir, que es cuando ya se sabe que la firma dio permiso.
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
import { rectangulo, letra } from '../lib/cash-flow-matriz.mjs'
import { grillaSemanal, PESTANA_SEMANAL } from '../lib/cash-flow-semanas.mjs'
import { grillaMeses, destinosNombrados, PESTANA_MENSUAL } from '../lib/cash-flow-meses.mjs'
import {
  grillaPresupuesto, rescatarPresupuesto, formatoPresupuesto,
  PESTANA_PRESUPUESTO, ANCHO_PRESUPUESTO,
} from '../lib/cash-flow-presupuesto.mjs'
import { pielMatriz, reglasCondicionales, borrarCondicionales, achicarHoja } from '../lib/cash-flow-piel-matriz.mjs'
import { requestsDeGraficosMatriz } from '../lib/cash-flow-graficos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const AÑO = Number(process.env.ORQ_CF_ANIO || 2026)

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

/** Asegura que la pestaña exista y tenga sitio para lo que se va a escribir. Sólo AGRANDA (achicar va después). */
async function asegurarHoja(google, titulo, { filas, cols }) {
  // `hallarPestana` TIRA cuando la pestaña no existe — no devuelve null. En el arranque en frío eso
  // rompía el --dry y habría roto la corrida real.
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
 * Escribe una vista: valores con la Regla 0, gráficos viejos, tamaño, formato, gráficos nuevos.
 *
 * EL ORDEN NO ES INDISTINTO. Los gráficos viejos se borran ANTES de achicar la hoja porque están
 * anclados en la columna 59 del diseño anterior; el formato va DESPUÉS de achicar para no pintar
 * columnas que ya no existen; y los gráficos nuevos van en su PROPIO lote, porque un addChart que
 * falle no puede tirarse abajo el formato de la pestaña entera.
 *
 * Devuelve la hoja y si de verdad se escribió: una pestaña que NO se escribió no cambió de forma, así
 * que tampoco se le tocan el formato, el tamaño ni sus rangos con nombre.
 */
async function escribirVista(google, construir, footprint, refs, nombresDe = null) {
  const previa = construir(null)
  const hoja = await asegurarHoja(google, previa.meta.pestana, footprint)
  // El vínculo "📅 hoy" necesita el gid de la propia pestaña: se construye de nuevo con él ya sabido.
  const { filas, meta } = construir(hoja?.sheetId ?? null)
  const grid = rectangulo(filas, VACIO, { alto: footprint.filas, ancho: footprint.cols })
  console.log(`${meta.pestana}: ${meta.filaFin} filas de contenido en un footprint de ${grid.length}×${grid[0].length}`)
  if (DRY) {
    for (const f of filas.slice(0, 16)) console.log('  ', (f || []).slice(0, 3).map((x) => String(x ?? '').slice(0, 52)).join(' | '))
    return { hoja, escrito: false }
  }
  const actual = await google.readSheetValues(ID, `${meta.pestana}!A1:${letra(footprint.cols - 1)}${footprint.filas}`)
    .catch((e) => { throw new Error(`no pude leer "${meta.pestana}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`) })
  const { grid: fusionada, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, meta.pestana, grid, actual)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}")`)
  const escritura = await escribirPreservando(google, ID, refPestana(meta.pestana), fusionada, {
    anchoHoja: footprint.cols, respetar: false, // la Regla 0 ya se aplicó arriba, sobre la grilla entera
  })
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.log(`  🔒 "${meta.pestana}" bajo tu control: no escribí, y NO le toco el formato ni los gráficos.`)
    return { hoja, escrito: false }
  }
  await guardarRegistro(ID, meta.pestana, fusionada, ediciones, actual, candidatos)
    .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude guardar el registro de rótulos: ${e.message}`))

  // ── LOS NOMBRES SE PUBLICAN ANTES DE ACHICAR (06/08, pagado en vivo) ──
  //
  // El achique borró las columnas donde vivían CF_SALDO_INICIO/CF_SALDO_CIERRE y Google los dejó
  // QUEMADOS: el GET no los proyecta pero el nombre sigue reservado — el add da 400 para siempre.
  // Publicando primero, el nombre ya apunta a la matriz nueva cuando las columnas viejas mueren.
  const destinos = nombresDe ? nombresDe(meta) : []
  if (destinos.length) {
    await publicar(google, ID, hoja.sheetId, destinos, { titulo: meta.pestana })
    console.log(`  🔖 ${destinos.length} rango(s) con nombre publicados en ${meta.pestana}`)
  }

  const graficos = await requestsDeGraficosMatriz(google, ID, hoja.sheetId, meta, meta.pestana)
  if (graficos.borrar.length) {
    await google.spreadsheetBatchUpdate(ID, graficos.borrar)
      .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude borrar los gráficos viejos (${e.message})`))
  }

  // ── La hoja al tamaño del cuadro ────────────────────────────────────────────────────────────────
  const sobra = achicarHoja(hoja.sheetId, { filas: hoja.rows ?? 0, cols: hoja.cols ?? 0 }, footprint)
  if (sobra.length) {
    await google.spreadsheetBatchUpdate(ID, sobra)
      .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude achicar la hoja (${e.message})`))
    console.log(`  ✂ ${meta.pestana}: la hoja pasa de ${hoja.rows}×${hoja.cols} a ${footprint.filas}×${footprint.cols}`)
  }

  // ── El formato, con las reglas condicionales borradas ANTES de re-crearse ──
  const cf = await google.getConditionalFormats(ID).catch(() => [])
  const cuantas = cf.find((c) => c.sheetId === hoja.sheetId)?.reglas ?? 0
  await google.spreadsheetBatchUpdate(ID, [
    ...borrarCondicionales(hoja.sheetId, cuantas),
    ...pielMatriz({ sheetId: hoja.sheetId, meta }),
    ...reglasCondicionales({ sheetId: hoja.sheetId, meta, refMinima: refs.minima }),
  ])
  console.log(`  🎨 formato aplicado · ${cuantas} regla(s) condicional(es) vieja(s) borrada(s)`)

  if (graficos.dibujar.length) {
    await google.spreadsheetBatchUpdate(ID, graficos.dibujar)
      .catch((e) => console.warn(`  ⚠ ${meta.pestana}: los gráficos fallaron (${e.message}); la tabla quedó bien`))
  }
  return { hoja, escrito: true, meta }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const refs = await refsDeCaja(google)
  console.log(`Ancla de saldo: ${refs.saldo ?? '⚠ sin rango con nombre'} · piso: ${refs.minima ?? '(sin caja mínima)'}`)

  // El presupuesto VA PRIMERO: el Mensual cita sus rangos con nombre, y un nombre que todavía no
  // existe deja #NAME? en la pestaña que el dueño abre todos los días.
  await rehacerPresupuesto(google)

  const hoy = new Date()
  // EL MENSUAL VA PRIMERO, y no es indistinto: publica CF_MESES —los doce meses del ejercicio— y la
  // proyección de comisiones del SEMANAL cuenta sobre ese rango.
  const mensual = grillaMeses({ anio: AÑO, refs })
  // Los nombres los publica escribirVista ANTES de achicar la hoja: publicarlos después dejó
  // CF_SALDO_INICIO/CIERRE quemados el 06/08 (ver el comentario adentro).
  await escribirVista(google, () => grillaMeses({ anio: AÑO, refs }), mensual.meta.footprint, refs, destinosNombrados)
  const semanal = grillaSemanal({ hoy, refs })
  await escribirVista(google, (gid) => grillaSemanal({ hoy, refs, gid }), semanal.meta.footprint, refs)
  if (DRY) return console.log('\n--dry: no escribí nada.')

  // ── VERIFICAR CONTRA EL SHEET, que es lo único que prueba una escritura ──
  for (const [p, fp] of [[PESTANA_SEMANAL, semanal.meta.footprint], [PESTANA_MENSUAL, mensual.meta.footprint]]) {
    const v = await google.readSheetValues(ID, `${p}!A1:${letra(fp.cols - 1)}${fp.filas}`).catch(() => [])
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
