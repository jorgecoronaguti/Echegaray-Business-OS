// EL BUCLE DE PRODUCCIÓN DEL 13/08, REPRODUCIDO SIN POSTGRES.
//
// Cada test de acá es un renglón del journal del worker. Si alguno se pone verde por casualidad,
// revertí `lease-tarea.mjs` y tienen que ponerse rojos los cinco primeros.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { correrConLease, CIERRE, esTransicionInvalida, FRACCION_LATIDO } from './lease-tarea.mjs'

/** Un reloj de mentira: `programar` guarda el callback y el test decide cuándo late. */
function relojFalso() {
  const timers = []
  return {
    programar: (fn, ms) => { const t = { fn, ms, vivo: true }; timers.push(t); return t },
    cancelar: (t) => { if (t) t.vivo = false },
    timers,
    async latir() { for (const t of timers) if (t.vivo) await t.fn() },
  }
}

function espia() {
  const llamadas = []
  return {
    llamadas,
    transition: async (id, w, estado) => { llamadas.push(['transition', estado]); return estado },
    failTask: async (id, w, error) => { llamadas.push(['failTask', error]); return 'retrying' },
    estados: () => llamadas.filter((l) => l[0] === 'transition').map((l) => l[1]),
  }
}

const TAREA = { id: 'fcb3a2eb-817a-494f-9143-421a85811cde', type: 'comunicacion.responder' }

// ── EL CAMINO SANO ───────────────────────────────────────────────────────────

test('una tarea larga LATE mientras corre: el lease no se vence y se cierra en succeeded', async () => {
  const reloj = relojFalso()
  const s = espia()
  const latidos = []
  const r = await correrConLease({
    task: TAREA,
    workerId: 'comm-wf-1',
    leaseSeconds: 180,
    ...reloj,
    heartbeat: async (id, w, secs) => { latidos.push({ id, w, secs }); return true },
    transition: s.transition,
    failTask: s.failTask,
    // El handler "tarda": late tres veces mientras corre, como en los 150 s reales.
    correr: async () => { await reloj.latir(); await reloj.latir(); await reloj.latir(); return { result: { ok: 1 } } },
  })
  assert.equal(r.cierre, CIERRE.OK)
  assert.equal(latidos.length, 3, 'sin latido el reap se lleva la tarea: ése era el defecto')
  assert.equal(latidos[0].secs, 180, 'el latido renueva el lease completo, no un resto')
  assert.deepEqual(s.estados(), ['reviewing', 'succeeded'])
})

test('el latido se programa VARIAS veces por lease: uno perdido no cuesta la tarea', async () => {
  const reloj = relojFalso()
  await correrConLease({
    task: TAREA, workerId: 'w', leaseSeconds: 180, ...reloj,
    heartbeat: async () => true, transition: async () => {}, failTask: async () => {},
    correr: async () => ({}),
  })
  const ms = reloj.timers[0].ms
  assert.ok(ms <= 180 * 1000 * FRACCION_LATIDO + 1, 'el intervalo tiene que caber holgado dentro del lease')
  assert.ok(180 * 1000 / ms >= 3, `con ${ms}ms caben menos de 3 latidos en el lease`)
})

// ── EL BUCLE MEDIDO EN PRODUCCIÓN ────────────────────────────────────────────

test('si el lease se perdió y el handler YA publicó, no se transiciona ni se reintenta', async () => {
  const reloj = relojFalso()
  const s = espia()
  const r = await correrConLease({
    task: TAREA, workerId: 'comm-wf-1', leaseSeconds: 30, ...reloj,
    heartbeat: async () => false,               // el reap ya la mandó a `retrying`
    transition: s.transition, failTask: s.failTask,
    correr: async () => { await reloj.latir(); return { result: { publicado: true } } },
  })
  assert.equal(r.cierre, CIERRE.LEASE_PERDIDO)
  // Esto es TODO el arreglo: cero `reviewing` (la transición que reventaba) y cero `failTask`
  // (la llamada que reencolaba la tarea y la hacía publicar de nuevo).
  assert.deepEqual(s.estados(), [], 'no se intenta retrying -> reviewing')
  assert.equal(s.llamadas.some((l) => l[0] === 'failTask'), false,
    'failTask reencola un efecto que YA salió al canal: es cómo se publicaba tres veces')
})

test('la excepción "transición inválida retrying -> reviewing" NO dispara un reintento', async () => {
  const reloj = relojFalso()
  const s = espia()
  const r = await correrConLease({
    task: TAREA, workerId: 'comm-wf-1', leaseSeconds: 30, ...reloj,
    heartbeat: async () => true,   // el latido no llegó a correr: el reap ganó igual
    failTask: s.failTask,
    transition: async (id, w, estado) => {
      s.llamadas.push(['transition', estado])
      if (estado === 'reviewing') throw new Error('transición inválida retrying -> reviewing (tarea fcb3a2eb)')
    },
    correr: async () => ({ result: {} }),
  })
  assert.equal(r.cierre, CIERRE.LEASE_PERDIDO)
  assert.equal(s.llamadas.some((l) => l[0] === 'failTask'), false, 'el bucle se corta acá')
})

