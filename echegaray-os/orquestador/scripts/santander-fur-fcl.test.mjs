import test from 'node:test'
import assert from 'node:assert/strict'
import { mismoNombre, proximoHabil } from './santander-fur-fcl.mjs'

// EL EMPAREJAMIENTO POR NOMBRE DECIDE A QUIÉN SE LE PAGA. Los casos son los rótulos REALES: el
// estudio contable abrevia, el resumen de cuentas escribe entero, y los dos usan comas donde
// quieren. Un falso positivo acá deposita el Fondo de Cese de una persona en la cuenta de otra.

test('la abreviatura del estudio encuentra al nombre entero del padrón', () => {
  assert.equal(mismoNombre('GONZALEZ TOBARES, EMILIAN', 'GONZALEZ TOBARES EMILIANO'), true)
  assert.equal(mismoNombre('GONZALEZ TOBARES, JUAN GU', 'GONZALEZ TOBARES JUAN GUILLERMO'), true)
  assert.equal(mismoNombre('TELLO, JUAN ALBERTO', 'TELLO JUAN ALBERTO'), true)
  assert.equal(mismoNombre('MALDONADO, BATISTA EMILIANO MIGUEL', 'MALDONADO BATISTA EMILIANO MIGUEL'), true)
})

test('dos hermanos con el mismo apellido NO se confunden', () => {
  // Están los dos en la planilla de agosto y cobran importes distintos.
  assert.equal(mismoNombre('CASTRO GALVAN, GERSON ULISES', 'CASTRO GALVAN HEBER LUCAS'), false)
  assert.equal(mismoNombre('GONZALEZ TOBARES, EMILIAN', 'GONZALEZ TOBARES JUAN GUILLERMO'), false)
  assert.equal(mismoNombre('QUIROGA, SEBASTIAN ADOLFO', 'QUIROGA ALEXANDER SEBASTIAN'), false)
})

test('un nombre incompleto no matchea con uno que tiene un token de más', () => {
  assert.equal(mismoNombre('GONZALEZ, CARLOS', 'GONZALEZ CARLOS SAMUEL'), false)
})

test('el acento y la coma no cambian la identidad', () => {
  assert.equal(mismoNombre('BENÍTEZ, JOSÉ', 'BENITEZ JOSE'), true)
})

test('proximoHabil: el viernes se queda, el sábado y el domingo saltan al lunes', () => {
  assert.equal(proximoHabil(new Date(Date.UTC(2026, 8, 11))), '20260911') // viernes
  assert.equal(proximoHabil(new Date(Date.UTC(2026, 8, 12))), '20260914') // sábado → lunes
  assert.equal(proximoHabil(new Date(Date.UTC(2026, 8, 13))), '20260914') // domingo → lunes
  assert.equal(proximoHabil(new Date(Date.UTC(2026, 8, 10))), '20260910') // jueves
})
