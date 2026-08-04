// LAS TRES IDENTIDADES DE GOOGLE DEL OS — regresión pura: sin base, sin red, sin disco.
//
// Por qué existe: la identidad con la que el OS toca Google no se ve en ninguna pantalla y
// no rompe nada cuando cambia — sigue funcionando, pero con otra cuenta. Ese es el peor tipo
// de defecto: el 31/07/2026 `googleDelOs()` armaba el cliente con `operadorEmail()` SIN
// `await`; la Promise entraba a la consulta como el literal "[object promise]", no había fila,
// el token quedaba en null y el cliente caía en silencio al Service Account. El bug estaba mal
// escrito y el resultado era, por accidente, el correcto para JORNALES. Nadie lo iba a notar
// hasta que alguien "arreglara" el await y el candado de ediciones dejara de reconocer al OS.
//
// Estas pruebas fijan la identidad de cada flujo como un contrato explícito, no como un
// accidente afortunado.
//
//   institucional (service_account) → googleDelOs()  · JORNALES, pipeline de Sheets
//   operadora     (operator_oauth)  → getTokenFor(await operadorEmail()) en los handlers
//   personal      (user_oauth)      → googleDe({identidad}) del asistente
//
// Import dinámico a propósito: si WT-1 todavía no publicó el contrato, un import estático de
// un named export inexistente mata el archivo entero con un SyntaxError ilegible. Así, en
// cambio, cada prueba dice exactamente qué falta.

import test from 'node:test'
import assert from 'node:assert/strict'

// BLINDAJE, antes de cualquier import que hidrate el entorno desde el EnvironmentFile del
// worker: este archivo declara que no toca base ni red, y tiene que ser verdad AUNQUE la
// implementación bajo prueba todavía resuelva la cuenta operadora contra Postgres. Un host
// que no existe hace que cualquier consulta falle en el acto en vez de abrir una conexión a
// producción para decidir un `if`.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/base-inexistente-de-test'
process.env.ORQ_DB_SSL = '0'

const os = await import('./google-os.mjs')
const asistente = await import('../comunicacion/asistente/google-cliente.mjs')

/** Config falsa: `googleDelOs()` sin config llamaría a `loadConfig()`, que lee el
 *  EnvironmentFile real del worker. Un test no tiene por qué depender de eso. */
const CONFIG = { fake: true }

/** Falla con el nombre de lo que falta, en vez de un `undefined is not a function`. */
function delContrato(nombre) {
  assert.ok(os[nombre], `el contrato de google-os.mjs no exporta \`${nombre}\` (WT-1 todavía no lo publicó)`)
  return os[nombre]
}

// ── Identidad institucional ──────────────────────────────────────────────────

// ESTA ES LA PRUEBA QUE TIENE QUE FALLAR SI ALGUIEN CAMBIA SIN QUERER LA IDENTIDAD CON LA QUE
// EL OS ESCRIBE JORNALES. El candado de ediciones (historial-ediciones.mjs) distingue al OS de
// una persona por el `gserviceaccount.com` del historial de Drive: si `googleDelOs()` pasa a
// actuar como jorge@ecsas.com.ar, el OS deja de reconocer su propia escritura, la lee como
// edición del dueño y auto-candáa la pestaña. No hay error, no hay log: deja de funcionar.
test('googleDelOs() escribe como la cuenta institucional (service_account) — JORNALES depende de esto', () => {
  const identidadDe = delContrato('identidadDe')
  const IDENTIDAD = delContrato('IDENTIDAD')
  const g = delContrato('googleDelOs')({ config: CONFIG })
  assert.ok(g, 'googleDelOs() devolvió un cliente vacío')
  assert.equal(identidadDe(g)?.tipo, IDENTIDAD.INSTITUCIONAL)
  assert.equal(identidadDe(g)?.tipo, 'service_account', 'el valor literal es parte del contrato')
  assert.equal(identidadDe(g)?.cuenta, 'service-account')
})

test('googleDelOs() es SÍNCRONO: devuelve un cliente, no una Promise', () => {
  const g = delContrato('googleDelOs')({ config: CONFIG })
  assert.ok(!(g instanceof Promise), 'volvió a devolver una Promise — el bug original de `op` era exactamente esto')
})

