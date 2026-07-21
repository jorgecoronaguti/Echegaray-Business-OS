import test from 'node:test'
import assert from 'node:assert/strict'
import { TASAS, CARGO_VERIFICADO, tasaDiaria, interesDelPeriodo, costoConImpuestos, saldoPromedioImplicito, formulaInteresMes } from './costo-descubierto.mjs'

const c = CARGO_VERIFICADO
const casi = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`)

// LA PRUEBA QUE HACE CONFIABLE TODO EL ARCHIVO: el banco cobró el 14/07 y desglosó las tres líneas.
// Las alícuotas dan EXACTAS, así que el modelo no es una tasa copiada de una pantalla — reproduce
// lo que el banco cobró de verdad.
test('las alícuotas reproducen el cargo real del banco al centavo', () => {
  casi(c.interes * TASAS.iva, c.iva)
  casi(c.interes * TASAS.percepcion, c.percepcion)
  casi(costoConImpuestos(c.interes), c.total)
  casi(c.interes + c.iva + c.percepcion, c.total)
})

// Con 55% anual y 30 días, ese interés implica un saldo promedio en rojo de ~$5,58M. El extracto
// muestra la cuenta entre −$540.014 y −$12.095.024 en esos días: es del orden correcto.
test('el saldo promedio implícito es del orden que muestra el extracto', () => {
  const s = saldoPromedioImplicito(c.interes, c.dias)
  assert.ok(s > 5_000_000 && s < 6_500_000, `implícito ${s}`)
})

// Un saldo positivo NO genera interés. Devolver un número negativo acá sería un ingreso inventado.
test('la plata a favor no genera intereses', () => {
  assert.equal(interesDelPeriodo(5596330.74, 30), 0)
  assert.equal(interesDelPeriodo(0, 30), 0)
  assert.equal(interesDelPeriodo(-1000000, 0), 0)
})

test('el costo por día por millón es el número con el que se piensa un descubierto', () => {
  casi(interesDelPeriodo(-1_000_000, 1), 1506.85)
  casi(costoConImpuestos(interesDelPeriodo(-1_000_000, 1)), 1687.67)
  casi(tasaDiaria() * 365, TASAS.tna, 1e-9)
})

// El interés se factura con IVA: mostrar sólo el interés subestima la salida de caja un 12%.
test('lo que sale de la cuenta es el interés por 1,12', () => {
  casi(costoConImpuestos(100000), 112000)
})

// La fórmula del Sheet no puede referenciar el cierre del propio mes: el interés cambia el cierre y
// el cierre cambia el interés. Tiene que apoyarse en el saldo con el que ARRANCA el mes.
test('la fórmula usa el saldo inicial y no crea una referencia circular', () => {
  const f = formulaInteresMes('B39', 'B$3')
  assert.ok(f.includes('B39') && f.includes('DAY(EOMONTH(B$3;0))'))
  assert.ok(f.startsWith('=IF(N(B39)>=0;0;'), f)
  assert.ok(f.includes('0.55/365') && f.includes('1+0.105+0.015'))
})
