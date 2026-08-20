// LAS VISTAS DEL MÓDULO TIENEN QUE CORRER CON LOS PERMISOS DE QUIEN CONSULTA.
//
// ═══ POR QUÉ ESTE TEST EXISTE (19/08/2026) ═══
//
// Una vista sin `security_invoker` corre con los permisos de SU DUEÑO (`postgres`), que saltea el
// RLS de sus tablas. Toda la web lee por vistas, así que una sola vista sin la opción publica la
// tabla entera a cualquiera con sesión.
//
// Se cerró el 18/08 en cuatro vistas… y volvió el 19/08 en `cliente_panel`, medido con el token de
// un jefe de obra: `clientes → 0 filas` pero `cliente_panel → 5`. La causa es un default peligroso
// de Postgres: **`create or replace view` que no repite `with (security_invoker = true)` BORRA la
// opción**. No se hereda de la definición anterior.
//
// Por eso la protección no puede ser acordarse: es este test, y mira el CATÁLOGO, no una consulta.
// Una vista puede devolver cero filas hoy por casualidad y filtrar mañana cuando entren datos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

/** Las vistas que se apoyan en el RLS de sus tablas. Si se agrega una, va acá. */
const CON_RLS = [
  'obra_panel', 'obra_plan_vs_real', 'obra_avance', 'cliente_panel',
  'imputacion_pendiente', 'proveedor_nombre_pendiente',
  // MÓDULO PERSONAL / HH (19/08/2026). Las tres se apoyan en el RLS de sus tablas:
  //  · `persona_directorio` hereda el de `personas` — por eso el listado es de Administración sola.
  //  · `cuadrilla_panel` hereda el de `obra_asignacion` para derivar la obra de cada cuadrilla.
  //  · `obra_actividad_hh` hereda el de `obra_actividad` y el de `registros_hh`: un jefe de obra ve
  //    el plan contra real de SUS obras y de ninguna otra.
  'persona_directorio', 'cuadrilla_panel', 'obra_actividad_hh',
]

/**
 * LAS EXCEPCIONES, DECLARADAS Y CON SU CONTRATO DE COLUMNAS.
 *
 * `security_invoker = false` significa que la vista corre como su dueño y saltea el RLS de las
 * tablas que lee. Son las DOS únicas del OS, las dos sobre `personas`, y existen porque
 * `authenticated` es UN SOLO rol de Postgres para los cuatro roles de la aplicación: un grant por
 * columna no puede darle el DNI a Administración y negárselo a Obras. La puerta se abre a mano, se
 * nombra acá, y su lista de columnas queda fijada por el test.
 *
 *  · `persona_plantel` publica lo NO sensible para que la obra pueda asignar personal sin leer el
 *    legajo. Nombre, categoría, especialidad y egreso. Sin portero adentro: cualquier autenticado la
 *    lee, y eso es deliberado — sin una lista de candidatos no existe la primera asignación.
 *
 *  · `persona_legajo` publica EL legajo, con `dni` y `cuil`, y lleva el portero adentro
 *    (`where es_administracion()`). Es el único camino de la web a esos dos campos: el grant por
 *    columna se los niega a `authenticated`, y el test de columnas cerradas lo vigila.
 *    NO publica `retribucion_pactada`, y eso también lo fija este contrato.
 */
