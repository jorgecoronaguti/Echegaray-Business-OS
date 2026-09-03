// EL DISEÑO TAMBIÉN ES SUYO — la huella del FORMATO, por rango y no por pestaña.
//
// ═══ POR QUÉ (03/09) ═══
//
// El dueño precisó qué quiere decir "respetar mis ediciones": *"todo lo que escribo, borro, modifico,
// agrego, saco, edito de diseño, cambio de lugar, copio y pego"*. **Edito de diseño** es esta mitad.
//
// La firma de formato existía desde el 01/08 (`firma-formato.mjs`) y es POR PESTAÑA: si el dueño
// pintaba una celda, la pestaña entera quedaba protegida y el OS no le podía volver a aplicar NINGÚN
// formato. Es el mismo "todo o nada" que el candado, y por eso `formatoGuardia` nunca se enchufó al
// portón: enchufarlo habría congelado el mantenimiento visual de las catorce pestañas.
//
// Acá la unidad es el RANGO del request: el OS recuerda qué formato dejó en cada rango que formatea, y
// antes de re-aplicarlo compara. Si el rango cambió, ese request no entra; los demás sí. La pestaña
// sigue manteniéndose sola salvo exactamente en lo que él tocó.
//
// ═══ `userEnteredFormat`, NO `effectiveFormat` (heredado de firma-formato, 01/08) ═══
//
// `effectiveFormat` es lo que se VE e incluye el formato condicional y el que Google deduce de una
// fórmula: cambia cuando cambia un VALOR, sin que nadie haya tocado un formato. Hashear eso daría un
// falso positivo en cada recálculo, y un falso positivo acá congela el diseño.
//
// ═══ UNA LECTURA POR PESTAÑA, NO UNA POR REQUEST ═══
//
// Un solo paso del pipeline manda decenas de `repeatCell`. Leer el formato vivo por request costaría
// decenas de llamadas y rozaría la cuota. Se lee `A1:BZ{TECHO}` UNA vez por pestaña y por corrida, y
// la firma de cada rango se recorta de esa lectura. El techo de filas es el mismo de `firma-formato`
// y por el mismo motivo: costo, no criterio. Un formato aplicado por debajo de esa fila no lleva
// huella y por lo tanto no se protege — declarado, no escondido.

import { createHash } from 'node:crypto'
import { letraCol } from './preservar-anotaciones.mjs'
import { normalizarFormatoCelda, TECHO_FILAS_FORMATO } from './firma-formato.mjs'
import { citarTab } from './propiedad-celda.mjs'

export const TIPO = { CELDA: 'celda', MERGE: 'merge', ANCHO: 'ancho', ALTO: 'alto', PESTANA: 'pestana' }

/** A1 de un GridRange (fin exclusivo, como lo manda la API). Puro. */
export function a1DeGridRange(r) {
  if (!r) return null
  const f0 = (r.startRowIndex ?? 0) + 1
  const c0 = r.startColumnIndex ?? 0
  const f1 = Number.isInteger(r.endRowIndex) ? r.endRowIndex : null
  const c1 = Number.isInteger(r.endColumnIndex) ? r.endColumnIndex - 1 : null
  return `${letraCol(c0)}${f0}:${c1 === null ? '' : letraCol(c1)}${f1 ?? ''}`
}

/**
 * Qué formatea un request, si formatea algo. Puro.
 * @returns {{tipo:string, sheetId:number, rango:string, gr:object|null}|null}
 */
export function claveDeFormato(req) {
  if (!req || typeof req !== 'object') return null
  const deRango = (tipo, r) => (r && r.sheetId !== undefined ? { tipo, sheetId: r.sheetId, rango: a1DeGridRange(r), gr: r } : null)
  if (req.repeatCell) return deRango(TIPO.CELDA, req.repeatCell.range)
  if (req.updateBorders) return deRango(TIPO.CELDA, req.updateBorders.range)
  // Un updateCells que NO escribe valor es una pasada de formato como cualquier otra.
  if (req.updateCells && !/userEnteredValue/.test(String(req.updateCells.fields ?? '*'))) {
    return deRango(TIPO.CELDA, req.updateCells.range ?? null)
  }
  if (req.mergeCells) return deRango(TIPO.MERGE, req.mergeCells.range)
  if (req.unmergeCells) return deRango(TIPO.MERGE, req.unmergeCells.range)
  if (req.updateDimensionProperties) {
    const r = req.updateDimensionProperties.range
    if (!r || r.sheetId === undefined) return null
    const tipo = r.dimension === 'COLUMNS' ? TIPO.ANCHO : TIPO.ALTO
    return { tipo, sheetId: r.sheetId, rango: `${r.dimension}:${r.startIndex}-${r.endIndex}`, gr: r }
  }
  if (req.updateSheetProperties) {
    const p = req.updateSheetProperties.properties
    if (!p || p.sheetId === undefined) return null
    return { tipo: TIPO.PESTANA, sheetId: p.sheetId, rango: '*', gr: null }
  }
  return null
}

