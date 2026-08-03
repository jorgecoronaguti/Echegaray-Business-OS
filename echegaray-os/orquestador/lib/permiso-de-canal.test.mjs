// LAS DOS VÍAS DEL PERMISO, probadas donde viven: una sola implementación para asistencia y para
// comprobantes. Herméticos: el `port` y el cliente de Mattermost son dobles.
//
// Lo que estos tests protegen no es "que devuelva true": es la ASIMETRÍA. Conceder exige un sí;
// denegar exige dos noes; y no poder preguntar NO es un no — es otra cosa, y se dice distinto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { puedeOperar, VIA, MOTIVO } from './permiso-de-canal.mjs'

const CANAL = 'c'.repeat(26)
const OTRO = 'o'.repeat(26)
const USUARIO = 'u'.repeat(26)
const PERMISO = 'personal.asistencia.write'

const puerto = ({ grants = [], explota = false } = {}) => {
  const consultas = []
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql, params })
      if (explota) throw new Error('base caída (simulado)')
      return { rows: grants.includes(params[1]) ? [{ display: 'Pablo' }] : [] }
    },
  }
}

const mm = ({ miembros = {}, roto = false } = {}) => ({
  async miembroDeCanal({ channel_id, user_id }) {
    if (roto) throw new Error('mattermost caído (simulado)')
    return (miembros[channel_id] ?? []).includes(user_id)
  },
})

test('con GRANT alcanza, aunque no esté en el canal', async () => {
  const r = await puedeOperar({
    port: puerto({ grants: [USUARIO] }), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: mm(),
  })
  assert.equal(r.ok, true)
  assert.equal(r.via, VIA.GRANT)
  assert.equal(r.display, 'Pablo')
})

test('SIN grant pero MIEMBRO del canal, también alcanza', async () => {
  const r = await puedeOperar({
    port: puerto(), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: mm({ miembros: { [CANAL]: [USUARIO] } }),
  })
  assert.equal(r.ok, true)
  assert.equal(r.via, VIA.MIEMBRO_CANAL)
})

test('sin grant y sin membresía se deniega: hacen falta DOS noes', async () => {
  const r = await puedeOperar({
    port: puerto(), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: mm(),
  })
  assert.deepEqual(r, { ok: false, motivo: MOTIVO.SIN_PERMISO })
})

test('la membresía se mide contra el canal OFICIAL que se pasa, no contra cualquiera', async () => {
  const r = await puedeOperar({
    port: puerto(), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: mm({ miembros: { [OTRO]: [USUARIO] } }),
  })
  assert.equal(r.ok, false)
})

test('FAIL-CLOSED: la base caída no concede, y se distingue de "no tenés permiso"', async () => {
  const r = await puedeOperar({
    port: puerto({ explota: true }), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: mm({ miembros: { [CANAL]: [] } }),
  })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.NO_VERIFICABLE)
  assert.ok(r.error.length <= 200, 'el porqué se guarda recortado, no entero')
})

test('FAIL-CLOSED: Mattermost caído tampoco concede, y tampoco es "no tenés permiso"', async () => {
  const r = await puedeOperar({
    port: puerto(), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: mm({ roto: true }),
  })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.NO_VERIFICABLE)
})

test('sin cliente de Mattermost la segunda vía NO se da por buena: no verificable', async () => {
  // El día que falte MM_BOT_TOKEN en un servicio, esto tiene que denegar y decir que no pudo —
  // no conceder "por las dudas" ni contestar un "no tenés permiso" que mandaría a Dirección a
  // otorgar un grant que ya no hacía falta.
  const r = await puedeOperar({
    port: puerto(), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: null,
  })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.NO_VERIFICABLE)
})

test('sin canal oficial contra el cual preguntar, sólo vale el grant', async () => {
  const conGrant = await puedeOperar({
    port: puerto({ grants: [USUARIO] }), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: null, mattermost: mm({ miembros: { [CANAL]: [USUARIO] } }),
  })
  assert.equal(conGrant.ok, true)
  const sinGrant = await puedeOperar({
    port: puerto(), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: null, mattermost: mm({ miembros: { [CANAL]: [USUARIO] } }),
  })
  assert.deepEqual(sinGrant, { ok: false, motivo: MOTIVO.SIN_PERMISO })
})

test('con grant NO se gasta una llamada de red', async () => {
  let pregunto = false
  await puedeOperar({
    port: puerto({ grants: [USUARIO] }), plataformaUserId: USUARIO, permiso: PERMISO,
    canalOficial: CANAL, mattermost: { async miembroDeCanal() { pregunto = true; return false } },
  })
  assert.equal(pregunto, false)
})

test('sin identidad no se concede nada, ni se consulta', async () => {
  const port = puerto({ grants: [USUARIO] })
  const r = await puedeOperar({ port, plataformaUserId: null, permiso: PERMISO, canalOficial: CANAL })
  assert.deepEqual(r, { ok: false, motivo: MOTIVO.SIN_PERMISO })
  assert.equal(port.consultas.length, 0)
})

test('el permiso consultado es el que se pide: el canal de un área no habilita la skill de otra', async () => {
  // La membresía habilita LA skill de ESE canal. Que el SQL lleve el permiso pedido es lo que
  // impide que "estar en Asistencia" se convierta en "puede cargar comprobantes".
  const port = puerto()
  await puedeOperar({
    port, plataformaUserId: USUARIO, permiso: 'compras.comprobantes.write',
    canalOficial: CANAL, mattermost: mm(),
  })
  assert.equal(port.consultas[0].params[2], 'compras.comprobantes.write')
})
