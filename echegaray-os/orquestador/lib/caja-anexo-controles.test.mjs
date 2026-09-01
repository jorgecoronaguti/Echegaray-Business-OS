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
