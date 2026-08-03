// LA PESTAÑA "Compras" VIVA — para no cargar dos veces lo que ya está cargado.
//
// ═══ POR QUÉ NO ALCANZA EL REGISTRO PROPIO (03/08) ═══
//
// `comunicacion.comprobantes_cargados` sólo sabe de lo que entró POR EL CHAT. El comprobante de
// Corralón que el dueño mandó a `comprobantes-gastos` ya estaba en Compras fila 802 — cargado por
// Claude Code con el mismo pipeline. El registro del chat no lo tenía, así que la idempotencia no
// podía verlo, y el bot se ofreció a cargarlo de nuevo. El dueño ya se había quejado antes de
// mandar uno cargado y no recibir aviso.
//
// La barrera tiene que mirar el DESTINO, no el registro de lo que hizo uno mismo. La evidencia de
// que un gasto está cargado es la fila de Compras, no la anotación propia de haberlo cargado.
//
// ═══ DOS FORMAS DE ENCONTRARLO, Y NO SIGNIFICAN LO MISMO ═══
//
// · Por **tipo + número** (y que el importe cierre): es el mismo comprobante. Certeza.
// · Por **proveedor + fecha + importe** con OTRO número: es un PROBABLE duplicado. Puede ser el
//   mismo con un dígito mal leído —lo que efectivamente pasó— o dos compras distintas del mismo día
//   por la misma plata, que en un corralón pasa. No se decide solo: se muestra la fila y se pregunta.
//
// Es SÓLO LECTURA. Ni una escritura, ni una fórmula: el freno de mano de Sheets no lo afecta.

import { numeroCanonico, fechaDeLectura } from './lectura.mjs'
import { normalizar, aNumero, redondear2 } from '../carga-comprobantes.mjs'

/** Rango mínimo suficiente: C fecha … O total. La fila del Sheet es el índice + esta base. */
export const RANGO = 'Compras!C4:O'
export const FILA_BASE = 4

/** Posición de cada dato DENTRO del rango leído (C = 0). Contrato con `RANGO`. */
const EN = { fecha: 0, proveedor: 2, tipo: 4, numero: 5, obra: 7, detalle: 8, concepto: 9, total: 12 }

export const HALLAZGO = Object.freeze({
  CARGADO: 'cargado',   // mismo tipo y número: es éste
  PROBABLE: 'probable', // mismo proveedor, día e importe, con otro número
})

/**
 * Importe de una celda de Compras. Un negativo del Sheet viene ENTRE PARÉNTESIS —así lo formatea el
 * dueño— y `aNumero` se come el paréntesis y devuelve el positivo. Una nota de crédito leída como
 * compra es el error de $41,9M que este repo ya pagó: acá el signo se respeta.
 */
export function importeDeCompras(v) {
  const s = String(v ?? '')
  const n = aNumero(s)
  if (n == null) return null
  return /\(.*\)/.test(s) ? -Math.abs(n) : n
}

/** El tipo de la columna G ("F A", "N C") → la letra que usa la lectura ('A', 'NC'). */
export function tipoDeCompras(v) {
  const s = normalizar(v).replace(/\s+/g, '')
  if (!s) return null
  if (s === 'nc') return 'NC'
  const m = s.replace(/^f/, '').match(/^([abc])$/)
  return m ? m[1].toUpperCase() : s.toUpperCase()
}

/**
 * Filas crudas del rango → índice consultable. NÚCLEO PURO.
 * @param {Array<Array<string>>} filas  lo que devuelve `readSheetValues(RANGO)`
 */
export function indexarCompras(filas = []) {
  const porNumero = new Map()
  const porImporte = new Map()
  let n = 0
  filas.forEach((r, i) => {
    const numero = numeroCanonico(r?.[EN.numero])
    const proveedor = normalizar(r?.[EN.proveedor])
    if (!numero && !proveedor) return
    n++
    const reg = {
      fila: i + FILA_BASE,
      hoja: 'Compras',
      proveedor: String(r?.[EN.proveedor] ?? '').trim() || null,
      tipo: tipoDeCompras(r?.[EN.tipo]),
      numero,
      fecha: fechaDeLectura(r?.[EN.fecha]),
      total: importeDeCompras(r?.[EN.total]),
      obra: String(r?.[EN.obra] ?? '').trim() || null,
      detalle: String(r?.[EN.detalle] ?? '').trim() || null,
    }
    if (numero && reg.tipo) empujar(porNumero, `${reg.tipo}|${numero}`, reg)
    if (proveedor && reg.fecha && reg.total != null) empujar(porImporte, `${proveedor}|${reg.fecha}|${redondear2(reg.total)}`, reg)
  })
  // Una sola lectura del Sheet alimenta las dos cosas que hacen falta: el duplicado y el vocabulario
  // con el que se resuelve lo escrito a mano.
  return { porNumero, porImporte, filas: n, detalles: detallesPorObra(filas) }
}

