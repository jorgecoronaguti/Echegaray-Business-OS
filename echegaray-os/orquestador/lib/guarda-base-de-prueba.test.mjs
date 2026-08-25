// LO QUE ESTE ARCHIVO VIGILA
//
// Cada caso reproduce un defecto que ya pasó o que la guarda existe para impedir. Si se revierte
// `guarda-base-de-prueba.mjs`, acá se pone rojo algo — ése es el contrato de estos tests.
//
//  1. EL PROVEEDOR FANTASMA. Un test negativo hace `insert into proveedores` esperando un 4xx, la
//     RLS lo deja pasar, la aserción se pone roja y LA FILA QUEDA. Cuatro veces el 20/08/2026.
//  2. EL COMMIT QUE SE ESCAPA. Un `.pg.test.mjs` futuro que copie el patrón y ponga `commit` donde
//     va `rollback` deja todo el escenario en producción.
//  3. EL CTE QUE BORRA. `with x as (delete from t returning *) select …` empieza con `with`: un
//     clasificador que mire la primera palabra lo llama lectura.
//  4. LA BASE «DE PRUEBA» QUE ERA PRODUCCIÓN. Declarar `ORQ_TEST_DB_URL` y conectarse a otra cosa
//     no vuelve de prueba a la base a la que uno se conectó.
//  5. LA GUARDA QUE ROMPE LA SUITE. `Pool.query` llama por dentro a `Pool.connect(callback)`: una
//     envoltura que sólo contemple la promesa devuelve `undefined` y pone en rojo 30 archivos sin
//     un solo defecto real. Pasó mientras se construía esto.
//  6. FUERA DE UN TEST NO SE INTERVIENE. Si la guarda se instalara en producción, el worker no
//     podría escribir nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  baseDeclaradaDePrueba, claseDeSentencia, decidir, declararEscrituraEnPrueba,
  declaracionVigente, enContextoDePrueba, instalarGuarda, olvidarDeclaracion,
} from './guarda-base-de-prueba.mjs'

// ── un pool de mentira que se comporta como el de `pg` en lo que importa ────────────────────────
function poolFalso() {
  const ejecutadas = []
  // `pg` de verdad responde por promesa O por callback según cómo lo llamen. El doble tiene que
  // hacer las dos: si sólo hiciera la promesa, la envoltura que cuelga la suite pasaría en verde.
  const cliente = {
    query(t, valores, cb) {
      const callback = typeof cb === 'function' ? cb : typeof valores === 'function' ? valores : null
      ejecutadas.push(String(typeof t === 'string' ? t : t.text))
      if (callback) { queueMicrotask(() => callback(null, { rows: [] })); return undefined }
      return Promise.resolve({ rows: [] })
    },
    release: () => {},
  }
  const pool = {
    ejecutadas,
    // `pg` real: Pool.query pide una conexión POR CALLBACK y le manda la sentencia.
    query(texto, params) {
      return new Promise((res, rej) => {
        pool.connect((err, c, done) => {
          if (err) return rej(err)
          c.query(texto, params).then((r) => { done?.(); res(r) }, rej)
        })
      })
    },
    connect(cb) {
      if (typeof cb === 'function') { cb(null, cliente, () => {}); return undefined }
      return Promise.resolve(cliente)
    },
  }
  return pool
}

const armado = (pool) => instalarGuarda(pool, { esPrueba: true, baseDePrueba: false, aviso: () => {} })

test.beforeEach(() => olvidarDeclaracion())

// ═══ 1 · EL PROVEEDOR FANTASMA ═══════════════════════════════════════════════════════════════════
test('un insert en autocommit desde un test contra la base productiva NO llega a la base', async () => {
  const pool = armado(poolFalso())
  await assert.rejects(
    () => pool.query(`insert into proveedores (nombre) values ('QA NO DEBE ENTRAR 1787241749841')`),
    /ESCRITURA COMMITEADA DESDE UN TEST/,
  )
  assert.deepEqual(pool.ejecutadas, [], 'la sentencia igual salió: la guarda avisó y dejó pasar')
})

