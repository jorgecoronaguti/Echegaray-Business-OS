// EL COSTO POR OBRA POR obra_id — contra la base real, con la migración 20260915T2300 aplicada ADENTRO.
//
// La migración se lee del repo, corre dentro de una transacción y termina en ROLLBACK: no queda ni
// una vista ni una fila. Si ya está aplicada (constancia en `migracion_aplicada`), se afirma contra
// el esquema vivo y no se re-aplica (re-crear una vista viva toma AccessExclusiveLock con la suite
// en paralelo). Sin base, se salta: no se inventa un verde.
//
// LO QUE SE PRUEBA ES EL EFECTO, no la definición:
//   1 · la vista da, obra por obra, la suma DIRECTA de `costos_obra` por `obra_id` (un control contra
//       otra cuenta, no contra la que produce la vista), y ninguna compra sin obra_id pesa en nadie.
//   2 · una compra cuya J dice «LA ESTRELLA» pero cuya columna Obra dice el comedor pesa en el
//       comedor — que es exactamente el defecto medido el 15/09/2026.
//   3 · la RPC de la app cambia la obra y `costos_obra`, `compra_obra_asignada` y la vista lo dicen en
//       la MISMA transacción: obra → estructura → celda vaciada, sin esperar al worker ni al sync.
//   4 · las auxiliares nuevas no las puede llamar `authenticated`; las vistas corren con invoker.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const ARCHIVO = '20260915T2300_costo_por_obra_por_obra_id.sql'
const MIGRACION = join(import.meta.dirname, '..', '..', 'supabase/migrations', ARCHIVO)
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const ES_ADM = 'ES-ADM · Estructura – Administración'

