#!/usr/bin/env node
// PR-4 · Demo ejecutable del flujo vertical REAL: "@os estado del sistema".
//
// Levanta un Postgres efímero descartable, aplica los esquemas orq + comunicacion,
// y corre el flujo de punta a punta con FakeMattermost (sin tocar producción ni
// red externa). Muestra cada hop y la trazabilidad completa. La RESPUESTA proviene
// realmente del Work Fabric (handler comunicacion.responder leyendo datos reales
// de orq), no de un mock del Communication Service.
//
// Correr:  node orquestador/comunicacion/demo-pr4.mjs
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { aplicarEsquemaPR4 } from './aplicar-esquema.mjs'

const NOMBRE = `pr4-demo-${process.pid}`, PUERTO = 55443
const URL = `postgres://postgres:postgres@127.0.0.1:${PUERTO}/postgres`
const SECRET = 'demo-pr4-secreto'
const sh = (a) => spawnSync('docker', a, { encoding: 'utf8' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(m); const linea = () => log('─'.repeat(74))

async function conectar() {
  for (let i = 0; i < 60; i++) {
    const c = new pg.Client({ connectionString: URL }); c.on('error', () => {})
    try { await c.connect(); await c.query('select 1'); return c } catch { try { await c.end() } catch {} ; await sleep(400) }
  }
  return null
}

async function main() {
  linea(); log('PR-4 · DEMO FLUJO VERTICAL — "@os estado del sistema" (Postgres real descartable)'); linea()
  log(`→ Postgres efímero en :${PUERTO}…`)
  sh(['rm', '-f', NOMBRE])
  sh(['run', '-d', '--rm', '--name', NOMBRE, '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PUERTO}:5432`, 'postgres:16-alpine'])
  try {
    const c = await conectar(); if (!c) throw new Error('PG no listo')
    await aplicarEsquemaPR4(c); await c.end()
    log('→ esquemas orq (Work Fabric) + comunicacion aplicados\n')

    // Configurar el entorno para db.mjs ANTES de la primera query.
    process.env.DATABASE_URL = URL; process.env.ORQ_DB_SSL = '0'; process.env.ORQ_CONCURRENCY = '8'
    process.env.MM_INCOMING_SECRET = SECRET; process.env.WORKER_ID = 'pr4-demo'
    const [{ crearConector }, comm, { query, closePool }] = await Promise.all([
      import('./conector.mjs'),
      import('../../../communication-service/src/index.mjs'),
      import('../lib/db.mjs'),
    ])
    const { FakeMattermost, VerificadorEntrante, firmar, crearLog, crearMetricas } = comm
    const cliente = new FakeMattermost()
    const con = crearConector({
      cliente, verificador: new VerificadorEntrante({ secreto: SECRET, ventanaSegundos: 300 }),
      log: crearLog(() => {}), metricas: crearMetricas(), workerId: 'pr4-demo',
    })

    // 1) El usuario escribe en Mattermost (mención al bot), firmada por el webhook.
    const texto = '@os estado del sistema'
    const rawBody = JSON.stringify({ text: texto, post_id: 'post-123' })
    const ts = Date.now()
    log('▶ 1. Usuario en Mattermost:  ' + texto)
    const ev = await con.recibir(
      { user_id: 'u-rodrigo', user_name: 'rodrigo', channel_id: 'canal-direccion', post_id: 'post-123', text: texto },
      { seguridad: { rawBody, firma: firmar(SECRET, rawBody, ts), timestamp: ts, ip: '10.0.0.5' } },
    )
    log(`  2. HMAC/timestamp/anti-replay OK · evento canónico ${ev.type} (id ${ev.id.slice(0, 8)}…)`)
    log(`  3-4. persistido en comunicacion.eventos + inbox`)

    await con.procesarInbox()
    const orqEv = await query(`select type from orq.events where type like 'comunicacion.%'`)
    const tarea0 = await query(`select id, type, state, dedupe_key from orq.tasks where type='comunicacion.responder'`)
    log(`  5-7. inbox → puente → orq.events (${orqEv.rows[0].type}) + tarea Work Fabric (${tarea0.rows[0].dedupe_key})`)

    const wf = await con.procesarWorkFabric()
    const tarea = await query(`select state, result from orq.tasks where type='comunicacion.responder'`)
    log(`  8-9. Work Fabric procesó la tarea (${wf.ok} ok) → estado=${tarea.rows[0].state}`)
    log(`       RESPUESTA REAL del OS: "${tarea.rows[0].result.texto}"`)

    await con.procesarOutbox()
    const post = cliente.posts.at(-1)
    log(`  10-12. respuesta → outbox → Mattermost (post ${post.id}, hilo root=${post.root_id})`)

    // 13) Trazabilidad completa
    const cadena = await query(`
      select
        (select count(*)::int from comunicacion.eventos where id=$1) comm_in,
        (select count(*)::int from orq.events where causation_id=$1 and type like 'comunicacion.%') orq_ev,
        (select count(*)::int from orq.tasks where causation_id=$1) tarea,
        (select count(*)::int from comunicacion.eventos where causation_id=$1 and direccion='outbound') comm_out
    `, [ev.id])
    linea()
    const t = cadena.rows[0]
    const checks = [
      ['① mensaje recibido + validado (HMAC)', !!ev && ev.type === 'mensaje.recibido'],
      ['② persistencia (comunicacion.eventos+inbox)', t.comm_in === 1],
      ['③ publicado a orq.events por el puente', t.orq_ev === 1],
      ['④ tarea creada en el Work Fabric (dedup comm_event_id)', t.tarea === 1],
      ['⑤ respuesta REAL del Business OS', /Business OS operativo/.test(tarea.rows[0].result.texto)],
      ['⑥ respuesta persistida en outbox (salida)', t.comm_out === 1],
      ['⑦ publicada en Mattermost en el MISMO hilo', post.root_id === 'post-123'],
      ['⑧ hilo causal completo (correlation preservado)', post.props.os_correlation_id === ev.correlation_id],
    ]
    let ok = true; for (const [n, ccc] of checks) { log(`  ${ccc ? '✅' : '❌'}  ${n}`); ok = ok && ccc }
    linea()
    await closePool()
    log(ok ? 'DEMO OK — flujo vertical real de punta a punta, sin tocar producción.' : 'DEMO FALLÓ')
    if (!ok) process.exitCode = 1
  } finally {
    sh(['rm', '-f', NOMBRE]); log('→ Postgres efímero destruido')
  }
}

main().catch((e) => { console.error(e); sh(['rm', '-f', NOMBRE]); process.exit(1) })