test('y el mensaje enseña las tres salidas, no sólo que falló', async () => {
  const pool = armado(poolFalso())
  const err = await pool.query('delete from personas where id = 1').catch((e) => e)
  assert.match(err.message, /begin/, 'no menciona la transacción + rollback')
  assert.match(err.message, /ORQ_TEST_DB_URL/, 'no menciona la base aislada')
  assert.match(err.message, /declararEscrituraEnPrueba/, 'no menciona la declaración explícita')
})

test('leer nunca se frena: la suite entera vive de leer producción', async () => {
  const pool = armado(poolFalso())
  await pool.query('select count(*) from proveedores')
  await pool.query('  -- un comentario\n  select 1')
  assert.equal(pool.ejecutadas.length, 2)
})

// ═══ 2 · EL COMMIT QUE SE ESCAPA ═════════════════════════════════════════════════════════════════
test('escribir DENTRO de una transacción pasa: es el patrón de todos los .pg.test.mjs', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  await c.query('begin')
  await c.query(`insert into obra_canonica (id, nombre) values ('zz', 'zz')`)
  await c.query('rollback')
  assert.deepEqual(pool.ejecutadas, ['begin', `insert into obra_canonica (id, nombre) values ('zz', 'zz')`, 'rollback'])
})

test('pero el commit de esa transacción se convierte en ROLLBACK y falla', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  await c.query('begin')
  await c.query(`insert into obra_canonica (id, nombre) values ('zz', 'zz')`)
  await assert.rejects(() => c.query('commit'), /COMMIT DE UNA TRANSACCIÓN QUE ESCRIBIÓ/)
  assert.equal(pool.ejecutadas.at(-1), 'rollback',
    'se lanzó el error pero la transacción quedó abierta: la conexión vuelve al pool escribiendo')
})

test('el commit de una transacción que sólo leyó pasa: no cambia nada', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  await c.query('begin')
  await c.query('select 1')
  await c.query('commit')
  assert.equal(pool.ejecutadas.at(-1), 'commit')
})

test('cerrada la transacción, el autocommit vuelve a estar vigilado', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  await c.query('begin')
  await c.query('rollback')
  await assert.rejects(() => c.query('update personas set nombre_completo = $1'), /ESCRITURA COMMITEADA/)
})

// ═══ 3 · LA CLASIFICACIÓN ════════════════════════════════════════════════════════════════════════
test('un CTE que borra es una escritura aunque empiece con `with`', () => {
  assert.equal(claseDeSentencia('with x as (delete from t returning *) select * from x'), 'escritura')
  assert.equal(claseDeSentencia('WITH v AS (INSERT INTO t VALUES (1) RETURNING id) SELECT * FROM v'), 'escritura')
  assert.equal(claseDeSentencia('with x as (select 1) select * from x'), 'lectura')
})

test('lo que el clasificador no reconoce cuenta como escritura — falla cerrado', () => {
  assert.equal(claseDeSentencia('merge into t using s on (t.id = s.id)'), 'escritura')
  assert.equal(claseDeSentencia('truncate proveedores'), 'escritura')
  assert.equal(claseDeSentencia('grant select on personas to authenticated'), 'escritura')
  assert.equal(claseDeSentencia('refresh materialized view v'), 'escritura')
  assert.equal(claseDeSentencia('vacuum full'), 'escritura')
  assert.equal(claseDeSentencia(undefined), 'escritura')
})

test('un comentario adelante no disfraza un delete', () => {
  assert.equal(claseDeSentencia('/* limpieza */ delete from t'), 'escritura')
  assert.equal(claseDeSentencia('-- limpieza\ndelete from t'), 'escritura')
})

