import test from 'node:test'
import assert from 'node:assert/strict'
import { repartirDeuda, saldosPorProveedor, ESTADO_DEUDA, MODALIDADES } from './cuentas-por-pagar.mjs'

const hoy = new Date(2026, 6, 21)
const d = (y, m, dd) => new Date(y, m - 1, dd)

// EL ERROR QUE HABÍA QUE EVITAR: sumar todas las compras en cuenta corriente daría $71.028.598 de
// deuda cuando la real es $16.447.674. La modalidad dice cómo se PACTÓ la compra, no si hoy se debe:
// de las 212 compras en cuenta corriente, 209 ya están pagadas.
test('una compra en cuenta corriente ya pagada no es deuda', () => {
  const r = repartirDeuda([
    { estado: 'Pagado', modalidad: MODALIDADES.cuentaCorriente, total: 5000000, fechaCaja: d(2026, 5, 1) },
    { estado: ESTADO_DEUDA, modalidad: MODALIDADES.cuentaCorriente, total: 900000, fechaCaja: d(2026, 6, 25) },
  ], hoy)
  assert.equal(r.total, 900000)
  assert.equal(r.pagado, 5000000)
})

// "Proyectado" es un gasto previsto SIN factura. Contarlo como deuda multiplicaría la cifra por diez
// ($148.124.244 contra $16.447.674). Una deuda necesita una factura.
test('un gasto proyectado no es una deuda', () => {
  const r = repartirDeuda([{ estado: 'Proyectado', modalidad: MODALIDADES.contado, total: 148000000, fechaCaja: d(2026, 11, 1) }], hoy)
  assert.equal(r.total, 0)
  assert.equal(r.proyectado, 148000000)
})

// La modalidad no genera la deuda pero cambia cómo se lee: un "Pago" impago es un ATRASO.
test('separa el plazo pactado del atraso', () => {
  const r = repartirDeuda([
    { estado: ESTADO_DEUDA, modalidad: MODALIDADES.cuentaCorriente, total: 946981, fechaCaja: d(2026, 6, 25) },
    { estado: ESTADO_DEUDA, modalidad: MODALIDADES.contado, total: 700000, fechaCaja: d(2026, 3, 27) },
  ], hoy)
  assert.equal(r.cuentaCorriente, 946981)
  assert.equal(r.contado, 700000)
  assert.equal(r.vencida, 1646981)
  assert.equal(r.aVencer, 0)
})

// Sin fecha no se puede decir si venció, y tampoco entra a ninguna semana del cash flow. Se cuenta
// aparte en vez de meterla en "todavía no vence", que sería una tranquilidad falsa.
test('lo que no tiene fecha no se declara al día', () => {
  const r = repartirDeuda([
    { estado: ESTADO_DEUDA, modalidad: MODALIDADES.cuentaCorriente, total: 1039055, fechaCaja: null },
    { estado: ESTADO_DEUDA, modalidad: MODALIDADES.cuentaCorriente, total: 2494876, fechaCaja: d(2026, 8, 16) },
  ], hoy)
  assert.equal(r.sinFecha, 1039055)
  assert.equal(r.aVencer, 2494876)
  assert.equal(r.vencida, 0)
})

test('los saldos se agrupan por proveedor y ordenan por lo que más se debe', () => {
  const filas = [
    { proveedor: 'ARCA', estado: ESTADO_DEUDA, total: 2494876, fechaCaja: d(2026, 8, 16) },
    { proveedor: 'ARCA', estado: ESTADO_DEUDA, total: 2494876, fechaCaja: d(2026, 9, 16) },
    { proveedor: 'Hormiserv', estado: ESTADO_DEUDA, total: 3640067, fechaCaja: d(2026, 6, 5) },
    { proveedor: 'Pagado SA', estado: 'Pagado', total: 99999999, fechaCaja: d(2026, 1, 1) },
  ]
  const s = saldosPorProveedor(filas, hoy)
  assert.deepEqual(s.map((x) => x.proveedor), ['ARCA', 'Hormiserv'])
  assert.equal(s[0].facturas, 2)
  assert.equal(s[0].total, 4989752)
})
