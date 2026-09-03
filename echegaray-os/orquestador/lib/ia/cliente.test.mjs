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

const { esperaDeReintento } = await import('./cliente.mjs')

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL REINTENTO NO PUEDE VOLVER EN BLOQUE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Desde que el pipeline de planos lee las láminas de a cuatro, un 429 llega a las cuatro casi a la
// vez. Sin jitter las cuatro dormían lo mismo y volvían juntas: el reintento reproducía el pico que
// causó el 429, y las lecturas que agotaban los intentos se degradaban — se perdía una lectura que
// el proveedor habría atendido si hubiera llegado sola.

test('la espera CRECE con cada intento', () => {
  const medio = () => 0.5
  const e0 = esperaDeReintento(0, 800, medio)
  const e1 = esperaDeReintento(1, 800, medio)
  const e2 = esperaDeReintento(2, 800, medio)
  assert.ok(e1 > e0 && e2 > e1, `tiene que crecer y dio ${e0}, ${e1}, ${e2}`)
  assert.equal(e1, e0 * 2, 'el crecimiento sigue siendo exponencial, el jitter no lo aplana')
})

test('la espera nunca es menos de la mitad ni más que la nominal de antes', () => {
  for (const intento of [0, 1, 2, 3]) {
    const nominal = 800 * 2 ** intento
    assert.equal(esperaDeReintento(intento, 800, () => 0), nominal / 2, 'el piso es la mitad: nunca martilla')
    assert.equal(esperaDeReintento(intento, 800, () => 1), nominal, 'el techo es lo que se esperaba antes del jitter')
  }
})

test('dos llamadas que fallan JUNTAS no vuelven juntas', () => {
  // Cuatro láminas en paralelo que reciben 429 en el mismo instante y reintentan a la vez.
  const azares = [0.13, 0.47, 0.68, 0.91]
  const esperas = azares.map((a) => esperaDeReintento(1, 700, () => a))
  assert.equal(new Set(esperas).size, 4, `las cuatro esperas tienen que ser distintas y dieron ${esperas}`)
  const rango = Math.max(...esperas) - Math.min(...esperas)
  assert.ok(rango > 500, `se tienen que separar de verdad y sólo se separaron ${rango} ms`)
})

test('un intento negativo no produce una espera absurda', () => {
  assert.equal(esperaDeReintento(-3, 800, () => 1), 800, 'se trata como el intento 0, no como 2^-3')
})
