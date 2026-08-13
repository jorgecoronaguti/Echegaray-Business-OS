// Tests del ciclo de vida de una tarea del Work Fabric.
//
// Herméticos (sin base, sin red) pero NO complacientes: el ledger falso valida cada transición
// contra la tabla REAL `orq.task_transitions` parseada de las migraciones, y el reaper falso hace
// exactamente lo que hace `orq.reap_expired_leases`. Así el caso 1 reproduce el incidente del
// 13/08 19:27 tal cual pasó en producción, en vez de contra una máquina de estados inventada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  crearCicloTarea, RESULTADO, TIPOS_NO_REPETIBLES, esTransicionInvalida, latidoPara,
} from './ciclo-tarea.mjs'

const MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')

/** Las transiciones permitidas, leídas del SQL que está en la base. Fuente única, no una copia. */
function transicionesReales() {
  const permitidas = new Set()
  for (const f of readdirSync(MIGRACIONES).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRACIONES, f), 'utf8')
    for (const bloque of sql.split(/insert\s+into\s+orq\.task_transitions/i).slice(1)) {
      const corte = bloque.split(/;/)[0]
      for (const [, a, b] of corte.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) permitidas.add(`${a}->${b}`)
    }
  }
  return permitidas
}

const WORKER = 'comm-wf-1'
const ACTIVOS = new Set(['claimed', 'running', 'reviewing', 'compensating'])
const TERMINALES = new Set(['succeeded', 'dead_letter', 'cancelled', 'rejected'])

/** Ledger falso con la semántica de orq.*: claim, heartbeat, transition, fail_task y el reaper. */
function crearLedgerFalso({ type = 'comunicacion.responder', maxAttempts = 3 } = {}) {
  const permitidas = transicionesReales()
  const t = {
    id: 'fcb3a2eb', type, title: 'Responder en el chat', state: 'ready', attempt: 0,
    max_attempts: maxAttempts, locked_by: null, error: null, inputs: { channel_id: 'canal-dir' },
  }
  const intentos = []
  const pedidas = [] // TODA transición pedida, permitida o no: la que rebota igual dejó su ERROR en el log
  const api = {
    tarea: t,
    intentos,
    pedidas,
    claim(workerId) {
      if (!['ready', 'retrying'].includes(t.state)) return null
      t.state = 'claimed'; t.locked_by = workerId; t.attempt += 1
      intentos.push({ attempt_no: t.attempt, state: 'running' })
      return { ...t }
    },
    async transition(id, workerId, to, patch = {}) {
      pedidas.push(`${t.state}->${to}`)
      if (!permitidas.has(`${t.state}->${to}`)) throw new Error(`transición inválida ${t.state} -> ${to} (tarea ${id})`)
      if (ACTIVOS.has(t.state) && t.locked_by !== workerId) throw new Error(`worker ${workerId} no es dueño del lease`)
      if (patch.error) t.error = patch.error
      t.state = to
      if (TERMINALES.has(to) || ['ready', 'retrying', 'paused'].includes(to)) t.locked_by = null
      if (to === 'succeeded') intentos.at(-1).state = 'succeeded'
      return to
    },
    async heartbeat(id, workerId) { return t.locked_by === workerId && ACTIVOS.has(t.state) },
    async failTask(id, workerId, error) {
      if (intentos.at(-1)?.state === 'running') { intentos.at(-1).state = 'failed'; intentos.at(-1).error = error }
      t.error = error; t.locked_by = null
      t.state = t.attempt >= t.max_attempts ? 'dead_letter' : 'retrying'
      return t.state
    },
    async intentoPrevioInterrumpido(id, attempt) {
      const previo = intentos.filter((x) => x.attempt_no < attempt).at(-1)
      return previo?.state === 'timeout'
    },
    /** orq.reap_expired_leases: el lease venció mientras la tarea seguía activa. */
    reap() {
      if (!ACTIVOS.has(t.state)) return false
      if (intentos.at(-1)?.state === 'running') { intentos.at(-1).state = 'timeout'; intentos.at(-1).error = 'lease expirado' }
      t.locked_by = null
      t.state = t.attempt >= t.max_attempts ? 'dead_letter' : 'retrying'
      t.error = 'lease expirado; agotó reintentos'
      return true
    },
  }
  return api
}

