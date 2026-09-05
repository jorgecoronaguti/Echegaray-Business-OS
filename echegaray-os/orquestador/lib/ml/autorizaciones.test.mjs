import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autorizable, dominiosAutorizados, parsear } from './autorizaciones.mjs'

test('sin configuración no hay nada autorizado: el default es cerrado', () => {
  const { autorizados } = dominiosAutorizados({ crudo: '' })
  assert.deepEqual(autorizados, [])
})

test('un RESTRICTED no se autoriza por variable de entorno, aunque alguien lo escriba', () => {
  const { autorizados, rechazados } = dominiosAutorizados({ crudo: 'consultas,legajo,banco,nomina' })
  assert.deepEqual(autorizados, ['consultas'])
  // No falla en silencio: los rechazados se devuelven para poder decirlo. Un intento de autorizar
  // un legajo tiene que ser VISIBLE, no desaparecer.
  assert.deepEqual(rechazados.sort(), ['banco', 'legajo', 'nomina'])
})

test('CONFIDENTIAL sí es autorizable: es la decisión que el dueño puede tomar', () => {
  const { autorizados } = dominiosAutorizados({ crudo: 'compras,obras,clientes' })
  assert.deepEqual(autorizados.sort(), ['clientes', 'compras', 'obras'])
})

test('el parseo tolera espacios, mayúsculas y comas de más', () => {
  assert.deepEqual(parsear(' Consultas , ,INTENCIONES,'), ['consultas', 'intenciones'])
  assert.deepEqual(parsear(null), [])
})

test('lo no declarado en la política es CONFIDENTIAL, y por lo tanto autorizable', () => {
  // Un dominio nuevo cae en CONFIDENTIAL por el default restrictivo de `politica.mjs`. Eso lo hace
  // autorizable a mano — que es correcto: la decisión sigue siendo del dueño, no del default.
  assert.equal(autorizable('un-dominio-nuevo'), true)
  assert.equal(autorizable('credenciales'), false)
})
