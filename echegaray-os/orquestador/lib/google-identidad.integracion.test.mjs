// LA RESOLUCIÓN DE CUENTA CONTRA UN POSTGRES DE VERDAD.
//
// Por qué existe además del test con dobles: las tres preguntas que deciden con qué cuenta
// actúa el OS —quién es la operadora, quién autorizó su Google, y qué pasa cuando la
// preferida no está autorizada— NO son propiedades del código: son consultas SQL sobre
// `orq.google_tokens`. Un doble en memoria las simula perfecto y el SQL puede estar mal.
// De hecho el defecto original vivía exactamente ahí: `accessTokenFor` recibía una Promise,
// consultaba por el literal "[object promise]", no encontraba fila y devolvía null — la base
// contestaba "no hay nadie" y el OS lo leía como "usá el Service Account". Cero errores.
//
// Se saltea si no hay PG_TEST_URL (misma convención que recordatorios.pg.test.mjs). Para correrlo:
//   docker run -d --rm --name pg-goo -e POSTGRES_PASSWORD=x -p 55443:5432 postgres:16-alpine
//   PG_TEST_URL=postgres://postgres:x@127.0.0.1:55443/postgres \
//     node --test orquestador/lib/google-identidad.integracion.test.mjs
//
// NINGÚN token real aparece en este archivo ni en su salida: los refresh_token son literales
// de prueba y nunca se imprimen.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_TEST = process.env.PG_TEST_URL || ''
const salta = !URL_TEST
const opts = { skip: salta ? 'PG_TEST_URL no seteada' : false }

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRACION = join(AQUI, '..', '..', 'supabase', 'migrations', '20260715170000_google_tokens_oauth.sql')

// La base productiva vive en Supabase. Si PG_TEST_URL apunta ahí, esto no corre: un test que
// hace `delete from orq.google_tokens` contra producción desconecta a las dos personas del OS.
const HUELE_A_PRODUCCION = /supabase\.(co|com)|pooler\.|amazonaws\.com/i

const JORGE = 'jorge@ecsas.com.ar'
const RODRIGO = 'rodrigo@ecsas.com.ar'
const AJENO = 'nadie@ecsas.com.ar'

let pool = null
let oauth = null // el módulo bajo prueba, importado DESPUÉS de apuntar el entorno a la base descartable

before(async () => {
  if (salta) return
  assert.ok(!HUELE_A_PRODUCCION.test(URL_TEST), 'PG_TEST_URL parece la base productiva: este test NO corre contra producción')
  // El orden importa: `lib/db.mjs` arma su pool desde `loadConfig()`, y `config.mjs` hidrata
  // el entorno desde el EnvironmentFile del worker (donde vive el DATABASE_URL real) al ser
  // importado. Por eso se fija el entorno ANTES del primer import y todo entra por `import()`.
  process.env.DATABASE_URL = URL_TEST
  process.env.ORQ_DB_SSL = '0'
  // Sin credencial OAuth, `accessTokenFor` corta antes de cualquier fetch: este test no sale a la red.
  delete process.env.GOOGLE_OAUTH_CLIENT_ID
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET

  const { default: pg } = await import('pg')
  pool = new pg.Pool({ connectionString: URL_TEST, max: 4 })
  await pool.query('create schema if not exists orq')
  await pool.query("do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;")
  await pool.query(readFileSync(MIGRACION, 'utf8'))

  const { loadConfig } = await import('./config.mjs')
  assert.equal(loadConfig().DATABASE_URL, URL_TEST, 'el módulo quedó apuntando a otra base que no es la descartable')
  oauth = await import('./google-oauth.mjs')
})

after(async () => {
  if (pool) await pool.end()
  if (oauth) { const { closePool } = await import('./db.mjs'); await closePool() }
})

/** Deja la tabla exactamente con estas cuentas, en este orden de antigüedad (la última es la
 *  más reciente). El refresh_token es un literal de prueba: no hay secretos acá. */
