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
    for (const rel of ['public.caja_sheet_foto', 'public.caja_egreso_percibido']) {
      await c.query('savepoint anon')
      await assert.rejects(c.query(`select 1 from ${rel}`), /permission denied/)
      await c.query('rollback to savepoint anon')
    }
  })
})

test('lo percibido es lo PAGADO en su fecha: mes a mes cierra con Monto Pagado + Monto Parcial 2 de Compras (Δ 0), y lo sin desglose no se suma', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    // COMO DIRECCIÓN: sin el bypass de `auth.uid() is null`, la vista no le contesta a nadie sin rol económico.
    const ids = Object.fromEntries((await c.query('select distinct on (rol) rol, id from public.perfiles order by rol')).rows.map((r) => [r.rol, r.id]))
    await como(c, ids.direccion)
    // La vista contra la pestaña, por mes: la vista no puede decir un peso más ni menos que las dos celdas.
    const { rows } = await c.query(`
      with sheet as (
        select to_char(cs.fecha_caja, 'YYYY-MM') mes, sum(cs.monto_pagado) monto from public.compra_sheet cs
          join public.costos_obra co on co.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text and co.origen = 'compras_sheet'
         where not coalesce(cs.anulada, false) and coalesce(cs.monto_pagado, 0) <> 0 group by 1
        union all
        select to_char(cs.fecha_prevista_2, 'YYYY-MM'), sum(cs.monto_parcial_2) from public.compra_sheet cs
          join public.costos_obra co on co.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text and co.origen = 'compras_sheet'
         where not coalesce(cs.anulada, false) and coalesce(cs.monto_parcial_2, 0) <> 0 group by 1
      ), s as (select mes, sum(monto) monto from sheet group by 1),
      v as (select to_char(fecha_pago, 'YYYY-MM') mes, sum(monto) filter (where naturaleza = 'pago') pago,
                   sum(total) filter (where naturaleza = 'sin_desglose') sin_desglose, count(*) filter (where naturaleza = 'sin_desglose')::int n_sd,
                   sum(monto) filter (where naturaleza = 'pendiente') pendiente
              from public.caja_egreso_percibido group by 1)
      select m.mes, s.monto::bigint sheet_pagado, v.pago::bigint vista_pago, (coalesce(v.pago,0) - coalesce(s.monto,0))::bigint delta,
             v.sin_desglose::bigint sin_desglose, v.n_sd, v.pendiente::bigint pendiente
        from (select mes from s union select mes from v) m
        left join s on s.mes is not distinct from m.mes
        left join v on v.mes is not distinct from m.mes order by 1`)
    assert.ok(rows.length >= 9, `sólo ${rows.length} meses`)
    console.log('Δ percibido por mes (sheet Monto Pagado+Parcial 2 vs vista pago):')
    for (const r of rows) console.log(`  ${r.mes ?? 'sin fecha'}\tsheet ${r.sheet_pagado}\tvista ${r.vista_pago}\tΔ ${r.delta}\tsin desglose ${r.sin_desglose ?? 0} (${r.n_sd})\tpendiente ${r.pendiente ?? 0}`)
    for (const r of rows) assert.equal(Number(r.delta), 0, `mes ${r.mes}`)
    // Los casos de la auditoría: cada pago en su fecha, y lo «Pagado» sin monto no se asume.
    const f = async (fila) => (await c.query('select naturaleza, fecha_pago::text f, monto::numeric::float8 m from public.caja_egreso_percibido where fila = $1 order by f', [fila])).rows
    assert.deepEqual(await f(492), [{ naturaleza: 'pago', f: '2026-06-19', m: 1000000 }, { naturaleza: 'pago', f: '2026-07-18', m: 450000 }])
    assert.deepEqual(await f(806), [{ naturaleza: 'pago', f: '2026-08-28', m: 2250000 }])
    assert.deepEqual(await f(768), [{ naturaleza: 'sin_desglose', f: '2026-08-04', m: 5124411.5 }])
    assert.deepEqual(await f(881), [{ naturaleza: 'pago', f: '2026-09-18', m: 197272.73 }, { naturaleza: 'pendiente', f: '2026-09-18', m: 1940593.94 }])
    // Ninguna compra viva del espejo se pierde en el join, y la vista no trae filas de otra naturaleza.
    const h = (await c.query(`select count(*)::int n from public.costos_obra co where co.origen = 'compras_sheet'
      and not exists (select 1 from public.compra_sheet cs where co.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text)`)).rows[0].n
    assert.equal(h, 0)
    const nat = (await c.query('select distinct naturaleza from public.caja_egreso_percibido order by 1')).rows.map((r) => r.naturaleza)
    assert.deepEqual(nat, ['pago', 'pendiente', 'sin_desglose'])
  })
})

test.after(async () => { await closePool().catch(() => {}) })
