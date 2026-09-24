import test from 'node:test'
import assert from 'node:assert/strict'
import { versionQueVale } from './versionDelPresupuesto.ts'

test('se convierte la versión adjudicada aunque haya una recotización vigente más nueva (QP 23/09)', () => {
  const v = versionQueVale([
    { version: 4, estado: 'borrador', vigente: true }, { version: 3, estado: 'adjudicada', vigente: false },
    { version: 2, estado: 'perdida', vigente: false }, { version: 1, estado: 'adjudicada', vigente: false },
  ])
  assert.equal(v?.version, 3)
})

test('sin adjudicada, la vigente; sin versiones, null', () => {
  assert.equal(versionQueVale([{ version: 2, estado: 'borrador', vigente: false }, { version: 1, estado: 'borrador', vigente: true }])?.version, 1)
  assert.equal(versionQueVale([]), null)
})