test('googleDelOs() NO arma el cliente con getToken (Service Account puro)', () => {
  const googleDelOs = delContrato('googleDelOs')
  // Si WT-1 ofrece inyección, se comprueba de verdad: el cliente se arma SIN `getToken`, que
  // es lo único que puede hacer que el Service Account se convierta en una cuenta de persona.
  let visto = null
  const conInyeccion = { config: CONFIG, deps: { crearCliente: (cfg, getToken) => { visto = { cfg, getToken }; return { espia: true } } } }
  try { googleDelOs(conInyeccion) } catch { /* sin inyección: se ignora el intento */ }
  if (visto) {
    assert.equal(visto.getToken, undefined, 'googleDelOs() pasó un getToken: el cliente dejaría de ser el Service Account')
    return
  }
  // Sin inyección sólo se puede verificar la marca — y alcanza, porque la marca es lo que
  // WT-1 se compromete a mantener alineado con la credencial real. Queda dicho acá para que
  // el día que se agregue la inyección, esta prueba se vuelva fuerte sin reescribirla.
  assert.equal(delContrato('identidadDe')(googleDelOs({ config: CONFIG }))?.tipo, 'service_account')
})

test('IDENTIDAD es un contrato congelado con los tres valores', () => {
  const IDENTIDAD = delContrato('IDENTIDAD')
  assert.deepEqual({ ...IDENTIDAD }, { INSTITUCIONAL: 'service_account', OPERADORA: 'operator_oauth', PERSONAL: 'user_oauth' })
  assert.ok(Object.isFrozen(IDENTIDAD))
  // Symbol.for y no Symbol(): worker y web cargan copias distintas del módulo y una marca
  // por identidad de símbolo local sería invisible desde la otra copia.
  assert.equal(delContrato('IDENTIDAD_OS'), Symbol.for('echegaray.google.identidad'))
})

// ── El cliente institucional no sirve para la agenda de una persona ──────────

test('permiteEfectoExterno(googleDelOs()) es false: el OS no escribe en la agenda de nadie', () => {
  // Crear el evento de Rodrigo con la cuenta de servicio "funciona" (devuelve id y todo) y
  // Rodrigo no ve nada. Un efecto en la cuenta equivocada es peor que un fallo.
  const g = delContrato('googleDelOs')({ config: CONFIG })
  assert.equal(asistente.permiteEfectoExterno(g), false)
})

// ── Identidad personal (asistente) ───────────────────────────────────────────

/** Dobles: nadie construye un cliente real ni pide un token real ni toca la base. */
function deps({ operador = null } = {}) {
  return {
    operadorPara: async () => operador,
    getTokenFor: (cuenta) => async () => `token-de-${cuenta}`,
    loadConfig: () => CONFIG,
    crearCliente: (config, getToken) => ({ config, getToken }),
  }
}

test('googleDe(): con token propio el cliente queda marcado propio y puede tener efecto externo', async () => {
  const g = await asistente.googleDe({
    identidad: { email: 'Rodrigo@ecsas.com.ar' }, config: CONFIG, deps: deps({ operador: 'rodrigo@ecsas.com.ar' }),
  })
  assert.deepEqual(asistente.cuentaDe(g), { email: 'rodrigo@ecsas.com.ar', propia: true })
  assert.equal(asistente.permiteEfectoExterno(g), true)
})

test('googleDe(): sin token propio cae a la operadora, propia:false y NO puede escribir en su agenda', async () => {
  const g = await asistente.googleDe({
    identidad: { email: 'rodrigo@ecsas.com.ar' }, config: CONFIG, deps: deps({ operador: 'jorge@ecsas.com.ar' }),
  })
  assert.equal(asistente.cuentaDe(g).propia, false)
  assert.equal(asistente.permiteEfectoExterno(g), false)
})

