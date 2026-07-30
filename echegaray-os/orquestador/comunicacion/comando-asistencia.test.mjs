// Tests del slash command, del servidor local y de la confirmación en el canal.
// Sin red hacia afuera (el servidor se levanta en 127.0.0.1 con puerto efímero), sin base
// productiva (el `port` es un doble) y sin secretos reales.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  crearComandoAsistencia, publicarConfirmacion, canalDeArea, textoConfirmacion, textoInvitacion,
  AREA_ASISTENCIA, TEXTO,
} from './comando-asistencia.mjs'
import { crearServidorAsistencia, soloRuta } from './servidor-asistencia.mjs'
import { verificarEnlace } from './enlace-firmado.mjs'

const TOKEN_COMANDO = 'token-de-comando-solo-de-test-0123456789'
const SECRETO = 'secreto-de-test-nunca-el-de-produccion-0123456789'
const URL_BASE = 'https://chat.ejemplo.test'
const CANAL = 'canal-de-prueba-no-es-un-id-real'

const campos = (extra = {}) => ({
  token: TOKEN_COMANDO, command: '/asistencia', user_id: 'usuario-1', user_name: 'jefe', ...extra,
})

const comando = (extra = {}) => crearComandoAsistencia({
  tokenComando: TOKEN_COMANDO, secretoEnlace: SECRETO, urlBase: URL_BASE,
  verificarPermiso: async () => ({ ok: true, modo: 'abierto' }),
  ...extra,
})

// ── el comando ──────────────────────────────────────────────────────────────────

test('respuesta EPHEMERAL: sólo la ve quien escribió el comando', async () => {
  const r = await comando()({ campos: campos() })
  assert.equal(r.status, 200)
  assert.equal(r.body.response_type, 'ephemeral', 'sin esto el enlace queda a la vista de todo el canal')
  assert.match(r.body.text, /https:\/\/chat\.ejemplo\.test\/asistencia\?t=/)
  assert.match(r.body.text, /sólo vos/i)
})

test('el enlace que entrega abre para la identidad real de quien escribió', async () => {
  const r = await comando()({ campos: campos({ user_id: 'jefe-obra-7', user_name: 'pablo' }) })
  const token = decodeURIComponent(/\?t=([^\s)]+)/.exec(r.body.text)[1])
  const v = await verificarEnlace({ secreto: SECRETO, token })
  assert.equal(v.ok, true)
  assert.equal(v.userId, 'jefe-obra-7')
  assert.equal(v.username, 'pablo')
})

test('token del comando equivocado: 401 y ni una palabra de más', async () => {
  for (const token of ['token-equivocado-pero-del-mismo-largo-0123', '', undefined, TOKEN_COMANDO + 'x']) {
    const r = await comando()({ campos: campos({ token }) })
    assert.equal(r.status, 401)
    assert.equal(r.body.error, TEXTO.NO_AUTORIZADO)
    assert.ok(!('text' in r.body), 'un pedido no autorizado no recibe enlace')
    assert.ok(!JSON.stringify(r.body).includes(TOKEN_COMANDO), 'no se devuelve el token esperado')
  }
})

test('sin token configurado el comando NO atiende (fail-closed)', async () => {
  const r = await comando({ tokenComando: null })({ campos: campos() })
  assert.equal(r.status, 503)
  assert.equal(r.body.error, TEXTO.SIN_CONFIGURAR)
})

test('sin permiso: se dice con claridad y sin filtrar detalles internos', async () => {
  const r = await comando({ verificarPermiso: async () => ({ ok: false, motivo: 'sin_permiso', modo: 'estricto' }) })({ campos: campos() })
  assert.equal(r.status, 200)
  assert.equal(r.body.response_type, 'ephemeral')
  assert.equal(r.body.text, TEXTO.SIN_PERMISO)
  assert.ok(!/sin_permiso|estricto|permisos_skill|select |error/i.test(r.body.text), 'no se filtra el mecanismo interno')
  assert.ok(!r.body.text.includes('?t='), 'sin permiso no hay enlace')
})

test('si el permiso no se puede verificar, se deniega (no se concede por las dudas)', async () => {
  const r = await comando({ verificarPermiso: async () => { throw new Error('la base no responde') } })({ campos: campos() })
  assert.equal(r.body.text, TEXTO.ERROR)
  assert.ok(!r.body.text.includes('?t='))
  assert.ok(!/base|Error|stack/i.test(r.body.text.replace(/problema/i, '')), 'no se filtra el error interno')
})

test('sin identidad de Mattermost no se emite nada', async () => {
  const r = await comando()({ campos: campos({ user_id: '  ' }) })
  assert.equal(r.body.text, TEXTO.SIN_IDENTIDAD)
})

