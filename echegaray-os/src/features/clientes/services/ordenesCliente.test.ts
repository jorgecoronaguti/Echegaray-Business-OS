import test from 'node:test'
import assert from 'node:assert/strict'
import { numeroCorto } from './ordenesCliente.ts'

// LOS MISMOS NÚMEROS QUE `orquestador/lib/ordenes-cliente.test.mjs`, y a propósito: la regla del
// número canónico vive allá (se aplica al escribir) y acá se repite en TypeScript porque `src/` no
// importa del orquestador. Clavar los mismos casos es lo que hace que las dos no se separen en
// silencio — si una cambia sola, uno de los dos archivos se pone rojo.
//
// Los tests de `rotuloOrden`, `diaMes` e `importeCorto` se fueron con esas funciones el 10/09/2026:
// armaban el rótulo «OC 2256 · 02/09 · $12.100.000» que colgaba del nombre de la obra en la lista,
// y el dueño lo mandó sacar. Un test de una función que ya nadie llama es verde que no cuida nada.

test('el número que se dibuja es el corto, y el mismo para las tres formas de escribirlo', () => {
  assert.equal(numeroCorto('00002-00002162'), '2162')
  assert.equal(numeroCorto('02-00002162'), '2162')
  assert.equal(numeroCorto('0000000004865'), '4865')
  assert.equal(numeroCorto(null), null)
})
