// LAS DOS DECISIONES DE LA PESTAÑA DE JORNALES QUE NO PUEDEN ESTAR MAL.
//
// Las dos contestan la pregunta del dueño: "¿jornales se actualiza a medida que la quincena va
// pasando? ¿lo que dice proyecciones se reemplaza?". La respuesta era NO, y el síntoma era que la
// quincena del 16/07–31/07 estaba contada dos veces: pagada por $9.521.258 y además proyectada por
// $7.415.024. Un error que no da error.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ultimoDiaCargado, ultimoDiaConHoras, quincenasPendientes } from '../scripts/jornales-pestana.mjs'

const d = (dia, mes) => new Date(2026, mes - 1, dia)

test('el último día cargado es el MÁXIMO, no la última celda', () => {
  // Las fechas del bloque vienen desordenadas y con huecos (feriados, días sin cuadrilla): tomar
  // "la última con dato" rotula mal la quincena y corre la proyección un tramo entero.
  assert.deepEqual(ultimoDiaCargado(['16/7', '17/7', '18/7', '6/7']), d(18, 7))
  assert.deepEqual(ultimoDiaCargado(['1/8', '', '15/8', '', '3/8']), d(15, 8))
})

test('sin fechas no se inventa un día', () => {
  assert.equal(ultimoDiaCargado([]), null)
  assert.equal(ultimoDiaCargado(['total', 'UOCRA', '']), null)
})

test('LA PROYECCIÓN NO REPITE UNA QUINCENA YA PAGADA', () => {
  // Último día pagado 31/07 → la proyección arranca el 01/08. Antes arrancaba en el DESDE de la
  // última quincena real (16/07) y volvía a proyectar lo que ya estaba pagado.
  const q = quincenasPendientes(d(1, 8))
  assert.deepEqual(q[0].desde, d(1, 8))
  assert.deepEqual(q[0].hasta, d(15, 8))
  assert.deepEqual(q[1].desde, d(16, 8))
  assert.deepEqual(q[1].hasta, d(31, 8), 'la segunda quincena de agosto cierra el 31')
})

test('una quincena que arranca a mitad de tramo se proyecta sólo por los días que faltan', () => {
  // Si lo pagado llega hasta el 20/08, lo que falta de ese tramo es 21/08–31/08. Proyectar el tramo
  // entero contaría de nuevo los días ya pagados.
  const q = quincenasPendientes(d(21, 8))
  assert.deepEqual(q[0].desde, d(21, 8))
  assert.deepEqual(q[0].hasta, d(31, 8))
})

test('febrero cierra el 28 y la proyección llega hasta fin de año, sin pasarse', () => {
  const q = quincenasPendientes(d(16, 2))
  assert.deepEqual(q[0].hasta, d(28, 2))
  const ultima = q[q.length - 1]
  assert.deepEqual(ultima.hasta, d(31, 12))
  assert.ok(q.every((x) => x.hasta <= d(31, 12)), 'ninguna quincena se pasa del año')
})

test('sin fecha de arranque no hay proyección: no se proyecta sobre nada', () => {
  assert.deepEqual(quincenasPendientes(null), [])
})

test('la quincena en curso se reconoce por sus HORAS, no por sus fechas', () => {
  // La planilla escribe las catorce fechas el día que abre la quincena, así que el encabezado dice
  // "31/07" desde el primer día. Lo único que distingue una quincena en curso de una cerrada es
  // hasta dónde hay horas cargadas — que es lo que el dueño vio y el cuadro no decía.
  const grid = []
  // fila 1 (índice 0) = fechas; columnas F..U son los índices 5..20
  grid[0] = []
  ;['16/7', '17/7', '18/7', '20/7', '21/7', '22/7', '23/7'].forEach((f, i) => { grid[0][5 + i] = f })
  // dos personas, con horas sólo en los tres primeros días
  grid[1] = []; grid[2] = []
  for (let i = 0; i < 3; i++) { grid[1][5 + i] = 8; grid[2][5 + i] = 8 }
  const bloque = { inicio: 2, fin: 3, filaFecha: 1 }
  assert.deepEqual(ultimoDiaConHoras(grid, bloque), new Date(2026, 6, 18))
  // …mientras que el encabezado, solo, diría el 23.
  assert.deepEqual(ultimoDiaCargado(grid[0]), new Date(2026, 6, 23))
})

test('un día con la columna presente pero sin horas no cuenta como trabajado', () => {
  const grid = [[], [], []]
  grid[0][5] = '16/7'; grid[0][6] = '17/7'
  grid[1][5] = 8; grid[2][5] = 8
  grid[1][6] = 0; grid[2][6] = ''
  assert.deepEqual(ultimoDiaConHoras(grid, { inicio: 2, fin: 3, filaFecha: 1 }), new Date(2026, 6, 16))
})

test('un bloque sin ninguna hora cargada no inventa un día', () => {
  const grid = [[], []]
  grid[0][5] = '16/7'
  assert.equal(ultimoDiaConHoras(grid, { inicio: 2, fin: 2, filaFecha: 1 }), null)
})