async function sembrar(...emails) {
  await pool.query('delete from orq.google_tokens')
  for (let i = 0; i < emails.length; i++) {
    await pool.query(
      `insert into orq.google_tokens (email, refresh_token, scopes, updated_at)
       values ($1, 'refresh-de-prueba', 'scope-de-prueba', now() - make_interval(mins => $2))`,
      [emails[i], emails.length - i],
    )
  }
}

test('la operadora es la cuenta preferida por entorno cuando ESA cuenta autorizó', opts, async () => {
  await sembrar(JORGE, RODRIGO) // rodrigo es la más reciente…
  process.env.ORQ_GOOGLE_IMPERSONATE = JORGE // …pero la preferida es jorge
  assert.equal(await oauth.operadorEmail(), JORGE)
})

test('si la cuenta preferida NO autorizó, la operadora es la más reciente (no la preferida)', opts, async () => {
  await sembrar(JORGE, RODRIGO)
  process.env.ORQ_GOOGLE_IMPERSONATE = 'alguien@ecsas.com.ar'
  // Devolver la preferida igual sería el peor final: un token que no existe, un 401 opaco y
  // nadie entendiendo por qué el OS "perdió el acceso" a Drive.
  assert.equal(await oauth.operadorEmail(), RODRIGO)
})

test('sin ninguna cuenta autorizada, la operadora es null (y ahí el OS decide, no adivina)', opts, async () => {
  await sembrar()
  process.env.ORQ_GOOGLE_IMPERSONATE = JORGE
  assert.equal(await oauth.operadorEmail(), null)
  assert.equal(await oauth.hayCuentaAutorizada(), false)
})

test('operadorEmail() devuelve un STRING, nunca una Promise sin resolver', opts, async () => {
  // El bug de producción en una línea: `const op = operadorEmail()` sin await daba un objeto
  // siempre verdadero, y de ahí salía el "[object promise]" que la base nunca iba a encontrar.
  await sembrar(JORGE, RODRIGO)
  process.env.ORQ_GOOGLE_IMPERSONATE = JORGE
  const op = await oauth.operadorEmail()
  assert.equal(typeof op, 'string')
  assert.ok(!(op instanceof Promise))
  assert.match(op, /@/)
})

test('tieneToken responde por la base, no por una lista en el código', opts, async () => {
  await sembrar(JORGE, RODRIGO)
  assert.equal(await oauth.tieneToken(JORGE), true)
  assert.equal(await oauth.tieneToken('JORGE@ECSAS.COM.AR'), true, 'el email tiene que normalizarse')
  assert.equal(await oauth.tieneToken(AJENO), false)
  assert.equal(await oauth.tieneToken(''), false)
  assert.equal(await oauth.tieneToken(null), false)
})

test('operadorPara: cada uno actúa con SU cuenta; el que no autorizó cae a la operadora', opts, async () => {
  await sembrar(JORGE, RODRIGO)
  process.env.ORQ_GOOGLE_IMPERSONATE = JORGE
  assert.equal(await oauth.operadorPara(RODRIGO), RODRIGO, 'rodrigo tiene la suya: el efecto va a su cuenta')
  assert.equal(await oauth.operadorPara(AJENO), JORGE, 'sin cuenta propia, la operadora — que sólo alcanza para leer')
})

test('accessTokenFor(una Promise) devuelve null — por eso el defecto era silencioso', opts, async () => {
  await sembrar(JORGE, RODRIGO)
  // Reproduce literalmente lo que hacía `getTokenFor(op)` con `op` sin await. No sale a la
  // red: sin GOOGLE_OAUTH_CLIENT_ID, `accessTokenFor` corta antes del fetch. Devuelve null,
  // `makeGoogleClient` interpreta "no hay token de usuario" y usa el Service Account. Nadie
  // se entera de nada.
  const promesa = oauth.operadorEmail()
  assert.equal(await oauth.accessTokenFor(promesa), null)
  assert.equal(await oauth.accessTokenFor('[object promise]'), null)
  await promesa // no dejar la promesa colgando
  // Y con una cuenta que SÍ está: sigue siendo null por falta de credencial OAuth, no por
  // falta de fila. La distinción importa: son dos causas distintas con el mismo síntoma.
  assert.equal(await oauth.accessTokenFor(JORGE), null)
})
