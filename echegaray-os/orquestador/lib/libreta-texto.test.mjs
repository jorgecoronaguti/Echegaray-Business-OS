// La libreta escrita en el chat (22/09/2026). Los casos salen de la FOTO de la libreta del dueño: son sus
// líneas, con su letra y sus abreviaturas. Lo que se prueba es que no invente un monto ni una fecha.
import test from 'node:test'
import assert from 'node:assert/strict'
import { claveDeLinea, interpretarLibreta, interpretarLinea, leerConcepto, leerFecha, leerMonto } from './libreta-texto.mjs'

const HOY = new Date('2026-09-22T12:00:00Z')

test('las ocho líneas de la libreta del 18 y 19 de septiembre', () => {
  const hoja = [
    'P. TELLO (18/9) 2.640.000',
    'P. FREDES (18/9) 1.040.000',
    'ROXANA (18/9) 340.000',
    'Sereno (18/9) 742.000',
    'Flete 4? 19/9 60.000',
    'Rep t.los/stereo 19/9 325.000',
    'Camb EEA885 8.000',
  ].join('\n')
  const r = interpretarLibreta(hoja, HOY)
  assert.deepEqual(r.map((x) => x.estado), Array(7).fill('listo'))
  assert.deepEqual(r.map((x) => x.monto), [2640000, 1040000, 340000, 742000, 60000, 325000, 8000])
  assert.deepEqual(r.map((x) => x.fecha), [
    '2026-09-18', '2026-09-18', '2026-09-18', '2026-09-18', '2026-09-19', '2026-09-19', '2026-09-22',
  ])
  assert.equal(r[0].concepto, 'P TELLO')
  assert.equal(r[6].concepto, 'Camb EEA885', 'la patente es parte del concepto, no un monto')
})

test('los jornales NO entran por acá: van por Liquidación (decisión del dueño)', () => {
  assert.equal(interpretarLinea('Jornales sabado 19/9 374.000', HOY).estado, 'jornales')
  assert.equal(interpretarLinea('quincena 1.200.000', HOY).estado, 'jornales')
})

test('sin fecha, la línea es de hoy; con fecha sin año, del año en curso', () => {
  assert.equal(interpretarLinea('Flete 60.000', HOY).fecha, '2026-09-22')
  assert.equal(leerFecha('flete 19/9', HOY), '2026-09-19')
  assert.equal(leerFecha('flete 3 de marzo', HOY), '2026-03-03')
  // Una fecha de diciembre anotada en enero es del año pasado, no del futuro.
  assert.equal(leerFecha('pago 28/12', new Date('2027-01-05T12:00:00Z')), '2026-12-28')
  assert.equal(leerFecha('sin fecha acá', HOY), null)
})

test('dos montos posibles no se adivinan, y la fecha nunca se confunde con plata', () => {
  assert.equal(leerMonto('pago 18/9 2.640.000'), 2640000)
  assert.equal(interpretarLinea('materiales 50.000 y 30.000', HOY).falta, 'monto')
  assert.equal(interpretarLinea('P. Tello 18/9', HOY).falta, 'monto', 'sin monto no se registra')
})

test('el concepto es lo que escribió la persona, sin la fecha ni el monto', () => {
  assert.equal(leerConcepto('Rep t.los/stereo 19/9 325.000'), 'Rep t los/stereo')
  assert.equal(leerConcepto('19/9 325.000'), null)
  assert.equal(interpretarLinea('19/9 325.000', HOY).falta, 'concepto')
})

test('un mensaje que no es una línea de libreta no se toca', () => {
  assert.equal(interpretarLinea('hola, alguna novedad?', HOY).estado, 'nada')
  assert.equal(interpretarLinea('', HOY).estado, 'nada')
})

test('la línea tiene identidad propia: la misma anotada dos veces no se carga dos veces', () => {
  const a = claveDeLinea(interpretarLinea('P. TELLO (18/9) 2.640.000', HOY))
  const b = claveDeLinea(interpretarLinea('p tello 18/9 2640000', HOY))
  assert.equal(a, b, 'la misma línea escrita distinto es la misma línea')
  assert.equal(a, 'l:2026-09-18|p-tello|264000000')
  // Distinto monto, distinta fecha o distinto concepto: otra línea.
  assert.notEqual(a, claveDeLinea(interpretarLinea('P. TELLO (18/9) 2.640.001', HOY)))
  assert.notEqual(a, claveDeLinea(interpretarLinea('P. TELLO (19/9) 2.640.000', HOY)))
  assert.notEqual(a, claveDeLinea(interpretarLinea('P. FREDES (18/9) 2.640.000', HOY)))
  assert.equal(claveDeLinea({ fecha: '2026-09-18', concepto: 'x', monto: 0 }), null)
})
