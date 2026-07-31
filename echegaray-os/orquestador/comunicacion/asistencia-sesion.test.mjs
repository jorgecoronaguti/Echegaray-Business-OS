import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SesionesMemoria, SesionesPostgres, ESTADO_SESION, RECHAZO, firmarAccion, verificarAccion, TTL_MINUTOS,
  crearVencedorPeriodico, VENCER_INTERVALO_MS_DEFAULT,
} from './asistencia-sesion.mjs'

const SEC = 'secreto-de-prueba'
const U1 = 'mm-jefe-1'
const U2 = 'mm-jefe-2'

const abrir = (r, u = U1) => r.abrir({ plataformaUserId: u, plataformaUsername: 'jefe', fechaOperativa: '2026-07-30' })

// ── EL PORT: se exige entero al construir, no a mitad de la carga ───────────────
//
// Esto salió de un defecto real: el servidor HTTP le pasaba el Pool de `pg` pelado, que
// sabe `query` pero no `withTx`. Nada falló al arrancar; falló cuando el jefe de obra
// escribió `/asistencia` — y habría vuelto a fallar, peor, al apretar Registrar.

test('un port sin withTx se rechaza al construir: abrir y confirmar son transaccionales', () => {
  assert.throws(() => new SesionesPostgres({ query: async () => ({ rows: [] }) }), /withTx/)
})

test('un port completo se acepta', () => {
  assert.doesNotThrow(() => new SesionesPostgres({ query: async () => ({ rows: [] }), withTx: async (f) => f() }))
})

// ── FIRMA HMAC — primitiva RESERVADA, no una defensa del flujo actual ───────────
// Estos 4 tests prueban la primitiva criptográfica, NO que el flujo por DM esté firmado:
// no lo está, y no tiene qué firmar (el sesionId nunca viaja al cliente y la identidad
// sale del evento autenticado de Mattermost). Ver el encabezado de asistencia-sesion.mjs.
// Lo que protege una confirmación hoy es TTL + propiedad + idempotencia, y eso lo cubren
// los tests de más abajo.

test('firmar/verificar una acción: el token válido pasa', () => {
  const t = firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC)
  assert.equal(verificarAccion({ token: t, sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC).ok, true)
})

test('un CALLBACK ALTERADO no valida: otra sesión, otra acción u otro usuario', () => {
  const t = firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC)
  assert.equal(verificarAccion({ token: t, sesionId: 's2', accion: 'confirmar', plataformaUserId: U1 }, SEC).ok, false)
  assert.equal(verificarAccion({ token: t, sesionId: 's1', accion: 'cancelar', plataformaUserId: U1 }, SEC).ok, false)
  assert.equal(verificarAccion({ token: t, sesionId: 's1', accion: 'confirmar', plataformaUserId: U2 }, SEC).ok, false)
  assert.equal(verificarAccion({ token: 'deadbeef', sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC).motivo, RECHAZO.TOKEN_INVALIDO)
})

test('sin token no valida, y un token de otro secreto tampoco', () => {
  assert.equal(verificarAccion({ sesionId: 's1', accion: 'x', plataformaUserId: U1 }, SEC).ok, false)
  const otro = firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, 'otro-secreto')
  assert.equal(verificarAccion({ token: otro, sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }, SEC).ok, false)
})

test('FAIL-CLOSED: sin secreto no se firma ni se acepta nada', () => {
  assert.equal(firmarAccion({ sesionId: 's1', accion: 'x', plataformaUserId: U1 }, null), null)
  assert.equal(verificarAccion({ token: 'x', sesionId: 's1', accion: 'x', plataformaUserId: U1 }, null).motivo, RECHAZO.SIN_SECRETO)
})

test('abrir deja UNA sola sesión abierta por persona (cancela la anterior)', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  const b = await abrir(r)
  assert.notEqual(a.id, b.id)
  assert.equal(r.filas.find((f) => f.id === a.id).estado, ESTADO_SESION.CANCELADA)
  const viva = await r.abiertaDe({ plataformaUserId: U1 })
  assert.equal(viva.sesion.id, b.id)
})

