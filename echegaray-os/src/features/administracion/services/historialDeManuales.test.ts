// EL PUNTO ÁMBAR DEJA DE SER UN TÍTULO FIJO Y PASA A SER UN LOG (dueño, 01/10/2026).
//
// Los defectos que estas pruebas atrapan:
//
//   1. FABRICAR PASADO. Los manuales que ya existían no tienen historial: el panel dice el valor y «sin registro
//      anterior al <día>», con el día en que la base empezó a anotar. Nunca un autor o una hora inventados.
//   2. VACÍO ≠ CERO. Una celda vaciada vuelve al cálculo; si se dibujara «$0» el log afirmaría que alguien dio cero.
//   3. EL ORDEN. Lo último que pasó arriba, también cuando dos cargas caen en el mismo segundo.
//   4. LA CUENTA VIAJA AL LADO DEL NÚMERO: «=340909,09+197272,73» se ve como se escribió.
//   5. AUTOR NULO ≠ AUTOR DESCONOCIDO: una escritura sin sesión (chat, sync) no se disfraza de una persona.

import test from 'node:test'
import assert from 'node:assert/strict'
import { claveDeCelda, historialDeCeldas, type CambioCrudo } from './historialDeManuales.ts'

const P = '11111111-1111-1111-1111-111111111111'

const fila = (o: Partial<CambioCrudo> & { id: number }): CambioCrudo => ({
  liquidacion_id: 'L1', grupo: 'obreros', persona_id: P, columna: 'por_banco_manual', tipo: 'cambio',
  antes: null, despues: null, formula_antes: null, formula_despues: null, autor: null,
  en: '2026-10-01T14:32:00-03:00', ...o,
})

test('cada carga sale con fecha y hora, valor escrito y quién; la más reciente primero', () => {
  const h = historialDeCeldas([
    fila({ id: 1, antes: null, despues: 100000, autor: 'u1', en: '2026-09-30T10:05:00-03:00' }),
    fila({ id: 2, antes: 100000, despues: 150000, autor: 'u2', en: '2026-10-01T14:32:00-03:00' }),
  ], new Map([['u1', 'Ana'], ['u2', 'Beto']]))
  const celda = h[claveDeCelda('obreros', P, 'porBanco')]
  assert.deepEqual(celda.entradas.map((e) => [e.cuando, e.quien, e.antes, e.despues]), [
    ['01/10/26 14:32', 'Beto', '$100.000', '$150.000'],
    ['30/09/26 10:05', 'Ana', 'cálculo', '$100.000'],
  ])
})

test('vaciar la celda se dice «vuelve al cálculo», nunca $0', () => {
  const h = historialDeCeldas([fila({ id: 1, antes: 150000, despues: null, autor: 'u1' })], new Map([['u1', 'Ana']]))
  const [e] = h[claveDeCelda('obreros', P, 'porBanco')].entradas
  assert.equal(e.despues, 'vuelve al cálculo')
  assert.equal(e.vaciado, true)
})

test('un cero tecleado es un cero: es una afirmación del dueño', () => {
  const h = historialDeCeldas([fila({ id: 1, antes: 5, despues: 0, autor: 'u1' })], new Map())
  const [e] = h[claveDeCelda('obreros', P, 'porBanco')].entradas
  assert.equal(e.despues, '$0')
  assert.equal(e.vaciado, false)
})

test('la cuenta escrita como «=a+b» viaja al lado del número', () => {
  const h = historialDeCeldas([fila({ id: 1, despues: 538181.82, formula_despues: '=340909,09+197272,73', autor: 'u1' })], new Map())
  assert.equal(h[claveDeCelda('obreros', P, 'porBanco')].entradas[0].cuenta, '=340909,09+197272,73')
})

test('el manual que ya existía NO tiene pasado inventado: valor actual y «sin registro anterior al <día>»', () => {
  const h = historialDeCeldas([
    fila({ id: 1, tipo: 'base', antes: null, despues: 90000, autor: null, en: '2026-10-01T02:00:00Z' }),
  ], new Map())
  const [e] = h[claveDeCelda('obreros', P, 'porBanco')].entradas
  assert.equal(e.esBase, true)
  assert.equal(e.despues, '$90.000')
  assert.equal(e.nota, 'sin registro anterior al 30/09/26', 'la fecha se dice en la hora de la empresa, no en UTC')
  assert.equal(e.quien, 'sin autor registrado', 'no se inventa quién lo escribió')
})

test('el orden desempata por id cuando dos cargas caen en el mismo instante', () => {
  const en = '2026-10-01T14:32:00-03:00'
  const h = historialDeCeldas([
    fila({ id: 7, antes: null, despues: 1, en }), fila({ id: 8, antes: 1, despues: 2, en }),
  ], new Map())
  assert.deepEqual(h[claveDeCelda('obreros', P, 'porBanco')].entradas.map((e) => e.id), ['8', '7'])
})

test('las horas se escriben como horas, no como pesos', () => {
  const h = historialDeCeldas([fila({ id: 1, columna: 'horas_manual', despues: 80 })], new Map())
  assert.equal(h[claveDeCelda('obreros', P, 'horas')].entradas[0].despues, '80')
})

test('autor sin perfil legible se dice «sin identificar»; sin autor, «sin autor registrado»', () => {
  const h = historialDeCeldas([
    fila({ id: 1, despues: 1, autor: 'u-desconocido' }), fila({ id: 2, antes: 1, despues: 2, autor: null }),
  ], new Map())
  const q = h[claveDeCelda('obreros', P, 'porBanco')].entradas.map((e) => e.quien)
  assert.deepEqual(q, ['sin autor registrado', 'sin identificar'])
})

test('cada celda tiene su propio log: otra columna, otra persona o otro grupo no se mezclan', () => {
  const h = historialDeCeldas([
    fila({ id: 1, despues: 1 }), fila({ id: 2, columna: 'adelanto_manual', despues: 2 }),
    fila({ id: 3, grupo: 'oficina', despues: 3 }),
  ], new Map())
  assert.equal(Object.keys(h).length, 3)
})

test('una columna que la pantalla no conoce no rompe: se descarta', () => {
  const h = historialDeCeldas([fila({ id: 1, columna: 'cobra', despues: 1 })], new Map())
  assert.deepEqual(h, {})
})
