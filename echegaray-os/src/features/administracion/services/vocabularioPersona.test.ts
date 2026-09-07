import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriaVisible, oficioVisible, pareceCategoria } from './vocabularioPersona.ts'

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA MUESTRA CATEGORÍA — pedido del dueño del 07/09/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la categoría se muestra con su etiqueta, no con la clave de la base', () => {
  assert.equal(categoriaVisible('medio_oficial', null), 'Medio oficial')
  assert.equal(categoriaVisible('oficial_especializado', null), 'Oficial especializado')
  // El campo `categoria` MANDA aunque `puesto` diga otra cosa: es el que liquida.
  assert.equal(categoriaVisible('ayudante', 'Oficial'), 'Ayudante')
})

// EL RESCATE: la categoría escondida adentro de `puesto`. `oficioVisible` la DESCARTA por ser una
// categoría; acá se RECUPERA por lo mismo. Los dos leen el mismo catálogo, así que ninguna fila
// puede caer en las dos columnas ni perderse entre las dos.
test('sin categoría cargada, se rescata la que venía disfrazada de puesto', () => {
  assert.equal(categoriaVisible(null, 'OFICIAL'), 'Oficial')
  assert.equal(categoriaVisible(null, 'medio-oficial'), 'Medio oficial')
  // Y lo que NO es categoría no se convierte en una: «albañil» es un oficio y acá no va.
  assert.equal(categoriaVisible(null, 'Albañil'), null)
  assert.equal(oficioVisible(null, 'Albañil'), 'Albañil')
  // Las dos funciones son excluyentes sobre el mismo texto libre: o es oficio, o es categoría.
  for (const t of ['OFICIAL', 'Ayudante', 'Albañil', 'electricista', '6E60']) {
    const enOficio = oficioVisible(null, t) !== null
    const enCategoria = categoriaVisible(null, t) !== null
    assert.notEqual(enOficio, enCategoria, `"${t}" cae en las dos columnas o en ninguna`)
  }
})

test('sin nada cargado la función calla, y la pantalla decide qué dibujar', () => {
  assert.equal(categoriaVisible(null, null), null)
  assert.equal(categoriaVisible('', '  '), null)
})
