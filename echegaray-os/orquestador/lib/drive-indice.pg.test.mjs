// El índice de Drive contra un Postgres DE VERDAD.
//
// Por qué existe además de drive-indice.test.mjs: las propiedades que sostienen el
// almacenamiento NO son propiedades del código, son propiedades de la base. Un doble en
// memoria simula perfecto un upsert que en SQL está mal escrito; un índice GIN que el
// planner no puede usar no rompe ningún assert, sólo hace que la búsqueda tarde 400 ms
// contra 2.465 filas y 40 s cuando sean 40.000. Eso se ve acá o no se ve.
//
// Se saltea si no hay PG_TEST_URL (misma convención que
// orquestador/comunicacion/asistente/recordatorios.pg.test.mjs). Para correrlo:
//   docker run -d --rm --name pg-drv-idx -e POSTGRES_PASSWORD=postgres -p 55450:5432 postgres:16-alpine
//   PG_TEST_URL=postgres://postgres:postgres@127.0.0.1:55450/postgres \
//     node --test orquestador/lib/drive-indice.pg.test.mjs
//   docker rm -f pg-drv-idx
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filaIndice, decidirEscritura } from './drive-indice.mjs'

const URL_TEST = process.env.PG_TEST_URL ?? ''

// GUARDA ANTI-PRODUCCIÓN. Este archivo hace `drop`, `truncate` y `delete` sin preguntar:
// apuntarlo por accidente a la base real del OS sería catastrófico e irreversible. Falla
// cerrado — ante la duda, no corre.
const PELIGRO = ['supabase', 'pooler', 'amazonaws']
const apuntaAProduccion = PELIGRO.some((p) => URL_TEST.toLowerCase().includes(p))
if (apuntaAProduccion) {
  throw new Error(`PG_TEST_URL parece apuntar a producción (contiene "${PELIGRO.find((p) => URL_TEST.toLowerCase().includes(p))}"). Este test destruye datos: abortado.`)
}

const salta = !URL_TEST
const opts = { skip: salta ? 'PG_TEST_URL no seteada' : false }

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRACIONES = ['20260716120000_drive_index.sql', '20260731190000_drive_busqueda.sql']
  .map((f) => join(AQUI, '..', '..', 'supabase', 'migrations', f))

let pool = null

const COLUMNAS = ['drive_file_id', 'name', 'path', 'mime_type', 'is_folder', 'tipo', 'size_bytes',
  'modified_time', 'parent_id', 'depth', 'nombre_norm', 'path_norm', 'tokens', 'owner_email', 'hash']

// El MISMO upsert que usa scripts/indexar-drive.mjs. Si el script y el test escribieran con
// SQL distinto, el test verificaría algo que producción no hace.
const SQL_UPSERT = `insert into public.drive_index (${COLUMNAS.join(',')},indexed_at,actualizado_at)
  values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(',')},now(),now())
  on conflict (drive_file_id) do update set
    ${COLUMNAS.slice(1).map((c) => `${c}=excluded.${c}`).join(',')},
    indexed_at=now(), actualizado_at=now()`

const guardar = (fila) => pool.query(SQL_UPSERT, COLUMNAS.map((c) => fila[c]))

const archivo = (extra = {}) => ({
  id: 'f-flujo',
  name: 'Flujo de Caja - Cash Flow ECSAS',
  mimeType: 'application/vnd.google-apps.spreadsheet',
  modifiedTime: '2026-07-30T12:00:00.000Z',
  owners: [{ emailAddress: 'jorge@ecsas.com.ar' }],
  ...extra,
})
const fila = (extra = {}, path = 'administracion/FINANZAS/Flujo de Caja - Cash Flow ECSAS') =>
  filaIndice(archivo(extra), { path, depth: 2, parentId: 'p-finanzas' })

before(async () => {
  if (salta) return
  const { default: pg } = await import('pg')
  pool = new pg.Pool({ connectionString: URL_TEST, max: 4 })
  // Los roles que la migración menciona no existen en un Postgres pelado; sin ellos el
  // `grant` aborta y no se probaría nada.
  for (const rol of ['authenticated', 'service_role']) {
    await pool.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${rol}') then create role ${rol} nologin; end if; end $$`)
  }
  for (const m of MIGRACIONES) await pool.query(readFileSync(m, 'utf8'))
  await pool.query('truncate public.drive_index, public.drive_busqueda_uso')
})

