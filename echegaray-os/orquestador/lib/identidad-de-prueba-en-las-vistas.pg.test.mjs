// UNA CUENTA DE PRUEBA VE A LAS PERSONAS DE PRUEBA · UNA REAL NO — la migración, contra los datos
// REALES y con las dos caras de la pregunta.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA PERSONA REAL DESAPAREZCA. Es el riesgo grande y el que nadie nota: una liquidación
//      sin un obrero no se ve rota, se ve corta. Se compara el conjunto de personas REALES que cada
//      vista publica ANTES y DESPUÉS, fila por fila, con la misma sesión.
//  2 · QUE LA REGLA SE INVIERTA. «La sesión de prueba ve lo de prueba» implementado como filtro que
//      se queda SÓLO con lo de prueba deja la pantalla de esa cuenta con una fila. Se exige
//      superconjunto: todas las reales MÁS las de prueba.
//  3 · QUE LA CUENTA REAL VUELVA A VERLAS. Es el hallazgo del 11/09 (Convenios decía «18 sin piso»).
//      Se mide en las TRES vistas, no en la que se tocó último.
//  4 · QUE `persona_plantel` SIGA SIN FILTRAR. Hoy publica «[PRUEBA E2E] QA Campo» a cualquier
//      cuenta real que asigne gente a una obra: el test mide ese ANTES y exige que el DESPUÉS lo
//      cierre. Un control que no puede mostrar el defecto que arregla no prueba nada.
//  5 · QUE LA FUNCIÓN NAZCA SIN PERMISO — o con uno de más. `authenticated` la ejecuta, `anon` no.
//      Una vista `security_invoker = true` que llama a una función sin `execute` responde
//      «permission denied» y se cae ENTERA, para todos.
//  6 · QUE FALLE ABIERTO SIN SESIÓN. Sin `sub` en el JWT la función tiene que decir `false`: un
//      `true` ahí publicaría las identidades de prueba a todo el mundo, que es lo contrario.
//
// La migración se aplica DENTRO de la transacción y todo termina en ROLLBACK: no deja nada escrito.
// Aplicarla es del dueño, desde el árbol principal.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260912T1200_una_cuenta_de_prueba_ve_a_las_personas_de_prueba.sql'), 'utf8')

// ═══ ESTE TEST NO CORRE SOLO, Y ES UNA DECISIÓN DE PRODUCCIÓN (11/09/2026) ═══
//
// Aplica DDL adentro de una transacción. El ROLLBACK deshace los objetos, pero el DDL YA disparó
// `pgrst_ddl_watch`: cada `create` manda a PostgREST a recargar el esquema y cada recarga frena
// ~1,5 s a todo el que esté usando la app. Por eso pide `ORQ_PG_DDL=1` explícito.
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/identidad-de-prueba-en-las-vistas.pg.test.mjs
const DDL_PERMITIDO = process.env.ORQ_PG_DDL === '1'
const hayBase = DDL_PERMITIDO
  && await getPool().query('select 1').then(() => true).catch(() => false)

/** El JWT que ve la base. `set local` muere con la transacción: no se filtra a otra sesión. */
const comoUsuario = (uuid) =>
  `set local role authenticated;
   set local request.jwt.claims = '{"sub":"${uuid}","role":"authenticated"}';`

const VISTAS = ['persona_directorio', 'persona_legajo', 'persona_plantel']

