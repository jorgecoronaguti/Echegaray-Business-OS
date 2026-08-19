import { test } from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

// HH REAL SE DEFINE UNA SOLA VEZ — el canario de la segunda definición.
//
// El 19/08/2026, mientras `obra_actividad_hh` era la fuente declarada, `obra_hh_resumen` seguía
// sumando las mismas horas por la tabla `obras` LEGACY y alimentaba una alerta que corre a diario
// por `pg_cron`. Además convertía la ausencia en cero: «Galpones», sin una sola hora cargada,
// figuraba con 0 h reales y -100% de desvío.
//
// Estos tests no leen el .sql: preguntan por la BASE, que es donde el defecto vivía.

const SIN_BASE = !process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL && !process.env.ORQ_DATABASE_URL

test('no existe una segunda vista que sume `registros_hh` por fuera de la definición canónica',
  { skip: SIN_BASE }, async () => {
    const { rows } = await query(`
      select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and pg_get_viewdef(c.oid, true) ~ 'sum\\(\\s*registros_hh\\.horas'
       order by 1`)
    const nombres = rows.map((r) => r.relname)
    // `obra_actividad_hh` es la definición canónica; `obra_panel`/`obra_plan_vs_real` la agregan por
    // obra a partir de las mismas filas. Cualquier otra es una segunda verdad.
    const permitidas = new Set(['obra_actividad_hh', 'obra_panel', 'obra_plan_vs_real'])
    const intrusas = nombres.filter((n) => !permitidas.has(n))
    assert.deepEqual(intrusas, [],
      `estas vistas suman HH real por su cuenta: ${intrusas.join(', ')}`)
  })

test('la alerta de exceso de HH lee la fuente canónica, no la retirada',
  { skip: SIN_BASE }, async () => {
    const { rows } = await query(
      `select pg_get_functiondef(p.oid) as d from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'detectar_exceso_hh_obra'`)
    assert.equal(rows.length, 1, 'desapareció la función de detección de exceso de HH')
    assert.match(rows[0].d, /obra_plan_vs_real/, 'la alerta dejó de leer la fuente canónica')
    assert.doesNotMatch(rows[0].d, /obra_hh_resumen/, 'la alerta volvió a la definición retirada')
  })

test('ninguna obra sin horas cargadas publica un desvío de HH: la ausencia no es cero',
  { skip: SIN_BASE }, async () => {
    const { rows } = await query(
      `select nombre, hh_real, desvio_hh_pct from public.obra_plan_vs_real
        where hh_real is null and desvio_hh_pct is not null`)
    assert.deepEqual(rows, [],
      'hay obras sin HH imputadas que igual publican un desvío: el vacío se volvió cero')
  })

test('las horas legacy siguen fuera del cálculo por obra, persona y actividad',
  { skip: SIN_BASE }, async () => {
    const { rows: [l] } = await query(
      `select count(*)::int as n,
              count(*) filter (where obra_canonica_id is not null or persona_id is not null
                                  or actividad_id is not null)::int as imputadas
         from public.registros_hh where fuente_legacy = 'JORNALES'`)
    assert.equal(l.imputadas, 0,
      'alguien imputó horas legacy a una obra, persona o actividad sin evidencia determinística')
    assert.ok(l.n > 0, 'desaparecieron las filas legacy: tienen que quedar trazables, no borrarse')
  })
