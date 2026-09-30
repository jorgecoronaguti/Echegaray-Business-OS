// CORREGIR LA FECHA Y EL CONCEPTO DE UNA FILA DE COMPRAS QUE UNA RENDICIÓN ESCRIBIÓ — nada más que esas dos celdas.
//
// ═══ POR QUÉ (dueño, 30/09/2026) ═══
//
// «Tengo que poder editar por completo las rendiciones»: el ticket lo leyó el bot y a veces se equivoca de
// día o de concepto. Hasta hoy eso se corregía a mano en el Sheet. La app encola un cambio `detalle` con
// los valores nuevos y los de antes, y este bisturí lo aplica con las mismas garantías que el pago y la
// anulación: la fila tiene que seguir siendo la misma compra y la celda tiene que decir lo que la pantalla vio.
//
// ═══ QUÉ NO SE ESCRIBE, A PROPÓSITO ═══
//
// Sólo «Fecha factura» y «Concepto», resueltas por encabezado y por lista blanca. Ni el proveedor (es parte de
// la clave de la fila: cambiarlo desvincula la rendición), ni el importe, ni Tipo pago / Estado / Monto
// Pagado / Fecha prevista de pago (AC/AD/AE/AF/AJ): la plata de la fila no la mueve una corrección de texto.
// Y sólo una fila con Tipo pago «A rendir»: una factura cargada por una persona no se edita desde Efectivo.
import { letra } from './compras-columnas.mjs'
import { PRIMERA_FILA, filaACompra } from './compras-fila.mjs'
import { rechazar, resolverLayout, verificarHuella } from './bisturi-compras-obra.mjs'

/** Lista blanca: clave del cambio → clave de la compra (`filaACompra`) y rótulo para el mensaje. */
const EDITABLES = Object.freeze({
  fecha: { campo: 'fecha', rotulo: 'Fecha factura' },
  concepto: { campo: 'concepto', rotulo: 'Concepto' },
})

const txt = (v) => String(v ?? '').trim()
const esARendir = (v) => /a\s*rendir/i.test(String(v ?? ''))
const ISO = /^(\d{4})-(\d{2})-(\d{2})/

/** La fecha como la tipea una persona en el Sheet (USER_ENTERED la interpreta con el locale es-AR). */
export function fechaParaElSheet(valor) {
  const m = ISO.exec(txt(valor))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

const iguales = (clave, vivo, pedido) => (clave === 'fecha'
  ? txt(vivo).slice(0, 10) === txt(pedido).slice(0, 10)
  : txt(vivo) === txt(pedido))

/**
 * EL PLAN. `{accion:'escribir', celdas:[{celda, rotulo, valor, escribir}]}` · `{accion:'ya_aplicado', actual}` ·
 * `{accion:'rechazar'|'diferir', motivo, detalle}`. `cambio.celdas` = {fecha?, concepto?} nuevos y
 * `cambio.previo` = lo que la pantalla vio. `fila` leída SIN formato, como el sync.
 */
export function planificarDetalle({ cambio, encabezado, fila, respaldo = null } = {}) {
  const n = Number(cambio?.fila)
  if (!Number.isInteger(n) || n < PRIMERA_FILA) {
    return rechazar('fila_invalida', `la fila ${cambio?.fila} no es un renglón de datos (empiezan en la ${PRIMERA_FILA})`)
  }
  const pedido = cambio?.celdas
  if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido) || !Object.keys(pedido).length) {
    return rechazar('sin_celdas', 'el cambio no dice qué corregir')
  }
  const fuera = Object.keys(pedido).filter((k) => !EDITABLES[k])
  if (fuera.length) {
    return rechazar('rotulo_invalido', `«${fuera.join('», «')}» no se corrige desde una rendición: sólo fecha y concepto`)
  }
  const { idx, decision } = resolverLayout(encabezado, { exigirObra: false })
  if (decision) return decision
  const compra = filaACompra(fila ?? [], idx, n)
  if (!compra) return rechazar('fila_vacia', `la fila ${n} ya no tiene ID: no es una compra`)
  const huella = verificarHuella(compra, cambio, respaldo)
  if (huella) return huella
  return decidirCeldas({ pedido, previo: cambio.previo ?? {}, compra, idx, n })
}

function decidirCeldas({ pedido, previo, compra, idx, n }) {
  const escribir = []
  for (const [clave, valor] of Object.entries(pedido)) {
    const { campo, rotulo } = EDITABLES[clave]
    if (idx[campo] === undefined) return rechazar('sin_columna', `Compras no tiene la columna «${rotulo}»: no escribo en otra`)
    if (iguales(clave, compra[campo], valor)) continue
    if (clave === 'fecha' && !fechaParaElSheet(valor)) return rechazar('fecha_invalida', `«${valor}» no es una fecha ISO`)
    if (clave === 'concepto' && !txt(valor)) return rechazar('concepto_vacio', 'un concepto vacío no se escribe: borra el dato')
    if (!iguales(clave, compra[campo], previo[clave])) {
      return rechazar('celda_cambio',
        `«${rotulo}» de la fila ${n} dice «${txt(compra[campo]) || 'vacía'}» y la pantalla vio «${txt(previo[clave]) || 'vacía'}»: no la piso`)
    }
    escribir.push({
      celda: `Compras!${letra(idx[campo])}${n}`, rotulo, valor,
      escribir: clave === 'fecha' ? fechaParaElSheet(valor) : txt(valor),
    })
  }
  if (!escribir.length) {
    return { accion: 'ya_aplicado', actual: Object.entries(pedido).map(([k, v]) => `${EDITABLES[k].rotulo}=${txt(v)}`).join(' · ') }
  }
  // Se mira DESPUÉS de saber que hay algo que escribir: una fila ya corregida se cierra sin más.
  if (!esARendir(compra.tipo_pago)) {
    return rechazar('no_es_a_rendir',
      `la fila ${n} tiene Tipo pago «${compra.tipo_pago ?? 'vacío'}»: la escribió una persona, no la rendición, y no se corrige desde Efectivo`)
  }
  return { accion: 'escribir', celdas: escribir, nota: `la fila era «${compra.proveedor ?? 'sin proveedor'}» ${compra.total ?? ''} A rendir` }
}

/** ¿La relectura prueba la escritura? Contra la misma normalización con la que se comparó antes. */
export function relecturaConfirmaDetalle(compra, celdas = []) {
  const malas = celdas.filter((c) => {
    const clave = c.rotulo === EDITABLES.fecha.rotulo ? 'fecha' : 'concepto'
    return !iguales(clave, compra?.[EDITABLES[clave].campo], c.valor)
  })
  return malas.length
    ? { ok: false, detalle: malas.map((c) => `«${c.rotulo}» no dice «${txt(c.valor)}»`).join(' · ') }
    : { ok: true }
}
