import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decisionAplicarEnProduccion } from './migracion-candados.mjs'

const base = { aplicar: true, remota: true, fetchOk: true, enOriginMain: true, hashOrigin: 'abc', hashLocal: 'abc' }
test('sólo se aplica a una base remota lo que está en origin/main, byte por byte', () => {
  assert.equal(decisionAplicarEnProduccion(base).seguir, true)
  assert.equal(decisionAplicarEnProduccion({ ...base, enOriginMain: false }).seguir, false)
  assert.match(decisionAplicarEnProduccion({ ...base, enOriginMain: false }).motivo, /origin\/main/)
  assert.equal(decisionAplicarEnProduccion({ ...base, hashLocal: 'zzz' }).seguir, false)
  assert.equal(decisionAplicarEnProduccion({ ...base, fetchOk: false }).seguir, false)
})
test('una base local no tiene candado; un ensayo remoto pasa con aviso', () => {
  assert.equal(decisionAplicarEnProduccion({ ...base, remota: false, enOriginMain: false }).seguir, true)
  const e = decisionAplicarEnProduccion({ ...base, aplicar: false, enOriginMain: false })
  assert.equal(e.seguir, true); assert.match(e.aviso, /ensayo/)
})
