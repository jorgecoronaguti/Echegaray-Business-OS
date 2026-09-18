import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeSalir, verificarCitas, recortar, TIPOS } from './hf-digerir.mjs'

test('sólo salen los tipos de desarrollo de la lista cerrada', () => {
  assert.equal(puedeSalir('tests', 'ok').permitido, true)
  assert.equal(puedeSalir('flujo-caja', 'ok').permitido, false)
  assert.equal(puedeSalir('banco', 'ok').permitido, false)
  assert.deepEqual(Object.keys(TIPOS).sort(), ['build', 'codigo', 'git', 'lint', 'tests', 'typecheck'])
})

test('un monto en pesos, un CUIT o un mail frenan la salida aunque el tipo sea de desarrollo', () => {
  assert.equal(puedeSalir('tests', 'esperado $1.160.400 recibido 0').permitido, false)
  assert.equal(puedeSalir('tests', 'proveedor 30-70774398-7').permitido, false)
  assert.equal(puedeSalir('git', 'Author: x <alguien@ecsas.com.ar>').permitido, false)
})

test('una cita que no está en la fuente se marca; la que está, no', () => {
  const fuente = 'a.mjs:10 TypeError: x is not a function\nb.mjs:3 ok'
  const { marcado, malas } = verificarCitas('falla «a.mjs:10 TypeError: x is not a function» y «c.mjs:9 inventado»', fuente)
  assert.equal(malas, 1)
  assert.match(marcado, /«c\.mjs:9 inventado» ✗NO-ESTÁ/)
  assert.doesNotMatch(marcado, /function» ✗/)
})

test('recortar conserva cabeza y cola y avisa', () => {
  const r = recortar('C'.repeat(50) + 'x'.repeat(200) + 'F'.repeat(50), 100)
  assert.equal(r.recortado, true)
  assert.ok(r.texto.startsWith('C'.repeat(20)))
  assert.ok(r.texto.endsWith('F'.repeat(50)))
  assert.equal(recortar('corto', 100).recortado, false)
})