const DESESCALADA_DECLARADA = {
  // `mi_legajo` es de otra familia: no publica un listado, publica UNA fila —la del que está
  // mirando— porque lleva `where p.id = mi_persona_id()` adentro. Con la cuenta sin vincular
  // devuelve cero filas: falla cerrado.
  //
  // ═══ EL 20/08/2026 SE LE AGREGÓ LA IDENTIDAD, Y NO ES UN AFLOJE ═══
  //
  // Hasta ese día no publicaba `dni`, `cuil` ni `domicilio`, con este criterio: «ninguna pantalla los
  // muestra, y una columna que viaja sin dibujarse es una fuga sin beneficio». El criterio era
  // correcto y lo que cambió es el hecho: el perfil empleado tiene una pantalla —«Mi legajo»,
  // sección IDENTIDAD— que los muestra, y a quien se los muestra es al propio interesado.
  //
  // El DNI de UNO es de uno. Lo que el grant de columna sobre `personas` protege es el DNI de LOS
  // DEMÁS, y eso sigue igual: esta vista devuelve exactamente una fila, la de quien pregunta.
  //
  // `retribucion_pactada` NO entra, y sigue sin entrar en ninguna vista: lo que se cobra se lee en
  // el recibo, que es el documento que vale.
  mi_legajo: [
    'id', 'nombre_completo', 'dni', 'cuil', 'fecha_nacimiento', 'nacionalidad', 'telefono', 'email',
    'domicilio', 'contacto_emergencia', 'contacto_emergencia_telefono', 'categoria', 'especialidad',
    'puesto', 'convenio_colectivo', 'art', 'obra_social', 'fecha_ingreso', 'fecha_egreso',
    'en_la_empresa', 'legajo',
  ],
  // `mi_cuadrilla` publica DOS columnas de la persona y ninguna más: nombre y rol. El handoff lo
  // dice literal —«los integrantes se listan por nombre y rol, sin acceso a legajos ni documentos de
  // terceros»— y por eso NO hay un `persona_id` acá: lo que no se publica no se puede pedir después.
  // Es la única vista de esta familia que devuelve filas de OTRA gente, y ése es todo el motivo por
  // el que su lista de columnas está fijada acá.
  mi_cuadrilla: [
    'cuadrilla_id', 'cuadrilla', 'nombre_completo', 'rol', 'es_responsable', 'soy_yo',
  ],
  persona_plantel: ['id', 'nombre_completo', 'categoria', 'especialidad', 'fecha_egreso'],
  persona_legajo: [
    'id', 'nombre_completo', 'dni', 'cuil', 'fecha_nacimiento', 'nacionalidad',
    'telefono', 'email', 'domicilio', 'contacto_emergencia', 'contacto_emergencia_telefono',
    'fecha_ingreso', 'fecha_egreso', 'convenio_colectivo', 'categoria', 'especialidad', 'puesto',
    'modalidad_liquidacion', 'art', 'obra_social', 'drive_folder_id', 'notas',
    // El número de la nómina y si sigue en la empresa. Ninguno es sensible —el legajo ya publica
    // DNI y CUIL, que sí lo son— y los dos son de Administración por el portero de la vista.
    'legajo', 'en_la_empresa',
  ],
}

const SIN_BASE = !process.env.DATABASE_URL

test('ninguna vista que dependa del RLS corre con los permisos de su dueño', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select c.relname, coalesce(array_to_string(c.reloptions, ','), '') as opts
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' and c.relname = any($1)`,
    [CON_RLS],
  )
  const faltan = CON_RLS.filter((v) => !rows.some((r) => r.relname === v))
  assert.deepEqual(faltan, [], `estas vistas no existen en la base: ${faltan.join(', ')}`)

  const sinInvoker = rows.filter((r) => !r.opts.includes('security_invoker=true')).map((r) => r.relname)
  assert.deepEqual(sinInvoker, [],
    `perdieron security_invoker y saltean el RLS de sus tablas: ${sinInvoker.join(', ')}`)
})

for (const [vista, columnas] of Object.entries(DESESCALADA_DECLARADA)) {
  test(`la desescalada de \`${vista}\` sigue siendo acotada`, { skip: SIN_BASE }, async () => {
    // Si mañana alguien le agrega una columna sensible, la desescalada deja de ser acotada y hay que
    // volver a discutirla. El test fija el contrato: estas columnas y ninguna más.
    const { rows } = await query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [vista],
    )
    assert.deepEqual(rows.map((r) => r.column_name), columnas,
      `cambió lo que publica \`${vista}\`, que salta el RLS a propósito`)
  })
}