test('dos personas distintas pueden tener su propia sesión a la vez', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r, U1)
  const b = await abrir(r, U2)
  assert.equal((await r.abiertaDe({ plataformaUserId: U1 })).sesion.id, a.id)
  assert.equal((await r.abiertaDe({ plataformaUserId: U2 })).sesion.id, b.id)
})

test('un USUARIO DISTINTO no puede cargar la sesión de otro', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r, U1)
  assert.equal((await r.cargar({ id: a.id, plataformaUserId: U2 })).motivo, RECHAZO.AJENA)
  assert.equal((await r.cargar({ id: a.id, plataformaUserId: U1 })).ok, true)
})

test('la sesión VENCE y queda marcada como vencida', async () => {
  let t = Date.parse('2026-07-30T12:00:00Z')
  const r = new SesionesMemoria({ ahora: () => t })
  const a = await abrir(r)
  t += (TTL_MINUTOS + 1) * 60000
  const v = await r.abiertaDe({ plataformaUserId: U1 })
  assert.equal(v.ok, false)
  assert.equal(v.motivo, RECHAZO.VENCIDA)
  assert.equal(r.filas.find((f) => f.id === a.id).estado, ESTADO_SESION.VENCIDA)
})

test('una sesión vencida NO se puede confirmar', async () => {
  let t = Date.parse('2026-07-30T12:00:00Z')
  const r = new SesionesMemoria({ ahora: () => t })
  const a = await abrir(r)
  t += (TTL_MINUTOS + 1) * 60000
  await r.vencer()
  assert.equal((await r.confirmar(a.id, { idempotencyKey: 'k1' })).motivo, RECHAZO.CERRADA)
})

test('contexto y marcas se guardan sin borrar lo que no se manda', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.guardarContexto(a.id, { claveObra: 'X|Y', pestana: 'Obreros 26' })
  await r.guardarMarcas(a.id, { obras: ['X|Y'], personal: ['A'], marcas: { A: { estado: 'presente' } } })
  await r.guardarContexto(a.id, { spreadsheetId: 'sheet-1' }) // no manda pestaña
  const s = (await r.abiertaDe({ plataformaUserId: U1 })).sesion
  assert.equal(s.clave_obra, 'X|Y')
  assert.equal(s.pestana, 'Obreros 26', 'no se borró con el coalesce')
  assert.equal(s.spreadsheet_id, 'sheet-1')
  assert.equal(s.marcas.marcas.A.estado, 'presente')
})

test('CONFIRMAR es de un solo uso: el replay devuelve duplicado y no vuelve a habilitar', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.guardarPlan(a.id, { idempotency_key: 'k-abc' })
  const p = await r.confirmar(a.id, { idempotencyKey: 'k-abc' })
  assert.deepEqual({ ok: p.ok, dup: p.duplicado }, { ok: true, dup: false })
  const s = await r.confirmar(a.id, { idempotencyKey: 'k-abc' })
  assert.equal(s.duplicado, true, 'replay exacto: no muta de nuevo')
  assert.equal(r.filas.find((f) => f.id === a.id).intentos_confirmacion, 1)
})

// LA CLAVE NO PUEDE GANARLE A LA PLANILLA (31/07, defecto de producción).
//
// La clave de idempotencia es una función pura de archivo + pestaña + fecha + obra + quién +
// horas: para la misma obra y el mismo día da SIEMPRE la misma. Buscarla en TODAS las sesiones
// confirmadas dejaba una carga legítima bloqueada para siempre: a la mañana se cargó Taller,
// después una persona borró la celda a mano, y al volver a cargar el sistema contestaba "esta
// carga ya se registró" mientras la planilla seguía vacía. Quien decide si hay que escribir es
// la planilla —el núcleo relee cada celda y compara su huella—, no la memoria de una clave.

test('un formulario NUEVO con la misma clave NO es un duplicado: la planilla decide, no la clave', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.confirmar(a.id, { idempotencyKey: 'k-igual' })
  const b = await abrir(r)
  const segunda = await r.confirmar(b.id, { idempotencyKey: 'k-igual' })
  assert.equal(segunda.duplicado, false, 'si la celda se vació, la carga tiene que poder rehacerse')
  assert.equal(segunda.ok, true)
})

