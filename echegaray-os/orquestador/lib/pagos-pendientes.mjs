// UN PAGO QUE TODAVÍA NO LLEGÓ AL SHEET NO SE BORRA CUANDO EL SYNC REESCRIBE LA RÉPLICA.
//
// ═══ EL DEFECTO QUE ESTO CIERRA ═══
//
// `sync-compras.mjs` reescribe `compra_sheet` ENTERA cada corrida desde lo que dice el Sheet. Entre
// que la app registra un pago y que el worker escribe la celda pueden pasar minutos, y en el medio
// el sync fotografía la fila como estaba: la pantalla mostraría el saldo viejo debajo de su propio ✓,
// que es la pantalla desmintiendo su propio acuse. La cola de Obra ya lo resuelve así
// (`obra-destino.mjs · aplicarCambiosPendientes`); esto es lo mismo para las celdas de pago.
//
// ═══ Y LA MITAD QUE OBRA NO TIENE: EL CONFLICTO ═══
//
// Superponer a ciegas tiene su propio modo de falla, y es peor que el anterior. Si entre el pedido y
// la corrida el dueño ESCRIBIÓ otra cosa en esa fila del Sheet —cobró distinto, corrigió el importe—,
// pisar la lectura con lo que pidió la app hace que el OS le muestre su pestaña diciendo algo que su
// pestaña no dice. La edición del dueño es verdad definitiva: gana el Sheet.
//
// Entonces son TRES casos y no dos, y se distinguen mirando la fila viva contra las dos fotos que el
// pedido guardó (`previo` y `celdas`):
//
//   aplicado    la fila ya dice lo pedido. El worker llegó primero: no hay nada que superponer, y el
//               pedido se puede cerrar aunque su `aplicado` se haya perdido.
//   pendiente   la fila todavía dice lo de antes. Se superpone la proyección y la app sigue
//               mostrando lo que prometió.
//   conflicto   la fila no dice ni una cosa ni la otra: alguien la editó. NO se superpone —gana el
//               Sheet— y el pedido se declara imposible con el detalle adentro. El bisturí lo iba a
//               rechazar igual (`celda_cambio`); declararlo acá evita que la app muestre «pendiente
//               de Sheet» durante horas por algo que nunca va a aterrizar.
//
// PURO: entra lo leído, sale la decisión. No toca Postgres ni Google.

import { celdaDice, CLAVE_POR_ROTULO } from './bisturi-compras-pago.mjs'
import { proyectar } from './pagos-de-compra.mjs'

const txt = (v) => String(v ?? '').trim()

/** Cómo se ve un valor en el detalle de un conflicto. Un vacío se nombra. */
const comoSeVe = (v) => (txt(v) === '' ? 'vacía' : `«${txt(v)}»`)

/**
 * QUÉ PASÓ CON ESTE PEDIDO, mirando la fila viva.
 *
 * @param {object} compra la fila tal como la leyó el sync (ya normalizada por `filaACompra`)
 * @param {{celdas:Array<{rotulo:string, valor:any, anterior:any}>}} cambio
 * @returns {{estado:'aplicado'|'pendiente'|'conflicto', detalle?:string}}
 */
export function clasificarPagoPendiente(compra, cambio) {
  const celdas = Array.isArray(cambio?.celdas) ? cambio.celdas : []
  if (!celdas.length) return { estado: 'conflicto', detalle: 'el pedido no dice qué celda escribir' }
  const desconocidas = celdas.filter((c) => !CLAVE_POR_ROTULO[c?.rotulo])
  if (desconocidas.length) {
    return { estado: 'conflicto', detalle: `«${desconocidas[0].rotulo}» no es una celda de pago` }
  }
  if (celdas.every((c) => celdaDice(compra, c.rotulo, c.valor))) return { estado: 'aplicado' }
  const movidas = celdas.filter((c) => !celdaDice(compra, c.rotulo, c.valor) && !celdaDice(compra, c.rotulo, c.anterior))
  if (movidas.length) {
    const d = movidas.map((c) => `«${c.rotulo}» ahora dice ${comoSeVe(compra[CLAVE_POR_ROTULO[c.rotulo]])} `
      + `y el pedido esperaba ${comoSeVe(c.anterior)} para escribir ${comoSeVe(c.valor)}`).join(' · ')
    return { estado: 'conflicto', detalle: `el Sheet cambió desde que se pidió el pago: ${d}` }
  }
  // Ni todas aplicadas ni ninguna movida: el worker escribió algunas y todavía no las otras. Es un
  // estado transitorio legítimo de un batch que se cortó — se sigue tratando como pendiente.
  return { estado: 'pendiente' }
}

