// LO QUE _BANCO_RAW PUBLICA CUANDO EL BANCO TODAVÍA NO ACREDITÓ (10/09/2026).
//
// De esta réplica cuelgan por fórmula la disponibilidad de CAJA, el impuesto al cheque y el cruce de
// Cheques. Dos celdas deciden todo: la de "Saldo después" de la última fila (la que lee
// `formulaUltimoSaldo`) y la nota de la fila 2, que es donde se explica lo que el número no dice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fila, notaRetencion, COLUMNAS } from './banco-raw-pestana.mjs'

test('un depósito retenido va con la celda de saldo VACÍA, nunca en cero', () => {
  // El 0 no es vacío: `formulaUltimoSaldo` busca el último número distinto de 0 y un 0 escrito ahí
  // diría "la cuenta quedó en cero".
  const f = fila({ fecha: '2026-09-10', concepto: 'Deposito e-cheq 48hs presencia bsr', importe: 6567841.01, saldo: null })
  assert.equal(f[3], '')
  assert.equal(f.length, COLUMNAS.length)
})

test('un saldo real de cero se sigue escribiendo como número', () => {
  assert.equal(fila({ fecha: '2026-09-10', concepto: 'Algo', importe: -100, saldo: 0 })[3], 0)
})

test('la nota declara lo retenido con su importe y cuántos son', () => {
  const n = notaRetencion([{ importe: 6567841.01 }, { importe: 32004685.22 }], 0)
  assert.match(n, /38\.572\.526,23/)
  assert.match(n, /2 dep/)
})

test('sin nada retenido la nota no dice nada (un aviso resuelto se deja de leer)', () => {
  assert.equal(notaRetencion([], 0), '')
  assert.equal(notaRetencion([], 0.4), '') // redondeo, no un faltante
})

test('una diferencia sin explicar viaja a la pestaña, no sólo al log', () => {
  assert.match(notaRetencion([], -45080), /45\.080,00/)
  assert.match(notaRetencion([], -45080), /DECLARADO por el banco/)
})
