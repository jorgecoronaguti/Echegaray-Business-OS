import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPACIDAD, modeloPara, normalizarCapacidad } from './capacidad.mjs'

test('cada capacidad tiene su alias y COMPLEX no es el mismo que SIMPLE', () => {
  assert.equal(modeloPara(CAPACIDAD.SIMPLE), 'haiku')
  assert.equal(modeloPara(CAPACIDAD.NORMAL), 'haiku')
  assert.equal(modeloPara(CAPACIDAD.COMPLEX), 'opus')
  assert.notEqual(modeloPara(CAPACIDAD.SIMPLE), modeloPara(CAPACIDAD.COMPLEX))
})

test('lo que no se reconoce cae en NORMAL, NUNCA en COMPLEX', () => {
  // Un typo no puede escalar solo al modelo más caro: sería una fuga de costo silenciosa.
  for (const v of ['difícil', 'COMPLEJO', '', null, undefined, 'opus', 42]) {
    assert.equal(normalizarCapacidad(v), CAPACIDAD.NORMAL, String(v))
  }
})

test('la capacidad se lee sin importar mayúsculas ni espacios', () => {
  assert.equal(normalizarCapacidad(' COMPLEX '), CAPACIDAD.COMPLEX)
  assert.equal(normalizarCapacidad('Simple'), CAPACIDAD.SIMPLE)
})

test('el override del dueño gana, y un override vacío NO pisa el alias', () => {
  assert.equal(modeloPara(CAPACIDAD.SIMPLE, 'claude-opus-5'), 'claude-opus-5')
  // `ORQ_COMPROBANTES_MODELO=` sin valor no puede dejar al caller sin modelo.
  for (const vacio of ['', '   ', null, undefined]) {
    assert.equal(modeloPara(CAPACIDAD.COMPLEX, vacio), 'opus', JSON.stringify(vacio))
  }
})
