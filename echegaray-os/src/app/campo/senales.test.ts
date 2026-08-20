import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  senalHerramientas,
  senalImpedimentos,
  senalMovimientos,
  senalPedidos,
  senalParte,
} from './senales.ts'

// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN ═══
//
// Que la pantalla del teléfono afirme algo que nadie contó. «0 en camino» y «no pude leer los
// pedidos» se ven idénticos en una fila de 60px y significan lo contrario; y un parte sin cargar
// mostrado como dato neutro es exactamente la tarea del día pasando desapercibida.

test('sin dato NO hay señal: sólo el error, arriba, con el mensaje de la fuente', () => {
  assert.equal(senalParte(null), null)
  assert.equal(senalPedidos(null), null)
  assert.equal(senalHerramientas(null), null)
  assert.equal(senalImpedimentos(null), null)
  assert.equal(senalMovimientos(null), null)
})

test('el cero NO se escribe: la fila va sin señal', () => {
  assert.equal(senalPedidos(0), null)
  assert.equal(senalHerramientas(0), null)
  assert.equal(senalImpedimentos(0), null)
  assert.equal(senalMovimientos(0), null)
})

test('el parte sin cargar es la excepción: cero partes hoy es la tarea del día', () => {
  assert.deepEqual(senalParte(0), { texto: 'sin cargar hoy', pendiente: true })
})

test('con el parte cargado la señal deja de ser un pendiente', () => {
  assert.deepEqual(senalParte(1), { texto: '1 cargado hoy', pendiente: false })
  assert.deepEqual(senalParte(3), { texto: '3 cargados hoy', pendiente: false })
})

test('un impedimento abierto es un pendiente; lo demás es contexto', () => {
  assert.deepEqual(senalImpedimentos(1), { texto: '1 abierto', pendiente: true })
  assert.deepEqual(senalImpedimentos(2), { texto: '2 abiertos', pendiente: true })
  assert.equal(senalPedidos(2)?.pendiente, false)
  assert.equal(senalHerramientas(12)?.pendiente, false)
})
