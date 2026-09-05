// LAS SIETE FECHAS, CONTRA POSTGRES — T6000 · T6010 · T6020.
//
// ═══ LOS DEFECTOS QUE MIDE, TODOS VISTOS EN PRODUCCIÓN EL 22/08/2026 ═══
//
//  · la cabecera de la ficha decía «Fin plan 30/01/2026» y el Resumen «fin previsto 27/08/2026»
//    sobre la MISMA obra: 8 de 11 obras con plan tenían las dos fechas distintas;
//  · una obra publicaba «Inicio real 24/08» con fecha de hoy 22/08 —arrancó pasado mañana— y otras
//    cinco declaraban fin real futuro copiando el plan;
//  · `obra_actividad.inicio_real` está vacía en las 350 filas mientras 145 actividades tienen
//    partes de avance con fecha: la evidencia existía y ninguna pantalla la usaba;
//  · la misma actividad aparecía con fecha en una pantalla y sin fecha en otra.
//
// Cada aserción de acá se pone ROJA si se revierte la parte de la migración que la arregla.
//
// El test aplica los .sql en su propia transacción y termina en ROLLBACK: la base viva no se toca.
// Si las vistas YA están aplicadas (después de que el coordinador integre), no aplica nada y mide
// el esquema real — es el patrón de dos épocas de `circuito-productivo-migraciones.mjs`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool } from './db.mjs'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
const ARCHIVOS = [
  '20260822T6000_las_siete_fechas_de_la_actividad_se_definen_una_sola_vez.sql',
  '20260822T6010_las_dos_vistas_grandes_dejan_de_calcular_fechas.sql',
  '20260822T6020_la_obra_publica_las_fechas_de_su_plan_no_otras.sql',
]

/** Aplica las tres migraciones si la cadena todavía no está viva. El centinela es el ÚLTIMO objeto
 *  de la cadena (`obra_fechas`): con el primero puesto y el último no, se aplicaría a medias. */
