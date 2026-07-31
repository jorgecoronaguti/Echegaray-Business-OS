// EL ARRANQUE RECHAZADO TAMBIÉN SE ANOTA.
//
// `@os asistencia` y `/asistencia` entran por la misma puerta. Cuando la guarda dice que no
// —canal equivocado, mensaje privado, sin permiso— antes no quedaba nada: ni sesión, ni
// evento, ni forma de revisar después quién intentó. Se registra con el mismo ledger que la
// carga exitosa, y sin tocar el veredicto: lo que el usuario lee es exactamente lo de antes.

import test from 'node:test'
import assert from 'node:assert/strict'
import { iniciarAsistencia } from './asistencia-inicio.mjs'
import { EVENTO, ORIGEN } from '../lib/asistencia-auditoria.mjs'

const CANAL_OFICIAL = 'canal-oficial-de-asistencia'

/** Port doble: contesta el binding, el permiso y lo que el auditor necesita. */
function portDoble({ bindingActivo = true } = {}) {
  const consultas = []
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql: String(sql), params })
      if (/canales_area/.test(sql)) {
        return bindingActivo && params?.includes(CANAL_OFICIAL)
          ? { rows: [{ area_clave: 'personas', canal_nombre: 'Asistencia' }] }
          : { rows: [] }
      }
      if (/orq\.tenants/.test(sql)) return { rows: [{ tenant_id: 't-1', project_id: 'p-1' }] }
      return { rows: [] }
    },
    async withTx(fn) { return fn({ query: (s, p) => this.query(s, p) }) },
  }
}

const eventos = (port) => port.consultas
  .filter((c) => /emit_event/.test(c.sql))
  .map((c) => ({ evento: c.params[3], datos: JSON.parse(c.params[9]) }))

const googleQueNadieDeberiaLlamar = () => ({
  listTabs: async () => { throw new Error('la planilla no se toca cuando la guarda dice que no') },
  readSheetGrid: async () => { throw new Error('idem') },
})

test('un arranque desde otro canal queda auditado, sin leer la planilla', async () => {
  const port = portDoble()
  const r = await iniciarAsistencia({
    port,
    google: googleQueNadieDeberiaLlamar(),
    actor: { plataforma_user_id: 'usr-jefe', plataforma_username: 'jefe', channel_id: 'canal-de-obras', team_id: 'equipo-1' },
  })
  assert.equal(r.estado, 'denegado')
  const negados = eventos(port).filter((e) => e.evento === EVENTO.DENIED)
  assert.equal(negados.length, 1)
  assert.equal(negados[0].datos.motivo, 'canal')
  assert.equal(negados[0].datos.error_code, 'canal_no_es_el_oficial')
  assert.equal(negados[0].datos.mattermost_user_id, 'usr-jefe')
  assert.equal(negados[0].datos.team_id, 'equipo-1')
  assert.ok(!port.consultas.some((c) => /asistencia_sesiones/.test(c.sql)), 'no se abrió sesión')
})

test('un mensaje privado queda auditado con SU detalle', async () => {
  const port = portDoble()
  await iniciarAsistencia({
    port,
    google: googleQueNadieDeberiaLlamar(),
    actor: { plataforma_user_id: 'usr-jefe', channel_id: 'un-dm', channel_type: 'D' },
  })
  assert.equal(eventos(port).find((e) => e.evento === EVENTO.DENIED).datos.error_code, 'canal_directo')
})

test('el origen distingue la mención del comando: son dos puertas', async () => {
  const porDefecto = portDoble()
  await iniciarAsistencia({
    port: porDefecto, google: googleQueNadieDeberiaLlamar(),
    actor: { plataforma_user_id: 'u', channel_id: 'otro-canal' },
  })
  assert.equal(eventos(porDefecto)[0].datos.origen, ORIGEN.MENCION)

  const porComando = portDoble()
  await iniciarAsistencia({
    port: porComando, google: googleQueNadieDeberiaLlamar(), origen: ORIGEN.COMANDO,
    actor: { plataforma_user_id: 'u', channel_id: 'otro-canal' },
  })
  assert.equal(eventos(porComando)[0].datos.origen, ORIGEN.COMANDO)
})

test('el texto que lee el usuario no cambió por auditar', async () => {
  const port = portDoble()
  const r = await iniciarAsistencia({
    port, google: googleQueNadieDeberiaLlamar(),
    actor: { plataforma_user_id: 'u', channel_id: 'otro-canal' },
  })
  assert.match(r.texto, /canal de asistencia del equipo/)
})

test('si la auditoría falla, el rechazo se devuelve igual', async () => {
  const port = portDoble()
  const rota = async () => { throw new Error('la base no responde') }
  const r = await iniciarAsistencia({
    port, google: googleQueNadieDeberiaLlamar(), auditar: rota,
    actor: { plataforma_user_id: 'u', channel_id: 'otro-canal' },
  })
  assert.equal(r.estado, 'denegado')
})
