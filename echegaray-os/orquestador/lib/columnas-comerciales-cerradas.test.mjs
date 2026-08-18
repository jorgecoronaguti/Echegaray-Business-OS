// EL TOTAL COMERCIAL NO ESTÁ AL ALCANCE DE `authenticated`, Y NINGUNA OTRA COLUMNA SE PERDIÓ.
//
// ═══ POR QUÉ ESTE TEST EXISTE (19/08/2026) ═══
//
// Medido con el token real de un jefe de obra, antes de la migración T1600:
//   `GET /rest/v1/presupuestos?select=monto_presupuestado,margen_esperado` → 200 · 2 filas CON VALOR.
// El enmascarado vivía en las vistas y la tabla de abajo estaba abierta. Un dato protegido en la
// vista y libre en su tabla no está protegido: está disimulado.
//
// La RLS decide QUÉ FILAS, nunca QUÉ COLUMNAS. Lo único que corta por columna es el GRANT por
// columna, y por eso este test mira `information_schema.column_privileges`, que es donde vive la
// decisión — no una consulta, que puede devolver cero filas hoy por casualidad.
//
// ═══ Y LA MITAD QUE NADIE MIRA ═══
//
// El grant se calcula del catálogo en la migración, así que una columna AGREGADA DESPUÉS no queda
// concedida y se vuelve invisible para toda la web. Ese modo de falla es silencioso: la pantalla
// muestra un campo vacío y nadie lo asocia a un permiso. Por eso el test tiene dos mitades: que la
// secreta esté cerrada, y que TODAS las demás estén abiertas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

/**
 * La decisión, en un solo lugar. Cada entrada dice: en esta tabla, `authenticated` no puede leer
 * estas columnas — ni con `select=col`, ni con `select=*`.
 *
 *  · `obra_canonica.monto_contratado` y `presupuestos.monto_presupuestado|margen_esperado` son EL
 *    dato que el dueño declaró secreto para el rol Obras: *"monto total presupuestado / contratado
 *    de la obra; margen calculado usando esos montos"*.
 *  · `personas.retribucion_pactada|dni|cuil` es una decisión DECLARADA y de otro eje: el legajo
 *    operativo se abrió para que la obra pueda trabajar, pero el sueldo y los documentos de una
 *    persona no son información de ejecución de obra. Si el dueño los quiere abiertos, se sacan de
 *    esta lista y el test se pone verde solo.
 */
const CERRADAS = {
  obra_canonica: ['monto_contratado'],
  presupuestos: ['monto_presupuestado', 'margen_esperado'],
  personas: ['retribucion_pactada', 'dni', 'cuil'],
}

const SIN_BASE = !process.env.DATABASE_URL

/** Las columnas que `authenticated` puede leer hoy, según el catálogo. */
async function concedidas(tabla) {
  const { rows } = await query(
    `select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = $1
        and grantee = 'authenticated' and privilege_type = 'SELECT'`,
    [tabla],
  )
  return new Set(rows.map((r) => r.column_name))
}

async function todas(tabla) {
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [tabla],
  )
  return rows.map((r) => r.column_name)
}

for (const [tabla, secretas] of Object.entries(CERRADAS)) {
  test(`${tabla}: authenticated no alcanza lo comercial`, { skip: SIN_BASE }, async () => {
    const puede = await concedidas(tabla)
    const abiertas = secretas.filter((c) => puede.has(c))
    assert.deepEqual(abiertas, [],
      `${tabla}: authenticated PUEDE leer ${abiertas.join(', ')} — el grant de tabla volvió a estar entero`)
  })

  test(`${tabla}: no se perdió ninguna columna que sí se puede leer`, { skip: SIN_BASE }, async () => {
    const puede = await concedidas(tabla)
    const faltan = (await todas(tabla)).filter((c) => !secretas.includes(c) && !puede.has(c))
    assert.deepEqual(faltan, [],
      `${tabla}: estas columnas quedaron sin conceder y la web las ve vacías: ${faltan.join(', ')}`)
  })
}

test('el único camino al monto contratado tiene el portero adentro', { skip: SIN_BASE }, async () => {
  // Una función `security definer` corre como su dueño: si le faltara el `es_administracion()`,
  // devolvería el contrato a cualquiera. Se verifica que las tres lo citan y que fijan `search_path`
  // — una definer sin search_path fijo es una escalada de privilegios esperando a alguien.
  const { rows } = await query(
    `select p.proname, p.prosecdef, pg_get_functiondef(p.oid) as def,
            coalesce(array_to_string(p.proconfig, ','), '') as conf
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('contratado_de_obra', 'presupuesto_monto', 'presupuesto_margen')`,
  )
  assert.equal(rows.length, 3, 'faltan funciones del camino comercial')
  for (const f of rows) {
    assert.ok(f.prosecdef, `${f.proname} no es security definer: no podría leer la columna cerrada`)
    assert.ok(f.def.includes('es_administracion()'),
      `${f.proname} devuelve el dato sin preguntar quién pregunta`)
    assert.ok(f.conf.includes('search_path=public'),
      `${f.proname} es definer y no fija search_path`)
  }
})