test('el segundo click sobre el MISMO formulario sigue siendo duplicado', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.confirmar(a.id, { idempotencyKey: 'k-abc' })
  const otra = await r.confirmar(a.id, { idempotencyKey: 'k-abc' })
  assert.equal(otra.duplicado, true, 'apretar Registrar dos veces no escribe dos veces')
})

test('cerrar con conflicto / cancelada deja el estado terminal', async () => {
  const r = new SesionesMemoria()
  const a = await abrir(r)
  await r.cerrar(a.id, ESTADO_SESION.CONFLICTO)
  assert.equal((await r.abiertaDe({ plataformaUserId: U1 })).motivo, RECHAZO.NO_EXISTE)
  assert.equal(r.filas[0].estado, ESTADO_SESION.CONFLICTO)
})

test('sin sesión, abiertaDe dice que no existe', async () => {
  const r = new SesionesMemoria()
  assert.equal((await r.abiertaDe({ plataformaUserId: U1 })).motivo, RECHAZO.NO_EXISTE)
  assert.equal((await r.cargar({ id: null, plataformaUserId: U1 })).motivo, RECHAZO.NO_EXISTE)
})

// ── BARRIDO PERIÓDICO (lo que corre el worker en cada tick) ─────────────────────

test('EL AGUJERO QUE CIERRA: una sesión abandonada se vence SIN que su dueño vuelva', async () => {
  let t = Date.parse('2026-07-30T12:00:00Z')
  const r = new SesionesMemoria({ ahora: () => t })
  const a = await abrir(r) // el jefe abre el formulario y no vuelve nunca
  const barrer = crearVencedorPeriodico({ sesiones: r, intervaloMs: 60_000, ahora: () => t })

  t += (TTL_MINUTOS + 1) * 60000
  const res = await barrer()

  assert.deepEqual({ corrio: res.corrio, vencidas: res.vencidas }, { corrio: true, vencidas: 1 })
  assert.equal(r.filas.find((f) => f.id === a.id).estado, ESTADO_SESION.VENCIDA,
    'se cerró sola: nadie llamó a abiertaDe/cargar')
  // Y por eso el índice "una sola sesión abierta por persona" queda libre.
  assert.equal(r.filas.filter((f) => f.estado === ESTADO_SESION.ABIERTA).length, 0)
})

test('el barrido NO corre en cada vuelta del loop: respeta su intervalo', async () => {
  let t = 1_000_000
  let llamadas = 0
  const sesiones = { vencer: async () => { llamadas++; return 0 } }
  const barrer = crearVencedorPeriodico({ sesiones, intervaloMs: 60_000, ahora: () => t })

  await barrer()                 // primer tick: barre al arrancar
  assert.equal(llamadas, 1)
  for (let i = 0; i < 50; i++) { t += 200; await barrer() } // 50 vueltas de 200 ms = 10 s
  assert.equal(llamadas, 1, 'no volvió a tocar la base antes del intervalo')

  t += 60_000
  const res = await barrer()
  assert.deepEqual({ llamadas, corrio: res.corrio }, { llamadas: 2, corrio: true })
})

test('sólo loguea cuando cerró algo: un barrido en cero no hace ruido', async () => {
  let t = 0
  let n = 0
  const infos = []
  const log = { info: (msg, meta) => infos.push({ msg, meta }), error: () => {} }
  const barrer = crearVencedorPeriodico({ sesiones: { vencer: async () => n }, intervaloMs: 10, ahora: () => t, log })

  await barrer()
  assert.deepEqual(infos, [], 'cero vencidas ⇒ cero líneas de log')

  n = 3; t += 10
  await barrer()
  assert.equal(infos.length, 1)
  assert.deepEqual(infos[0].meta, { vencidas: 3 }, 'formato JSON del logger, sin secretos')
})

