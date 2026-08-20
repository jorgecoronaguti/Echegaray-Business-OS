// EL PERFIL EMPLEADO NO PUEDE ABRIRSE SOLO — la forma de sus permisos, fijada.
//
// ═══ QUÉ VIGILA ═══
//
// Catorce pantallas nuevas cuelgan de tres capacidades que antes no existían: asistencia con hora,
// presentación de documentación y recibo por persona. Las tres tocan datos de UNA persona, y el modo
// de fallar de todas es el mismo: publicar los de otra.
//
// Esto mira el CATÁLOGO, en milisegundos y sin red. La prueba con identidades reales —que mide el
// efecto leyendo Postgres— vive en `tests/perfil-empleado.spec.ts`. Las dos hacen falta: una mide el
// efecto, ésta la causa. El día que alguien afloje una policy «porque la pantalla no guardaba», el
// rojo aparece acá mucho antes de que nadie corra el E2E.
//
// ═══ Y LA TRAMPA QUE ESTE REPO YA PAGÓ DOS VECES ═══
//
// RLS NO ES GRANT. Una policy sin grant es inerte —da «permission denied» y Next lo muestra como un
// 404— y un grant sin policy es una bomba. Por eso cada objeto se verifica por los dos lados.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

const SIN_BASE = !process.env.DATABASE_URL

/** Las vistas con el portero adentro. `security_invoker = false` es lo que les deja leer lo que el
 *  grant le niega al invocante; el `where … = mi_persona_id()` es lo único que las contiene. */
const VISTAS_CON_PORTERO = [
  'mi_legajo', 'mi_asignacion', 'mi_hh_dia', 'mi_documento_legajo',
  'mi_obra', 'mi_cuadrilla', 'mi_tarea', 'mi_impedimento', 'mi_asistencia_dia', 'mi_recibo',
]

async function definicion(vista) {
  const { rows } = await query('select pg_get_viewdef($1::regclass, true) as d', [vista])
  return rows[0]?.d ?? ''
}

async function policies(tabla) {
  const { rows } = await query(
    `select case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                          when 'd' then 'DELETE' when '*' then 'ALL' end as cmd,
            p.polname,
            pg_get_expr(p.polqual, p.polrelid) as usando,
            pg_get_expr(p.polwithcheck, p.polrelid) as chequeo
       from pg_policy p join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relname = $1`, [tabla])
  return rows
}

for (const vista of VISTAS_CON_PORTERO) {
  test(`\`${vista}\` lleva el portero adentro y no se invoca con los permisos del que pregunta`, { skip: SIN_BASE }, async () => {
    const { rows } = await query(
      `select coalesce(array_to_string(c.reloptions, ','), '') as opts
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1`, [vista])
    assert.equal(rows.length, 1, `${vista} no existe: falta la migración`)
    assert.match(rows[0].opts, /security_invoker=false/,
      `${vista} pasó a security_invoker: la vista deja de poder leer lo que el grant le niega, y la pantalla queda vacía sin decir por qué`)

    const def = await definicion(vista)
    assert.match(def, /mi_persona_id\(\)/,
      `${vista} perdió el filtro por persona: con security_invoker=false eso publica el legajo del plantel entero`)
  })

  test(`\`${vista}\` tiene su grant de lectura`, { skip: SIN_BASE }, async () => {
    const { rows } = await query(
      `select 1 from information_schema.role_table_grants
        where table_schema='public' and table_name=$1 and grantee='authenticated' and privilege_type='SELECT'`, [vista])
    assert.equal(rows.length, 1, `${vista} no tiene grant: la policy es inerte y la pantalla da 404`)
  })
}

test('la marca de asistencia sólo se escribe a nombre propio', { skip: SIN_BASE }, async () => {
  const p = await policies('asistencia_marca')
  const insert = p.find((x) => x.cmd === 'INSERT')
  assert.ok(insert, 'no hay policy de INSERT en asistencia_marca')
  assert.match(String(insert.chequeo), /persona_id = mi_persona_id\(\)/,
    'el with check dejó de atar la fila a quien la escribe: se puede fabricar la presencia de otro')
  const select = p.find((x) => x.cmd === 'SELECT')
  assert.match(String(select?.usando), /persona_id = mi_persona_id\(\)/,
    'la lectura de asistencia dejó de acotarse a la persona')
  assert.ok(!/^\(?true\)?$/i.test(String(select?.usando ?? '').trim()), 'lectura de asistencia abierta')
})

test('UNA MARCA ES HISTORIAL: nadie la borra', { skip: SIN_BASE }, async () => {
  // Es el mismo criterio que ya rige `movimientos_herramienta`. Una entrada mal registrada se
  // corrige con un update de Administración, que deja la fila; borrar el día destruye el rastro de
  // que alguien estuvo.
  const { rows } = await query(
    `select privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='asistencia_marca'
        and grantee in ('authenticated','anon') and privilege_type='DELETE'`)
  assert.deepEqual(rows, [], 'apareció un grant de DELETE sobre asistencia_marca')
  assert.equal((await policies('asistencia_marca')).filter((x) => x.cmd === 'DELETE').length, 0)
})

