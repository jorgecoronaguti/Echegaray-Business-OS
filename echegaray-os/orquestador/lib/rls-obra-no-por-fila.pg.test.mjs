// EL PORTERO DE OBRA NO PUEDE PREGUNTARLE A CADA FILA, Y `obra_panel` NO PUEDE SALTEAR EL RLS.
//
// ═══ LOS DOS DEFECTOS QUE ATRAPA, MEDIDOS EL 10/09/2026 ═══
//
// 1 · `20260910T1900` rehízo `obra_panel` con `create or replace view` sin repetir
//     `with (security_invoker = true)`. Postgres BORRA la opción, no la hereda: la vista pasó a
//     correr como su dueño y un perfil de rol `campo` leía las 24 obras de la cartera en vez de la
//     única que su asignación le habilita. `vistas-security-invoker.test.mjs` mira el catálogo;
//     este test mira el EFECTO — cuántas filas ve cada rol.
//
// 2 · `costos_obra_select` era `es_administracion() OR ve_obra_texto(obra_texto)`. El segundo
//     término recibe una COLUMNA, así que no puede ser un initplan: se ejecuta una vez por fila.
//     Medido con `explain (analyze)` como `campo`: 560,7 ms para 938 filas, 0,6 ms por fila. El
//     mismo predicado como pertenencia a un conjunto se evalúa una vez: 67 ms.
//
// ═══ POR QUÉ MIRA EL PLAN Y NO EL RELOJ ═══
//
// Un test de milisegundos contra una base compartida se pone rojo porque otro agente está
// corriendo, no porque el defecto volvió. Lo que no puede volver sin que esto grite es la FORMA:
// una función con una columna adentro del `Filter` de un `Seq Scan`. Eso es determinístico.
//
// ═══ EL CONTROL PUEDE DAR ROJO ═══
//
// El último subtest corre el MISMO detector contra `cliente_orden`, cuya policy sigue evaluando
// `ve_obra(obra_id)` por fila (declarado como pendiente en la migración). Si el detector fuera una
// constante que siempre dice «no hay función por fila», ahí se caería.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const migracion = (nombre) => readFileSync(
  join(import.meta.dirname, '..', '..', 'supabase', 'migrations', nombre), 'utf8')

const INVOKER = '20260911T0100_obra_panel_vuelve_a_correr_con_el_rls_de_quien_pregunta.sql'
const INITPLAN = '20260911T0110_el_rls_de_obra_deja_de_evaluarse_por_fila.sql'

