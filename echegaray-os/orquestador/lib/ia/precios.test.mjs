import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precioExacto, precioDeModelo } from './precios.mjs'
import { precioDe, estimateCostUsd } from '../../engines/anthropic-api.mjs'
import { usdEstimado } from './fusible.mjs'

test('una sola tabla: engine y fusible cobran igual el mismo modelo', () => {
  for (const m of ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-4-8']) {
    const e = estimateCostUsd(m, { input_tokens: 13_332, output_tokens: 1_292 })
    const f = usdEstimado(m, { in: 13_332, out: 1_292 })
    assert.equal(Math.round(e * 1e6), Math.round(f * 1e6), m)
  }
})

test('precios vigentes 26/09 y sufijo de fecha', () => {
  assert.deepEqual(precioExacto('claude-opus-5'), { in: 5, out: 25 })
  assert.deepEqual(precioExacto('claude-sonnet-5'), { in: 2, out: 10 })
  assert.deepEqual(precioExacto('claude-haiku-4-5-20251001'), { in: 1, out: 5 })
  assert.deepEqual(precioDe('claude-haiku-4-5-20251001'), { in: 1, out: 5 })
  assert.equal(precioExacto('claude-opus-9'), null)
  assert.deepEqual(precioDeModelo('claude-opus-9'), { in: 5, out: 25 })
  assert.equal(precioDeModelo('gpt-x'), null)
})
