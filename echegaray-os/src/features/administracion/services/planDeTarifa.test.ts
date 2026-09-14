// UNA SOLA REGLA PARA ESCRIBIR EL $/H (O EL NETO MENSUAL) DE UNA QUINCENA.
//
// Dueño, 14/09/2026: corregir un $/h mal tecleado es «Editar la misma quincena». Y el coordinador: el
// cuadro nuevo insertaba una fila y el cuadro clásico y Pagos hacían upsert con `desde = hoy` —dos
// formas de escribir el mismo dato—. Ésta es la regla que las dos acciones usan ahora.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDeTarifa } from './liquidacionTarifa.ts'

const AGOSTO = { desde: '2026-08-16', valorHora: 5874, netoMensual: null, origen: 'sellada' }
const SEPTIEMBRE = { desde: '2026-09-01', valorHora: 5874, netoMensual: null, origen: 'sheet:_J_OBREROS' }

test('sin fila en el inicio de la quincena: se INSERTA una nueva desde ese día', () => {
  const p = planDeTarifa({ existentes: [AGOSTO], desde: '2026-09-01', forma: 'hora', valor: 6200, estado: 'abierta' })
  assert.deepEqual(p, { accion: 'insertar' })
})

test('con fila en el inicio de la quincena y quincena abierta: se CORRIGE esa fila y se guarda lo que había', () => {
  const p = planDeTarifa({ existentes: [AGOSTO, SEPTIEMBRE], desde: '2026-09-01', forma: 'hora', valor: 6100, estado: 'abierta' })
  assert.deepEqual(p, { accion: 'corregir', antes: { valorHora: 5874, netoMensual: null } })
})

test('quincena cerrada: no se inserta ni se corrige', () => {
  for (const existentes of [[AGOSTO], [AGOSTO, SEPTIEMBRE]]) {
    const p = planDeTarifa({ existentes, desde: '2026-09-01', forma: 'hora', valor: 6100, estado: 'cerrada' })
    assert.equal(p.accion, 'rechazar')
  }
})

test('el mismo valor que ya rige no escribe nada (ni fila nueva ni corrección vacía)', () => {
  assert.equal(planDeTarifa({ existentes: [AGOSTO], desde: '2026-09-01', forma: 'hora', valor: 5874, estado: 'abierta' }).accion, 'nada')
  assert.equal(planDeTarifa({ existentes: [SEPTIEMBRE], desde: '2026-09-01', forma: 'hora', valor: 5874, estado: 'abierta' }).accion, 'nada')
})

test('no cambia la forma de la tarifa: un $/h no pisa un neto mensual de la misma fecha', () => {
  const oficina = { desde: '2026-09-01', valorHora: null, netoMensual: 1800000, origen: 'acuerdo' }
  assert.equal(planDeTarifa({ existentes: [oficina], desde: '2026-09-01', forma: 'hora', valor: 6000, estado: 'abierta' }).accion, 'rechazar')
})

test('un valor que no es positivo se rechaza antes de mirar la base', () => {
  assert.equal(planDeTarifa({ existentes: [], desde: '2026-09-01', forma: 'hora', valor: 0, estado: 'abierta' }).accion, 'rechazar')
})