/** Hash corto y estable de cualquier estructura normalizada. */
function hash(x) { return createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16) }

/**
 * NÚCLEO PURO: la huella del formato vivo de un rango, recortada de la lectura de la pestaña.
 * Devuelve null cuando no hay con qué juzgar (lectura ausente).
 */
export function huellaDeRango(tipo, lectura, gr) {
  if (!lectura) return null
  if (tipo === TIPO.CELDA) {
    const f0 = gr?.startRowIndex ?? 0
    const c0 = gr?.startColumnIndex ?? 0
    const f1 = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : (lectura.filas?.length ?? 0)
    const c1 = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : Infinity
    const trozo = (lectura.filas ?? []).slice(f0, f1).map((f) => (f || []).slice(c0, c1 === Infinity ? undefined : c1)
      .map((c) => normalizarFormatoCelda(c?.formato)))
    return hash(trozo)
  }
  if (tipo === TIPO.ANCHO) return hash((lectura.anchos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined))
  if (tipo === TIPO.ALTO) return hash((lectura.altos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined))
  if (tipo === TIPO.MERGE) {
    const f0 = gr?.startRowIndex ?? 0
    const f1 = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : Infinity
    const c0 = gr?.startColumnIndex ?? 0
    const c1 = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : Infinity
    const dentro = (lectura.merges ?? []).filter((m) => m.fila < f1 && m.filaFin > f0 && m.col < c1 && m.colFin > c0)
    return hash(dentro.map((m) => [m.fila, m.filaFin, m.col, m.colFin]).sort())
  }
  if (tipo === TIPO.PESTANA) return hash([lectura.congeladas?.filas ?? 0, lectura.congeladas?.columnas ?? 0])
  return null
}

/** ¿El formato vivo de ese rango es el que trae una pestaña sin formatear? Entonces no es de nadie. */
export function esFormatoVirgen(tipo, lectura, gr) {
  if (tipo === TIPO.CELDA) {
    const f0 = gr?.startRowIndex ?? 0
    const f1 = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : (lectura?.filas?.length ?? 0)
    const c0 = gr?.startColumnIndex ?? 0
    const c1 = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : Infinity
    return (lectura?.filas ?? []).slice(f0, f1).every((f) => (f || []).slice(c0, c1 === Infinity ? undefined : c1).every((c) => !c?.formato))
  }
  if (tipo === TIPO.ANCHO) return (lectura?.anchos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined).every((a) => a == null)
  if (tipo === TIPO.ALTO) return (lectura?.altos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined).every((a) => a == null)
  if (tipo === TIPO.MERGE) return huellaDeRango(TIPO.MERGE, lectura, gr) === huellaDeRango(TIPO.MERGE, { merges: [] }, gr)
  if (tipo === TIPO.PESTANA) return (lectura?.congeladas?.filas ?? 0) === 0 && (lectura?.congeladas?.columnas ?? 0) === 0
  return false
}

/**
 * LA DECISIÓN, PURA. Es el corazón de (h) y por eso vive sola, sin base ni red al lado.
 *
 * @param {{huellaViva:string|null, huellaGuardada:string|null, pestanaSinHuellas:boolean, virgen:boolean}} x
 * @returns {{aplica:boolean, sellar:boolean, motivo:string}}
 */
export function decidirFormato({ huellaViva, huellaGuardada, pestanaSinHuellas, virgen }) {
  if (!huellaViva) return { aplica: false, sellar: false, motivo: 'no pude leer el formato vivo del rango (fail-closed)' }
  if (huellaGuardada && huellaGuardada === huellaViva) return { aplica: true, sellar: true, motivo: 'el formato es el que dejé' }
  if (huellaGuardada) return { aplica: false, sellar: false, motivo: 'el formato de ese rango difiere del que dejé: lo cambiaste vos' }
  // SIN HUELLA PREVIA. La primera corrida después del deploy no puede quedarse sin poder formatear
  // nada: si la pestaña todavía no tiene NINGUNA huella de formato, se aplica y se siembra. A partir
  // de ahí, un rango sin huella con formato ya puesto es del dueño (o de un layout que el OS abandonó,
  // y en la duda manda él).
  if (pestanaSinHuellas) return { aplica: true, sellar: true, motivo: 'primera pasada de formato sobre esta pestaña: aplico y siembro la huella' }
  if (virgen) return { aplica: true, sellar: true, motivo: 'ese rango no tiene formato puesto: no hay diseño tuyo que respetar' }
  return { aplica: false, sellar: false, motivo: 'ese rango ya tiene un formato que yo no puse: lo respeto' }
}

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

