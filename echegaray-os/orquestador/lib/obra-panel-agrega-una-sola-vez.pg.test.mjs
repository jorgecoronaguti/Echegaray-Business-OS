// `obra_panel` AGREGA UNA SOLA VEZ — CONTRA LA BASE REAL.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE LA VISTA VUELVA A RECORRER `obra_restriccion` UNA VEZ POR OBRA. La definición que
//      `20260912T1400` reemplaza tenía DOS subconsultas escalares correlacionadas
//      —`(select count(*) from obra_restriccion where obra_id = oc.id …)`— en la lista de selección:
//      dos `Seq Scan` por obra, 48 recorridos de la tabla por lectura. El test lo mide en el plan:
//      la forma vieja tiene que salir con `loops > 1` y la nueva con `loops = 1`. Si alguien revierte
//      el `group by` + `left join`, la segunda afirmación se pone roja.
//  2 · QUE EL ARREGLO CAMBIE UN VALOR. `except` en los dos sentidos entre la vista que instala la
//      migración y la definición vieja: cero filas de cada lado, todas las obras. Un `left join` en
//      lugar de un `count(*)` publica `null` donde había `0` — es el error natural de este cambio y
//      el `coalesce(…, 0)` es lo único que lo impide.
//  3 · QUE SE MUEVA EL CONTRATO. 37 columnas, mismo orden, mismo nombre y mismo OID de tipo. De
//      `obra_panel` cuelgan `cliente_panel`, `cliente_economia` y `obra_plan_vs_real`: una columna
//      corrida de lugar rompe un `create or replace` o, peor, entra y cambia de significado.
//  4 · QUE LA MIGRACIÓN ESTÉ EN EL REPO Y NO EN LA BASE. Se aplica el archivo y se lee el efecto.
//
// ═══ POR QUÉ PIDE `ORQ_PG_DDL=1` ═══
//
// Aplica la migración DENTRO de una transacción que termina en ROLLBACK. El rollback deshace la
// vista, pero el DDL ya disparó `pgrst_ddl_watch`: cada `create` manda a PostgREST a recargar el
// esquema y cada recarga frena ~1,5 s a todo el que esté usando la app. Por eso no corre solo:
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/obra-panel-agrega-una-sola-vez.pg.test.mjs
//
// ═══ POR QUÉ LA DEFINICIÓN VIEJA ESTÁ ESCRITA ACÁ ═══
//
// Es un FÓSIL DELIBERADO, no una segunda definición viva: es el único lado contra el cual se puede
// afirmar «el arreglo no cambió ningún valor». Leerla con `pg_get_viewdef` en vez de pinearla haría
// que, una vez aplicada la migración en producción, el test comparara la nueva contra la nueva — un
// control que no puede decir que no. Si `obra_panel` cambia de verdad algún día, este archivo se
// actualiza o se borra junto con el cambio; lo que no puede es quedar comparando contra nada.
//
// LOS NÚMEROS NO SE CLAVAN: las obras, las compras y el avance se espejan solos del Sheet. Se
// comparan DOS LECTURAS de la misma base en la misma transacción.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260912T1400_obra_panel_agrega_una_sola_vez.sql'), 'utf8')

/** La definición que `20260912T1400` reemplaza, tal como `pg_get_viewdef` la devolvía el 12/09/2026
 *  (instalada por `20260911T2000`). Sin el `;` final para poder usarla como subconsulta. */