// `caso-controlado-circuito.pg.test.mjs` vuelve a un savepoint dos veces en medio de su `begin`.
// Con `rollback to savepoint` contado como fin de transacción, la guarda creía que todo lo que
// seguía corría en autocommit: 31 escrituras legítimas frenadas y seis casos en rojo sin defecto.
test('`rollback to savepoint` NO cierra la transacción: se sigue adentro', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  await c.query('begin')
  await c.query('savepoint intento')
  await c.query(`insert into obra_ejecucion values (1)`)
  await c.query('rollback to savepoint intento')
  await c.query(`insert into obra_ejecucion values (2)`) // no debe frenarse: sigue en transacción
  await c.query('rollback')
  assert.equal(pool.ejecutadas.length, 6)
  assert.equal(claseDeSentencia('rollback to savepoint intento'), 'sesion')
  assert.equal(claseDeSentencia('ROLLBACK TO intento'), 'sesion')
})

test('pero el rollback pelado sí la cierra', () => {
  assert.equal(claseDeSentencia('rollback'), 'deshace')
  assert.equal(claseDeSentencia('ROLLBACK;'), 'deshace')
})

test('las de sesión y transacción se reconocen por lo que son', () => {
  assert.equal(claseDeSentencia('BEGIN'), 'abre')
  assert.equal(claseDeSentencia('start transaction isolation level serializable'), 'abre')
  assert.equal(claseDeSentencia('COMMIT'), 'confirma')
  assert.equal(claseDeSentencia('rollback'), 'deshace')
  assert.equal(claseDeSentencia(`set local role authenticated`), 'sesion')
  assert.equal(claseDeSentencia(`select set_config('request.jwt.claims', $1, true)`), 'lectura')
})

// ═══ 4 · CUÁNDO LA BASE ES DE PRUEBA ═════════════════════════════════════════════════════════════
test('declarar una URL de prueba y conectarse a OTRA no vuelve de prueba a la base conectada', () => {
  const env = { ORQ_TEST_DB_URL: 'postgres://x@localhost:5432/t' }
  assert.equal(baseDeclaradaDePrueba('postgres://prod@supabase.co:5432/postgres', env), false)
  assert.equal(baseDeclaradaDePrueba('postgres://x@localhost:5432/t', env), true)
})

test('sin nadie que declare nada, la base es la productiva', () => {
  assert.equal(baseDeclaradaDePrueba('postgres://cualquiera/db', {}), false)
  assert.equal(baseDeclaradaDePrueba(undefined, {}), false)
})

test('PG_TEST_URL sigue valiendo: es la convención que ya usaba recordatorios.pg.test.mjs', () => {
  assert.equal(baseDeclaradaDePrueba('postgres://p@1.2.3.4:5432/t', { PG_TEST_URL: 'postgres://p@1.2.3.4:5432/t' }), true)
})

// ═══ 5 · LA GUARDA NO PUEDE ROMPER LA SUITE ══════════════════════════════════════════════════════
test('Pool.query sigue funcionando: por dentro pide la conexión POR CALLBACK', async () => {
  const pool = armado(poolFalso())
  const r = await pool.query('select 1')
  assert.deepEqual(r, { rows: [] }, 'la envoltura de connect devolvió undefined y rompió toda lectura')
})

test('la forma de callback se responde POR EL CALLBACK, no con una promesa que nadie espera', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  const leido = await new Promise((res, rej) => {
    const r = c.query('select 1', [], (err, out) => (err ? rej(err) : res(out)))
    assert.equal(r, undefined, 'con callback, `query` no devuelve promesa: pg no la espera')
  })
  assert.deepEqual(leido, { rows: [] })
})

test('y una escritura frenada en forma de callback avisa por el callback — no cuelga', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  const err = await new Promise((res) => { c.query('delete from t', [], (e) => res(e)) })
  assert.match(err.message, /ESCRITURA COMMITEADA/)
  assert.deepEqual(pool.ejecutadas, [])
})

test('devolver el cliente al pool cierra la transacción que nadie cerró', async () => {
  const pool = armado(poolFalso())
  const c = await pool.connect()
  await c.query('begin')
  c.release()
  const otro = await pool.connect()
  await assert.rejects(() => otro.query('delete from t'), /ESCRITURA COMMITEADA/,
    'el préstamo siguiente heredó el `begin` y escribió creyendo estar en transacción')
})

