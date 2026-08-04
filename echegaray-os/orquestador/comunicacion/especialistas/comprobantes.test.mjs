// QUIÉN RECLAMA LA FOTO — la trampa número uno de este subsistema.
//
// Una capacidad puede estar impecable y no ejecutarse nunca porque ningún especialista reclamó el
// mensaje. Acá se prueba lo que decide eso: la gramática del especialista, y el camino completo
// Director → especialista con un post que sólo trae una imagen.

import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista } from './comprobantes.mjs'
import { urlAccion } from './comprobantes.mjs'
import { resolver, VIA } from '../director.mjs'
import { especialistas } from '../registro-especialistas.mjs'
import { esRelevante, mapearAPayload, canalesDeAdjuntos } from '../mattermost-ws-consumer.mjs'

const portCanal = (area) => ({
  async query(sql) {
    if (/canales_area/.test(sql)) return { rows: area ? [{ area_clave: area, canal_nombre: 'comprobantes-gastos' }] : [] }
    return { rows: [] }
  },
})

// ── El reclamo ───────────────────────────────────────────────────────────────

test('una foto sin una sola palabra, en el canal de compras, la reclama Compras IA', () => {
  const r = especialista.reconoce('', { fileIds: ['f1'], area: 'compras' })
  assert.equal(r.destino, 'cargar')
  assert.equal(r.confianza, 1)
})

test('un mensaje SIN adjuntos en el canal de compras NO se reclama: no le roba a los demás', () => {
  assert.equal(especialista.reconoce('cuánto le debemos a Cemento SA', { fileIds: [], area: 'compras' }), null)
  assert.equal(especialista.reconoce('hola', { fileIds: [], area: 'compras' }), null)
})

test('una foto en OTRO canal no la reclama: el canal de comprobantes es el de comprobantes', () => {
  assert.equal(especialista.reconoce('', { fileIds: ['f1'], area: 'personas' }), null)
})

test('preguntar cómo se cargan los comprobantes sí se reclama, flojito', () => {
  const r = especialista.reconoce('cómo cargo un comprobante', {})
  assert.equal(r.destino, 'ayuda')
  assert.ok(r.confianza < 1, 'una pregunta no puede ganarle a un especialista que reconoce lo suyo')
})

// ── El registro y el Director ────────────────────────────────────────────────

test('el especialista está registrado y aparece en el catálogo del OS', async () => {
  const todos = await especialistas({ recargar: true })
  const yo = todos.find((e) => e.slug === 'comprobantes')
  assert.ok(yo, 'si no está en el registro, el dueño no puede descubrir la capacidad preguntando')
  assert.equal(yo.area, 'compras')
  assert.equal(yo.operativo, true)
})

test('el DIRECTOR le entrega un post con adjuntos, aunque el texto esté vacío', async () => {
  const r = await resolver({ texto: '', port: portCanal('compras'), channelId: 'c1', fileIds: ['f1'] })
  assert.equal(r.especialista?.slug, 'comprobantes')
  assert.equal(r.via, VIA.RECLAMO, 'lo reclama su gramática: cero llamadas a un modelo')
})

test('sin adjuntos, el mismo canal NO dispara la carga (el Director no inventa un pedido)', async () => {
  const r = await resolver({ texto: 'buenas', port: portCanal('compras'), channelId: 'c1', fileIds: [] })
  // Puede llegar por área (es el especialista del canal), pero NUNCA por reclamo.
  assert.notEqual(r.via, VIA.RECLAMO)
})

test('llegar por el canal sin adjuntos contesta la ayuda, no arranca ningún trabajo', async () => {
  const r = await especialista.atender({ texto: 'buenas', fileIds: [], actor: {}, port: null })
  assert.equal(r.estado, 'ayuda')
  assert.match(r.texto, /canal de comprobantes/)
})

// ── La ingesta por WebSocket ─────────────────────────────────────────────────

const posted = (o = {}) => ({
  post: { id: 'p1', user_id: 'u1', channel_id: 'c1', message: '', file_ids: ['f1'], ...(o.post ?? {}) },
  channelType: 'P',
  channelName: 'comprobantes-gastos',
  mentions: [],
  ...o,
})

test('un post CON adjuntos en el canal de comprobantes entra sin mencionar a @os', () => {
  assert.equal(esRelevante(posted(), { botUserId: 'bot', botUsername: 'os' }), true)
})

test('un post SIN adjuntos en ese canal se sigue ignorando: cero costo para lo irrelevante', () => {
  assert.equal(esRelevante(posted({ post: { file_ids: [], message: 'che' } }), { botUserId: 'bot' }), false)
})

test('un post con adjuntos en CUALQUIER otro canal se ignora', () => {
  assert.equal(esRelevante(posted({ channelName: 'general' }), { botUserId: 'bot' }), false)
})

