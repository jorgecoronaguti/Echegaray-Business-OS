// Tests del cliente HTTP de Mattermost: el techo de tiempo de cada llamada.
//
// `abrirDialogo` y `actualizarPost` corren DENTRO del manejador HTTP de asistencia. Sin techo,
// un Mattermost que no contesta deja colgado el pedido del jefe de obra para siempre — y no hay
// forma de darse cuenta desde afuera. Todo con `fetch` inyectado: 0 red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MattermostCliente } from './mattermost-cliente.mjs'

const cfg = (fetch, extra = {}) => ({ baseUrl: 'http://mm:8065', token: 'tok', fetch, ...extra })
const respuesta = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
})

/** fetch que NUNCA contesta salvo que le aborten el signal. Es el servidor colgado. */
function fetchColgado() {
  const llamadas = []
  const fn = (url, opts) => new Promise((_, reject) => {
    llamadas.push({ url, opts })
    opts.signal.addEventListener('abort', () => {
      // Igual que `undici`: al abortar, la promesa del fetch rechaza con AbortError.
      const e = new Error('The operation was aborted')
      e.name = 'AbortError'
      reject(e)
    })
  })
  fn.llamadas = llamadas
  return fn
}

test('una llamada que no responde CORTA, no cuelga al jefe de obra para siempre', async () => {
  const cliente = new MattermostCliente(cfg(fetchColgado(), { timeoutMs: 20 }))
  await assert.rejects(
    () => cliente.actualizarPost({ id: 'p1', message: 'listo' }),
    (e) => {
      assert.equal(e.status, 504, 'es un timeout, no un 4xx del emisor')
      assert.match(e.message, /Mattermost no respondió/, 'el error dice qué pasó, no un AbortError pelado')
      assert.notEqual(e.name, 'AbortError')
      assert.equal(e.reintentable, true, 'un servidor que no contestó puede contestar en el reintento')
      return true
    },
  )
})

test('el signal viaja en el fetch: sin él no hay nada que abortar', async () => {
  const f = fetchColgado()
  const cliente = new MattermostCliente(cfg(f, { timeoutMs: 20 }))
  await assert.rejects(() => cliente.abrirDialogo({ trigger_id: 't', url: 'u', dialog: {} }))
  assert.ok(f.llamadas[0].opts.signal, 'el AbortController tiene que llegar al fetch')
})

test('el timeout es configurable: el worker y el bot no comparten la urgencia del manejador HTTP', () => {
  const c = new MattermostCliente(cfg(fetchColgado(), { timeoutMs: 90000 }))
  assert.equal(c.timeoutMs, 90000)
  const porDefecto = new MattermostCliente(cfg(fetchColgado()))
  assert.ok(porDefecto.timeoutMs >= 30000, 'default holgado: corta lo colgado, no lo lento')
})

test('una llamada que responde a tiempo sigue funcionando igual', async () => {
  const cliente = new MattermostCliente(cfg(async () => respuesta({ id: 'post_1' })))
  assert.deepEqual(await cliente.crearPost({ channel_id: 'c1', message: 'hola' }), { id: 'post_1' })
})

test('un error HTTP conserva su status y su clasificación — el timeout no se los come', async () => {
  const cliente = new MattermostCliente(cfg(async () => respuesta({ message: 'no existe' }, 404)))
  await assert.rejects(
    () => cliente.actualizarPost({ id: 'ausente', message: 'x' }),
    (e) => {
      assert.equal(e.status, 404)
      assert.equal(e.reintentable, false)
      return true
    },
  )
})

test('el timer se limpia en TODOS los caminos: el proceso no queda despierto de gusto', async () => {
  // Si un timeout quedara vivo, el test terminaría igual pero el worker se quedaría despierto
  // hasta que venciera. Contamos los timers creados y los cancelados en éxito, 4xx y excepción.
  const original = globalThis.clearTimeout
  let cancelados = 0
  globalThis.clearTimeout = (id) => { cancelados += 1; return original(id) }
  try {
    const ok = new MattermostCliente(cfg(async () => respuesta({ id: 'p' })))
    await ok.crearPost({ channel_id: 'c', message: 'a' })
    const malo = new MattermostCliente(cfg(async () => respuesta({ message: 'nope' }, 400)))
    await assert.rejects(() => malo.crearPost({ channel_id: 'c', message: 'a' }))
    const roto = new MattermostCliente(cfg(async () => { throw new Error('ECONNREFUSED') }))
    await assert.rejects(() => roto.crearPost({ channel_id: 'c', message: 'a' }))
  } finally {
    globalThis.clearTimeout = original
  }
  assert.equal(cancelados, 3, 'éxito, error HTTP y excepción: los tres limpian su timer')
})

// ── MEMBRESÍA DE CANAL ──────────────────────────────────────────────────────────────
// Es lo que convierte "estar en el canal" en una habilitación, así que su contrato es de
// seguridad: un 404 es un NO y cualquier otra cosa NO es un no. Verificado además en vivo contra
// el Mattermost de producción el 03/08 — el bot, que no es admin, contesta 200/404 para los
// canales de los que es miembro.

test('miembroDeCanal: 200 ⇒ true, 404 ⇒ false', async () => {
  const ok = new MattermostCliente(cfg(async () => respuesta({ user_id: 'u1', channel_id: 'c1' })))
  assert.equal(await ok.miembroDeCanal({ channel_id: 'c1', user_id: 'u1' }), true)
  const no = new MattermostCliente(cfg(async () => respuesta({ message: 'not found' }, 404)))
  assert.equal(await no.miembroDeCanal({ channel_id: 'c1', user_id: 'u1' }), false)
})

test('miembroDeCanal: un 500 o un token vencido NO se traducen a "no es miembro"', async () => {
  // Devolver `false` acá haría pasar una caída de Mattermost por una denegación limpia, y quien
  // llama perdería la única forma de distinguirla para fallar cerrado con el mensaje correcto.
  for (const status of [500, 401, 403]) {
    const cliente = new MattermostCliente(cfg(async () => respuesta({ message: 'x' }, status)))
    await assert.rejects(() => cliente.miembroDeCanal({ channel_id: 'c1', user_id: 'u1' }))
  }
})

test('miembroDeCanal pega en la ruta de miembros del canal, no en otra', async () => {
  const vistas = []
  const cliente = new MattermostCliente(cfg(async (url) => { vistas.push(url); return respuesta({}) }))
  await cliente.miembroDeCanal({ channel_id: 'c1', user_id: 'u1' })
  assert.equal(vistas[0], 'http://mm:8065/api/v4/channels/c1/members/u1')
})
