// LA LIMPIEZA SACA SÓLO EL RESIDUO DE UNA CORRECCIÓN, NUNCA UN DÍA EN EL QUE LA PERSONA ESTUVO.
//
// MUTACIONES QUE PONEN ESTO ROJO: sacar el filtro por horas (se llevaría le-comedor 15..15, que
// respalda 9 hs); comparar por obra en vez de por `desde` (dejaría los messina 16..16); tomar como
// reemplazado un tramo cerrado ANTES que el otro (un día suelto de verdad).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDeLimpieza } from './asignaciones-reemplazadas.mjs'

const P = 'e3e21a50-5235-40de-b265-e8a1ab64ab90'
const a = (id, obra_id, desde, hasta) => ({ id, persona_id: P, obra_id, desde, hasta })

// La base del 16/09/2026 a las 08:04, tal cual.
const GONZALEZ_TOBARES = [
  a('77eeae59', 'entrepiso-y-escalera', '2026-09-08', '2026-09-14'),
  a('1c7cbf39', 'le-comedor', '2026-09-15', '2026-09-15'),
  a('a590c67f', 'messina', '2026-09-16', '2026-09-16'),
  a('9bed8a19', 'le-comedor', '2026-09-16', '2026-09-16'),
  a('1a636bda', 'messina', '2026-09-16', '2026-09-16'),
  a('a9fec8c9', 'le-comedor', '2026-09-16', '2026-09-16'),
  a('08b29b9e', 'messina', '2026-09-16', null),
]
const HORAS = [
  { persona_id: P, fecha: '2026-09-14', obra_canonica_id: 'le-comedor' },
  { persona_id: P, fecha: '2026-09-15', obra_canonica_id: 'le-comedor' },
]

test('GONZALEZ TOBARES: se sacan los cuatro de un día del 16/09 y queda el abierto', () => {
  const { sacar, conHoras } = planDeLimpieza({ asignaciones: GONZALEZ_TOBARES, horas: HORAS })
  assert.deepEqual(sacar.map((x) => x.id).sort(), ['1a636bda', '9bed8a19', 'a590c67f', 'a9fec8c9'])
  assert.ok(sacar.every((x) => x.reemplazadaPor === '08b29b9e'), 'todos reemplazados por el abierto')
  assert.deepEqual(conHoras, [])
})

test('le-comedor 15..15 NO se saca: tiene un desde propio y 9 hs ese día — es historia real', () => {
  const { sacar } = planDeLimpieza({ asignaciones: GONZALEZ_TOBARES, horas: HORAS })
  assert.ok(!sacar.some((x) => x.id === '1c7cbf39'))
})

test('un reemplazado CON horas en su obra se lista aparte y no se saca: alguien tiene que mirarlo', () => {
  const { sacar, conHoras } = planDeLimpieza({
    asignaciones: GONZALEZ_TOBARES,
    horas: [...HORAS, { persona_id: P, fecha: '2026-09-16', obra_canonica_id: 'le-comedor' }],
  })
  assert.deepEqual(sacar.map((x) => x.id).sort(), ['1a636bda', 'a590c67f'])
  assert.deepEqual(conHoras.map((x) => x.id).sort(), ['9bed8a19', 'a9fec8c9'])
})

test('un día suelto de verdad (Reta 09/09 en Messina dentro de Quattropani abierta) no es residuo', () => {
  const { sacar, conHoras } = planDeLimpieza({
    asignaciones: [
      a('q', 'quattropani', '2026-09-08', null),
      a('m', 'messina', '2026-09-09', '2026-09-09'),
    ],
    horas: [],
  })
  assert.deepEqual(sacar, [])
  assert.deepEqual(conHoras, [])
})

test('el mismo desde en OTRA persona no cuenta: el reemplazo es por persona', () => {
  const { sacar } = planDeLimpieza({
    asignaciones: [
      a('x', 'messina', '2026-09-16', '2026-09-16'),
      { id: 'y', persona_id: 'otra', obra_id: 'messina', desde: '2026-09-16', hasta: null },
    ],
    horas: [],
  })
  assert.deepEqual(sacar, [])
})

test('las fechas de pg (Date a las 03:00Z) se leen como el día correcto', () => {
  const { sacar } = planDeLimpieza({
    asignaciones: [
      a('x', 'messina', new Date('2026-09-16T03:00:00Z'), new Date('2026-09-16T03:00:00Z')),
      a('y', 'messina', new Date('2026-09-16T03:00:00Z'), null),
    ],
    horas: [],
  })
  assert.deepEqual(sacar.map((s) => s.id), ['x'])
})