async function aplicar(client) {
  const { rows } = await client.query("select to_regclass('public.obra_fechas') as v")
  if (rows[0].v) return []
  for (const archivo of ARCHIVOS) {
    try {
      await client.query(await readFile(join(DIR, archivo), 'utf8'))
    } catch (err) {
      err.message = `[${archivo}] ${err.message}`
      throw err
    }
  }
  return ARCHIVOS
}

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('las siete fechas de la actividad y de la obra', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    // EL CANDADO COMPARTIDO. Es una CLAVE, no un identificador: todos los pg-tests que tocan las
    // tablas calientes —`obra_canonica`, `personas`, `cotizaciones`— usan 20260822 y por eso se
    // serializan entre sí. Este archivo no lo tomaba y creaba una FK contra `obra_canonica`, que
    // pide bloqueo exclusivo: con la suite en paralelo, deadlock contra quien tuviera filas de
    // `personas` tomadas. Se libera solo con el rollback.
    await c.query('select pg_advisory_xact_lock(20260822)')
    await aplicar(c)
    const dir = await uno("select id from perfiles where rol='direccion' limit 1")
    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: dir.id, role: 'authenticated' })])

    const OBRA = 'zz-test-fechas-canonicas'
    await q(`insert into obra_canonica (id, nombre, jornada_horas, dias_habiles, estado)
             values ($1, 'ZZ Fechas', 8, '{1,2,3,4,5}', 'activa')`, [OBRA])

    // `metodo_avance` va por defecto en `manual`: el CHECK `obra_actividad_medible_completa` exige
    // unidad y objetivo cuando se mide por cantidad, y las actividades de este test que no miden
    // producción no los tienen.
    const nueva = async (nombre, campos = {}) => {
      const base = { metodo_avance: 'manual', ...campos }
      const cols = ['obra_id', 'nombre', 'tipo', 'orden', 'clave', 'fuente', ...Object.keys(base)]
      const vals = [OBRA, nombre, 'tarea', 9000, `zz:${nombre}`, 'web', ...Object.values(base)]
      const marcas = vals.map((_, i) => `$${i + 1}`).join(',')
      return (await uno(`insert into obra_actividad (${cols.join(',')}) values (${marcas}) returning id`, vals)).id
    }
    const fechas = (id) => uno('select * from actividad_fechas where actividad_id = $1', [id])

    await t.test('las cuatro fechas son CUATRO COSAS DISTINTAS y se publican distintas', async () => {
      // Línea base sellada 01→10/07, plan corrido a 15→20/07, y el trabajo empezó el 12/07.
      const id = await nueva('ZZ cuatro fechas', {
        inicio_base: '2026-07-01', fin_base: '2026-07-10', sellada_en: '2026-07-01T10:00:00Z',
        inicio_plan: '2026-07-15', fin_plan: '2026-07-20',
        metodo_avance: 'cantidad', cantidad_objetivo: 100, unidad: 'm2',
      })
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,'2026-07-12', 30, 'cantidad'), ($1,$2,'2026-07-14', 20, 'cantidad')`, [OBRA, id])
      const f = await fechas(id)
      assert.equal(f.inicio_base.toISOString().slice(0, 10), '2026-07-01')
      assert.equal(f.fin_base.toISOString().slice(0, 10), '2026-07-10')
      assert.equal(f.inicio_plan.toISOString().slice(0, 10), '2026-07-15')
      assert.equal(f.fin_plan.toISOString().slice(0, 10), '2026-07-20')
      // REAL: el primer parte, no el plan ni la base.
      assert.equal(f.inicio_real.toISOString().slice(0, 10), '2026-07-12')
      assert.equal(f.origen_inicio_real, 'parte de avance')
      // La actividad NO terminó (50 de 100 m²): no tiene fin real, tenga partes o no.
      assert.equal(f.fin_real, null, 'el último parte de una actividad abierta no es su cierre')
      assert.equal(f.estado_fecha, 'en_curso')
      // FORECAST: no puede ser anterior a hoy mientras siga abierta.
      assert.ok(f.forecast_fin >= new Date(new Date().toISOString().slice(0, 10)),
        `forecast_fin ${f.forecast_fin} quedó en el pasado con la actividad abierta`)
      assert.equal(f.desvio_plan_dias, 10, 'el plan se corrió 10 días respecto de su línea base')
    })

    await t.test('UN INICIO REAL FUTURO NO SE PUBLICA — ni de un parte, ni declarado a mano', async () => {
      const manana = (await uno("select (current_date + 1)::text d")).d
      const id = await nueva('ZZ real futuro', {
        inicio_plan: '2026-08-01', fin_plan: '2026-08-30',
        metodo_avance: 'cantidad', cantidad_objetivo: 10, unidad: 'm2',
        // Alguien escribió a mano —o lo arrastró el Sheet— un arranque real de mañana.
        inicio_real: manana, fin_real: manana,
      })
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,$3, 1, 'cantidad')`, [OBRA, id, manana])
      const f = await fechas(id)
      assert.equal(f.inicio_real, null, 'un parte con fecha futura no es evidencia de que arrancó')
      assert.equal(f.fin_real, null)
      assert.equal(f.inicio_real_declarado.toISOString().slice(0, 10), manana,
        'lo declarado se conserva como procedencia, rotulado')
      assert.equal(f.estado_fecha, 'planificada', 'tiene plan; lo que no tiene es un hecho')
    })

    await t.test('el fin real aparece cuando la actividad TERMINA, y es la fecha del último parte', async () => {
      const id = await nueva('ZZ terminada', {
        inicio_plan: '2026-07-01', fin_plan: '2026-07-05',
        metodo_avance: 'cantidad', cantidad_objetivo: 10, unidad: 'm2',
      })
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,'2026-07-02', 4, 'cantidad'), ($1,$2,'2026-07-08', 6, 'cantidad')`, [OBRA, id])
      const f = await fechas(id)
      assert.equal(f.fin_real.toISOString().slice(0, 10), '2026-07-08')
      assert.equal(f.estado_fecha, 'terminada')
      assert.equal(f.forecast_fin.toISOString().slice(0, 10), '2026-07-08',
        'lo que ya terminó no tiene proyección: tiene fecha')
    })

    await t.test('declarada al 100 % SIN un solo parte: terminada, pero sin fecha de cierre', async () => {
      // Quattropani tiene cinco así. Con «terminada = hay evidencia» las cinco se contaban
      // atrasadas; con «fin_real sin evidencia» se les inventaba un cierre que nadie registró.
      const id = await nueva('ZZ declarada 100', {
        inicio_plan: '2026-07-01', fin_plan: '2026-07-05', pct: 100,
      })
      const f = await fechas(id)
      assert.equal(f.terminada, true)
      assert.equal(f.estado_fecha, 'terminada')
      assert.equal(f.fin_real, null, 'sin parte no hay fecha de cierre, y no se inventa')
      // Y por lo tanto NO entra en las atrasadas de la obra, aunque su fin de plan ya pasó.
      const atrasada = await uno(`select count(*)::int n from actividad_fechas
        where actividad_id = $1 and fin_plan < current_date and not terminada`, [id])
      assert.equal(atrasada.n, 0, 'lo declarado hecho no está atrasado aunque no tenga partes')
    })

    await t.test('una línea base SIN SELLAR no es línea base', async () => {
      const id = await nueva('ZZ base sin sellar', { inicio_base: '2026-07-01', fin_base: '2026-07-10' })
      const f = await fechas(id)
      assert.equal(f.inicio_base, null)
      assert.equal(f.fin_base, null)
      assert.equal(f.desvio_plan_dias, null, 'sin sello no hay desvío: hay un borrador')
    })

    await t.test('SIN FECHA es un estado, y lo dice la fuente', async () => {
      const id = await nueva('ZZ sin nada')
      const f = await fechas(id)
      assert.equal(f.tiene_fecha, false)
      assert.equal(f.tiene_fecha_plan, false)
      assert.equal(f.estado_fecha, 'sin_fecha')
      assert.equal(f.forecast_fin, null, 'sin plan ni producción no se inventa una fecha de fin')
    })

    await t.test('la vista de control publica las fechas de la fuente, no las de la tabla', async () => {
      const distinto = await q(`
        select c.actividad_id from obra_actividad_control c
        join actividad_fechas f on f.actividad_id = c.actividad_id
        where (c.inicio_real, c.fin_real, c.inicio_plan, c.fin_plan, c.inicio_base, c.fin_base, c.forecast_fin)
              is distinct from
              (f.inicio_real, f.fin_real, f.inicio_plan, f.fin_plan, f.inicio_base, f.fin_base, f.forecast_fin)`)
      assert.equal(distinto.length, 0)
      const crudas = await q(`
        select count(*)::int n from obra_actividad_control c join obra_actividad a on a.id = c.actividad_id
        where a.inicio_real is not null and c.inicio_real is not distinct from a.inicio_real
          and a.inicio_real > current_date`)
      assert.equal(crudas[0].n, 0, 'la vista no puede repetir una fecha real futura de la tabla')
    })

    await t.test('LA CABECERA Y EL RESUMEN DE LA OBRA DICEN LA MISMA FECHA — todas las obras', async () => {
      const difieren = await q(`
        select p.obra_id, p.fecha_fin_plan, v.fin_plan from obra_panel p
        join obra_plan_vs_real v using (obra_id)
        where p.fecha_fin_plan is distinct from v.fin_plan
           or p.fecha_inicio_plan is distinct from v.inicio_plan`)
      assert.deepEqual(difieren, [], 'la cabecera y el Resumen volvieron a tener dos fuentes')
    })

    await t.test('la obra publica el plan de sus actividades, y el declarado aparte', async () => {
      // El formulario dice que termina el 30/06; el plan de sus actividades llega al 20/07.
      await q('update obra_canonica set fecha_fin_plan = $2, fecha_inicio_plan = $3 where id = $1',
        [OBRA, '2026-06-30', '2026-06-01'])
      const p = await uno('select * from obra_panel where obra_id = $1', [OBRA])
      assert.equal(p.fecha_fin_plan.toISOString().slice(0, 10), '2026-08-30')
      assert.equal(p.fecha_fin_plan_declarado.toISOString().slice(0, 10), '2026-06-30')
      assert.equal(p.origen_fechas_plan, 'plan de actividades')
      // Una obra sin una sola actividad con fecha SÍ usa el campo declarado: es todo lo que hay.
      await q(`insert into obra_canonica (id, nombre, estado, fecha_fin_plan)
               values ('zz-test-fechas-sin-plan', 'ZZ Sin plan', 'activa', '2026-09-30')`)
      const s = await uno("select * from obra_panel where obra_id = 'zz-test-fechas-sin-plan'")
      assert.equal(s.fecha_fin_plan.toISOString().slice(0, 10), '2026-09-30')
      assert.equal(s.origen_fechas_plan, 'declarado en la obra')
    })

    await t.test('UNA OBRA NO ARRANCA NI TERMINA EN EL FUTURO, lo declare quien lo declare', async () => {
      await q(`insert into obra_canonica (id, nombre, estado, fecha_inicio_real, fecha_fin_real)
               values ('zz-test-fechas-futura', 'ZZ Futura', 'activa', current_date + 2, current_date + 40)`)
      const o = await uno("select * from obra_panel where obra_id = 'zz-test-fechas-futura'")
      assert.equal(o.fecha_inicio_real, null, 'una obra que arranca pasado mañana no arrancó')
      assert.equal(o.fecha_fin_real, null)
      assert.equal(o.fecha_inicio_real_declarado.toISOString().slice(0, 10),
        (await uno('select (current_date + 2)::text d')).d)
      // Y en TODA la base: ninguna fecha real publicada puede ser futura.
      const futuras = await q(`select obra_id from obra_panel
        where fecha_inicio_real > current_date or fecha_fin_real > current_date`)
      assert.deepEqual(futuras, [])
      const actFuturas = await q(`select actividad_id from actividad_fechas
        where inicio_real > current_date or fin_real > current_date`)
      assert.deepEqual(actFuturas, [])
    })

    await t.test('obra_panel publica el alta de la obra: la línea de tiempo del CRM la necesita', async () => {
      const o = await uno('select creada_en from obra_panel where obra_id = $1', [OBRA])
      assert.ok(o.creada_en, 'sin `creada_en` el CRM se queda sin el evento de alta')
    })

    await t.test('mientras quede trabajo abierto la obra no tiene fin real', async () => {
      const f = await uno('select * from obra_fechas where obra_id = $1', [OBRA])
      assert.ok(f.n_abiertas > 0)
      assert.equal(f.fin_real, null, 'con actividades abiertas la obra no terminó')
      // Dos: la que no tiene nada, y la de la línea base sin sellar — su base es un borrador, no
      // una fecha publicada, y por eso la obra la sigue contando como trabajo sin programar.
      assert.equal(f.n_sin_fecha, 2, 'las que no tienen ninguna fecha se cuentan y se dicen')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
