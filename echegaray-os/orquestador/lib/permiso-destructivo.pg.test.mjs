// UN ROL DE APLICACIÓN NO PUEDE VACIAR UNA TABLA — PROBADO ATACANDO, NO LEYENDO EL SQL.
//
// El ticket `docs/engineering/TICKET-truncate-authenticated.md` midió que `authenticated` podía
// truncar 187 de las 196 tablas de `public`, y que el número crecía solo porque el permiso venía
// del `pg_default_acl`: cada tabla nueva nacía con él. La medición completa encontró tres bits más
// igual de abiertos (REFERENCES, TRIGGER, MAINTAIN) y que `anon` estaba peor que `authenticated`.
//
// ═══ POR QUÉ ESTE TEST NO PUEDE SER UNA CONSULTA A `pg_class` ═══
//
// `relacl` no ve lo que llega por herencia de rol ni por PUBLIC, así que un censo sobre el ACL
// crudo puede dar verde con el agujero abierto. Y aunque `has_table_privilege` sí lo ve, seguiría
// siendo el sistema afirmando sobre sí mismo. Por eso el test central ASUME EL ROL y ejecuta el
// `truncate`: lo que prueba la protección es el rechazo del motor, no la lectura del catálogo.
//
// El camino elegido —`set local role authenticated`— es el mismo que usa PostgREST: se conecta como
// `authenticator` y hace `set local role` al rol del claim del JWT. Los privilegios se evalúan
// contra `current_user`, así que asumir el rol es fiel; y `authenticator` es NOINHERIT, con lo cual
// no aporta nada propio.
//
// ═══ LA TABLA SONDA ═══
//
// `certificado_cliente`: tabla productiva real, con RLS, 0 escrituras y 0 filas medidas. Se eligió
// medida y no por costumbre porque `truncate` toma el ACCESS EXCLUSIVE LOCK ANTES de chequear el
// permiso: atacar una tabla caliente cuelga la app un instante para todos.
//
// Todo corre en una transacción que termina en ROLLBACK — incluida la tabla `zz_` que se crea para
// probar que las tablas NUEVAS nacen seguras. El DDL en Postgres es transaccional: no queda nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const DESTRUCTIVOS = ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
const ROLES_APP = ['anon', 'authenticated']
const TABLA_SONDA = 'certificado_cliente'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('ningún rol de aplicación puede vaciar ni intervenir una tabla', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query(`set local lock_timeout = '5s'`)

    await t.test('el censo: cero combinaciones tabla/rol/privilegio destructivas en public', async () => {
      const filas = await q(
        `select n.nspname || '.' || c.relname as tabla, r as rol, p as privilegio
           from pg_class c join pg_namespace n on n.oid = c.relnamespace,
                unnest($1::text[]) p, unnest($2::text[]) r
          where n.nspname = 'public' and c.relkind in ('r','p')
            and has_table_privilege(r, c.oid, p)
          order by 1, 2, 3`, [DESTRUCTIVOS, ROLES_APP])
      const muestra = filas.slice(0, 8).map((f) => `${f.rol} ${f.privilegio} ${f.tabla}`).join(' · ')
      assert.equal(filas.length, 0, `${filas.length} combinaciones abiertas. Primeras: ${muestra}`)
    })

    await t.test('la regla que fabrica las tablas nuevas no reparte privilegios destructivos', async () => {
      const [d] = await q(
        `select d.defaclacl::text as acl from pg_default_acl d
           join pg_namespace n on n.oid = d.defaclnamespace
          where pg_get_userbyid(d.defaclrole) = 'postgres'
            and n.nspname = 'public' and d.defaclobjtype = 'r'`)
      // Sin fila, las tablas nuevas nacen sin ningún grant: también está bien.
      if (d) {
        assert.ok(!/(anon|authenticated)=[^/]*[Dxtm]/.test(d.acl),
          `el default privilege de postgres en public vuelve a fabricar tablas vulnerables: ${d.acl}`)
      }
    })

    // ── el ataque ────────────────────────────────────────────────────────────────────────────
    const [dir] = await q(`select id from perfiles where rol = 'direccion' limit 1`)
    await t.test('asumiendo el rol authenticated, el TRUNCATE es rechazado', { skip: !dir && 'sin perfil de dirección' }, async () => {
      await c.query('savepoint ataque')
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: dir.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
      await assert.rejects(
        () => c.query(`truncate public.${TABLA_SONDA}`),
        (e) => {
          assert.equal(e.code, '42501', `el motor rechazó, pero no por permisos: ${e.code} ${e.message}`)
          assert.match(e.message, /permission denied|permiso denegado/i)
          return true
        },
        `authenticated pudo truncar public.${TABLA_SONDA}`,
      )
      await c.query('rollback to savepoint ataque')
      await c.query('reset role')
    })

    // ── y la operación normal sigue viva ─────────────────────────────────────────────────────
    await t.test('el mismo rol sigue pudiendo leer y escribir lo que la policy le permite', { skip: !dir && 'sin perfil de dirección' }, async () => {
      await c.query('savepoint operacion_normal')
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: dir.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
      const leidas = await q(`select id from cotizaciones limit 1`)
      assert.ok(Array.isArray(leidas), 'el SELECT bajo RLS dejó de funcionar')
      const [nueva] = await q(
        `insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado)
         values ('ZZ SEGURIDAD', 'ZZ', $1, current_date, 'borrador') returning id`,
        [`ZZ-SEC-${Date.now()}`])
      assert.ok(nueva?.id, 'el INSERT que la policy permite dejó de funcionar')
      await c.query('rollback to savepoint operacion_normal')
      await c.query('reset role')
    })

    // ── la tabla que todavía no existía ──────────────────────────────────────────────────────
    await t.test('una tabla creada DESPUÉS de la corrección nace sin privilegios destructivos', { skip: !dir && 'sin perfil de dirección' }, async () => {
      const nombre = `zz_sonda_privilegios_${Date.now()}`
      await c.query(`create table public.${nombre} (id int primary key)`)
      const abiertos = await q(
        `select r as rol, p as privilegio from unnest($2::text[]) p, unnest($3::text[]) r
          where has_table_privilege(r, ('public.' || $1)::regclass, p)`,
        [nombre, DESTRUCTIVOS, ROLES_APP])
      assert.equal(abiertos.length, 0,
        `la tabla nueva nació con ${abiertos.map((a) => `${a.rol}:${a.privilegio}`).join(', ')}`)

      await c.query('savepoint ataque_tabla_nueva')
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: dir.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
      await assert.rejects(
        () => c.query(`truncate public.${nombre}`),
        (e) => e.code === '42501',
        'authenticated pudo truncar una tabla recién creada',
      )
      await c.query('rollback to savepoint ataque_tabla_nueva')
      await c.query('reset role')
    })

    // ── y el backend autorizado no perdió nada ───────────────────────────────────────────────
    await t.test('service_role conserva sus privilegios: la corrección no fue de más', async () => {
      const [r] = await q(
        `select count(*) filter (where has_table_privilege('service_role', c.oid, 'TRUNCATE')) as trunca,
                count(*) as total
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r','p')`)
      assert.equal(Number(r.trunca), Number(r.total),
        'service_role perdió TRUNCATE: el backend autorizado no puede limpiar sus propias tablas')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
