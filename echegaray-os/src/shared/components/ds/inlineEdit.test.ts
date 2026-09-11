import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alConfirmarGuardado, alLlegarDelServidor, hayQueGuardar, valorVigente,
  type EstadoInline,
} from './inlineEdit.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN — «no se puede editar nada» (dueño, 10/09/2026).
//
// La escritura ocurría y la celda volvía a dibujar el valor anterior mientras el servidor tardaba
// diez o veinte segundos en devolver el nuevo. Si alguien vuelve a hacer que la celda dibuje la
// prop del servidor sin mirar lo ya confirmado, el primer test de abajo se pone rojo.

const enBlanco = (v: string): EstadoInline => ({ delServidor: v, pendiente: null })

test('lo guardado queda a la vista aunque el servidor siga devolviendo lo viejo', () => {
  const e = alConfirmarGuardado(enBlanco('9'), '7')
  assert.equal(valorVigente(e), '7',
    'la celda volvió al valor anterior después de guardar: eso es «no se puede editar nada»')
})

test('sin nada guardado, la celda dibuja lo que dice el servidor', () => {
  assert.equal(valorVigente(enBlanco('9')), '9')
})

test('cuando el servidor repite lo guardado, deja de haber pendiente', () => {
  const e = alLlegarDelServidor(alConfirmarGuardado(enBlanco('9'), '7'), '7')
  assert.deepEqual(e, { delServidor: '7', pendiente: null })
})

test('si otro pisó la celda mientras tanto, GANA EL SERVIDOR y se ve el pisotón', () => {
  const e = alLlegarDelServidor(alConfirmarGuardado(enBlanco('9'), '7'), '5')
  assert.equal(valorVigente(e), '5',
    'sostener lo propio escondería que otra persona corrigió la misma celda')
})

test('una prop que no cambió no toca el estado: no borra el pendiente en vuelo', () => {
  const antes = alConfirmarGuardado(enBlanco('9'), '7')
  assert.equal(alLlegarDelServidor(antes, '9'), antes)
  assert.equal(valorVigente(antes), '7')
})

test('vaciar la celda es un valor, no una ausencia: `` se sostiene igual que un número', () => {
  const e = alConfirmarGuardado(enBlanco('9'), '')
  assert.equal(valorVigente(e), '')
  assert.equal(hayQueGuardar(e, ''), false)
})

test('salir de una celda recién corregida NO vuelve a escribir el mismo valor', () => {
  const e = alConfirmarGuardado(enBlanco('9'), '7')
  assert.equal(hayQueGuardar(e, '7'), false,
    'se compararía contra la prop vieja y el historial cobraría una corrección de 9 a 7 dos veces')
})

test('volver al valor original mientras hay un pendiente SÍ escribe', () => {
  const e = alConfirmarGuardado(enBlanco('9'), '7')
  assert.equal(hayQueGuardar(e, '9'), true)
})

test('escribir lo mismo que el servidor, sin pendiente, no escribe', () => {
  assert.equal(hayQueGuardar(enBlanco('9'), '9'), false)
})
