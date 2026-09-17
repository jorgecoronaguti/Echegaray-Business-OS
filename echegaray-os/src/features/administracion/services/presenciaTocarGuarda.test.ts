import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casillaTrasToque, marcaDeLaCasilla } from './presenciaDelDia.ts'

const VACIA = { estado: null, motivo: null }

test('tocar «Está» escribe presente; tocarlo de nuevo quita la marca (null = quitar la fila)', () => {
  const c = casillaTrasToque(VACIA, { tipo: 'estado', boton: 'presente' })
  assert.deepEqual(marcaDeLaCasilla('p', c), { persona_id: 'p', estado: 'presente', motivo: null, llego_tarde: false, salio_antes: false })
  const d = casillaTrasToque(c, { tipo: 'estado', boton: 'presente' })
  assert.equal(marcaDeLaCasilla('p', d), null)
})

test('«Llegó tarde» sobre alguien sin marcar lo declara presente con la tardanza', () => {
  const c = casillaTrasToque(VACIA, { tipo: 'tardanza', marca: 'llego_tarde' })
  assert.equal(c.estado, 'presente')
  assert.equal(marcaDeLaCasilla('p', c)?.llego_tarde, true)
  const d = casillaTrasToque(c, { tipo: 'tardanza', marca: 'llego_tarde' })
  assert.equal(marcaDeLaCasilla('p', d)?.llego_tarde, false, 'tocar de nuevo saca la tardanza, no la presencia')
  assert.equal(d.estado, 'presente')
})

test('pasar a «No vino» descarta la tardanza: quien no vino no llegó tarde', () => {
  const tarde = casillaTrasToque(VACIA, { tipo: 'tardanza', marca: 'salio_antes' })
  const m = marcaDeLaCasilla('p', casillaTrasToque(tarde, { tipo: 'estado', boton: 'ausente' }))
  assert.equal(m?.estado, 'ausente')
  assert.notEqual(m?.salio_antes, true)
})

test('el motivo de licencia convierte «No vino» en licencia', () => {
  const c = casillaTrasToque({ estado: 'ausente', motivo: null }, { tipo: 'motivo', boton: 'ausente', motivo: 'enfermedad' })
  assert.ok(c.estado === 'licencia' || c.estado === 'ausente')
  assert.equal(c.motivo, 'enfermedad')
})
