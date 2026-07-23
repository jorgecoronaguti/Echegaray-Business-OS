// LO QUE ESTE TEST PROTEGE: que un gasto PENDIENTE nunca vuelva a desaparecer de Proveedores.
//
// El 23/07 el dueño avisó que había cargado gastos pendientes en Compras y que la pestaña no los
// reflejaba. La causa era una resta a ciegas: toda la plata se calculaba como Total − Monto Pagado, y
// "Monto Pagado" en Compras es la fórmula =IF(Modalidad="pago";Total;0) — copia el total entero
// cuando la compra se pactó al contado, aunque no se haya pagado nada. Una factura Pendiente de
// $750.184,61 quedaba en deuda −$0,39 y no aparecía en ningún lado.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saldo, deudaDeFila, fila6, layoutDeuda, notasAncladas } from './proveedores-materiales-pestana.mjs'

test('saldo: un pago PARCIAL descuenta', () => {
  assert.equal(saldo(197035.19, 90308.95), 106726.24)
  assert.equal(saldo(946981.47, 109771), 837210.47)
})

test('saldo: sin pago, se debe el total', () => {
  assert.equal(saldo(51631.3, 0), 51631.3)
})

test('saldo: un "pagado" que cubre el total NO cancela la deuda de una fila Pendiente', () => {
  // El caso real: OLIVIERI ESTEVEZ, factura 00003-00000013.
  assert.equal(saldo(750184.61, 750185), 750184.61)
  // Y el borde exacto: pagado == total tampoco descuenta.
  assert.equal(saldo(1000, 1000), 1000)
})

test('saldo: una nota de crédito (total negativo) sigue restando', () => {
  assert.equal(saldo(-149756, 0), -149756)
})

test('deudaDeFila: la fórmula sólo resta lo pagado si es menor al total', () => {
  const f = deudaDeFila('$O$5', '$T$5')
  assert.match(f, /IF\(ISNUMBER\(\$O\$5\)/)
  // La comparación pagado < total es la que evita cancelar la deuda de un "Pendiente".
  assert.ok(f.includes('<'), 'tiene que comparar lo pagado contra el total')
  // Separador es-AR: nunca una coma de argumento.
  assert.ok(!f.includes(','), `la fórmula tiene que ir con ";" (locale es-AR): ${f}`)
})

test('fila6: el concepto en A, el importe en B y la nota SIEMPRE en la última columna', () => {
  const f = fila6('Deuda', '=SUM(A1)', 'de dónde sale')
  assert.equal(f.length, 6)
  assert.equal(f[0], 'Deuda')
  assert.equal(f[1], '=SUM(A1)')
  assert.equal(f[5], 'de dónde sale')
  // Una nota en el medio de la grilla desparrama la fila: las del medio van vacías.
  assert.deepEqual(f.slice(2, 5), ['', '', ''])
})

test('fila6: sin nota, la última columna queda vacía', () => {
  assert.deepEqual(fila6('Total', 10), ['Total', 10, '', '', '', ''])
})

test('layoutDeuda: ubica las columnas por su encabezado, incluidas las que agregó el dueño', () => {
  const L = layoutDeuda(['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría', 'Comentarios'])
  assert.equal(L.fecha, 1)
  assert.equal(L.imp, 3)
  assert.equal(L.cat, 6)
  assert.equal(L.cols.length, 8)
})

test('notasAncladas: la nota vuelve a SU proveedor, no a la fila donde estaba', () => {
  const L = layoutDeuda(['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría', 'Comentarios'])
  const bloque = [
    ['La Isla Metal SRL', '31/08/2026', '1 fac.', 100000, '', '', '', 'Confirmar trueque con chatarra propia'],
    ['', '31/08/2026', '0015-00000147', 763365, 'Almacen', 'Cheque', 'B', 'Pedir factura'],
  ]
  const { porProveedor, porComprobante } = notasAncladas(bloque, L)
  assert.equal(porProveedor.get('la isla metal srl').get(7), 'Confirmar trueque con chatarra propia')
  assert.equal(porComprobante.get('0015-00000147').get(7), 'Pedir factura')
})
