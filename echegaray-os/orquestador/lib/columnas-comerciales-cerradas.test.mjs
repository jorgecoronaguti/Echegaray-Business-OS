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
  // `public.obras` es la tabla LEGACY: cuatro filas, todas pausadas o cerradas. Su contrato es un
  // contrato igual, y dejarlo abierto obligaba a explicar por qué el mismo dato está cerrado en una
  // tabla y libre en la de al lado. Esa explicación no existía.
  obras: ['monto_contratado'],
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

test('el contexto interno no queda ciego: sin JWT la función sí devuelve el dato', { skip: SIN_BASE }, async () => {
  // ═══ EL MODO DE FALLA QUE ESTO PREVIENE NO REVIENTA: MIENTE (19/08/2026) ═══
  //
  // `orquestador/lib/estado-empresa.mjs` lee `obra_panel.monto_contratado` por conexión directa,
  // como `postgres`. Ahí no hay JWT, `es_administracion()` devuelve false —falla cerrado, como se
  // diseñó— y la función devolvía NULL: el estado de la empresa habría contado las ocho obras como
  // «sin contrato», sin un solo error. Ningún test de permisos lo habría visto, porque desde el
  // punto de vista de los permisos estaba funcionando perfecto.
  //
  // Este test corre POR CONEXIÓN DIRECTA, así que mide exactamente ese contexto.
  const { rows: [antes] } = await query(
    `select monto_contratado from public.obra_canonica where id = 'san-francisco'`)
  try {
    await query(`update public.obra_canonica set monto_contratado = 987654321 where id = 'san-francisco'`)
    const { rows: [r] } = await query(
      `select monto_contratado from public.obra_panel where obra_id = 'san-francisco'`)
    assert.equal(Number(r.monto_contratado), 987654321,
      'el contexto interno (pg_cron, el orquestador) dejó de ver el contrato: las rutinas mienten en silencio')
  } finally {
    await query(`update public.obra_canonica set monto_contratado = $1 where id = 'san-francisco'`,
      [antes?.monto_contratado ?? null])
    const { rows: [fin] } = await query(
      `select monto_contratado from public.obra_canonica where id = 'san-francisco'`)
    assert.equal(fin.monto_contratado, antes?.monto_contratado ?? null,
      'quedó el centinela del test escrito en el contrato de una obra real')
  }
})

test('las dos vistas legacy no las lee authenticated', { skip: SIN_BASE }, async () => {
  // Publican contrato, presupuesto, margen y pendiente de certificar de la tabla legacy, y son
  // `security_invoker`. Ningún archivo de `src/` las consulta; su único consumidor corre como dueño.
  for (const vista of ['obra_resumen_economico', 'obra_ejecucion_financiera']) {
    const { rows } = await query(
      `select 1 from information_schema.role_table_grants
        where table_schema = 'public' and table_name = $1
          and grantee = 'authenticated' and privilege_type = 'SELECT'`,
      [vista],
    )
    assert.equal(rows.length, 0,
      `${vista} volvió a ser legible por authenticated y publica el cuadro comercial entero`)
  }
})

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
    assert.ok(f.def.includes('auth.uid() is null'),
      `${f.proname} dejaría ciego al contexto interno (pg_cron, el orquestador): mentiría en silencio`)
    assert.ok(f.conf.includes('search_path=public'),
      `${f.proname} es definer y no fija search_path`)
  }
})
