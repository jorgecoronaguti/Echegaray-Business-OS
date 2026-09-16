// EL VIGÍA TIENE QUE PODER DECIR QUE SÍ. Un control que sólo sabe decir «todavía no» es indistinguible
// de un control roto: ese es el defecto que estos tests atrapan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esElCheque, yaLlegaron, importeDeTexto, ESPERADOS } from './vigilar-echeqs-op.mjs'

// Una fila del espejo, con la forma real de `_CHEQUES_RAW` (leída del Sheet el 16/09/2026).
const fila = (nro, importe, banco = 'Supervielle S.G.') =>
  ['recibido', nro, banco, '', 'Manufacturas Quimicas Juan Messina SA', '16/09/2026', importe, 'Por aceptar', '', '0000000005241', 'MESSINA']

test('reconoce el cheque cuando coinciden número E importe', () => {
  const e = ESPERADOS[0]
  assert.equal(esElCheque(fila('6526', '$2.896.036,13'), e), true)
  assert.deepEqual(yaLlegaron([fila('6526', '$2.896.036,13')]), [e])
})

test('EL NÚMERO SOLO NO ALCANZA: otro banco puede repetir la numeración', () => {
  // Mismo número, importe distinto → NO es el cheque que espero.
  assert.equal(esElCheque(fila('6526', '$1.000,00'), ESPERADOS[0]), false)
  // Mismo importe, número distinto → tampoco.
  assert.equal(esElCheque(fila('9999', '$2.896.036,13'), ESPERADOS[0]), false)
})

test('con el espejo como está hoy no encuentra nada, y eso NO es un error', () => {
  assert.deepEqual(yaLlegaron([fila('4343', '$1.504.896,20'), fila('3828', '$17.808.571,80')]), [])
  assert.deepEqual(yaLlegaron([]), [])
})

test('los dos cheques se detectan por separado', () => {
  const llegaron = yaLlegaron([fila('8767', '$9.426.000,00', 'Rio de la Plata S.A.')])
  assert.equal(llegaron.length, 1)
  assert.equal(llegaron[0].numero, '8767')
})

test('el importe se lee en formato argentino y no confunde el punto de miles', () => {
  assert.equal(importeDeTexto('$ 2.896.036,13'), 2896036.13)
  assert.equal(importeDeTexto('9426000'), 9426000)
  assert.equal(importeDeTexto('no es plata'), null)
  assert.equal(importeDeTexto(''), null)
})