test('la migración destapa lo de prueba SÓLO para quien existe para probar', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')

    // ── LAS DOS IDENTIDADES SALEN DE LA BASE, NO DE UNA CONSTANTE ─────────────────────────────
    //
    // Clavar los uuid acá haría que el test se pusiera rojo el día que alguien recree una cuenta, y
    // ese rojo no sería un defecto del producto. Las dos tienen que poder LEER las vistas, así que
    // las dos son de nivel Administración (`es_administracion()` es el portero de `persona_legajo`).
    const [real] = await q(`select id, nombre from public.perfiles
                             where es_prueba is not true and rol in ('direccion','administracion')
                             order by creado_en nulls last limit 1`)
    const [prueba] = await q(`select id, nombre from public.perfiles
                               where es_prueba is true and rol in ('direccion','administracion')
                               limit 1`)
    assert.ok(real, 'no hay ninguna cuenta REAL de Administración: el test no puede medir nada')
    assert.ok(prueba, 'no hay ninguna cuenta DE PRUEBA de Administración (perfiles.es_prueba)')

    const [{ n: personasDePrueba }] = await q(
      'select count(*)::int n from public.personas where es_prueba is true and en_la_empresa')
    assert.ok(personasDePrueba > 0,
      'no hay ninguna persona marcada como prueba: el test daría verde por vacío')

    /** Lo que una vista le publica a una sesión. Siempre en la MISMA transacción. */
    const publicaA = async (uuid, vista) => {
      await c.query(comoUsuario(uuid))
      const filas = await q(`select id, nombre_completo from public.${vista} order by id`)
      await c.query('reset role')
      return filas
    }

    // ── EL ANTES ──────────────────────────────────────────────────────────────────────────────
    const antes = {}
    for (const v of VISTAS) antes[v] = await publicaA(real.id, v)

    // EL DEFECTO QUE SE VIENE A ARREGLAR, MEDIDO: hoy `persona_plantel` le publica las identidades
    // de prueba a una cuenta real. Si esto ya fuera false, el punto 4 de esta migración no tendría
    // objeto y habría que revisar por qué.
    const plantelAntesTenia = antes.persona_plantel.some((f) => /E2E|^\s*\[PRUEBA/i.test(f.nombre_completo))
    assert.equal(plantelAntesTenia, true,
      '`persona_plantel` ya no publicaba identidades de prueba: revisar si otra migración se adelantó')

    await c.query(MIGRACION)

    await t.test('la cuenta REAL no ve NINGUNA identidad de prueba, en las tres vistas', async () => {
      for (const v of VISTAS) {
        const filas = await publicaA(real.id, v)
        const coladas = filas.filter((f) => /E2E|^\s*\[PRUEBA/i.test(f.nombre_completo))
        assert.deepEqual(coladas, [], `${v} le publicó una identidad de prueba a una cuenta real`)
      }
    })

    await t.test('y NO PIERDE NI UNA PERSONA REAL: el conjunto de antes, entero', async () => {
      for (const v of VISTAS) {
        const reales = antes[v].filter((f) => !/E2E|^\s*\[PRUEBA/i.test(f.nombre_completo))
        const despues = await publicaA(real.id, v)
        assert.deepEqual(
          despues.map((f) => f.id), reales.map((f) => f.id),
          `${v} cambió qué personas REALES publica: esconder a alguien de la liquidación es el `
          + 'defecto peor, porque nadie nota a quien falta')
      }
    })

    await t.test('la cuenta DE PRUEBA las ve — y sigue viendo a todas las reales', async () => {
      for (const v of VISTAS) {
        const filas = await publicaA(prueba.id, v)
        const deReal = await publicaA(real.id, v)
        const dePrueba = filas.filter((f) => /E2E|^\s*\[PRUEBA/i.test(f.nombre_completo))
        assert.ok(dePrueba.length > 0,
          `${v} tampoco se las muestra a una cuenta de prueba: el E2E de horas sigue siendo imposible`)
        // SUPERCONJUNTO, no «otra lista»: el defecto de invertir el filtro daría verde sin esto.
        const ids = new Set(filas.map((f) => f.id))
        for (const f of deReal) {
          assert.ok(ids.has(f.id),
            `${v} le escondió ${f.nombre_completo} a la cuenta de prueba: el filtro se invirtió`)
        }
      }
    })

    await t.test('la persona del E2E de horas está, con su id exacto', async () => {
      const filas = await publicaA(prueba.id, 'persona_directorio')
      assert.ok(filas.some((f) => f.id === 'e2e00000-0000-4000-8000-000000000001'),
        'la persona sobre la que escribe `liquidacion-escribe-horas.spec.ts` no aparece en el '
        + 'directorio ni para una cuenta de prueba')
    })

    await t.test('sin sesión la respuesta es NO: falla cerrado', async () => {
      const [{ f }] = await q('select public.sesion_es_de_prueba() f')
      assert.equal(f, false, 'sin `sub` en el JWT la función dijo true: publicaría lo de prueba a todos')
    })

    await t.test('la función nace con permiso para `authenticated` y sin permiso para `anon`', async () => {
      const [p] = await q(`
        select has_function_privilege('authenticated', 'public.sesion_es_de_prueba()', 'execute') auth,
               has_function_privilege('anon',          'public.sesion_es_de_prueba()', 'execute') anon,
               has_function_privilege('service_role',  'public.sesion_es_de_prueba()', 'execute') svc`)
      assert.equal(p.auth, true, 'sin execute, `persona_directorio` (security_invoker) se cae ENTERA')
      assert.equal(p.anon, false)
      assert.equal(p.svc, true)
    })

    await t.test('las tres vistas conservan sus columnas y sus GRANT', async () => {
      for (const v of VISTAS) {
        const [p] = await q(
          `select has_table_privilege('authenticated', 'public.${v}', 'select') lee`)
        assert.equal(p.lee, true, `${v} perdió el grant de select: la pantalla responde 401`)
      }
      // `persona_legajo` sigue siendo el ÚNICO camino al CUIL: si perdiera la columna, Recibos
      // dejaría de tener con qué identificar a nadie y no lo diría.
      const [l] = await q(`select count(*)::int n from information_schema.columns
                            where table_schema='public' and table_name='persona_legajo' and column_name='cuil'`)
      assert.equal(l.n, 1)
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
