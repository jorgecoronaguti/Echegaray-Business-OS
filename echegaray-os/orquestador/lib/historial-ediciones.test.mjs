import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarRevisiones, edicionHumanaPosterior, avisoEdicionHumana, historialEdiciones, limpiarCacheHistorial,
} from './historial-ediciones.mjs'

const rev = (cuando, email, nombre) => ({ modifiedTime: cuando, lastModifyingUser: { emailAddress: email, displayName: nombre } })
const SA = 'echegaray-os-workspace@echegaray-business-os.iam.gserviceaccount.com'
const DUENO = 'jorge@ecsas.com.ar'

test('separa las revisiones del OS (cuenta de servicio) de las de personas', () => {
  const c = clasificarRevisiones([
    rev('2026-07-23T16:59:12Z', SA, 'os'),
    rev('2026-07-23T20:17:31Z', DUENO, 'jorge'),
  ])
  assert.equal(c.os.email, SA)
  assert.equal(c.persona.email, DUENO)
  assert.equal(c.total, 2)
})

test('detecta que una persona editó DESPUÉS de la última escritura del OS', () => {
  const c = clasificarRevisiones([
    rev('2026-07-23T16:59:12Z', SA, 'os'),
    rev('2026-07-23T20:17:31Z', DUENO, 'jorge'),
  ])
  const e = edicionHumanaPosterior(c)
  assert.equal(e.hubo, true)
  assert.equal(e.quien, 'jorge')
})

test('si el OS escribió último, no hay edición humana posterior', () => {
  const c = clasificarRevisiones([
    rev('2026-07-23T20:17:31Z', DUENO, 'jorge'),
    rev('2026-07-23T21:00:00Z', SA, 'os'),
  ])
  assert.equal(edicionHumanaPosterior(c).hubo, false)
})

test('ante la duda se protege al dueño: hay edición de persona y ninguna del OS → SÍ', () => {
  const c = clasificarRevisiones([rev('2026-07-23T20:17:31Z', DUENO, 'jorge')])
  const e = edicionHumanaPosterior(c)
  assert.equal(e.hubo, true)
  assert.equal(e.desdeOS, null)
})

test('sin revisiones de personas no hay nada que respetar', () => {
  const c = clasificarRevisiones([rev('2026-07-23T16:59:12Z', SA, 'os')])
  assert.equal(edicionHumanaPosterior(c).hubo, false)
})

test('el aviso nombra a la persona y aclara que la Regla 0 decide celda por celda', () => {
  const a = avisoEdicionHumana({ hubo: true, quien: 'jorge', cuando: '2026-07-23T20:17:31Z', desdeOS: '2026-07-23T16:59:12Z' })
  assert.match(a, /jorge/)
  assert.match(a, /Regla 0/)
  assert.equal(avisoEdicionHumana({ hubo: false }), null)
})

test('si la consulta del historial falla, NO bloquea la escritura (queda en desconocido)', async () => {
  limpiarCacheHistorial()
  const google = { async apiGetSheets() { throw new Error('sin permiso') } }
  const h = await historialEdiciones(google, 'archivo-x')
  assert.equal(h.desconocido, true)
  assert.equal(h.hubo, false)
})

test('una sola consulta por archivo aunque se escriban varias pestañas', async () => {
  limpiarCacheHistorial()
  let llamadas = 0
  const google = { async apiGetSheets() { llamadas++; return { revisions: [rev('2026-07-23T20:17:31Z', DUENO, 'jorge')] } } }
  await historialEdiciones(google, 'archivo-y')
  await historialEdiciones(google, 'archivo-y')
  assert.equal(llamadas, 1)
})