const VIEJA = `
 SELECT oc.id AS obra_id, oc.nombre, oc.cliente_id, cl.slug AS cliente_slug,
    COALESCE(cl.nombre_comercial, oc.cliente_texto) AS cliente_nombre, oc.cliente_texto,
    oc.estado, oc.tipo, oc.etapa, oc.jefe_obra, oc.orden,
    contratado_de_obra(oc.id) AS monto_contratado,
    f.inicio_plan AS fecha_inicio_plan, f.fin_plan AS fecha_fin_plan,
    f.inicio_real AS fecha_inicio_real, f.fin_real AS fecha_fin_real,
    oc.drive_carpeta_id, ocr.costo_real, ocr.n_comprobantes, ocr.costo_mano_de_obra,
    av.avance_pct, av.n_medidas::integer AS n_actividades_medidas,
    av.n_actividades::integer AS n_actividades,
    av.n_sin_planificar::integer AS n_actividades_sin_planificar,
    av.sincronizado_en AS avance_sincronizado_en,
    ( SELECT count(*)::integer AS count
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text) AS restricciones_abiertas,
    ( SELECT count(*)::integer AS count
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text
            AND r.fecha_compromiso IS NOT NULL AND r.fecha_compromiso < CURRENT_DATE)
        AS restricciones_vencidas,
    f.inicio_plan_declarado AS fecha_inicio_plan_declarado,
    f.fin_plan_declarado AS fecha_fin_plan_declarado,
    f.inicio_real_declarado AS fecha_inicio_real_declarado,
    f.fin_real_declarado AS fecha_fin_real_declarado,
    f.origen_fechas_plan, f.origen_inicio_real, f.forecast_fin,
    f.n_sin_fecha AS n_actividades_sin_fecha, oc.created_at AS creada_en, oc.obra_padre_id
   FROM obra_canonica oc
     LEFT JOIN clientes cl ON cl.id = oc.cliente_id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_avance av ON av.obra_id = oc.id
     LEFT JOIN obra_fechas f ON f.obra_id = oc.id
  WHERE oc.fusionada_en IS NULL`

/** Techo de humo, no la medición. `obra_panel` se midió en 37 ms de ejecución como Dirección; esta
 *  base la comparten los timers y otros agentes, así que un techo ajustado se pondría rojo por
 *  contención ajena. 400 ms es 10× lo medido: deja pasar el ruido y sigue delatando un plan que se
 *  degradó de verdad (la forma vieja con `obra_restriccion` poblada, por ejemplo). */
const TECHO_MS = 400

/** Las líneas del plan que escanean una tabla, con su cantidad de ejecuciones. */
function recorridosDe (plan, tabla) {
  return plan.split('\n')
    .filter((l) => l.includes(` on ${tabla} `) || l.includes(` on ${tabla}(`))
    .map((l) => ({ linea: l.trim(), loops: Number(/loops=(\d+)/.exec(l)?.[1] ?? 0) }))
}

const DDL_PERMITIDO = process.env.ORQ_PG_DDL === '1'
const hayBase = DDL_PERMITIDO
  && await getPool().query('select 1').then(() => true).catch(() => false)

