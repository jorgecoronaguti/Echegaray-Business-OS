import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPACIDAD, pedirTexto, pedirTextoONull } from './cliente.mjs'

// El cliente se prueba con un `fetch` inyectado: sin red, sin base y sin gastar un token. Lo que se
// verifica es el COMPORTAMIENTO que el mandato exige — reintentar sólo lo reintentable, no esconder
// un bug con un reintento, y que la capacidad elija el modelo sin que el caller lo nombre.

const ok = (texto = 'listo', modelo = 'claude-haiku-4-5') => ({
  ok: true,
  json: async () => ({ content: [{ type: 'text', text: texto }], model: modelo, usage: { input_tokens: 10, output_tokens: 5 } }),
})
const falla = (status, cuerpo = '') => ({ ok: false, status, text: async () => cuerpo })

const base = { mensajes: [{ role: 'user', content: 'hola' }], agente: 'test', funcion: 'unitario', reintentos: 2 }

test('devuelve el texto, el modelo real y los tokens', async () => {
  const r = await pedirTexto({ ...base, fetchImpl: async () => ok('respuesta'), apiKey: 'k' })
  assert.equal(r.texto, 'respuesta')
  assert.equal(r.proveedor, 'anthropic')
  assert.deepEqual(r.tokens, { in: 10, out: 5 })
  assert.equal(r.intentos, 1)
})

test('la CAPACIDAD elige el modelo — el caller nunca nombra uno', async () => {
  const vistos = []
  const espia = async (_u, init) => { vistos.push(JSON.parse(init.body).model); return ok() }
  await pedirTexto({ ...base, capacidad: CAPACIDAD.SIMPLE, fetchImpl: espia, apiKey: 'k' })
  await pedirTexto({ ...base, capacidad: CAPACIDAD.COMPLEX, fetchImpl: espia, apiKey: 'k' })
  assert.match(vistos[0], /haiku/)
  assert.match(vistos[1], /opus/)
})

test('el override del dueño gana sobre la capacidad', async () => {
  let visto = null
  await pedirTexto({
    ...base, capacidad: CAPACIDAD.SIMPLE, modelo: 'claude-opus-5', apiKey: 'k',
    fetchImpl: async (_u, init) => { visto = JSON.parse(init.body).model; return ok() },
  })
  assert.equal(visto, 'claude-opus-5')
})

test('un 429 se reintenta y termina saliendo bien', async () => {
  let n = 0
  const r = await pedirTexto({
    ...base, apiKey: 'k',
    fetchImpl: async () => { n++; return n < 3 ? falla(429) : ok('salió') },
  })
  assert.equal(r.texto, 'salió')
  assert.equal(n, 3)
  assert.equal(r.intentos, 3)
})

test('UN BUG NUESTRO no se reintenta: se llama UNA vez y se propaga', async () => {
  let n = 0
  await assert.rejects(
    () => pedirTexto({ ...base, apiKey: 'k', fetchImpl: async () => { n++; return falla(400, 'messages: expected array') } }),
    (e) => e.clasificacion.kind === 'client' && e.clasificacion.reintentable === false,
  )
  assert.equal(n, 1, 'reintentar un pedido mal armado lo esconde y gasta cuota')
})

test('sin saldo no se reintenta — no hay espera que devuelva el crédito', async () => {
  let n = 0
  await assert.rejects(
    () => pedirTexto({ ...base, apiKey: 'k', fetchImpl: async () => { n++; return falla(400, 'Your credit balance is too low') } }),
    (e) => e.clasificacion.kind === 'credit',
  )
  assert.equal(n, 1)
})

test('los reintentos tienen tope duro: un proveedor caído no da un bucle infinito', async () => {
  let n = 0
  await assert.rejects(
    () => pedirTexto({ ...base, apiKey: 'k', reintentos: 2, fetchImpl: async () => { n++; return falla(503) } }),
    (e) => e.clasificacion.kind === 'server',
  )
  assert.equal(n, 3, 'el intento original + 2 reintentos, y para')
})

test('sin credencial falla rápido y no llama a nadie', async () => {
  let n = 0
  await assert.rejects(
    () => pedirTexto({ ...base, apiKey: '', fetchImpl: async () => { n++; return ok() } }),
    (e) => e.clasificacion.kind === 'auth',
  )
  assert.equal(n, 0)
})

test('pedirTextoONull degrada a null sin lanzar — el chat sigue vivo', async () => {
  assert.equal(await pedirTextoONull({ ...base, apiKey: 'k', reintentos: 0, fetchImpl: async () => falla(500) }), null)
  assert.equal(await pedirTextoONull({ ...base, apiKey: 'k', fetchImpl: async () => ok('hay') }), 'hay')
})

test('un refusal (respuesta sin bloques de texto) devuelve cadena vacía, no rompe', async () => {
  const r = await pedirTexto({
    ...base, apiKey: 'k',
    fetchImpl: async () => ({ ok: true, json: async () => ({ content: [], model: 'm', usage: {} }) }),
  })
  assert.equal(r.texto, '')
})
