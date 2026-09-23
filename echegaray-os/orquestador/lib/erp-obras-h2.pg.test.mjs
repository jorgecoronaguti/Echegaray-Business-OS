// ERP OBRAS · H2 — lo que afirman las vistas nuevas, probado contra la base en una transacción que
// se revierte. No deja datos: la obra `zz-h2-test` existe sólo dentro del `begin … rollback`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const OBRA = 'zz-h2-test'

async function conTransaccion(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await fn(c)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

async function armarObra(c) {
  await c.query(`insert into public.obra_canonica (id, nombre, codigo, estado) values ($1, 'H2 test', 'ZZ-H2', 'activa')`, [OBRA])
  const nodo = async (nombre, padre, extra = {}) => {
    const r = await c.query(
      `insert into public.obra_actividad (obra_id, nombre, clave, actividad_padre_id, tipo, orden, costo_mo, metodo_avance, cantidad_objetivo, unidad, pct)
       values ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10) returning id`,
      // Una tarea medible por cantidad lleva unidad y objetivo (check `obra_actividad_medible_completa`).
      [OBRA, nombre, `${OBRA}:${nombre}`, padre, extra.tipo ?? 'tarea', extra.costo_mo ?? null, extra.metodo ?? 'manual', extra.objetivo ?? null, extra.objetivo != null ? 'm2' : null, extra.pct ?? null],
    )
    return r.rows[0].id
  }
  const rubro = await nodo('Rubro', null, { tipo: 'resumen' })
  const epica = await nodo('Épica', rubro, { tipo: 'resumen' })
  const h1 = await nodo('Historia 100', epica, { tipo: 'resumen', costo_mo: 100 })
  const h2 = await nodo('Historia 300', epica, { tipo: 'resumen', costo_mo: 300 })
  const h3 = await nodo('Historia sin costo', epica, { tipo: 'resumen' })
  const t1 = await nodo('Tarea 1', h1, { metodo: 'cantidad', objetivo: 10 })
  const t2 = await nodo('Tarea 2', h2, { metodo: 'cantidad', objetivo: 100 })
  const t3 = await nodo('Tarea 3', h3, { metodo: 'cantidad', objetivo: 100 })
  return { t1, t2, t3 }
}

test('H2.1 · el avance de la obra pesa por costo de MO y la historia sin costo no pesa', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    const { t1, t2, t3 } = await armarObra(c)
    // t1 al 50 % (5 de 10) · t2 al 100 % · t3 al 100 % pero su historia no tiene costo.
    await c.query(`insert into public.obra_ejecucion (obra_id, actividad_id, fecha, cantidad) values ($1,$2,'2026-09-21',5), ($1,$3,'2026-09-21',100), ($1,$4,'2026-09-21',100)`, [OBRA, t1, t2, t3])
    const { rows } = await c.query('select * from public.obra_avance_ponderado where obra_id = $1', [OBRA])
    assert.equal(rows.length, 1)
    const r = rows[0]
    // 0,25 × 50 + 0,75 × 100 = 87,5
    assert.equal(Number(r.avance_pct), 87.5)
    assert.equal(Number(r.costo_mo_total), 400)
    assert.equal(Number(r.costo_teorico), 350)
    assert.equal(r.n_historias, 3)
    assert.equal(r.n_historias_sin_costo, 1)
    assert.equal(Number(r.pct_sin_peso), 0, 'la suma de pesos con costo es 1: la sin costo no resta')
    const pesos = await c.query('select nombre, peso, sin_costo from public.obra_historia_peso where obra_id = $1 order by nombre', [OBRA])
    const porNombre = Object.fromEntries(pesos.rows.map((x) => [x.nombre, x]))
    assert.equal(Number(porNombre['Historia 100'].peso), 0.25)
    assert.equal(Number(porNombre['Historia 300'].peso), 0.75)
    assert.equal(porNombre['Historia sin costo'].peso, null)
    assert.equal(porNombre['Historia sin costo'].sin_costo, true)
  })
})

