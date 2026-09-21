// LO QUE ESTOS TESTS ATRAPAN: que el filtro vuelva a leer una fecha en el orden equivocado, o que
// una fecha imposible se corrija sola al día siguiente y filtre un período que nadie pidió.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aCorta, deCorta } from './fechaCorta.ts'

test('ida y vuelta: el día es el día y el mes es el mes', () => {
  assert.equal(aCorta('2026-09-21'), '21/09/26')
  assert.equal(deCorta('21/09/26'), '2026-09-21')
  // EL DEFECTO QUE ATRAPA: leer 03/09 como 9 de marzo. Los dos existen, así que un error acá no da
  // error: da otro período, y nadie se entera.
  assert.equal(deCorta('03/09/26'), '2026-09-03')
  assert.equal(aCorta('2026-03-09'), '09/03/26')
})

test('se acepta lo que la gente escribe: sin ceros, con guiones, de corrido, con año largo', () => {
  for (const escrito of ['1/9/26', '01-09-26', '010926', '1.9.2026', '01/09/2026']) {
    assert.equal(deCorta(escrito), '2026-09-01', `no leyó «${escrito}»`)
  }
})

test('una fecha que no existe devuelve null, NUNCA el día siguiente', () => {
  // `new Date(2026, 3, 31)` da el 1 de mayo sin quejarse: eso es corregir en silencio.
  assert.equal(deCorta('31/04/26'), null)
  assert.equal(deCorta('29/02/26'), null, '2026 no es bisiesto')
  assert.equal(deCorta('29/02/24'), '2024-02-29', 'pero 2024 sí lo es')
  assert.equal(deCorta('13/13/26'), null)
  assert.equal(deCorta('00/09/26'), null)
  assert.equal(deCorta('hola'), null)
  assert.equal(deCorta(''), null)
})

test('un ISO vacío o roto deja el campo en blanco, no escribe basura', () => {
  assert.equal(aCorta(''), '')
  assert.equal(aCorta('2026-09'), '')
})
