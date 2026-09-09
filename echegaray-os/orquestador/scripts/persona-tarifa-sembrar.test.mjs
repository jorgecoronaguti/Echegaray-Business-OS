import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveNombre } from '../lib/desvinculacion-plantel.mjs'
import { CUIL_POR_CLAVE, desdePorDefecto, planDeSembrado } from './persona-tarifa-sembrar.mjs'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que el sembrado ADIVINE a quién pertenece una tarifa. «Castillo Carlos» ya cayó una vez en
//     «GONZALEZ CARLOS SAMUEL» por parecido de nombre; acá el que no está en el puente declarado
//     tiene que salir listado, no emparejado.
//  2. Que una segunda corrida DUPLIQUE la tarifa vigente. Si el valor no cambió, no se inserta.
//  3. Que una tarifa en cero o vacía se siembre como si fuera un dato — liquidar a alguien en $ 0.

const personaPorCuil = new Map([
  ['20294271067', { persona_id: 'uuid-aguero', nombre: 'AGUERO CRISTIAN DOMINGO' }],
])

test('el nombre dado vuelta empareja igual: la clave son los tokens ordenados', () => {
  assert.equal(claveNombre('Aguero Cristian'), claveNombre('CRISTIAN AGUERO'))
  assert.equal(CUIL_POR_CLAVE.get(claveNombre('Cristian Aguero')), '20294271067')
})

test('quien no está en el puente CUIL↔planilla NO se empareja por parecido', () => {
  const plan = planDeSembrado(
    [{ clave: claveNombre('Castillo Carlos'), nombre: 'Castillo Carlos', jornalPactado: 4950 }],
    personaPorCuil, new Map(),
  )
  assert.equal(plan.insertar.length, 0)
  assert.equal(plan.sinPersona.length, 1)
  assert.equal(plan.sinPersona[0].cuil, null, 'ni siquiera tiene CUIL: no hay a quién asignárselo')
})

test('el CUIL existe en el puente pero la persona no está en la base: tampoco se inventa', () => {
  const plan = planDeSembrado(
    [{ clave: claveNombre('Emanuel Alaniz'), nombre: 'Emanuel Alaniz', jornalPactado: 4950 }],
    personaPorCuil, new Map(),
  )
  assert.equal(plan.insertar.length, 0)
  assert.equal(plan.sinPersona[0].cuil, '20382188153')
})

test('idempotente POR VALOR: la misma tarifa vigente no se vuelve a insertar', () => {
  const plantel = [{ clave: claveNombre('Aguero Cristian'), nombre: 'Aguero Cristian', jornalPactado: 5974 }]
  const primera = planDeSembrado(plantel, personaPorCuil, new Map())
  assert.equal(primera.insertar.length, 1)
  assert.equal(primera.insertar[0].anterior, null)

  const segunda = planDeSembrado(plantel, personaPorCuil, new Map([['uuid-aguero', 5974]]))
  assert.equal(segunda.insertar.length, 0, 'ya vigente: no se duplica')
  assert.equal(segunda.iguales.length, 1)
})

test('un aumento SÍ entra, y declara de cuánto venía', () => {
  const plan = planDeSembrado(
    [{ clave: claveNombre('Aguero Cristian'), nombre: 'Aguero Cristian', jornalPactado: 5974 }],
    personaPorCuil, new Map([['uuid-aguero', 5250]]),
  )
  assert.equal(plan.insertar.length, 1)
  assert.equal(plan.insertar[0].anterior, 5250)
  assert.equal(plan.insertar[0].valor, 5974)
})

test('sin $/hora en la planilla no se siembra un cero', () => {
  const plan = planDeSembrado(
    [
      { clave: claveNombre('Aguero Cristian'), nombre: 'Aguero Cristian', jornalPactado: 0 },
      { clave: claveNombre('Ochoa Eduardo'), nombre: 'Ochoa Eduardo', jornalPactado: NaN },
    ],
    personaPorCuil, new Map(),
  )
  assert.equal(plan.insertar.length, 0)
  assert.equal(plan.sinTarifa.length, 2)
})

test('la tarifa arranca el primer día de la quincena en curso, no «desde siempre»', () => {
  assert.equal(desdePorDefecto(new Date('2026-09-09T12:00:00Z')), '2026-09-01')
  assert.equal(desdePorDefecto(new Date('2026-09-15T12:00:00Z')), '2026-09-01')
  assert.equal(desdePorDefecto(new Date('2026-09-16T12:00:00Z')), '2026-09-16')
  assert.equal(desdePorDefecto(new Date('2026-01-31T12:00:00Z')), '2026-01-16')
})
