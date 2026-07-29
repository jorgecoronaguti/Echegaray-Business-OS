// PR-4.2 · Tests de la GUARDA fail-fast del cliente Mattermost (resolverCliente).
// Herméticos: no tocan red ni DB. Garantizan que en producción NUNCA hay un
// fallback silencioso a FakeMattermost — el proceso debe fallar al arrancar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverCliente } from './conector.mjs'
import { MattermostCliente, FakeMattermost } from '../../../communication-service/src/index.mjs'

// Aísla process.env para cada caso (restaura al terminar).
function conEnv(vars, fn) {
  const previo = {}
  for (const k of Object.keys(vars)) { previo[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k] }
  try { return fn() } finally {
    for (const k of Object.keys(previo)) { if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k] }
  }
}

test('inyectado real (MattermostCliente) ⇒ tipo real', () => {
  const cli = new MattermostCliente({ baseUrl: 'http://x:8065', token: 'tok' })
  const r = resolverCliente({ cliente: cli })
  assert.equal(r.tipoCliente, 'real')
  assert.equal(r.cliente, cli)
})

test('inyectado Fake ⇒ tipo fake (explícito, permitido)', () => {
  const cli = new FakeMattermost()
  const r = resolverCliente({ cliente: cli })
  assert.equal(r.tipoCliente, 'fake')
  assert.equal(r.cliente, cli)
})

test('sin cliente + MM_BOT_TOKEN ⇒ construye cliente REAL', () => {
  conEnv({ MM_BOT_TOKEN: 'secreto', MM_BASE_URL: 'http://127.0.0.1:8065', COMM_DEV: undefined }, () => {
    const r = resolverCliente({})
    assert.equal(r.tipoCliente, 'real')
    assert.ok(r.cliente instanceof MattermostCliente)
  })
})

test('PRODUCCIÓN: sin cliente, sin token, sin dev ⇒ LANZA (no arranca, sin Fake)', () => {
  conEnv({ MM_BOT_TOKEN: undefined, COMM_DEV: undefined }, () => {
    assert.throws(() => resolverCliente({}), /cliente Mattermost REAL requerido|MM_BOT_TOKEN/)
  })
})

test('DEV: sin token pero COMM_DEV=1 ⇒ Fake explícito', () => {
  conEnv({ MM_BOT_TOKEN: undefined, COMM_DEV: '1' }, () => {
    const r = resolverCliente({})
    assert.equal(r.tipoCliente, 'fake')
    assert.ok(r.cliente instanceof FakeMattermost)
  })
})

test('DEV: sin token pero opts.permitirFake:true ⇒ Fake explícito', () => {
  conEnv({ MM_BOT_TOKEN: undefined, COMM_DEV: undefined }, () => {
    const r = resolverCliente({ permitirFake: true })
    assert.equal(r.tipoCliente, 'fake')
    assert.ok(r.cliente instanceof FakeMattermost)
  })
})

test('el cliente inyectado tiene prioridad sobre el token del entorno', () => {
  conEnv({ MM_BOT_TOKEN: 'secreto' }, () => {
    const cli = new FakeMattermost()
    const r = resolverCliente({ cliente: cli })
    assert.equal(r.cliente, cli) // se respeta el inyectado (tests), no se pisa con el real
  })
})
