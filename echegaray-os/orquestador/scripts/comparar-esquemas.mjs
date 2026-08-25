#!/usr/bin/env node
// COMPARA EL ESQUEMA DE PRODUCCIÓN CONTRA OTRA BASE (una reconstruida desde cero), EN SERIO.
//
//   node orquestador/scripts/comparar-esquemas.mjs --otro postgres://postgres:x@127.0.0.1:55452/postgres
//
// Nace del RECHAZO del auditor de reproducibilidad (22/08): el comparador original miraba nombres
// —función por su firma, vista por su nombre— y con eso un cuerpo distinto era invisible por
// construcción. Así pasó de largo que una regeneración había pisado las vistas de caja en
// producción ($95,3M de quincenas en el mes equivocado). Este comparador mira el CUERPO:
// md5 de prosrc, pg_get_viewdef, format_type con precisión, defaults, orden de columnas,
// triggers completos, secuencias, tipos, grants por columna, privilegios por defecto,
// comentarios, extensiones, esquemas y cron.
//
// SÓLO LEE en las dos puntas. Producción entra por db.mjs (DATABASE_URL del entorno del worker);
// la otra base, por --otro. La salida detallada queda junto al proceso en diff-esquemas.txt.
//
// Las diferencias CONOCIDAS Y ACEPTADAS se declaran acá, con su porqué — se restan del total y se
// listan aparte: una excepción silenciosa sería el mismo agujero que este script vino a cerrar.
import { writeFileSync } from 'node:fs'
import { getPool } from '../lib/db.mjs'
import pg from 'pg'

const E = `('public','orq','comunicacion','tesoreria')`
const Q = {
  tablas: `select schemaname||'.'||tablename from pg_tables where schemaname in ${E} order by 1`,
  columnas_full: `select c.table_schema||'.'||c.table_name||'.'||c.column_name
      ||' #'||c.ordinal_position
      ||' : '||format_type(a.atttypid, a.atttypmod)
      ||' null='||c.is_nullable
      ||' def='||coalesce(c.column_default,'-')
      ||' ident='||c.is_identity||' gen='||coalesce(c.generation_expression,'-')
    from information_schema.columns c
    join pg_class cl on cl.relname=c.table_name
    join pg_namespace n on n.oid=cl.relnamespace and n.nspname=c.table_schema
    join pg_attribute a on a.attrelid=cl.oid and a.attname=c.column_name
    where c.table_schema in ${E} order by 1`,
  constraints: `select c.conrelid::regclass::text||' · '||c.conname||' · '||pg_get_constraintdef(c.oid)
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ${E} order by 1`,
  indices: `select schemaname||'.'||tablename||' · '||indexname||' · '||indexdef
    from pg_indexes where schemaname in ${E} order by 1`,
  funciones_cuerpo: `select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
      ||' ret='||pg_get_function_result(p.oid)
      ||' vol='||p.provolatile::text||' secdef='||p.prosecdef||' lang='||l.lanname
      ||' md5='||md5(coalesce(p.prosrc,''))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang where n.nspname in ${E} order by 1`,
  vistas_def: `select c.relnamespace::regnamespace::text||'.'||c.relname||' md5='||md5(pg_get_viewdef(c.oid,true))
    from pg_class c where c.relkind in ('v','m') and c.relnamespace::regnamespace::text in ${E} order by 1`,
  triggers_def: `select c.relnamespace::regnamespace::text||'.'||c.relname||' · '||pg_get_triggerdef(t.oid,true)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.relnamespace::regnamespace::text in ${E} order by 1`,
  secuencias: `select schemaname||'.'||sequencename||' start='||start_value||' inc='||increment_by||' max='||coalesce(max_value::text,'-')||' cycle='||cycle
    from pg_sequences where schemaname in ${E} order by 1`,
  tipos: `select n.nspname||'.'||t.typname||' ['||t.typtype::text||'] '||coalesce(string_agg(e.enumlabel,',' order by e.enumsortorder),'-')
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    left join pg_enum e on e.enumtypid=t.oid
    where n.nspname in ${E} and t.typtype in ('e','d','c') and not exists (select 1 from pg_class c where c.oid=t.typrelid and c.relkind<>'c')
    group by n.nspname, t.typname, t.typtype order by 1`,
  rls_policies: `select schemaname||'.'||tablename||' · '||policyname||' · '||cmd||' · roles='||array_to_string(roles,',')||
      ' · using='||coalesce(qual,'-')||' · check='||coalesce(with_check,'-')
    from pg_policies where schemaname in ${E} order by 1`,
  relopciones: `select n.nspname||'.'||c.relname||' kind='||c.relkind::text||' rls='||c.relrowsecurity||' force='||c.relforcerowsecurity||' persist='||c.relpersistence::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','m','f') and n.nspname in ${E} order by 1`,
  grants_tabla: `select table_schema||'.'||table_name||' · '||grantee||' · '||string_agg(privilege_type,',' order by privilege_type)
    from information_schema.role_table_grants
    where table_schema in ${E} and grantee in ('authenticated','anon','service_role')
    group by table_schema, table_name, grantee order by 1`,
  grants_columna: `select table_schema||'.'||table_name||'.'||column_name||' · '||grantee||' · '||string_agg(privilege_type,',' order by privilege_type)
    from information_schema.column_privileges
    where table_schema in ${E} and grantee in ('authenticated','anon','service_role')
    group by table_schema, table_name, column_name, grantee order by 1`,
  defacl: `select coalesce(n.nspname,'-')||' · '||pg_get_userbyid(d.defaclrole)||' · '||d.defaclobjtype::text||' · '||d.defaclacl::text
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1`,
  comentarios: `select c.relnamespace::regnamespace::text||'.'||c.relname||coalesce('.'||a.attname,'')||' :: '||md5(d.description)
    from pg_description d join pg_class c on c.oid=d.objoid
    left join pg_attribute a on a.attrelid=c.oid and a.attnum=d.objsubid
    where c.relnamespace::regnamespace::text in ${E} order by 1`,
  extensiones: `select extname||' @'||extnamespace::regnamespace::text from pg_extension order by 1`,
  esquemas: `select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname<>'information_schema' order by 1`,
  cron_full: `select jobname||' · '||schedule||' · active='||active||' · db='||database||' · '||command from cron.job order by 1`,
}

