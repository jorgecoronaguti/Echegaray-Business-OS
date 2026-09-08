import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jornadaPorDefecto } from './jornadaPorDefecto.ts'

// LA REGLA ES DEL DUEÑO (08/09/2026): «por defecto siempre poner 9 hs de L a J y 8 hs los V cuando
// se da el presente». Lo que este test fija es que el VIERNES no valga 9: la media hora larga de
// más, repetida cada viernes sobre veinte personas, es una quincena que no cierra contra JORNALES.
test('DE LUNES A JUEVES SON 9 HS', () => {
  assert.equal(jornadaPorDefecto('2026-09-07'), 9, 'lunes')
  assert.equal(jornadaPorDefecto('2026-09-10'), 9, 'jueves')
})

test('EL VIERNES SON 8 HS', () => {
  assert.equal(jornadaPorDefecto('2026-09-11'), 8)
})

test('EL FIN DE SEMANA NO TIENE JORNADA POR DEFECTO: se carga a mano o no existe', () => {
  assert.equal(jornadaPorDefecto('2026-09-12'), null, 'sábado')
  assert.equal(jornadaPorDefecto('2026-09-13'), null, 'domingo')
})
