// EL CUIT QUE TRAE EL COMPROBANTE COMPLETA LA PESTAÑA "Proveedores".
//
// ═══ DECISIÓN DEL DUEÑO (04/08) ═══
//
// El cuadro de proveedores tiene una columna de CUIT (la B del bloque que arranca en la fila 41) con
// celdas vacías. Cada comprobante que entra por el chat trae impreso el CUIT del emisor: si el
// proveedor está en el cuadro sin CUIT y el papel lo dice, hay que completarlo. Hasta ahora eso se
// hacía a mano, cruzando Compras contra `comprobantes_arca` por número + importe.
//
// ═══ POR QUÉ ESTA EVIDENCIA ES MEJOR QUE LA QUE YA TENÍAMOS ═══
//
// `lib/cuit-por-nombre.mjs` ya resuelve el CUIT cruzando la RAZÓN SOCIAL contra ARCA. Es un match de
// NOMBRES, y por eso tiene que ser conservador: "Robles Pintureria" toca dos empresas distintas.
// Acá el camino es otro y más corto: el CUIT está impreso en el mismo papel que el nombre, y el
// nombre ya quedó resuelto contra el desplegable ESTRICTO de Compras (`matchProveedor`). No hay
// nombres pareciéndose: hay un comprobante que dice las dos cosas juntas.
//
// Las dos conviven sin pisarse porque son fuentes distintas del mismo dato, y esta declara cuál usó.
//
// ═══ UN CUIT AJENO ES PEOR QUE UNO VACÍO ═══
//
// Es la lección que este repo ya pagó (31/07: seis filas del cuadro mostraban el CUIT de OTRA
// empresa). Con un CUIT equivocado se transfiere a otra cuenta, se retiene mal y se declara mal. Una
// celda vacía sólo dice "no lo sé", que es la verdad. De ahí las tres reglas duras:
//
//   1. **Sólo se completan celdas VACÍAS.** Un CUIT ya cargado no se pisa nunca, ni cuando el papel
//      dice otro: eso no es completar, es corregir, y corregir el CUIT de un proveedor es una
//      decisión del dueño. Se reporta como discrepancia y se deja como está.
//   2. **Si dos comprobantes del mismo proveedor traen CUIT distintos, no se escribe nada.** Uno de
//      los dos está mal leído y no hay forma de saber cuál.
//   3. **El CUIT tiene que ser un CUIT**: once dígitos, y no el de Echegaray —que aparece en TODO
//      comprobante de compra porque somos el comprador—.
//
// ═══ QUÉ ES PURO Y QUÉ NO ═══
//
// Todo lo que DECIDE es puro y se prueba con dobles: filas de la pestaña + comprobantes leídos →
// qué CUIT va en qué fila y con qué evidencia. La única función que toca Google es `escribirCuits`,
// que además falla cerrado: sin `aplicar:true` explícito devuelve el plan y no escribe una celda.

import { normalizar } from '../carga-comprobantes.mjs'
import { soloDigitos, CUIT_EMPRESA } from './lectura.mjs'

/** El bloque de proveedores del cuadro: A nombre, B CUIT, desde la fila 41. Contrato con la pestaña. */
export const RANGO = 'Proveedores!A41:B'
export const FILA_BASE = 41
export const COLUMNA_CUIT = 'B'

/** Por qué una decisión no se puede tomar. El código es el contrato; los textos son presentación. */
export const MOTIVO = Object.freeze({
  YA_TIENE: 'ya_tiene',           // la celda no está vacía: no se pisa
  DISCREPA: 'discrepa',           // ya tiene uno DISTINTO del que dice el papel
  CONFLICTO: 'conflicto',         // dos comprobantes del mismo proveedor dan CUIT distintos
  SIN_FILA: 'sin_fila',           // el proveedor no está en el cuadro
  SIN_CUIT: 'sin_cuit',           // ningún comprobante suyo trae CUIT legible
})

/**
 * Las filas del cuadro → registros consultables. NÚCLEO PURO.
 *
 * Una fila sin nombre no es un proveedor (son los separadores y los totales del cuadro) y se descarta:
 * escribir un CUIT en la fila de un subtotal es exactamente el tipo de daño que este archivo evita.
 *
 * @param {Array<Array<string>>} filas  lo que devuelve `readSheetValues(RANGO)`
 * @returns {Array<{fila:number, nombre:string, clave:string, cuit:string|null}>}
 */
export function filasDeProveedores(filas = [], { base = FILA_BASE } = {}) {
  const out = []
  filas.forEach((r, i) => {
    const nombre = String(r?.[0] ?? '').trim()
    if (!nombre) return
    const clave = normalizar(nombre)
    // El encabezado del bloque dice "Proveedor" en la columna A. No es un proveedor.
    if (clave === 'proveedor' || clave === 'total' || clave.startsWith('subtotal')) return
    out.push({ fila: i + base, nombre, clave, cuit: cuitLimpio(r?.[1]) })
  })
  return out
}

/**
 * Lo que los comprobantes leídos afirman sobre el CUIT de cada proveedor. NÚCLEO PURO.
 *
 * @param {Array<{proveedor?:string, cuit?:string, numero?:string, fecha?:string}>} comprobantes
 * @returns {Map<string, {cuits:Map<string, Array>, conflicto:boolean}>}  clave = proveedor normalizado
 */
