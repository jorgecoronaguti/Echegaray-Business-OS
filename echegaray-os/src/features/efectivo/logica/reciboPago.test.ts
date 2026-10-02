// EL RECIBO DE PAGO EN EFECTIVO A UN TERCERO — lo que el papel dice y lo que se deja emitir.
// Caso real que lo pidió: $ 950.000 a Pedro Tello, fila 1062 de Compras, OB-0011, 02/10/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  borradorDesdeCompra, fechaImpresa, fraseDelReciboPago, letrasDelImporte, pagadaEnEfectivo, validarReciboPago,
  type BorradorReciboPago,
} from './reciboPago.ts'

test('el importe en letras, en castellano y dentro de la frase', () => {
  assert.equal(letrasDelImporte(950_000), 'novecientos cincuenta mil')
  assert.equal(letrasDelImporte(1_000_000), 'un millón')
  assert.equal(letrasDelImporte(2_500_000), 'dos millones quinientos mil')
  assert.equal(letrasDelImporte(21_000), 'veintiún mil')
  assert.equal(letrasDelImporte(101), 'ciento uno')
  assert.equal(letrasDelImporte(100), 'cien')
  assert.equal(letrasDelImporte(1_500.5), 'mil quinientos con 50/100')
  assert.equal(letrasDelImporte(0), null)
  assert.equal(letrasDelImporte(-5), null)
})

test('la frase del caso Tello: razón social, letras, cifra y concepto', () => {
  assert.equal(
    fraseDelReciboPago({ importe: 950_000, concepto: 'pago de mano de obra pisos industriales.' }),
    'Recibí de ECHEGARAY CONSTRUCCIONES S.A.S. la suma de pesos novecientos cincuenta mil ($ 950.000,00) en concepto de pago de mano de obra pisos industriales.',
  )
})

const HOY = '2026-10-02'
const base = (x: Partial<BorradorReciboPago> = {}): BorradorReciboPago =>
  ({ aNombreDe: ' PEDRO  TELLO ', documento: '20-12345678-3', importe: '950.000', fecha: HOY, concepto: 'Mano de obra', obra: '', ...x })

test('valida y limpia: nombre sin espacios de más, documento en dígitos, importe escrito a la argentina', () => {
  const v = validarReciboPago(base(), HOY)
  assert.ok(v.ok)
  assert.deepEqual(v.dato, {
    aNombreDe: 'PEDRO TELLO', documento: '20123456783', importe: 950_000, fecha: HOY, concepto: 'Mano de obra', obra: null,
  })
  const sinDoc = validarReciboPago(base({ documento: '' }), HOY)
  assert.ok(sinDoc.ok && sinDoc.dato.documento === null)
})

test('no se emite: sin nombre, sin importe o en cero, documento de largo imposible, fecha futura, sin concepto', () => {
  assert.equal(validarReciboPago(base({ aNombreDe: ' ' }), HOY).ok, false)
  assert.equal(validarReciboPago(base({ importe: '' }), HOY).ok, false)
  assert.equal(validarReciboPago(base({ importe: '0' }), HOY).ok, false)
  assert.equal(validarReciboPago(base({ documento: '12345' }), HOY).ok, false)
  assert.equal(validarReciboPago(base({ fecha: '2026-10-03' }), HOY).ok, false)
  assert.equal(validarReciboPago(base({ fecha: '' }), HOY).ok, false)
  assert.equal(validarReciboPago(base({ concepto: '  ' }), HOY).ok, false)
})

test('tomar de una compra precarga todo lo que la fila sabe, sin inventar lo que no', () => {
  const b = borradorDesdeCompra({
    fila: 1062, fecha: '2026-10-02', proveedor: 'PEDRO TELLO', concepto: 'Mano de obra pisos', total: 950_000,
    obra: 'OB-0011 · SF - PISOS INDUSTRIALES', cuit: '20-12345678-3',
  }, HOY)
  assert.deepEqual(b, {
    aNombreDe: 'PEDRO TELLO', documento: '20123456783', importe: '950.000', fecha: HOY,
    concepto: 'Mano de obra pisos', obra: 'OB-0011 · SF - PISOS INDUSTRIALES',
  })
  const vacia = borradorDesdeCompra({ fila: 1, fecha: null, proveedor: null, concepto: null, total: null, obra: null, cuit: null }, HOY)
  assert.deepEqual(vacia, { aNombreDe: '', documento: '', importe: '', fecha: HOY, concepto: '', obra: '' })
  // Lo precargado pasa la misma validación que lo escrito a mano.
  assert.ok(validarReciboPago(b, HOY).ok)
})

test('«Tipo pago» del Sheet: sólo efectivo, con espacios y mayúsculas sueltas; «A rendir» no es esto', () => {
  assert.equal(pagadaEnEfectivo(' Efectivo '), true)
  assert.equal(pagadaEnEfectivo('EFECTIVO'), true)
  assert.equal(pagadaEnEfectivo('A rendir'), false)
  assert.equal(pagadaEnEfectivo(null), false)
})

test('fecha impresa dd/mm/aaaa', () => {
  assert.equal(fechaImpresa('2026-10-02'), '02/10/2026')
})
