import test from 'node:test'
import assert from 'node:assert/strict'
import { proyeccionesVencidas } from './auditar-proyecciones-vencidas.mjs'

const HOY = { anio: 2026, mes: 9 } // septiembre

test('un mes ya cerrado que sigue rotulado "proy." es una proyección vencida', () => {
  const filas = [['Concepto', 'jul-26  · proy.', 'ago-26  · proy.', 'sep-26  · proy.']]
  const v = proyeccionesVencidas(filas, HOY)
  assert.equal(v.length, 2, 'julio y agosto ya cerraron; septiembre está en curso y puede proyectarse')
  assert.deepEqual(v.map((x) => x.mes), [7, 8])
})

test('el mes EN CURSO puede proyectarse: todavía no terminó', () => {
  assert.equal(proyeccionesVencidas([['Concepto', 'sep-26 · proy.']], HOY).length, 0)
})

test('un texto que EXPLICA qué es una proyección no es una proyección vencida', () => {
  // Siete falsos positivos vinieron de acá: filas con cifras reales al lado de una explicación.
  // Un auditor que grita sin razón se deja de mirar, y entonces no sirve el día que grite con razón.
  const filas = [['Concepto', 'ene-26', 'feb-26'],
    ['Comprobantes cargados', '2 / 53', '4 / 63', 'proy. = no hay comprobantes, es una proyección']]
  assert.equal(proyeccionesVencidas(filas, HOY).length, 0)
})