test('el costo por obra se imputa por obra_id y la RPC lo mueve en el acto', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const sesion = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`, [
    id ? JSON.stringify({ sub: id, role: 'authenticated' }) : '',
  ])
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query(`create table if not exists public.migracion_aplicada (archivo text primary key, hash text not null, aplicada_en timestamptz not null default now(), aplicada_por text)`)
    const aplicada = await uno('select 1 as v from public.migracion_aplicada where archivo = $1', [ARCHIVO])
    if (!aplicada) await c.query(readFileSync(MIGRACION, 'utf8'))

    await t.test('la vista es la suma directa por obra_id; lo sin obra_id no pesa en nadie', async () => {
      const desvios = await q(`
        with directa as (
          select c.obra_id, count(*)::int n, sum(c.total) total
            from public.costos_obra c
           where c.obra_id is not null
             and not exists (select 1 from public.compra_sheet s
                              where c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
                                and (s.anulada or upper(btrim(coalesce(s.estado, ''))) = 'ELIMINADO'))
           group by c.obra_id)
        select v.obra_id, v.costo_real, d.total, v.n_comprobantes, d.n
          from public.obra_costo_real v
          left join directa d on d.obra_id = v.obra_id
         where v.costo_real is distinct from coalesce(d.total, 0) or v.n_comprobantes is distinct from coalesce(d.n, 0)`)
      assert.deepEqual(desvios, [], 'la vista no coincide con la suma directa por obra_id')
      const { total_vista, total_directo } = await uno(`
        select (select sum(costo_real) from public.obra_costo_real) as total_vista,
               (select sum(total) from public.costos_obra c where c.obra_id is not null
                  and not exists (select 1 from public.compra_sheet s
                                   where c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
                                     and (s.anulada or upper(btrim(coalesce(s.estado, ''))) = 'ELIMINADO'))) as total_directo`)
      assert.equal(Number(total_vista), Number(total_directo ?? 0))
    })

    await t.test('la J que dice «LA ESTRELLA» no pesa en La Estrella si la columna Obra dice el comedor', async () => {
      // La Estrella y su comedor si están; si no, dos obras vivas cualesquiera: el defecto es el mismo.
      const vivas = await q(`select id from public.obra_canonica where id in ('la-estrella', 'le-comedor') order by id desc`)
      const [madre, hija] = vivas.length === 2 ? ['la-estrella', 'le-comedor']
        : (await q(`select id from public.obra_canonica where fusionada_en is null order by id limit 2`)).map((o) => o.id)
      const antes = await uno('select costo_real, n_comprobantes from public.obra_costo_real where obra_id = $1', [hija])
      const madreAntes = await uno('select costo_real from public.obra_costo_real where obra_id = $1', [madre])
      await q(`insert into public.costos_obra (obra_texto, total, origen, referencia_externa, area, destino, obra_id)
               values ('LA ESTRELLA', 1234.56, 'zz-test', 'zz-test-obra-id', 'obras', 'obra', $1)`, [hija])
      const despues = await uno('select costo_real, n_comprobantes from public.obra_costo_real where obra_id = $1', [hija])
      const madreDespues = await uno('select costo_real from public.obra_costo_real where obra_id = $1', [madre])
      assert.ok(Math.abs(Number(despues.costo_real) - Number(antes.costo_real) - 1234.56) < 0.01, 'la compra no pesó en la obra de su obra_id')
      assert.equal(despues.n_comprobantes - antes.n_comprobantes, 1)
      assert.equal(Number(madreDespues.costo_real), Number(madreAntes.costo_real), 'la compra pesó en la obra del texto, no en la de la columna Obra')
      // Y sin obra_id, en nadie: ni con destino obra ni con texto de obra.
      const total = await uno('select sum(costo_real) as t from public.obra_costo_real')
      await q(`insert into public.costos_obra (obra_texto, total, origen, referencia_externa, area, destino, obra_id)
               values ('LA ESTRELLA', 999, 'zz-test', 'zz-test-sin-obra', 'obras', 'obra', null)`)
      assert.equal(Number((await uno('select sum(costo_real) as t from public.obra_costo_real')).t), Number(total.t))
    })

    await t.test('la RPC cambia la obra y costos_obra, compra_obra_asignada y la vista lo dicen en la misma transacción', async () => {
      const fila = await uno(`
        select cs.fila, cs.obra_celda, cs.obra_id, cs.total, coalesce(cs.sheet_id::text, cs.fila::text) as ref
          from public.compra_sheet cs
         where cs.destino = 'obra' and cs.obra_id is not null and cs.total > 0 and not cs.anulada
           and exists (select 1 from public.costos_obra c where c.referencia_externa = coalesce(cs.sheet_id::text, cs.fila::text))
           and exists (select 1 from public.compra_obra_asignada a where a.referencia = coalesce(cs.sheet_id::text, cs.fila::text))
         limit 1`)
      if (!fila) return t.diagnostic('ninguna fila con columna Obra y espejo: la RPC no se puede ejercer en esta base')
      const destino = await uno(`
        select id, btrim(codigo) || ' · ' || btrim(nombre) as rotulo from public.obra_canonica
         where fusionada_en is null and btrim(codigo) ~* '^OB-' and id <> $1 and btrim(coalesce(nombre, '')) <> '' limit 1`, [fila.obra_id])
      const dir = await uno(`select id from public.perfiles where rol = 'direccion' limit 1`)
      await sesion(dir.id)
      const antes = await uno('select costo_real from public.obra_costo_real where obra_id = $1', [destino.id])

      const r1 = (await uno('select public.compra_obra_asignar($1, $2, $3) as r', [fila.fila, destino.rotulo, fila.obra_celda])).r
      assert.equal(r1.ok, true, r1.error)
      const costo = await uno('select destino, obra_id from public.costos_obra where referencia_externa = $1', [fila.ref])
      assert.deepEqual(costo, { destino: 'obra', obra_id: destino.id }, 'costos_obra no cambió con la RPC')
      const asig = await uno('select obra_id, via, cliente, porque from public.compra_obra_asignada where referencia = $1', [fila.ref])
      assert.equal(asig.obra_id, destino.id)
      assert.equal(asig.via, 'obra_de_la_fila')
      assert.ok(asig.cliente, 'obra_de_la_fila lleva cliente (CHECK cliente_coherente)')
      assert.equal(asig.porque, `columna Obra «${destino.rotulo}»`)
      const despues = await uno('select costo_real from public.obra_costo_real where obra_id = $1', [destino.id])
      assert.equal(Number(despues.costo_real) - Number(antes.costo_real), Number(fila.total), 'la vista no movió el costo al instante')

      const r2 = (await uno('select public.compra_obra_asignar($1, $2, $3) as r', [fila.fila, ES_ADM, destino.rotulo])).r
      assert.equal(r2.ok, true, r2.error)
      assert.deepEqual(await uno('select destino, obra_id from public.costos_obra where referencia_externa = $1', [fila.ref]),
        { destino: 'estructura_admin', obra_id: null })
      assert.deepEqual(await uno('select obra_id, via, cliente from public.compra_obra_asignada where referencia = $1', [fila.ref]),
        { obra_id: null, via: 'estructura_de_la_fila', cliente: null })
      assert.equal(Number((await uno('select costo_real from public.obra_costo_real where obra_id = $1', [destino.id])).costo_real), Number(antes.costo_real))

      const r3 = (await uno('select public.compra_obra_asignar($1, $2, $3) as r', [fila.fila, '', ES_ADM])).r
      assert.equal(r3.ok, true, r3.error)
      assert.deepEqual(await uno('select destino, obra_id from public.costos_obra where referencia_externa = $1', [fila.ref]),
        { destino: null, obra_id: null })
      const vacia = await uno('select obra_id, via, cliente from public.compra_obra_asignada where referencia = $1', [fila.ref])
      assert.equal(vacia.obra_id, null, 'vaciar la celda no puede dejar una obra puesta')
      assert.ok(['sin_obra', 'no_es_cliente'].includes(vacia.via))
      assert.equal(vacia.cliente === null, vacia.via === 'no_es_cliente')
      await sesion(null)
    })

    await t.test('las auxiliares no las ejecuta authenticated y las vistas corren con invoker', async () => {
      const fn = await q(`
        select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as ok
          from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('compra_costo_por_obra_actualizar', 'cliente_canonico_de')`)
      assert.equal(fn.length, 2)
      assert.ok(fn.every((f) => f.ok === false), 'una auxiliar quedó ejecutable por authenticated')
      const vistas = await q(`select relname, reloptions from pg_class where relname in ('obra_costo_real', 'proveedor_compra')`)
      assert.equal(vistas.length, 2)
      for (const v of vistas) assert.ok((v.reloptions ?? []).includes('security_invoker=true'), `${v.relname} perdió el invoker`)
      const cols = await q(`select column_name from information_schema.columns where table_name = 'proveedor_compra' order by ordinal_position`)
      assert.deepEqual(cols.slice(-5).map((x) => x.column_name), ['destino', 'obra_id', 'obra_celda', 'obra_inconsistencia', 'sheet_id'])
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
