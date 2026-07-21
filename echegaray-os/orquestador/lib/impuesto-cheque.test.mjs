import test from 'node:test'
import assert from 'node:assert/strict'
import { ALICUOTA, VERIFICACION, impuestoDeMovimiento, precision, formulaImpuesto } from './impuesto-cheque.mjs'

// LA PRUEBA: el extracto del 04 al 21/07 tiene 10 cargos de "Impuesto Ley 25.413" por $342.410,27,
// y en esos días la cuenta movió $25.737.224 de débitos y $31.873.568 de créditos. El 0,6% de cada
// lado da $345.665. La alícuota no se copió de una pantalla: la reproduce el extracto.
test('el modelo reproduce el cargo real con 99% de precisión', () => {
  assert.ok(precision() > 0.98, `precisión ${precision()}`)
  assert.equal(Math.round(impuestoDeMovimiento(VERIFICACION.creditos, VERIFICACION.debitos)), 345665)
})

// Se cobra sobre los DOS lados: un peso que entra y sale paga 1,2%.
test('cobra los dos lados del movimiento', () => {
  assert.equal(impuestoDeMovimiento(1000000, 0), 6000)
  assert.equal(impuestoDeMovimiento(0, 1000000), 6000)
  assert.equal(impuestoDeMovimiento(1000000, 1000000), 12000)
  assert.equal(ALICUOTA, 0.006)
})

// Un egreso no puede calcularse sobre el total de egresos que lo incluye: el Sheet devolvería una
// referencia circular. Por eso recibe la lista de filas explícita, sin la suya.
test('la fórmula suma filas explícitas y nunca el total', () => {
  const f = formulaImpuesto('H', [7, 8], [11, 12])
  assert.equal(f, '=(H7+H8+H11+H12)*0.006')
  assert.ok(!/SUM\(/.test(f))
  assert.equal(formulaImpuesto('B', [], []), '=(0+0)*0.006')
})
