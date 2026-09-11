// EL CUELGUE DE 23 HORAS, reproducido — incidente del 10/09/2026.
//
// Secuencia real, tomada del journal de `echegaray-comunicacion-worker`:
//   10/09 17:59:07  {"nivel":"error","mensaje":"vencer sesiones de asistencia falló
//                    (se reintenta al próximo intervalo)",
//                    "error":"terminating connection due to administrator command"}
//   …y después NADA durante 23 h. Ni un tick, ni el inbox, ni el SIGTERM (hubo que
//   matarlo con SIGKILL). RSS 824 KB, CPU 0, `systemctl` lo veía `active`.
//
// Supabase reinició del lado del servidor. La primera query murió con 57P01 —y ese error se
// logueó sin propagarse, como está diseñado— pero la SIGUIENTE quedó esperando una respuesta
// que no iba a llegar nunca: sin `connectionTimeoutMillis` ni `query_timeout`, `pg` devuelve
// una promesa que no se cumple NI se rechaza. El `await` del tick no volvió, el `while` no
// volvió a mirar la bandera de parada, y el evento 139 del inbox (comprobantes del dueño)
// esperó 23 horas en estado `pendiente`.
//
// Acá se reproduce con un pool FALSO que emite ese mismo mensaje. Dos mitades:
//   1. el bucle VIEJO, copiado literal, SE CUELGA — si esta mitad dejara de colgarse, el
//      test ya no estaría probando nada y hay que revisarlo;
//   2. el bucle NUEVO sale con 75 (EX_TEMPFAIL) y systemd lo reinicia.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  esConexionPerdida, crearLatido, SALIDA_CONEXION_PERDIDA,
} from '../lib/conexion-perdida.mjs'
import { instalarVigilanciaDeConexion, alPerderLaConexion } from '../lib/db.mjs'
import { correrBucle } from './worker-comunicacion.mjs'

const ADMIN_SHUTDOWN = () => Object.assign(
  new Error('terminating connection due to administrator command'), { code: '57P01' },
)

/** El pool tal como se portó esa noche: la primera query revienta con 57P01 y todas las
 *  siguientes devuelven una promesa que NO SE RESUELVE NUNCA (socket medio abierto). */
function poolQueSeMuereYCuelga() {
  let llamadas = 0
  const pendientes = []
  return {
    get llamadas() { return llamadas },
    /** Para que el test no deje promesas vivas colgando del runner. */
    soltar() { for (const r of pendientes) r() ; pendientes.length = 0 },
    async query() {
      llamadas += 1
      if (llamadas === 1) throw ADMIN_SHUTDOWN()
      return new Promise((resolve) => { pendientes.push(() => resolve({ rows: [] })) })
    },
  }
}

const logSpy = () => {
  const l = { errores: [], infos: [] }
  l.error = (m, d) => l.errores.push([m, d])
  l.info = (m, d) => l.infos.push([m, d])
  l.warn = () => {}
  return l
}

// ── 1. LA REPRODUCCIÓN: el bucle viejo se cuelga para siempre ───────────────────────────
//
// Copia literal del bucle anterior al arreglo (`worker-comunicacion.mjs`, commit 04e25b9b):
// try/catch alrededor del tick y nada más. El try/catch no sirve de nada, porque el `await`
// no lanza: no vuelve. Esto es la prueba de que el control PUEDE dar rojo.
test('EL DEFECTO: el bucle sin latido se cuelga para siempre con el pool muerto', async () => {
  const pool = poolQueSeMuereYCuelga()
  const log = logSpy()
  let vueltas = 0
  // El tick del worker: primero el barrido de sesiones, que SE COME el error (tal cual
  // `crearVencedorPeriodico`), y después el resto del tick, que queda esperando.
  const tick = async () => {
    vueltas += 1
    try { await pool.query('select vencer()') } catch (e) {
      log.error('vencer sesiones de asistencia falló (se reintenta al próximo intervalo)', { error: String(e.message) })
    }
    await pool.query('select inbox()')   // ← acá se detuvo el mundo 23 horas
    return { trabajo: 0 }
  }
  const bucleViejo = (async () => {
    let parar = false
    setTimeout(() => { parar = true }, 50) // el SIGTERM que llegó y nadie atendió
    while (!parar) {
      try { await tick() } catch { await new Promise((r) => setTimeout(r, 1)) }
    }
    return 'terminó'
  })()
  const resultado = await Promise.race([
    bucleViejo,
    new Promise((r) => setTimeout(() => r('COLGADO'), 300)),
  ])
  assert.equal(resultado, 'COLGADO', 'el bucle viejo tendría que colgarse: si termina, el test perdió su objeto')
  assert.equal(vueltas, 1, 'no llegó a una segunda vuelta')
  assert.equal(log.errores.length, 1, 'la única línea de log del incidente, y después silencio')
  assert.match(log.errores[0][0], /vencer sesiones de asistencia falló/)
  pool.soltar()
})