test('googleDe() NUNCA devuelve un cliente con identidad institucional', async () => {
  const identidadDe = delContrato('identidadDe')
  for (const operador of ['rodrigo@ecsas.com.ar', 'jorge@ecsas.com.ar']) {
    const g = await asistente.googleDe({ identidad: { email: 'rodrigo@ecsas.com.ar' }, config: CONFIG, deps: deps({ operador }) })
    assert.notEqual(identidadDe(g)?.tipo, 'service_account', 'el asistente se armó con la cuenta de servicio')
    assert.ok(asistente.cuentaDe(g)?.email.includes('@'), 'la cuenta personal siempre es un email')
  }
  // Sin ninguna cuenta utilizable devuelve null: no cae al Service Account por comodidad.
  assert.equal(await asistente.googleDe({ identidad: { email: 'x@ecsas.com.ar' }, config: CONFIG, deps: deps() }), null)
})

// ── La caída silenciosa al robot (03/08/2026) ────────────────────────────────
//
// El dueño pidió "crea un evento … agregános a mí y a Rodrigo" y el evento apareció en el
// calendario del SERVICE ACCOUNT. No hubo error: `orq.google_tokens` tiene su fila, así que
// `googleDe` marcó el cliente `propia:true`; pero el refresh de ese token devuelve
// `invalid_grant` (verificado el 03/08 contra Google) y `makeGoogleClient` estaba escrito así:
//
//     if (getToken) { const ut = await userToken(); if (ut) return ut }   // ← y si no, sigue
//     …                                                                   //   al Service Account
//
// El cliente decía ser de Jorge y ejecutaba como el robot. El chat contestó "Listo". Para el
// dueño el evento no existe: es peor que un fallo, porque no se nota.
test('un cliente PERSONAL con el OAuth vencido NO ejecuta como el robot: falla y lo dice', async () => {
  const { makeGoogleClient } = await import('./google.mjs')
  const llamadas = []
  const g = makeGoogleClient({
    config: CONFIG,
    scopes: [],
    soloUsuario: true,                       // "esta cuenta es de una persona": sin ella, no hay evento
    getToken: async () => null,              // OAuth vencido/revocado: no hay token de la persona
    auth: { getAccessToken: async () => 'token-del-robot' },
    fetchImpl: async (url, opts) => {
      llamadas.push({ url, autorizacion: opts?.headers?.Authorization })
      return { ok: true, status: 200, json: async () => ({ id: 'ev-en-el-calendario-del-robot' }) }
    },
  })
  await assert.rejects(
    () => g.calendarCreateEvent({ summary: 'Reu Alonso Construcciones', start: '2026-08-04T15:00:00-03:00', end: '2026-08-04T16:00:00-03:00' }),
    /Google/i,
    'creó el evento igual: cayó a la cuenta de servicio en silencio',
  )
  assert.deepEqual(llamadas, [], 'salió una llamada a Google con la credencial del robot')
})

test('sin soloUsuario nada cambia: el pipeline de Sheets sigue cayendo al Service Account', async () => {
  const { makeGoogleClient } = await import('./google.mjs')
  let autorizacion = null
  const g = makeGoogleClient({
    config: CONFIG,
    scopes: [],
    getToken: async () => null,
    auth: { getAccessToken: async () => 'token-del-robot' },
    fetchImpl: async (url, opts) => { autorizacion = opts?.headers?.Authorization; return { ok: true, status: 200, json: async () => ({ id: 'x' }) } },
  })
  await g.calendarCreateEvent({ summary: 'x', start: '2026-08-04T15:00:00-03:00', end: '2026-08-04T16:00:00-03:00' })
  assert.equal(autorizacion, 'Bearer token-del-robot', 'el comportamiento histórico no se tocó')
})

// ── Lo que se escribe en un log ──────────────────────────────────────────────

test('describirIdentidad() no filtra el email de la cuenta de servicio ni ningún token', () => {
  const describir = delContrato('describirIdentidad')
  const texto = String(describir(delContrato('googleDelOs')({ config: CONFIG })) ?? '')
  assert.match(texto, /service_account/, 'el contrato pide un texto corto y estable para el log')
  assert.ok(texto.length <= 60, `describirIdentidad() devolvió un párrafo, no una etiqueta de log: ${texto}`)
  assert.ok(!/gserviceaccount\.com/i.test(texto), texto)
  assert.ok(!/ya29\.|refresh_token|client_secret|\d{6,}-[a-z0-9]+\.apps\.googleusercontent/i.test(texto), texto)
  // Un cliente que no es del OS no inventa identidad: null, no una adivinanza.
  assert.equal(delContrato('identidadDe')({}), null)
})
