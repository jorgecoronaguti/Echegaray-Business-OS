// El proxy `/api/os/*` niega por defecto (auditoría 25/09/2026). Ver `reglasDelProxy.ts`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirProxy, origenPermitido } from './reglasDelProxy.ts'

test('las abiertas pasan sin credencial', () => {
  for (const p of [['health'], ['version'], [], ['index.html'], ['extension.zip'], ['oauth', 'start']]) {
    assert.deepEqual(decidirProxy(p, null), { pasa: true }, p.join('/'))
  }
})

test('las protegidas exigen Authorization antes de salir a la red', () => {
  for (const p of [['ask'], ['pending'], ['operation'], ['schedule', 'toggle'], ['result'], ['cost']]) {
    assert.deepEqual(decidirProxy(p, null), { pasa: false, status: 401, error: 'no autorizado' }, p.join('/'))
    assert.deepEqual(decidirProxy(p, 'Bearer  '), { pasa: false, status: 401, error: 'no autorizado' })
    assert.deepEqual(decidirProxy(p, 'Bearer abc'), { pasa: true })
  }
})

test('lo desconocido es 404 aunque traiga credencial, incluido el canje de OAuth', () => {
  for (const p of [['oauth', 'exchange'], ['admin'], ['..', 'etc'], ['ask', 'x'], ['health', 'x']]) {
    const d = decidirProxy(p, 'Bearer abc')
    assert.equal(d.pasa, false, p.join('/'))
    if (!d.pasa) assert.equal(d.status, 404)
  }
})

test('CORS sólo para el origen de la app', () => {
  assert.equal(origenPermitido('https://app.ecsas.com.ar'), 'https://app.ecsas.com.ar')
  assert.equal(origenPermitido('https://evil.example'), null)
  assert.equal(origenPermitido(null), null)
  assert.equal(origenPermitido('https://app.ecsas.com.ar.evil.example'), null)
})