after(async () => { if (pool) await pool.end() })

// ── La migración ─────────────────────────────────────────────────────────────

test('la migración es re-aplicable: correrla dos veces no rompe ni duplica la semilla', opts, async () => {
  const antes = (await pool.query('select count(*)::int n from public.drive_alias')).rows[0].n
  await pool.query(readFileSync(MIGRACIONES[1], 'utf8'))
  const despues = (await pool.query('select count(*)::int n from public.drive_alias')).rows[0].n
  assert.equal(despues, antes, 'la semilla se duplicó al re-aplicar')
  assert.ok(antes >= 70, `la semilla de sinónimos quedó corta: ${antes} filas`)
})

test('las tablas nuevas tienen RLS habilitada, como drive_index', opts, async () => {
  const { rows } = await pool.query(
    `select relname, relrowsecurity from pg_class
      where relname in ('drive_index','drive_alias','drive_busqueda_uso') and relnamespace='public'::regnamespace`)
  assert.equal(rows.length, 3)
  for (const r of rows) assert.equal(r.relrowsecurity, true, `${r.relname} quedó sin RLS`)
})

// ── El upsert incremental ────────────────────────────────────────────────────

test('el upsert guarda las columnas de búsqueda tal como las calculó el módulo', opts, async () => {
  await pool.query('truncate public.drive_index')
  const f = fila()
  await guardar(f)
  const { rows } = await pool.query('select * from public.drive_index where drive_file_id=$1', [f.drive_file_id])
  assert.equal(rows[0].nombre_norm, 'flujo de caja cash flow ecsas')
  assert.deepEqual(rows[0].tokens, f.tokens, 'el text[] volvió distinto de como se escribió')
  assert.equal(rows[0].owner_email, 'jorge@ecsas.com.ar')
  assert.equal(rows[0].hash, f.hash)
  assert.ok(rows[0].actualizado_at instanceof Date)
})

test('hash igual → la fila no se toca; hash distinto → se reescribe', opts, async () => {
  await pool.query('truncate public.drive_index')
  const f = fila()
  await guardar(f)
  const { rows: [orig] } = await pool.query('select actualizado_at, hash, owner_email from public.drive_index where drive_file_id=$1', [f.drive_file_id])

  // Segunda corrida: el estado que leería el indexador dice que nada cambió.
  const enBase = new Map([[f.drive_file_id, { hash: orig.hash, owner_email: orig.owner_email }]])
  assert.equal(decidirEscritura(fila(), enBase), 'omitir')

  // Tercera: el archivo se renombró en Drive.
  const renombrado = fila({ name: 'Flujo de Caja - Cash Flow ECSAS 2026' })
  assert.equal(decidirEscritura(renombrado, enBase), 'actualizar')
  await new Promise((r) => setTimeout(r, 15))
  await guardar(renombrado)
  const { rows: [despues] } = await pool.query('select name, actualizado_at, tokens from public.drive_index where drive_file_id=$1', [f.drive_file_id])
  assert.equal(despues.name, 'Flujo de Caja - Cash Flow ECSAS 2026')
  assert.ok(despues.actualizado_at > orig.actualizado_at, 'actualizado_at no se movió cuando el archivo SÍ cambió')
  assert.ok(despues.tokens.includes('2026'), 'los tokens no acompañaron al nombre nuevo')
  const { rows: [{ n }] } = await pool.query('select count(*)::int n from public.drive_index')
  assert.equal(n, 1, 'el upsert creó una fila nueva en vez de actualizar: la PK no está haciendo su trabajo')
})

// ── El índice GIN ────────────────────────────────────────────────────────────

test('el GIN sobre tokens existe y el planner lo elige para `tokens && array[...]`', opts, async () => {
  await pool.query('truncate public.drive_index')
  // Volumen: con 20 filas el planner hace seq scan por barato, no por incapaz. El índice se
  // prueba con datos suficientes para que elegirlo sea la decisión correcta.
  const lote = []
  for (let i = 0; i < 3000; i++) {
    lote.push(fila({ id: `f-${i}`, name: `Documento ${i} de obra` }, `administracion/RELLENO/Documento ${i} de obra`))
  }
  lote.push(fila())
  for (const f of lote) await guardar(f)
  await pool.query('analyze public.drive_index')

  const { rows } = await pool.query(
    "explain (format json) select drive_file_id from public.drive_index where tokens && array['flujo','caja']::text[]")
  const plan = JSON.stringify(rows[0]['QUERY PLAN'])
  assert.ok(/drive_index_tokens_gin/.test(plan), `el planner no usó el GIN. Plan: ${plan.slice(0, 300)}`)

  const { rows: hits } = await pool.query(
    "select drive_file_id from public.drive_index where tokens && array['flujo','caja']::text[]")
  assert.deepEqual(hits.map((h) => h.drive_file_id), ['f-flujo'])
})

