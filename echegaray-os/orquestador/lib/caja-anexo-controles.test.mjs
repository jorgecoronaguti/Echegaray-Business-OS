import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueLiquidez } from './caja-anexo-controles.mjs'

// Helper mínimo: imita el `h` que el anexo espera (push devuelve el nº de fila 1-indexado).
function armarH() {
  const rows = []
  return {
    rows,
    refs: { cab: 'CF_MESES', cierre: 'CF_SALDO_CIERRE', inicio: 'CF_SALDO_INICIO' },
    get n() { return rows.length },
    push(r) { rows.push(r); return rows.length },
  }
}

test('«primer mes bajo mínima / negativo» sólo mira de hoy en adelante', () => {
  const h = armarH()
  bloqueLiquidez(h)
  const bajoMin = h.rows.find((r) => String(r[0]).includes('Primer mes por debajo'))
  const negativa = h.rows.find((r) => String(r[0]).includes('Primer mes con caja negativa'))
  assert.ok(bajoMin && negativa, 'existen las dos filas de primer mes')
  const fBajo = bajoMin[bajoMin.length - 1]
  const fNeg = negativa[negativa.length - 1]
  const guarda = /EOMONTH\(CF_MESES;0\)>=EOMONTH\(CAJA_FECHA_SALDO;0\)/
  // el bug era escanear el año entero desde enero y agarrar un mes que ya pasó
  assert.match(fBajo, guarda, 'primer mes bajo mínima filtra por mes del corte en adelante')
  assert.match(fNeg, guarda, 'primer mes negativo filtra por mes del corte en adelante')
  // un paréntesis de más da #ERROR! en la celda: exigir balance
  const balance = (f) => [...f].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0)
  assert.equal(balance(fBajo), 0, 'paréntesis balanceados en primer mes bajo mínima')
  assert.equal(balance(fNeg), 0, 'paréntesis balanceados en primer mes negativo')
})

test('«efectivo/banco proyectado» parten los flujos del mes por instrumento de _MOVIMIENTOS', () => {
  const h = armarH()
  bloqueLiquidez(h)
  const ef = h.rows.find((r) => String(r[0]).includes('Saldo en efectivo proyectado'))
  const bc = h.rows.find((r) => String(r[0]).includes('Dinero en banco proyectado'))
  const ctrl = h.rows.find((r) => String(r[0]).includes('efectivo + banco = cierre'))
  assert.ok(ef && bc && ctrl, 'existen las dos líneas y su control')
  const fEf = ef[4] // columna E
  const fBc = bc[4]
  // salen de _MOVIMIENTOS, no del Cash Flow directo
  assert.match(fEf, /_MOVIMIENTOS/, 'efectivo lee _MOVIMIENTOS')
  assert.match(fBc, /_MOVIMIENTOS/, 'banco lee _MOVIMIENTOS')
  // la regla del dueño: Jornales sin instrumento cae a efectivo
  assert.match(fEf, /Jornales por Quincena/, 'la clasificación mira el origen Jornales')
  // el instrumento efectivo tiene que aparecer en la clasificación
  assert.match(fEf, /I\$2:\$I="efectivo"/, 'clasifica por instrumento efectivo')
  // no se cuentan movimientos ya REALizados (están en el saldo de hoy)
  assert.match(fEf, /<>"REAL"/, 'excluye los movimientos ya reales')
  // paréntesis balanceados en las tres fórmulas
  const balance = (f) => [...String(f)].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0)
  assert.equal(balance(fEf), 0, 'paréntesis balanceados en efectivo proyectado')
  assert.equal(balance(fBc), 0, 'paréntesis balanceados en banco proyectado')
  assert.equal(balance(ctrl[4]), 0, 'paréntesis balanceados en el control (col E)')
  assert.equal(balance(ctrl[6]), 0, 'paréntesis balanceados en el control (col G)')
})
