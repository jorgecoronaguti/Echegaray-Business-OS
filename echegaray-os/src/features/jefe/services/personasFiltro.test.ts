// LO QUE ATRAPAN: un chip «Ausentes» que convierte «no hay marca» en una falta declarada, un
// contador que no cuenta lo que la lista muestra, y un filtro que abre en blanco sin decir por qué.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  conteoPersonas, FILTRO_PERSONAS_LABEL, FILTROS_PERSONAS, muestraFichados, muestraSinFichar,
  vacioPorFiltro, type FiltroPersonas,
} from './personasFiltro.ts'

test('NO EXISTE UN CHIP «AUSENTES»: el sistema no sabe quién faltó, sabe quién no marcó', () => {
  // El defecto que atrapa: agregar `ausentes` a la lista de filtros. Un operario sin teléfono, uno
  // sin permiso de GPS y uno que faltó de verdad se ven igual desde esta pantalla. La falta la
  // declara una persona en Administración, y de ahí sale una liquidación.
  assert.deepEqual([...FILTROS_PERSONAS], ['todos', 'fichados', 'sin-fichar'])
  for (const f of FILTROS_PERSONAS) {
    assert.equal(/ausen/i.test(FILTRO_PERSONAS_LABEL[f]), false, `«${FILTRO_PERSONAS_LABEL[f]}» acusa`)
  }
  assert.equal(FILTRO_PERSONAS_LABEL['sin-fichar'], 'Sin fichar')
})

test('los tres rótulos son los del canónico J05', () => {
  assert.deepEqual(
    FILTROS_PERSONAS.map((f) => FILTRO_PERSONAS_LABEL[f]),
    ['Todos', 'Fichados', 'Sin fichar'],
  )
})

test('el contador de cada chip es EXACTAMENTE lo que ese chip deja ver', () => {
  const c = conteoPersonas(9, 4)
  assert.deepEqual(c, { todos: 13, fichados: 9, 'sin-fichar': 4 })
  // El defecto que atrapa: que «Todos» cuente sólo los fichados. El jefe toca «Todos», ve 13 filas
  // y el chip dice 9: a partir de ahí ningún número de la pantalla vuelve a ser creíble.
  assert.equal(c.todos, c.fichados + c['sin-fichar'])
})

test('sin nadie, los tres chips dicen cero y ninguno inventa un plantel', () => {
  assert.deepEqual(conteoPersonas(0, 0), { todos: 0, fichados: 0, 'sin-fichar': 0 })
})

test('cada chip muestra su bloque y esconde el otro', () => {
  const casos: [FiltroPersonas, boolean, boolean][] = [
    ['todos', true, true],
    ['fichados', true, false],
    ['sin-fichar', false, true],
  ]
  for (const [f, fich, sin] of casos) {
    assert.equal(muestraFichados(f), fich, `fichados con ${f}`)
    assert.equal(muestraSinFichar(f), sin, `sin fichar con ${f}`)
  }
})

test('«Fichados» con nadie fichado avisa que es el filtro, no la obra vacía', () => {
  // El defecto que atrapa: dejar la pantalla en blanco. Se lee «no hay nadie en la obra», que es una
  // afirmación sobre el mundo que nadie hizo — alcanza con tocar otro chip.
  assert.equal(vacioPorFiltro('fichados', 0, 5), true)
  assert.equal(vacioPorFiltro('sin-fichar', 5, 0), true)
})

test('con la obra realmente vacía NO es culpa del filtro: no se muestra ese aviso', () => {
  for (const f of FILTROS_PERSONAS) assert.equal(vacioPorFiltro(f, 0, 0), false)
})

test('un filtro con filas no avisa nada', () => {
  assert.equal(vacioPorFiltro('todos', 9, 4), false)
  assert.equal(vacioPorFiltro('fichados', 9, 4), false)
})