test('obra_panel: agrega una sola vez y publica lo mismo', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  /** El plan de `explain (analyze)` como UN texto. */
  const plan = async (sql) =>
    (await q(`explain (analyze, buffers) ${sql}`)).map((r) => r['QUERY PLAN']).join('\n')
  try {
    await c.query('begin')

    // COMO DIRECCIÓN, igual que la pantalla: `obra_panel` no es `security_invoker` pero sus hijas
    // filtran por `es_administracion()` / `ve_obra()`, así que leerla como `postgres` mediría otra
    // vista que la que sirve /clientes.
    const direccion = await uno(
      `select id from perfiles where rol='direccion' and es_prueba = false limit 1`)
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer el panel')
    await q(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])

    const obras = (await uno(
      `select count(*)::int n from obra_canonica where fusionada_en is null`)).n
    assert.ok(obras >= 2,
      `hay ${obras} obra(s) sin fusionar: con una sola fila un agregado por obra y uno global son ` +
      'indistinguibles y este test no podría dar rojo')

    // ═══ EL DEFECTO, MEDIDO EN LA FORMA VIEJA ═══
    //
    // Se explica la definición vieja COMO SUBCONSULTA (no hace falta que esté desplegada): una
    // subconsulta escalar correlacionada se ejecuta una vez por fila de la vista, así que
    // `obra_restriccion` sale con `loops` = cantidad de obras. Esto es lo que la migración saca, y
    // es la prueba de que la afirmación de abajo puede ponerse roja.
    await t.test('la forma vieja recorre obra_restriccion una vez por obra', async () => {
      const p = await plan(`select * from (${VIEJA}) z`)
      const r = recorridosDe(p, 'obra_restriccion')
      assert.ok(r.length > 0, 'el plan de la forma vieja no escanea obra_restriccion: leé el plan')
      assert.ok(r.some((x) => x.loops > 1),
        'la forma vieja ya no recorre obra_restriccion por obra — entonces este test dejó de ' +
        `medir el defecto que la migración arregla: ${JSON.stringify(r)}`)
    })

    // EL ARREGLO. `set local role` no hace falta para el DDL: la conexión es la dueña del esquema.
    await c.query(MIGRACION)

    await t.test('la vista desplegada recorre obra_restriccion una sola vez', async () => {
      const p = await plan('select * from public.obra_panel')
      const r = recorridosDe(p, 'obra_restriccion')
      assert.ok(r.length > 0,
        'el plan de la vista nueva no escanea obra_restriccion: si el join se fue, las dos ' +
        'columnas de restricciones dejaron de publicar el dato')
      for (const x of r) {
        assert.equal(x.loops, 1,
          `obra_restriccion se recorre ${x.loops} veces: volvió el agregado por obra · ${x.linea}`)
      }
      const ms = Number(/Execution Time: ([\d.]+)/.exec(p)[1])
      assert.ok(ms < TECHO_MS, `obra_panel tardó ${ms} ms (techo de humo ${TECHO_MS} ms)`)
    })

    await t.test('no cambió ningún valor: except en los dos sentidos', async () => {
      const falta = (await uno(
        `select count(*)::int n from (select * from public.obra_panel
                                     except select * from (${VIEJA}) z) d`)).n
      const sobra = (await uno(
        `select count(*)::int n from (select * from (${VIEJA}) z
                                     except select * from public.obra_panel) d`)).n
      assert.equal(falta, 0, `${falta} fila(s) de la vista nueva no están en la vieja`)
      assert.equal(sobra, 0, `${sobra} fila(s) de la vista vieja no están en la nueva`)
      const n = (await uno('select count(*)::int n from public.obra_panel')).n
      assert.equal(n, obras, 'la vista nueva no publica una fila por obra sin fusionar')
    })

    await t.test('el contrato de columnas no se movió', async () => {
      const nueva = await c.query('select * from public.obra_panel limit 0')
      const vieja = await c.query(`select * from (${VIEJA}) z limit 0`)
      const firma = (r) => r.fields.map((f) => `${f.name}:${f.dataTypeID}`)
      assert.deepEqual(firma(nueva), firma(vieja),
        'cambió el nombre, el orden o el tipo de alguna columna: de obra_panel cuelgan ' +
        'cliente_panel, cliente_economia y obra_plan_vs_real')
      assert.equal(nueva.fields.length, 37, 'obra_panel dejó de publicar 37 columnas')
    })

    // EL PORTERO. `create or replace view` sin `with (security_invoker = true)` BORRA la opción, y
    // eso ya pasó TRES veces con esta vista (20260910T1900, 20260911T2000 y la que hubiera sido esta
    // migración). Sin la opción, `obra_panel` corre como `postgres` y saltea el RLS de
    // `obra_canonica` y `clientes`. `vistas-security-invoker.test.mjs` lo vigila para todas las
    // vistas; acá se vigila para ESTA migración, que es la que puede borrarlo.
    await t.test('la vista sigue corriendo con el RLS de quien pregunta', async () => {
      const opts = (await uno(
        `select coalesce(array_to_string(reloptions, ','), '') o
           from pg_class where oid = 'public.obra_panel'::regclass`)).o
      assert.ok(opts.includes('security_invoker=true'),
        `obra_panel quedó con reloptions «${opts}»: el replace borró security_invoker y la vista ` +
        'saltea el RLS de obra_canonica y clientes')
    })

    // EL `grant` POR COLUMNA SOBREVIVE AL REPLACE. Sin esto, /clientes leería «permission denied»
    // para `authenticated` y la pantalla quedaría en blanco sin que ningún test de valores lo note.
    await t.test('authenticated sigue pudiendo leer las 37 columnas', async () => {
      const n = (await uno(
        `select count(*)::int n from information_schema.column_privileges
          where table_schema='public' and table_name='obra_panel'
            and grantee='authenticated' and privilege_type='SELECT'`)).n
      assert.equal(n, 37, `authenticated ve ${n} de 37 columnas de obra_panel`)
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
