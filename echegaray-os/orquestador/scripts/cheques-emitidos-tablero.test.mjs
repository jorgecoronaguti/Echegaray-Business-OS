// El ANCLA del generador de "Cheques Emitidos". Lo que arma la banda se prueba en
// lib/cheques-emitidos-cabecera.test.mjs; acá está lo único que vive en el script.
//
// El defecto que este archivo ataja ya rompió la pestaña en la vida real: un ancla puesta en un
// rótulo que una persona puede borrar. El dueño borró "TIPO" y el generador insertó 12 filas a
// ciegas, dejando la pestaña con DOS bandas superpuestas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ubicarRegistro } from './cheques-emitidos-tablero.mjs'

test('el registro se ubica por el DATO (FISICO/ECHEQ), no por un rótulo borrable', () => {
  assert.deepEqual(ubicarRegistro([['Cheques emitidos'], [''], ['Tipo'], ['FISICO'], ['ECHEQ']]), { primera: 4, hdr: 3 })
  // Sin el rótulo "TIPO" —el dueño lo borró— igual encuentra el registro.
  assert.deepEqual(ubicarRegistro([['x'], [''], [''], ['ECHEQ']]), { primera: 4, hdr: 3 })
  // Y si no hay registro, no adivina: devuelve null y el script aborta antes de insertar nada.
  assert.equal(ubicarRegistro([['x'], ['y']]), null)
  assert.equal(ubicarRegistro([]), null)
})

test('el ancla no se confunde con un texto que CONTIENE el tipo', () => {
  // "cheques FISICOS" o "ECHEQ recibidos" son rótulos, no filas de datos.
  assert.equal(ubicarRegistro([['cheques FISICOS'], ['ECHEQ recibidos']]), null)
  // Pero tolera el espacio y la minúscula de una carga a mano.
  assert.deepEqual(ubicarRegistro([['  echeq ']]), { primera: 1, hdr: 0 })
})
