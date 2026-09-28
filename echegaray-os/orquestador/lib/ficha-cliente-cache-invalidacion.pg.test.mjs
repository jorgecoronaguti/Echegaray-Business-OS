// LA CACHÉ DE LA FICHA SE INVALIDA AL ESCRIBIR, NO SÓLO AL VENCER — contra la base real.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE ESCRIBIR UNA TABLA FUENTE NO INVALIDE NADA. Sin el trigger correspondiente (o si se lo
//      borra), la fila sigue en la caché después del `insert`/`update` y este test la encuentra ahí.
//  2 · QUE LA INVALIDACIÓN SEA MÁS ANCHA DE LO QUE DEBE (blanket disfrazado de scoped). Escribir el
//      documento de un cliente no puede tocar la caché de otro cliente: se verifica que la fila del
//      cliente NO tocado sigue viva.
//  3 · QUE `costos_obra` SE RESUELVA POR SU COLUMNA `obra_id` EN VEZ DE POR
//      `obra_alias.alias = norm_obra(obra_texto)` — el camino real de `pantalla_cliente_en_vivo`. Se
//      inserta una fila cuyo `obra_id` (FK válida) apunta a una obra DISTINTA de la que resuelve el
//      alias por texto: si el trigger mirara la columna, invalidaría el cliente equivocado y éste
//      quedaría sin tocar.
//  4 · QUE UN DELETE DE `obra_canonica` NO INVALIDE (la fila ya no está para hacer join al escribir el
//      after-trigger; tiene que resolver el cliente de la fila que se está borrando, no de una que ya
//      no existe).
//  5 · QUE SIN NINGÚN CAMBIO EL CRON SIGA RECALCULANDO TODO — el defecto que este trabajo vino a
//      arreglar: con la caché recién poblada y nada invalidado, una corrida tiene que devolver 0.
//
// ═══ POR QUÉ PIDE `ORQ_PG_DDL=1` ═══
//
// Aplica la migración 20260928T2330 dentro de una transacción que termina en ROLLBACK, igual que
// ficha-cliente-cache.pg.test.mjs (mismo motivo: el DDL dispara `pgrst_ddl_watch` sobre la base
// compartida). No corre solo, y no se corre con la base cargada:
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/ficha-cliente-cache-invalidacion.pg.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260928T2330_ficha_cache_invalidacion_por_trigger.sql'), 'utf8')

const conDDL = process.env.ORQ_PG_DDL === '1'

/** Puebla toda la caché (todos los clientes, un cliente a la vez) y confirma que quedó sin faltantes. */
async function poblarTodo(c) {
  const { rows: clientes } = await c.query('select slug from public.clientes')
  for (const { slug } of clientes) await c.query('select public.refrescar_ficha_cliente_cache($1)', [slug])
  for (let i = 0; i < 10; i++) {
    const { rows } = await c.query('select public.refrescar_ficha_cliente_cache() n')
    if (rows[0].n === 0) return
  }
  assert.fail('la caché no terminó de poblarse en 10 corridas: el test no mediría nada limpio')
}

async function filasDe(c, slug) {
  const { rows } = await c.query(
    `select solapa from public.ficha_cliente_cache where rpc = 'pantalla_cliente' and clave = $1`, [slug])
  return rows.map((r) => r.solapa).sort()
}

