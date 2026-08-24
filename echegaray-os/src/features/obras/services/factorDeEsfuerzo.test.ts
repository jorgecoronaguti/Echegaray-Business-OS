import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factorDeEsfuerzo } from './panelTarea.ts'

// El «1,32×» del cuadro REAL del canónico 04. El defecto que atrapa es el de siempre en este repo:
// un dato que falta dibujado como un número redondo. Un factor de 1,00× se lee «va exactamente como
// el plan» y hace que nadie vaya a mirar; «no lo sé» tiene que decirse con su palabra.

const i = (o: Partial<Parameters<typeof factorDeEsfuerzo>[0]> = {}) => ({
  hhReal: null, cantidadEjecutada: null, hhPlan: null, cantidadObjetivo: null, ...o,
})

test('el factor es el esfuerzo real dividido por el planificado', () => {
  // Plan: 36 HH para 1,08 m³ = 33,33 hs/m³. Real: 19 HH para 0,432 m³ = 43,98 hs/m³ → 1,32×.
  const f = factorDeEsfuerzo(i({ hhPlan: 36, cantidadObjetivo: 1.08, hhReal: 19, cantidadEjecutada: 0.432 }))
  assert.ok(f !== null)
  assert.equal(Number(f.toFixed(2)), 1.32)
})

test('rendir mejor que el plan da menos de 1', () => {
  const f = factorDeEsfuerzo(i({ hhPlan: 100, cantidadObjetivo: 10, hhReal: 40, cantidadEjecutada: 5 }))
  assert.equal(f, 0.8)
})

test('sin cualquiera de los cuatro insumos el factor es DESCONOCIDO, nunca 1', () => {
  assert.equal(factorDeEsfuerzo(i({ hhPlan: 36, cantidadObjetivo: 1.08 })), null)
  assert.equal(factorDeEsfuerzo(i({ hhReal: 19, cantidadEjecutada: 0.4 })), null)
  assert.equal(factorDeEsfuerzo(i({ hhPlan: 36, cantidadObjetivo: 1.08, hhReal: 19, cantidadEjecutada: null })), null)
})

test('cantidad ejecutada en cero no es rendimiento infinito: es que no hay nada que medir', () => {
  assert.equal(
    factorDeEsfuerzo(i({ hhPlan: 36, cantidadObjetivo: 1.08, hhReal: 19, cantidadEjecutada: 0 })),
    null,
  )
  // Y una cantidad objetivo en cero tampoco puede dividir.
  assert.equal(
    factorDeEsfuerzo(i({ hhPlan: 36, cantidadObjetivo: 0, hhReal: 19, cantidadEjecutada: 0.4 })),
    null,
  )
})
