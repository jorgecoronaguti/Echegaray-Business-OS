// LA CELDA QUE CALCULA (dueño, 15/09/2026: «tiene que poder calcular dentro de las celdas, como hace sheet»).
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · evaluar de izquierda a derecha sin precedencia («=2+3*4» daría 20).
//   · leer el punto siempre como decimal («=1.234,5+1» daría 2,2345).
//   · devolver Infinity en «=10/0» en vez de rechazarlo.
//   · aceptar cualquier texto y dejar que `Number()` devuelva NaN.
//   · guardar sólo el valor y perder la expresión (no se podría reabrir la celda con la cuenta).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esFormula, evaluarFormulaEsAR, leerCeldaNumerica } from './formulaEsAR.ts'

const val = (t: string): number | string => {
  const r = evaluarFormulaEsAR(t)
  return r.ok ? r.valor : `error: ${r.error}`
}

test('LAS CUENTAS QUE EL DUEÑO ESCRIBE', () => {
  assert.equal(val('=340909,09+197272,73'), 538181.82)
  assert.equal(val('=1800000-30000'), 1770000)
  assert.equal(val('=9*105'), 945)
  assert.equal(val('=1.234,5+1'), 1235.5, 'MUTACIÓN: el punto de miles leído como decimal da 2,2345')
  assert.equal(val('=$266.000 + $1.000'), 267000)
})

test('PRECEDENCIA Y PARÉNTESIS, NO IZQUIERDA A DERECHA', () => {
  assert.equal(val('=2+3*4'), 14, 'MUTACIÓN: sin precedencia daría 20')
  assert.equal(val('=(2+3)*4'), 20)
  assert.equal(val('=100/4/5'), 5)
  assert.equal(val('=-5+10'), 5)
  assert.equal(val('=2 × 3'), 6)
  assert.equal(val('=12 ÷ 4'), 3)
  assert.equal(val('=2x3'), 6)
})

test('LO QUE NO ES UNA CUENTA NO SE EVALÚA Y DICE POR QUÉ', () => {
  assert.equal(val('=10/0'), 'error: no se puede dividir por cero')
  assert.match(String(val('=abc')), /^error: /)
  assert.match(String(val('=(2+3')), /^error: falta cerrar un paréntesis/)
  assert.match(String(val('=2+')), /^error: la cuenta queda a medias/)
  assert.match(String(val('=2 3')), /^error: sobra algo al final/)
  assert.match(String(val('=')), /^error: la cuenta está vacía/)
  assert.match(String(val(`=${'1+'.repeat(150)}1`)), /^error: la cuenta es demasiado larga/)
})

test('DOS DECIMALES, COMO TODA LA PLATA DEL MÓDULO', () => {
  assert.equal(val('=1/3'), 0.33)
  assert.equal(val('=100/3'), 33.33)
})

test('`esFormula` MIRA EL `=`, NO EL CONTENIDO', () => {
  assert.equal(esFormula('=1+1'), true)
  assert.equal(esFormula('  =1+1'), true)
  assert.equal(esFormula('1+1'), false)
  assert.equal(esFormula(''), false)
})

test('LA CELDA GUARDA LAS DOS COSAS: EL VALOR Y LA CUENTA', () => {
  const f = leerCeldaNumerica('=340909,09+197272,73')
  assert.deepEqual(f, { ok: true, valor: 538181.82, expresion: '=340909,09+197272,73' })
})

test('UN NÚMERO SUELTO NO DEJA EXPRESIÓN, Y VACÍO BORRA EL OVERRIDE', () => {
  assert.deepEqual(leerCeldaNumerica('266.000'), { ok: true, valor: 266000, expresion: null })
  assert.deepEqual(leerCeldaNumerica('   '), { ok: true, valor: null, expresion: null },
    'MUTACIÓN: traducir el vacío a 0 liquidaría a alguien en cero')
  assert.deepEqual(leerCeldaNumerica('0'), { ok: true, valor: 0, expresion: null },
    'un 0 escrito SÍ es una afirmación: no es vacío')
})

test('UNA CUENTA INVÁLIDA NO SE GUARDA', () => {
  const r = leerCeldaNumerica('=10/0')
  assert.equal(r.ok, false)
  assert.equal(leerCeldaNumerica('hola').ok, false)
})