export function cuitsDeComprobantes(comprobantes = []) {
  const porProveedor = new Map()
  for (const c of comprobantes) {
    const clave = normalizar(c?.proveedor)
    const cuit = cuitLimpio(c?.cuit)
    if (!clave || !cuit) continue
    if (!porProveedor.has(clave)) porProveedor.set(clave, { cuits: new Map(), conflicto: false })
    const reg = porProveedor.get(clave)
    const evid = { numero: c?.numero ?? null, fecha: c?.fecha ?? null }
    const ya = reg.cuits.get(cuit)
    if (ya) ya.push(evid); else reg.cuits.set(cuit, [evid])
    reg.conflicto = reg.cuits.size > 1
  }
  return porProveedor
}

/**
 * QUÉ CUIT VA EN QUÉ FILA Y CON QUÉ EVIDENCIA. Es la función que decide, y es pura.
 *
 * Devuelve dos listas y ninguna sorpresa: lo que se puede escribir, y lo que NO con su motivo. Que lo
 * descartado viaje no es prolijidad — una discrepancia entre el CUIT del cuadro y el del papel es
 * justo el hallazgo que hay que mirar, y si se descartara en silencio nadie se enteraría nunca.
 *
 * @param {Array} filasProveedores  salida de `filasDeProveedores`
 * @param {Array} comprobantes      los comprobantes leídos (proveedor ya resuelto contra el desplegable)
 * @returns {{escribir:Array<{fila:number, columna:string, nombre:string, cuit:string, evidencia:Array}>,
 *            descartados:Array<{nombre:string, motivo:string, detalle?:object}>}}
 */
export function decidirCuits(filasProveedores = [], comprobantes = []) {
  const afirmado = cuitsDeComprobantes(comprobantes)
  const escribir = []
  const descartados = []
  const vistos = new Set()

  for (const p of filasProveedores) {
    const reg = afirmado.get(p.clave)
    if (!reg) continue
    vistos.add(p.clave)
    if (reg.conflicto) {
      descartados.push({ nombre: p.nombre, fila: p.fila, motivo: MOTIVO.CONFLICTO, detalle: { cuits: [...reg.cuits.keys()] } })
      continue
    }
    const [cuit, evidencia] = [...reg.cuits.entries()][0]
    if (p.cuit && p.cuit === cuit) continue // ya está y coincide: no hay nada que hacer ni que avisar
    if (p.cuit) {
      descartados.push({ nombre: p.nombre, fila: p.fila, motivo: MOTIVO.DISCREPA, detalle: { enElCuadro: p.cuit, enElPapel: cuit } })
      continue
    }
    escribir.push({ fila: p.fila, columna: COLUMNA_CUIT, nombre: p.nombre, cuit, evidencia })
  }

  // Lo que el papel afirma sobre un proveedor que NO está en el cuadro. No se agrega la fila: el
  // cuadro lo genera otro proceso con sus propias reglas, y meter una fila desde acá lo desordenaría.
  for (const [clave, reg] of afirmado) {
    if (vistos.has(clave)) continue
    descartados.push({ nombre: clave, motivo: MOTIVO.SIN_FILA, detalle: { cuits: [...reg.cuits.keys()] } })
  }
  return { escribir, descartados }
}

/**
 * EL ÚNICO PUNTO QUE TOCA EL SHEET. Aislado a propósito y FALLA CERRADO.
 *
 * Sin `aplicar:true` devuelve el plan y no escribe una celda: ese es el modo por defecto porque toda
 * la cadena de arriba se puede probar sin Google, y porque este repo ya perdió una pestaña entera con
 * un generador que escribió lo que no tenía que escribir. La escritura se pide EXPLÍCITAMENTE, desde
 * el árbol principal y con el dueño mirando; no la dispara ningún timer.
 *
 * Escribe CELDA POR CELDA, sólo las columnas B de las filas decididas. No hay un rango que abarque
 * filas intermedias: un rango que "pasa por arriba" de una fila del dueño es cómo se borra lo que
 * nadie pidió borrar.
 *
 * @param {object} google  cliente de `lib/google.mjs` (necesita `writeSheetValues`)
 * @param {Array} decisiones  la lista `escribir` de `decidirCuits`
 */
export async function escribirCuits(google, decisiones = [], { fileId, hoja = 'Proveedores', aplicar = false } = {}) {
  const plan = decisiones.map((d) => ({ rango: `${hoja}!${d.columna}${d.fila}`, valor: d.cuit, nombre: d.nombre }))
  if (!aplicar) return { ok: true, escritas: 0, plan, motivo: 'plan solamente: falta aplicar:true' }
  if (typeof google?.writeSheetValues !== 'function') return { ok: false, escritas: 0, plan, error: 'sin cliente de Google' }
  let escritas = 0
  for (const p of plan) {
    await google.writeSheetValues(fileId, p.rango, [[p.valor]])
    escritas++
  }
  return { ok: true, escritas, plan }
}

/** Once dígitos, y nunca el de la propia empresa: en un comprobante de compra Echegaray es el comprador. */
function cuitLimpio(v) {
  const d = soloDigitos(v)
  return d.length === 11 && d !== CUIT_EMPRESA ? d : null
}