// ── 2. EL ARREGLO: el latido corta el silencio y el proceso sale con error ──────────────
test('el latido mata el proceso cuando el tick deja de volver, y sale con 75', async () => {
  const pool = poolQueSeMuereYCuelga()
  const log = logSpy()
  const salidas = []
  const latido = crearLatido({
    toleranciaMs: 60, periodoMs: 10, salir: (c) => salidas.push(c), log, nombre: 'worker-comunicacion',
  })
  latido.armar()
  const tick = async () => {
    try { await pool.query('select vencer()') } catch (e) {
      log.error('vencer sesiones de asistencia falló (se reintenta al próximo intervalo)', { error: String(e.message) })
    }
    await pool.query('select inbox()')
    return { trabajo: 0 }
  }
  // `correrBucle` no va a volver (el tick no vuelve): lo que tiene que pasar es que el
  // latido dispare igual, porque corre en su propio reloj y no depende del tick.
  correrBucle({ tick, latido, log, debeParar: () => false })
  await new Promise((r) => setTimeout(r, 200))
  assert.deepEqual(salidas, [SALIDA_CONEXION_PERDIDA], 'una sola salida, con 75 = EX_TEMPFAIL')
  assert.equal(SALIDA_CONEXION_PERDIDA, 75)
  const fatal = log.errores.find(([m]) => /salgo para que systemd me reinicie/.test(m))
  assert.ok(fatal, 'el motivo queda escrito en el journal ANTES de salir')
  assert.equal(fatal[1].motivo, 'latido')
  assert.ok(fatal[1].atraso_ms >= 60)
  latido.desarmar()
  pool.soltar()
})

test('el latido no mata a un worker que sigue dando vueltas', async () => {
  const salidas = []
  const latido = crearLatido({ toleranciaMs: 80, periodoMs: 5, salir: (c) => salidas.push(c), log: logSpy() })
  latido.armar()
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 20))
    latido.tocar()
  }
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(salidas, [], 'tocar el latido alcanza para seguir vivo')
  latido.desarmar()
})

test('si el 57P01 SÍ se propaga, el bucle sale enseguida y no espera al latido', async () => {
  const log = logSpy()
  const salidas = []
  const latido = crearLatido({ toleranciaMs: 600_000, salir: (c) => salidas.push(c), log })
  const r = await correrBucle({
    tick: async () => { throw ADMIN_SHUTDOWN() },
    latido, log, debeParar: () => false, dormir: async () => {},
  })
  assert.equal(r.salida, SALIDA_CONEXION_PERDIDA)
  assert.deepEqual(salidas, [SALIDA_CONEXION_PERDIDA])
  assert.equal(log.errores.filter(([m]) => /se reintenta el próximo ciclo/.test(m)).length, 0,
    'una conexión perdida NO se reintenta: se muere y se renace')
})