/** ¿El pedido y la fila hablan del mismo comprobante? Misma regla que la cola de Obra. */
const mismaCompra = (compra, cambio) => (cambio?.clave ?? null) === (compra?.clave ?? null)

/**
 * SUPERPONE LOS PAGOS PENDIENTES sobre lo leído del Sheet y separa los conflictos.
 *
 * Devuelve compras NUEVAS (no muta las de entrada) y la lista de pedidos que ya no pueden aplicarse.
 * Un pedido cuya fila cambió de comprobante se deja quieto: lo va a rechazar el worker con la huella,
 * que es donde vive esa decisión.
 *
 * ═══ VARIOS PAGOS DE LA MISMA FILA, EN ORDEN (18/09/2026) ═══
 *
 * Una fila tiene dos tramos de pago y la app puede pedir el segundo antes de que el primero baje al
 * Sheet. Hasta hoy `porFila` guardaba UN pedido por fila —el último ganaba— y eso, con el primero ya
 * escrito por el worker pero todavía no leído, producía el peor resultado posible: el primer pago
 * desaparecía del espejo, y el segundo, comparado contra una lectura que no lo incluía, se
 * clasificaba `conflicto` y el sync lo cerraba `rechazado`, que es TERMINAL. Un segundo pago legítimo
 * se auto-rechazaba.
 *
 * Ahora los pedidos de una misma fila se PLIEGAN en orden de creación: cada uno se clasifica contra la
 * fila con los anteriores ya superpuestos, que es exactamente el estado que tenía el Sheet cuando se
 * pidió. El `hoy` y el flag comercial se siguen deduciendo de la fila ORIGINAL, que es la única que
 * los publica.
 *
 * `cambios` tiene que venir en orden de creación: lo garantiza el `order by creado_at` de quien lee.
 *
 * @param {object[]} compras lo leído del Sheet
 * @param {object[]} cambios los pedidos `tipo='pago'` que todavía pueden no estar en el Sheet
 * @param {string} hoy ISO del día, para el semáforo proyectado
 * @returns {{compras:object[], conflictos:Array<{id:string, fila:number, detalle:string}>, superpuestos:number}}
 */
export function superponerPagosPendientes(compras = [], cambios = [], hoy = new Date().toISOString().slice(0, 10)) {
  const porFila = new Map()
  for (const c of cambios ?? []) {
    const k = Number(c?.fila)
    if (!porFila.has(k)) porFila.set(k, [])
    porFila.get(k).push(c)
  }
  const conflictos = []
  let superpuestos = 0
  const salida = (compras ?? []).map((original) => {
    const pedidos = porFila.get(Number(original.fila))
    if (!pedidos?.length) return original
    let actual = original
    for (const cambio of pedidos) {
      if (!mismaCompra(actual, cambio)) continue
      // Contra `actual` y no contra `original`: el pedido siguiente se pidió sobre la fila que ya
      // tenía el anterior encima, y compararlo contra la foto vieja lo declararía conflicto.
      const r = clasificarPagoPendiente(actual, cambio)
      if (r.estado === 'aplicado') continue
      if (r.estado === 'conflicto') {
        conflictos.push({ id: cambio.id, fila: Number(original.fila), detalle: r.detalle })
        continue
      }
      superpuestos += 1
      const encima = { ...actual }
      for (const c of cambio.celdas) encima[CLAVE_POR_ROTULO[c.rotulo]] = c.valor
      // LAS TRES DERIVADAS TAMBIÉN, O LA FILA QUEDA INCOHERENTE. Superponer sólo las celdas de entrada
      // dejaría «Estado = Pagado» junto al `Saldo pendiente (OS)` viejo, que es el número que suma la
      // pestaña Proveedores: la app mostraría la factura pagada y la deuda entera al mismo tiempo. El
      // flag comercial se deduce de la fila ORIGINAL, que es la única que todavía lo publica.
      const d = proyectar(encima, hoy, original)
      encima.monto_parcial_1 = d.monto_parcial_1
      encima.estado_pago = d.estado_pago
      if (d.saldo_pendiente !== null) encima.saldo_pendiente = d.saldo_pendiente
      actual = encima
    }
    return actual
  })
  return { compras: salida, conflictos, superpuestos }
}
