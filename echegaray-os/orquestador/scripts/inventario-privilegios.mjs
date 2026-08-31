#!/usr/bin/env node
// QUÉ PUEDE HACER CADA ROL DE APLICACIÓN SOBRE CADA TABLA. Medición, no lectura de SQL.
//
//   node orquestador/scripts/inventario-privilegios.mjs --json antes.json
//   node orquestador/scripts/inventario-privilegios.mjs --json despues.json --contra antes.json
//
// ═══ POR QUÉ EXISTE ═══
//
// El ticket `docs/engineering/TICKET-truncate-authenticated.md` midió que `authenticated` podía
// truncar 187 de 196 tablas, y que el número CRECÍA solo. La causa no era tabla por tabla: era el
// `pg_default_acl` del rol que crea las tablas, así que cada tabla nueva nacía con el permiso.
//
// Un inventario tabla por tabla no habría encontrado la causa. Por eso este script mide las DOS
// capas: el permiso efectivo sobre cada objeto que existe HOY, y la regla que fabrica el permiso de
// los objetos que van a existir MAÑANA. Una corrección que arregla la primera y no la segunda dura
// hasta la próxima migración.
//
// `has_table_privilege` —no `relacl`— porque el permiso efectivo también llega por herencia de rol
// y por PUBLIC, y el ACL crudo no los muestra.
import { writeFileSync, readFileSync } from 'node:fs'
import { getPool } from '../lib/db.mjs'

/** Los esquemas de la aplicación. `auth`, `storage`, `realtime`, `vault`, `cron`, `graphql*` son de
 *  la plataforma Supabase: los administra supabase_admin, no las migraciones de este repo, y tocar
 *  sus permisos rompe el producto sin que podamos repararlo. */
const ESQUEMAS = ['public', 'orq', 'comunicacion', 'tesoreria', 'supabase_migrations']
const ROLES = ['anon', 'authenticated', 'service_role']
const BITS_TABLA = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
/** Los cuatro que ningún rol de aplicación necesita y que sólo sirven para romper: vaciar la tabla,
 *  colgarle un trigger, clavarle una FK, o tomarle el lock exclusivo con un CLUSTER. */
export const BITS_DESTRUCTIVOS = ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']

async function inventario(pool) {
  const { rows: tablas } = await pool.query(
    `select n.nspname as esquema, c.relname as tabla, c.relkind as clase,
            pg_get_userbyid(c.relowner) as owner, c.relrowsecurity as rls,
            ${ROLES.map((rol) => BITS_TABLA.map((b) =>
              `has_table_privilege('${rol}', c.oid, '${b}') as "${rol}.${b}"`).join(', ')).join(', ')}
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1) and c.relkind in ('r', 'p')
      order by n.nspname, c.relname`, [ESQUEMAS])

  const { rows: secuencias } = await pool.query(
    `select n.nspname as esquema, c.relname as secuencia, pg_get_userbyid(c.relowner) as owner,
            ${ROLES.map((rol) => ['SELECT', 'UPDATE', 'USAGE'].map((b) =>
              `has_sequence_privilege('${rol}', c.oid, '${b}') as "${rol}.${b}"`).join(', ')).join(', ')}
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1) and c.relkind = 'S' order by 1, 2`, [ESQUEMAS])

  // Una función SECURITY DEFINER ejecutable por un rol de aplicación corre con los permisos de su
  // dueño: es la vía por la que un privilegio revocado puede volver a entrar por la ventana.
  const { rows: funciones } = await pool.query(
    `select n.nspname as esquema, p.proname as funcion, p.prosecdef as security_definer,
            pg_get_userbyid(p.proowner) as owner,
            ${ROLES.map((rol) => `has_function_privilege('${rol}', p.oid, 'EXECUTE') as "${rol}.EXECUTE"`).join(', ')}
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = any($1) order by 1, 2`, [ESQUEMAS])

  const { rows: defaults } = await pool.query(
    `select pg_get_userbyid(d.defaclrole) as rol_creador, coalesce(n.nspname, '(todos)') as esquema,
            d.defaclobjtype as tipo, d.defaclacl::text as acl
       from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace order by 1, 2, 3`)

  const { rows: esquemas } = await pool.query(
    `select nspname as esquema, pg_get_userbyid(nspowner) as owner, coalesce(nspacl::text, '(sólo el dueño)') as acl
       from pg_namespace where nspname = any($1) order by 1`, [ESQUEMAS])

  return { medido_en: new Date().toISOString(), tablas, secuencias, funciones, defaults, esquemas }
}

/** El número que decide: cuántas tablas puede romper cada rol, y con qué privilegio. */
function resumen(inv) {
  const out = {}
  for (const rol of ROLES) {
    out[rol] = {}
    for (const b of BITS_TABLA) out[rol][b] = inv.tablas.filter((t) => t[`${rol}.${b}`]).length
  }
  out.total_tablas = inv.tablas.length
  return out
}

function imprimir(inv, previo) {
  const r = resumen(inv)
  console.log(`\n${inv.tablas.length} tablas · ${inv.secuencias.length} secuencias · ${inv.funciones.length} funciones`)
  console.log(`esquemas medidos: ${ESQUEMAS.join(', ')}\n`)
  const rPrev = previo ? resumen(previo) : null
  const filas = BITS_TABLA.map((b) => {
    const f = { privilegio: b }
    for (const rol of ROLES) {
      f[rol] = rPrev && rPrev[rol][b] !== r[rol][b] ? `${rPrev[rol][b]} → ${r[rol][b]}` : String(r[rol][b])
    }
    return f
  })
  console.table(filas)

  const secdef = inv.funciones.filter((f) => f.security_definer && f['authenticated.EXECUTE'])
  console.log(`funciones SECURITY DEFINER ejecutables por authenticated: ${secdef.length}`)
  console.log(`funciones SECURITY DEFINER ejecutables por anon:          ${inv.funciones.filter((f) => f.security_definer && f['anon.EXECUTE']).length}`)

  console.log('\nDEFAULT PRIVILEGES — la regla que fabrica el permiso de las tablas que todavía no existen:')
  for (const d of inv.defaults.filter((d) => ESQUEMAS.includes(d.esquema) && d.tipo === 'r')) {
    console.log(`  ${d.rol_creador} crea en ${d.esquema} → ${d.acl}`)
  }

  const sinRls = inv.tablas.filter((t) => !t.rls && t['authenticated.SELECT'])
  if (sinRls.length) {
    console.log(`\n⚠ ${sinRls.length} tablas legibles por authenticated SIN RLS: ${sinRls.map((t) => `${t.esquema}.${t.tabla}`).join(', ')}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const salida = args[args.indexOf('--json') + 1]
  const contra = args.includes('--contra') ? args[args.indexOf('--contra') + 1] : null
  const pool = getPool()
  const inv = await inventario(pool)
  await pool.end()
  imprimir(inv, contra ? JSON.parse(readFileSync(contra, 'utf8')) : null)
  if (args.includes('--json') && salida && !salida.startsWith('--')) {
    writeFileSync(salida, JSON.stringify(inv, null, 1))
    console.log(`\nevidencia completa en ${salida}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
}
