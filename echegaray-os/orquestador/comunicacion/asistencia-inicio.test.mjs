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
import { ESTADO_SESION, SesionesMemoria } from './asistencia-sesion.mjs'
import { FECHA_HOY, fakeGoogleJornales } from '../lib/jornales-fixture.mjs'

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

// ── QUIÉN PUBLICA LA TARJETA ────────────────────────────────────────────────────
//
// Las dos puertas comparten este arranque pero NO comparten quién publica. La mención la
// publica el Communication Layer (con el bot) después de que esto devuelva; el slash command
// NO puede publicar por respuesta —Mattermost crearía el post a nombre de la persona y el bot
// no podría reescribirlo nunca: 403 en cada refresco por API—, así que pasa `publicar`.

const ACTOR_OK = { plataforma_user_id: 'usr-jefe', plataforma_username: 'jefe', channel_id: CANAL_OFICIAL }

/** El arranque completo, con la planilla de mentira y el repositorio en memoria. */
function arranque({ publicar = null, sesiones = new SesionesMemoria() } = {}) {
  return {
    sesiones,
    correr: () => iniciarAsistencia({
      port: portDoble(), google: fakeGoogleJornales(), actor: ACTOR_OK,
      sesiones, hoy: () => FECHA_HOY, origen: ORIGEN.COMANDO, publicar,
    }),
  }
}

test('con `publicar` la tarjeta la crea el BOT y la sesión queda atada al post desde el arranque', async () => {
  const publicados = []
  const a = arranque({
    publicar: async (p) => { publicados.push(p); return { id: 'post-del-bot' } },
  })
  const r = await a.correr()

  assert.equal(r.estado, 'publicado')
  assert.equal(r.postId, 'post-del-bot')
  assert.equal(publicados.length, 1)
  assert.ok(publicados[0].props.attachments.length >= 2, 'la tarjeta viaja con sus attachments')
  assert.ok(publicados[0].message.length > 0, 'y con texto de respaldo para quien no los dibuja')

  const sesion = a.sesiones.filas[0]
  assert.equal(sesion.estado, ESTADO_SESION.ABIERTA)
  assert.equal(sesion.root_post_id, 'post-del-bot',
    'sin esto, el refresco después de un diálogo depende de que alguien haya tocado un botón antes')
})

test('sin `publicar` (la mención) nada se publica acá y la sesión nace sin post', async () => {
  const a = arranque()
  const r = await a.correr()
  assert.equal(r.estado, 'iniciado')
  assert.ok(r.attachments.length >= 2)
  assert.equal(a.sesiones.filas[0].root_post_id, null, 'la ata el ruteador en el primer click')
})

test('si publicar falla: se avisa, y la sesión NO queda abierta bloqueando la próxima carga', async () => {
  const a = arranque({
    publicar: async () => { const e = new Error('403 no tenés permiso'); e.status = 403; throw e },
  })
  const r = await a.correr()

  assert.equal(r.estado, 'sin_publicar')
  assert.match(r.texto, /no se registró nada/i)
  assert.ok(!r.attachments, 'no hay tarjeta que mostrar')
  assert.equal(a.sesiones.filas[0].estado, ESTADO_SESION.CANCELADA)
})

test('un `publicar` que devuelve algo sin id se trata como fallo, no como éxito', async () => {
  const a = arranque({ publicar: async () => ({}) })
  const r = await a.correr()
  assert.equal(r.estado, 'sin_publicar')
  assert.equal(a.sesiones.filas[0].estado, ESTADO_SESION.CANCELADA)
})

test('la sesión se ata UNA vez: un segundo intento no reapunta la tarjeta', async () => {
  const sesiones = new SesionesMemoria()
  const a = arranque({ sesiones, publicar: async () => ({ id: 'post-1' }) })
  await a.correr()
  assert.equal(await sesiones.atarPost(sesiones.filas[0].id, 'post-2'), null)
  assert.equal(sesiones.filas[0].root_post_id, 'post-1')
})
