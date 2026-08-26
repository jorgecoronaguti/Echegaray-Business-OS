import test from 'node:test'
import assert from 'node:assert/strict'
import { importe, filaSchema, cronogramaSchema, loQueVeElCliente } from './cronogramaAdmin.ts'

const base = {
  id: null, orden: 1, tipo: 'certificado' as const, rotulo: 'Certificado 1', monto: '1.000.000',
  moneda: 'ARS' as const, fechaPrevista: '2026-09-01', fechaPago: null, facturaNumero: null,
  reciboNumero: null, estado: null, nota: null,
}

test('el punto es miles y la coma decimal — es-AR, sin excepción', () => {
  assert.equal(importe('1.234.567,89'), 1234567.89)
  assert.equal(importe('$ 6.414.970'), 6414970)
  // Si el punto se leyera como decimal, «1.234.567» —un millón doscientos mil— valdría 1,23.
  assert.equal(importe('1.234.567'), 1234567)
  assert.equal(importe(''), null, 'vacío es «sin cargar», no cero')
  assert.equal(importe(null), null)
})

test('el rótulo no puede quedar vacío: el cliente lo lee', () => {
  assert.equal(filaSchema.safeParse({ ...base, rotulo: '   ' }).success, false)
})

test('un pago con fecha pero sin monto no se guarda', () => {
  // En el portal saldría «pagado · sin cargar», y nadie podría conciliarlo.
  const r = filaSchema.safeParse({ ...base, fechaPago: '2026-09-01', monto: '' })
  assert.equal(r.success, false)
})

test('un recibo sin fecha de pago no tiene qué respaldar', () => {
  assert.equal(filaSchema.safeParse({ ...base, reciboNumero: '0091' }).success, false)
  assert.equal(filaSchema.safeParse({ ...base, reciboNumero: '0091', fechaPago: '2026-09-01' }).success, true)
})

test('un pago negativo no se guarda', () => {
  assert.equal(filaSchema.safeParse({ ...base, monto: '-500' }).success, false)
})

test('dos filas con el mismo orden se rechazan antes de llegar a la base', () => {
  const filas = [{ ...base, orden: 1 }, { ...base, orden: 1, rotulo: 'Otro' }]
  const r = cronogramaSchema.safeParse({ obraId: '11111111-1111-1111-1111-111111111111', filas })
  assert.equal(r.success, false)
})

test('el previo dice exactamente lo que el cliente va a ver', () => {
  const filas = [
    filaSchema.parse({ ...base, orden: 1, monto: '5.000.000', fechaPago: '2026-08-01' }),
    filaSchema.parse({ ...base, orden: 2, monto: '3.000.000' }),
    filaSchema.parse({ ...base, orden: 3, monto: '15.400', moneda: 'USD' }),
    filaSchema.parse({ ...base, orden: 4, monto: '', fechaPrevista: null }),
  ]
  const v = loQueVeElCliente(filas)
  assert.equal(v.pagado, 5_000_000)
  assert.equal(v.pendiente, 3_000_000)
  // La línea en dólares y la que no tiene monto NO se suman: se cuentan y se dicen.
  assert.equal(v.sinSumar, 2)
})

test('el fondo de reparo no es deuda del cliente', () => {
  const filas = [filaSchema.parse({ ...base, orden: 1, tipo: 'fondo_reparo', monto: '640.000' })]
  assert.equal(loQueVeElCliente(filas).pendiente, 0)
})
