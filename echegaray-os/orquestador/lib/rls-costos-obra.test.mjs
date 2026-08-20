// EL ESPEJO DE COMPRAS NO SE ESCRIBE DESDE LA WEB — Y ESO SE MIDE EN EL CATÁLOGO.
//
// ═══ POR QUÉ ESTE TEST EXISTE (20/08/2026) ═══
//
// `costos_obra` nació con `for insert to authenticated with check (true)` y
// `for update to authenticated using (true)`. Medido con tokens reales antes de corregirlo:
//
//   campo (su obra)      lee 303 · PATCH 204 → REESCRIBIÓ · POST 201 → INSERTÓ
//   campo (obra ajena)   lee 303 · PATCH 204 → no escribió · POST 201 → INSERTÓ
//   jefe_obra            lee 858 · PATCH 204 → REESCRIBIÓ · POST 201 → INSERTÓ
//   direccion            lee 858 · PATCH 204 → REESCRIBIÓ · POST 201 → INSERTÓ
//
// El UPDATE quedaba tapado a medias por la policy de SELECT —Postgres exige poder LEER la fila para
// actualizarla cuando la referencia un `where`—, así que el agujero se veía más chico de lo que era.
// El INSERT no tenía nada que lo tapara: `with check (true)` deja meter una compra inventada en
// CUALQUIER obra, incluso en una que el usuario no ve. Y `obra_costo_real` suma `costos_obra` sin
// mirar `origen`, mientras que el sync sólo borra las filas de `origen='compras_sheet'`: una fila
// inyectada con otro origen infla el costo de esa obra PARA SIEMPRE y ningún refresco la limpia.
//
// ═══ POR QUÉ MIRA EL CATÁLOGO Y NO HACE UN PATCH ═══
//
// La prueba con tokens reales vive en `tests/autorizacion-por-obra.spec.ts` y necesita red, cuentas
// y el navegador. Ésta corre en `npm run orq:test` en dos milisegundos y fija la FORMA: si alguien
// vuelve a crear la policy, o repone el grant "para que la web pueda guardar", el rojo aparece acá
// mucho antes de que nadie corra el E2E. Las dos hacen falta: una mide el efecto, ésta la causa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

const SIN_BASE = !process.env.DATABASE_URL

/** Lo único que una sesión de usuario puede hacer sobre el espejo. */
const PERMITIDO = ['SELECT']

test('`costos_obra` es de sólo lectura para cualquier sesión de usuario', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select distinct privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'costos_obra'
        and grantee in ('authenticated', 'anon')
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') order by 1`,
  )
  assert.deepEqual(rows.map((r) => r.privilege_type), PERMITIDO,
    'alguien le devolvió permiso de escritura al espejo de Compras: lo que se escriba ahí se pierde '
    + 'en el próximo sync, y mientras tanto miente el costo real de la obra')
})

test('`costos_obra` tampoco tiene el grant por columna, que es la puerta de atrás', { skip: SIN_BASE }, async () => {
  // Un `grant update (total) on costos_obra to authenticated` no aparece en role_table_grants.
  // Ya pasó en `perfiles`, donde el grant por columna es justamente lo que hace de cerradura.
  const { rows } = await query(
    `select privilege_type, column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'costos_obra'
        and grantee in ('authenticated', 'anon')
        and privilege_type in ('INSERT', 'UPDATE') order by 1, 2`,
  )
  assert.deepEqual(rows, [], `hay grant de escritura por columna en costos_obra: ${JSON.stringify(rows)}`)
})

test('la única policy de `costos_obra` es la lectura acotada por obra', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select polname, polcmd, pg_get_expr(polqual, polrelid) as usando
       from pg_policy where polrelid = 'public.costos_obra'::regclass order by polname`,
  )
  assert.equal(rows.length, 1,
    `costos_obra tiene ${rows.length} policies: sobra alguna de escritura (${rows.map((r) => r.polname).join(', ')})`)
  assert.equal(rows[0].polcmd, 'r', 'la policy que quedó no es de SELECT')
  assert.match(rows[0].usando, /ve_obra_texto\(/,
    'la lectura de costos_obra dejó de acotarse por obra: volvió a ser using(true)')
})

test('el RLS de `costos_obra` sigue encendido', { skip: SIN_BASE }, async () => {
  // Sin esto, las tres pruebas de arriba pasarían con la tabla abierta de par en par: una policy
  // sobre una tabla con `disable row level security` no se aplica y no avisa.
  const { rows } = await query(
    "select relrowsecurity from pg_class where oid = 'public.costos_obra'::regclass",
  )
  assert.equal(rows[0].relrowsecurity, true, 'costos_obra quedó con el RLS apagado')
})
