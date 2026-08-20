// LAS HH DE UNA CUADRILLA — la suma, probada sin base.
//
// El handoff pide «HH del período» en el panel de la cuadrilla. La suma tiene DOS formas de mentir
// que no producen ningún error visible:
//
//   1. CONTAR UNA AUSENCIA COMO TRABAJO. Una ausencia tiene horas cargadas y no es trabajo: sumarla
//      dice que la cuadrilla trabajó el día que faltó medio equipo. Es el mismo criterio con el que
//      la ficha de cada persona separa trabajadas de ausencias — una sola definición de «HH».
//   2. DEJAR ENTRAR FILAS DE OTRO PERÍODO. La quincena es la ventana con la que se liquida; una
//      fila de la quincena anterior infla el número contra el que después se paga.
//
// Y `numeric` de Postgres llega como CADENA por PostgREST: `'8.00' + '8.00'` da '8.008.00', no 16.

import test from 'node:test'
import assert from 'node:assert/strict'
import { sumarHHTrabajadas } from './cuadrillasService.ts'

const fila = (fecha: string | null, horas: number | string, tipo_hora = 'normal') => ({ fecha, horas, tipo_hora })

test('sólo las horas trabajadas: una ausencia no es trabajo', () => {
  const filas = [
    fila('2026-08-17', 8),
    fila('2026-08-18', 8, 'extra_50'),
    fila('2026-08-19', 8, 'ausencia'),
    fila('2026-08-19', 8, 'licencia'),
  ]
  assert.equal(sumarHHTrabajadas(filas, '2026-08-16', '2026-08-31'), 16)
})

test('sólo las filas del período: la quincena anterior no infla la de ahora', () => {
  const filas = [fila('2026-08-15', 8), fila('2026-08-16', 8), fila('2026-08-31', 8), fila('2026-09-01', 8)]
  assert.equal(sumarHHTrabajadas(filas, '2026-08-16', '2026-08-31'), 16)
})

test('un `numeric` que llega como cadena se suma, no se concatena', () => {
  assert.equal(sumarHHTrabajadas([fila('2026-08-17', '8.00'), fila('2026-08-18', '4.50')], '2026-08-16', '2026-08-31'), 12.5)
})

test('una fila sin fecha no entra en ninguna ventana', () => {
  // Las 19 filas históricas de `registros_hh` vienen del Sheet por SEMANA y sin día. Meterlas en la
  // quincena por defecto le atribuiría horas a un período al que nadie dijo que pertenecen.
  assert.equal(sumarHHTrabajadas([fila(null, 8)], '2026-08-16', '2026-08-31'), 0)
})
