import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cambiosDeMedicion, metodoTrasMedir } from './medicionEnLote.ts'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const actuales = [
  { id: A, unidad: null, cantidad_objetivo: null },
  { id: B, unidad: 'm²', cantidad_objetivo: 180 },
]
const form = (o: Record<string, string>) => Object.entries(o) as [string, FormDataEntryValue][]

test('sólo vuelven las filas que cambiaron', () => {
  const c = cambiosDeMedicion(form({
    [`unidad_${A}`]: 'm³', [`cantidad_${A}`]: '42',
    [`unidad_${B}`]: 'm²', [`cantidad_${B}`]: '180',   // igual: no viaja
  }), actuales)
  assert.deepEqual(c, [{ actividad_id: A, unidad: 'm³', cantidad_objetivo: 42 }])
})

test('VACIAR ES UN CAMBIO, no un olvido', () => {
  // Borrar la celda de una actividad medida significa «esto no se mide así». Ignorarlo dejaría
  // imposible desmedir algo mal cargado.
  const c = cambiosDeMedicion(form({ [`unidad_${B}`]: '', [`cantidad_${B}`]: '' }), actuales)
  assert.deepEqual(c, [{ actividad_id: B, unidad: null, cantidad_objetivo: null }])
})

test('la coma es el separador decimal, y el punto el de miles', () => {
  const c = cambiosDeMedicion(form({ [`unidad_${A}`]: 'm³', [`cantidad_${A}`]: '1.250,5' }), actuales)
  assert.equal(c[0].cantidad_objetivo, 1250.5)
})

test('una cantidad que no es un número positivo no se guarda como cero', () => {
  for (const v of ['abc', '-5', '0']) {
    const c = cambiosDeMedicion(form({ [`cantidad_${A}`]: v }), actuales)
    // A no tenía cantidad: no hay cambio, y sobre todo no entra un 0 que después divide.
    assert.deepEqual(c, [], v)
  }
})

test('una actividad que no vino en el formulario no se toca', () => {
  const c = cambiosDeMedicion(form({ [`unidad_${A}`]: 'un', [`cantidad_${A}`]: '3' }), actuales)
  assert.deepEqual(c.map((x) => x.actividad_id), [A])
})

test('medir una actividad la pasa a calcular su avance; desmedirla la devuelve a mano', () => {
  assert.equal(metodoTrasMedir({ actividad_id: A, unidad: 'm²', cantidad_objetivo: 180 }, 'manual'), 'cantidad')
  // Sin objetivo no hay porcentaje que calcular: quedaría sin avance y contra el CHECK de la base.
  assert.equal(metodoTrasMedir({ actividad_id: A, unidad: 'm²', cantidad_objetivo: null }, 'cantidad'), 'manual')
  // Y no le pisa el método a una que se lleva por partes diarios.
  assert.equal(metodoTrasMedir({ actividad_id: A, unidad: null, cantidad_objetivo: null }, 'partes'), 'partes')
})
