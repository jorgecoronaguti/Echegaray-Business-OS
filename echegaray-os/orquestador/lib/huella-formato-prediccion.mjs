// LO QUE EL OS VA A DEJAR EN CADA CELDA — para guardar el sello PENDIENTE antes de aplicar. PURO.
//
// ═══ POR QUÉ (02/10/2026, auditoría) ═══
//
// El sello por celda sale de releer la hoja DESPUÉS del lote. Si esa relectura o el upsert fallan, las
// celdas que el OS acaba de formatear quedan sin sello, la corrida siguiente no puede probar que son
// suyas y las recorta para siempre como «tuyas». El pendiente cubre ese hueco: se guarda ANTES de
// aplicar, mientras la base acaba de responder, y dice «esto es lo que mandé a esta celda». La corrida
// siguiente lo acepta sólo si el formato vivo coincide exactamente.
//
// ═══ LA PREDICCIÓN IMITA A GOOGLE, MEDIDO ═══
//
// · Máscara de campos: `userEnteredFormat` reemplaza todo; `userEnteredFormat.a.b` y
//   `userEnteredFormat(a,b)` reemplazan sólo esos campos, y un campo de la máscara que el request no
//   trae se BORRA de la celda (así funciona la API).
// · Colores truncados a 8 bits: leído del Sheet real el 02/10, `0.52` vuelve como `0.5176471` (132/255)
//   y `0.49` como `0.4862745` (124/255). Sin truncar, el pendiente no coincidiría nunca con la hoja.
// · Sólo se predice `repeatCell`. Una celda que además toca un `updateBorders` o un `updateCells` del
//   mismo lote queda sin pendiente: no se inventa una predicción que no se sabe hacer.

import { normalizarFormatoCelda, TECHO_FILAS_FORMATO } from './firma-formato.mjs'
import { hash, a1DeCelda } from './huella-formato-celda.mjs'

/** Las columnas que lee `leerFormatoDePestana` (A1:BZ): más allá no hay pendiente que sirva. */
const COLS_LEIDAS = 78

function partirNivel(s) {
  const out = []
  let hondo = 0
  let actual = ''
  for (const ch of s) {
    if (ch === '(') hondo++
    if (ch === ')') hondo--
    if (ch === ',' && hondo === 0) { out.push(actual); actual = ''; continue }
    actual += ch
  }
  out.push(actual)
  return out.map((x) => x.trim()).filter(Boolean)
}

function expandir(t) {
  const i = t.indexOf('(')
  if (i < 0) return [t]
  const cabeza = t.slice(0, i)
  return partirNivel(t.slice(i + 1, t.lastIndexOf(')'))).flatMap((x) => expandir(x).map((p) => `${cabeza}.${p}`))
}

/**
 * Los campos de formato de una máscara, relativos a `userEnteredFormat` ('' = el formato entero).
 * `null` cuando no se puede saber qué toca (sin máscara o con `*`): no se predice.
 */
export function camposDeFormato(fields) {
  if (!fields || typeof fields !== 'string') return null
  const out = []
  for (const p of partirNivel(fields).flatMap(expandir)) {
    if (p === '*') return null
    if (p === 'userEnteredFormat') out.push('')
    else if (p.startsWith('userEnteredFormat.')) out.push(p.slice('userEnteredFormat.'.length))
  }
  return out
}

const clonar = (x) => (x === undefined ? undefined : structuredClone(x))
const leer = (o, ruta) => ruta.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o)
function poner(o, ruta, v) {
  const ks = ruta.split('.')
  let a = o
  for (const k of ks.slice(0, -1)) a = (a[k] && typeof a[k] === 'object') ? a[k] : (a[k] = {})
  a[ks[ks.length - 1]] = v
}
function borrar(o, ruta) {
  const ks = ruta.split('.')
  const padre = ks.length > 1 ? leer(o, ks.slice(0, -1).join('.')) : o
  if (padre && typeof padre === 'object') delete padre[ks[ks.length - 1]]
}

/** El formato de una celda después de un `repeatCell` con esa máscara. PURA. */
export function aplicarMascara(actual, fuente, campos) {
  if (campos.includes('')) return clonar(fuente) ?? null
  const out = clonar(actual) ?? {}
  for (const ruta of campos) {
    const v = leer(fuente, ruta)
    if (v === undefined) borrar(out, ruta)
    else poner(out, ruta, clonar(v))
  }
  return out
}

/** Los colores como los guarda Google: cada canal truncado a 8 bits. PURA (devuelve copia). */
export function cuantizar(x) {
  if (Array.isArray(x)) return x.map(cuantizar)
  if (!x || typeof x !== 'object') return x
  const out = {}
  for (const [k, v] of Object.entries(x)) {
    out[k] = (['red', 'green', 'blue'].includes(k) && typeof v === 'number') ? Math.floor(v * 255 + 1e-6) / 255 : cuantizar(v)
  }
  return out
}

function* celdasAcotadas(gr) {
  const f1 = Math.min(Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : TECHO_FILAS_FORMATO, TECHO_FILAS_FORMATO)
  const c1 = Math.min(Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : COLS_LEIDAS, COLS_LEIDAS)
  for (let f = gr?.startRowIndex ?? 0; f < f1; f++) for (let c = gr?.startColumnIndex ?? 0; c < c1; c++) yield [f, c]
}

/**
 * La huella que tendrá cada celda después del lote, aplicando en orden los requests que la guarda dejó
 * pasar sobre la lectura previa. `null` donde no se sabe predecir.
 * @param {{req:object, gr:object}[]} aplicados en el orden del lote
 * @returns {Map<string, string|null>} A1 → huella prevista
 */
export function predecirCeldas(lectura, aplicados = []) {
  const estado = new Map()
  for (const { req, gr } of aplicados) {
    const campos = req?.repeatCell ? camposDeFormato(req.repeatCell.fields) : null
    for (const [f, c] of celdasAcotadas(gr)) {
      const a1 = a1DeCelda(f, c)
      const e = estado.get(a1) ?? { formato: lectura?.filas?.[f]?.[c]?.formato ?? null, predecible: true }
      if (campos === null) e.predecible = false
      else if (e.predecible) e.formato = aplicarMascara(e.formato, req.repeatCell.cell?.userEnteredFormat, campos)
      estado.set(a1, e)
    }
  }
  return new Map([...estado].map(([a1, e]) => [a1, e.predecible ? hash(normalizarFormatoCelda(cuantizar(e.formato))) : null]))
}
