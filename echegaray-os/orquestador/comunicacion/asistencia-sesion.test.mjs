import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SesionesMemoria, ESTADO_SESION, RECHAZO, firmarAccion, verificarAccion, TTL_MINUTOS,
} from './asistencia-sesion.mjs'

const SEC = 'secreto-de-prueba'
const U1 = 'mm-jefe-1'
const U2 = 'mm-jefe-2'

const abrir = (r, u = U1) => r.abrir({ plataformaUserId: u, plataformaUsername: 'jefe', fechaOperativa: '2026-07-30' })

test('firmar/verificar una acción: el token válido pasa', () => {
  const t = firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC)
  assert.equal(verificarAccion({ token: t, sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC).ok, true)
})

test('un CALLBACK ALTERADO no valida: otra sesión, otra acción u otro usuario', () => {
  const t = firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC)
  assert.equal(verificarAccion({ token: t, sesionId: 's2', accion: 'confirmar', plataformaUserId: U1 }, SEC).ok, false)
  assert.equal(verificarAccion({ token: t, sesionId: 's1', accion: 'cancelar', plataformaUserId: U1 }, SEC).ok, false)
  assert.equal(verificarAccion({ token: t, sesionId: 's1', accion: 'confirmar', plataformaUserId: U2 }, SEC).ok, false)
  assert.equal(verificarAccion({ token: 'deadbeef', sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC).motivo, RECHAZO.TOKEN_INVALIDO)
})

test('sin token no valida, y un token de otro secreto tampoco', () => {
  assert.equal(verificarAccion({ sesionId: 's1', accion: 'x', plataformaUserId: U1 }, SEC).ok, false)
  const otro = firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, 'otro-secreto')
  assert.equal(verificarAccion({ token: otro, sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC).ok, false)
})

test('FAIL-CLOSED: sin secreto no se firma ni se acepta nada', () => {
  assert.equal(firmarAccion({ sesionId: 's1', accion: 'x', plataformaUserId: U1 }, null), null)
  assert.equal(verificarAccion({ token: 'x', sesionId: 's1', accion: 'x', plataformaUserId: U1 }, null).motivo, RECHAZO.SIN_SECRETO)
})

test('abrir deja UNA sola sesión abierta por persona (cancela la anterior)', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  const b = await abrir(r)
  assert.notEqual(a.id, b.id)
  assert.equal(r.filas.find((f) => f.id === a.id).estado, ESTADO_SESION.CANCELADA)
  const viva = await r.abiertaDe({ plataformaUserId: U1 })
  assert.equal(viva.sesion.id, b.id)
})

test('dos personas distintas pueden tener su propia sesión a la vez', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r, U1)
  const b = await abrir(r, U2)
  assert.equal((await r.abiertaDe({ plataformaUserId: U1 })).sesion.id, a.id)
  assert.equal((await r.abiertaDe({ plataformaUserId: U2 })).sesion.id, b.id)
})

test('un USUARIO DISTINTO no puede cargar la sesión de otro', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r, U1)
  assert.equal((await r.cargar({ id: a.id, plataformaUserId: U2 })).motivo, RECHAZO.AJENA)
  assert.equal((await r.cargar({ id: a.id, plataformaUserId: U1 })).ok, true)
})

test('la sesión VENCE y queda marcada como vencida', async () => {
  let t = Date.parse('2026-07-30T12:00:00Z')
  const r = new SesionesMemoria({ ahora: () => t })
  const a = await abrir(r)
  t += (TTL_MINUTOS + 1) * 60000
  const v = await r.abiertaDe({ plataformaUserId: U1 })
  assert.equal(v.ok, false)
  assert.equal(v.motivo, RECHAZO.VENCIDA)
  assert.equal(r.filas.find((f) => f.id === a.id).estado, ESTADO_SESION.VENCIDA)
})

test('una sesión vencida NO se puede confirmar', async () => {
  let t = Date.parse('2026-07-30T12:00:00Z')
  const r = new SesionesMemoria({ ahora: () => t })
  const a = await abrir(r)
  t += (TTL_MINUTOS + 1) * 60000
  await r.vencer()
  assert.equal((await r.confirmar(a.id, { idempotencyKey: 'k1' })).motivo, RECHAZO.CERRADA)
})

test('contexto y marcas se guardan sin borrar lo que no se manda', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.guardarContexto(a.id, { claveObra: 'X|Y', pestana: 'Obreros 26' })
  await r.guardarMarcas(a.id, { obras: ['X|Y'], personal: ['A'], marcas: { A: { estado: 'presente' } } })
  await r.guardarContexto(a.id, { spreadsheetId: 'sheet-1' }) // no manda pestaña
  const s = (await r.abiertaDe({ plataformaUserId: U1 })).sesion
  assert.equal(s.clave_obra, 'X|Y')
  assert.equal(s.pestana, 'Obreros 26', 'no se borró con el coalesce')
  assert.equal(s.spreadsheet_id, 'sheet-1')
  assert.equal(s.marcas.marcas.A.estado, 'presente')
})

test('CONFIRMAR es de un solo uso: el replay devuelve duplicado y no vuelve a habilitar', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.guardarPlan(a.id, { idempotency_key: 'k-abc' })
  const p = await r.confirmar(a.id, { idempotencyKey: 'k-abc' })
  assert.deepEqual({ ok: p.ok, dup: p.duplicado }, { ok: true, dup: false })
  const s = await r.confirmar(a.id, { idempotencyKey: 'k-abc' })
  assert.equal(s.duplicado, true, 'replay exacto: no muta de nuevo')
  assert.equal(r.filas.find((f) => f.id === a.id).intentos_confirmacion, 1)
})

test('una sesión NUEVA con la MISMA clave de idempotencia se detecta como duplicada', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.confirmar(a.id, { idempotencyKey: 'k-igual' })
  const b = await abrir(r)
  const dup = await r.confirmar(b.id, { idempotencyKey: 'k-igual' })
  assert.equal(dup.duplicado, true)
  assert.equal(dup.sesion_id, a.id)
})

test('cerrar con conflicto / cancelada deja el estado terminal', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.cerrar(a.id, ESTADO_SESION.CONFLICTO)
  assert.equal((await r.abiertaDe({ plataformaUserId: U1 })).motivo, RECHAZO.NO_EXISTE)
  assert.equal(r.filas[0].estado, ESTADO_SESION.CONFLICTO)
})

test('sin sesión, abiertaDe dice que no existe', async () => {
  const r = new SesionesMemoria()
  assert.equal((await r.abiertaDe({ plataformaUserId: U1 })).motivo, RECHAZO.NO_EXISTE)
  assert.equal((await r.cargar({ id: null, plataformaUserId: U1 })).motivo, RECHAZO.NO_EXISTE)
})