test('el eco del propio bot nunca entra, ni con adjuntos', () => {
  assert.equal(esRelevante(posted({ post: { user_id: 'bot' } }), { botUserId: 'bot' }), false)
})

test('un post de sistema con adjuntos tampoco', () => {
  assert.equal(esRelevante(posted({ post: { type: 'system_join_channel' } }), { botUserId: 'bot' }), false)
})

test('el canal de ingesta es CONFIGURACIÓN, no un id escrito en el código', () => {
  const canales = canalesDeAdjuntos({ MM_CANALES_ADJUNTOS: 'comprobantes-gastos, gastos-obra' })
  assert.ok(canales.has('comprobantes-gastos'))
  assert.ok(canales.has('gastos-obra'))
  assert.ok(canalesDeAdjuntos({}).has('comprobantes-gastos'), 'y trae el default que pidió el dueño')
})

test('los ids de los adjuntos viajan en el payload: sin eso la foto no existe para nadie', () => {
  const p = mapearAPayload(posted().post, posted())
  assert.deepEqual(p.file_ids, ['f1'])
  assert.equal(p.channel_type, 'P')
  assert.equal(p.root_id, 'p1', 'la respuesta va al hilo del mensaje que la originó')
})

// ── La URL de callback ───────────────────────────────────────────────────────

test('la URL de los botones lleva el secreto en la QUERY (el callback no trae identidad)', () => {
  const u = urlAccion({ COMPROBANTES_ACCION_URL: 'https://x/comprobantes/accion', COMPROBANTES_ACCION_SECRETO: 'sec' })
  assert.equal(u, 'https://x/comprobantes/accion?t=sec')
})

test('sin secreto configurado la URL queda pelada, y el endpoint deniega: falla cerrado', () => {
  const u = urlAccion({ COMPROBANTES_ACCION_URL: 'https://x/comprobantes/accion' })
  assert.equal(u, 'https://x/comprobantes/accion')
})

test('el secreto de comprobantes NO es el de asistencia: dos puertas, dos llaves', () => {
  const u = urlAccion({
    COMPROBANTES_ACCION_URL: 'https://x/comprobantes/accion',
    COMPROBANTES_ACCION_SECRETO: 'sec-comprobantes',
    ASISTENCIA_ACCION_SECRETO: 'sec-asistencia',
  })
  assert.match(u, /t=sec-comprobantes$/)
})
// EL BOTÓN NUNCA SALE SIN FIRMAR.
//
// El 04/08, en producción: el botón de obra se publicó sin el `?t=` y el servidor lo rechazó con
// `secreto_invalido`. Mattermost lo muestra como "Sorry, we could not find the page", que no dice
// nada de un secreto. La causa: el llamador pasaba `config.env`, que es la config validada por Zod
// —una lista blanca donde el secreto no está—, no el entorno. Un env PARCIAL es peor que ninguno:
// `undefined` cae al default y funciona; un objeto sin la clave firma con nada.

test('un env parcial NO deja el botón sin secreto: se completa del proceso', () => {
  const antesU = process.env.COMPROBANTES_ACCION_URL
  const antesS = process.env.COMPROBANTES_ACCION_SECRETO
  process.env.COMPROBANTES_ACCION_URL = 'https://x/comprobantes/accion'
  process.env.COMPROBANTES_ACCION_SECRETO = 'SECRETO123'
  try {
    // Esto es exactamente lo que llegaba: un objeto que existe y no tiene ninguna de las dos claves.
    const u = urlAccion({ DATABASE_URL: 'postgres://…', TENANT: 'echegaray' })
    assert.match(u, /[?&]t=SECRETO123$/, 'el botón tiene que ir firmado aunque el env que llega esté incompleto')
  } finally {
    if (antesU === undefined) delete process.env.COMPROBANTES_ACCION_URL; else process.env.COMPROBANTES_ACCION_URL = antesU
    if (antesS === undefined) delete process.env.COMPROBANTES_ACCION_SECRETO; else process.env.COMPROBANTES_ACCION_SECRETO = antesS
  }
})

test('el env que llega tiene precedencia sobre el del proceso', () => {
  const antes = process.env.COMPROBANTES_ACCION_SECRETO
  process.env.COMPROBANTES_ACCION_SECRETO = 'DEL_PROCESO'
  try {
    const u = urlAccion({ COMPROBANTES_ACCION_URL: 'https://y/accion', COMPROBANTES_ACCION_SECRETO: 'DEL_ENV' })
    assert.match(u, /^https:\/\/y\/accion\?t=DEL_ENV$/)
  } finally {
    if (antes === undefined) delete process.env.COMPROBANTES_ACCION_SECRETO; else process.env.COMPROBANTES_ACCION_SECRETO = antes
  }
})
