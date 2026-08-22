// QUÉ ESCRIBE UNA VINCULACIÓN Y QUÉ NO TOCA.
//
// Cada test reproduce un defecto concreto: si se saca la guarda que lo evita, el test se pone rojo.
//
//   · vincular pisaba el `hh_plan` que la obra ya había planificado — y la comparación entre plan
//     real y estándar teórico ES el control, así que pisarlo lo borra;
//   · vincular convertía m³ a m² multiplicando por las hs/m² del estándar;
//   · una fila de resumen o un tiempo técnico figuraban como deuda de vinculación;
//   · y «guardado» no decía qué había traído ni qué había respetado.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoVinculacion, mismaUnidad, planDeVinculacion, resumenDeVinculacion,
  type ActividadAVincular, type EstandarVigente,
} from './vinculacionEstandar.ts'

const ACT: ActividadAVincular = {
  tipo: 'tarea', tiempoTecnico: false, tareaTipoId: null, analisisId: null,
  unidad: 'm2', cantidadObjetivo: 100, hhPlan: null,
}
const EST: EstandarVigente = {
  tareaTipoId: 'tt-1', analisisId: 'an-1', variante: null, unidad: 'm2', hhPorUnidad: 2.5,
}

test('el estado por defecto es SIN VINCULAR', () => {
  assert.equal(estadoVinculacion(ACT), 'sin_vincular')
})

test('un resumen y un tiempo técnico no son deuda de vinculación', () => {
  assert.equal(estadoVinculacion({ ...ACT, tipo: 'resumen' }), 'no_aplica')
  assert.equal(estadoVinculacion({ ...ACT, tipo: 'hito' }), 'no_aplica')
  assert.equal(estadoVinculacion({ ...ACT, tiempoTecnico: true }), 'no_aplica')
})

test('con tarea tipo y sin análisis todavía falta con qué se mide', () => {
  assert.equal(estadoVinculacion({ ...ACT, tareaTipoId: 'tt-1' }), 'sin_analisis')
  assert.equal(estadoVinculacion({ ...ACT, tareaTipoId: 'tt-1', analisisId: 'an-1' }), 'vinculada')
})

test('la unidad se compara escrita de cualquier manera, y no se convierte', () => {
  assert.equal(mismaUnidad('m2', 'M²'), true)
  assert.equal(mismaUnidad('m 2', 'm2'), true)
  assert.equal(mismaUnidad('m2', 'm3'), false)
  assert.equal(mismaUnidad(null, 'm2'), false)
})

test('vincular trae el vínculo y calcula el hh_plan con la cantidad', () => {
  const plan = planDeVinculacion(ACT, EST)
  assert.deepEqual(plan.patch, { tarea_tipo_id: 'tt-1', analisis_id: 'an-1', hh_plan: 250 })
  assert.equal(plan.respeto.length, 0)
})

test('NO pisa el hh_plan que ya cargó la obra, y lo dice', () => {
  const plan = planDeVinculacion({ ...ACT, hhPlan: 180 }, EST)
  assert.equal('hh_plan' in plan.patch, false, 'reemplazó el plan real por el teórico')
  assert.match(plan.respeto.join(' '), /hh_plan ya cargado \(180\)/)
})

test('NO pisa la unidad que ya declaró la actividad', () => {
  const plan = planDeVinculacion({ ...ACT, unidad: 'ml' }, { ...EST, hhPorUnidad: 2.5 })
  assert.equal('unidad' in plan.patch, false)
  assert.match(plan.respeto.join(' '), /no se convierte/)
})

test('con unidades distintas NO calcula hh_plan: m² y m³ no son el mismo hecho', () => {
  const plan = planDeVinculacion({ ...ACT, unidad: 'm3' }, EST)
  assert.equal('hh_plan' in plan.patch, false, 'convirtió m³ con las hs/m² del estándar')
  assert.match(plan.respeto.join(' '), /unidades/)
})

test('completa la unidad sólo cuando la actividad no tiene ninguna', () => {
  const plan = planDeVinculacion({ ...ACT, unidad: null }, EST)
  assert.equal(plan.patch.unidad, 'm2')
  assert.equal(plan.patch.hh_plan, 250, 'con la unidad recién traída ya puede calcular el plan')
})

test('sin cantidad objetivo no hay hh_plan, y el motivo se escribe', () => {
  const plan = planDeVinculacion({ ...ACT, cantidadObjetivo: null }, EST)
  assert.equal('hh_plan' in plan.patch, false)
  assert.match(plan.respeto.join(' '), /cantidad objetivo/)
})

test('sin hs por unidad en el análisis no se inventa un plan', () => {
  const plan = planDeVinculacion(ACT, { ...EST, hhPorUnidad: null })
  assert.equal('hh_plan' in plan.patch, false)
  assert.match(plan.respeto.join(' '), /hs por unidad/)
})

test('el resumen nombra siempre lo que NO se tocó', () => {
  const texto = resumenDeVinculacion(planDeVinculacion({ ...ACT, hhPlan: 180 }, EST))
  assert.match(texto, /Sin tocar/)
  assert.match(texto, /180/)
})
