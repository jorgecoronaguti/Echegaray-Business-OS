// `temperature` DEPRECADO: EL REINTENTO QUE NO PUEDE VOLVERSE UN REINTENTO A CIEGAS.
//
// Medido contra la API real: `temperatura: 0` con la capacidad COMPLEX (opus) devuelve
// `400 · temperature is deprecated for this model`; con haiku anda. El defecto es latente —los dos
// llamadores vivos van a haiku— y muerde el día que alguien rutee uno a COMPLEX. Ese día no se ve
// como «cambió el modelo»: se ve como que el bot dejó de entender.
//
// El riesgo del arreglo es peor que el defecto si se hace mal: un reintento que no discrimina
// convierte un 400 de SALDO en dos llamadas y el mismo fallo, y esconde el motivo real. Estos tests
// fijan las dos mitades — que reintente ante ESTE error, y que NO reintente ante ningún otro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anthropic } from './anthropic.mjs'

const OK = { content: [{ type: 'text', text: 'listo' }], model: 'm', usage: { input_tokens: 1, output_tokens: 1 } }
const respuesta = (ok, cuerpo, status = 200) => ({
  ok, status,
  json: async () => cuerpo,
  text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
})

/** Un fetch de mentira que graba cada cuerpo que le mandaron. */
function espia(respuestas) {
  const cuerpos = []
  const impl = async (_url, opts) => { cuerpos.push(JSON.parse(opts.body)); return respuestas[cuerpos.length - 1] }
  return { impl, cuerpos }
}

const base = { modelo: 'claude-opus-5', mensajes: [{ role: 'user', content: 'hola' }], apiKey: 'k' }

test('anthropic · ante «temperature is deprecated» reintenta UNA vez sin el parámetro', async () => {
  const e = espia([
    respuesta(false, '{"error":{"message":"`temperature` is deprecated for this model"}}', 400),
    respuesta(true, OK),
  ])
  const r = await anthropic.completar({ ...base, temperatura: 0, fetchImpl: e.impl })
  assert.equal(r.texto, 'listo')
  assert.equal(e.cuerpos.length, 2)
  assert.equal(e.cuerpos[0].temperature, 0)          // la primera la mandó
  assert.equal('temperature' in e.cuerpos[1], false) // la segunda la sacó, no la puso en null
})

test('anthropic · un 400 de SALDO no se reintenta, y conserva su motivo', async () => {
  // Es el modo de falla que más caro sale: reintentar a ciegas duplica el gasto de una llamada que
  // iba a fallar igual, y el mensaje que llega arriba deja de decir «saldo».
  const e = espia([respuesta(false, '{"error":{"message":"Your credit balance is too low"}}', 400)])
  await assert.rejects(
    () => anthropic.completar({ ...base, temperatura: 0, fetchImpl: e.impl }),
    (err) => err.status === 400 && /credit balance/.test(err.message),
  )
  assert.equal(e.cuerpos.length, 1, 'reintentó un error que no era de temperatura')
})

test('anthropic · un 400 que menciona temperature pero NO la deprecación tampoco se reintenta', async () => {
  // «temperature: must be <= 1» es un error del llamador: reintentar sin el parámetro lo taparía y
  // el llamador nunca se enteraría de que manda un valor inválido.
  const e = espia([respuesta(false, '{"error":{"message":"temperature: must be less than or equal to 1"}}', 400)])
  await assert.rejects(() => anthropic.completar({ ...base, temperatura: 5, fetchImpl: e.impl }))
  assert.equal(e.cuerpos.length, 1)
})

test('anthropic · sin temperatura no hay reintento posible, y el error sube tal cual', async () => {
  const e = espia([respuesta(false, '{"error":{"message":"`temperature` is deprecated"}}', 400)])
  await assert.rejects(() => anthropic.completar({ ...base, fetchImpl: e.impl }))
  assert.equal(e.cuerpos.length, 1)
})

test('anthropic · el reintento no se encadena: si el segundo también falla, falla y punto', async () => {
  const e = espia([
    respuesta(false, '{"error":{"message":"`temperature` is deprecated for this model"}}', 400),
    respuesta(false, '{"error":{"message":"overloaded"}}', 529),
  ])
  await assert.rejects(
    () => anthropic.completar({ ...base, temperatura: 0, fetchImpl: e.impl }),
    (err) => err.status === 529,
  )
  assert.equal(e.cuerpos.length, 2, 'reintentó más de una vez')
})

test('anthropic · el camino feliz sigue mandando la temperatura y no reintenta nada', async () => {
  const e = espia([respuesta(true, OK)])
  await anthropic.completar({ ...base, temperatura: 0.7, fetchImpl: e.impl })
  assert.equal(e.cuerpos.length, 1)
  assert.equal(e.cuerpos[0].temperature, 0.7)
})
