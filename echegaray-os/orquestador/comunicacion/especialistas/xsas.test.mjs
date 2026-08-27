// MATTERMOST ENTRA POR LA MISMA PUERTA QUE app.ecsas. Lo que estos tests atrapan es la vuelta
// atrás: un camino propio de Mattermost hacia el Core, o permisos deducidos del mensaje.
import test from 'node:test'
import assert from 'node:assert/strict'

import { especialista, render } from './xsas.mjs'
import { parsearPosted, mapearAPayload, esRelevante } from '../mattermost-ws-consumer.mjs'
import { nombresDelBot } from '../identidad-bot.mjs'
import { atender } from '../../lib/xsas-gateway.mjs'

const BOT = 'ns855xm17fdrmkmn6bcncsg6oa'

/** Un frame WS `posted` real (la forma que manda Mattermost), con el texto que se quiera. */
function frame(message, { mentions = [BOT] } = {}) {
  return JSON.stringify({
    event: 'posted',
    data: {
      post: JSON.stringify({ id: 'p-1', user_id: 'u-jorge', channel_id: 'c-direccion', message, root_id: '', type: '' }),
      channel_type: 'P', channel_name: 'direccion', team_id: 't1', sender_name: '@jorge',
      mentions: JSON.stringify(mentions),
    },
  })
}

/** La base: identidad de Mattermost → perfil con rol. Es la ÚNICA fuente de los permisos. */
const portConPerfil = (rol) => ({
  query: async (sql) => (/perfiles/.test(sql) ? { rows: [{ rol, nombre: 'Jorge' }] } : { rows: [] }),
})
import { permisosDeRol } from '../../lib/xsas-permisos.mjs'

test('@xsas y @os entran los dos: es UN bot con UN user_id, no dos identidades', () => {
  const nombres = nombresDelBot({})
  assert.deepEqual(nombres, ['xsas', 'os'])
  for (const n of nombres) {
    const info = parsearPosted(frame(`@${n} cómo venimos`, { mentions: [] }))
    assert.equal(esRelevante(info, { botUserId: BOT, botUsernames: nombres }), true, `@${n} debería entrar`)
  }
})

test('el alias de transición se puede APAGAR — si no se puede, no es transición', () => {
  assert.deepEqual(nombresDelBot({ MM_BOT_ALIAS: '' }), ['xsas'])
  const info = parsearPosted(frame('@os cómo venimos', { mentions: [] }))
  assert.equal(esRelevante(info, { botUserId: BOT, botUsernames: nombresDelBot({ MM_BOT_ALIAS: '' }) }), false)
})

test('XSAS sólo reclama lo que resuelve sin modelo: no le saca mensajes a nadie', () => {
  assert.deepEqual(especialista.reconoce('¿cómo venimos?'), { intencion: 'os.estado_empresa', confianza: 0.9 })
  assert.equal(especialista.reconoce('3 ausente'), null)
  assert.equal(especialista.reconoce('recordame llamar al banco'), null)
})

test('EL DEFECTO: por el canal el mensaje llega con la mención pegada y el atajo no disparaba', () => {
  // `@xsas cómo venimos` es literalmente lo que manda Mattermost. Un atajo probado sólo con el
  // texto pelado pasa el test y nunca se dispara en producción.
  assert.equal(especialista.reconoce('@xsas cómo venimos').intencion, 'os.estado_empresa')
  assert.equal(especialista.reconoce('@os ¿Cómo venimos?').intencion, 'os.estado_empresa')
})

test('(B) Mattermost → Gateway → Core: el pedido que arma el canal es el contrato de XSAS', async () => {
  const info = parsearPosted(frame('@xsas cómo venimos', { mentions: [BOT] }))
  const payload = mapearAPayload(info.post, info)
  assert.equal(payload.channel_id, 'c-direccion')

  const pedidos = []
  const r = await especialista.atender({
    texto: payload.text,
    intencion: especialista.reconoce(payload.text)?.intencion,
    port: portConPerfil('direccion'),
    actor: { plataforma_user_id: payload.user_id, channel_id: payload.channel_id },
    correlationId: 'corr-mm-1',
    xsas: async (bruto) => {
      pedidos.push(bruto)
      return { ok: true, estado: 'ok', respuesta: 'venimos así', degradacion: null, correlationId: bruto.correlation_id, llm: null, capacidades: { nivel: 0, tools: ['os.estado_empresa'] } }
    },
  })

  const [p] = pedidos
  assert.equal(p.canal, 'mattermost')
  assert.equal(p.origen, 'c-direccion')
  assert.equal(p.intencion, 'os.estado_empresa', 'el atajo ya identificó la capacidad: no se re-clasifica')
  assert.equal(p.mensaje, null)
  assert.equal(p.verificado_por, 'canal-mattermost')
  assert.equal(p.correlation_id, 'corr-mm-1', 'el hilo de seguimiento del canal es el del pedido')
  // Se compara contra la TABLA, no contra una lista escrita acá: lo que este test protege es que
  // los permisos salgan del rol y no del texto del mensaje. Congelar la lista lo convertía en un
  // test que se pone rojo cada vez que el dueño autoriza una capacidad — que es ruido, no defecto.
  assert.deepEqual(p.actor.permisos, permisosDeRol('direccion'), 'los permisos salieron del rol, no del texto')
  assert.ok(p.actor.permisos.length > 0)
  assert.equal(r.datos.llm, false, 'un atajo literal NO puede pagar un modelo')
  assert.equal(r.datos.nivel, 0)
})

