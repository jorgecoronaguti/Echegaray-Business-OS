// LA LECTURA QUE ALIMENTA EL CRUCE DE FECHAS, VERIFICADA EN FRÍO. Sin red.
//
// El criterio de emparejamiento se prueba en `lib/fechas-contra-extracto.test.mjs`. Acá se prueba lo
// otro, que es donde un error no da ningún síntoma: leer la columna equivocada o el lado equivocado
// del extracto devuelve CERO filas y un cero de matcheo se lee igual que "está todo bien".

import test from 'node:test'
import assert from 'node:assert/strict'
import { movimientosDelBanco, ventanaDelExtracto, colIdx, FILA0 } from './fechas-vs-extracto.mjs'

/** `_BANCO_RAW` con sus tres filas de cabecera reales: rótulo, nota de la réplica, encabezado. */
const BANCO = [
  ['_BANCO_RAW — extracto'], ['405 movimientos...'], ['Fecha', 'Concepto', 'Importe', 'Saldo', 'Entra o sale', 'Naturaleza'],
  [46170, 'Comision por servicio', -69000, 130408.47, 'sale', 'Comisiones y gastos bancarios'],
  [46240, 'Cheque debitado', -470945, 0, 'sale', 'Cheques y echeq'],
  [46189, 'Deposito efvo caja suc 0770', 4000000, 0, 'entra', 'Transferencias a proveedores'],
]

test('LA COLUMNA SE RESUELVE BIEN MÁS ALLÁ DE LA Z: Compras llega hasta AD', () => {
  // "Fecha de caja" es AD y "Total" es O. Con un índice mal calculado el script leería otra columna y
  // devolvería "sin testigo" sobre todo, sin un solo error a la vista.
  assert.equal(colIdx('A'), 0)
  assert.equal(colIdx('O'), 14)
  assert.equal(colIdx('Z'), 25)
  assert.equal(colIdx('AA'), 26)
  assert.equal(colIdx('AD'), 29)
})

test('EL LADO DEL EXTRACTO NO ES UN DETALLE: una cobranza se prueba contra lo que ENTRÓ', () => {
  const sale = movimientosDelBanco(BANCO, { lado: 'sale' })
  const entra = movimientosDelBanco(BANCO, { lado: 'entra' })
  assert.deepEqual(sale.map((m) => m.importe), [69000, 470945], 'los débitos van en MAGNITUD positiva')
  assert.deepEqual(entra.map((m) => m.importe), [4000000])
  // Y ningún movimiento puede estar de los dos lados: si lo estuviera, el mismo peso probaría un pago
  // y un cobro a la vez.
  assert.equal(sale.filter((s) => entra.some((e) => e.fila === s.fila)).length, 0)
})

test('la fila que se informa es la FÍSICA del Sheet, para poder ir a mirarla', () => {
  const [primero] = movimientosDelBanco(BANCO, { lado: 'sale' })
  assert.equal(primero.fila, FILA0.banco, 'el primer dato de _BANCO_RAW vive en la fila 4')
})

test('la naturaleza filtra, y un rótulo que no existe devuelve VACÍO, no todo', () => {
  assert.equal(movimientosDelBanco(BANCO, { lado: 'sale', naturalezas: ['Cheques y echeq'] }).length, 1)
  assert.equal(movimientosDelBanco(BANCO, { lado: 'sale', naturalezas: ['Naturaleza Inventada'] }).length, 0)
})

test('la ventana se DERIVA del extracto: un corte tipeado se queda viejo sin gritar', () => {
  const todos = [...movimientosDelBanco(BANCO, { lado: 'sale' }), ...movimientosDelBanco(BANCO, { lado: 'entra' })]
  assert.deepEqual(ventanaDelExtracto(todos), { desde: 46170, hasta: 46240 })
  assert.equal(ventanaDelExtracto([]), null, 'sin extracto no hay ventana que inventar')
})

test('una fila sin fecha o sin importe no entra: compararía como cero contra cualquier ventana', () => {
  const sucio = [...BANCO, [null, 'fila de colchón', null], [46200, 'importe cero', 0]]
  assert.equal(movimientosDelBanco(sucio, { lado: 'sale' }).length, 2)
})
