#!/usr/bin/env node
// LA LISTA DEL DESPLEGABLE DE «OBRA» EN EL FLUJO DE CAJA: `_OBRAS_OS` y las dos validaciones.
//
// ═══ CUÁNDO SE CORRE ═══
//
// Cuando CAMBIA EL CATÁLOGO: obra nueva, obra fusionada, código o nombre corregido, o un cliente que
// pasa a tener más de una obra viva (ahí aparece «Sin obra – cliente»). También es el arreglo cuando el
// dueño abre el desplegable y no encuentra una obra que ya existe en la app.
//
// NO HAY TIMER, Y ES A PROPÓSITO. El catálogo cambia por una decisión —dar de alta una obra—, no por el
// paso del tiempo: un timer más escribiendo sobre el Flujo de Caja es una escritura más que nadie pidió,
// y este archivo ya pagó ese precio. El que da de alta la obra corre esto, o lo corre el script de
// inserción la primera vez.
//
//   node orquestador/scripts/obras-lista-sheet.mjs                            # dice qué escribiría
//   node orquestador/scripts/obras-lista-sheet.mjs --aplicar                  # escribe la lista y (re)pone las validaciones
//   node orquestador/scripts/obras-lista-sheet.mjs --copia <fileId> --aplicar # sobre una COPIA de ensayo, nunca el real
//
// La base se LEE (select): las obras salen de `obra_canonica` y `cliente_alias` por
// `catalogosDeAsignacion`, y las opciones de `opcionesDeObra` — la misma función que la app y el espejo
// de `public.obra_celda_resolver`. Dos definiciones del desplegable serían dos verdades.

