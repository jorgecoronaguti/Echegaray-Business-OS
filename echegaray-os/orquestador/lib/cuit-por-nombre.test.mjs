// Tests del cruce nombre → CUIT. Los casos son los REALES del archivo, incluidos los seis que estaban
// mal y el ambiguo que hay que dejar vacío.
import test from 'node:test'
import assert from 'node:assert/strict'
import { emparejarCuit, mapaCuits, tokens } from './cuit-por-nombre.mjs'

// Los emisores tal como los tiene ARCA (comprobantes_arca, tipo_libro='R').
const ARCA = [
  { nombre: 'ALUMETAL S A', cuit: '30567363372' },
  { nombre: 'HORMISERV  SRL', cuit: '30681641730' },
  { nombre: 'MARIANA  SOCIEDAD ANONIMA', cuit: '30691852071' },
  { nombre: 'ROBLES PINTURERIAS S.R.L.', cuit: '30711355223' },
  { nombre: 'ROBLES JOSE MARIA', cuit: '20379240195' },
  { nombre: 'PINTURERIA CORDOBA  S. R. L.', cuit: '30621517429' },
  { nombre: 'MADERAS LLITERAS S.R.L.', cuit: '30708390557' },
  { nombre: 'FRIOLATINA SA', cuit: '30679777986' },
  { nombre: 'COMBUSTIBLES BARCELO SRL', cuit: '33708332599' },
  { nombre: 'COMBUSTIBLES NUEVO CUYO SRL', cuit: '30691865386' },
]

test('resuelve los nombres cortos del dueño contra la razón social de ARCA', () => {
  // Ninguno de estos coincidía por igualdad: "Alumetal" ≠ "ALUMETAL S A".
  assert.equal(emparejarCuit('Alumetal', ARCA).cuit, '30567363372')
  assert.equal(emparejarCuit('Hormiserv', ARCA).cuit, '30681641730')
  assert.equal(emparejarCuit('Mariana SA', ARCA).cuit, '30691852071')
  assert.equal(emparejarCuit('Lliteras', ARCA).cuit, '30708390557')
  assert.equal(emparejarCuit('Friolatina SA', ARCA).cuit, '30679777986')
  assert.equal(emparejarCuit('Pintureria Cordoba', ARCA).cuit, '30621517429')
})

test('LOS SEIS QUE ESTABAN MAL: ahora dan el CUIT de la empresa correcta', () => {
  // Cada uno mostraba el CUIT de OTRA empresa por una superposición de diseños que corrió la columna.
  assert.notEqual(emparejarCuit('Mariana SA', ARCA).cuit, '23177590924', 'no el que mostraba')
  assert.notEqual(emparejarCuit('Lliteras', ARCA).cuit, '30567363372', 'no el de ALUMETAL')
  assert.notEqual(emparejarCuit('Pintureria Cordoba', ARCA).cuit, '30681641730', 'no el de HORMISERV')
  assert.equal(emparejarCuit('Robles Pintureria', ARCA).cuit, '30711355223', 'no 30-71216798-6')
})

test('AMBIGUO ES VACÍO, NUNCA UNA ADIVINANZA', () => {
  // "Combustibles" toca a dos empresas distintas. Un CUIT ajeno hace transferir a otra cuenta y
  // retener mal: es peor que no saber. Se devuelve null y la celda queda vacía.
  assert.equal(emparejarCuit('Combustibles', ARCA), null)
  // Con el apellido, deja de ser ambiguo.
  assert.equal(emparejarCuit('Combustibles Barcelo', ARCA).cuit, '33708332599')
  // "Robles" solo también es ambiguo (Pintureria y Jose Maria).
  assert.equal(emparejarCuit('Robles', ARCA), null)
})

test('un nombre que ARCA no tiene queda vacío, no toma el parecido', () => {
  for (const n of ['Gruas San Blas', 'FEMENIA', 'Corralon Progreso', 'La Isla Metal SRL', 'La Aguilana']) {
    assert.equal(emparejarCuit(n, ARCA), null, `"${n}" no está en ARCA: su celda va vacía`)
  }
})

test('las formas jurídicas no cuentan como tokens: "SA" no puede emparejar a nadie', () => {
  assert.deepEqual(tokens('ALUMETAL S A'), ['alumetal'])
  assert.deepEqual(tokens('MARIANA  SOCIEDAD ANONIMA'), ['mariana'])
  assert.deepEqual(tokens('Robles Pintureria'), ['robles', 'pintureria'])
  // Un nombre que es SÓLO forma jurídica no empareja nada.
  assert.equal(emparejarCuit('SA', ARCA), null)
  assert.equal(emparejarCuit('   ', ARCA), null)
})

test('mapaCuits separa lo resuelto de lo que queda sin CUIT', () => {
  const { cuits, ambiguos } = mapaCuits(['Alumetal', 'Hormiserv', 'Gruas San Blas', 'Robles'], ARCA)
  assert.equal(cuits.size, 2)
  assert.deepEqual(ambiguos.sort(), ['Gruas San Blas', 'Robles'])
})
