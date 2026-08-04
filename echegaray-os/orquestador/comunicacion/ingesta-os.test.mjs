// El hilo con el que se responde. Un `root_id` que apunta a una RESPUESTA hace que
// Mattermost devuelva `400 Invalid RootId parameter` y la respuesta del OS muera en
// dead-letter: el bot entiende, rutea, redacta — y nadie ve nada. Pasó de verdad
// (outbox id 21 y 7, 03 y 04/08/2026), y pasa justo en el caso normal: cuando la
// persona escribe DENTRO de un hilo, que es como se conversa con el bot.
import test from 'node:test'
import assert from 'node:assert/strict'
import { crearEmitEventOS } from './ingesta-os.mjs'

/** Port falso: no toca Postgres, y captura la tarea encolada para poder mirarla. */
function portFalso() {
  const encoladas = []
  const client = {
    async query(sql, params) {
      if (sql.includes('from orq.tasks where dedupe_key')) return { rows: [] }
      if (sql.includes('orq.emit_event')) return { rows: [{}] }
      if (sql.includes('orq.enqueue_task')) {
        encoladas.push(JSON.parse(params[0]))
        return { rows: [{ id: 'task-1' }] }
      }
      return { rows: [{}] }
    },
  }
  return {
    encoladas,
    async query() { return { rows: [{ tenant_id: 't', project_id: 'p' }] } },
    async withTx(fn) { return fn(client) },
  }
}

const evento = (data) => ({
  type: 'comunicacion.mensaje.recibido',
  subject_type: 'comunicacion',
  correlation_id: 'c-1',
  causation_id: 'e-1',
  payload: { comm_event_id: `cid-${Math.random()}`, canal: 'canal-1', data },
})

test('un mensaje DENTRO de un hilo se responde en la RAÍZ del hilo, no en la respuesta', async () => {
  const port = portFalso()
  const emitEvent = crearEmitEventOS(port)
  // Tal cual lo arma mapearAPayload: post_id es la respuesta, root_id es la raíz real.
  await emitEvent(evento({ post_id: 'respuesta-abc', root_id: 'raiz-xyz', texto: 'hola' }))

  assert.equal(port.encoladas[0].inputs.root_post_id, 'raiz-xyz',
    'se respondió contra el post que llegó: Mattermost lo rechaza con 400 Invalid RootId')
})

test('un mensaje de primer nivel sigue abriendo el hilo bajo sí mismo', async () => {
  const port = portFalso()
  const emitEvent = crearEmitEventOS(port)
  // El consumer ya resuelve `root_id = post.root_id || post.id`: en un top-level son iguales.
  await emitEvent(evento({ post_id: 'post-1', root_id: 'post-1', texto: 'hola' }))

  assert.equal(port.encoladas[0].inputs.root_post_id, 'post-1')
})

test('sin root_id (slash command) se cae al post_id y no rompe', async () => {
  const port = portFalso()
  const emitEvent = crearEmitEventOS(port)
  await emitEvent(evento({ post_id: 'post-2', comando: 'asistencia', argumentos: '29/07' }))

  assert.equal(port.encoladas[0].inputs.root_post_id, 'post-2')
  assert.equal(port.encoladas[0].inputs.comando, 'asistencia 29/07')
})