test('un fallo del barrido NO voltea el tick ni se reintenta en loop', async () => {
  let t = 0
  let llamadas = 0
  const errores = []
  const log = { info: () => {}, error: (msg, meta) => errores.push(meta) }
  const sesiones = { vencer: async () => { llamadas++; throw new Error('base caída') } }
  const barrer = crearVencedorPeriodico({ sesiones, intervaloMs: 60_000, ahora: () => t, log })

  const res = await barrer() // no tira: el tick sigue procesando inbox/outbox
  assert.deepEqual({ error: res.error, vencidas: res.vencidas }, { error: true, vencidas: 0 })
  assert.equal(errores[0].error, 'base caída')

  t += 200
  await barrer()
  assert.equal(llamadas, 1, 'reprograma igual: una base caída no se martilla cada 200 ms')
})

test('un intervalo inválido (env mal escrito ⇒ NaN) cae al default, no a cada tick', async () => {
  let t = 0
  let llamadas = 0
  const sesiones = { vencer: async () => { llamadas++; return 0 } }
  const barrer = crearVencedorPeriodico({ sesiones, intervaloMs: Number('no-es-un-numero'), ahora: () => t })

  await barrer()
  t += VENCER_INTERVALO_MS_DEFAULT - 1
  await barrer()
  assert.equal(llamadas, 1, 'NaN habría hecho fallar toda comparación y barrer siempre')

  t += 1
  await barrer()
  assert.equal(llamadas, 2)
})

test('el barrido exige un repositorio de verdad', () => {
  assert.throws(() => crearVencedorPeriodico({ sesiones: null }), /falta el repositorio/)
})

// ── LO QUE DE VERDAD PROTEGE LA CONFIRMACIÓN ────────────────────────────────────

test('el flujo NO depende de la firma: sin secreto, abrir/operar/confirmar funciona igual', async () => {
  // Si algún día alguien conecta verificarAccion al flujo por DM, este test se cae y
  // obliga a actualizar el encabezado de asistencia-sesion.mjs en vez de dejarlo mintiendo.
  const previo = { a: process.env.ORQ_ASISTENCIA_SECRET, b: process.env.MM_INCOMING_SECRET, c: process.env.COMM_DEV }
  delete process.env.ORQ_ASISTENCIA_SECRET; delete process.env.MM_INCOMING_SECRET; delete process.env.COMM_DEV
  try {
    assert.equal(firmarAccion({ sesionId: 's1', accion: 'confirmar', plataformaUserId: U1 }), null,
      'sin secreto no se puede ni firmar')
    const r = new SesionesMemoria()
    const a = await abrir(r)
    await r.guardarMarcas(a.id, { marcas: { A: { estado: 'presente' } } })
    await r.guardarPlan(a.id, { idempotency_key: 'k-sin-secreto' })
    const ok = await r.confirmar(a.id, { idempotencyKey: 'k-sin-secreto' })
    assert.equal(ok.ok, true, 'la confirmación no verifica ninguna firma')
  } finally {
    for (const [k, v] of [['ORQ_ASISTENCIA_SECRET', previo.a], ['MM_INCOMING_SECRET', previo.b], ['COMM_DEV', previo.c]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
})

test('la firma sigue SIN llamadores productivos (si se conecta, hay que corregir el encabezado)', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const aca = dirname(fileURLToPath(import.meta.url))
  const raiz = join(aca, '..') // orquestador/

  const llamadores = []
  for (const d of ['comunicacion', 'handlers', 'lib', 'scripts']) {
    let entradas
    try { entradas = await readdir(join(raiz, d), { recursive: true, withFileTypes: true }) } catch { continue }
    for (const e of entradas) {
      if (!e.isFile() || !e.name.endsWith('.mjs') || e.name.endsWith('.test.mjs')) continue
      const ruta = join(e.parentPath ?? e.path, e.name)
      const src = await readFile(ruta, 'utf8')
      // La definición vive en asistencia-sesion.mjs; lo que se busca es un USO externo.
      if (ruta.endsWith('asistencia-sesion.mjs')) continue
      if (/\b(firmarAccion|verificarAccion)\s*\(/.test(src)) llamadores.push(ruta)
    }
  }
  assert.deepEqual(llamadores, [],
    'la firma dejó de ser código reservado: actualizá el encabezado de asistencia-sesion.mjs y la sección 2.4 de OPERACION-ASISTENCIA.md')
})
