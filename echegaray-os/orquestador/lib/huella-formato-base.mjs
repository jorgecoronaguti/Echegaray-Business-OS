// LA BASE DE LA HUELLA DE FORMATO: dónde se guarda y cómo se lee el formato vivo. Impuro.
//
// Vive aparte de `huella-formato.mjs` desde el 02/10 sólo por tamaño: la decisión, el recorte por
// celda y el sello pendiente no entraban en un archivo de 500 líneas. Nada de acá decide: guarda, lee
// y cachea. `huella-formato.mjs` re-exporta todo, así que los llamadores no cambian.

import { TECHO_FILAS_FORMATO } from './firma-formato.mjs'
import { citarTab } from './propiedad-celda.mjs'
import { TIPO_CELDA1 } from './huella-formato-celda.mjs'
// ─────────────────────────────────── PERSISTENCIA (impura, base) ───────────────────────────────────

async function q(deps) {
  if (deps?.query) return deps.query
  return (await import('./db.mjs')).query
}

// El DDL no vive acá: la fuente es la migración `20260903T1200_…`. Un módulo que se crea su propia
// tabla puede nacer con un esquema distinto del migrado, y además la crearía SIN RLS — que es
// exactamente lo que este archivo no puede hacer, porque guarda cómo se ve el Sheet del dueño.
// Si la tabla no está, el SELECT falla, la guarda falla CERRADA (no se re-aplica ningún formato) y
// se dice por qué. Una vez por proceso.
let tablaVerificada = null
async function asegurarTabla(query) {
  if (tablaVerificada) return tablaVerificada
  tablaVerificada = query("select to_regclass('public.sheet_huella_formato') as t").then((r) => {
    if (!r.rows[0]?.t) {
      throw new Error('falta public.sheet_huella_formato: aplicá la migración 20260903T1200_tus_ediciones_mandan_celda_por_celda.sql')
    }
    return true
  })
  // UN MEMO QUE CACHEA EL RECHAZO DEJA LA GUARDA MUERTA PARA SIEMPRE: una base que tembló una vez,
  // o un test que arranca sin ella, envenenarían el resto del proceso. Sólo se recuerda el ÉXITO.
  tablaVerificada = tablaVerificada.catch((e) => { tablaVerificada = null; throw e })
  return tablaVerificada
}

/** Sólo para los tests: olvida el chequeo de una vez por proceso. */
export function olvidarTablaFormatoVerificada() { tablaVerificada = null }

/** Las huellas de formato de una pestaña: Map("tipo|rango" → huella). */
export async function leerHuellasFormato(deps, fileId, pestana) {
  const query = await q(deps)
  await asegurarTabla(query)
  const r = await query('select rango_a1, tipo, huella from public.sheet_huella_formato where file_id = $1 and pestana = $2', [fileId, pestana])
  return new Map(r.rows.map((x) => [`${x.tipo}|${x.rango_a1}`, x.huella]))
}

/** Sella la huella del formato que quedó aplicado en un rango. */
export async function guardarHuellaFormato(deps, fileId, pestana, tipo, rango, huella) {
  const query = await q(deps)
  await asegurarTabla(query)
  await query(
    `insert into public.sheet_huella_formato (file_id, pestana, rango_a1, tipo, huella, aplicado_en)
     values ($1,$2,$3,$4,$5, now())
     on conflict (file_id, pestana, rango_a1, tipo)
     do update set huella = excluded.huella, aplicado_en = now()`,
    [fileId, pestana, rango, tipo, huella])
}

/** Cuántos sellos por celda viajan en un solo INSERT. */
const LOTE_SELLOS = 1000

/**
 * Sella la huella de cada celda que quedó formateada (Map A1 → huella), en UN upsert por lote.
 * Una pestaña son ~1.300 celdas: una consulta por celda serían 1.300 viajes a la base por corrida.
 */
