// CADA FILA DEL RESUMEN DE PLATA TIENE QUE SUMAR MIRÁNDOLA. Se monta con líneas reales de `pagoDeLaLinea` donde
// hay compensación entre canales y alguien que cobró de más; si `conciliarPlata` deja de explicar la diferencia,
// una fila no cierra y este test se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pagoDeLaLinea } from '../../../services/pagoDeLaQuincena.ts'
import { conciliarPlata } from './conciliacionDePlata.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100
const L = (banco: number | null, negro: number | null, pagadoBanco: number, pagadoEfectivo: number) =>
  pagoDeLaLinea({ banco, negro, pagadoBanco, pagadoEfectivo })

const PAGOS = [
  L(1000, 500, 0, 0),          // nada pagado
  L(1000, 500, 0, 700),        // efectivo de más: 200 se descuentan del banco
  L(800, 300, 900, 0),         // banco de más: 100 se descuentan del efectivo
  L(400, 100, 300, 600),       // cobró de más EN TOTAL (400: debe 500, cobró 900): no descuenta de nadie
  L(600, null, 0, 50),         // sin negro: sin saldo, no entra
]

test('BANCO Y EFECTIVO CIERRAN: total − pagado − descontado + sobrepasado = saldo', () => {
  const c = conciliarPlata(PAGOS)
  for (const [n, f] of [['banco', c.banco], ['efectivo', c.efectivo]] as const) {
    assert.equal(r2(f.total - f.pagado - f.descontado + f.sobrepasado), f.saldo, `la fila ${n} cierra`)
  }
  assert.ok(c.banco.descontado > 0 && c.efectivo.descontado > 0 && c.banco.sobrepasado + c.efectivo.sobrepasado > 0, 'el caso tiene compensación y exceso')
})

test('EL TOTAL CIERRA CON EL MISMO UNIVERSO Y «A PAGAR» = SALDO + LO COBRADO DE MÁS', () => {
  const c = conciliarPlata(PAGOS)
  assert.equal(r2(c.total.total - c.total.pagado), c.total.saldo)
  assert.equal(r2(c.aPagarBanco + c.aPagarEfectivo), r2(c.total.saldo + c.cobraronDeMas.importe))
  assert.deepEqual(c.cobraronDeMas, { personas: 1, importe: 400 })
  assert.equal(c.sinSaldo, 1)
  // El pagado de la fila sin saldo NO está en el universo: Pagado banco + efectivo = Pagado total.
  assert.equal(r2(c.banco.pagado + c.efectivo.pagado), c.total.pagado)
})
