// EL ESPEJO SE DISPARA CUANDO SE ESCRIBIÓ, Y EL ACUSE NO PROMETE LO QUE NO PASÓ.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { hayQueEspejar, dispararEspejo, avisoDeEspejo, UNIDAD } from './espejo.mjs'

/** Un `spawn` de mentira: registra la llamada y termina con el código pedido. */
function spawnFalso({ code = 0, stderr = '', demoraMs = 0, lanza = null } = {}) {
  const llamadas = []
  const impl = (cmd, args, opts) => {
    llamadas.push({ cmd, args, opts })
    if (lanza) throw new Error(lanza)
    const p = new EventEmitter()
    p.stdout = new EventEmitter(); p.stderr = new EventEmitter()
    p.kill = () => { p.matado = true }
    p.unref = () => { p.desenganchado = true }
    setTimeout(() => {
      if (stderr) p.stderr.emit('data', stderr)
      p.emit('close', code)
    }, demoraMs)
    return p
  }
  impl.llamadas = llamadas
  return impl
}

const CON_SYSTEMD = { XDG_RUNTIME_DIR: '/run/user/1001' }

test('hayQueEspejar: sólo con filas nuevas y fuera del ensayo', () => {
  assert.equal(hayQueEspejar({ filasNuevas: 1 }), true)
  assert.equal(hayQueEspejar({ filasNuevas: 5 }), true)
  // EL FAJO QUE CERRÓ COMO `ya_cargados` NO ESCRIBIÓ NADA: no hay nada que espejar.
  assert.equal(hayQueEspejar({ filasNuevas: 0 }), false)
  assert.equal(hayQueEspejar({}), false)
  // El ensayo corre el cargador con --dry: no tocó una celda.
  assert.equal(hayQueEspejar({ ensayo: true, filasNuevas: 3 }), false)
})

test('con filas escritas se pide la unidad de systemd y el acuse dice que ya se ve', async () => {
  const spawn = spawnFalso({ code: 0 })
  const r = await dispararEspejo({ spawn, env: CON_SYSTEMD }, { filasNuevas: 2 })
  assert.equal(spawn.llamadas.length, 1)
  assert.equal(spawn.llamadas[0].cmd, 'systemctl')
  assert.deepEqual(spawn.llamadas[0].args, ['--user', 'start', UNIDAD])
  assert.equal(r.pedido, true)
  assert.equal(r.ok, true)
  assert.equal(r.via, 'systemd')
  assert.match(avisoDeEspejo(r), /Ya se ve/)
})

test('un fajo que ya estaba cargado NO dispara nada y no le cuenta nada al dueño', async () => {
  const spawn = spawnFalso({ code: 0 })
  const r = await dispararEspejo({ spawn, env: CON_SYSTEMD }, { filasNuevas: 0 })
  assert.equal(spawn.llamadas.length, 0, 'no se puede quemar una corrida del sync sin nada que espejar')
  assert.equal(r.pedido, false)
  assert.equal(avisoDeEspejo(r), null)
})

test('un ensayo tampoco dispara: el cargador corrió con --dry', async () => {
  const spawn = spawnFalso({ code: 0 })
  const r = await dispararEspejo({ spawn, env: CON_SYSTEMD }, { ensayo: true, filasNuevas: 4 })
  assert.equal(spawn.llamadas.length, 0)
  assert.equal(r.pedido, false)
})

test('si la unidad falla, el acuse NO dice que ya se ve: promete el plazo del timer', async () => {
  const spawn = spawnFalso({ code: 1, stderr: 'Job for echegaray-compras-sync.service failed' })
  const r = await dispararEspejo({ spawn, env: CON_SYSTEMD }, { filasNuevas: 1 })
  assert.equal(r.pedido, true)
  assert.equal(r.ok, false)
  assert.equal(r.via, 'systemd', 'un sync que falló no se relanza suelto por otra vía: se informa')
  assert.equal(spawn.llamadas.length, 1)
  const aviso = avisoDeEspejo(r, { cadaMinutos: 10 })
  assert.doesNotMatch(aviso, /Ya se ve/)
  assert.match(aviso, /menos de 10 minutos/)
})

test('si tarda más de la espera, se corta el cliente y el acuse baja la promesa', async () => {
  const spawn = spawnFalso({ code: 0, demoraMs: 400 })
  const r = await dispararEspejo({ spawn, env: CON_SYSTEMD, esperaMs: 30 }, { filasNuevas: 1 })
  assert.equal(r.ok, false)
  assert.match(r.detalle, /se pasó de/)
  assert.doesNotMatch(avisoDeEspejo(r), /Ya se ve/)
})

test('sin systemd de usuario se lanza suelto, detached, y el acuse no afirma nada', async () => {
  const spawn = spawnFalso({ code: 0 })
  const r = await dispararEspejo({ spawn, env: {} }, { filasNuevas: 1 })
  assert.equal(spawn.llamadas.length, 1)
  assert.notEqual(spawn.llamadas[0].cmd, 'systemctl')
  assert.equal(spawn.llamadas[0].opts.detached, true)
  assert.equal(r.via, 'spawn')
  assert.equal(r.ok, false, 'nadie lo esperó: no se puede afirmar que terminó')
  assert.match(avisoDeEspejo(r), /menos de/)
})

test('systemctl que no encuentra el bus cae al respaldo; uno que falla de verdad, no', async () => {
  const spawn = spawnFalso({ code: 1, stderr: 'Failed to connect to bus: No such file or directory' })
  const r = await dispararEspejo({ spawn, env: CON_SYSTEMD }, { filasNuevas: 1 })
  assert.equal(spawn.llamadas.length, 2, 'systemctl y después el respaldo')
  assert.equal(r.via, 'spawn')
})

test('si el spawn ni siquiera arranca, no se rompe la carga', async () => {
  const spawn = spawnFalso({ lanza: 'ENOENT' })
  const r = await dispararEspejo({ spawn, env: {} }, { filasNuevas: 1 })
  assert.equal(r.pedido, true)
  assert.equal(r.ok, false)
  assert.match(avisoDeEspejo(r), /menos de/)
})

// ═══ EL DISPARO NO PUEDE SALIRSE DE PRODUCCIÓN ═══
import { disparadorDeEspejo } from './escritura.mjs'

test('sin el cliente de Google —o sea, fuera del bot real— el disparador no hace nada', async () => {
  const r = await disparadorDeEspejo({})({}, { filasNuevas: 3 })
  assert.equal(r.pedido, false, 'un test unitario no puede arrancar el sync de producción')
})

test('con el cliente de Google en la mano, el disparador ES el real', () => {
  assert.equal(disparadorDeEspejo({ google: {} }), dispararEspejo)
})

test('lo inyectado gana siempre', () => {
  const mio = async () => ({ pedido: true, ok: true })
  assert.equal(disparadorDeEspejo({ google: {}, espejar: mio }), mio)
})