export async function guardarHuellasDeCeldas(deps, fileId, pestana, huellas, tipo = TIPO_CELDA1) {
  if (!huellas?.size) return 0
  const query = await q(deps)
  await asegurarTabla(query)
  const pares = [...huellas]
  for (let i = 0; i < pares.length; i += LOTE_SELLOS) {
    const tramo = pares.slice(i, i + LOTE_SELLOS)
    await query(
      `insert into public.sheet_huella_formato (file_id, pestana, rango_a1, tipo, huella, aplicado_en)
       select $1, $2, t.rango, $3, t.huella, now() from unnest($4::text[], $5::text[]) as t(rango, huella)
       on conflict (file_id, pestana, rango_a1, tipo)
       do update set huella = excluded.huella, aplicado_en = now()`,
      [fileId, pestana, tipo, tramo.map((p) => p[0]), tramo.map((p) => p[1])])
  }
  return pares.length
}

/**
 * Borra las huellas de formato de UNA pestaña, sólo de los tipos pedidos. Devuelve cuántas borró.
 * Sin tipos no borra nada: «todos» se pide nombrándolos, no por omisión.
 */
export async function borrarHuellasPorTipo(deps, fileId, pestana, tipos = []) {
  if (!fileId || !pestana || !tipos.length) return 0
  const query = await q(deps)
  await asegurarTabla(query)
  const r = await query(
    'delete from public.sheet_huella_formato where file_id = $1 and pestana = $2 and tipo = any($3::text[])',
    [fileId, pestana, tipos])
  return r.rowCount ?? 0
}

// ═══ EL CACHÉ, PORQUE «UNA LECTURA POR PESTAÑA» ERA UNA PROMESA SIN CUMPLIR (03/09, auditoría) ═══
//
// El encabezado prometía una lectura por pestaña y por corrida, y lo que había era una por BATCH: un
// generador que manda cuatro lotes de formato sobre la misma pestaña pagaba cuatro lecturas de
// `A1:BZ2000` —156.000 celdas cada una— y el sellado, una quinta. Con catorce pestañas eso es
// exactamente el tipo de gasto que hace que alguien apague la guarda.
//
// El caché vive en el PROCESO y no expira solo. Es correcto porque dentro de una corrida el único que
// cambia el formato es el propio OS, y cuando lo cambia invalida la pestaña (`sellar` lo hace). Un
// generador es un proceso que arranca, escribe su pestaña y termina.
const cacheFormato = new Map()

/** Se llama después de aplicar formato: lo que está en el caché ya no es lo que hay en la hoja. */
export function invalidarFormato(fileId, tab) {
  for (const k of [...cacheFormato.keys()]) if (k.startsWith(`${fileId}|${tab}|`)) cacheFormato.delete(k)
}

/** Sólo para los tests: vacía el caché entero. */
export function olvidarCacheFormato() { cacheFormato.clear() }

/** Lee el formato vivo de una pestaña entera. Una sola vez por proceso, pestaña y juego de campos. */
export async function leerFormatoDePestana(cliente, fileId, tab, { conAltos = false, conMerges = false } = {}) {
  const clave = `${fileId}|${tab}|${conAltos ? 'a' : ''}${conMerges ? 'm' : ''}`
  if (cacheFormato.has(clave)) return cacheFormato.get(clave)
  const ref = `${citarTab(tab)}!A1:BZ${TECHO_FILAS_FORMATO}`
  const out = await cliente.readSheetUserFormats(fileId, ref)
  if (!out) return null   // el fallo NO se cachea: la corrida siguiente tiene derecho a reintentar
  if (conAltos && cliente.readSheetFormats) {
    const f = await cliente.readSheetFormats(fileId, ref).catch(() => null)
    out.altos = f?.altos ?? []
  }
  if (conMerges && cliente.readSheetGrid) {
    const g = await cliente.readSheetGrid(fileId, ref).catch(() => null)
    out.merges = g?.merges ?? []
  }
  cacheFormato.set(clave, out)
  return out
}
