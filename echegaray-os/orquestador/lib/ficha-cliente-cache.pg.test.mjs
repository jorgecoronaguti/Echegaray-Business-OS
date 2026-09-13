// LA FICHA DEL CLIENTE Y EL DESGLOSE DE HORAS DESDE LA CACHÉ DICEN LO MISMO QUE EL CÁLCULO EN VIVO
// — contra la base real.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE LA CACHÉ SIRVA OTRO JSON QUE EL CÁLCULO. Para cada cliente × cara y cada obra, el md5 de lo
//      que Dirección recibe desde la caché (sin `cache_calculado_en`) es IDÉNTICO al de la RPC ANTERIOR
//      a la migración, perfil incluido. Si el refresco calculara como `postgres` (BYPASSRLS) o con la
//      escapatoria `auth.uid() is null` de los porteros en vez de con `set local role authenticated` y
//      un uid de Dirección, o si la clave `perfil` se guardara en vez de inyectarse, se pone rojo.
//  2 · QUE LOS CUERPOS SE HAYAN ALTERADO AL RENOMBRARLOS. `*_en_vivo` devuelven lo mismo que las RPC
//      viejas para cada rol.
//  3 · QUE LA CACHÉ SE LE SIRVA A QUIEN NO CORRESPONDE. Jefe de obra, QA Campo y la identidad de prueba
//      de Dirección reciben el cálculo en vivo (sin `cache_calculado_en`) y el md5 de siempre.
//  4 · QUE UNA FILA VENCIDA O INVALIDADA SE SIGA SIRVIENDO, que alguien sin `es_administracion()`
//      pueda invalidar, o que invalidar un cliente no alcance el desglose de sus obras.
//  5 · QUE LA TABLA SE PUEDA LEER POR POSTGREST: `authenticated` no tiene ningún permiso sobre ella.
//
// ═══ POR QUÉ PIDE `ORQ_PG_DDL=1` ═══
//
// Aplica la migración DENTRO de una transacción que termina en ROLLBACK. El DDL dispara
// `pgrst_ddl_watch` igual —cada recarga de esquema frena ~1,5 s a quien esté usando la app— y el
// cálculo en vivo de ~50 combinaciones por cuatro identidades pesa sobre una instancia chica. No
// corre solo, y no se corre con la base cargada:
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/ficha-cliente-cache.pg.test.mjs
//
// LOS NÚMEROS NO SE CLAVAN: se comparan dos lecturas de la misma base en la misma transacción.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260913T1500_ficha_del_cliente_desde_cache.sql'), 'utf8')

const SOLAPAS = ['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos', 'actividad']
/** Perfiles reales (13/09/2026). Si alguno deja de existir, el test lo dice en vez de medir nada. */
const DIRECCION = '4677f284-d873-4531-9c8f-cc3dab56ffd0'
const OTROS = {
  jefe: 'd8d404e5-a111-487a-a599-0ccc121ea067',
  campo: 'cf0fb54c-5fc6-4107-981a-c7d7eb891c1d',
  direccionDePrueba: 'ede1fa51-517b-4f27-b6d9-09ce8a704aca',
}
const TODOS = [DIRECCION, ...Object.values(OTROS)]

const conDDL = process.env.ORQ_PG_DDL === '1'

async function como(c, uid) {
  await c.query('reset role')
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })])
  await c.query('set local role authenticated')
}

/** md5 de la respuesta sin la marca de caché, y si la marca vino. */
async function leer(c, fn, a, b) {
  const { rows } = await c.query(
    `with x as (select public.${fn}($1, $2) j)
     select md5((j - 'cache_calculado_en')::text) h, coalesce(j ? 'cache_calculado_en', false) desde_cache from x`,
    [a, b])
  return rows[0]
}

/** Las combinaciones que se cachean: [rpc, clave, argumento]. */
function combinaciones(clientes, obras) {
  return [
    ...clientes.flatMap(({ slug }) => SOLAPAS.map((s) => ['pantalla_cliente', slug, s])),
    ...obras.map(({ id }) => ['hh_de_obra', id, null]),
  ]
}

