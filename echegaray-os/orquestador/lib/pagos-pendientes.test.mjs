// LO QUE PASA CUANDO EL SYNC Y LA COLA DE PAGOS SE CRUZAN.
//
// Los dos defectos que esto atrapa son simétricos y los dos hacen que la pantalla mienta:
//   · superponer de menos → el saldo viejo aparece debajo del ✓ del pago recién registrado;
//   · superponer de más   → el OS muestra la pestaña del dueño diciendo algo que su pestaña no dice.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarPagoPendiente, superponerPagosPendientes } from './pagos-pendientes.mjs'
import { CLAVE_POR_ROTULO, planDePago } from './pagos-de-compra.mjs'

const HOY = '2026-09-16'
/** La fila como la lee el sync del Sheet, antes de que el worker escriba nada. */
const leida = (extra = {}) => ({
  fila: 57, clave: 'c:30712345678|0003-00012345', total: 121000, monto_pagado: 0, monto_parcial_1: 0,
  monto_parcial_2: 0, pago_total_o_parcial: null, tipo_pago: null, estado: 'Pendiente',
  estado_pago: '△ Por vencer', fecha_prevista: '2026-09-30', fecha_prevista_2: null,
  saldo_pendiente: 121000, anulada: false, ...extra,
})

/** El pedido que la app encoló, armado con la función de producción. */
function pedido(accion, compra = leida()) {
  const p = planDePago({ compra, accion, hoy: HOY })
  assert.ok(p.celdas, p.error)
  return { id: 'p-1', fila: 57, clave: compra.clave, celdas: p.celdas }
}

test('pendiente: la fila superpuesta dice lo que la app prometió, derivadas incluidas', () => {
  const c = pedido({ tipo: 'total', fecha: HOY, medio: 'Transferencia' })
  const r = superponerPagosPendientes([leida()], [c], HOY)
  assert.equal(r.superpuestos, 1)
  assert.equal(r.conflictos.length, 0)
  const f = r.compras[0]
  assert.equal(f.monto_pagado, 121000)
  assert.equal(f.estado, 'Pagado')
  assert.equal(f.pago_total_o_parcial, 'Total')
  // LAS DERIVADAS TAMBIÉN: sin esto la pantalla mostraría la factura pagada y la deuda entera juntas.
  assert.equal(f.saldo_pendiente, 0)
  assert.equal(f.estado_pago, '✓ Pagado')
  assert.equal(f.monto_parcial_1, 0)
})

test('aplicado: si el worker llegó primero, no se superpone nada', () => {
  const c = pedido({ tipo: 'total', fecha: HOY })
  const ya = leida({ monto_pagado: 121000, pago_total_o_parcial: 'Total', estado: 'Pagado', saldo_pendiente: 0 })
  assert.equal(clasificarPagoPendiente(ya, c).estado, 'aplicado')
  const r = superponerPagosPendientes([ya], [c], HOY)
  assert.equal(r.superpuestos, 0)
  assert.equal(r.conflictos.length, 0)
})

test('conflicto: si el dueño editó la fila, GANA EL SHEET y el pedido se declara imposible', () => {
  const c = pedido({ tipo: 'total', fecha: HOY })
  // Entre el pedido y la corrida, alguien cargó a mano un pago parcial distinto.
  const editada = leida({ monto_pagado: 60000, pago_total_o_parcial: 'Parcial' })
  const r = superponerPagosPendientes([editada], [c], HOY)
  assert.equal(r.superpuestos, 0)
  assert.equal(r.conflictos.length, 1)
  assert.match(r.conflictos[0].detalle, /el Sheet cambió/)
  assert.match(r.conflictos[0].detalle, /Monto Pagado/)
  assert.equal(r.compras[0].monto_pagado, 60000, 'lo leído del Sheet no se pisa')
  assert.equal(r.compras[0].estado, 'Pendiente')
})

test('un batch que se cortó a la mitad sigue siendo pendiente, no un conflicto', () => {
  const c = pedido({ tipo: 'total', fecha: HOY })
  // El worker escribió «Monto Pagado» y murió antes de «Estado».
  const media = leida({ monto_pagado: 121000 })
  assert.equal(clasificarPagoPendiente(media, c).estado, 'pendiente')
})

test('si la fila ya es otro comprobante, el pedido se deja quieto: lo rechaza el worker por huella', () => {
  const c = pedido({ tipo: 'total', fecha: HOY })
  const otra = leida({ clave: 'c:30712345678|0003-00099999' })
  const r = superponerPagosPendientes([otra], [c], HOY)
  assert.equal(r.superpuestos, 0)
  assert.equal(r.conflictos.length, 0)
  assert.equal(r.compras[0].monto_pagado, 0)
})

test('una fila sin pedido no se toca, y las de entrada no se mutan', () => {
  const original = leida()
  const otra = leida({ fila: 58, clave: 'c:x|1' })
  const c = pedido({ tipo: 'total', fecha: HOY })
  const r = superponerPagosPendientes([original, otra], [c], HOY)
  assert.equal(r.compras[1], otra)
  assert.equal(original.monto_pagado, 0, 'la fila de entrada no se muta')
  assert.notEqual(r.compras[0], original)
})

