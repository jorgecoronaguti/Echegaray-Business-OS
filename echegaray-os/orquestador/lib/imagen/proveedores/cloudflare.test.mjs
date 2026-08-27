// WORKERS AI. Los tests cubren los dos dialectos de respuesta y cada modo de falla con su acción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aceptaMedida, aceptaNegativo, cuerpoDe, imagenCloudflare, medidaDe, urlDeModelo } from './cloudflare.mjs'

const conCredencial = (fn) => async () => {
  const prev = [process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN]
  process.env.CLOUDFLARE_ACCOUNT_ID = 'cuenta-1'
  process.env.CLOUDFLARE_API_TOKEN = 'token-1'
  try { await fn() } finally {
    if (prev[0] === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = prev[0]
    if (prev[1] === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = prev[1]
  }
}
const res = (body, { status = 200, tipo = 'application/json' } = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? tipo : null) },
  json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => body,
})

test('sin las dos variables NO está configurado — no se activa a medias', () => {
  const prev = process.env.CLOUDFLARE_ACCOUNT_ID
  delete process.env.CLOUDFLARE_ACCOUNT_ID
  assert.equal(imagenCloudflare.configurado(), false)
  if (prev !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = prev
})

test('16:9 pide una medida 16:9', () => {
  const { width, height } = medidaDe('16:9')
  assert.equal(width / height, 16 / 9)
})

test('la URL lleva la cuenta escapada y el modelo tal cual', () => {
  assert.equal(urlDeModelo('c 1', '@cf/x/y'), 'https://api.cloudflare.com/client/v4/accounts/c%201/ai/run/@cf/x/y')
})

test('a FLUX no se le manda la medida — con width/height contesta 400 y no genera nada', () => {
  assert.equal(aceptaMedida('@cf/black-forest-labs/flux-1-schnell'), false)
  assert.equal(aceptaMedida('@cf/stabilityai/stable-diffusion-xl-base-1.0'), true)
  const flux = cuerpoDe({ prompt: 'x', modelo: '@cf/black-forest-labs/flux-1-schnell' })
  assert.equal('width' in flux, false)
  assert.equal('height' in flux, false)
  const sd = cuerpoDe({ prompt: 'x', aspecto: '16:9', modelo: '@cf/stabilityai/stable-diffusion-xl-base-1.0' })
  assert.equal(sd.width, 1024)
  assert.equal(sd.height, 576)
})

test('el negativo sólo viaja si existe Y si el modelo lo acepta', () => {
  assert.equal('negative_prompt' in cuerpoDe({ prompt: 'x' }), false)
  // FLUX lo rechaza con un 400 que tumba la generación entera.
  assert.equal(aceptaNegativo('@cf/black-forest-labs/flux-1-schnell'), false)
  assert.equal('negative_prompt' in cuerpoDe({ prompt: 'x', negativo: 'texto', modelo: '@cf/black-forest-labs/flux-1-schnell' }), false)
  const sd = cuerpoDe({ prompt: 'x', negativo: 'texto', modelo: '@cf/stabilityai/stable-diffusion-xl-base-1.0' })
  assert.equal(sd.negative_prompt, 'texto')
})

test('dialecto JSON: la imagen sale de result.image', conCredencial(async () => {
  const r = await imagenCloudflare.generar({ prompt: 'obra', fetchImpl: async () => res({ result: { image: 'QUJD' }, success: true }) })
  assert.equal(r.imagenes[0].base64, 'QUJD')
  assert.equal(r.proveedor, 'cloudflare-workers-ai')
}))

test('dialecto BYTES: un PNG crudo también se acepta', conCredencial(async () => {
  const png = Buffer.alloc(2048, 3)
  const r = await imagenCloudflare.generar({ prompt: 'obra', fetchImpl: async () => res(png, { tipo: 'image/png' }) })
  assert.equal(r.imagenes[0].mime, 'image/png')
  assert.equal(Buffer.from(r.imagenes[0].base64, 'base64').length, 2048)
}))

test('un 200 sin imagen adentro no pasa por imagen', conCredencial(async () => {
  await assert.rejects(
    () => imagenCloudflare.generar({ prompt: 'x', fetchImpl: async () => res({ success: false, errors: [{ message: 'nope' }] }) }),
    (e) => e.falta === 'proveedor' && /nope/.test(e.message),
  )
}))

test('cada código HTTP se traduce a la acción que corresponde', conCredencial(async () => {
  for (const [status, falta] of [[401, 'credencial'], [403, 'credencial'], [429, 'cuota'], [404, 'modelo'], [500, 'proveedor']]) {
    await assert.rejects(
      () => imagenCloudflare.generar({ prompt: 'x', fetchImpl: async () => res({ errors: [] }, { status }) }),
      (e) => e.falta === falta,
      `HTTP ${status} debía dar falta=${falta}`,
    )
  }
}))

test('sin credencial no se hace un solo pedido a la red', async () => {
  const prev = [process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN]
  delete process.env.CLOUDFLARE_ACCOUNT_ID; delete process.env.CLOUDFLARE_API_TOKEN
  let pedidos = 0
  await assert.rejects(
    () => imagenCloudflare.generar({ prompt: 'x', fetchImpl: async () => { pedidos++; return res({}) } }),
    (e) => e.falta === 'credencial',
  )
  assert.equal(pedidos, 0)
  if (prev[0] !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = prev[0]
  if (prev[1] !== undefined) process.env.CLOUDFLARE_API_TOKEN = prev[1]
})
