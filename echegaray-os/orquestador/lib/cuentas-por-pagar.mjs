// CUÁNTO SE LE DEBE A CADA PROVEEDOR, Y DESDE CUÁNDO.
//
// LA PREGUNTA DEL DUEÑO (21/07). "Quiero resolver el tema modalidad en Compras: las opciones son
// Pago o Cuenta Corriente, y la cuenta corriente genera una deuda con ese proveedor que debería
// quedar reflejada en alguna parte del Sheet."
//
// ═══ LO QUE ENCONTRÉ AL MEDIRLO, QUE CAMBIA UN POCO EL PEDIDO ═══
//
// La modalidad NO es lo que genera la deuda, y conviene separarlo bien porque si no la cuenta sale
// mal. Medido sobre las 739 filas de Compras:
//
//   Cuenta Corriente   212 filas · $71.028.598 — pero 209 YA ESTÁN PAGADAS.
//   Pago               527 filas · $501.393.469
//
// O sea: "Cuenta Corriente" describe CÓMO se pactó la compra —el proveedor dio plazo—, no si hoy se
// le debe. Sumar todas las compras en cuenta corriente daría una deuda de $71.028.598 cuando la real
// es $16.447.674. La deuda la genera un hecho más simple: hay factura y no hay pago.
//
// LO QUE SÍ APORTA LA MODALIDAD, Y ES LO VALIOSO: cambia cómo se LEE cada saldo impago.
//   · Una compra en CUENTA CORRIENTE impaga es plazo pactado. Es normal y es financiación gratis.
//   · Una compra marcada PAGO que sigue impaga es un ATRASO: se acordó pagar contra entrega y no se
//     pagó. Gerson Castro, $700.000, vencido el 27/03 — más de cien días.
// Son dos cosas distintas y por eso la pestaña las muestra en columnas separadas.
//
// ═══ EL DATO YA EXISTÍA Y NO LO MIRABA NADIE ═══
//
// Compras tiene la columna X "Estado" (Pagado / Proyectado / Pendiente) y la AA "Estado pago" con
// su semáforo. Las dos estaban en la lista de columnas cargadas que el OS no leía. Con eso alcanza:
//   Pagado      667 filas · $407.850.148  → no es deuda
//   Proyectado   57 filas · $148.124.244  → NO ES DEUDA: es un gasto previsto sin factura todavía
//   Pendiente    14 filas · $16.447.674   → ESTO es la deuda con proveedores
//
// Confundir "Proyectado" con deuda multiplicaría la cifra por diez. Una deuda necesita una factura.
//
// ═══ Y UN SEMÁFORO QUE MIENTE ═══
//
// La columna AA marca 🟡 "Por vencer" a cinco facturas cuya fecha de pago YA PASÓ: Hormiserv (5/6),
// DUPEC (23/6), Alumetal (25/6), Const-Sek (30/6), Alvarado (8/7). No es un error del semáforo: es
// que la columna Q "Fecha prevista de pago" dice el TEXTO "Pendiente" en vez de una fecha, y sin
// fecha no hay forma de saber si venció. Por eso esta pestaña calcula el vencimiento contra la fecha
// de caja, que sí es una fecha, y cuenta aparte las que no se pueden clasificar.

/** El estado de Compras que significa "hay factura y no está pagada". Los demás no son deuda. */
export const ESTADO_DEUDA = 'Pendiente'

/** Las dos modalidades, tal como están escritas en la columna F de Compras. */
export const MODALIDADES = {
  cuentaCorriente: 'Cuenta Corriente',
  contado: 'Pago',
}

/** Los tramos de antigüedad. El corte es la fecha de caja, no la prevista (ver el encabezado). */
export const TRAMOS = [
  { nombre: 'Vencida hace más de 60 días', desde: 60, hasta: null },
  { nombre: 'Vencida hace 31 a 60 días', desde: 30, hasta: 60 },
  { nombre: 'Vencida hace 1 a 30 días', desde: 0, hasta: 30 },
  { nombre: 'Todavía no vence', desde: null, hasta: 0 },
]

/**
 * NÚCLEO PURO: reparte las filas de Compras en deuda / pagado / proyectado.
 * @param {Array<{estado?:string, modalidad?:string, total:number, fechaCaja?:Date|null}>} filas
 * @param {Date} hoy
 */
export function repartirDeuda(filas = [], hoy = new Date()) {
  const r = {
    deuda: [], pagado: 0, proyectado: 0,
    total: 0, cuentaCorriente: 0, contado: 0, vencida: 0, aVencer: 0, sinFecha: 0,
  }
  for (const f of filas) {
    const monto = Number(f.total) || 0
    const estado = String(f.estado ?? '').trim().toLowerCase()
    if (estado !== ESTADO_DEUDA.toLowerCase()) {
      if (estado === 'pagado') r.pagado += monto
      else if (estado === 'proyectado') r.proyectado += monto
      continue
    }
    r.deuda.push(f)
    r.total += monto
    if (String(f.modalidad ?? '').trim().toLowerCase() === MODALIDADES.cuentaCorriente.toLowerCase()) r.cuentaCorriente += monto
    else r.contado += monto
    const d = f.fechaCaja instanceof Date && !Number.isNaN(+f.fechaCaja) ? f.fechaCaja : null
    if (!d) r.sinFecha += monto
    else if (d < hoy) r.vencida += monto
    else r.aVencer += monto
  }
  return r
}

/**
 * NÚCLEO PURO: el saldo de cada proveedor, ordenado por lo que más se debe.
 * Devuelve sólo los que tienen deuda: un proveedor con saldo cero no es una fila, es ruido.
 */
export function saldosPorProveedor(filas = [], hoy = new Date()) {
  const acc = new Map()
  for (const f of repartirDeuda(filas, hoy).deuda) {
    const k = String(f.proveedor ?? '').trim() || '(sin proveedor)'
    const a = acc.get(k) ?? { proveedor: k, facturas: 0, total: 0 }
    a.facturas++; a.total += Number(f.total) || 0
    acc.set(k, a)
  }
  return [...acc.values()].sort((a, b) => b.total - a.total)
}