function empujar(mapa, clave, reg) {
  const ya = mapa.get(clave)
  if (ya) ya.push(reg); else mapa.set(clave, [reg])
}

/**
 * ¿Este comprobante ya está en Compras? Devuelve null, un `CARGADO` o un `PROBABLE`.
 *
 * El importe se exige en las DOS pasadas. Sin él, un número repetido entre dos puntos de venta
 * distintos —o una fila vieja con el número tipeado a mano— bloquearía una carga legítima.
 *
 * @param {object} comprobante  el normalizado por `lectura.mjs`
 * @param {{porNumero:Map, porImporte:Map}} indice
 */
export function buscarEnCompras(comprobante = {}, indice = {}) {
  const numero = numeroCanonico(comprobante.numero)
  const tipo = comprobante.esNotaCredito ? 'NC' : (comprobante.tipo ?? null)
  const proveedor = normalizar(comprobante.proveedor)
  const fecha = comprobante.fecha ?? null
  const total = comprobante.total == null ? null : redondear2(comprobante.total)

  if (numero && tipo) {
    const cands = (indice.porNumero?.get(`${tipo}|${numero}`) ?? [])
      .filter((r) => total == null || r.total == null || Math.abs(r.total - total) <= 0.5)
    if (cands.length) return { que: HALLAZGO.CARGADO, ...cands[0], via: 'tipo+numero' }
  }
  if (proveedor && fecha && total != null) {
    const cands = (indice.porImporte?.get(`${proveedor}|${fecha}|${total}`) ?? [])
      .filter((r) => !numero || !r.numero || r.numero !== numero)
    // Dos filas distintas con el mismo proveedor, día e importe no permiten señalar "ésa": se
    // devuelve la primera igual, porque lo que importa es abrir la pregunta, no elegir la fila.
    if (cands.length) return { que: HALLAZGO.PROBABLE, ...cands[0], via: 'proveedor+fecha+importe', otras: cands.length - 1 }
  }
  return null
}

/**
 * Lee la pestaña viva y devuelve el índice. Nunca lanza: si Google no contesta, se declara en `ok`.
 * No poder mirar Compras NO es lo mismo que "no está cargado", y quien llame tiene que distinguirlo.
 *
 * @param {object} google  cliente de `lib/google.mjs`
 */
export async function indiceDeCompras(google, { fileId } = {}) {
  const id = fileId || process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  const vacio = { porNumero: new Map(), porImporte: new Map(), filas: 0, detalles: {} }
  if (typeof google?.readSheetValues !== 'function') return { ok: false, ...vacio, error: 'sin cliente de Google' }
  try {
    return { ok: true, ...indexarCompras(await google.readSheetValues(id, RANGO)) }
  } catch (e) {
    return { ok: false, ...vacio, error: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * El vocabulario VIVO de la columna K por obra, para poder resolver lo escrito a mano.
 * Se arma del mismo índice: una sola lectura del Sheet alimenta el duplicado y la imputación.
 *
 * @returns {Object<string,string[]>} obra → detalles ya usados, del más usado al menos
 */
export function detallesPorObra(filas = []) {
  const cuenta = new Map()
  for (const r of filas) {
    const obra = String(r?.[EN.obra] ?? '').trim()
    const det = String(r?.[EN.detalle] ?? '').trim()
    if (!obra || !det) continue
    if (!cuenta.has(obra)) cuenta.set(obra, new Map())
    const m = cuenta.get(obra)
    m.set(det, (m.get(det) ?? 0) + 1)
  }
  const out = {}
  for (const [obra, m] of cuenta) out[obra] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d)
  return out
}
