import test from 'node:test'
import assert from 'node:assert/strict'
import { tipoComprobante, condicionAPago, matchProveedor, aNumero, aFechaAR, validar, valoresInput, COL } from './carga-comprobantes.mjs'

test('el tipo de comprobante se normaliza al valor exacto del desplegable', () => {
  assert.equal(tipoComprobante('A'), 'F A')
  assert.equal(tipoComprobante('Factura B'), 'F B')
  assert.equal(tipoComprobante('C'), 'F C')
  assert.equal(tipoComprobante('Nota de Credito A'), 'N C')
  assert.equal(tipoComprobante('cualquier cosa'), null) // no se inventa un tipo
})

// La condición de venta de la factura es lo ÚNICO que la foto declara sobre el pago. Contado = ya
// pagada; Cuenta Corriente = pendiente. Sin condición no se inventa un estado.
test('la condición de venta define modalidad, estado y total/parcial', () => {
  assert.deepEqual(condicionAPago('Contado'), { modalidad: 'Pago', estado: 'Pagado', totalParcial: 'Total' })
  assert.deepEqual(condicionAPago('Cuenta Corriente'), { modalidad: 'Cuenta Corriente', estado: 'Pendiente', totalParcial: 'Total' })
  assert.equal(condicionAPago('').estado, null)
})

// E es un desplegable ESTRICTO. Un proveedor que no está no se fuerza como variante nueva silenciosa:
// se marca esNuevo para que el dueño lo confirme, nunca se inventa una grafía.
test('el proveedor se matchea contra la lista y marca los nuevos', () => {
  const lista = ['Combustibles Barcelo', 'Robles Jose Maria', 'Ferretería Cobos']
  assert.deepEqual(matchProveedor('combustibles barcelo', lista), { valor: 'Combustibles Barcelo', esNuevo: false })
  assert.equal(matchProveedor('FERRETERIA COBOS', lista).valor, 'Ferretería Cobos') // tilde no cruza
  const nuevo = matchProveedor('Corralón El Sol', lista)
  assert.equal(nuevo.esNuevo, true)
  assert.equal(nuevo.valor, 'Corralón El Sol') // el nombre tal cual, sin inventar variante
})

test('los importes es-AR entran como número y las fechas como DD/MM/YYYY', () => {
  assert.equal(aNumero('$28.479,30'), 28479.30)
  assert.equal(aNumero('$ 5.981'), 5981)
  assert.equal(aNumero(44664), 44664)
  assert.equal(aNumero('no'), null)
  assert.equal(aFechaAR('5/1/2026'), '05/01/2026')
  assert.equal(aFechaAR('2026-01-05'), '05/01/2026')
  assert.equal(aFechaAR(new Date(2026, 0, 5)), '05/01/2026')
  assert.equal(aFechaAR('sin fecha'), null)
})

test('validar exige lo mínimo para que las fórmulas y los cruces funcionen', () => {
  assert.deepEqual(validar({ fecha: '5/1/2026', proveedor: 'RSV', neto: '$44.664' }), [])
  assert.ok(validar({ proveedor: 'RSV', neto: 100 }).includes('fecha ilegible o ausente'))
  assert.ok(validar({ fecha: '5/1/2026', neto: 100 }).includes('sin proveedor'))
  assert.ok(validar({ fecha: '5/1/2026', proveedor: 'RSV' }).includes('sin importe numérico'))
})

// El total NO se escribe: lo calcula la fórmula O = N+M. Y las columnas del dueño (I/J/K) y las
// derivadas (AC/AD/AE) no aparecen en el input: se dejan para la fórmula o para él.
test('valoresInput escribe sólo lo del comprobante, con el pago deducido de la condición', () => {
  const v = valoresInput({ categoria: 'B', fecha: '5/1/2026', proveedor: 'Combustibles Barcelo', tipo: 'A', numero: '113-010489', concepto: 'combustible auto elevador', neto: '$28.479,30', iva: '$5.981', condicion: 'Contado' })
  assert.equal(v[COL.fecha], '05/01/2026')
  assert.equal(v[COL.proveedor], 'Combustibles Barcelo')
  assert.equal(v[COL.tipo], 'F A')
  assert.equal(v[COL.neto], 28479.30)
  assert.equal(v[COL.iva], 5981)
  assert.equal(v[COL.modalidad], 'Pago')
  assert.equal(v[COL.estado], 'Pagado')
  assert.equal(v[COL.pagado], 28479.30 + 5981) // contado ⇒ pagado = total
  assert.equal(v[COL.total], undefined) // O es fórmula, no se escribe
  assert.equal(v[COL.obra], undefined) // J la completa el dueño
  assert.equal(v[COL.rubroCaja], undefined) // AC es ARRAYFORMULA
})

test('cuenta corriente entra pendiente y sin pago', () => {
  const v = valoresInput({ fecha: '5/1/2026', proveedor: 'Robles Jose Maria', neto: 471540.39, iva: 0, condicion: 'Cuenta Corriente' })
  assert.equal(v[COL.modalidad], 'Cuenta Corriente')
  assert.equal(v[COL.estado], 'Pendiente')
  assert.equal(v[COL.pagado], undefined) // no se pagó todavía
})
