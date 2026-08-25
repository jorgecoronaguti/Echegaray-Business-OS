import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EVALUADORES, VEREDICTO, esqueletoDeFormula, mismoValor, veredictoDeCelda,
} from './formulas-compras.mjs'

// La medición del 25/08/2026 sobre `Compras!A4:AN905`. Si el dueño cambia una de estas fórmulas en
// el Sheet, el script que repara lo detecta comparando esqueletos y aborta; este test congela el
// lado JS de esa comparación para que la réplica no se mueva sola.
test('el esqueleto ignora la fila y el formato, no la referencia', () => {
  assert.equal(esqueletoDeFormula('=T900-O900'), '=T-O')
  assert.equal(esqueletoDeFormula('=T4-O4'), '=T-O')
  assert.equal(esqueletoDeFormula('= T900 - O900 '), '=T-O')
  assert.equal(esqueletoDeFormula('=IF(F900="pago";C900;"Pendiente")'), '=IF(F="PAGO";C;"PENDIENTE")')
  // Una columna distinta NO colapsa al mismo esqueleto: si colapsara, el guard no serviría de nada.
  assert.notEqual(esqueletoDeFormula('=T900-O900'), esqueletoDeFormula('=T900-N900'))
})

test('la fórmula de la fila 900 del Sheet vivo coincide con la réplica', () => {
  // Copiadas textualmente de la lectura con `valueRenderOption=FORMULA` del 25/08/2026.
  assert.equal(esqueletoDeFormula('=IF(F900="pago";C900;"Pendiente")'), esqueletoDeFormula(EVALUADORES.Q.formula))
  assert.equal(esqueletoDeFormula('=Q900'), esqueletoDeFormula(EVALUADORES.R.formula))
  assert.equal(esqueletoDeFormula('=T900-O900'), esqueletoDeFormula(EVALUADORES.U.formula))
})

test('U es el saldo: cero cuando está pagada, el total en negativo cuando no', () => {
  assert.equal(EVALUADORES.U.evaluar({ T: 304515.98, O: 304515.98 }), 0)
  assert.equal(EVALUADORES.U.evaluar({ T: 0, O: 304515.98 }), -304515.98)
  // Una celda de texto vale 0, igual que `N()` en el Sheet — no NaN, que envenenaría la comparación.
  assert.equal(EVALUADORES.U.evaluar({ T: 'Pendiente', O: 4300 }), -4300)
  assert.equal(EVALUADORES.U.evaluar({}), 0)
})

test('Q devuelve la fecha sólo cuando la modalidad es pago', () => {
  assert.equal(EVALUADORES.Q.evaluar({ F: 'pago', C: 46264 }), 46264)
  assert.equal(EVALUADORES.Q.evaluar({ F: 'Pago', C: 46264 }), 46264, 'el IF del Sheet no distingue mayúsculas')
  assert.equal(EVALUADORES.Q.evaluar({ F: 'credito', C: 46264 }), 'Pendiente')
})

test('mismoValor tolera el medio centavo y NO cruza tipos', () => {
  assert.ok(mismoValor(304515.98, 304515.981))
  assert.ok(!mismoValor(136000, -136000), 'el signo invertido de la fila 842 no puede pasar por igual')
  assert.ok(mismoValor('Pendiente', 'pendiente'))
  assert.ok(!mismoValor(0, 'Pendiente'), 'un texto no es el número cero')
})

test('una celda que ya es fórmula no se toca', () => {
  assert.equal(veredictoDeCelda('U', '=T900-O900', {}).veredicto, VEREDICTO.YA_ES_FORMULA)
})

test('el valor pegado que la fórmula reproduce es no-op', () => {
  // Fila pagada: U pegada en 0 y la fórmula también da 0. Restaurar no mueve un peso.
  const v = veredictoDeCelda('U', 0, { T: 4300, O: 4300, U: 0 })
  assert.equal(v.veredicto, VEREDICTO.NO_OP)
})

test('el valor pegado que la fórmula NO reproduce es dato humano y se declara con los dos números', () => {
  // La fila 892 real: impaga, U pegada en 0, la fórmula da −304.515,98.
  const v = veredictoDeCelda('U', 0, { T: 0, O: 304515.98, U: 0 })
  assert.equal(v.veredicto, VEREDICTO.DATO_HUMANO)
  assert.equal(v.actual, 0)
  assert.equal(v.esperado, -304515.98)
})

test('la fila 842 —el parcial con el signo invertido— NO se repara sola', () => {
  const v = veredictoDeCelda('U', 136000, { T: 0, O: 136000, U: 136000 })
  assert.equal(v.veredicto, VEREDICTO.DATO_HUMANO)
})

test('una columna sin evaluador nunca se repara, aunque sea fórmula por fila', () => {
  // T y X son fórmula por fila Y el cargador las pisa por diseño. Sin evaluador declarado, el
  // veredicto no puede ser NO_OP jamás: el script no tiene con qué decidir y no decide.
  for (const letra of ['T', 'X', 'AG', 'AH', 'AI', 'D', 'O', 'Z', 'A']) {
    assert.equal(veredictoDeCelda(letra, 1234, { [letra]: 1234 }).veredicto, VEREDICTO.SIN_EVALUADOR, letra)
  }
})

test('la celda vacía no es un valor pegado', () => {
  assert.equal(veredictoDeCelda('U', '', {}).veredicto, VEREDICTO.VACIA)
  assert.equal(veredictoDeCelda('U', null, {}).veredicto, VEREDICTO.VACIA)
})
