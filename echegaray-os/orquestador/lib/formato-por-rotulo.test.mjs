import test from 'node:test'
import assert from 'node:assert/strict'
import { emparejarPorRotulo, norm } from './formato-por-rotulo.mjs'

const fila = (n, rotulo) => ({ fila: n, rotulo, celdas: [{ col: 0, fmt: { textFormat: { bold: true } } }] })

test('empareja por rótulo aunque la fila se haya movido', () => {
  // EL CASO REAL: "Caja en pesos" estaba en la fila 6 de su versión y hoy está en la 10.
  const { pares } = emparejarPorRotulo(
    [fila(6, 'Caja en pesos'), fila(7, 'Caja en dólares')],
    ['Posición de caja', '', '', '', '', '', '', '', 'Cuenta', 'Caja en pesos', 'Caja en dólares'])
  assert.deepEqual(pares.map((p) => [p.filaOrigen, p.filaDestino]), [[6, 10], [7, 11]])
})

test('un rótulo que ya no existe NO se aplica a ninguna fila', () => {
  // Fondo fijo se retiró del cuadro. Su formato no puede caer sobre la fila que ocupó su lugar.
  const { pares, sinDestino } = emparejarPorRotulo(
    [fila(8, 'Fondo fijo'), fila(9, 'Santander · cta cte ARS')],
    ['Santander · cta cte ARS'])
  assert.equal(sinDestino.length, 1)
  assert.equal(sinDestino[0].rotulo, 'Fondo fijo')
  assert.deepEqual(pares.map((p) => p.filaDestino), [1])
})

test('los rótulos repetidos se consumen EN ORDEN y no se pisan', () => {
  const { pares } = emparejarPorRotulo(
    [fila(2, 'Total'), fila(5, 'Total'), fila(9, 'Total')],
    ['Total', 'x', 'Total', 'y', 'Total'])
  assert.deepEqual(pares.map((p) => p.filaDestino), [1, 3, 5])
})

test('el cursor impide que el formato salte hacia atrás y cruce de bloque', () => {
  // Dos bloques con el mismo sub-rótulo. Sin cursor, la fila 20 del origen podía llevarse el
  // destino 2 —que está ARRIBA del que ya tomó la fila 10— y el formato viajaba al bloque de al lado.
  const { pares } = emparejarPorRotulo(
    [fila(10, 'Subtotal'), fila(20, 'Subtotal')],
    ['Subtotal', 'a', 'b', 'Subtotal'])
  assert.deepEqual(pares.map((p) => p.filaDestino), [1, 4])
})

test('las filas nuevas de hoy se informan y conservan su formato', () => {
  const { sinOrigen } = emparejarPorRotulo([fila(1, 'A')], ['A', 'B nueva', 'C nueva'])
  assert.deepEqual(sinOrigen, [2, 3])
})

test('las filas en blanco no emparejan con nada: no tienen ancla', () => {
  // Una fila vacía no se puede identificar, y emparejarlas "en orden" sería volver a anclar en la
  // posición por la puerta de atrás.
  const { pares, sinDestino } = emparejarPorRotulo([fila(3, '   '), fila(4, 'Cuenta')], ['', '', 'Cuenta'])
  assert.equal(pares.length, 1)
  assert.equal(pares[0].filaDestino, 3)
  assert.equal(sinDestino.length, 1)
})

test('normaliza espacios y mayúsculas, que es como difieren los rótulos entre versiones', () => {
  assert.equal(norm('  Caja   en  PESOS '), 'caja en pesos')
  const { pares } = emparejarPorRotulo([fila(1, 'Caja  en Pesos')], ['CAJA EN PESOS'])
  assert.equal(pares.length, 1)
})
