// UNA FILA QUE SE MUESTRA TIENE QUE CERRAR COMO SE MUESTRA.
//
// QA, 14/09/2026 — ZOGBE RAMOS, quincena del 01/09: Gana $420.604 − Ya transferido $94.796 = $325.808,
// y la fila decía $325.809. El pie, $9.034.126 contra $9.034.125.
//
// ═══ LA CAUSA, LEÍDA EN LA BASE ═══
//
// La cuenta estaba bien: JORNALES trae ya transferido $94.795,50 y efectivo $325.808,50, y
// 420.604 − 94.795,50 = 325.808,50 al centavo. Lo que la rompía era `pesos`, que redondeaba CADA cifra
// a peso entero por separado: $94.796 y $325.809. Dos redondeos independientes no restan. Se arregla
// mostrando los centavos cuando existen (la planilla también los tiene: por banco $230.240,12).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pesos } from './formato.ts'

/** «$325.808,50» → 325808.5: lo que el dueño lee, vuelto número. */
const leido = (s: string): number => Number(s.replace(/[$\s.]/g, '').replace(',', '.'))

test('Zogbe 01/09: gana − ya transferido = le falta pagar, leído en pantalla', () => {
  const gana = 420604, yaTransferido = 94795.5, efectivo = 325808.5
  assert.equal(pesos(yaTransferido), '$94.795,50')
  assert.equal(leido(pesos(gana)) - leido(pesos(yaTransferido)), leido(pesos(efectivo)))
})

test('el pie leído es la suma de las filas leídas', () => {
  const filas = [325808.5, 364188, 431686.25, 192887.48]
  const pie = Math.round(filas.reduce((s, n) => s + n, 0) * 100) / 100
  const sumaLeida = Math.round(filas.reduce((s, n) => s + leido(pesos(n)), 0) * 100) / 100
  assert.equal(leido(pesos(pie)), sumaLeida)
})

test('un importe sin centavos se sigue escribiendo sin decimales, y null es «—»', () => {
  assert.equal(pesos(420604), '$420.604')
  assert.equal(pesos(null), '—')
})