test('la ficha y el desglose desde la caché son los del cálculo en vivo, y sólo los recibe Dirección',
  { skip: !conDDL && 'aplica DDL en una transacción con rollback: correr con ORQ_PG_DDL=1' }, async (t) => {
    const c = await getPool().connect()
    try {
      await c.query('begin')
      await c.query(`set local statement_timeout = '150s'`)
      const { rows: clientes } = await c.query('select id, slug from public.clientes order by slug')
      const { rows: obras } = await c.query(
        'select o.id, o.cliente_id from public.obra_canonica o join public.clientes k on k.id = o.cliente_id order by o.id')
      assert.ok(clientes.length > 0 && obras.length > 0, 'sin clientes u obras el test no mediría nada')
      const { rows: perfiles } = await c.query('select id from public.perfiles where id = any($1)', [TODOS])
      assert.equal(perfiles.length, TODOS.length, 'falta alguno de los perfiles fijados: actualizá los ids')
      const combos = combinaciones(clientes, obras)

      // ── ANTES: las RPC tal como están en la base ────────────────────────────────────────────────
      const antes = {}
      for (const uid of TODOS) {
        await como(c, uid)
        for (const [rpc, clave, arg] of combos) antes[`${uid}|${rpc}|${clave}|${arg}`] = (await leer(c, rpc, clave, arg)).h
      }

      await c.query('reset role')
      await c.query(MIGRACION)
      for (const { slug } of clientes) {
        const { rows } = await c.query('select public.refrescar_ficha_cliente_cache($1) n', [slug])
        assert.ok(rows[0].n >= SOLAPAS.length, `el refresco de ${slug} guardó ${rows[0].n} filas`)
      }

      await t.test('los cuerpos renombrados devuelven lo mismo que las RPC anteriores, para cada rol', async () => {
        for (const uid of TODOS) {
          await como(c, uid)
          for (const [rpc, clave, arg] of combos) {
            assert.equal((await leer(c, `${rpc}_en_vivo`, clave, arg)).h, antes[`${uid}|${rpc}|${clave}|${arg}`],
              `${rpc}_en_vivo(${clave}, ${arg}) difiere de la RPC anterior para ${uid}`)
          }
        }
      })

      await t.test('Dirección recibe la caché, byte a byte igual al cálculo anterior', async () => {
        await como(c, DIRECCION)
        for (const [rpc, clave, arg] of combos) {
          const r = await leer(c, rpc, clave, arg)
          assert.equal(r.desde_cache, true, `${rpc} ${clave}/${arg} no vino de la caché: el test no midió la caché`)
          assert.equal(r.h, antes[`${DIRECCION}|${rpc}|${clave}|${arg}`], `${rpc} ${clave}/${arg}: la caché difiere`)
        }
        // La ficha entera y otra ventana del desglose no se guardan: siguen en vivo.
        assert.equal((await leer(c, 'pantalla_cliente', clientes[0].slug, null)).desde_cache, false)
        assert.equal((await leer(c, 'hh_de_obra', obras[0].id, '2026-01-01')).desde_cache, false)
      })

      await t.test('jefe, campo y la identidad de prueba siguen en vivo, con su RLS', async () => {
        for (const [quien, uid] of Object.entries(OTROS)) {
          await como(c, uid)
          for (const [rpc, clave, arg] of combos) {
            const r = await leer(c, rpc, clave, arg)
            assert.equal(r.desde_cache, false, `${quien} recibió la caché de Dirección en ${rpc} ${clave}/${arg}`)
            assert.equal(r.h, antes[`${uid}|${rpc}|${clave}|${arg}`], `${quien} ve otra cosa en ${rpc} ${clave}/${arg}`)
          }
        }
      })

      await t.test('authenticated no puede leer la tabla por su cuenta', async () => {
        await como(c, DIRECCION)
        await c.query('savepoint lectura')
        await assert.rejects(c.query('select count(*) from public.ficha_cliente_cache'), /permission denied/)
        await c.query('rollback to savepoint lectura')
      })

      await t.test('una fila vencida no se sirve', async () => {
        const { slug } = clientes[0]
        await c.query('reset role')
        await c.query(`update public.ficha_cliente_cache set calculado_en = now() - interval '11 minutes'
                        where rpc = 'pantalla_cliente' and clave = $1 and solapa = 'obras'`, [slug])
        await como(c, DIRECCION)
        assert.equal((await leer(c, 'pantalla_cliente', slug, 'obras')).desde_cache, false)
        assert.equal((await leer(c, 'pantalla_cliente', slug, 'ordenes')).desde_cache, true, 'la vencida arrastró a las demás')
      })

      await t.test('invalidar exige es_administracion y borra ese cliente, con el desglose de sus obras', async () => {
        const obra = obras[0]
        const uno = clientes.find((k) => k.id === obra.cliente_id)
        const otro = clientes.find((k) => k.id !== obra.cliente_id)
        await como(c, OTROS.campo)
        await c.query('select public.invalidar_ficha_cliente_cache($1)', [uno.id])
        await como(c, DIRECCION)
        assert.equal((await leer(c, 'pantalla_cliente', uno.slug, 'ordenes')).desde_cache, true, 'campo pudo invalidar')

        await c.query('select public.invalidar_ficha_cliente_cache($1)', [uno.id])
        assert.equal((await leer(c, 'pantalla_cliente', uno.slug, 'ordenes')).desde_cache, false, 'no borró la ficha')
        assert.equal((await leer(c, 'hh_de_obra', obra.id, null)).desde_cache, false, 'no borró el desglose de su obra')
        if (otro) {
          assert.equal((await leer(c, 'pantalla_cliente', otro.slug, 'ordenes')).desde_cache, true, 'invalidó otro cliente')
        }
      })

      await t.test('el cron quedó programado', async () => {
        await c.query('reset role')
        const { rows } = await c.query(
          `select schedule from cron.job where jobname = 'refrescar_ficha_cliente_cache'`)
        assert.deepEqual(rows, [{ schedule: '* * * * *' }])
      })
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
      await getPool().end().catch(() => {})
    }
  })