// Diferencias conocidas y ACEPTADAS, cada una con su porqué. Todo lo demás cuenta.
const CONOCIDAS = new Map([
  ['columnas_full · public.finanzas_plan_vigente.correlation_id',
    'orden de columnas 11/12 invertido: en prod la tabla creció por ALTERs en otro orden; reordenar exige reescribir la tabla y no cambia semántica'],
  ['columnas_full · public.finanzas_plan_vigente.actualizado_en',
    'contracara del anterior'],
  ['esquemas · supabase_migrations',
    'ledger histórico del CLI de Supabase (41 filas de la era pre-22/08): metadato de plataforma, no del esquema del OS — el ledger vigente es public.migracion_aplicada'],
])
const esConocida = (categoria, linea) =>
  [...CONOCIDAS.keys()].some((k) => {
    const [cat, frag] = k.split(' · ', 2)
    return cat === categoria && linea.includes(frag)
  })

const otro = process.argv[process.argv.indexOf('--otro') + 1]
if (!process.argv.includes('--otro') || !otro || otro.startsWith('--')) {
  console.error('falta --otro postgres://… (la base reconstruida a comparar contra producción)')
  process.exit(1)
}
const prod = getPool()
const local = new pg.Client({ connectionString: otro })
await local.connect()

const out = []
let difs = 0
let aceptadas = 0
for (const [k, sql] of Object.entries(Q)) {
  let a, b
  try { a = await prod.query(sql) } catch (e) { out.push(`═══ ${k}: PROD ERROR — ${e.message}`); difs++; continue }
  try { b = await local.query(sql) } catch (e) { out.push(`═══ ${k}: OTRO ERROR — ${e.message}`); difs++; continue }
  const sp = new Set(a.rows.map((r) => Object.values(r)[0]))
  const sl = new Set(b.rows.map((r) => Object.values(r)[0]))
  const soloP = [...sp].filter((x) => !sl.has(x))
  const soloL = [...sl].filter((x) => !sp.has(x))
  out.push(`═══ ${k.toUpperCase()} · prod=${sp.size} otro=${sl.size} · sólo-prod=${soloP.length} sólo-otro=${soloL.length}`)
  for (const [lado, lista] of [['PROD-ONLY ', soloP], ['OTRO-ONLY ', soloL]]) {
    for (const x of lista.slice(0, 400)) {
      if (esConocida(k, x)) { aceptadas++; out.push(`  (conocida) ${lado} ${x}`) } else { difs++; out.push(`  ${lado}  ${x}`) }
    }
  }
}
out.push(`\nTOTAL DIFERENCIAS: ${difs} · conocidas aceptadas: ${aceptadas}`)
writeFileSync(new URL('./diff-esquemas.txt', import.meta.url), out.join('\n'))
console.log(out.filter((l) => l.startsWith('═══')).join('\n'))
console.log(`\nTOTAL DIFERENCIAS: ${difs} · conocidas aceptadas: ${aceptadas} (detalle en orquestador/scripts/diff-esquemas.txt)`)
process.exitCode = difs === 0 ? 0 : 1
await local.end()
await prod.end()
