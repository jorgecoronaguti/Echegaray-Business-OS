// EL FORMATO ES DE LA PANTALLA, Y NUNCA VUELVE A LA BASE.
//
// Un CUIT guardado con guiones deja de cruzar contra ARCA y contra el banco — es el único motivo por
// el que esa columna existe—, y la base lo impide con un CHECK de once dígitos. Pero once cifras
// seguidas no se comparan de un vistazo contra la factura que alguien tiene en la mano, así que se
// formatean AL MOSTRAR.
//
// El caso que se rompe en silencio es el tercero: un valor mal cargado. Un formateador que parte a
// ciegas convierte «3070839055» (diez dígitos) en algo con forma de CUIT válido, y entonces el dato
// roto deja de verse. Se muestra tal cual está, para que alguien lo corrija.

import test from 'node:test'
import assert from 'node:assert/strict'
import { formatearCuit, formatearDni } from './identidad.ts'

test('un CUIT de once dígitos se muestra con guiones', () => {
  assert.equal(formatearCuit('30708390557'), '30-70839055-7')
  assert.equal(formatearCuit('20294271067'), '20-29427106-7')
})

test('un CUIT mal cargado NO se disfraza de bien formado', () => {
  assert.equal(formatearCuit('3070839055'), '3070839055', 'diez dígitos no son un CUIT')
  assert.equal(formatearCuit('307083905577'), '307083905577', 'doce tampoco')
  assert.equal(formatearCuit('SIN DATO'), 'SIN DATO')
})

test('la ausencia sigue siendo ausencia: nunca un guión suelto ni un cero', () => {
  assert.equal(formatearCuit(null), null)
  assert.equal(formatearCuit(''), null)
  assert.equal(formatearDni(null), null)
})

test('un DNI se lee con puntos, de siete y de ocho dígitos', () => {
  assert.equal(formatearDni('29427106'), '29.427.106')
  assert.equal(formatearDni('8904117'), '8.904.117')
  // Y uno de seis no es un DNI: se muestra como está.
  assert.equal(formatearDni('123456'), '123456')
})

test('el formato entra y sale idempotente: volver a formatear no agrega separadores', () => {
  // La ficha muestra el valor formateado; el formulario guarda el crudo. Si alguien pega el valor ya
  // formateado, formatear otra vez no puede producir «30--70-83905-5-7».
  assert.equal(formatearCuit('30-70839055-7'), '30-70839055-7')
  assert.equal(formatearDni('29.427.106'), '29.427.106')
})