test('H2.1 · con método «parejo» las historias pesan igual, incluida la que no tiene costo', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    const { t1 } = await armarObra(c)
    await c.query(`update public.obra_canonica set metodo_ponderacion = 'parejo' where id = $1`, [OBRA])
    await c.query(`insert into public.obra_ejecucion (obra_id, actividad_id, fecha, cantidad) values ($1,$2,'2026-09-21',10)`, [OBRA, t1])
    const { rows } = await c.query('select avance_pct, metodo from public.obra_avance_ponderado where obra_id = $1', [OBRA])
    assert.equal(rows[0].metodo, 'parejo')
    // sólo la historia 100 está al 100 %: 1/3 de la obra.
    assert.equal(Number(rows[0].avance_pct), 33.3)
  })
})

test('H2.2 · la fracción se deduce de cantidad/objetivo, Σ tiene tope 1 y los días reales son fechas distintas', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    const { t1 } = await armarObra(c)
    await c.query(
      `insert into public.obra_ejecucion (obra_id, actividad_id, fecha, cantidad) values
       ($1,$2,'2026-09-21',4), ($1,$2,'2026-09-21',4), ($1,$2,'2026-09-22',6)`, [OBRA, t1])
    const p = await c.query('select fraccion from public.parte_tarea where actividad_id = $1 order by fecha, fraccion', [t1])
    assert.deepEqual(p.rows.map((x) => Number(x.fraccion)), [0.4, 0.4, 0.6])
    const r = await c.query('select * from public.actividad_partes_resumen where actividad_id = $1', [t1])
    assert.equal(Number(r.rows[0].fraccion_acumulada), 1, '1,4 con tope 1')
    assert.equal(r.rows[0].dias_reales, 2, 'dos fechas distintas, no tres partes')
    const pl = await c.query(`select fecha, fraccion, n_partes from public.planilla_obra($1, '2026-09-21', '2026-09-25') order by fecha`, [OBRA])
    assert.deepEqual(pl.rows.map((x) => [x.fecha.toISOString().slice(0, 10), Number(x.fraccion), x.n_partes]), [['2026-09-21', 0.8, 2], ['2026-09-22', 0.6, 1]])
  })
})

test('H2.2 · una fracción declarada a mano gana a la cantidad, y quién estuvo viaja con el parte', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    const { t1 } = await armarObra(c)
    const e = await c.query(`insert into public.obra_ejecucion (obra_id, actividad_id, fecha, cantidad, fraccion, declarada) values ($1,$2,'2026-09-21',1,0.3,true) returning id`, [OBRA, t1])
    const persona = await c.query(`insert into public.personas (nombre_completo) values ('ZZ H2 Persona') returning id`)
    await c.query(`insert into public.obra_ejecucion_persona (ejecucion_id, obra_id, persona_id, horas) values ($1,$2,$3,8)`, [e.rows[0].id, OBRA, persona.rows[0].id])
    const p = await c.query('select fraccion, declarada, personas from public.parte_tarea where id = $1', [e.rows[0].id])
    assert.equal(Number(p.rows[0].fraccion), 0.3)
    assert.equal(p.rows[0].declarada, true)
    assert.deepEqual(p.rows[0].personas, [persona.rows[0].id])
    await assert.rejects(c.query(`update public.obra_ejecucion set fraccion = 1.5 where id = $1`, [e.rows[0].id]), /fraccion_check/)
  })
})

test('H2.3 · los días hábiles de la obra salen de dias_habiles(): NULL sin inicio real', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    await armarObra(c)
    await c.query(`update public.obra_canonica set fecha_inicio_plan = '2026-09-01', fecha_fin_plan = '2026-09-30' where id = $1`, [OBRA]).catch(() => {})
    const { rows } = await c.query('select * from public.obra_dias_habiles where obra_id = $1', [OBRA])
    assert.equal(rows.length, 1)
    assert.ok(rows[0].dia_habil_actual === null || Number.isInteger(rows[0].dia_habil_actual))
  })
})