/**
 * LA GUARDA DE DISEÑO para un lote de `spreadsheetBatchUpdate`. Impura (lee el Sheet y la base).
 *
 * Devuelve los requests que se pueden aplicar y un `sellar()` para DESPUÉS de aplicarlos: la huella
 * nueva sale de RELEER el formato que quedó, nunca del request que se mandó. Hashear lo que se mandó
 * sería validar el control contra la misma información que lo produce.
 *
 * FAIL-CLOSED: sin base, o sin poder leer el formato vivo, no se aplica ningún formato. Un Sheet con
 * el formato de ayer se arregla en la corrida siguiente; el diseño que el dueño hizo, no.
 */
export async function filtrarFormato(cliente, fileId, requests = [], id2tab = new Map(), { esProtegible = (t) => Boolean(t) && !String(t).startsWith('_') } = {}) {
  const claves = requests.map((r) => claveDeFormato(r))
  const conFormato = claves.map((c, i) => ({ c, i })).filter((x) => x.c && esProtegible(id2tab.get(x.c.sheetId)))
  if (!conFormato.length) return { requests, respetadas: [], sellar: async () => {} }
  const porTab = new Map()
  for (const { c } of conFormato) {
    const tab = id2tab.get(c.sheetId)
    if (!porTab.has(tab)) porTab.set(tab, { conAltos: false, conMerges: false })
    if (c.tipo === TIPO.ALTO) porTab.get(tab).conAltos = true
    if (c.tipo === TIPO.MERGE) porTab.get(tab).conMerges = true
  }
  const vivos = new Map(); const guardadas = new Map()
  for (const [tab, necesita] of porTab) {
    vivos.set(tab, await leerFormatoDePestana(cliente, fileId, tab, necesita).catch(() => null))
    guardadas.set(tab, await leerHuellasFormato({}, fileId, tab).catch(() => null))
  }
  const salida = []; const respetadas = []; const aSellar = []
  const frenado = new Set()
  for (const { c, i } of conFormato) {
    const tab = id2tab.get(c.sheetId)
    const mapa = guardadas.get(tab)
    if (mapa === null) {
      frenado.add(i)
      respetadas.push({ pestana: tab, celda: c.rango, valorDueno: null, valorOs: null, causa: 'sin base no puedo saber qué formato dejé: no lo re-aplico (fail-closed)' })
      continue
    }
    const vivo = vivos.get(tab)
    const d = decidirFormato({
      huellaViva: huellaDeRango(c.tipo, vivo, c.gr),
      huellaGuardada: mapa.get(`${c.tipo}|${c.rango}`) ?? null,
      pestanaSinHuellas: mapa.size === 0,
      virgen: esFormatoVirgen(c.tipo, vivo, c.gr),
    })
    if (!d.aplica) {
      frenado.add(i)
      respetadas.push({ pestana: tab, celda: c.rango, valorDueno: null, valorOs: null, causa: `diseño: ${d.motivo}` })
      console.log(`  🎨 "${tab}"!${c.rango}: no re-aplico el formato — ${d.motivo}.`)
      continue
    }
    if (d.sellar) aSellar.push({ tab, tipo: c.tipo, rango: c.rango, gr: c.gr })
  }
  requests.forEach((r, i) => { if (!frenado.has(i)) salida.push(r) })
  return {
    requests: salida,
    respetadas,
    sellar: async () => {
      const releidos = new Map()
      for (const s of aSellar) {
        // Se acaba de aplicar formato: lo cacheado ya no es lo que hay en la hoja.
        if (!releidos.has(s.tab)) {
          invalidarFormato(fileId, s.tab)
          releidos.set(s.tab, await leerFormatoDePestana(cliente, fileId, s.tab, porTab.get(s.tab) ?? {}).catch(() => null))
        }
        const h = huellaDeRango(s.tipo, releidos.get(s.tab), s.gr)
        if (h) await guardarHuellaFormato({}, fileId, s.tab, s.tipo, s.rango, h).catch(() => {})
      }
    },
  }
}
