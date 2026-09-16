import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearConexion, esRechazoDeAutorizacion, type AlEstado } from './conexion.ts'

// El texto literal que devolvió producción el 15/09/2026 a un usuario `campo`.
const RECHAZO = new Error('Unauthorized: You do not have permissions to read from this Channel topic: os:cambios')

/** Un canal falso: cada apertura queda anotada, y cerrarla emite `CLOSED` como hace supabase-js. */
function mundo() {
  const aperturas: { alEstado: AlEstado; cerrada: boolean }[] = []
  const estados: string[] = []
  const conexion = crearConexion({
    abrir: (alEstado) => {
      const a = { alEstado, cerrada: false }
      aperturas.push(a)
      return { cerrar: () => { a.cerrada = true; alEstado('CLOSED') } }
    },
    alEstado: (e) => { estados.push(e) },
  })
  const ultima = () => aperturas[aperturas.length - 1]
  return { aperturas, estados, conexion, ultima }
}

test('el rechazo de autorización de producción se reconoce; un error de red o un timeout no', () => {
  assert.equal(esRechazoDeAutorizacion('CHANNEL_ERROR', RECHAZO), true)
  assert.equal(esRechazoDeAutorizacion('CHANNEL_ERROR', new Error('socket closed: 1006')), false)
  assert.equal(esRechazoDeAutorizacion('CHANNEL_ERROR', new Error('channel error: transport failure')), false)
  assert.equal(esRechazoDeAutorizacion('CHANNEL_ERROR', new Error('channel error: connection lost')), false)
  assert.equal(esRechazoDeAutorizacion('CHANNEL_ERROR'), false)
  assert.equal(esRechazoDeAutorizacion('TIMED_OUT', RECHAZO), false, 'sólo un CHANNEL_ERROR es respuesta del servidor')
})

test('sesión sin permiso: el rechazo CIERRA el canal y la misma sesión no lo vuelve a abrir', () => {
  const { aperturas, estados, conexion, ultima } = mundo()
  conexion.alCambiarSesion('jwt-campo')
  assert.equal(aperturas.length, 1)
  ultima().alEstado('CHANNEL_ERROR', RECHAZO)
  assert.equal(ultima().cerrada, true, 'sin cerrar, supabase-js reintenta cada ~14 s')
  // `INITIAL_SESSION`, `SIGNED_IN` al volver a la pestaña: el mismo token no es otra oportunidad.
  conexion.alCambiarSesion('jwt-campo')
  conexion.alCambiarSesion('jwt-campo')
  assert.equal(aperturas.length, 1)
  assert.deepEqual(estados, ['CHANNEL_ERROR', 'RECHAZADO'], 'el CLOSED del canal que se cortó no llega al motor')
})

test('errores transitorios: el canal queda abierto para que supabase-js siga reintentando', () => {
  const { aperturas, estados, conexion, ultima } = mundo()
  conexion.alCambiarSesion('jwt-admin')
  ultima().alEstado('TIMED_OUT')
  ultima().alEstado('CHANNEL_ERROR', new Error('socket closed: 1006'))
  ultima().alEstado('CHANNEL_ERROR', new Error('channel error: transport failure'))
  ultima().alEstado('SUBSCRIBED')
  assert.equal(aperturas.length, 1)
  assert.equal(ultima().cerrada, false)
  assert.deepEqual(estados, ['TIMED_OUT', 'CHANNEL_ERROR', 'CHANNEL_ERROR', 'SUBSCRIBED'], 'el motor ve la caída y la vuelta')
})

test('después de un rechazo, un token NUEVO sí vuelve a intentar, una vez', () => {
  const { aperturas, conexion, ultima } = mundo()
  conexion.alCambiarSesion('jwt-1')
  ultima().alEstado('CHANNEL_ERROR', RECHAZO)
  conexion.alCambiarSesion('jwt-2') // refresco horario o login de otra persona
  assert.equal(aperturas.length, 2)
  assert.equal(ultima().cerrada, false)
  conexion.alCambiarSesion('jwt-3') // con el canal abierto, el token lo propaga supabase-js
  assert.equal(aperturas.length, 2)
})

test('lo que informa un canal ya cortado no cierra el canal vigente', () => {
  const { aperturas, conexion } = mundo()
  conexion.alCambiarSesion('jwt-1')
  const vieja = aperturas[0]
  vieja.alEstado('CHANNEL_ERROR', RECHAZO)
  conexion.alCambiarSesion('jwt-2')
  vieja.alEstado('CHANNEL_ERROR', RECHAZO) // un rechazo tardío del canal anterior
  assert.equal(aperturas[1].cerrada, false)
})

test('un rechazo que llega antes de que abrir devuelva también corta', () => {
  let cierres = 0
  const conexion = crearConexion({
    abrir: (alEstado) => { alEstado('CHANNEL_ERROR', RECHAZO); return { cerrar: () => { cierres++ } } },
    alEstado: () => {},
  })
  conexion.alCambiarSesion('jwt-campo')
  assert.equal(cierres, 1)
})

test('sin sesión no se abre nada; cerrar sesión corta; detenido ignora sesiones posteriores', () => {
  const { aperturas, conexion, ultima } = mundo()
  conexion.alCambiarSesion(null)
  assert.equal(aperturas.length, 0)
  conexion.alCambiarSesion('jwt-1')
  conexion.alCambiarSesion(null)
  assert.equal(ultima().cerrada, true)
  conexion.alCambiarSesion('jwt-2')
  conexion.detener()
  assert.equal(ultima().cerrada, true)
  conexion.alCambiarSesion('jwt-3')
  assert.equal(aperturas.length, 2)
})

test('el rechazo se le informa al motor como RECHAZADO, para que el latido no insista', () => {
  const { estados, conexion, ultima } = mundo()
  conexion.alCambiarSesion('jwt-campo')
  ultima().alEstado('CHANNEL_ERROR', RECHAZO)
  assert.ok(estados.includes('RECHAZADO'))
  const { estados: e2, conexion: c2, ultima: u2 } = mundo()
  c2.alCambiarSesion('jwt')
  u2().alEstado('CHANNEL_ERROR', new Error('socket closed: 1006'))
  assert.ok(!e2.includes('RECHAZADO'), 'una caída de red no es un rechazo')
})
