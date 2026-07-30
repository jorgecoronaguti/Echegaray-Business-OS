import test from 'node:test'
import assert from 'node:assert/strict'
import { emitirSesion, verificarSesion, leerCookie, armarCookie, NOMBRE_COOKIE } from './sesion-web.mjs'

const SECRETO = 'secreto-de-prueba-no-real'

test('una sesión emitida se verifica y conserva la identidad', () => {
  const s = emitirSesion({ secreto: SECRETO, userId: 'u123', username: 'jefe' })
  const v = verificarSesion({ secreto: SECRETO, valor: s.valor })
  assert.equal(v.ok, true)
  assert.equal(v.userId, 'u123')
  assert.equal(v.username, 'jefe')
})

test('la cookie no lleva permisos: sólo identidad y vencimiento', () => {
  const s = emitirSesion({ secreto: SECRETO, userId: 'u123', username: 'jefe' })
  const payload = JSON.parse(Buffer.from(s.valor.split('.')[0], 'base64url').toString('utf8'))
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'n', 'sid', 'u'])
})

test('una firma de otro secreto no pasa', () => {
  const s = emitirSesion({ secreto: 'otro-secreto', userId: 'u123' })
  assert.deepEqual(verificarSesion({ secreto: SECRETO, valor: s.valor }), { ok: false, motivo: 'invalida' })
})

test('cambiar el payload invalida la firma', () => {
  const s = emitirSesion({ secreto: SECRETO, userId: 'u123' })
  const falso = Buffer.from(JSON.stringify({ u: 'jorge', n: null, exp: 99999999999, sid: 'x' })).toString('base64url')
  const atacado = `${falso}.${s.valor.split('.')[1]}`
  assert.equal(verificarSesion({ secreto: SECRETO, valor: atacado }).ok, false)
})

test('una sesión vencida se distingue de una inválida', () => {
  const s = emitirSesion({ secreto: SECRETO, userId: 'u123', ttlSegundos: 1, ahora: 0 })
  assert.deepEqual(verificarSesion({ secreto: SECRETO, valor: s.valor, ahora: 5000 }), { ok: false, motivo: 'expirada' })
})

test('sin cookie el motivo es ausente, no un error', () => {
  assert.deepEqual(verificarSesion({ secreto: SECRETO, valor: '' }), { ok: false, motivo: 'ausente' })
  assert.deepEqual(verificarSesion({ secreto: SECRETO, valor: 'basura' }), { ok: false, motivo: 'invalida' })
})

test('sin secreto configurado no se valida nada (fail-closed)', () => {
  const s = emitirSesion({ secreto: SECRETO, userId: 'u123' })
  assert.equal(verificarSesion({ secreto: null, valor: s.valor }).ok, false)
})

test('emitir sin identidad es un error de programación, no una sesión anónima', () => {
  assert.throws(() => emitirSesion({ secreto: SECRETO }), /identidad/)
  assert.throws(() => emitirSesion({ userId: 'u1' }), /secreto/)
})

test('la cookie se lee entre otras y se arma con las guardas puestas', () => {
  assert.equal(leerCookie(`otra=1; ${NOMBRE_COOKIE}=abc; mas=2`), 'abc')
  assert.equal(leerCookie('otra=1'), null)
  assert.equal(leerCookie(undefined), null)
  const c = armarCookie({ valor: 'abc', ruta: '/asistencia' })
  assert.match(c, /HttpOnly/)
  assert.match(c, /SameSite=Strict/)
  assert.match(c, /Secure/)
  assert.match(c, /Path=\/asistencia/)
  assert.doesNotMatch(armarCookie({ valor: 'abc', segura: false }), /Secure/)
})