test('la corrección de una marca es de Administración, no del empleado', { skip: SIN_BASE }, async () => {
  const update = (await policies('asistencia_marca')).find((x) => x.cmd === 'UPDATE')
  assert.ok(update, 'no hay policy de UPDATE')
  assert.match(String(update.usando), /es_administracion\(\)/)
  assert.ok(!/mi_persona_id/.test(String(update.usando)),
    'si el empleado pudiera editar su propia hora, la marca dejaría de ser un hecho')
})

test('NADIE SE AUTOAPRUEBA UN DOCUMENTO', { skip: SIN_BASE }, async () => {
  // La pantalla no ofrece el campo `estado`, pero la pantalla no es la cerradura: sin este check,
  // un PATCH a mano por PostgREST convierte una foto borrosa en documentación aprobada.
  const p = await policies('documento_presentacion')
  const insert = p.find((x) => x.cmd === 'INSERT')
  assert.match(String(insert?.chequeo), /estado = 'en_revision'/,
    'la presentación puede nacer aprobada')
  assert.match(String(insert?.chequeo), /persona_id = mi_persona_id\(\)/,
    'se puede presentar documentación a nombre de otro')
  const update = p.find((x) => x.cmd === 'UPDATE')
  assert.match(String(update?.usando), /es_administracion\(\)/, 'la revisión dejó de ser de Administración')
})

test('el recibo lo lee su dueño o quien ve la plata — el jefe de obra NO', { skip: SIN_BASE }, async () => {
  // Es la línea que se trazó el 19/08 entre ADMINISTRAR y VER LA PLATA: `es_administracion()`
  // incluye al jefe de obra y `ve_economia()` no. Un sueldo es plata.
  const select = (await policies('recibo_empleado')).find((x) => x.cmd === 'SELECT')
  assert.match(String(select?.usando), /ve_economia\(\)/)
  assert.match(String(select?.usando), /persona_id = mi_persona_id\(\)/)
  assert.ok(!/es_administracion/.test(String(select?.usando)),
    'es_administracion incluye al jefe de obra: con eso, un jefe leería los sueldos de su cuadrilla')
})

test('el recibo lo escribe sólo quien ve la plata', { skip: SIN_BASE }, async () => {
  for (const cmd of ['INSERT', 'UPDATE']) {
    const p = (await policies('recibo_empleado')).find((x) => x.cmd === cmd)
    assert.match(String(p?.chequeo), /ve_economia\(\)/, `${cmd} de recibo_empleado abierto`)
  }
  const { rows } = await query(
    `select privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='recibo_empleado'
        and grantee in ('authenticated','anon') and privilege_type='DELETE'`)
  assert.deepEqual(rows, [], 'un recibo borrado no deja rastro de que existió')
})

test('las horas de otro no salen para el nivel campo', { skip: SIN_BASE }, async () => {
  // `hh_select_por_obra` le daba a cualquiera que viera la obra TODAS las imputaciones del plantel
  // en esa obra. Para Administración está bien; para el empleado es «horas de terceros».
  const select = (await policies('registros_hh')).find((x) => x.cmd === 'SELECT')
  assert.match(String(select?.usando), /mi_persona_id\(\)/,
    'la lectura de HH dejó de acotarse a la persona para quien no es Administración')
  assert.ok(!/ve_obra\(/.test(String(select?.usando)),
    'volvió el criterio por obra: eso publica las horas de todo el plantel de esa obra')
})

test('el empleado REPORTA un impedimento pero no lo gestiona', { skip: SIN_BASE }, async () => {
  const p = await policies('obra_restriccion')
  assert.equal(p.filter((x) => x.cmd === 'ALL').length, 0,
    '`for all` incluye el SELECT: se parte por comando')
  const insert = p.find((x) => x.cmd === 'INSERT')
  assert.match(String(insert?.chequeo), /campo/, 'el nivel campo no puede abrir un impedimento')
  assert.match(String(insert?.chequeo), /ve_obra\(obra_id\)/, 'se puede abrir un impedimento en una obra ajena')
  assert.match(String(insert?.chequeo), /'abierta'/, 'un impedimento del empleado puede nacer liberado')
  for (const cmd of ['UPDATE', 'DELETE']) {
    const x = p.find((y) => y.cmd === cmd)
    assert.ok(!/campo/.test(String(x?.usando)), `el nivel campo puede ${cmd} un impedimento: eso es gestionarlo`)
  }
})

test('el bucket de la documentación del legajo es PRIVADO y por carpeta de persona', { skip: SIN_BASE }, async () => {
  const { rows } = await query("select public from storage.buckets where id = 'documentos-legajo'")
  assert.equal(rows.length, 1, 'falta el bucket')
  assert.equal(rows[0].public, false, 'público significa que la URL adivinada abre el DNI de cualquiera sin sesión')

  const { rows: pol } = await query(
    `select p.polname, pg_get_expr(p.polqual, p.polrelid) as usando,
            pg_get_expr(p.polwithcheck, p.polrelid) as chequeo
       from pg_policy p join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace and n.nspname='storage'
      where c.relname='objects' and p.polname like 'documentos_legajo%'`)
  assert.ok(pol.length >= 2, 'faltan las policies de Storage')
  for (const x of pol) {
    assert.match(String(x.usando ?? x.chequeo), /mi_persona_id\(\)/,
      `${x.polname}: la carpeta dejó de ser la persona`)
  }
})
