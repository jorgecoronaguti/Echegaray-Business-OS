// EL PARECIDO, EN UNA PASADA Y EN LA CORRELACIONADA: PAR POR PAR, CONTRA LA BASE REAL.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// `20260911T0120` cambia la FORMA del filtro del abono mensual —la subconsulta por fila pasa a ser
// `count(*) over (partition by …)`— y no su criterio. Un cambio de forma que se cuela con otra
// respuesta es el peor de todos: la campanita y el KPI de la pantalla 24 seguirían dibujando un
// número plausible. Los pares se comparan uno por uno contra la implementación CORRELACIONADA,
// escrita acá abajo a mano, sobre los 767 comprobantes reales.
//
// La referencia vive en el test y no en la base a propósito: así el test compara contra el criterio
// declarado aunque la migración ya esté aplicada. Leer la vista vieja de la base convertiría esto en
// una tautología el día después de aplicar.
//
// ═══ Y ATRAPA LA VUELTA ATRÁS SILENCIOSA ═══
//
// El tercer subtest mira los BLOQUES del buffer pool, no el reloj: 247.765 antes, 320 después. Una
// medición de tiempo en un test es una moneda al aire —esta base se satura—, la de bloques es
// determinística. Si alguien reescribe el guardián como subconsulta por fila, la respuesta sigue
// siendo correcta y este subtest se pone rojo igual.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260911T0120_el_parecido_se_calcula_en_una_pasada.sql'), 'utf8')

/** LA IMPLEMENTACIÓN DE REFERENCIA: la vista tal como la escribió 20260821T5500, con el guardián del
 *  abono mensual como subconsulta correlacionada. Es el criterio contra el que se mide. */
const REFERENCIA = `
  select nuevo.id as comprobante_id, viejo.id as parecido_a_id,
         abs(nuevo.fecha_emision - viejo.fecha_emision) as dias_de_distancia
    from public.comprobantes_arca nuevo
    join public.comprobantes_arca viejo
      on  viejo.tipo_libro = nuevo.tipo_libro
      and nullif(regexp_replace(coalesce(viejo.emisor_cuit, ''), '\\D', '', 'g'), '')
        = nullif(regexp_replace(coalesce(nuevo.emisor_cuit, ''), '\\D', '', 'g'), '')
      and round(coalesce(viejo.imp_total, 0), 2) = round(coalesce(nuevo.imp_total, 0), 2)
      and round(coalesce(nuevo.imp_total, 0), 2) <> 0
      and public.comprobante_signo(nuevo.tipo_comprobante) is not null
      and public.comprobante_signo(viejo.tipo_comprobante) = public.comprobante_signo(nuevo.tipo_comprobante)
      and public.comprobante_letra(nuevo.tipo_comprobante) is not null
      and public.comprobante_letra(viejo.tipo_comprobante) = public.comprobante_letra(nuevo.tipo_comprobante)
      and viejo.fecha_emision is not null
      and abs(nuevo.fecha_emision - viejo.fecha_emision) <= 35
      and (coalesce(viejo.punto_venta, ''), coalesce(viejo.numero, ''))
       is distinct from (coalesce(nuevo.punto_venta, ''), coalesce(nuevo.numero, ''))
      and (viejo.fecha_emision, viejo.created_at, viejo.id) < (nuevo.fecha_emision, nuevo.created_at, nuevo.id)
   where nuevo.fecha_emision is not null
     and (select count(*) from public.comprobantes_arca r
           where r.tipo_libro = nuevo.tipo_libro
             and nullif(regexp_replace(coalesce(r.emisor_cuit, ''), '\\D', '', 'g'), '')
               = nullif(regexp_replace(coalesce(nuevo.emisor_cuit, ''), '\\D', '', 'g'), '')
             and round(coalesce(r.imp_total, 0), 2) = round(coalesce(nuevo.imp_total, 0), 2)) < 3`

