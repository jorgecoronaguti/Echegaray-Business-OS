// EL SALDO A FAVOR QUE EL HERO PUBLICA COMO «F.2051» TIENE QUE SALIR DE UNA F.2051.
//
// MEDIDO el 04/09/2026: el titular decía «saldo a favor de IVA · F.2051 = $4.046.759». Ese número
// era la proyección de AGOSTO, un mes cuya DDJJ ni siquiera está presentada — venció el 20/08. La
// última declarada de verdad, la de julio, dice $9.856.370,42. El hero subdeclaraba $5,8M de
// crédito fiscal propio bajo el rótulo del formulario oficial.
//
// Un activo fiscal mal medido en la celda más visible se usa para decidir si se pide plata prestada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mesDeLaUltimaDDJJ, mesDelSaldoVigente, ORIGEN } from './impuestos-bloques.mjs'

// El caso real: ene..jul con DDJJ presentada, agosto cerrado por ARCA, sep..dic proyectados.
const REAL = {
  [ORIGEN.ddjj]: [1, 2, 3, 4, 5, 6, 7],
  [ORIGEN.arca]: [8],
  [ORIGEN.proyeccion]: [9, 10, 11, 12],
}

test('el saldo declarado sale de JULIO, el último mes con F.2051 presentada', () => {
  assert.equal(mesDeLaUltimaDDJJ(REAL), 7)
})

test('NO lo saca de agosto, que sólo está cerrado por ARCA', () => {
  assert.notEqual(mesDeLaUltimaDDJJ(REAL), 8, 'una posición técnica no es una declaración jurada')
})

test('las dos preguntas siguen siendo distintas — no se colapsan en una', () => {
  assert.equal(mesDelSaldoVigente(REAL), 8, '«último mes cerrado» sí incluye ARCA: contesta otra cosa')
  assert.equal(mesDeLaUltimaDDJJ(REAL), 7)
})

test('un mes marcado como del dueño tampoco cuenta como declarado', () => {
  assert.equal(mesDeLaUltimaDDJJ({ [ORIGEN.ddjj]: [3], [ORIGEN.ajeno]: [9] }), 3)
})

test('sin ninguna DDJJ devuelve 0 y el llamador decide — no inventa un mes', () => {
  assert.equal(mesDeLaUltimaDDJJ({ [ORIGEN.arca]: [8] }), 0)
  assert.equal(mesDeLaUltimaDDJJ({}), 0)
})