/** Ciclo con el latido bajo control del test: `latir()` dispara un latido cuando queremos. */
function armar(ledger, opts = {}) {
  const pendientes = []
  const ciclo = crearCicloTarea({
    ledger, workerId: WORKER, leaseSeconds: 300, heartbeatMs: 15_000, backoffMs: 1,
    ...opts, programar: (fn) => { pendientes.push(fn); return pendientes.length }, cancelar: () => {},
  })
  return { ciclo, latir: async () => { for (const fn of pendientes) await fn() } }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · EL DEFECTO DEL 13/08: lease vencido a mitad del handler
// ─────────────────────────────────────────────────────────────────────────────

test('la máquina de estados NO permite retrying -> reviewing (y no se agrega)', () => {
  const permitidas = transicionesReales()
  assert.equal(permitidas.has('retrying->reviewing'), false,
    'una tarea devuelta a la cola puede tenerla otro worker: cerrarla desde el worker viejo es el bug')
  assert.equal(permitidas.has('running->reviewing'), true, 'el camino sano sigue existiendo')
})

test('lease perdido a mitad: el ciclo NO intenta reviewing ni pisa la tarea', async () => {
  const ledger = crearLedgerFalso()
  const { ciclo, latir } = armar(ledger)
  const task = ledger.claim(WORKER)
  let corridas = 0
  const r = await ciclo(task, {
    correr: async () => {
      corridas++
      ledger.reap() // el reaper actúa mientras el especialista trabaja (2m32s con lease vencido)
      await latir() // el latido descubre que ya no somos dueños
      return { result: { ok: true } }
    },
  })
  assert.equal(r.resultado, RESULTADO.LEASE_PERDIDO)
  assert.equal(corridas, 1)
  // Lo que rompió el 13/08 no fue sólo que la transición rebotara: fue PEDIRLA. Se pide sobre una
  // tarea que ya volvió a la cola y puede tenerla otro worker; si ese otro estuviera en 'running'
  // le robaríamos el cierre. La guarda tiene que evitar el PEDIDO, no atrapar su excepción.
  assert.deepEqual(ledger.pedidas, ['claimed->running'],
    'después de perder el lease no se pide NINGUNA transición más')
  assert.equal(ledger.tarea.state, 'retrying', 'la deja donde la puso el reaper, no la fuerza a reviewing')
  assert.ok(!/transición inválida/.test(ledger.tarea.error ?? ''),
    'el error guardado es la CAUSA (lease expirado), nunca el síntoma de la transición')
})

test('con latido vivo el lease no vence: una sola corrida y termina en succeeded', async () => {
  const ledger = crearLedgerFalso()
  const { ciclo, latir } = armar(ledger)
  const task = ledger.claim(WORKER)
  let corridas = 0
  const r = await ciclo(task, {
    correr: async () => {
      corridas++
      await latir(); await latir() // trabajo largo: dos latidos renuevan el lease
      assert.equal(ledger.tarea.state, 'running')
      return { result: { texto: 'listo' } }
    },
  })
  assert.equal(r.resultado, RESULTADO.OK)
  assert.equal(corridas, 1, 'el especialista corre UNA vez: sin re-ejecución no hay carga duplicada')
  assert.equal(ledger.tarea.state, 'succeeded')
})

test('un latido más lento que el lease no se acepta: se corta al construir', () => {
  assert.throws(() => crearCicloTarea({ ledger: {}, workerId: 'w', leaseSeconds: 30, heartbeatMs: 30_000 }),
    /debe ser menor que el lease/)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · NO REPETIBLE: una tarea cortada a mitad no se re-ejecuta sola
// ─────────────────────────────────────────────────────────────────────────────

test('comunicacion.responder cortada por lease NO se re-ejecuta: termina con motivo', async () => {
  const ledger = crearLedgerFalso()
  const { ciclo } = armar(ledger)
  const primera = ledger.claim(WORKER)
  assert.equal(primera.attempt, 1)
  ledger.reap() // el intento 1 muere por lease vencido, sin saber cuánto alcanzó a cargar

  const segunda = ledger.claim(WORKER)
  let corridas = 0
  const avisos = []
  const r = await ciclo(segunda, {
    correr: async () => { corridas++; return {} },
    alTerminarEnFallo: (t, info) => { avisos.push(info) },
  })
  assert.equal(corridas, 0, 'el especialista NO vuelve a correr sobre un estado que ya modificó')
  assert.equal(r.resultado, RESULTADO.TERMINAL)
  assert.equal(ledger.tarea.state, 'cancelled')
  assert.match(ledger.tarea.error, /no se puede repetir sin duplicar/)
  assert.equal(avisos.length, 1, 'el fallo se avisa: el dueño no puede enterarse por los logs')
  assert.match(avisos[0].motivo, /lease vencido/)
})

test('un tipo repetible SÍ se reintenta tras un lease vencido (la guarda es opt-in)', async () => {
  assert.equal(TIPOS_NO_REPETIBLES.has('noop'), false)
  const ledger = crearLedgerFalso({ type: 'noop' })
  const { ciclo } = armar(ledger)
  ledger.claim(WORKER); ledger.reap()
  let corridas = 0
  const r = await ciclo(ledger.claim(WORKER), { correr: async () => { corridas++; return {} } })
  assert.equal(corridas, 1)
  assert.equal(r.resultado, RESULTADO.OK)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · TOPE DE INTENTOS Y MOTIVO CONSULTABLE
// ─────────────────────────────────────────────────────────────────────────────

test('un fallo que se repite agota el tope, termina en dead_letter y NO se vuelve a ejecutar', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  const { ciclo } = armar(ledger)
  let corridas = 0
  const terminales = []
  const correr = async () => { corridas++; throw new Error('el especialista publicó por su cuenta') }

  for (let i = 0; i < 5; i++) {
    const task = ledger.claim(WORKER)
    if (!task) break // agotó el tope: ya no es reclamable, el bucle se corta solo
    await ciclo(task, { correr, alTerminarEnFallo: (t, info) => terminales.push(info) })
  }
  assert.equal(corridas, 3, 'tres intentos, no infinitos')
  assert.equal(ledger.tarea.state, 'dead_letter')
  assert.equal(ledger.claim(WORKER), null, 'una tarea muerta no vuelve a la cola sola')
  assert.equal(terminales.length, 1)
  assert.equal(terminales[0].estado, 'dead_letter')
  assert.match(ledger.tarea.error, /publicó por su cuenta/, 'el motivo real queda registrado')
})

test('el motivo que queda guardado es el del fallo, no el de la transición que rebotó', async () => {
  const ledger = crearLedgerFalso({ type: 'noop', maxAttempts: 1 })
  const { ciclo } = armar(ledger)
  await ciclo(ledger.claim(WORKER), { correr: async () => { throw new Error('sin handler para comunicacion.responder') } })
  assert.equal(ledger.tarea.state, 'dead_letter')
  assert.match(ledger.tarea.error, /sin handler/)
})

test('el gancho alFallar puede absorber el fallo (park por falta de crédito) sin gastar intento', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  const { ciclo } = armar(ledger)
  const r = await ciclo(ledger.claim(WORKER), {
    correr: async () => { throw new Error('sin crédito') },
    alFallar: async () => ({ manejado: true }),
  })
  assert.equal(r.resultado, RESULTADO.OMITIDA)
  assert.equal(ledger.tarea.state, 'running', 'el gancho se hizo cargo; el ciclo no la mandó a failed')
})

test('antesDeCorrer con omitir:true no arranca el trabajo', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  const { ciclo } = armar(ledger)
  let corridas = 0
  const r = await ciclo(ledger.claim(WORKER), {
    antesDeCorrer: async () => ({ omitir: true, motivo: 'razonador sin crédito' }),
    correr: async () => { corridas++; return {} },
  })
  assert.equal(r.resultado, RESULTADO.OMITIDA)
  assert.equal(corridas, 0)
  assert.equal(ledger.tarea.state, 'claimed')
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · EL LATIDO Y LA RED (venían de comunicacion/lease-tarea.test.mjs, que este módulo reemplaza)
// ─────────────────────────────────────────────────────────────────────────────

test('la transición rechazada NO dispara reintento aunque el latido no se haya enterado', async () => {
  // El caso real: el heartbeat falla por RED (perdido queda en false) justo cuando el reap actúa.
  // Sin el reconocedor del texto de plpgsql, acá se llamaba a failTask sobre una tarea ajena.
  const ledger = crearLedgerFalso({ type: 'noop' })
  const { ciclo } = armar(ledger)
  const task = ledger.claim(WORKER)
  let fallos = 0
  const original = ledger.failTask
  ledger.failTask = async (...a) => { fallos++; return original(...a) }
  const r = await ciclo(task, {
    correr: async () => { ledger.reap(); return { result: {} } }, // sin latir: perdido = false
  })
  assert.equal(r.resultado, RESULTADO.LEASE_PERDIDO)
  assert.equal(fallos, 0, 'no se reencola una tarea cuyo efecto externo ya salió')
})

test('esTransicionInvalida reconoce el texto exacto que produce plpgsql', () => {
  assert.equal(esTransicionInvalida('transición inválida retrying -> reviewing (tarea fcb3a2eb)'), true)
  assert.equal(esTransicionInvalida('transicion invalida running -> succeeded'), true, 'sin acentos también')
  assert.equal(esTransicionInvalida('worker comm-wf-1 no es dueño del lease de la tarea x'), true)
  assert.equal(esTransicionInvalida('no es dueno del lease'), true)
  assert.equal(esTransicionInvalida('timeout tras 600000ms'), false, 'un timeout SÍ se reintenta')
  assert.equal(esTransicionInvalida(null), false)
})

test('un latido que revienta por red no mata la tarea ni la reintenta', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  ledger.heartbeat = async () => { throw new Error('ECONNREFUSED') }
  const { ciclo, latir } = armar(ledger)
  const r = await ciclo(ledger.claim(WORKER), {
    correr: async () => { await latir(); return { result: {} } },
  })
  assert.equal(r.resultado, RESULTADO.OK, 'no poder latir no es haber perdido el lease')
  assert.equal(ledger.tarea.state, 'succeeded')
})

test('el latido se cancela siempre, aunque el handler falle: un timer vivo es un worker que no muere', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  let cancelados = 0
  const ciclo = crearCicloTarea({
    ledger, workerId: WORKER, leaseSeconds: 300, heartbeatMs: latidoPara(300), backoffMs: 1,
    programar: () => 'timer', cancelar: () => { cancelados++ },
  })
  await ciclo(ledger.claim(WORKER), { correr: async () => { throw new Error('boom') } })
  assert.equal(cancelados, 1)
})

test('con la base caída el ciclo NO lanza: el runner sigue con la tarea siguiente', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  ledger.transition = async () => { throw new Error('la base no contesta') }
  ledger.failTask = async () => { throw new Error('la base no contesta') } // tampoco se puede fallar
  const { ciclo } = armar(ledger)
  const r = await ciclo(ledger.claim(WORKER), { correr: async () => ({}) })
  assert.equal(r.resultado, RESULTADO.FALLO_CICLO, 'devuelve el fallo en vez de propagarlo')
  assert.match(r.motivo, /la base no contesta/)
})

test('una base que contesta el fallo pero no la transición sí reintenta (no es fallo del ciclo)', async () => {
  const ledger = crearLedgerFalso({ type: 'noop' })
  ledger.transition = async () => { throw new Error('la base no contesta') }
  const { ciclo } = armar(ledger)
  const r = await ciclo(ledger.claim(WORKER), { correr: async () => ({}) })
  assert.equal(r.resultado, RESULTADO.REINTENTA)
  assert.equal(ledger.tarea.state, 'retrying')
})

test('latidoPara programa TRES latidos por lease: perder uno no cuesta la tarea', () => {
  assert.equal(latidoPara(300), 100_000)
  assert.equal(latidoPara(180), 60_000)
  assert.ok(latidoPara(1) >= 1000, 'nunca late más rápido que una vez por segundo')
})

test('el camino de reintento sigue existiendo entero en la máquina de estados', () => {
  const p = transicionesReales()
  for (const paso of ['running->failed', 'failed->retrying', 'retrying->ready', 'retrying->claimed', 'claimed->cancelled']) {
    assert.equal(p.has(paso), true, `falta ${paso}: sin él la tarea no puede reintentar ni cerrarse`)
  }
})
