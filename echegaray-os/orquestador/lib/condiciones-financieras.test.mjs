import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costoEfectivo, paramsParaMotor, registrarCondicion } from './condiciones-financieras.mjs'

const DESCUBIERTO = {
  id: 1, entidad: 'Banco Santander', producto: 'Acuerdo N°00007', tipo_financiacion: 'descubierto',
  tna: 0.55, iva_sobre_intereses: 0.12, limite_disponible: 18200000, saldo_utilizado: 0,
  nivel_confianza: 'verificado', fuente: 'extracto',
}

test('costoEfectivo del descubierto: intereses + IVA, y el efectivo anual sale del CFT real', () => {
  const r = costoEfectivo(DESCUBIERTO, { monto: 1000000, dias: 30 })
  // interés = 1.000.000 × (0,55/365) × 30 = 45.205; IVA 12% = 5.425; total ≈ 50.630
  assert.equal(r.intereses, 45205)
  assert.equal(r.iva, 5425)
  assert.equal(r.costo_total, 50630)
  assert.equal(r.falta.length, 0)
  // efectivo anual ≈ 50.630/1.000.000/30 × 365 ≈ 0,616 (coherente con el CFT ~62%)
  assert.ok(r.costo_efectivo_anual > 0.6 && r.costo_efectivo_anual < 0.63)
})

test('sin TNA, una línea de financiación NO inventa el costo: lo dice y apunta a la fuente', () => {
  const r = costoEfectivo(
    { entidad: 'Santander', producto: 'Préstamo prendario', tipo_financiacion: 'prestamo', tna: null, observaciones: 'está en el contrato' },
    { monto: 1000000, dias: 30 })
  assert.equal(r.costo_total, null)
  assert.deepEqual(r.falta, ['tna'])
  assert.match(r.para_conseguirlo, /contrato/)
})

test('un impuesto (Ley 25.413) no necesita TNA: no se marca como faltante', () => {
  const r = costoEfectivo(
    { entidad: 'ARCA', producto: 'Ley 25.413', tipo_financiacion: 'impuesto', tna: null, cft: 0.006 },
    { monto: 1000000, dias: 1 })
  assert.equal(r.falta.length, 0)
})

test('paramsParaMotor: el descubierto aporta el límite disponible neto del saldo usado', () => {
  const { params } = paramsParaMotor([{ ...DESCUBIERTO, saldo_utilizado: 2000000 }])
  assert.equal(params.limiteDescubiertoDisp, 16200000)
})

test('paramsParaMotor: una tasa conocida se pasa; una que falta se lista para conseguir, no se inventa', () => {
  const { params, faltan } = paramsParaMotor([
    DESCUBIERTO,
    { entidad: 'X', producto: 'Descuento de cheques', tipo_financiacion: 'descuento_cheque', tna: 0.60 },
    { entidad: 'Santander', producto: 'Préstamo prendario', tipo_financiacion: 'prestamo', tna: null, observaciones: 'pedir liquidación' },
  ])
  assert.equal(params.tasaDescuentoChequeTNA, 0.60)
  assert.equal(params.tasaPrestamoTNA, undefined) // no se conoce → no se pasa
  assert.ok(faltan.some((f) => f.tipo === 'prestamo' && /liquidaci/.test(f.para_conseguirlo)))
})

test('un préstamo YA DESEMBOLSADO (sin línea disponible) no se ofrece como financiación nueva, aunque tenga tasa', () => {
  // El prendario real: tasa verificada 38,9% pero limite_disponible 0 (capital ya acreditado, cuotas
  // en curso). Se registra, pero el motor NO debe ofrecerlo para cubrir un bache: no se puede tomar.
  const { params, faltan } = paramsParaMotor([
    { entidad: 'Santander', producto: 'Prendario Ranger', tipo_financiacion: 'prestamo', tna: 0.389, limite_disponible: 0 },
  ])
  assert.equal(params.tasaPrestamoTNA, undefined) // no se ofrece
  assert.equal(faltan.length, 0) // tampoco es un "faltante de dato": la tasa está, sólo que no es una línea
})

test('un préstamo con LÍNEA disponible sí se ofrece como financiación nueva', () => {
  const { params } = paramsParaMotor([
    { entidad: 'X', producto: 'Línea', tipo_financiacion: 'prestamo', tna: 0.5, limite_disponible: 10000000 },
  ])
  assert.equal(params.tasaPrestamoTNA, 0.5)
})

test('registrarCondicion exige fuente: no se carga una tasa sin decir de dónde salió', async () => {
  const r = await registrarCondicion({ query: async () => ({ rows: [] }) },
    { entidad: 'X', producto: 'Y', tipo_financiacion: 'prestamo', tna: 0.7 }) // sin fuente
  assert.equal(r.ok, false)
  assert.match(r.motivo, /fuente/)
})

test('registrarCondicion con fuente hace upsert (no rompe el proceso ante error de DB)', async () => {
  let sql = ''
  const ok = await registrarCondicion({ query: async (q) => { sql = q; return { rows: [] } } },
    { entidad: 'X', producto: 'Y', tipo_financiacion: 'prestamo', tna: 0.7, fuente: 'contrato 2026' })
  assert.equal(ok.ok, true)
  assert.match(sql, /on conflict/)
})