test('un pedido con una celda que no es de pago se declara conflicto en vez de aplicarse', () => {
  const c = { id: 'p-x', fila: 57, clave: leida().clave, celdas: [{ rotulo: 'Saldo pendiente (OS)', valor: 0, anterior: 121000 }] }
  const r = superponerPagosPendientes([leida()], [c], HOY)
  assert.equal(r.conflictos.length, 1)
  assert.match(r.conflictos[0].detalle, /no es una celda de pago/)
})

test('un parcial pendiente deja el saldo proyectado, no el del Sheet', () => {
  const c = pedido({ tipo: 'parcial', monto: 50000, fecha: HOY, fechaResto: '2026-10-15' })
  const f = superponerPagosPendientes([leida()], [c], HOY).compras[0]
  assert.equal(f.monto_pagado, 50000)
  assert.equal(f.fecha_prevista_2, '2026-10-15')
  assert.equal(f.saldo_pendiente, 71000)
  assert.equal(f.estado, 'Pendiente')
})

// ═══ DOS TRAMOS DE LA MISMA FILA (18/09/2026) ═══
//
// Desde que el sync también superpone lo que el worker aplicó MIENTRAS leía el Sheet, una fila puede
// traer dos pedidos: el primero ya escrito y el segundo todavía en cola. Quedarse con uno solo —lo que
// hacía `porFila.set`— perdía el primero del espejo Y, comparando el segundo contra una lectura que no
// lo incluía, lo declaraba `conflicto`; el sync cierra los conflictos como `rechazado`, que es TERMINAL.
// Un segundo pago legítimo se auto-rechazaba.

/** La fila como queda después de aplicarle las celdas de un pedido. Es lo que ve quien pide el tramo 2. */
const conElPedidoEncima = (compra, p) => {
  const f = { ...compra }
  for (const c of p.celdas) f[CLAVE_POR_ROTULO[c.rotulo]] = c.valor
  return f
}

/** Los dos tramos: 50.000 en el primero y el resto en el segundo, pedido sobre la fila ya con el primero. */
function dosTramos() {
  const original = leida()
  const p1 = pedido({ tipo: 'parcial', monto: 50000, fecha: HOY, fechaResto: '2026-10-15' }, original)
  const tras1 = conElPedidoEncima(original, p1)
  const p2 = { ...pedido({ tipo: 'total', fecha: HOY, medio: 'Efectivo' }, tras1), id: 'p-2' }
  return { original, p1, tras1, p2 }
}

test('dos pagos de la misma fila se pliegan en orden: no se pierde el primero ni se auto-rechaza el segundo', () => {
  const { original, p1, p2 } = dosTramos()
  const r = superponerPagosPendientes([original], [p1, p2], HOY)
  assert.equal(r.conflictos.length, 0, 'el segundo tramo no es un conflicto: se pidió sobre la fila con el primero encima')
  assert.equal(r.superpuestos, 2)
  const f = r.compras[0]
  assert.equal(f.monto_pagado, 50000, 'el primer tramo sigue en el espejo')
  assert.equal(f.monto_parcial_2, 71000)
  assert.equal(f.saldo_pendiente, 0)
  assert.equal(f.estado, 'Pagado')
  assert.equal(f.pago_total_o_parcial, 'Total')
  assert.equal(original.monto_pagado, 0, 'la fila de entrada no se muta')
})

test('si la lectura del Sheet YA trae el primer tramo, ése no se superpone y el segundo sí', () => {
  const { p1, p2, tras1 } = dosTramos()
  assert.equal(clasificarPagoPendiente(tras1, p1).estado, 'aplicado')
  const r = superponerPagosPendientes([tras1], [p1, p2], HOY)
  assert.equal(r.conflictos.length, 0)
  assert.equal(r.superpuestos, 1, 'sólo el segundo: el primero ya está en la lectura')
  assert.equal(r.compras[0].monto_parcial_2, 71000)
  assert.equal(r.compras[0].saldo_pendiente, 0)
})

test('con dos pedidos, uno que el Sheet contradice se declara conflicto y el otro se superpone igual', () => {
  const { original, p1 } = dosTramos()
  // Alguien escribió otra cosa en el Sheet: el pedido esperaba «vacía» en Tipo de Pago y dice «Cheque».
  const editada = { ...original, tipo_pago: 'Cheque' }
  const ajeno = { id: 'p-x', fila: 57, clave: original.clave, celdas: [{ rotulo: 'Tipo de Pago', valor: 'Efectivo', anterior: null }] }
  const r = superponerPagosPendientes([editada], [ajeno, p1], HOY)
  assert.equal(r.conflictos.length, 1)
  assert.equal(r.conflictos[0].id, 'p-x')
  assert.equal(r.superpuestos, 1)
  assert.equal(r.compras[0].monto_pagado, 50000, 'el pedido sano no paga el conflicto del otro')
  assert.equal(r.compras[0].tipo_pago, 'Cheque', 'y lo que el dueño escribió en el Sheet queda')
})