import { pathToFileURL } from 'node:url'
import { catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { catalogoDeDestinos, opcionesDeObra } from '../lib/obra-destino.mjs'
import { ALTO_MINIMO_AUX, AUX, filasDeLaLista, problemasDeLaColumna, rangoDeDatos, requestDeLaLista, requestsDeValidacion } from '../lib/obra-desplegable.mjs'
import { INSERCIONES } from './sheet-insertar-columna-obra.mjs'

/** Las opciones vigentes, leídas de la base. Sólo select. */
export async function opcionesDesdeLaBase(query) {
  const c = await catalogosDeAsignacion(query)
  return opcionesDeObra(catalogoDeDestinos({ obras: c.canonicas, clienteAlias: c.clienteAlias }))
}

/** La pestaña auxiliar, creada oculta si no está, y con filas suficientes. Devuelve su hoja de meta. */
async function asegurarAux(google, id, alto, log) {
  let aux = (await google.getSheetMeta(id)).find((s) => s.title === AUX)
  if (!aux) {
    await google.spreadsheetBatchUpdate(id, [{ addSheet: { properties: { title: AUX, hidden: true, gridProperties: { rowCount: Math.max(alto, ALTO_MINIMO_AUX), columnCount: 1 } } } }], { espejo: true })
    aux = (await google.getSheetMeta(id)).find((s) => s.title === AUX)
    if (!aux) throw new Error(`no pude crear ${AUX}`)
    log(`  creada la pestaña ${AUX} (oculta)`)
  }
  if ((aux.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(id, [{ appendDimension: { sheetId: aux.sheetId, dimension: 'ROWS', length: alto - (aux.rows ?? 0) } }], { espejo: true })
    log(`  ${AUX}: grilla agrandada a ${alto} filas`)
  }
  return aux
}

/**
 * LA LISTA EN EL SHEET, y su prueba: se relee el rango y tiene que decir exactamente las opciones.
 * @returns {Promise<{ok:boolean, paso:string, detalle?:string[], filas:string[][]}>}
 */
export async function refrescarLista({ google, id, opciones, aplicar = false, log = console.log }) {
  const filas = filasDeLaLista(opciones)
  log(`${AUX}: ${filas.length - 1} opción(es) — ${filas.slice(1, 4).map(([t]) => t).join(' · ')}${filas.length > 4 ? ' …' : ''}`)
  if (!aplicar) { log('(dry) no llamé a ninguna API de escritura'); return { ok: true, paso: 'dry', filas } }

  const alto = Math.max(filas.length, ALTO_MINIMO_AUX)
  const aux = await asegurarAux(google, id, alto, log)
  const res = await google.spreadsheetBatchUpdate(id, [requestDeLaLista({ sheetId: aux.sheetId, filas, alto })], { espejo: true })
  if (res?.protegido || res?.congelado || res?.frenados?.length) return { ok: false, paso: 'escritura', detalle: [JSON.stringify(res).slice(0, 200)], filas }

  const leido = (await google.readSheetValues(id, `'${AUX}'!A2:A`, { render: 'UNFORMATTED_VALUE' }) ?? [])
    .map((f) => String(f?.[0] ?? '').trim()).filter(Boolean)
  const esperado = filas.slice(1).map(([t]) => t)
  const mal = []
  if (leido.length !== esperado.length) mal.push(`${AUX} quedó con ${leido.length} opción(es) y esperaba ${esperado.length}`)
  for (const [i, e] of esperado.entries()) if (leido[i] !== e) { mal.push(`${AUX}!A${i + 2}: dice «${leido[i] ?? '(vacía)'}» y esperaba «${e}»`); break }
  if (mal.length) return { ok: false, paso: 'relectura', detalle: mal, filas }
  log(`  ${AUX}: ${esperado.length} opción(es) releídas en su lugar`)
  return { ok: true, paso: 'fin', filas }
}

/**
 * LAS VALIDACIONES DE COMPRAS Y COBRANZAS, y su prueba: la COLUMNA ENTERA releída, no una celda.
 * Idempotente: `setDataValidation` reemplaza la regla del rango, no apila.
 */
export async function ponerDesplegable({ google, id, inserciones = INSERCIONES, log = console.log }) {
  const meta = await google.getSheetMeta(id)
  const hoja = (p) => meta.find((s) => s.title === p)
  const req = requestsDeValidacion(inserciones, (p) => hoja(p)?.sheetId, (p) => hoja(p)?.rows)
  // SIN `yaGuardado`: la guarda central se mira entera. Los dos requests son inocuos para ella —uno es
  // `setDataValidation`, el otro un `updateCells` cuya máscara es `dataValidation` sola, que no puede
  // tocar ni un valor ni un formato— y desde hoy `claveDeFormato` tampoco lo confunde con una pasada de
  // diseño. Saltear la guarda para poner un desplegable sería apagar la alarma de toda la casa para
  // entrar por la puerta que ya estaba abierta. Lo que quedó escrito se verifica releyendo la columna
  // entera, abajo: la que manda es la celda releída, no el 200 del batchUpdate.
  const res = await google.spreadsheetBatchUpdate(id, req)
  if (res?.protegido || res?.congelado || res?.frenados?.length) return { ok: false, paso: 'escritura', detalle: [JSON.stringify(res).slice(0, 200)] }

  const hojas = await google.readSheetValidations(id, inserciones.map((ins) => `${rangoDeDatos(ins)}${hoja(ins.pestana)?.rows ?? ''}`))
  const mal = inserciones.flatMap((ins) => problemasDeLaColumna(hojas.find((x) => x.properties?.title === ins.pestana), ins))
  if (mal.length) return { ok: false, paso: 'relectura', detalle: mal }
  for (const ins of inserciones) log(`  desplegable puesto y releído en ${rangoDeDatos(ins)}${hoja(ins.pestana)?.rows ?? ''}`)
  return { ok: true, paso: 'fin' }
}

/** Lista + validaciones, en ese orden: la validación necesita que el rango de la lista ya exista. */
export async function refrescarTodo({ google, id, opciones, aplicar = false, log = console.log }) {
  const lista = await refrescarLista({ google, id, opciones, aplicar, log })
  if (!lista.ok || !aplicar) return lista
  return ponerDesplegable({ google, id, log })
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const { modoDeCorrida } = await import('./sheet-insertar-columna-obra.mjs')
  const modo = modoDeCorrida(process.argv)
  const { makeGoogleClient, WRITE_SCOPES, READONLY_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const db = await import('../lib/db.mjs')
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar ? WRITE_SCOPES : READONLY_SCOPES })
  try {
    if (modo.copia) console.log(`(copia ${modo.id}: no es el archivo real)`)
    const r = await refrescarTodo({ google, id: modo.id, opciones: await opcionesDesdeLaBase(db.query), aplicar })
    if (!r.ok) { console.error(`✖ ${r.paso}: ${(r.detalle ?? []).join(' · ')}`); process.exitCode = 1 }
  } finally {
    await db.closePool().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
