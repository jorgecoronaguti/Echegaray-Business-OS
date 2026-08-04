// EL CANAL OFICIAL SALE DEL BINDING, Y NO SABERLO NO ES SABER QUE NO.
//
// Estas pruebas fijan las tres respuestas posibles —es el oficial, no lo es, no se pudo preguntar—
// porque de esa tercera depende que el resto del sistema pueda decir «no pude verificar» en vez de
// «no tenés permiso». Colapsarlas en un booleano es el error que este módulo existe para impedir.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { canalOficialDeArea, canalesDeArea, CANAL } from './canal-de-area.mjs'

/** `port` mínimo: responde el binding y registra con qué se lo consultó. */
function portFalso({ filas = [], explota = false } = {}) {
  const llamadas = []
  return {
    llamadas,
    async query(sql, params) {
      llamadas.push({ sql, params })
      if (explota) throw new Error('base caída (simulado)')
      return { rows: filas }
    },
  }
}

test('el canal atado al área es el oficial, y se pregunta por área — nunca por un id escrito en el código', async () => {
  const port = portFalso({ filas: [{ canal_nombre: 'comprobantes-gastos' }] })
  const r = await canalOficialDeArea({ port, channelId: 'c1', area: 'compras' })
  assert.deepEqual(r, { ok: true, canal: 'c1', nombre: 'comprobantes-gastos' })
  const { sql, params } = port.llamadas[0]
  assert.match(sql, /comunicacion\.canales_area/)
  assert.match(sql, /activo/)
  assert.deepEqual(params, ['mattermost', 'c1', 'compras'])
})

test('un canal que no está atado a esa área no es el oficial', async () => {
  const port = portFalso({ filas: [] })
  const r = await canalOficialDeArea({ port, channelId: 'c9', area: 'compras' })
  assert.deepEqual(r, { ok: false, motivo: CANAL.NO_ES_EL_OFICIAL })
})

test('la misma fila NO sirve para otra área: el canal de asistencia no habilita comprobantes', async () => {
  // El binding se consulta con el área, así que un canal atado a `personas` devuelve vacío cuando
  // la pregunta es por `compras`. Se prueba con el port que filtra de verdad por parámetro.
  const port = {
    async query(_sql, [, channelId, area]) {
      return { rows: (channelId === 'c-asistencia' && area === 'personas') ? [{ canal_nombre: 'asistencia' }] : [] }
    },
  }
  assert.equal((await canalOficialDeArea({ port, channelId: 'c-asistencia', area: 'personas' })).ok, true)
  assert.equal((await canalOficialDeArea({ port, channelId: 'c-asistencia', area: 'compras' })).ok, false)
})

test('si la base no contesta, el motivo es NO VERIFICABLE — no "no es el oficial"', async () => {
  const port = portFalso({ explota: true })
  const r = await canalOficialDeArea({ port, channelId: 'c1', area: 'compras' })
  assert.deepEqual(r, { ok: false, motivo: CANAL.NO_VERIFICABLE })
})

test('sin acceso a la base tampoco se puede verificar', async () => {
  const r = await canalOficialDeArea({ port: null, channelId: 'c1', area: 'compras' })
  assert.deepEqual(r, { ok: false, motivo: CANAL.NO_VERIFICABLE })
})

test('sin canal no hay nada que preguntar', async () => {
  const r = await canalOficialDeArea({ port: portFalso(), channelId: '  ', area: 'compras' })
  assert.deepEqual(r, { ok: false, motivo: CANAL.SIN_CANAL })
})

test('los canales de un área vienen con id y con nombre: el WebSocket trae el slug, la base el id', async () => {
  const port = portFalso({
    filas: [
      { channel_id: 'c1', canal_nombre: 'comprobantes-gastos' },
      { channel_id: 'c2', canal_nombre: null },
      { channel_id: null, canal_nombre: 'huerfano' }, // sin id no identifica nada: se descarta
    ],
  })
  const r = await canalesDeArea({ port, area: 'compras' })
  assert.deepEqual(r, {
    ok: true,
    canales: [{ channelId: 'c1', nombre: 'comprobantes-gastos' }, { channelId: 'c2', nombre: null }],
  })
  assert.deepEqual(port.llamadas[0].params, ['mattermost', 'compras'])
})

test('listar los canales de un área con la base caída avisa que no se pudo, y no devuelve una lista vacía', async () => {
  // Una lista vacía se leería como "esta área no tiene canales" y apagaría la ingesta en silencio.
  const r = await canalesDeArea({ port: portFalso({ explota: true }), area: 'compras' })
  assert.deepEqual(r, { ok: false, motivo: CANAL.NO_VERIFICABLE })
})

// ── UNA SOLA RESPUESTA A LA MISMA PREGUNTA ─────────────────────────────────────
//
// Cada guarda tenía su propia consulta al binding, iguales salvo el área. Dos copias de la misma
// regla se separan a la primera corrección: la de asistencia distinguía «no se pudo verificar» con
// un `catch` y la de comprobantes con otro, y nada garantizaba que siguieran diciendo lo mismo.
// Ahora la consulta vive acá y las guardas traducen motivos.

test('ninguna guarda tiene su propia consulta al binding: todas pasan por esta lib', () => {
  const guardas = [
    ['asistencia', new URL('../comunicacion/asistencia-guarda.mjs', import.meta.url)],
    ['comprobantes', new URL('../comunicacion/comprobantes/guarda.mjs', import.meta.url)],
  ]
  for (const [quien, url] of guardas) {
    const src = readFileSync(url, 'utf8')
    assert.doesNotMatch(
      src, /select[\s\S]{0,120}from\s+comunicacion\.canales_area/i,
      `la guarda de ${quien} tiene su propia consulta al binding`)
    assert.match(src, /canal-de-area\.mjs/, `la guarda de ${quien} no usa la lib compartida`)
  }
})

test('el prefiltro de ingesta también pregunta por el área, no por una lista escrita a mano', () => {
  const src = readFileSync(new URL('../comunicacion/mattermost-ws-consumer.mjs', import.meta.url), 'utf8')
  assert.match(src, /canalesDeArea/, 'los canales de ingesta tienen que salir del binding')
})
