// EL CONTRATO DEL REGISTRO DE UN RECHAZO.
//
// Un intento negado tiene que quedar anotado con lo justo para investigarlo — quién, desde
// dónde, por qué — y con NADA de lo que no debe salir del proceso. El riesgo real acá no es
// olvidarse un campo: es que alguien, con las mejores intenciones, agregue el payload
// entero "para tener más contexto" y se lleve puesto un token. Por eso la lista de claves
// es cerrada y este test falla si crece.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ORIGEN, payloadRechazo, sanitizarError } from './asistencia-auditoria.mjs'

const CLAVES = [
  'status', 'origen', 'motivo', 'error_code',
  'mattermost_user_id', 'mattermost_username', 'identidad_verificada',
  'channel_id', 'team_id', 'request_id', 'correlation_id',
]

test('el registro de un rechazo tiene un conjunto CERRADO de claves', () => {
  const p = payloadRechazo({ origen: ORIGEN.COMANDO, motivo: 'permiso', detalle: 'sin_permiso' })
  assert.deepEqual(Object.keys(p).sort(), [...CLAVES].sort(),
    'si agregaste un campo, pensá primero si puede filtrar algo sensible')
})

test('registra quién, desde dónde y por qué', () => {
  const p = payloadRechazo({
    origen: ORIGEN.ACCION, motivo: 'canal', detalle: 'canal_directo',
    actor: { plataforma_user_id: 'u1', plataforma_username: 'jefe' },
    channelId: 'c1', teamId: 't1', requestId: 'r1', correlationId: 'k1',
  })
  assert.equal(p.status, 'denied')
  assert.equal(p.origen, ORIGEN.ACCION)
  assert.equal(p.motivo, 'canal')
  assert.equal(p.error_code, 'canal_directo')
  assert.equal(p.mattermost_user_id, 'u1')
  assert.equal(p.mattermost_username, 'jefe')
  assert.equal(p.channel_id, 'c1')
  assert.equal(p.team_id, 't1')
  assert.equal(p.request_id, 'r1')
  assert.equal(p.correlation_id, 'k1')
})

test('lo que le pasen de más NO entra: ni token, ni secreto, ni el payload', () => {
  const p = payloadRechazo({
    origen: ORIGEN.COMANDO, motivo: 'token', detalle: 'token_invalido',
    // Todo esto es ruido que un llamador podría tener a mano:
    token: 'zx9secreto', secret: 'shh', payload: { token: 'zx9secreto', texto: 'privado' },
    authorization: 'Bearer sk-123',
  })
  const s = JSON.stringify(p)
  for (const prohibido of ['zx9secreto', 'shh', 'Bearer', 'sk-123', 'privado']) {
    assert.ok(!s.includes(prohibido), `se filtró «${prohibido}»`)
  }
})

test('sin identidad probada, queda MARCADO: un user_id declarado no es una identidad', () => {
  // Cuando el token no coincide, el `user_id` es lo que alguien DICE ser.
  const p = payloadRechazo({
    origen: ORIGEN.COMANDO, motivo: 'token', detalle: 'token_invalido',
    actor: { plataforma_user_id: 'quien-dice-ser' }, identidadVerificada: false,
  })
  assert.equal(p.identidad_verificada, false)
  assert.equal(p.mattermost_user_id, 'quien-dice-ser')
})

test('con identidad verificada, la marca lo dice', () => {
  const p = payloadRechazo({ origen: ORIGEN.ACCION, motivo: 'permiso' })
  assert.equal(p.identidad_verificada, true)
})

test('un rechazo sin detalle cae al motivo, nunca queda sin código', () => {
  assert.equal(payloadRechazo({ origen: ORIGEN.ACCION, motivo: 'sesion' }).error_code, 'sesion')
})

test('sanitizarError sigue tapando tokens (la otra puerta por donde se filtra)', () => {
  const s = sanitizarError(new Error('falló con Bearer sk-ABC y token=xyz'))
  assert.ok(!s.includes('sk-ABC') && !s.includes('xyz'))
})