test('escribir una tabla fuente invalida su caché al toque, no al vencer',
  { skip: !conDDL && 'aplica DDL en una transacción con rollback: correr con ORQ_PG_DDL=1' }, async (t) => {
    const c = await getPool().connect()
    try {
      await c.query('begin')
      // Lock propio (distinto del de ficha-cliente-cache.pg.test.mjs) para no trabarse con esa corrida.
      await c.query('select pg_advisory_xact_lock(20260928)')
      await c.query(`set local statement_timeout = '150s'`)
      await c.query(MIGRACION)

      const { rows: clientes } = await c.query('select id, slug from public.clientes order by slug')
      const { rows: obras } = await c.query(
        'select o.id, o.cliente_id from public.obra_canonica o where o.cliente_id is not null order by o.id')
      assert.ok(clientes.length >= 2, 'hacen falta al menos dos clientes para probar que no es blanket')
      assert.ok(obras.length >= 1, 'hace falta al menos una obra con cliente')
      const [uno, otro] = clientes
      const obra = obras.find((o) => o.cliente_id === uno.id) ?? obras[0]
      const clienteDeLaObra = clientes.find((k) => k.id === obra.cliente_id)

      await t.test('recién poblada y sin cambios, el cron no recalcula nada', async () => {
        await poblarTodo(c)
        const { rows } = await c.query('select public.refrescar_ficha_cliente_cache() n')
        assert.equal(rows[0].n, 0, 'recalculó sin que nada haya cambiado: el vencimiento sigue siendo la vía principal')
      })

      await t.test('cliente_documento invalida SOLO la ficha del cliente escrito', async () => {
        await poblarTodo(c)
        assert.equal((await filasDe(c, otro.slug)).length, 6, 'setup: el otro cliente debía tener sus 6 solapas')
        await c.query(
          `insert into public.cliente_documento (cliente_id, drive_file_id, rol, origen)
           values ($1, 'ensayo-inv-'||gen_random_uuid()::text, 'ensayo', 'manual')`, [uno.id])
        assert.equal((await filasDe(c, uno.slug)).length, 0, 'el cliente escrito debía quedar sin caché')
        assert.equal((await filasDe(c, otro.slug)).length, 6, 'el trigger invalidó a un cliente que no escribieron')
        const { rows } = await c.query('select public.refrescar_ficha_cliente_cache() n')
        assert.equal(rows[0].n, 6, 'debía reponer las 6 solapas del cliente invalidado, ni más ni menos')
      })

      await t.test('registros_hh invalida el desglose de SU obra y la ficha de SU cliente', async () => {
        const { rows: persona } = await c.query('select id from public.personas limit 1')
        if (!persona.length) { t.skip('no hay personas en la base: no se puede insertar el registro'); return }
        await poblarTodo(c)
        const antesHH = await c.query(
          `select 1 from public.ficha_cliente_cache where rpc = 'hh_de_obra' and clave = $1`, [obra.id])
        assert.equal(antesHH.rows.length, 1, 'setup: la obra debía tener su desglose cacheado')
        await c.query(
          `insert into public.registros_hh (obra_canonica_id, persona_id, fecha, horas, tipo_hora, fuente_legacy)
           values ($1, $2, current_date, 0.01, 'normal', 'ensayo-inv')`, [obra.id, persona[0].id])
        const despHH = await c.query(
          `select 1 from public.ficha_cliente_cache where rpc = 'hh_de_obra' and clave = $1`, [obra.id])
        assert.equal(despHH.rows.length, 0, 'el desglose de horas de la obra debía quedar invalidado')
        assert.equal((await filasDe(c, clienteDeLaObra.slug)).length, 0,
          'la ficha del cliente dueño de la obra también debía quedar invalidada (muestra HH por obra)')
      })

      await t.test('costos_obra resuelve por obra_alias + norm_obra(obra_texto), NO por la columna obra_id',
        async () => {
          const { rows: alias } = await c.query('select alias, obra_id from public.obra_alias limit 1')
          if (!alias.length) { t.skip('no hay filas en obra_alias'); return }
          const { rows: obraDelAlias } = await c.query(
            'select cliente_id from public.obra_canonica where id = $1', [alias[0].obra_id])
          const laObraReal = clientes.find((k) => k.id === obraDelAlias[0]?.cliente_id)
          if (!laObraReal) { t.skip('el alias no resuelve a una obra con cliente'); return }
          // OTRA obra cualquiera (o null si no hay otra) como `obra_id` de la fila: si el trigger la
          // mirara en vez de resolver por texto, invalidaría el cliente equivocado (o ninguno) y este
          // assert de abajo (el cliente correcto SÍ invalidado) fallaría.
          const otraObra = obras.find((o) => o.id !== alias[0].obra_id)
          await poblarTodo(c)
          await c.query(
            `insert into public.costos_obra (obra_texto, obra_id, fecha, total, area)
             values ($1, $2, current_date, 1, null)`,
            [alias[0].alias, otraObra ? otraObra.id : null])
          assert.equal((await filasDe(c, laObraReal.slug)).length, 0,
            'el cliente que resuelve obra_alias/norm_obra(obra_texto) debía quedar invalidado')
        })

      await t.test('borrar una obra invalida a su cliente (no puede hacer join después de borrada)', async () => {
        const { rows: copia } = await c.query(
          `insert into public.obra_canonica (id, nombre, cliente_id, estado)
           select 'ensayo-inv-'||gen_random_uuid()::text, 'ensayo invalidación', $1, 'activa'
           returning id`, [uno.id])
        const idEnsayo = copia[0].id
        await poblarTodo(c)
        assert.equal((await filasDe(c, uno.slug)).length, 6, 'setup: el cliente debía tener sus 6 solapas')
        await c.query('delete from public.obra_canonica where id = $1', [idEnsayo])
        assert.equal((await filasDe(c, uno.slug)).length, 0,
          'borrar la obra debía invalidar al cliente dueño usando los datos de la fila borrada')
      })

      await t.test('perfiles (sin resolución barata) invalida TODA la caché, no sólo un cliente', async () => {
        await poblarTodo(c)
        const { rows: antes } = await c.query('select count(*) n from public.ficha_cliente_cache')
        assert.ok(Number(antes[0].n) > 0, 'setup: la caché debía estar poblada')
        const { rows: perfil } = await c.query('select id, updated_at from public.perfiles limit 1')
        await c.query('update public.perfiles set updated_at = now() where id = $1', [perfil[0].id])
        const { rows: despues } = await c.query('select count(*) n from public.ficha_cliente_cache')
        assert.equal(despues[0].n, '0', 'un cambio en perfiles debía vaciar toda la caché (blanket declarado)')
      })
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
      await getPool().end().catch(() => {})
    }
  })