test('no apareció una tercera puerta al legajo sin declararse', { skip: SIN_BASE }, async () => {
  // ═══ LA MITAD QUE NADIE MIRA ═══
  //
  // Los dos tests de arriba vigilan las vistas que YA se conocen. El agujero que queda es la vista
  // NUEVA: `create view` sin `security_invoker` corre como su dueño POR DEFAULT, así que una vista
  // agregada sin pensarlo saltea el RLS y ningún test la nombra. Acá se buscan en el catálogo de
  // dependencias TODAS las vistas que leen `personas` corriendo como dueño, y se exige que sean
  // exactamente las dos declaradas arriba.
  //
  // ALCANCE DECLARADO: este barrido mira `personas` y nada más. Corriendo el mismo criterio sobre el
  // esquema entero aparecen otras diez vistas que corren como su dueño y que `authenticated` puede
  // leer —`obra_costo_real`, `nomina_por_mes`, `egreso_por_area`, `factor_ajuste`,
  // `finanzas_scorecard_vigente`, `recupero_art_por_mes`, `recupero_art_sin_imputar` y las tres
  // `v_drive_busqueda_*`—. Ninguna toca `personas`, son de otros módulos y NO se tocan desde acá:
  // ampliar el barrido sin auditarlas una por una dejaría un test rojo que el próximo lo apaga.
  // Queda escrito para que se audite con su dueño, no para que se descubra dos veces.
  const { rows } = await query(
    `select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'
        and exists (
          select 1 from pg_depend d
            join pg_rewrite rw on rw.oid = d.objid
            join pg_class t on t.oid = d.refobjid
           where rw.ev_class = c.oid and t.relname = 'personas')
      order by 1`,
  )
  assert.deepEqual(rows.map((r) => r.relname), Object.keys(DESESCALADA_DECLARADA).sort(),
    'apareció una vista que lee `personas` salteando el RLS y no está declarada arriba')
})

// ═══ LAS VISTAS `mi_*`: LA DESESCALADA CON PORTERO ADENTRO ═══
//
// Son cuatro —`mi_legajo`, `mi_asignacion`, `mi_hh_dia`, `mi_documento_legajo`— y corren como su
// dueño A PROPÓSITO: el empleado no tiene permiso de lectura sobre `personas`, `registros_hh` ni
// `documentacion_legajo`, y no puede tenerlo, porque `authenticated` es UN SOLO rol de Postgres
// para los cuatro roles de la aplicación.
//
// LO QUE LAS HACE SEGURAS NO ES EL RLS: ES EL `where … = mi_persona_id()`. Ése es todo el
// aislamiento. Una vista `mi_*` a la que se le caiga ese filtro no falla, no da error y no cambia
// de aspecto: publica el legajo, las horas o los papeles de TODO EL PLANTEL, con 200 y sin una
// línea en el log. Por eso el filtro es lo que se fija con un test y no una convención de nombre.
const VISTAS_PROPIAS = ['mi_legajo', 'mi_asignacion', 'mi_hh_dia', 'mi_documento_legajo']

for (const vista of VISTAS_PROPIAS) {
  test(`\`${vista}\` filtra por mi_persona_id(): sin eso publica el plantel entero`, { skip: SIN_BASE }, async () => {
    const { rows } = await query('select pg_get_viewdef($1::regclass, true) as def', [`public.${vista}`])
    assert.equal(rows.length, 1, `la vista \`${vista}\` no existe: «Mi cuenta» queda sin fuente`)
    assert.match(rows[0].def, /mi_persona_id\(\)/,
      `\`${vista}\` perdió su portero y devuelve las filas de todas las personas`)
  })
}

test('nadie más que Administración escribe el vínculo cuenta ↔ persona', { skip: SIN_BASE }, async () => {
  // El grant de `perfiles` para `authenticated` es POR COLUMNA. Si alguien lo cambia por un grant
  // de tabla, la policy `id = auth.uid()` deja de alcanzar: cualquiera podría vincularse el legajo
  // que quiera —o ascenderse a dirección— sobre su propia fila, que la policy permite escribir.
  const { rows } = await query(
    `select column_name from information_schema.column_privileges
      where grantee = 'authenticated' and table_schema = 'public'
        and table_name = 'perfiles' and privilege_type = 'UPDATE' order by 1`,
  )
  assert.deepEqual(rows.map((r) => r.column_name), ['avatar_url', 'nombre', 'telefono'],
    'cambió qué puede escribir un usuario común en `perfiles`: `rol` y `persona_id` no pueden estar')
})
