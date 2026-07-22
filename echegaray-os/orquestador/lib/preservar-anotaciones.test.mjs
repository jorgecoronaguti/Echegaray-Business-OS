import test from 'node:test'
import assert from 'node:assert/strict'
import { fusionar, sobrantes, tiene } from './preservar-anotaciones.mjs'

test('lo que anota el dueño NUNCA se borra, esté en la columna que esté', () => {
  const generado = [['Proveedor', 'Importe'], ['Alumetal', 100]]
  // El dueño anotó en la columna E (índice 4), muy a la derecha de la tabla.
  const existente = [['Proveedor', 'Importe', '', '', 'REVISAR CON RODRIGO'], ['Alumetal', 90, '', '', 'llamar el lunes']]
  const out = fusionar(generado, existente)
  assert.equal(out[0][4], 'REVISAR CON RODRIGO')
  assert.equal(out[1][4], 'llamar el lunes')
  // Y el dato del generador manda donde él sí tiene contenido.
  assert.equal(out[1][1], 100)
})

test('una anotación DENTRO de las columnas generadas también sobrevive', () => {
  // El generador deja vacía la col C; el dueño escribió ahí.
  const generado = [['Corralon', 1963541, '']]
  const existente = [['Corralon', 1900000, 'ojo: falta la NC']]
  assert.equal(fusionar(generado, existente)[0][2], 'ojo: falta la NC')
})

test('el generador puede achicar su bloque sin destruir filas del dueño', () => {
  const generado = [['a']]
  const existente = [['a'], ['nota vieja del dueño']]
  const out = fusionar(generado, existente)
  assert.equal(out.length, 2, 'la fila de más no se pierde')
  assert.equal(out[1][0], 'nota vieja del dueño')
})

test('una fórmula preservada sigue siendo fórmula (no se degrada a número pegado)', () => {
  const generado = [['', '']]
  const existente = [['=SUMA(A1:A9)', '']]
  assert.equal(fusionar(generado, existente)[0][0], '=SUMA(A1:A9)')
})

test('el cero es contenido, no vacío', () => {
  assert.equal(tiene(0), true)
  assert.equal(tiene(''), false)
  assert.equal(tiene(null), false)
  assert.equal(tiene(undefined), false)
  assert.equal(fusionar([[0]], [['viejo']])[0][0], 0, 'un 0 del generador pisa el valor viejo')
})

test('sobrantes nombra lo que quedó y el generador ya no produce', () => {
  const generado = [['a', '']]
  const existente = [['a', 'nota'], ['fila vieja']]
  const s = sobrantes(generado, existente)
  assert.deepEqual(s, [
    { fila: 1, col: 2, valor: 'nota' },
    { fila: 2, col: 1, valor: 'fila vieja' },
  ])
})
