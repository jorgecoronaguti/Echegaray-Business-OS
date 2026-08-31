// LA PLATA QUE SE LE DA A LA CUADRILLA. Los números son los reales de la quincena 17/08→31/08.
//
// El test NO evalúa la fórmula: afirma qué DICE y, aparte, hace la cuenta con los importes reales.
// Un evaluador casero de fórmulas de Sheets es otro programa que puede estar mal, y entonces el test
// pasaría a medirse a sí mismo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaNetoAPagar, formulaEnEfectivo } from './jornales-neto-pago.mjs'

// Lo que publicaba Nómina ese día para los 15 obreros.
const TOTAL = 6331859      // TOTAL A PAGAR — ya neto de adelanto y de lo ya transferido
const ENTREGADO = 1208644  // ADELANTO $608.644 + YA TRANSFERIDO $600.000
const BANCO = 2786533      // POR BANCO
const EFECTIVO = 3545326   // EN EFECTIVO

test('la cuenta: con el total ya neto, restar el adelanto le saca $1.208.644 a la cuadrilla', () => {
  assert.equal(BANCO + EFECTIVO, TOTAL, 'el fixture no representa lo que Nómina publicó')
  const netoViejo = TOTAL - ENTREGADO
  assert.equal(netoViejo, 5123215)
  assert.equal(netoViejo - BANCO, 2336682, 'es lo que Jornales publicaba en efectivo')
  assert.equal(EFECTIVO - (netoViejo - BANCO), ENTREGADO, 'la diferencia es exactamente el adelanto, restado dos veces')
})

test('con el total YA NETO la fórmula devuelve el total, no el total menos el adelanto', () => {
  const f = formulaNetoAPagar({ fila: 7, yaNeto: 'CITA>0' })
  assert.match(f, /IF\(CITA>0;D7;D7-N\(E7\)\)/, `la rama del neto no está: ${f}`)
})

test('EL RESPALDO SIGUE VIVO: sin `yaNeto` la fórmula resta, como cuando el total es BRUTO', () => {
  const f = formulaNetoAPagar({ fila: 7 })
  assert.match(f, /D7-N\(E7\)/)
  assert.doesNotMatch(f, /IF\(.*;D7;/, 'metió una rama de neto donde el total es bruto')
})

test('sin total no se publica un cero: una fila en cero se lee como «no hay que pagar nada»', () => {
  for (const f of [formulaNetoAPagar({ fila: 7 }), formulaNetoAPagar({ fila: 7, yaNeto: 'X' })]) {
    assert.match(f, /^=IF\(N\(D7\)=0;"";/, f)
  }
})

test('el efectivo es el RESTO del neto, y no publica nada si el banco no es un número', () => {
  const f = formulaEnEfectivo({ fila: 7 })
  assert.match(f, /F7-G7/, 'dejó de ser el resto del neto')
  assert.match(f, /NOT\(ISNUMBER\(G7\)\)/, 'publicaría un efectivo inventado con el banco en texto')
})
