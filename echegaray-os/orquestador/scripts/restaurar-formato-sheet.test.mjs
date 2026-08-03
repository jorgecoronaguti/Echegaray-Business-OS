import test from 'node:test'
import assert from 'node:assert/strict'
import { calidad, esAcopio, formatoModalPorColumna, modoDe } from './restaurar-formato-sheet.mjs'

const fila = (n, rotulo, celdas = [{ col: 0, fmt: { textFormat: { bold: true } } }]) => ({ fila: n, rotulo, celdas })

test('la nota se mide contra las filas CON RÓTULO, no contra el total', () => {
  // EL DEFECTO REAL (02/08): medir contra el total daba "Compras 85%" y "CAJA 78%" y las salteaba,
  // cuando en verdad emparejaban 100% y 98%. Una fila en blanco o una fila de datos —donde la columna A
  // trae una fecha o el nombre de un proveedor— NO PUEDE emparejar por definición.
  const filas = [fila(1, 'Total'), fila(2, ''), fila(3, '   '), fila(4, 'Saldo')]
  const c = calidad([{}, {}], filas)
  assert.equal(c.conRotulo, 2)
  assert.equal(c.pct, 100, 'las 2 filas con rótulo emparejaron: es 100%, no 50%')
})

test('sin ninguna fila con rótulo la nota es 0 y no divide por cero', () => {
  assert.deepEqual(calidad([], [fila(1, ''), fila(2, '  ')]), { pct: 0, conRotulo: 0 })
})

test('el modo depende de si las filas se reconocen una a una', () => {
  assert.equal(modoDe(100), 'rotulo')
  assert.equal(modoDe(90), 'rotulo')
  assert.equal(modoDe(89), 'columna')
  assert.equal(modoDe(11), 'columna') // Proveedores: cuenta corriente rehecha, no hay fila que mapear
})

test('las pestañas de acopio de datos quedan afuera', () => {
  // Pedido explícito del dueño: "TODAS LAS PESTAÑAS QUE NO SON DE ACOPIO DE DATOS".
  for (const t of ['_BANCO_RAW', '_ARCA_RAW', '_J_OBREROS', '_F931_RAW']) assert.equal(esAcopio(t), true)
  for (const t of ['CAJA', 'Compras', 'Cash Flow Semanal']) assert.equal(esAcopio(t), false)
})

test('la moda por columna describe la columna, no una celda suelta', () => {
  const moneda = { numberFormat: { type: 'CURRENCY', pattern: '$#,##0' } }
  const texto = { numberFormat: { type: 'TEXT', pattern: '@' } }
  const filas = [
    fila(5, 'a', [{ col: 2, fmt: moneda }]), fila(6, 'b', [{ col: 2, fmt: moneda }]),
    fila(7, 'c', [{ col: 2, fmt: moneda }]), fila(8, 'd', [{ col: 2, fmt: texto }]),
  ]
  const m = formatoModalPorColumna(filas, 5)
  assert.equal(m.length, 1)
  assert.equal(m[0].col, 2)
  assert.deepEqual(m[0].fmt, moneda, 'gana el formato de las 3 filas, no el de la excepción')
})

test('una "moda" que aparece una o dos veces NO se aplica a la columna entera', () => {
  // Con dos ejemplos no se sabe si es el formato de la columna o una celda que él pintó a mano.
  const filas = [fila(5, 'a', [{ col: 1, fmt: { numberFormat: { type: 'DATE' } } }]),
    fila(6, 'b', [{ col: 1, fmt: { numberFormat: { type: 'DATE' } } }])]
  assert.deepEqual(formatoModalPorColumna(filas, 5), [])
})

test('el encabezado NO entra en la moda del cuerpo', () => {
  // El encabezado tiene su propio formato y va por posición; si entrara acá contaminaría la columna.
  const cab = { textFormat: { bold: true }, numberFormat: { type: 'TEXT', pattern: '@' } }
  const num = { numberFormat: { type: 'NUMBER', pattern: '#,##0' } }
  const filas = [fila(1, 'ENCABEZADO', [{ col: 0, fmt: cab }]),
    ...[5, 6, 7].map((n) => fila(n, 'x', [{ col: 0, fmt: num }]))]
  const m = formatoModalPorColumna(filas, 2)
  assert.deepEqual(m[0].fmt, num)
})

test('la moda ignora las filas por encima del corte aunque tengan más ejemplos', () => {
  const viejo = { numberFormat: { type: 'TEXT' } }
  const nuevo = { numberFormat: { type: 'CURRENCY' } }
  const filas = [...[1, 2, 3, 4].map((n) => fila(n, 'h', [{ col: 0, fmt: viejo }])),
    ...[5, 6, 7].map((n) => fila(n, 'b', [{ col: 0, fmt: nuevo }]))]
  assert.deepEqual(formatoModalPorColumna(filas, 5)[0].fmt, nuevo)
})
