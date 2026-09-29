import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ultimaFilaOcupada } from './ultima-fila.mjs'

test('fila con proveedor vacío pero con fecha e importe cuenta como ocupada (caso SURI, fila 1030)', () => {
  // columnas C..N → índices: C=0 (fecha), E=2 (proveedor), H=5 (número), K=8 (detalle), M=10 (neto), N=11 (iva)
  const filas = [
    ['01/09/26', '', 'ACME', '', '', '0001-1', '', '', '', '', '100', ''],
    ['29/09/26', '', '', '', '', '0027-00026284', '', '', 'Allanadora', '', '1635438.28', '186093.98'],
  ]
  assert.equal(ultimaFilaOcupada(filas, [0, 2, 5, 8, 10, 11]), 2)
  // lo que hacía antes: sólo el proveedor → la 2 parecía libre
  assert.equal(ultimaFilaOcupada(filas, [2]), 1)
})

test('blancos y espacios no ocupan; filas cortas no rompen', () => {
  assert.equal(ultimaFilaOcupada([['x'], [], ['  '], [null]], [0, 3]), 1)
  assert.equal(ultimaFilaOcupada([], [0]), 0)
})