test('configuración incompleta (secreto corto / URL vacía): mensaje humano, nunca un stack', async () => {
  for (const extra of [{ secretoEnlace: 'corto' }, { urlBase: null }, { secretoEnlace: null }]) {
    const r = await comando(extra)({ campos: campos() })
    assert.equal(r.body.text, TEXTO.SIN_CONFIGURAR)
    assert.ok(!/Error|at |\.mjs/.test(r.body.text))
  }
})

test('ningún mensaje del comando filtra el secreto del enlace ni el del comando', async () => {
  const salidas = []
  const casos = [
    comando()({ campos: campos() }),
    comando()({ campos: campos({ token: 'mal' }) }),
    comando({ secretoEnlace: 'corto' })({ campos: campos() }),
    comando({ verificarPermiso: async () => { throw new Error(`falló con ${SECRETO}`) } })({ campos: campos() }),
  ]
  for (const c of casos) salidas.push(JSON.stringify((await c).body))
  for (const s of salidas) {
    assert.ok(!s.includes(SECRETO), 'filtró el secreto del enlace')
    assert.ok(!s.includes(TOKEN_COMANDO), 'filtró el token del comando')
  }
})

test('el texto de invitación no promete nada que no sea cierto', () => {
  const t = textoInvitacion('https://x.test/asistencia?t=abc', new Date(Date.now() + 10 * 60_000).toISOString())
  assert.match(t, /una sola vez/)
  assert.match(t, /Vence en 10 minutos/)
  assert.match(t, /confirmación se publica en el canal/)
})

// ── el servidor ─────────────────────────────────────────────────────────────────