test('un cliente prestado dos veces no acumula una guarda por préstamo', async () => {
  const pool = armado(poolFalso())
  const a = await pool.connect()
  const b = await pool.connect()
  assert.equal(a, b, 'el pool falso presta el mismo cliente: es el caso que se quiere probar')
  await b.query('select 1')
  assert.deepEqual(pool.ejecutadas, ['select 1'])
})

// ═══ 6 · FUERA DE UN TEST NO SE INTERVIENE ═══════════════════════════════════════════════════════
test('en producción el pool sale pelado: ni una capa entre el Fabric y el driver', async () => {
  const pool = poolFalso()
  const query = pool.query
  const devuelto = instalarGuarda(pool, { esPrueba: false, baseDePrueba: false })
  assert.equal(devuelto, pool)
  assert.equal(pool.query, query, 'la guarda se instaló fuera de un test')
  await pool.query('delete from personas')
  assert.deepEqual(pool.ejecutadas, ['delete from personas'])
})

test('contra una base declarada de prueba tampoco se interviene', async () => {
  const pool = poolFalso()
  instalarGuarda(pool, { esPrueba: true, baseDePrueba: true })
  await pool.query('delete from personas')
  assert.deepEqual(pool.ejecutadas, ['delete from personas'])
})

test('el proceso que corre esta suite ES un contexto de prueba', () => {
  assert.equal(enContextoDePrueba(), true,
    'si esto da false, la guarda no se instala en ninguna corrida de `node --test`')
})

test('sin NODE_TEST_CONTEXT todavía se detecta por execArgv: --experimental-test-isolation=none', () => {
  assert.equal(enContextoDePrueba({}, ['--test']), true)
  assert.equal(enContextoDePrueba({}, []), false)
})

// ═══ 7 · LA DECLARACIÓN ══════════════════════════════════════════════════════════════════════════
test('declarar abre la puerta — y el motivo queda a la vista', async () => {
  const pool = poolFalso()
  let ruido = ''
  instalarGuarda(pool, { esPrueba: true, baseDePrueba: false, aviso: (m) => { ruido += m } })
  declararEscrituraEnPrueba('la huella de celda se prueba contra la tabla real porque su propiedad '
    + 'es que SOBREVIVE a la corrida siguiente')
  await pool.query('delete from public.sheet_huella_celda where file_id = $1')
  assert.deepEqual(pool.ejecutadas, ['delete from public.sheet_huella_celda where file_id = $1'])
  assert.match(ruido, /ESCRIBE EN SERIO SOBRE LA BASE PRODUCTIVA/)
  assert.match(ruido, /SOBREVIVE/, 'el aviso no dice el motivo declarado')
})

test('el aviso sale UNA vez por proceso, no una por sentencia', async () => {
  const pool = poolFalso()
  let veces = 0
  instalarGuarda(pool, { esPrueba: true, baseDePrueba: false, aviso: () => { veces += 1 } })
  declararEscrituraEnPrueba('motivo suficientemente largo para pasar el mínimo exigido')
  await pool.query('delete from t')
  await pool.query('delete from t')
  assert.equal(veces, 1)
})

test('una declaración sin motivo real no es una declaración', () => {
  assert.throws(() => declararEscrituraEnPrueba(''), /el motivo es obligatorio/)
  assert.throws(() => declararEscrituraEnPrueba('porque sí'), /mínimo 20 caracteres/)
  assert.equal(declaracionVigente(), null)
})

// ═══ 8 · LA DECISIÓN, PURA ═══════════════════════════════════════════════════════════════════════
test('decidir() es pura y devuelve el estado siguiente: el commit lo necesita para saber si escribió', () => {
  const base = { esPrueba: true, baseDePrueba: false, declarado: false }
  const abre = decidir({ ...base, sql: 'begin', estado: {} })
  assert.deepEqual(abre.estado, { enTransaccion: true, escribio: false })
  const escribe = decidir({ ...base, sql: 'insert into t values (1)', estado: abre.estado })
  assert.deepEqual(escribe.estado, { enTransaccion: true, escribio: true })
  assert.equal(escribe.accion, 'pasa')
  assert.equal(decidir({ ...base, sql: 'commit', estado: escribe.estado }).accion, 'deshace')
})