/** Las funciones `security definer` del portero. Adentro de un `Filter` significa una por fila. */
const PORTEROS = /\b(ve_obra|ve_obra_texto|es_administracion|current_rol|mi_persona_id)\s*\(/

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('el RLS de obra se evalúa una vez, y obra_panel corta filas por RLS', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  /** El `Filter` de cada nodo del plan, sin las líneas que no filtran. */
  const filtros = async (sql) => (await q(`explain (analyze, costs off) ${sql}`))
    .map((r) => r['QUERY PLAN']).filter((l) => /Filter:/.test(l)).join('\n')
  /**
   * ═══ SIN `set role authenticated` ESTE TEST NO MIDE NADA ═══
   *
   * La conexión entra como `postgres`, que es el DUEÑO de las tablas: Postgres no le aplica RLS a
   * su dueño. Poner sólo el JWT deja la sesión sin portero, el plan sale sin un solo `Filter` de
   * policy y el control diría verde mirando el vacío. Se cambia el rol de verdad, como la app.
   */
  const como = async (rol) => {
    const p = (await q(`select id from public.perfiles where rol=$1 limit 1`, [rol]))[0]
    assert.ok(p, `no hay ningún perfil de rol ${rol}: sin él este control no mira nada`)
    await c.query('set local role authenticated')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: p.id, role: 'authenticated' })])
  }
  const comoUsuario = async (id) => {
    await c.query('set local role authenticated')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: id, role: 'authenticated' })])
  }
  /** Vuelve a `postgres`: el DDL y las lecturas sin portero se hacen fuera del rol de la app. */
  const comoDueno = () => c.query('reset role')
  try {
    await c.query('begin')
    // EL MISMO NÚMERO QUE EL RESTO DE LOS `.pg.test.mjs`, no uno propio: este test hace DDL
    // (`drop policy` / `create policy`) dentro de su transacción, y con un lock distinto correría
    // en paralelo con los otros y se trabarían entre ellos. Ya pasó al medir: `deadlock detected`.
    // Y el `lock_timeout` está para fallar rápido si el lock lo tiene otro agente, no para colgar
    // la suite.
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query("set local lock_timeout = '15s'")

    // ═══ LA MIGRACIÓN SE APLICA ACÁ SI LA BASE TODAVÍA NO LA TIENE, Y SE VA CON EL ROLLBACK ═══
    // Ningún agente aplica migraciones en producción. El test necesita el estado corregido para
    // poder afirmar algo sobre él, así que lo construye dentro de su propia transacción.
    const tieneInvoker = async () => (await q(`select coalesce(array_to_string(c.reloptions,','),'') o
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='obra_panel'`))[0].o.includes('security_invoker=true')
    const yaEstaba = await tieneInvoker()
    if (!yaEstaba) await c.query(migracion(INVOKER))
    assert.ok(await tieneInvoker(), 'obra_panel sigue sin security_invoker después de aplicar la migración')
    if (!(await q(`select 1 v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='mis_obras'`))[0]) {
      await c.query(migracion(INITPLAN))
    }

    await t.test('obra_panel le muestra a campo sus obras y a Dirección la cartera', async () => {
      await como('direccion')
      const todas = Number((await q('select count(*) n from public.obra_panel'))[0].n)
      assert.ok(todas > 1, `Dirección ve ${todas} obras: con una sola este control no distingue nada`)
      await como('campo')
      const suyas = Number((await q('select count(*) n from public.obra_panel'))[0].n)
      assert.ok(suyas < todas,
        `campo ve las ${suyas} obras de la cartera entera: obra_panel está salteando el RLS de obra_canonica`)
      await comoDueno()
    })

    await t.test('el Filter de costos_obra no llama al portero por fila', async () => {
      await como('campo')
      const f = await filtros('select count(*) from public.costos_obra')
      assert.ok(f.length > 0, 'costos_obra se leyó sin ningún Filter: la RLS no se aplicó y el control no midió nada')
      assert.doesNotMatch(f, PORTEROS,
        `costos_obra vuelve a evaluar el portero por fila:\n${f}`)
      await comoDueno()
    })

    await t.test('el Filter de obra_canonica y de asistencia_dia tampoco', async () => {
      await como('campo')
      for (const tabla of ['obra_canonica', 'asistencia_dia', 'asistencia_dia_retiro', 'obra_restriccion']) {
        const f = await filtros(`select count(*) from public.${tabla}`)
        assert.doesNotMatch(f, PORTEROS, `${tabla} evalúa el portero por fila:\n${f}`)
      }
      await comoDueno()
    })

    await t.test('mis_alias_de_obra decide lo mismo que ve_obra_texto', async () => {
      // La equivalencia se prueba con una asignación VIGENTE a una obra QUE TIENE COSTOS: con una
      // obra sin comprobantes los dos predicados darían cero y el control no compararía nada.
      const conCostos = (await q(`select obra_id from public.obra_costo_real
                                   order by n_comprobantes desc limit 1`))[0].obra_id
      const persona = (await q(`select persona_id p, id u from public.perfiles
                                 where rol='campo' and persona_id is not null limit 1`))[0]
      assert.ok(persona, 'ningún perfil de campo tiene persona vinculada: sin eso no hay rama no-administración')
      await c.query(`insert into public.obra_asignacion (persona_id, obra_id, desde)
                     values ($1,$2,current_date - 1) on conflict do nothing`, [persona.p, conCostos])
      // ═══ LOS TEXTOS SE COPIAN SIN PORTERO, A PROPÓSITO ═══
      // Comparar los dos predicados sobre `costos_obra` leída CON la policy vieja es validar el
      // control contra la información que el propio control produce: las filas que la policy vieja
      // no dejó pasar no estarían ahí para desmentirla. Se copia el universo entero como dueño.
      await c.query('create temp table costos_texto as select obra_texto from public.costos_obra')
      await c.query('grant select on costos_texto to authenticated')
      await comoUsuario(persona.u)
      const [r] = await q(`select
          count(*) filter (where public.ve_obra_texto(obra_texto))                                    viejo,
          count(*) filter (where public.norm_obra(obra_texto) in (select public.mis_alias_de_obra()))  nuevo,
          count(*) filter (where public.ve_obra_texto(obra_texto)
                             <> (public.norm_obra(obra_texto) in (select public.mis_alias_de_obra()))) difieren
        from pg_temp.costos_texto`)
      assert.ok(Number(r.viejo) > 0,
        `ve_obra_texto no dejó pasar ninguna fila de ${conCostos}: la comparación sería 0 = 0`)
      assert.equal(Number(r.difieren), 0,
        `${r.difieren} filas de costos_obra cambian de visibilidad con el predicado nuevo`)
      assert.equal(Number(r.nuevo), Number(r.viejo))
      await comoDueno()
    })

    await t.test('el detector puede dar rojo: cliente_orden todavía pregunta por fila', async () => {
      // No es un hallazgo nuevo: está declarado como pendiente en la migración. Está acá para
      // probar que `PORTEROS` encuentra el defecto cuando el defecto existe.
      await como('jefe_obra')
      const f = await filtros('select count(*) from public.cliente_orden')
      assert.match(f, PORTEROS,
        'cliente_orden dejó de evaluar el portero por fila: si se arregló, sacarlo de acá y de la '
        + 'lista de pendientes de la migración 20260911T0110 — este subtest ya no prueba nada')
      await comoDueno()
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