test('el btree de nombre_norm sirve para el prefijo, que es como se desempata', opts, async () => {
  const { rows } = await pool.query(
    "select count(*)::int n from public.drive_index where nombre_norm like 'flujo%'")
  assert.equal(rows[0].n, 1)
})

// ── El diccionario ───────────────────────────────────────────────────────────

test('drive_alias no admite la misma variante dos veces para el mismo canónico', opts, async () => {
  await pool.query("insert into public.drive_alias (canonico, variante, origen) values ('caja','plata','aprendido') on conflict do nothing")
  await pool.query("insert into public.drive_alias (canonico, variante, origen) values ('caja','plata','manual') on conflict do nothing")
  const { rows } = await pool.query("select count(*)::int n from public.drive_alias where canonico='caja' and variante='plata'")
  assert.equal(rows[0].n, 1)
  await assert.rejects(
    () => pool.query("insert into public.drive_alias (canonico, variante) values ('caja','plata')"),
    /duplicate key/, 'el unique (canonico, variante) no está vigente')
})

test('la misma variante puede pertenecer a dos canónicos distintos ("cash" es flujo y es caja)', opts, async () => {
  const { rows } = await pool.query("select canonico from public.drive_alias where variante='cash' order by canonico")
  assert.deepEqual(rows.map((r) => r.canonico), ['caja', 'flujo'])
})

test('origen sólo acepta los tres valores previstos', opts, async () => {
  await assert.rejects(
    () => pool.query("insert into public.drive_alias (canonico, variante, origen) values ('x','y','inventado')"),
    /check constraint/)
})

// ── El aprendizaje del uso ───────────────────────────────────────────────────

test('drive_busqueda_uso acumula: la misma consulta sobre el mismo archivo suma veces', opts, async () => {
  await pool.query('truncate public.drive_busqueda_uso')
  const sumar = (consulta, id) => pool.query(
    `insert into public.drive_busqueda_uso (consulta_norm, drive_file_id) values ($1,$2)
     on conflict (consulta_norm, drive_file_id)
     do update set veces = public.drive_busqueda_uso.veces + 1, ultima_at = now()`, [consulta, id])

  await sumar('flujo caja', 'f-flujo')
  await sumar('flujo caja', 'f-flujo')
  await sumar('flujo caja', 'f-flujo')
  await sumar('flujo caja', 'f-otro')
  await sumar('avance obra', 'f-avance')

  const { rows } = await pool.query(
    'select drive_file_id, veces from public.drive_busqueda_uso where consulta_norm=$1 order by veces desc', ['flujo caja'])
  assert.deepEqual(rows, [{ drive_file_id: 'f-flujo', veces: 3 }, { drive_file_id: 'f-otro', veces: 1 }])
  // La pregunta que la tabla tiene que contestar: para ESTA consulta, cuál se aceptó más.
  assert.equal(rows[0].drive_file_id, 'f-flujo')
  const { rows: total } = await pool.query('select count(*)::int n from public.drive_busqueda_uso')
  assert.equal(total[0].n, 3, 'la clave (consulta, archivo) no está agrupando')
})

// ── El borrado, en la base ───────────────────────────────────────────────────

test('el borrado por lista de ids saca sólo lo que desapareció', opts, async () => {
  const antes = (await pool.query('select count(*)::int n from public.drive_index')).rows[0].n
  const { rowCount } = await pool.query(
    'delete from public.drive_index where drive_file_id = any($1::text[])', [['f-0', 'f-1']])
  assert.equal(rowCount, 2)
  const despues = (await pool.query('select count(*)::int n from public.drive_index')).rows[0].n
  assert.equal(despues, antes - 2)
})

test('una lista vacía no borra nada (el caso de la corrida sin novedades)', opts, async () => {
  const { rowCount } = await pool.query(
    'delete from public.drive_index where drive_file_id = any($1::text[])', [[]])
  assert.equal(rowCount, 0)
})