/** Los bloques que la nueva forma NO puede volver a pasar. Medido: 320. El techo es generoso a
 *  propósito —el dato crece— pero deja afuera por dos órdenes de magnitud a la forma vieja. */
const TECHO_DE_BLOQUES = 50_000

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('el parecido en una pasada dice lo mismo que la subconsulta por fila', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql) => (await c.query(sql)).rows
  try {
    await c.query('begin')
    // ═══ EL MUTEX DEL DDL EN LA BASE COMPARTIDA (12/09/2026) ═══
    //
    // Este test aplica una migración DENTRO de la transacción, así que toma locks ACCESS EXCLUSIVE
    // sobre las vistas que recrea. Los 16 tests que ya tomaban este mismo advisory lock se
    // serializaban entre ellos y quedaban expuestos a los que NO lo tomaban: medido el 12/09 en la
    // corrida completa, `rls-obra-no-por-fila` murió con «canceling statement due to lock timeout» y
    // `vinculacion-estandar` con «statement timeout» aplicando T6100, las dos pasando solas. El lock
    // se pide ANTES de cualquier otra cosa: quien hace DDL acá, primero toma el turno.
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query(MIGRACION)

    const admin = (await q(`select id from perfiles where rol in ('direccion','administracion') and es_prueba = false limit 1`))[0]
    assert.ok(admin, 'no hay perfil de dirección ni de administración en la base')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
    await c.query('set local role authenticated')

    const clave = (f) => `${f.comprobante_id}→${f.parecido_a_id}:${f.dias_de_distancia}`

    await t.test('los mismos pares, uno por uno', async () => {
      const nuevos = (await q(
        'select comprobante_id, parecido_a_id, dias_de_distancia from public.comprobante_posible_duplicado',
      )).map(clave).sort()
      const referencia = (await q(REFERENCIA)).map(clave).sort()
      // NO SE COMPARAN CANTIDADES: dos listas de 14 pares distintos también dan 14. Se comparan los
      // pares, que es lo que la pantalla dibuja y lo que el KPI cuenta.
      assert.deepEqual(nuevos, referencia)
      // Y la lista no puede estar vacía, o el subtest de arriba pasaría comparando nada con nada.
      assert.ok(referencia.length > 0, 'la referencia no encontró ningún par: el test no probó nada')
    })

    await t.test('el KPI de duplicados sin resolver no se movió', async () => {
      const porLaVista = Number((await q(`
        select count(*) n from public.comprobante_compra k
         where k.tiene_posible_duplicado and k.estado_control = 'sin_revisar'`))[0].n)
      const porLaReferencia = Number((await q(`
        select count(*) n from (select distinct r.comprobante_id from (${REFERENCIA}) r) x
          join public.comprobante_compra k on k.id = x.comprobante_id
         where k.estado_control = 'sin_revisar'`))[0].n)
      assert.equal(porLaVista, porLaReferencia)
    })

    await t.test('cuenta con una ventana, no con una consulta por fila', async () => {
      const plan = (await q(`
        explain (analyze, buffers, format text)
        select count(*) from public.comprobante_compra k
         where k.tiene_posible_duplicado and k.estado_control = 'sin_revisar'`))
        .map((f) => f['QUERY PLAN']).join('\n')
      assert.match(plan, /WindowAgg/,
        'el plan no usa WindowAgg: el guardián del abono volvió a ser una subconsulta por fila')
      const bloques = [...plan.matchAll(/shared hit=(\d+)/g)]
        .reduce((m, x) => Math.max(m, Number(x[1])), 0)
      assert.ok(bloques > 0, 'el plan no reportó bloques: `buffers` dejó de pedirse')
      assert.ok(bloques < TECHO_DE_BLOQUES,
        `contar los duplicados tocó ${bloques} bloques (techo ${TECHO_DE_BLOQUES}). La forma vieja `
        + 'tocaba 247.765: alguien volvió a la subconsulta correlacionada.')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
