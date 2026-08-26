import test from 'node:test'
import assert from 'node:assert/strict'
import { tasaDeConversion } from './tasaConversion.ts'

// EL DEFECTO QUE ATRAPA: contar los ABIERTOS en el denominador. Con tres cotizaciones enviadas y
// una ganada, la tasa caería a 25 % — o sea, cotizar más se leería como perder más.

test('la tasa se mide sobre los cerrados, no sobre todos', () => {
  const ps = [
    { estado: 'adjudicada' }, { estado: 'perdida' },
    { estado: 'enviada' }, { estado: 'borrador' },
  ]
  assert.equal(tasaDeConversion(ps), 50)
})

test('sin ningún cerrado no hay tasa: es silencio, no 0 %', () => {
  assert.equal(tasaDeConversion([{ estado: 'enviada' }, { estado: 'borrador' }]), null)
  assert.equal(tasaDeConversion([]), null)
})

test('los anulados no cuentan ni arriba ni abajo', () => {
  assert.equal(tasaDeConversion([{ estado: 'adjudicada' }, { estado: 'anulada' }]), 100)
})
