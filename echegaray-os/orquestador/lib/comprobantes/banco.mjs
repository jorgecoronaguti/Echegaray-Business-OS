// EL PAPEL DICE «PAGADA» — ¿Y EL BANCO? — NÚCLEO PURO, CERO RED.
//
// ═══ EL CASO QUE LO CREÓ (21/08) ═══
//
// Dos facturas de Trielec entraron con «Pagada con acreditación bancaria» y quedaron en Compras como
// Pagado sin que NADIE mirara el extracto — que se importa todos los días a `banco_movimientos`.
// El extracto tenía la respuesta entera: UNA transferencia del 20/08 por $323.149,37, que es la suma
// de las dos facturas ($95.277,07 + $227.872,31, con $0,01 de redondeo). Y de paso desmentía a
// gritos la lectura ×100 ($9.527.707) que ese día entró a Compras: ningún débito de ese tamaño
// existió. El pedido del dueño, textual: «dice pagado por transferencia y nunca cruzó el dato con el
// extracto bancario que se carga todos los días. corregir eso».
//
// ═══ QUÉ HACE ═══
//
// Para cada comprobante que DECLARA pago bancario, busca su débito en los movimientos importados:
//   · INDIVIDUAL: un débito del proveedor por el total del comprobante (±$1 de redondeo).
//   · AGRUPADO: los comprobantes del MISMO proveedor de la tanda se pagan juntos con UNA
//     transferencia — el caso Trielec. Se compara la SUMA contra cada débito.
//   · El vínculo con el proveedor es por nombre (palabras significativas en el concepto del
//     movimiento) o por CUIT, y por cercanía de fecha (el débito puede ser unos días posterior).
//
// DECLARA, NO DECIDE. Devuelve evidencia (`cruza` / `sin_debito` / `no_verificable`) y el mensaje
// la muestra; no cambia el estado de la fila ni bloquea la carga: el sello PAGADO del papel también
// es evidencia, y el extracto puede correr un día atrás. Un aviso que dice «no encuentro el débito»
// vale más que un bloqueo que frena la carga del gasto.

import { palabras } from './plausibilidad.mjs'
import { aFecha } from './plausibilidad.mjs'

/** Tolerancia por comparación, en pesos: cubre el redondeo del «RECIBÍ» de un tique ($0,01 por
 *  comprobante) con margen. Nunca cubre un dígito mal leído, que es lo que se busca. */
export const TOLERANCIA_PESOS = 1

/** Cuántos días puede correr el débito respecto de la fecha del comprobante, para cada lado.
 *  Hacia atrás: una seña/transferencia previa; hacia adelante: la acreditación demora. */
export const DIAS_VENTANA = 5

/** ¿Este comprobante declara que ya se pagó por el banco? Es la única puerta de entrada al cruce:
 *  un pago en efectivo o un cuenta corriente no tienen débito que buscar. */
export function dicePagadaPorBanco(c = {}) {
  const textos = [c.formaPago, c.condicion, c.condicionManuscrita, c.detalle, c.detalleObra]
    .filter((v) => typeof v === 'string').join(' · ').toLowerCase()
  return /transferencia|acreditaci[oó]n bancaria|acreditacion|d[eé]bito bancario/.test(textos)
}

const norm = (v) => palabras(v)

/** ¿El concepto del movimiento nombra a este proveedor? Por palabra significativa o por CUIT. */
export function movimientoDelProveedor(mov = {}, c = {}) {
  const concepto = String(mov.concepto ?? '')
  const cuit = String(c.cuit ?? '').replace(/\D/g, '')
  if (cuit.length === 11 && concepto.replace(/\D/g, ' ').includes(cuit)) return true
  const delMov = new Set(norm(concepto))
  const delProv = norm(c.proveedor)
  return delProv.length > 0 && delProv.some((p) => delMov.has(p))
}

const diasEntre = (a, b) => Math.abs(a.getTime() - b.getTime()) / 86_400_000

function fechaDeMov(v) {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null
  const s = String(v ?? '')
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12))
  return aFecha(s)
}

/**
 * Cruza los comprobantes de una tanda contra los débitos del extracto.
 *
 * @param {Array<object>} items      los de la tanda (con `.comprobante`)
 * @param {Array<{fecha, concepto, importe, referencia}>|null} movimientos  débitos importados; null = no se pudo leer
 * @returns los mismos items, con `.banco` puesto en los que declaran pago bancario
 */
export function cruceBancario(items = [], movimientos = null) {
  const pagables = items.filter((it) => {
    const c = it?.comprobante ?? {}
    return dicePagadaPorBanco(c) && c.total != null && !it.yaCargado
  })
  if (!pagables.length) return items
  if (!Array.isArray(movimientos)) {
    for (const it of pagables) it.banco = { estado: 'no_verificable' }
    return items
  }

  const debitos = movimientos
    .map((m) => ({ ...m, monto: Math.abs(Number(m.importe) || 0), cuando: fechaDeMov(m.fecha) }))
    .filter((m) => Number(m.importe) < 0 && m.monto > 0)

  const candidatosDe = (c) => {
    const f = aFecha(c.fecha)
    return debitos.filter((m) =>
      movimientoDelProveedor(m, c) && (!f || !m.cuando || diasEntre(f, m.cuando) <= DIAS_VENTANA))
  }
  const cerca = (a, b) => Math.abs(a - b) <= TOLERANCIA_PESOS
  const comoEvidencia = (m, extra = {}) => ({
    estado: 'cruza', fecha: m.fecha ?? null, importe: m.monto, referencia: m.referencia ?? null, ...extra,
  })

  // Primero el cruce INDIVIDUAL; lo que no cierre solo se intenta AGRUPADO por proveedor.
  const sinCruce = []
  for (const it of pagables) {
    const c = it.comprobante
    const m = candidatosDe(c).find((x) => cerca(x.monto, Math.abs(Number(c.total))))
    if (m) it.banco = comoEvidencia(m)
    else sinCruce.push(it)
  }

  const porProveedor = new Map()
  for (const it of sinCruce) {
    const k = norm(it.comprobante.proveedor).join(' ') || String(it.comprobante.cuit ?? '?')
    porProveedor.set(k, [...(porProveedor.get(k) ?? []), it])
  }
  for (const grupo of porProveedor.values()) {
    const suma = grupo.reduce((s, it) => s + Math.abs(Number(it.comprobante.total)), 0)
    // La tolerancia del grupo crece con sus miembros: cada tique puede aportar su centavo de RECIBÍ.
    const m = grupo.length > 1
      ? candidatosDe(grupo[0].comprobante).find((x) => Math.abs(x.monto - suma) <= TOLERANCIA_PESOS * grupo.length)
      : null
    for (const it of grupo) {
      if (m) it.banco = comoEvidencia(m, { agrupado: grupo.length, suma })
      else it.banco = { estado: 'sin_debito', candidatos: candidatosDe(it.comprobante).length }
    }
  }
  return items
}