test('un fallo REAL del handler, con el lease sano, sí marca fallo (el reintento sirve)', async () => {
  const reloj = relojFalso()
  const s = espia()
  const r = await correrConLease({
    task: TAREA, workerId: 'w', leaseSeconds: 180, ...reloj,
    heartbeat: async () => true, transition: s.transition, failTask: s.failTask,
    correr: async () => { throw new Error('sin handler para comunicacion.responder') },
  })
  assert.equal(r.cierre, CIERRE.FALLO)
  assert.equal(s.llamadas.filter((l) => l[0] === 'failTask').length, 1)
})

// ── LO QUE NO PUEDE TUMBAR LA TAREA ──────────────────────────────────────────

test('un heartbeat que revienta por red NO mata la tarea ni la reintenta', async () => {
  const reloj = relojFalso()
  const s = espia()
  const r = await correrConLease({
    task: TAREA, workerId: 'w', leaseSeconds: 180, ...reloj,
    heartbeat: async () => { throw new Error('ECONNRESET') },
    transition: s.transition, failTask: s.failTask,
    correr: async () => { await reloj.latir(); return { result: {} } },
  })
  assert.equal(r.cierre, CIERRE.OK, 'no poder latir no es haber perdido el lease')
  assert.deepEqual(s.estados(), ['reviewing', 'succeeded'])
})

test('el latido se cancela siempre, aunque el handler falle: un timer vivo es un worker que no muere', async () => {
  const reloj = relojFalso()
  await correrConLease({
    task: TAREA, workerId: 'w', leaseSeconds: 180, ...reloj,
    heartbeat: async () => true, transition: async () => {}, failTask: async () => {},
    correr: async () => { throw new Error('boom') },
  })
  assert.equal(reloj.timers.every((t) => !t.vivo), true)
})

test('`correrConLease` NUNCA lanza: el worker tiene que poder seguir con la tarea siguiente', async () => {
  const reloj = relojFalso()
  const r = await correrConLease({
    task: TAREA, workerId: 'w', leaseSeconds: 180, ...reloj,
    heartbeat: async () => true,
    transition: async () => { throw new Error('la base no contesta') },
    failTask: async () => { throw new Error('tampoco contesta acá') },
    correr: async () => ({}),
  })
  assert.equal(r.cierre, CIERRE.FALLO)
})

test('el reconocedor de la transición rechazada mira el texto que produce plpgsql', () => {
  assert.equal(esTransicionInvalida('transición inválida retrying -> reviewing (tarea x)'), true)
  assert.equal(esTransicionInvalida('transicion invalida failed -> succeeded'), true)
  assert.equal(esTransicionInvalida('worker comm-wf-1 no es dueño del lease de la tarea x'), true)
  assert.equal(esTransicionInvalida('ECONNREFUSED'), false)
  assert.equal(esTransicionInvalida('no pude bajar el archivo'), false)
})

// ── LA TABLA DE TRANSICIONES, LEÍDA DE LA MIGRACIÓN ──────────────────────────
//
// El arreglo se apoya en que `retrying -> reviewing` NO existe. Si alguien la agregara para "que no
// falle", una tarea reapeada podría declararse exitosa mientras otro worker la está rehaciendo. Este
// test fija esa ausencia y, con ella, el camino de reintento que SÍ tiene que existir.

const SQL = readFileSync(
  new URL('../../supabase/migrations/20260711120000_orq_fundacion_work_fabric.sql', import.meta.url),
  'utf8',
)

/** Los pares `('a','b')` del insert de `orq.task_transitions`. */
function transiciones() {
  const bloque = SQL.split('insert into orq.task_transitions (from_state, to_state) values')[1] ?? ''
  const hasta = bloque.split(';')[0]
  return new Set([...hasta.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)].map((m) => `${m[1]}->${m[2]}`))
}

test('la máquina de estados NO permite retrying -> reviewing, y por eso el arreglo va en el worker', () => {
  const t = transiciones()
  assert.ok(t.size > 10, 'no se pudo leer la tabla de transiciones de la migración')
  assert.equal(t.has('retrying->reviewing'), false,
    'agregar esta transición dejaría que una tarea reapeada se declare exitosa por encima de quien la rehace')
  assert.equal(t.has('failed->reviewing'), false)
})

test('el camino de reintento existe entero: running -> failed -> retrying -> ready -> claimed', () => {
  const t = transiciones()
  for (const par of ['running->failed', 'failed->retrying', 'retrying->ready', 'ready->claimed', 'claimed->running']) {
    assert.equal(t.has(par), true, `falta la transición ${par}`)
  }
  // Y la salida terminal cuando se agotan los intentos: sin ella el bucle no tendría fondo.
  assert.equal(t.has('failed->dead_letter'), true)
})

test('el camino feliz también: running -> reviewing -> succeeded', () => {
  const t = transiciones()
  assert.equal(t.has('running->reviewing'), true)
  assert.equal(t.has('reviewing->succeeded'), true)
})