/** Levanta el servidor en un puerto efímero de loopback y devuelve helpers. */
async function levantar(opts = {}) {
  const server = crearServidorAsistencia({ manejarComando: comando(), ...opts })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    server,
    async post(ruta, cuerpo, headers = {}) {
      const res = await fetch(base + ruta, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
        body: typeof cuerpo === 'string' ? cuerpo : new URLSearchParams(cuerpo).toString(),
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    async get(ruta) {
      const res = await fetch(base + ruta)
      return { status: res.status, body: await res.text() }
    },
    cerrar: () => new Promise((r) => server.close(r)),
  }
}

test('servidor: el slash command entra por POST form-urlencoded y responde ephemeral', async () => {
  const s = await levantar()
  try {
    const r = await s.post('/asistencia/comando', campos())
    assert.equal(r.status, 200)
    assert.equal(r.body.response_type, 'ephemeral')
  } finally { await s.cerrar() }
})

test('servidor: método, tipo de contenido y ruta desconocida se rechazan sin stack', async () => {
  const s = await levantar()
  try {
    assert.equal((await s.get('/asistencia/comando')).status, 405, 'el comando es POST y sólo POST')
    const tipo = await s.post('/asistencia/comando', 'x', { 'content-type': 'text/plain' })
    assert.equal(tipo.status, 415)
    const noExiste = await s.get('/otra-cosa')
    assert.equal(noExiste.status, 404)
    assert.ok(!/Error|at |\.mjs/.test(noExiste.body), 'sin stack')
  } finally { await s.cerrar() }
})

test('servidor: body gigante se corta antes de procesarse', async () => {
  const s = await levantar({ maxBytes: 256 })
  try {
    const r = await s.post('/asistencia/comando', `token=${TOKEN_COMANDO}&text=${'a'.repeat(2000)}`)
    assert.equal(r.status, 413)
  } finally { await s.cerrar() }
})

test('servidor: sin la pantalla montada se explica qué hacer, no una página en blanco', async () => {
  const s = await levantar()
  try {
    const r = await s.get('/asistencia?t=cualquiera')
    assert.equal(r.status, 503)
    assert.match(r.body, /@os/, 'se ofrece el fallback conversacional')
  } finally { await s.cerrar() }
})

test('servidor: el punto de montaje recibe la pantalla y el token no rompe el ruteo', async () => {
  const vistas = []
  const s = await levantar({
    manejarPantalla: async (req, res) => {
      vistas.push(req.url)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<h1>pantalla</h1>')
      return true
    },
  })
  try {
    assert.match((await s.get('/asistencia?t=abc')).body, /pantalla/)
    assert.match((await s.get('/asistencia/api/contexto?fecha=2026-07-31')).body, /pantalla/)
    assert.deepEqual(vistas, ['/asistencia?t=abc', '/asistencia/api/contexto?fecha=2026-07-31'])
    // El comando NO se delega a la pantalla: es ruta propia.
    await s.post('/asistencia/comando', campos())
    assert.equal(vistas.length, 2)
  } finally { await s.cerrar() }
})

test('servidor: si la pantalla no atiende la ruta, responde 404 y no cuelga', async () => {
  const s = await levantar({ manejarPantalla: async () => false })
  try {
    assert.equal((await s.get('/asistencia/lo-que-sea')).status, 404)
  } finally { await s.cerrar() }
})

test('soloRuta: el token del query no forma parte del ruteo', () => {
  assert.equal(soloRuta('/asistencia?t=abc'), '/asistencia')
  assert.equal(soloRuta('/asistencia'), '/asistencia')
  assert.equal(soloRuta(undefined), '/')
})

// ── confirmación en el canal ────────────────────────────────────────────────────

const puerto = (rows = [{ channel_id: CANAL, canal_nombre: 'asistencia' }]) => ({
  consultas: [],
  async query(sql, params) { this.consultas.push({ sql, params }); return { rows } },
})

test('el canal sale del binding, nunca del código', async () => {
  const port = puerto()
  const d = await canalDeArea(port, {})
  assert.equal(d.channelId, CANAL)
  assert.match(port.consultas[0].sql, /comunicacion\.canales_area/)
  assert.deepEqual(port.consultas[0].params, ['mattermost', AREA_ASISTENCIA, null])
})

test('sin binding activo no se publica nada y NO se rompe la carga ya escrita', async () => {
  const cliente = { posts: [], async crearPost(p) { this.posts.push(p); return { id: 'p1' } } }
  const r = await publicarConfirmacion({ port: puerto([]), cliente }, { fecha: '2026-07-31' })
  assert.equal(r, null)
  assert.equal(cliente.posts.length, 0)
})

test('si Mattermost falla al publicar, se traga el error: la asistencia ya está en la planilla', async () => {
  const cliente = { async crearPost() { throw new Error('mattermost 500') } }
  assert.equal(await publicarConfirmacion({ port: puerto(), cliente }, {}), null)
})

test('publica UNA confirmación en el canal del área, sin hilo', async () => {
  const cliente = { posts: [], async crearPost(p) { this.posts.push(p); return { id: 'p1' } } }
  await publicarConfirmacion({ port: puerto(), cliente }, {
    fecha: '2026-07-31', obra: 'Estrella', actor_nombre: 'Pablo',
    resumen: { presentes: 8, ausentes: 1, horas_total: 72, horas_extra: 4 },
    celdas: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  })
  assert.equal(cliente.posts.length, 1, 'una sola: el canal no es una conversación')
  const p = cliente.posts[0]
  assert.equal(p.channel_id, CANAL)
  assert.match(p.message, /31\/07\/2026/)
  assert.match(p.message, /Estrella/)
  assert.match(p.message, /8 presentes · 1 ausente/)
  assert.match(p.message, /72 h cargadas \(4 extra\)/)
  assert.match(p.message, /9 celdas escritas/)
  assert.match(p.message, /Cargó Pablo/)
})

test('la confirmación NUNCA inventa un número que el núcleo no informó', () => {
  const t = textoConfirmacion({ fecha: '2026-07-31', obra: 'San Francisco' })
  assert.match(t, /San Francisco/)
  assert.ok(!/\d+ presente/.test(t), 'sin resumen no aparecen presentes')
  assert.ok(!/\d+ h cargadas/.test(t), 'sin horas no aparecen horas')
  assert.ok(!/celdas? escrita/.test(t), 'sin celdas no aparece el conteo')
  assert.ok(!/undefined|NaN|null/.test(t))
})

const ARCHIVOS_DEL_FRENTE = ['./comando-asistencia.mjs', './servidor-asistencia.mjs', './enlace-firmado.mjs']

test('ningún id de Mattermost escrito a mano en los archivos de este frente', () => {
  for (const f of ARCHIVOS_DEL_FRENTE) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /\b[a-z0-9]{26}\b/, `${f} tiene algo con forma de id de Mattermost`)
  }
})

test('este camino NO razona: ni un modelo entre el comando y el enlace', () => {
  for (const f of ARCHIVOS_DEL_FRENTE) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /from ['"][^'"]*anthropic|@anthropic-ai|claude-(?:opus|sonnet|haiku)|razonar\(/i,
      `${f} invoca razonamiento: este proceso tiene que funcionar sin crédito de API`)
  }
})

test('ningún secreto escrito en el código de este frente', () => {
  for (const f of ARCHIVOS_DEL_FRENTE) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    // Asignaciones de secreto con un literal: sólo se aceptan `null`, env y parámetros.
    assert.doesNotMatch(src, /(secreto|token|password)\w*\s*[=:]\s*['"][^'"]{8,}['"]/i, `${f} tiene algo con forma de secreto`)
  }
})
