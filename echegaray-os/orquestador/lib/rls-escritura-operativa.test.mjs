// NINGUNA TABLA OPERATIVA PUEDE VOLVER A TENER LA ESCRITURA ABIERTA.
//
// ═══ POR QUÉ ESTE TEST EXISTE (20/08/2026) ═══
//
// Auditadas todas las policies de escritura de `public` para `authenticated`: 27 tenían la
// condición en `true` y **12 tenían además el GRANT puesto**, o sea que eran explotables. Y no era
// teórico: `CAMPO_RUTAS_PERMITIDAS` le abre a un operario las pantallas de pedidos, herramientas y
// movimientos, que tienen alta, edición y baja.
//
// Medido con el token de un usuario de campo ANTES de `20260820T5000`, leyendo el efecto en la base
// y no el status HTTP: **14 desvíos sobre 30 casos**. Insertaba pedidos, herramientas y movimientos
// apuntando a una obra que no ve; borraba movimientos del historial; reimputaba comprobantes de
// ARCA. Después de la migración: **0 desvíos sobre 30**.
//
// ═══ POR QUÉ MIRA EL CATÁLOGO ═══
//
// La prueba con identidades reales vive en `tests/autorizacion-por-obra.spec.ts` y necesita red,
// cuentas y navegador. Ésta corre en `npm run orq:test` en milisegundos y fija la FORMA: el día que
// alguien reponga una policy en `true` "porque la pantalla no guardaba", el rojo aparece acá mucho
// antes de que nadie corra el E2E. Las dos hacen falta: una mide el efecto, ésta la causa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

const SIN_BASE = !process.env.DATABASE_URL

/** Las tablas que gobierna `20260820T5000`. Si se agrega una operativa, va acá. */
const OPERATIVAS = [
  'pedidos_materiales',
  'clientes', 'cliente_contacto', 'cliente_documento', 'obra_canonica',
  'comprobantes_arca', 'avance_obra_legado', 'acciones', 'costos_obra',
]

/**
 * Lo que cada policy de escritura tiene que decir. No alcanza con "no dice true": una policy que
 * dijera `auth.uid() is not null` tampoco dice `true` y sería igual de abierta.
 */
const ESPERADO = {
  'pedidos_materiales.INSERT': /ve_obra_texto\(obra_texto\)/,
  'pedidos_materiales.UPDATE': /ve_obra_texto\(obra_texto\)/,
  'pedidos_materiales.DELETE': /ve_obra_texto\(obra_texto\)/,
  'clientes.INSERT': /es_administracion\(\)/,
  'clientes.UPDATE': /es_administracion\(\)/,
  'clientes.DELETE': /es_administracion\(\)/,
  'cliente_contacto.INSERT': /es_administracion\(\)/,
  'cliente_contacto.UPDATE': /es_administracion\(\)/,
  'cliente_contacto.DELETE': /es_administracion\(\)/,
  'cliente_documento.INSERT': /es_administracion\(\)/,
  'cliente_documento.UPDATE': /es_administracion\(\)/,
  'cliente_documento.DELETE': /es_administracion\(\)/,
  'obra_canonica.INSERT': /es_administracion\(\)/,
  'obra_canonica.UPDATE': /es_administracion\(\)/,
  'obra_canonica.DELETE': /es_administracion\(\)/,
  'comprobantes_arca.UPDATE': /es_administracion\(\)/,
  'acciones.INSERT': /ve_economia\(\)/,
  'acciones.UPDATE': /current_rol\(\)/,
  'acciones.DELETE': /current_rol\(\)/,
}

/** Escritura que NINGUNA sesión de usuario debe tener, ni con policy ni con grant. */
const SIN_ESCRITURA = {
  costos_obra: ['INSERT', 'UPDATE', 'DELETE'],
  avance_obra_legado: ['INSERT', 'UPDATE', 'DELETE'],
  // HERRAMIENTAS (20260921T2100): las tablas del módulo no tienen NINGUNA escritura de sesión. Todo
  // pasa por funciones `security definer`; la ubicación sólo cambia insertando un movimiento.
  activo: ['INSERT', 'UPDATE', 'DELETE'],
  ubicacion: ['INSERT', 'UPDATE', 'DELETE'],
  activo_movimiento: ['INSERT', 'UPDATE', 'DELETE'],
  activo_incidencia: ['INSERT', 'UPDATE', 'DELETE'],
  activo_codigo_anterior: ['INSERT', 'UPDATE', 'DELETE'],
  // Las tablas viejas pasaron a ser vistas de compatibilidad de sólo lectura.
  herramientas: ['INSERT', 'UPDATE', 'DELETE'],
  movimientos_herramienta: ['INSERT', 'UPDATE', 'DELETE'],
}

async function policiesDeEscritura() {
  const { rows } = await query(
    `select c.relname as tabla,
            case p.polcmd when 'a' then 'INSERT' when 'w' then 'UPDATE'
                          when 'd' then 'DELETE' when '*' then 'ALL' end as cmd,
            p.polname,
            coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)) as expr,
            (select string_agg(g.privilege_type, ',' order by g.privilege_type)
               from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.table_name = c.relname
                and g.grantee = 'authenticated'
                and g.privilege_type in ('INSERT','UPDATE','DELETE')) as grants
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where p.polcmd in ('a','w','d','*')
        and 'authenticated' = any (select rolname from pg_roles where oid = any (p.polroles))`,
  )
  return rows
}

