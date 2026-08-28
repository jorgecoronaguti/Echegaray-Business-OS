import test from 'node:test'
import assert from 'node:assert/strict'
import { contextoDelCliente, CLAVES_DE_PANTALLA } from './contexto.ts'

test('el navegador NO puede nombrar una obra ni un cliente', () => {
  const r = contextoDelCliente({ obra: 'Quattropani', cliente: 'ACME', proyecto: 'X' })
  assert.deepEqual(r.permitido, {}, 'ninguna de esas claves puede viajar')
  assert.deepEqual(r.descartado.sort(), ['cliente', 'obra', 'proyecto'])
})

test('lo que describe la pantalla sí viaja, recortado', () => {
  const r = contextoDelCliente({ pantalla: 'obras/detalle', ruta: '/obras/1', obra: 'Quattropani' })
  assert.equal(r.permitido.pantalla, 'obras/detalle')
  assert.equal(r.permitido.ruta, '/obras/1')
  assert.deepEqual(r.descartado, ['obra'])
})

test('un objeto anidado en una clave permitida también se descarta', () => {
  const r = contextoDelCliente({ pantalla: { obra: 'Quattropani' } })
  assert.deepEqual(r.permitido, {})
  assert.deepEqual(r.descartado, ['pantalla'])
})

test('entradas que no son un objeto no rompen y no aportan nada', () => {
  for (const x of [null, undefined, 'texto', 42, ['obra']]) {
    const r = contextoDelCliente(x)
    assert.deepEqual(r.permitido, {})
    assert.deepEqual(r.descartado, [])
  }
})

test('la lista de claves de pantalla es corta: crecerla es una decisión', () => {
  assert.deepEqual([...CLAVES_DE_PANTALLA], ['pantalla', 'ruta', 'seccion', 'vista'])
})
