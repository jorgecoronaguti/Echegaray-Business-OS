import assert from 'node:assert/strict'
import { mapearFormulas, esError, colLetra } from './sheet-formulas.mjs'

assert.equal(colLetra(0), 'A')
assert.equal(colLetra(12), 'M')
assert.equal(colLetra(26), 'AA')
assert.ok(esError('#REF!') && esError('#N/A') && esError('#¡VALOR!'))
assert.ok(!esError('$1.234') && !esError('') && !esError('REF'))

// El caso real: RESUMEN!C3 mostraba "#REF!" y no se podía saber por qué. Con la fórmula, sí:
// apuntaba a la pestaña Sueldos, que ya no existe.
{
  const grid = {
    offset: { fila: 2, col: 2 },
    filas: [[{ formula: '=Sueldos!J78', valor: '#REF!', numero: null, derivada: false }]],
  }
  const r = mapearFormulas(grid)
  assert.equal(r.celdas[0].celda, 'C3')
  assert.equal(r.errores.length, 1)
  assert.equal(r.errores[0].formula, '=Sueldos!J78')
}

// Una IMPORTRANGE de 990 filas no puede tapar el informe: las celdas derramadas se cuentan, no se listan.
{
  const grid = {
    offset: { fila: 0, col: 0 },
    filas: [[{ formula: '=IMPORTRANGE("x","y")', valor: 'a', derivada: false }, { formula: null, valor: 'b', derivada: true }]],
  }
  const r = mapearFormulas(grid)
  assert.equal(r.celdas.length, 1)
  assert.equal(r.derramadas, 1)
  assert.equal(r.con_formula, 1)
}

// La distinción que manda en este proyecto: fórmula vs número pegado a mano.
{
  const grid = {
    offset: { fila: 0, col: 0 },
    filas: [[{ formula: null, valor: '$11.435.480', numero: 11435480, derivada: false }]],
  }
  assert.equal(mapearFormulas(grid).a_mano, 1)
}

console.log('sheet-formulas.test.mjs OK')