test('ninguna tabla operativa tiene una policy de escritura abierta', { skip: SIN_BASE }, async () => {
  const abiertas = (await policiesDeEscritura())
    .filter((r) => OPERATIVAS.includes(r.tabla))
    .filter((r) => /^(true|\(true\))$/i.test(String(r.expr ?? '').trim()))
  assert.deepEqual(abiertas.map((r) => `${r.tabla}.${r.cmd} (${r.polname})`), [],
    'volvió a haber escritura abierta en una tabla operativa')
})

test('ninguna policy de escritura operativa quedó `for all`', { skip: SIN_BASE }, async () => {
  // `for all` incluye el SELECT. Este repo ya pagó dos fugas por eso (`obra_actividad`,
  // `obra_alias`): una policy de escritura amplia se convierte en una policy de LECTURA amplia sin
  // que nadie la haya escrito así.
  const conAll = (await policiesDeEscritura())
    .filter((r) => OPERATIVAS.includes(r.tabla) && r.cmd === 'ALL')
  assert.deepEqual(conAll.map((r) => `${r.tabla} (${r.polname})`), [],
    'una policy `for all` sobre una tabla operativa: parte por comando')
})

for (const [clave, patron] of Object.entries(ESPERADO)) {
  test(`\`${clave}\` sigue acotada por su criterio`, { skip: SIN_BASE }, async () => {
    const [tabla, cmd] = clave.split('.')
    const suyas = (await policiesDeEscritura()).filter((r) => r.tabla === tabla && r.cmd === cmd)
    assert.equal(suyas.length, 1, `${clave}: hay ${suyas.length} policies, tiene que haber exactamente 1`)
    assert.match(String(suyas[0].expr ?? ''), patron,
      `${clave} dejó de acotarse por lo que la gobierna: «${suyas[0].expr}»`)
  })
}

for (const [tabla, comandos] of Object.entries(SIN_ESCRITURA)) {
  test(`\`${tabla}\` no le da ${comandos.join('/')} a ninguna sesión`, { skip: SIN_BASE }, async () => {
    const { rows } = await query(
      `select privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = $1
          and grantee in ('authenticated','anon') and privilege_type = any($2) order by 1`,
      [tabla, comandos],
    )
    assert.deepEqual(rows.map((r) => r.privilege_type), [],
      `${tabla} recuperó un grant de escritura: ${rows.map((r) => r.privilege_type).join(', ')}`)
  })
}

test('herramientas: ninguna tabla del módulo tiene una policy de escritura', { skip: SIN_BASE }, async () => {
  // Reemplaza al control del «maestro de la herramienta» (20260820T5000): desde la 20260921T2100 no
  // hay grant por columna que cuidar, porque ninguna sesión escribe estas tablas. Una policy de
  // escritura que apareciera acá abriría un camino que se saltea las reglas de las funciones.
  const { rows } = await query(
    `select tablename, policyname, cmd from pg_policies
      where schemaname = 'public' and cmd <> 'SELECT'
        and tablename in ('activo', 'ubicacion', 'activo_movimiento', 'activo_incidencia', 'activo_codigo_anterior')`,
  )
  assert.deepEqual(rows.map((r) => `${r.tablename}.${r.policyname} (${r.cmd})`), [])
})

test('herramientas: las funciones que escriben son security definer con search_path fijo', { skip: SIN_BASE }, async () => {
  const FUNCIONES = ['mover_activos', 'reportar_problema_activo', 'cambiar_estado_activo', 'dar_de_baja_activo',
    'dar_de_alta_activo', 'editar_activo', 'ubicacion_de_obra', 'crear_ubicacion', 'cambiar_codigo_activo']
  const { rows } = await query(
    `select proname, prosecdef, proconfig from pg_proc
      where pronamespace = 'public'::regnamespace and proname = any($1)`, [FUNCIONES],
  )
  const faltan = FUNCIONES.filter((f) => !rows.some((r) => r.proname === f))
  assert.deepEqual(faltan, [], `faltan funciones del módulo: ${faltan.join(', ')}`)
  const flojas = rows.filter((r) => !r.prosecdef || !(r.proconfig ?? []).some((c) => c.startsWith('search_path='))).map((r) => r.proname)
  assert.deepEqual(flojas, [], `sin security definer o sin search_path fijo: ${flojas.join(', ')}`)
  const anon = await query(
    `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
        and has_function_privilege('anon', p.oid, 'EXECUTE')`, [FUNCIONES],
  )
  assert.deepEqual(anon.rows.map((r) => r.proname), [], 'una sesión sin login puede ejecutar funciones del módulo')
})

test('herramientas: el Taller es uno solo, también para quien llama la base directo', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select indexname from pg_indexes where schemaname = 'public' and tablename = 'ubicacion' and indexname = 'ubicacion_un_solo_taller'`,
  )
  assert.equal(rows.length, 1, 'falta el índice único que impide un segundo Taller')
})

test('`texto_es_de_obra` no se convirtió en una puerta', { skip: SIN_BASE }, async () => {
  // Es `security definer` porque `obra_alias` tiene RLS. Su única salida legítima es un booleano
  // sobre un texto: si algún día devolviera filas o mirara la sesión, sería una fuga con permisos
  // de dueño. El `search_path` fijo es lo que impide que se le cambie la tabla por debajo.
  const { rows } = await query(
    `select prorettype::regtype::text as tipo, proconfig
       from pg_proc where proname = 'texto_es_de_obra' and pronamespace = 'public'::regnamespace`,
  )
  assert.equal(rows.length, 1, 'falta `texto_es_de_obra`: las policies operativas quedan sin su predicado')
  assert.equal(rows[0].tipo, 'boolean', '`texto_es_de_obra` dejó de devolver un booleano')
  assert.ok((rows[0].proconfig ?? []).some((c) => c.startsWith('search_path=')),
    '`texto_es_de_obra` es security definer y perdió su `search_path` fijo')
})
