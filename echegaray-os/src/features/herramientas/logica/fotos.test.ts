import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fotosDe, resumenDeTanda, rotuloElegidas, sumarElegidas, TOPE_FOTOS_POR_VEZ, type FotoDeActivo } from './fotos.ts'

const A = 'activo-a'
const foto = (id: string, creado_en: string, activo_id = A): FotoDeActivo =>
  ({ id, activo_id, url: `https://x/${id}.jpg`, incidencia_id: null, subida_por: null, creado_en })

test('sin la tabla (null) no hay lista: la ficha sigue con la foto de siempre, no con «ninguna»', () => {
  assert.equal(fotosDe(null, A), null)
  assert.equal(fotosDe(undefined, A), null)
  assert.deepEqual(fotosDe([], A), [])
})

test('de la más nueva a la más vieja, y sólo las del activo', () => {
  const r = fotosDe([
    foto('vieja', '2026-09-20T10:00:00+00:00'),
    foto('ajena', '2026-10-01T12:00:00+00:00', 'activo-b'),
    foto('nueva', '2026-10-01T09:00:00.5+00:00'),
    foto('medio', '2026-09-28T23:59:59.999+00:00'),
  ], A)
  assert.deepEqual(r?.map((f) => f.id), ['nueva', 'medio', 'vieja'])
})

test('una tanda en el mismo milisegundo se ordena por microsegundos (clock_timestamp), no queda al azar', () => {
  const r = fotosDe([
    foto('primera', '2026-10-01T18:00:00.123401+00:00'),
    foto('tercera', '2026-10-01T18:00:00.123499+00:00'),
    foto('segunda', '2026-10-01T18:00:00.123450+00:00'),
  ], A)
  assert.deepEqual(r?.map((f) => f.id), ['tercera', 'segunda', 'primera'])
})

test('en el reporte, con la tabla las fotos se suman; sin ella la nueva reemplaza a la anterior', () => {
  assert.deepEqual(sumarElegidas(['a'], ['b', 'c'], true), ['a', 'b', 'c'])
  assert.deepEqual(sumarElegidas(['a'], ['b', 'c'], false), ['b'])
  const muchas = Array.from({ length: TOPE_FOTOS_POR_VEZ + 3 }, (_, i) => i)
  assert.equal(sumarElegidas([], muchas, true).length, TOPE_FOTOS_POR_VEZ)
})

test('el botón dice cuántas fotos hay listas', () => {
  assert.equal(rotuloElegidas(0, true), 'Agregar foto')
  assert.equal(rotuloElegidas(1, false), 'Foto lista · cambiar')
  assert.equal(rotuloElegidas(1, true), '1 foto lista · agregar otra')
  assert.equal(rotuloElegidas(3, true), '3 fotos listas · agregar otra')
})

test('la tanda dice cuántas quedaron y por qué no las otras: nunca «guardada» si alguna se perdió', () => {
  assert.deepEqual(resumenDeTanda(1, []), { ok: true, texto: 'Foto guardada.' })
  assert.deepEqual(resumenDeTanda(4, []), { ok: true, texto: '4 fotos guardadas.' })
  assert.deepEqual(resumenDeTanda(2, ['Revisá la conexión.']), { ok: false, texto: '2 fotos guardadas. 1 no se guardó: Revisá la conexión.' })
  assert.deepEqual(resumenDeTanda(0, ['La foto está vacía.', 'x']), { ok: false, texto: 'La foto está vacía.' })
  assert.equal(resumenDeTanda(0, []).ok, false)
})
