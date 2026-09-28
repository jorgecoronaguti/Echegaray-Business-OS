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
//  5 · QUE SIN NINGÚN CAMBIO EL CRON SIGA RECALCULANDO TODO: recién poblada, una corrida devuelve 0.
//  6 · QUE UNA SINCRONIZACIÓN QUE NO CAMBIA NADA INVALIDE (el rechazo del 28/09): `compra_sheet`,
//      `costos_obra` y `cobranzas` se borran y reinsertan idénticas, `obra_papel` se rehace,
//      `jornales_bloque_persona` y `obra_economia_sheet` sólo mueven el sello — la caché queda con
//      todas sus filas. Y la contracara: un cambio REAL en una cobranza invalida sólo a su cliente, y
//      mover un límite de quincena invalida los desgloses de horas y no las fichas.
//  7 · QUE UN UPDATE QUE MUEVE LA FILA DE CLIENTE U OBRA INVALIDE SÓLO AL DUEÑO NUEVO (el viejo se
//      quedaría mostrando la fila que ya no es suya), y que un UPDATE sin cambios invalide algo.
//  8 · QUE EL VENCIMIENTO O LA VENTANA DE LECTURA VUELVAN ATRÁS: una fila de 50 min no se recalcula y
//      se sirve; una de vencimiento + 1 min se recalcula; la ventana no es infinita.
//  9 · QUE `authenticated` PUEDA VACIAR LA CACHÉ POR RPC, o que una función de trigger corra sin
//      SECURITY DEFINER / `search_path` fijo.
//
// El trigger de huella es DIFERIDO (corre al commit). Como el test termina en ROLLBACK, `alCommit`
// lo dispara a mano con `set constraints ... immediate`, que ejecuta lo pendiente en ese momento.
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

/** Dispara el trigger diferido de huella como si la transacción commiteara (el test hace ROLLBACK). */
async function alCommit(c) {
  await c.query('set constraints public.trg_ficha_inv_al_commit immediate')
  await c.query('set constraints public.trg_ficha_inv_al_commit deferred')
}

async function cuantas(c) {
  return Number((await c.query('select count(*) n from public.ficha_cliente_cache')).rows[0].n)
}

async function hayHH(c, obraId) {
  const { rows } = await c.query(
    `select 1 from public.ficha_cliente_cache where rpc = 'hh_de_obra' and clave = $1`, [obraId])
  return rows.length === 1
}

/** Lo que hace una sincronización: borra y reinserta las mismas filas (con ids y sellos nuevos). */
async function reescribir(c, tabla, filtro) {
  const { rows } = await c.query(
    `select string_agg(quote_ident(column_name), ',' order by ordinal_position) cols
       from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name not in ('id', 'sincronizado_en')`,
    [tabla])
  const cols = rows[0].cols
  await c.query(`drop table if exists _copia; create temp table _copia as select ${cols} from public.${tabla} where ${filtro}`)
  await c.query(`delete from public.${tabla} where ${filtro}`)
  await c.query(`insert into public.${tabla} (${cols}) select ${cols} from _copia`)
}

