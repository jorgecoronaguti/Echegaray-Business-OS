// «IMPUTAR UN COMPROBANTE YA CARGADO» (24/09/2026): qué se lista, qué se dice antes de apretar y cómo se
// nombra el viaje al Sheet. Lo que estas pruebas impiden: ofrecer una compra que no es imputable (otra forma
// de pago, anulada, ya atada a otra entrega) y afirmar «A rendir en el Sheet» antes de que el worker lo escriba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatasDe, desdeDia, efectoDeImputar, enSheetDe, filtrarCandidatas, type FilaCandidata } from './imputar.ts'

const fila = (x: Partial<FilaCandidata>): FilaCandidata => ({
  fila: 1008, clave: 'c:30716676214|0005-00002405', fecha: '2026-09-24', proveedor: 'Ferreteria Eficiencia Energetica SAS',
  concepto: null, comprobante: '0005-00002405', obra: 'Galpón 9', total: 19600, tipo_pago: 'Efectivo', anulada: false, ...x,
})

test('sólo compras en Efectivo, vivas, con total y sin imputar; las sin número se cuentan aparte', () => {
  const filas = [
    fila({}),
    fila({ fila: 1000, clave: 'c:1|a', fecha: '2026-09-23', tipo_pago: 'Transferencia' }),
    fila({ fila: 1001, clave: 'c:1|b', anulada: true }),
    fila({ fila: 1002, clave: 'c:1|c', total: 0 }),
    fila({ fila: 1003, clave: 'c:1|d' }),
    fila({ fila: 1004, clave: null }),
    fila({ fila: 999, clave: 'c:1|e', fecha: '2026-09-22', tipo_pago: ' Efectivo ' }),
  ]
  const { candidatas, sinNumero } = candidatasDe(filas, new Set(['c:1|d']), new Set([999]))
  assert.deepEqual(candidatas.map((c) => c.fila), [1008, 999])
  assert.equal(sinNumero, 1)
  assert.equal(candidatas.find((c) => c.fila === 999)?.conPagoEnCola, true, 'con un pago en cola se muestra, pero trabada')
})

test('buscar por proveedor, obra, número o fila, sin tildes', () => {
  const { candidatas } = candidatasDe([fila({}), fila({ fila: 7, clave: 'x', proveedor: 'Combustibles Barceló', obra: null })], new Set(), new Set())
  assert.deepEqual(filtrarCandidatas(candidatas, 'barcelo').map((c) => c.fila), [7])
  assert.deepEqual(filtrarCandidatas(candidatas, 'galpon').map((c) => c.fila), [1008])
  assert.deepEqual(filtrarCandidatas(candidatas, '1008').map((c) => c.fila), [1008])
  assert.equal(filtrarCandidatas(candidatas, '').length, 2)
})

test('el efecto dicho antes de apretar: la fila pasa a «A rendir» y el saldo baja; negativo, se avisa', () => {
  const [a, b, c] = efectoDeImputar({ total: 19600, enSuPoder: 20000, persona: 'Emiliano Maldonado', codigo: 'ER-0020' })
  assert.match(a, /«Efectivo» a «A rendir».*ER-0020/)
  assert.match(b, /\$ 20\.000.*\$ 400/)
  assert.equal(c, undefined)
  const neg = efectoDeImputar({ total: 25000, enSuPoder: 20000, persona: 'X', codigo: 'ER-0020' })
  assert.match(neg[2], /negativo.*\$ 5\.000/)
})

test('el viaje al Sheet: «A rendir» sólo con el pedido aplicado', () => {
  assert.equal(enSheetDe('aplicado'), 'en_sheet')
  assert.equal(enSheetDe('pendiente'), 'pendiente')
  assert.equal(enSheetDe('procesando'), 'pendiente')
  assert.equal(enSheetDe('rechazado'), 'rechazado')
  assert.equal(enSheetDe(undefined), 'sin_dato')
})

test('30 días para atrás desde hoy en San Juan', () => {
  assert.equal(desdeDia('2026-09-25'), '2026-08-26')
})
