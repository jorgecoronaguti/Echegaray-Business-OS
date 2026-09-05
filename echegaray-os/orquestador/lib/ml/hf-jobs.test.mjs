// CUÁNDO CONVIENE MANDAR UN TRABAJO A HUGGING FACE. Lo que se protege es que no salga lo que no debe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convieneJob, FLAVORS } from './hf-jobs.mjs'

test('un lote confidencial NO sale, por más que ahorre tiempo', () => {
  // Es el caso real: re-embeber el corpus ahorraría 680 segundos y no puede salir, porque esos
  // fragmentos llevan nombres de empleados, CUIT e importes.
  const r = convieneJob({ fragmentos: 10876, msPorUnidadVM: 84, sensibilidad: 'confidencial' })
  assert.equal(r.conviene, false)
  assert.match(r.porQue, /confidencial/)
  assert.ok(r.jobMs < r.vmMs, 'y el ahorro existe: por eso la decisión es de política, no de rendimiento')
})

test('el mismo lote, si no fuera sensible, SÍ conviene', () => {
  const r = convieneJob({ fragmentos: 10876, msPorUnidadVM: 84, sensibilidad: 'interno' })
  assert.equal(r.conviene, true)
  assert.ok(r.ahorroMs > 600000)
})

test('un lote chico no justifica el arranque', () => {
  const r = convieneJob({ fragmentos: 5, msPorUnidadVM: 84, sensibilidad: 'publico' })
  assert.equal(r.conviene, false)
  assert.match(r.porQue, /arranque/)
})

test('los flavors están declarados: un nombre inválido no se descubre en producción', () => {
  assert.ok(FLAVORS.includes('cpu-basic'))
  assert.ok(FLAVORS.includes('t4-small'))
  assert.ok(FLAVORS.includes('zero-a10g'))
})
