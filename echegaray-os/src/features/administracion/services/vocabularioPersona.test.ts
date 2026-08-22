import test from 'node:test'
import assert from 'node:assert/strict'
import { oficioVisible, pareceCategoria } from './vocabularioPersona.ts'

// EL DEFECTO 4.10, ATRAPADO. La fila del listado escribía `especialidad ?? puesto` debajo del
// nombre, y `puesto` trae el CARGO de la nómina: había filas que decían «OFICIAL» debajo del nombre
// —donde va el oficio— y «Ayudante» en la columna CATEGORÍA. Dos respuestas al mismo hecho.
// Volver al `??` pelado pone este test en rojo.
test('una categoría de convenio NUNCA se publica como oficio', () => {
  assert.equal(oficioVisible(null, 'OFICIAL'), null)
  assert.equal(oficioVisible(null, 'Medio oficial'), null)
  assert.equal(oficioVisible(null, 'medio_oficial'), null)
  assert.equal(oficioVisible(null, 'Oficial especializado'), null)
  assert.equal(oficioVisible(null, 'ayudante'), null)
})

test('el oficio de verdad sí se publica, venga de donde venga', () => {
  assert.equal(oficioVisible('Albañil', null), 'Albañil')
  // Sin especialidad cargada, un puesto que NO es categoría es la mejor respuesta que hay.
  assert.equal(oficioVisible(null, 'Electricista'), 'Electricista')
  // La especialidad manda sobre el puesto: es el campo hecho para esto.
  assert.equal(oficioVisible('Yesero', 'Electricista'), 'Yesero')
})

// UN ROL ORGANIZACIONAL NO ES UNA CATEGORÍA DEL CONVENIO, y tampoco hay que esconderlo: «Jefe de
// obra» en el puesto es información real y no duplica ninguna otra columna.
test('el rol organizacional pasa: no lo publica ninguna otra columna', () => {
  assert.equal(oficioVisible(null, 'Jefe de obra'), 'Jefe de obra')
  assert.equal(pareceCategoria('Jefe de obra'), false)
})

// LA NÓMINA ESCRIBE COMO QUIERE. Mayúsculas, guión bajo, espacios y acentos son la misma categoría:
// comparar el texto crudo dejaba pasar «OFICIAL ESPECIALIZADO» como si fuera un oficio.
test('la comparación no se deja engañar por la grafía de la nómina', () => {
  assert.equal(pareceCategoria('OFICIAL'), true)
  assert.equal(pareceCategoria('  Oficial  '), true)
  assert.equal(pareceCategoria('MEDIO OFICIAL'), true)
  assert.equal(pareceCategoria('medio-oficial'), true)
  assert.equal(pareceCategoria('Oficial Especializado'), true)
  assert.equal(pareceCategoria(null), false)
  assert.equal(pareceCategoria(''), false)
})

// UN CÓDIGO MAL IMPORTADO NO ES UN OFICIO NI UNA CATEGORÍA. Hay tres personas con '1591', '6E60' y
// '004212' en la columna. No se esconde: se muestra tal cual para que alguien lo corrija — pero es
// la columna CATEGORÍA la que lo marca «fuera de convenio», no ésta la que lo tapa.
test('un código mal importado no se toma por categoría', () => {
  assert.equal(pareceCategoria('6E60'), false)
  assert.equal(oficioVisible(null, '6E60'), '6E60')
})