test('LOS PERMISOS SALEN DE `perfiles`, NUNCA DEL MENSAJE: sin perfil no corre una tool', async () => {
  const sinPerfil = { query: async () => ({ rows: [] }) }
  const r = await especialista.atender({
    texto: 'cómo venimos', intencion: 'os.estado_empresa', port: sinPerfil,
    actor: { plataforma_user_id: 'u-desconocido', channel_id: 'c-1' }, correlationId: 'x',
  })
  assert.match(r.texto, /sin permiso para os\.estado_empresa/)
})

test('(P) el pedido que arma Mattermost es el MISMO contrato que atiende la app', async () => {
  // Misma capacidad, dos canales, un Core. Se comparan las capacidades usadas, no el texto.
  const registro = {
    mapa: new Map([['os.estado_empresa', {
      capability: 'drive.read',
      schema: { name: 'estado_empresa', input_schema: { type: 'object', properties: {} } },
      async run() { return { resumen_texto: 'venimos así' } },
    }]]),
    porArchivo: new Map(), fallaron: [],
  }
  const actor = { id: 'u', rol: 'direccion', permisos: ['drive.read'] }
  const app = await atender({ actor, canal: 'app', intencion: 'os.estado_empresa' }, { registro, catalogo: [] })
  const mm = await atender({ actor, canal: 'mattermost', intencion: 'os.estado_empresa' }, { registro, catalogo: [] })
  assert.equal(app.respuesta, mm.respuesta)
  assert.deepEqual(app.capacidades, mm.capacidades)
})

test('una respuesta degradada NO se publica como si fuera normal', () => {
  const txt = render({ respuesta: 'algo', degradacion: 'sin razonador (credit)', estado: 'degradado' })
  assert.match(txt, /▲ sin razonador \(credit\)/)
})

test('(P) el director entrega el RECLAMO ENTERO, no su campo: la capacidad se desenvuelve acá', async () => {
  // El defecto que atrapa: `director.mjs` guarda `{ especialista, intencion: r }` con `r` = lo que
  // devolvió `reconoce()`, o sea `{ intencion, confianza }`, y lo pasa tal cual a `atender`. Este
  // archivo lo trataba como string y le mandaba el OBJETO al gateway, que lo rechazaba con
  // «intencion — Expected string, received object». En producción el mensaje moría en el canal.
  //
  // Se alimenta EXACTAMENTE lo que produce `reconoce`, no su `.intencion`: probar con el string
  // es probar el código contra sí mismo, que es cómo esto pasó a producción verde.
  const reclamo = especialista.reconoce('@xsas cómo venimos')
  assert.equal(typeof reclamo, 'object', 'el reclamo es un objeto: si dejara de serlo, este test sobra')

  const pedidos = []
  await especialista.atender({
    texto: '@xsas cómo venimos',
    intencion: reclamo,
    port: portConPerfil('direccion'),
    actor: { plataforma_user_id: 'u-1', channel_id: 'c-1' },
    correlationId: 'corr-obj',
    xsas: async (bruto) => {
      pedidos.push(bruto)
      return { ok: true, estado: 'ok', respuesta: 'ok', degradacion: null, correlationId: bruto.correlation_id, llm: null, capacidades: { nivel: 0, tools: [] } }
    },
  })

  const [p] = pedidos
  assert.equal(p.intencion, 'os.estado_empresa', 'al gateway va la capacidad, no el reclamo')
  assert.equal(p.mensaje, null, 'con capacidad identificada no se manda el texto a re-clasificar')
  assert.equal(especialista.skillDe(reclamo), 'xsas.os.estado_empresa', 'la skill tampoco puede quedar "[object Object]"')
})
