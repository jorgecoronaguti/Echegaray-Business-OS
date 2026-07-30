// Tests del enlace firmado de un solo uso. Sin red, sin base: el consumo se inyecta.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emitirEnlace, verificarEnlace, consumidorPostgres, armarUrl, mensajeDe,
  MOTIVO, MENSAJE, TTL_SEGUNDOS_MAXIMO,
} from './enlace-firmado.mjs'

// Secreto SÓLO de test, generado acá mismo: nunca el de producción, nunca uno "real".
const SECRETO = 'secreto-de-test-nunca-el-de-produccion-0123456789'
const OTRO_SECRETO = 'otro-secreto-de-test-completamente-distinto-98765'
const USER = 'jefe-de-obra-1'

/** Consumo en memoria: mismo contrato que el de Postgres (true = primer uso). */
function consumoEnMemoria() {
  const usados = new Set()
  const fn = async ({ jti }) => {
    if (usados.has(jti)) return false
    usados.add(jti)
    return true
  }
  fn.usados = usados
  return fn
}

test('firma válida: el enlace se verifica y devuelve la identidad que se le puso', async () => {
  const { token, expira } = emitirEnlace({ secreto: SECRETO, userId: USER, username: 'jorge' })
  const r = await verificarEnlace({ secreto: SECRETO, token })
  assert.equal(r.ok, true)
  assert.equal(r.userId, USER)
  assert.equal(r.username, 'jorge')
  assert.ok(Date.parse(expira) > Date.now(), 'el vencimiento es futuro')
})

test('el token NO lleva permisos: sólo identidad y vencimiento', async () => {
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  const cuerpo = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))
  assert.deepEqual(Object.keys(cuerpo).sort(), ['e', 'j', 'n', 'u', 'v'])
  for (const k of ['permiso', 'permisos', 'rol', 'roles', 'scope', 'admin']) {
    assert.ok(!(k in cuerpo), `el token no debe llevar ${k}`)
  }
})

test('otro secreto no puede fabricar un enlace válido', async () => {
  const { token } = emitirEnlace({ secreto: OTRO_SECRETO, userId: USER })
  const r = await verificarEnlace({ secreto: SECRETO, token })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.INVALIDO)
})

test('token manipulado: cambiar la identidad invalida la firma', async () => {
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  const [datos, firma] = token.split('.')
  const cuerpo = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'))
  cuerpo.u = 'otro-usuario-cualquiera'
  const falsificado = `${Buffer.from(JSON.stringify(cuerpo), 'utf8').toString('base64url')}.${firma}`
  const r = await verificarEnlace({ secreto: SECRETO, token: falsificado })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.INVALIDO)
})

test('token manipulado: estirar el vencimiento tampoco sirve', async () => {
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER, ttlSegundos: 60 })
  const [datos, firma] = token.split('.')
  const cuerpo = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'))
  cuerpo.e += 86400
  const falsificado = `${Buffer.from(JSON.stringify(cuerpo), 'utf8').toString('base64url')}.${firma}`
  const r = await verificarEnlace({ secreto: SECRETO, token: falsificado })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.INVALIDO)
})

test('firma tocada de un byte: inválido', async () => {
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  const [datos, firma] = token.split('.')
  const ultimo = firma.slice(-1) === 'A' ? 'B' : 'A'
  const r = await verificarEnlace({ secreto: SECRETO, token: `${datos}.${firma.slice(0, -1)}${ultimo}` })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.INVALIDO)
})

test('basura, vacío y formato raro: inválido, nunca una excepción', async () => {
  for (const token of ['', 'x', 'a.b.c', 'a.b', '....', 'null', 'a'.repeat(5000)]) {
    const r = await verificarEnlace({ secreto: SECRETO, token })
    assert.equal(r.ok, false, `token ${JSON.stringify(token.slice(0, 12))}`)
    assert.equal(r.motivo, MOTIVO.INVALIDO)
  }
  for (const token of [null, undefined, 42, {}]) {
    const r = await verificarEnlace({ secreto: SECRETO, token })
    assert.equal(r.motivo, MOTIVO.INVALIDO)
  }
})

test('expiración: pasado el TTL el enlace deja de servir, con mensaje propio', async () => {
  let t = Date.parse('2026-07-31T12:00:00Z')
  const ahora = () => t
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER, ttlSegundos: 600, ahora })
  t += 599_000
  assert.equal((await verificarEnlace({ secreto: SECRETO, token, ahora })).ok, true, 'a los 9:59 todavía sirve')
  t += 2_000
  const r = await verificarEnlace({ secreto: SECRETO, token, ahora })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.EXPIRADO)
  assert.match(mensajeDe(r), /venció/i)
  assert.notEqual(MENSAJE[MOTIVO.EXPIRADO], MENSAJE[MOTIVO.USADO], 'expirado y usado no dicen lo mismo')
})

test('un enlace vencido NO gasta el registro de consumo', async () => {
  let t = Date.parse('2026-07-31T12:00:00Z')
  const ahora = () => t
  const consumir = consumoEnMemoria()
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER, ttlSegundos: 60, ahora })
  t += 61_000
  await verificarEnlace({ secreto: SECRETO, token, consumir, ahora })
  assert.equal(consumir.usados.size, 0, 'no se registró consumo de un token muerto')
})

