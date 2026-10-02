// LA REGLA ÚNICA DEL NÚMERO DE RECIBO: la misma que `public.codigo_de_recibo` (20261002T1200).
import test from 'node:test'
import assert from 'node:assert/strict'
import { codigoDeRecibo, leerCodigoDeRecibo, rotuloDelNumero } from './codigoDeRecibo.ts'

test('serie, guion y seis dígitos de relleno', () => {
  assert.equal(codigoDeRecibo('RP', 1), 'RP-000001')
  assert.equal(codigoDeRecibo('RP', 123), 'RP-000123')
  assert.equal(codigoDeRecibo('RC', 20), 'RC-000020')
  assert.equal(codigoDeRecibo('RP', 999999), 'RP-999999')
})

test('seis dígitos son relleno, no tope: el número grande sale entero y no truncado', () => {
  // `lpad` de Postgres truncaba a seis: el 1.234.567 salía «123456», un recibo que ya existe.
  assert.equal(codigoDeRecibo('RP', 1234567), 'RP-1234567')
})

test('un número que no es entero positivo no da código: nada de inventar', () => {
  for (const malo of [0, -3, 1.5, Number.NaN, '12', null, undefined]) {
    assert.equal(codigoDeRecibo('RP', malo), null, String(malo))
  }
})

test('leer de vuelta: sólo esta numeración, y la ida y la vuelta coinciden', () => {
  assert.deepEqual(leerCodigoDeRecibo(' RP-000123 '), { serie: 'RP', numero: 123 })
  assert.deepEqual(leerCodigoDeRecibo('RC-1234567'), { serie: 'RC', numero: 1234567 })
  // El código anterior (columna generada por año) no es de esta serie.
  assert.equal(leerCodigoDeRecibo('REC-2026-0003'), null)
  assert.equal(leerCodigoDeRecibo('RP-123'), null)
  assert.equal(leerCodigoDeRecibo('RP-000000'), null)
  assert.equal(leerCodigoDeRecibo(42), null)
  for (const n of [1, 77, 999999, 1000000]) {
    const c = codigoDeRecibo('RP', n)
    assert.deepEqual(leerCodigoDeRecibo(c), { serie: 'RP', numero: n })
  }
})

test('el papel: con código dice su número; sin guardar dice «N° al guardar», nunca un número previsto', () => {
  assert.equal(rotuloDelNumero('RP-000123'), 'Recibo N° RP-000123')
  assert.equal(rotuloDelNumero(null), 'N° al guardar')
  assert.equal(rotuloDelNumero(undefined), 'N° al guardar')
  assert.equal(rotuloDelNumero('  '), 'N° al guardar')
})