test('escribir una tabla fuente invalida su caché al toque, no al vencer',
  { skip: !conDDL && 'aplica DDL en una transacción con rollback: correr con ORQ_PG_DDL=1' }, async (t) => {
    const c = await getPool().connect()
    try {
      await c.query('begin')
      // EL TURNO COMÚN de los tests con DDL (ddl-de-un-test-pide-turno.test.mjs): un número propio
      // sería otra cola, y esta migración toma lock sobre 23 tablas que leen los demás.
      await c.query('select pg_advisory_xact_lock(20260822)')
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
          await alCommit(c)
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

      await t.test('una sincronización que no cambia nada deja la caché intacta', async () => {
        await poblarTodo(c)
        const base = await cuantas(c)
        await reescribir(c, 'compra_sheet', 'true')
        await reescribir(c, 'costos_obra', "origen = 'compras_sheet'")
        await alCommit(c)
        assert.equal(await cuantas(c), base, 'sync-compras sin cambios invalidó filas de la caché')
        await reescribir(c, 'cobranzas', "origen = 'cobranzas_sheet'")
        await alCommit(c)
        assert.equal(await cuantas(c), base, 'sync-cobranzas sin cambios invalidó filas de la caché')
        await c.query('select public.refrescar_obra_papel()')
        await c.query('update public.jornales_bloque_persona set leido_en = now()')
        await c.query('update public.obra_economia_sheet set leido_en = now()')
        await alCommit(c)
        assert.equal(await cuantas(c), base, 'rehacer obra_papel o mover sólo el sello invalidó filas')
      })

      await t.test('un cambio real en una cobranza invalida sólo a su cliente', async () => {
        const { rows: cob } = await c.query(
          `select b.id, k.slug from public.cobranzas b join public.clientes k on k.id = b.cliente_id
            where b.obra_id is null limit 1`)
        if (!cob.length) { t.skip('no hay cobranza con cliente y sin obra'); return }
        await poblarTodo(c)
        const base = await cuantas(c)
        await c.query('update public.cobranzas set total_bruto = total_bruto + 1 where id = $1', [cob[0].id])
        await alCommit(c)
        assert.equal((await filasDe(c, cob[0].slug)).length, 0, 'el cliente de la cobranza cambiada debía quedar invalidado')
        assert.equal(await cuantas(c), base - 6, 'invalidó más que las 6 solapas del cliente')
      })

      await t.test('mover un límite de quincena invalida los desgloses de horas, no las fichas', async () => {
        await poblarTodo(c)
        const fichas = (await c.query(`select count(*) n from public.ficha_cliente_cache where rpc = 'pantalla_cliente'`)).rows[0].n
        await c.query(`update public.jornales_bloque_persona set quincena_hasta = quincena_hasta + 1
                        where id = (select id from public.jornales_bloque_persona limit 1)`)
        await alCommit(c)
        assert.equal(await hayHH(c, obra.id), false, 'el desglose de horas debía quedar invalidado')
        const { rows } = await c.query(`select count(*) n from public.ficha_cliente_cache where rpc = 'pantalla_cliente'`)
        assert.equal(rows[0].n, fichas, 'un límite de quincena no cambia la ficha del cliente')
      })

      await t.test('un UPDATE que mueve la fila de cliente invalida al viejo Y al nuevo; uno sin cambios, a nadie',
        async () => {
          const archivo = 'ensayo-inv-' + Date.now()
          await c.query(`insert into public.cliente_documento (cliente_id, drive_file_id, rol, origen)
                         values ($1, $2, 'ensayo', 'manual')`, [uno.id, archivo])
          await poblarTodo(c)
          const base = await cuantas(c)
          await c.query('update public.cliente_documento set rol = rol where drive_file_id = $1', [archivo])
          assert.equal(await cuantas(c), base, 'un UPDATE que no cambia nada invalidó la caché')
          await c.query('update public.cliente_documento set cliente_id = $2 where drive_file_id = $1', [archivo, otro.id])
          assert.equal((await filasDe(c, uno.slug)).length, 0, 'el dueño VIEJO (OLD) debía quedar invalidado')
          assert.equal((await filasDe(c, otro.slug)).length, 0, 'el dueño NUEVO (NEW) debía quedar invalidado')
        })

      await t.test('un UPDATE que mueve horas de obra invalida el desglose de las DOS obras', async () => {
        const { rows: persona } = await c.query('select id from public.personas limit 1')
        const otraObra = obras.find((o) => o.id !== obra.id)
        if (!persona.length || !otraObra) { t.skip('hacen falta una persona y dos obras con cliente'); return }
        const { rows: reg } = await c.query(
          `insert into public.registros_hh (obra_canonica_id, persona_id, fecha, horas, tipo_hora, fuente_legacy)
           values ($1, $2, date '2001-01-02', 0.01, 'normal', 'ensayo-inv') returning id`, [obra.id, persona[0].id])
        await poblarTodo(c)
        assert.ok(await hayHH(c, obra.id) && await hayHH(c, otraObra.id), 'setup: las dos obras cacheadas')
        await c.query('update public.registros_hh set obra_canonica_id = $2 where id = $1', [reg[0].id, otraObra.id])
        assert.equal(await hayHH(c, obra.id), false, 'la obra VIEJA (OLD) debía quedar invalidada')
        assert.equal(await hayHH(c, otraObra.id), false, 'la obra NUEVA (NEW) debía quedar invalidada')
      })

      await t.test('el vencimiento es de 60 min y la ventana de lectura lo acompaña', async () => {
        await poblarTodo(c)
        const fila = [`update public.ficha_cliente_cache set calculado_en = `,
          ` where rpc = 'pantalla_cliente' and clave = '${uno.slug}' and solapa = 'obras'`]
        const recalcula = async (edad) => {
          await c.query(`${fila[0]}clock_timestamp() - ${edad}${fila[1]}`)
          return (await c.query('select public.refrescar_ficha_cliente_cache() n')).rows[0].n
        }
        assert.equal(await recalcula(`interval '50 minutes'`), 0, 'recalculó una fila de 50 min: el vencimiento volvió atrás')
        assert.equal(await recalcula(`(public.ficha_cliente_cache_vigencia() + interval '1 minute')`), 1,
          'una fila vencida debía recalcularse')
        const { rows: dir } = await c.query(`select id from public.perfiles where rol = 'direccion' and es_prueba = false
                                              order by created_at, id limit 1`)
        const sirve = async (edad) => {
          await c.query('reset role')
          await c.query(`${fila[0]}now() - ${edad}${fila[1]}`)
          await c.query(`select set_config('request.jwt.claims', $1, true)`,
            [JSON.stringify({ sub: dir[0].id, role: 'authenticated' })])
          await c.query('set local role authenticated')
          const { rows } = await c.query(
            `select public.ficha_cliente_cache_leer('pantalla_cliente', $1, 'obras') is not null s`, [uno.slug])
          await c.query('reset role')
          return rows[0].s
        }
        assert.equal(await sirve(`interval '50 minutes'`), true, 'no sirvió una fila de 50 min: la ventana volvió a 10 min')
        assert.equal(await sirve(`(public.ficha_cliente_cache_vigencia() + interval '5 minutes')`), true,
          'la ventana de lectura debe cubrir el vencimiento más lo que tarda el cron en reponer')
        assert.equal(await sirve(`interval '6 hours'`), false, 'sirvió una fila de 6 h: la ventana no tiene techo')
      })

      await t.test('nadie invalida por RPC y los triggers son SECURITY DEFINER con search_path fijo', async () => {
        const firma = 'public.ficha_cliente_cache_invalidar_lote(uuid[], text[], boolean, boolean)'
        for (const rol of ['authenticated', 'anon', 'public']) {
          const { rows } = await c.query(`select has_function_privilege($1, $2, 'execute') p`, [rol, firma])
          assert.equal(rows[0].p, false, `${rol} puede vaciar la caché por RPC`)
        }
        const { rows } = await c.query(
          `select distinct p.proname, p.prosecdef, p.proconfig from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where t.tgname like 'trg_ficha_inv%'`)
        assert.ok(rows.length >= 3, 'faltan las funciones de trigger')
        for (const f of rows) {
          assert.equal(f.prosecdef, true, `${f.proname} no es SECURITY DEFINER`)
          assert.ok((f.proconfig ?? []).some((x) => x.startsWith('search_path=')), `${f.proname} sin search_path fijo`)
        }
      })
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
      await getPool().end().catch(() => {})
    }
  })