test('segundo uso rechazado: el primero entra, el segundo dice USADO', async () => {
  const consumir = consumoEnMemoria()
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  const primero = await verificarEnlace({ secreto: SECRETO, token, consumir })
  assert.equal(primero.ok, true)
  const segundo = await verificarEnlace({ secreto: SECRETO, token, consumir })
  assert.equal(segundo.ok, false)
  assert.equal(segundo.motivo, MOTIVO.USADO)
  assert.match(mensajeDe(segundo), /ya se usó/i)
})

test('dos enlaces distintos del mismo usuario son independientes', async () => {
  const consumir = consumoEnMemoria()
  const a = emitirEnlace({ secreto: SECRETO, userId: USER })
  const b = emitirEnlace({ secreto: SECRETO, userId: USER })
  assert.notEqual(a.token, b.token, 'cada emisión tiene su propio jti')
  assert.equal((await verificarEnlace({ secreto: SECRETO, token: a.token, consumir })).ok, true)
  assert.equal((await verificarEnlace({ secreto: SECRETO, token: b.token, consumir })).ok, true)
})

test('sin `consumir` NO se quema el enlace (previsualizar no es usar)', async () => {
  const consumir = consumoEnMemoria()
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  assert.equal((await verificarEnlace({ secreto: SECRETO, token })).ok, true)
  assert.equal((await verificarEnlace({ secreto: SECRETO, token, consumir })).ok, true)
})

test('fail-closed: si el consumo falla, NO se deja pasar', async () => {
  const consumir = async () => { throw new Error('la base no responde') }
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  const r = await verificarEnlace({ secreto: SECRETO, token, consumir })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.INVALIDO)
  assert.match(r.mensaje, /Probá de nuevo/i)
})

test('secreto ausente o corto: emitir grita, verificar falla cerrado', async () => {
  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  for (const malo of [undefined, null, '', 'corto']) {
    assert.throws(() => emitirEnlace({ secreto: malo, userId: USER }), /secreto/i)
    const r = await verificarEnlace({ secreto: malo, token })
    assert.equal(r.ok, false, 'sin secreto usable no se acepta nada')
    assert.equal(r.motivo, MOTIVO.INVALIDO)
  }
})

test('ningún error ni respuesta filtra el secreto', async () => {
  const capturados = []
  try { emitirEnlace({ secreto: 'x', userId: USER }) } catch (e) { capturados.push(String(e.message)) }
  try { emitirEnlace({ secreto: SECRETO, userId: '' }) } catch (e) { capturados.push(String(e.message)) }
  try { emitirEnlace({ secreto: SECRETO, userId: USER, ttlSegundos: TTL_SEGUNDOS_MAXIMO + 1 }) } catch (e) { capturados.push(String(e.message)) }
  try { armarUrl({ urlBase: null, token: 'x' }) } catch (e) { capturados.push(String(e.message)) }

  const { token } = emitirEnlace({ secreto: SECRETO, userId: USER })
  for (const t of [token, 'basura', `${token}x`]) {
    capturados.push(JSON.stringify(await verificarEnlace({ secreto: SECRETO, token: t })))
  }
  capturados.push(JSON.stringify(await verificarEnlace({ secreto: SECRETO, token, consumir: async () => { throw new Error(`fallo con ${SECRETO}`) } })))

  for (const texto of capturados) {
    assert.ok(!texto.includes(SECRETO), `filtró el secreto: ${texto.slice(0, 120)}`)
    assert.ok(!texto.includes(SECRETO.slice(0, 12)), `filtró parte del secreto: ${texto.slice(0, 120)}`)
  }
  assert.equal(capturados.length, 8)
})

test('el token nunca es el jti: lo que se persiste no abre nada', async () => {
  const { token, jti } = emitirEnlace({ secreto: SECRETO, userId: USER })
  assert.notEqual(jti, token)
  assert.ok(!jti.includes('.'), 'el jti es un identificador, no un token firmado')
  const r = await verificarEnlace({ secreto: SECRETO, token: jti })
  assert.equal(r.ok, false, 'con el jti solo no se entra')
})

test('TTL fuera de rango: se rechaza en la emisión, no se silencia', () => {
  for (const ttl of [0, -1, TTL_SEGUNDOS_MAXIMO + 1, NaN, 'diez']) {
    assert.throws(() => emitirEnlace({ secreto: SECRETO, userId: USER, ttlSegundos: ttl }), /TTL/)
  }
})

test('armarUrl: base sin barra final, token escapado, ruta configurable', () => {
  const url = armarUrl({ urlBase: 'https://chat.ejemplo.test/', token: 'a b+c', ruta: 'asistencia' })
  assert.equal(url, 'https://chat.ejemplo.test/asistencia?t=a%20b%2Bc')
  assert.throws(() => armarUrl({ urlBase: 'chat.ejemplo.test', token: 'x' }), /URL pública/)
})

test('consumidorPostgres: inserta una vez y devuelve false en el segundo intento', async () => {
  const filas = new Map()
  const port = {
    async query(sql, params) {
      assert.match(sql, /on conflict \(jti\) do nothing/)
      const [jti] = params
      if (filas.has(jti)) return { rows: [] }
      filas.set(jti, params)
      return { rows: [{ jti }] }
    },
  }
  const consumir = consumidorPostgres(port)
  const enlace = emitirEnlace({ secreto: SECRETO, userId: USER, username: 'jorge' })
  const arg = { jti: enlace.jti, userId: USER, username: 'jorge', expiraEpoch: enlace.expiraEpoch }
  assert.equal(await consumir(arg), true)
  assert.equal(await consumir(arg), false)
  assert.ok(!JSON.stringify([...filas.values()]).includes(enlace.token), 'no se persiste el token')
})
