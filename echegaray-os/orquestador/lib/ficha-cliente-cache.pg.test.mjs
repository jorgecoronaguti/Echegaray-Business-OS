// LA FICHA DEL CLIENTE DESDE LA CACHÉ DICE LO MISMO QUE EL CÁLCULO EN VIVO — contra la base real.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE LA CACHÉ SIRVA OTRO JSON QUE EL CÁLCULO. Para cada cliente × solapa, el md5 de lo que
//      Dirección recibe desde la caché (sin `cache_calculado_en`) es IDÉNTICO al de la RPC ANTERIOR a la
//      migración, perfil incluido. Si el refresco calculara como `postgres` (BYPASSRLS) en vez de con
//      `set local role authenticated`, o si la clave `perfil` se guardara en vez de inyectarse, se
//      pone rojo.
//  2 · QUE EL CUERPO SE HAYA ALTERADO AL RENOMBRARLO. `pantalla_cliente_en_vivo` tiene que devolver lo
//      mismo que la RPC vieja para cada rol: la copia se hizo con `pg_get_functiondef`.
//  3 · QUE LA CACHÉ SE LE SIRVA A QUIEN NO CORRESPONDE. Jefe de obra, QA Campo y la identidad de prueba
//      de Dirección reciben el cálculo en vivo (sin `cache_calculado_en`) y el md5 de siempre: su RLS
//      sigue decidiendo.
//  4 · QUE UNA FILA VENCIDA O INVALIDADA SE SIGA SIRVIENDO, y que alguien sin `es_administracion()`
//      pueda invalidar.
//  5 · QUE LA TABLA SE PUEDA LEER POR POSTGREST: `authenticated` no tiene ningún permiso sobre ella.
//
// ═══ POR QUÉ PIDE `ORQ_PG_DDL=1` ═══
//
// Aplica la migración DENTRO de una transacción que termina en ROLLBACK. El DDL dispara
// `pgrst_ddl_watch` igual —cada recarga de esquema frena ~1,5 s a quien esté usando la app— y el
// cálculo en vivo de 30 combinaciones por cuatro identidades pesa sobre una instancia chica. No corre
// solo:
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

const conDDL = process.env.ORQ_PG_DDL === '1'

async function como(c, uid) {
  await c.query('reset role')
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })])
  await c.query('set local role authenticated')
}

/** md5 de la respuesta sin la marca de caché, y si la marca vino. */
async function leer(c, slug, solapa, fn = 'pantalla_cliente') {
  const { rows } = await c.query(
    `with x as (select public.${fn}($1, $2) j)
     select md5((j - 'cache_calculado_en')::text) h, j ? 'cache_calculado_en' desde_cache from x`,
    [slug, solapa])
  return rows[0]
}

test('la ficha desde la caché es la del cálculo en vivo, y sólo la recibe Dirección',
  { skip: !conDDL && 'aplica DDL en una transacción con rollback: correr con ORQ_PG_DDL=1' }, async (t) => {
    const c = await getPool().connect()
    try {
      await c.query('begin')
      await c.query(`set local statement_timeout = '150s'`)
      const { rows: clientes } = await c.query('select id, slug from public.clientes order by slug')
      assert.ok(clientes.length > 0, 'no hay clientes: el test no mediría nada')
      const { rows: perfiles } = await c.query('select id from public.perfiles where id = any($1)',
        [[DIRECCION, ...Object.values(OTROS)]])
      assert.equal(perfiles.length, 4, 'falta alguno de los perfiles fijados: actualizá los ids')

      // ── ANTES: la RPC tal como está en la base ─────────────────────────────────────────────────
      const antes = {}
      for (const uid of [DIRECCION, ...Object.values(OTROS)]) {
        await como(c, uid)
        for (const { slug } of clientes) {
          for (const s of SOLAPAS) antes[`${uid}|${slug}|${s}`] = (await leer(c, slug, s)).h
        }
      }

      await c.query('reset role')
      await c.query(MIGRACION)
      for (const { slug } of clientes) {
        const { rows } = await c.query('select public.refrescar_ficha_cliente_cache($1) n', [slug])
        assert.equal(rows[0].n, SOLAPAS.length, `el refresco de ${slug} no guardó sus ${SOLAPAS.length} solapas`)
      }

      await t.test('el cuerpo renombrado devuelve lo mismo que la RPC anterior, para cada rol', async () => {
        for (const uid of [DIRECCION, ...Object.values(OTROS)]) {
          await como(c, uid)
          for (const { slug } of clientes) {
            for (const s of SOLAPAS) {
              assert.equal((await leer(c, slug, s, 'pantalla_cliente_en_vivo')).h, antes[`${uid}|${slug}|${s}`],
                `pantalla_cliente_en_vivo(${slug}, ${s}) difiere de la RPC anterior para ${uid}`)
            }
          }
        }
      })

      await t.test('Dirección recibe la caché, byte a byte igual al cálculo anterior', async () => {
        await como(c, DIRECCION)
        for (const { slug } of clientes) {
          for (const s of SOLAPAS) {
            const r = await leer(c, slug, s)
            assert.equal(r.desde_cache, true, `${slug}/${s} no vino de la caché: el test no midió la caché`)
            assert.equal(r.h, antes[`${DIRECCION}|${slug}|${s}`], `${slug}/${s}: la caché difiere del cálculo en vivo`)
          }
        }
        // La ficha entera no se guarda: sigue en vivo.
        assert.equal((await leer(c, clientes[0].slug, null)).desde_cache, false)
      })

      await t.test('jefe, campo y la identidad de prueba siguen en vivo, con su RLS', async () => {
        for (const [quien, uid] of Object.entries(OTROS)) {
          await como(c, uid)
          for (const { slug } of clientes) {
            for (const s of SOLAPAS) {
              const r = await leer(c, slug, s)
              assert.equal(r.desde_cache, false, `${quien} recibió la caché de Dirección en ${slug}/${s}`)
              assert.equal(r.h, antes[`${uid}|${slug}|${s}`], `${quien} ve otra cosa en ${slug}/${s}`)
            }
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
                        where slug = $1 and solapa = 'obras'`, [slug])
        await como(c, DIRECCION)
        assert.equal((await leer(c, slug, 'obras')).desde_cache, false)
        assert.equal((await leer(c, slug, 'ordenes')).desde_cache, true, 'la vencida arrastró a las demás')
      })

      await t.test('invalidar exige es_administracion y borra sólo ese cliente', async () => {
        const [uno, ...resto] = clientes
        await como(c, OTROS.campo)
        await c.query('select public.invalidar_ficha_cliente_cache($1)', [uno.id])
        await como(c, DIRECCION)
        assert.equal((await leer(c, uno.slug, 'ordenes')).desde_cache, true, 'campo pudo invalidar')

        await c.query('select public.invalidar_ficha_cliente_cache($1)', [uno.id])
        assert.equal((await leer(c, uno.slug, 'ordenes')).desde_cache, false, 'la invalidación no borró')
        if (resto.length) {
          assert.equal((await leer(c, resto[0].slug, 'ordenes')).desde_cache, true, 'invalidó otro cliente')
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
