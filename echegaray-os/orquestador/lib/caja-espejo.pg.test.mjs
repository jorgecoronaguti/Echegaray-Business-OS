// EL ESPEJO DE CAJA CONTRA POSTGRES DE VERDAD — sin dejar nada escrito.
//
// La migración 20260918T1500 se aplica ADENTRO de una transacción que siempre se deshace (con el turno
// de DDL compartido), se escribe una foto con la función de producción (`escribirFoto`) desde la
// grilla real del 18/09 y se prueba lo que un doble no puede: que la vista vigente devuelve la foto,
// que una foto igual se confirma sin reinsertar, que la leen Dirección y Administración y NADIE más, y
// que nadie con sesión la puede escribir. Sin base se salta: no se inventa un verde.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPool, closePool } from './db.mjs'
import { leerCaja } from './caja-espejo.mjs'
import { escribirFoto } from '../scripts/sync-caja-espejo.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const MIGRACION = readFileSync(new URL('../../supabase/migrations/20260918T1500_caja_espejo_de_la_pestana.sql', import.meta.url), 'utf8')
  .replace(/^begin;$/m, '').replace(/^commit;$/m, '')
const grid = JSON.parse(readFileSync(new URL('./caja-espejo.fixture.json', import.meta.url), 'utf8'))

async function enEnsayo(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query("set local lock_timeout = '5s'")
    await c.query(MIGRACION)
    return await fn(c)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

async function como(c, sub) {
  await c.query('set local role authenticated')
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: 'authenticated' })])
}

test('la foto se escribe, se confirma sin duplicarse y la vista vigente devuelve el texto de la pestaña', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    const foto = leerCaja({ grid })
    assert.equal((await escribirFoto(c, { foto, version: '1' })).accion, 'insertar')
    assert.equal((await escribirFoto(c, { foto, version: '2' })).accion, 'confirmar')
    const { rows } = await c.query('select count(*)::int n from public.caja_sheet_foto')
    assert.equal(rows[0].n, 1)
    const v = (await c.query('select portada, version_drive, ultimo_intento_ok from public.caja_sheet_vigente')).rows[0]
    assert.equal(v.version_drive, '2')
    assert.equal(v.ultimo_intento_ok, true)
    assert.deepEqual(v.portada.tarjetas.map((t) => t.valor.texto), ['$80.072.343', '$27.448.290', '$52.624.052', '$45.191.415', '$116.603.171'])
  })
})

test('una foto distinta pasa a ser la vigente', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    await escribirFoto(c, { foto: leerCaja({ grid }), version: '1' })
    const otra = { filas: grid.filas.map((f, i) => (i === 2 ? f.map((x, j) => (j === 0 ? { ...x, valor: '$1' } : x)) : f)) }
    assert.equal((await escribirFoto(c, { foto: leerCaja({ grid: otra }), version: '2' })).accion, 'insertar')
    const v = (await c.query("select portada->'tarjetas'->0->'valor'->>'texto' t from public.caja_sheet_vigente")).rows[0]
    assert.equal(v.t, '$1')
  })
})

test('lo leen Dirección y Administración; jefe de obra, campo y anónimo no; nadie con sesión escribe', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    await escribirFoto(c, { foto: leerCaja({ grid }), version: '1' })
    const ids = Object.fromEntries((await c.query('select distinct on (rol) rol, id from public.perfiles order by rol')).rows.map((r) => [r.rol, r.id]))
    await c.query('savepoint antes')
    for (const [rol, espera] of [['direccion', 1], ['administracion', 1], ['jefe_obra', 0], ['campo', 0]]) {
      if (!ids[rol]) continue
      await como(c, ids[rol])
      const n = (await c.query('select (select count(*) from public.caja_sheet_vigente)::int v, (select count(*) from public.caja_sheet_sync)::int s')).rows[0]
      assert.deepEqual([rol, n.v, n.s], [rol, espera, espera])
      const e = (await c.query('select count(*)::int n from public.caja_egreso_percibido')).rows[0].n
      assert.equal(e > 0, espera === 1, `${rol} ve ${e} egresos`)
      await c.query('reset role')
    }
    await como(c, ids.direccion)
    await assert.rejects(c.query("update public.caja_sheet_foto set huella = 'x'"), /permission denied/)
    await c.query('rollback to savepoint antes')
    await c.query('set local role anon')
    await assert.rejects(c.query('select 1 from public.caja_sheet_foto'), /permission denied/)
  })
})

test('lo percibido cruza cada compra del espejo con su fila de Compras (ninguna se pierde en el join)', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    const { rows } = await c.query(`select
      (select count(*) from public.costos_obra co join public.compra_sheet cs on co.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text
        where co.origen = 'compras_sheet' and not coalesce(cs.anulada, false))::int esperado,
      (select count(*) from public.caja_egreso_percibido)::int vista,
      (select count(*) from public.costos_obra co where co.origen = 'compras_sheet'
        and not exists (select 1 from public.compra_sheet cs where co.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text))::int huerfanas`)
    assert.equal(rows[0].vista, rows[0].esperado)
    assert.equal(rows[0].huerfanas, 0)
  })
})

test.after(async () => { await closePool().catch(() => {}) })
