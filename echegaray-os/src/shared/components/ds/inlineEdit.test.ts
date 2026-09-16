import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alConfirmarGuardado, alLlegarDelServidor, esCero, hayQueGuardar, textoAlAbrir, valorVigente,
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

// ═══ LA CELDA PAGADO ABRÍA CON «0» EN VEZ DE VACÍO (QA, 16/09/2026) ═══
//
// En reposo dibuja «—» (cero derivado, sin marca manual); al abrirla traía un «0» que había que borrar antes de
// teclear el importe. Y si se abría vacío a secas, salir sin escribir mandaba `''` sobre un `'0'`: un NULL de
// más por cada celda que se miraba. MUTACIÓN: abrir con `cuenta ?? vigente` → el primer test se pone rojo;
// no mirar `ceroAbreVacio` en `hayQueGuardar` → el tercero.

test('sobre un cero derivado, el campo abre vacío; sobre un cero escrito a mano, abre con el 0', () => {
  assert.equal(textoAlAbrir(enBlanco('0'), null, { ceroAbreVacio: true }), '',
    'la celda Pagado abre con «0» en vez de vacío')
  assert.equal(textoAlAbrir(enBlanco('0'), null, { ceroAbreVacio: false }), '0', 'un 0 manual es una afirmación')
  assert.equal(textoAlAbrir(enBlanco('0'), null), '0', 'sin la opción, lo de siempre')
})

test('la cuenta guardada gana siempre al abrir, aunque valga cero', () => {
  assert.equal(textoAlAbrir(enBlanco('0'), '=5-5', { ceroAbreVacio: true }), '=5-5')
  assert.equal(textoAlAbrir(enBlanco('945'), '=9*105'), '=9*105')
})

test('salir del campo abierto vacío sobre un cero derivado NO escribe un NULL', () => {
  assert.equal(hayQueGuardar(enBlanco('0'), '', { ceroAbreVacio: true }), false,
    'cada Pagado que se abre y se cierra mandaría un NULL de más')
  // Y SIGUE ESCRIBIENDO LO QUE SÍ CAMBIA: un importe sobre el cero, y el vacío sobre un 0 escrito a mano.
  assert.equal(hayQueGuardar(enBlanco('0'), '15000', { ceroAbreVacio: true }), true)
  assert.equal(hayQueGuardar(enBlanco('0'), ''), true, 'borrar un 0 manual sí es borrar el override')
  assert.equal(hayQueGuardar(enBlanco('12'), '', { ceroAbreVacio: true }), true, 'vaciar un 12 sí escribe')
})

test('«cero» es un cero numérico, no el vacío', () => {
  assert.equal(esCero('0'), true)
  assert.equal(esCero('0,00'), true)
  assert.equal(esCero(' 0 '), true)
  assert.equal(esCero(''), false)
  assert.equal(esCero('12'), false)
})
