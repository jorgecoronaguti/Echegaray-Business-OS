import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registroDeLaPestana } from './cheques-conciliar-debitos.mjs'

// La pestaña real: una banda de resumen arriba (con importes en la columna B), el encabezado, y
// recién ahí el registro. Anclar en una fila fija corre todo cuando la banda cambia de alto.
const GRID = [
  ['Cheques emitidos'],
  ['   · (−) cheques firmados, no debitados', 1234567],
  ['Tipo', 'Nro', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO'],
  ['FISICO', 223, 46176, '', 'Corralon Progreso', 200000, 'CC', 'VARIAS', 46221, 46221, 'No'],
  ['ECHEQ', 305, 46176, '30-56736337-2', 'Alumetal', 893098.79, 'CC', 'VARIAS', 46221, 46221, 'SI'],
  ['FISICO', 313, 46190, '', 'Corralon Progreso', 470945, 'FA', '', 46220, 46220, ''],
]

test('el registro arranca en el dato (FISICO/ECHEQ), no en una fila fija', () => {
  const r = registroDeLaPestana(GRID)
  assert.equal(r.length, 3, 'la banda y el encabezado no son cheques')
  assert.equal(r[0].fila, 4, 'la fila física es la que se mira en la pestaña')
  assert.equal(r[0].instrumento, 'FISICO')
  assert.equal(r[0].numero, 223)
  assert.equal(r[0].importe, 200000)
})

test('DEBITADO en blanco es un cheque NO debitado, igual que "No"', () => {
  const r = registroDeLaPestana(GRID)
  assert.equal(r[0].debitado, false, '"No"')
  assert.equal(r[1].debitado, true, '"SI"')
  assert.equal(r[2].debitado, false, 'en blanco = todavía no salió (default seguro, igual que CAJA)')
})

test('el mismo número en los dos instrumentos son dos cheques, no uno', () => {
  const r = registroDeLaPestana([...GRID, ['ECHEQ', 313, '', '', 'Maderas Literas SRL', 383175, '', '', 46210, 46210, 'SI']])
  const trece = r.filter((c) => c.numero === 313)
  assert.equal(trece.length, 2)
  assert.deepEqual(trece.map((c) => c.instrumento).sort(), ['ECHEQ', 'FISICO'])
})
