import test from 'node:test'
import assert from 'node:assert/strict'
import { formatoPara, pedidosDeFormato, esUSD, PATRON_USD } from './cobranzas-formato-moneda.mjs'

// El patrón que tienen hoy K:N de Cobranzas (leído del archivo el 24/09/2026) y el de «Monto ponderado».
const PESOS = '"$ "#,##0.00;[RED]"($ "#,##0.00\\);\\-'
const PESOS_X = '"$ "#,##0;[RED]"($ "#,##0\\);\\-'
const USD = '"U$S "#,##0.00;[RED]"(U$S "#,##0.00\\);\\-'

test('una fila en dólares cambia SÓLO el prefijo: decimales, rojo y guion del dueño se conservan', () => {
  assert.deepEqual(formatoPara({ type: 'CURRENCY', pattern: PESOS }, true), { type: 'NUMBER', pattern: USD })
  assert.deepEqual(formatoPara({ type: 'CURRENCY', pattern: PESOS_X }, true),
    { type: 'NUMBER', pattern: '"U$S "#,##0;[RED]"(U$S "#,##0\\);\\-' })
  assert.equal(formatoPara({ type: 'NUMBER', pattern: USD }, true), null, 'ya está en dólares: no se toca')
  assert.deepEqual(formatoPara(null, true), { type: 'NUMBER', pattern: PATRON_USD }, 'sin patrón propio, el de la casa')
})

test('una fila que deja de decir USD vuelve a pesos por la misma regla, y una en pesos no se toca', () => {
  assert.deepEqual(formatoPara({ type: 'NUMBER', pattern: USD }, false), { type: 'CURRENCY', pattern: PESOS })
  assert.equal(formatoPara({ type: 'CURRENCY', pattern: PESOS }, false), null)
  assert.equal(formatoPara(null, false), null, 'una celda en pesos sin formato no es asunto de este control')
})

test('el criterio de dólares es el de las fórmulas: «USD», sin distinguir mayúsculas; un 0 o vacío es pesos', () => {
  assert.equal(esUSD('USD'), true)
  assert.equal(esUSD('usd'), true)
  assert.equal(esUSD(''), false)
  assert.equal(esUSD(0), false, 'las filas 39 y 40 del archivo tienen un 0 en Moneda')
  assert.equal(esUSD('U$S'), false, 'si el formato dijera dólares y la suma contara pesos, se contradirían')
})

test('los pedidos son updateCells de UNA celda —repeatCell saltea las filas que el filtro oculta—', () => {
  // Filas 62 (USD) y 63 (pesos) · importes en K, L, M, N (10..13) y X (23), leídos desde K (10).
  const fmt = (p) => ({ formato: { numberFormat: { type: 'CURRENCY', pattern: p } } })
  const filaFmt = (p, px) => Array.from({ length: 14 }, (_, j) => (j === 13 ? fmt(px) : fmt(p)))
  const { pedidos, celdas } = pedidosDeFormato({
    monedas: [['USD'], ['']],
    formatos: [filaFmt(PESOS, PESOS_X), filaFmt(PESOS, PESOS_X)],
    sheetId: 581848348, desde: 62, colInicio: 10, columnas: [10, 11, 12, 13, 23],
  })
  assert.deepEqual(celdas.map((c) => `${c.col}:${c.fila}`), ['10:62', '11:62', '12:62', '13:62', '23:62'], 'sólo la fila en dólares')
  assert.ok(pedidos.every((p) => p.updateCells && !p.repeatCell), 'ningún repeatCell')
  const k62 = pedidos[0].updateCells
  assert.deepEqual(k62.range, { sheetId: 581848348, startRowIndex: 61, endRowIndex: 62, startColumnIndex: 10, endColumnIndex: 11 })
  assert.equal(k62.fields, 'userEnteredFormat.numberFormat', 'sólo el formato numérico: ni valor, ni color, ni fuente')
  assert.equal(k62.rows[0].values[0].userEnteredValue, undefined, 'no escribe ningún valor')
})
