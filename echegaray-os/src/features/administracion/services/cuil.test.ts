import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuilNormalizado, mismoCuil } from './cuil.ts'

test('cuilNormalizado deja sólo dígitos; vacío o sin dígitos es null', () => {
  assert.equal(cuilNormalizado('20-38218815-3'), '20382188153')
  assert.equal(cuilNormalizado(' 20 38218815 3 '), '20382188153')
  assert.equal(cuilNormalizado('20382188153'), '20382188153')
  assert.equal(cuilNormalizado(''), null)
  assert.equal(cuilNormalizado(null), null)
  assert.equal(cuilNormalizado('--'), null)
})

test('mismoCuil: «20-38218815-3» y «20382188153» son la misma persona; null nunca cruza', () => {
  assert.equal(mismoCuil('20-38218815-3', '20382188153'), true)
  assert.equal(mismoCuil('20-38218815-3', '20382188154'), false)
  assert.equal(mismoCuil(null, null), false, 'dos CUIL faltantes no son el mismo CUIL')
  assert.equal(mismoCuil('', ''), false)
})
