import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaEgresoDiario, egresoMensualArray, FILAS_EGRESO, DIAS_MES } from './egreso-diario.mjs'

const COMPRAS90 = 'SUMIFS(Compras!$O$4:$O;Compras!$AD$4:$AD;">="&TODAY()-90;Compras!$AD$4:$AD;"<="&TODAY())'

test('suma las SEIS categorías de egreso, no sólo proveedores', () => {
  const a = egresoMensualArray()
  for (const f of FILAS_EGRESO) {
    assert.match(a, new RegExp(`\\$${f}\\b`), `falta la fila ${f}`)
  }
})

test('el ritmo sale del cash flow, no sólo de Compras', () => {
  const f = formulaEgresoDiario(COMPRAS90)
  // El nombre de hoja con espacios VA entre comillas simples, o Sheets no lo parsea (#ERROR!).
  assert.match(f, /'Cash Flow Mensual'!/)
})

test('promedia sólo los meses CERRADOS, no el mes en curso', () => {
  const f = formulaEgresoDiario(COMPRAS90)
  // Un mes cerrado es anterior al primer día del mes en curso.
  assert.match(f, /<DATE\(YEAR\(TODAY\(\)\);MONTH\(TODAY\(\)\);1\)/)
})

test('cae a Compras/90 cuando todavía no hay ningún mes cerrado', () => {
  // Enero, o un archivo recién arrancado: sin meses cerrados, un cero daría "días de caja" infinito.
  const f = formulaEgresoDiario(COMPRAS90)
  assert.ok(f.includes(`${COMPRAS90}/90`), 'tiene que traer el fallback a Compras')
  assert.match(f, /IF\(SUMPRODUCT.*?=0;/)
})

test('divide el egreso mensual por los días del mes, en es-AR', () => {
  const f = formulaEgresoDiario(COMPRAS90)
  // La coma decimal, no el punto: un "30.44" se leería como dos argumentos.
  assert.match(f, new RegExp(`/${String(DIAS_MES).replace('.', ',')}`))
  // No hay comas decimales sueltas fuera de literales que rompan la fórmula.
  const sinLit = f.replace(/"(?:[^"]|"")*"/g, '""')
  assert.ok(!/\d\.\d/.test(sinLit), 'un punto decimal rompe la fórmula en es-AR')
})

test('todo el cálculo está envuelto en IFERROR: nunca deja #DIV/0 a la vista', () => {
  assert.ok(formulaEgresoDiario(COMPRAS90).startsWith('IFERROR('))
})
