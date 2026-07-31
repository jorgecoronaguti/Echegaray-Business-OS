// LA IDENTIDAD Y LOS ERRORES: las dos cosas de Google que, mal resueltas, no se ven.
//
// Ningún test toca Google ni la base: `googleDe` recibe dobles por `deps`. Un test que
// resolviera la cuenta de verdad estaría consultando orq.google_tokens de producción para
// probar un `if`.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  googleDe, googleDisponible, googlePropioDisponible, cuentaDe, permiteEfectoExterno,
  clasificarErrorGoogle, sinSecretos, errorSinCuenta, CUENTA,
} from './google-cliente.mjs'
import { ERROR } from './contratos.mjs'

const identidad = (email) => ({ plataformaUserId: 'u1', nombreVisible: 'Rodrigo', email })

/** Dobles: nadie construye un cliente real ni pide un token real. */
function deps({ operador = null } = {}) {
  const usos = []
  return {
    usos,
    operadorPara: async (email) => { usos.push(email); return operador },
    getTokenFor: (cuenta) => async () => `token-de-${cuenta}`,
    loadConfig: () => ({ fake: true }),
    crearCliente: (config, getToken) => ({ config, getToken, searchFile: async () => [] }),
  }
}

test('la cuenta propia gana: el cliente queda marcado como propio', async () => {
  const d = deps({ operador: 'rodrigo@ecsas.com.ar' })
  const g = await googleDe({ identidad: identidad('Rodrigo@ecsas.com.ar'), config: {}, deps: d })
  assert.deepEqual(cuentaDe(g), { email: 'rodrigo@ecsas.com.ar', propia: true })
  assert.equal(permiteEfectoExterno(g), true)
})

test('si el que pide no autorizó, se cae a la operadora y el cliente NO puede escribir en su agenda', async () => {
  const d = deps({ operador: 'jorge@ecsas.com.ar' })
  const g = await googleDe({ identidad: identidad('rodrigo@ecsas.com.ar'), config: {}, deps: d })
  assert.equal(cuentaDe(g).propia, false)
  assert.equal(permiteEfectoExterno(g), false)
})

test('sin ninguna cuenta utilizable, googleDe devuelve null (no un cliente que va a fallar)', async () => {
  const g = await googleDe({ identidad: identidad('rodrigo@ecsas.com.ar'), config: {}, deps: deps({ operador: null }) })
  assert.equal(g, null)
})

test('un cliente sin marca de cuenta no se bloquea: la identidad la decide quien la conoce', () => {
  assert.equal(permiteEfectoExterno({ searchFile: async () => [] }), true)
  assert.equal(cuentaDe({}), null)
})

test('googleDisponible: false sin cuenta conectada, true con cliente en el contexto', async () => {
  const sin = { hayCuentaAutorizada: async () => false }
  assert.equal(await googleDisponible({ identidad: identidad('r@ecsas.com.ar') }, sin), false)
  assert.equal(await googleDisponible({ google: {} }, sin), true)
})

test('googlePropioDisponible: false si la persona no conectó SU cuenta, aunque el OS tenga otra', async () => {
  const conOtra = { tieneToken: async () => false }
  const ctx = { identidad: identidad('rodrigo@ecsas.com.ar'), google: { [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: false } } }
  assert.equal(await googlePropioDisponible(ctx, conOtra), false)
  assert.equal(await googlePropioDisponible({ identidad: identidad('r@ecsas.com.ar') }, { tieneToken: async () => true }), true)
  assert.equal(await googlePropioDisponible({ identidad: {} }, { tieneToken: async () => true }), false)
})

test('401 y invalid_grant son "conectá tu Google", no un stack en el chat', () => {
  const e = Object.assign(new Error('google api 401: {"error":"invalid_token"}'), { status: 401 })
  const err = clasificarErrorGoogle(e)
  assert.equal(err.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.match(err.mensaje, /Conectar con Google/)
  assert.equal(err.reintentable, false)
  assert.ok(!/stack|at Object/.test(err.mensaje))
  assert.equal(clasificarErrorGoogle(new Error('invalid_grant: token expired')).codigo, ERROR.GOOGLE_SIN_ACCESO)
})

test('429 y 503 son temporales y reintentables; 404 es no encontrado', () => {
  const t = clasificarErrorGoogle(Object.assign(new Error('google api 429: quota'), { status: 429 }))
  assert.equal(t.codigo, ERROR.TEMPORAL)
  assert.equal(t.reintentable, true)
  assert.equal(clasificarErrorGoogle(Object.assign(new Error('boom'), { status: 503 })).codigo, ERROR.TEMPORAL)
  const nf = clasificarErrorGoogle(Object.assign(new Error('google api 404'), { status: 404 }), { que: 'el archivo' })
  assert.equal(nf.codigo, ERROR.NO_ENCONTRADO)
  assert.match(nf.mensaje, /el archivo/)
})

test('lo que no se reconoce es definitivo, no temporal (no se reintenta a ciegas)', () => {
  const e = clasificarErrorGoogle(new Error('algo raro'))
  assert.equal(e.codigo, ERROR.DEFINITIVO)
  assert.equal(e.reintentable, false)
})

test('la credencial ausente se lee como falta de acceso y dice qué configurar', () => {
  const e = clasificarErrorGoogle(new Error('credencial de Google ausente: falta el key JSON'))
  assert.equal(e.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.match(errorSinCuenta().detalle, /GOOGLE_OAUTH_CLIENT_ID/)
})

test('ningún token llega al detalle que se loguea', () => {
  const crudo = 'google api 400: {"refresh_token":"1//04abc","access_token":"ya29.a0AfB_x"} Bearer ya29.zzz'
  const limpio = sinSecretos(crudo)
  assert.ok(!limpio.includes('1//04abc'), limpio)
  assert.ok(!limpio.includes('ya29.a0AfB_x'), limpio)
  assert.ok(!/Bearer ya29\.zzz/.test(limpio), limpio)
  const err = clasificarErrorGoogle(new Error(crudo))
  assert.ok(!err.detalle.includes('1//04abc'))
})