test('un error que NO es de conexión sigue reintentándose, como siempre', async () => {
  const log = logSpy()
  const salidas = []
  const latido = crearLatido({ toleranciaMs: 600_000, salir: (c) => salidas.push(c), log })
  let n = 0
  const r = await correrBucle({
    tick: async () => { n += 1; if (n <= 2) throw new Error('el especialista explotó'); return { trabajo: 0 } },
    latido, log, debeParar: () => n >= 3, dormir: async () => {},
  })
  assert.equal(r.salida, 0)
  assert.deepEqual(salidas, [], 'un bug del handler NO reinicia el servicio: se vería como red y no se arreglaría nunca')
  assert.equal(log.errores.filter(([m]) => /se reintenta el próximo ciclo/.test(m)).length, 2)
})

// ── 3. EL CLIENTE OCIOSO: el evento `error` del pool, que nadie esperaba ────────────────
test('un `error` de pool sin listener TIRA: por eso hay que engancharlo', () => {
  const pelado = new EventEmitter()
  assert.throws(() => pelado.emit('error', ADMIN_SHUTDOWN()), /administrator command/)
})

test('el pool falso emite 57P01 y el latido sale con 75', () => {
  const salidas = []
  const log = logSpy()
  const latido = crearLatido({ toleranciaMs: 600_000, salir: (c) => salidas.push(c), log })
  const desuscribir = alPerderLaConexion((err, { corte }) => {
    assert.equal(corte, true)
    latido.fatalSiEsConexionPerdida(err, 'pool')
  })
  const poolFalso = instalarVigilanciaDeConexion(new EventEmitter())
  // Esto es lo que hace `pg` cuando se muere un cliente OCIOSO: no hay `await` esperándolo.
  assert.doesNotThrow(() => poolFalso.emit('error', ADMIN_SHUTDOWN()))
  assert.deepEqual(salidas, [SALIDA_CONEXION_PERDIDA])
  assert.equal(log.errores.at(-1)[1].motivo, 'pool')
  desuscribir()
})

test('el pool avisa también lo que no clasifica, pero marcado como no-corte', () => {
  const vistos = []
  const desuscribir = alPerderLaConexion((err, { corte }) => vistos.push([err.code, corte]))
  const poolFalso = instalarVigilanciaDeConexion(new EventEmitter())
  poolFalso.emit('error', Object.assign(new Error('duplicate key'), { code: '23505' }))
  assert.deepEqual(vistos, [['23505', false]])
  desuscribir()
})

// ── 4. EL CLASIFICADOR PUEDE DECIR NO ───────────────────────────────────────────────────
test('reconoce las formas reales de una conexión perdida', () => {
  const si = [
    ADMIN_SHUTDOWN(),
    Object.assign(new Error('the database system is shutting down'), { code: '57P03' }),
    Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    new Error('Connection terminated unexpectedly'),
    new Error('timeout exceeded when trying to connect'),
    new Error('Query read timeout'),
    new Error('Client has encountered a connection error and is not queryable'),
    Object.assign(new Error('falló el espejo'), { cause: ADMIN_SHUTDOWN() }),
  ]
  for (const e of si) assert.equal(esConexionPerdida(e), true, `debería ser corte: ${e.message}`)
})

test('NO confunde un bug con un corte de red — si no, el bug se reiniciaría para siempre', () => {
  const no = [
    null, undefined, new Error('director: no supe a quién derivarlo'),
    Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    Object.assign(new Error('syntax error at or near "slect"'), { code: '42601' }),
    Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
    new Error('Invalid RootId parameter'),
  ]
  for (const e of no) assert.equal(esConexionPerdida(e), false, `NO debería ser corte: ${e?.message}`)
})

test('el latido sale UNA sola vez aunque el corte se avise por varios clientes', () => {
  const salidas = []
  const latido = crearLatido({ toleranciaMs: 600_000, salir: (c) => salidas.push(c), log: logSpy() })
  for (let i = 0; i < 5; i += 1) latido.fatalSiEsConexionPerdida(ADMIN_SHUTDOWN(), 'pool')
  assert.deepEqual(salidas, [SALIDA_CONEXION_PERDIDA])
  assert.equal(latido.muerto, true)
})

test('crearLatido exige salir(): un latido que no puede matar no es un latido', () => {
  assert.throws(() => crearLatido({ toleranciaMs: 10 }), /salir/)
})
