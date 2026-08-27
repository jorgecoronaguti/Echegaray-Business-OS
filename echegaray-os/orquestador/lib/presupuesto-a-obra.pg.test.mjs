// EL PUENTE PRESUPUESTO → OBRA, CONTRA LA BASE VIVA.
//
// Los tests puros de `presupuesto-a-obra.test.mjs` prueban el CRITERIO del auditor. Éstos prueban el
// EFECTO: que el disparador siembra donde tiene que sembrar, que no siembra dos veces la misma
// cantidad, y que sobre los datos reales no queda ningún concepto perdido.
//
// La siembra se prueba insertando actividades de mentira dentro de una transacción que SIEMPRE se
// deshace. No se toca un dato real: el `rollback` está en el `finally`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { auditarPartida, resumirTraspaso, VEREDICTO } from './presupuesto-a-obra.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Inserta una actividad de prueba. `clave` es NOT NULL en la tabla, así que va siempre. */
async function actividad(c, clave, campos) {
  const cols = Object.keys(campos)
  const sql = `insert into public.obra_actividad (clave, ${cols.join(', ')})
               values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) returning id`
  const { rows } = await c.query(sql, [clave, ...cols.map((k) => campos[k])])
  return rows[0].id
}

test('el plan físico se siembra en la actividad que lleva la cantidad, y en ninguna otra', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const { rows: [b] } = await c.query(`
      select a.obra_id, a.cotizacion_partida_id, a.unidad,
             (select count(*) from public.cotizacion_partida_composicion x
               where x.partida_id = a.cotizacion_partida_id)::int lineas
        from public.obra_actividad a
       where a.cotizacion_partida_id is not null and a.tipo = 'tarea' limit 1`)
    assert.ok(b && b.lineas > 0, 'sin una partida con composición congelada esta prueba no mide nada')

    const comun = { obra_id: b.obra_id, unidad: b.unidad, cantidad_objetivo: 10, cotizacion_partida_id: b.cotizacion_partida_id }
    const rubro = await actividad(c, 'pg:rubro', { obra_id: b.obra_id, nombre: 'RUBRO PRUEBA', tipo: 'resumen', rol_estructura: 'rubro', orden: 90001 })
    const bajoRubro = await actividad(c, 'pg:bajo-rubro', { ...comun, nombre: 'TAREA BAJO RUBRO', tipo: 'tarea', orden: 90002, actividad_padre_id: rubro })
    const frente = await actividad(c, 'pg:frente', { ...comun, nombre: 'FRENTE PRUEBA', tipo: 'resumen', rol_estructura: 'frente', orden: 90003, actividad_padre_id: rubro })
    const bajoFrente = await actividad(c, 'pg:bajo-frente', { ...comun, nombre: 'PASO BAJO FRENTE', tipo: 'tarea', orden: 90004, actividad_padre_id: frente })
    const sinPartida = await actividad(c, 'pg:sin-partida', { obra_id: b.obra_id, nombre: 'SIN PARTIDA', tipo: 'tarea', orden: 90005, unidad: 'm2', cantidad_objetivo: 5 })

    const n = async (id) => (await c.query('select count(*)::int n from public.obra_actividad_insumo_plan where actividad_id = $1', [id])).rows[0].n
    // Una tarea que cuelga del rubro es la única de su frente: lleva el plan.
    assert.equal(await n(bajoRubro), b.lineas)
    // Un frente lo lleva por sus hijos — y sus hijos NO, o el material se contaría una vez por paso.
    assert.equal(await n(frente), b.lineas)
    assert.equal(await n(bajoFrente), 0)
    // Una actividad que no viene de un presupuesto no tiene de dónde heredar nada.
    assert.equal(await n(sinPartida), 0)

    // Y la cuenta es la de la oferta escalada, no una copia del unitario.
    const { rows: [linea] } = await c.query(`
      select i.cantidad_unitaria, i.desperdicio, i.cantidad_plan
        from public.obra_actividad_insumo_plan i where i.actividad_id = $1 order by i.orden limit 1`, [bajoRubro])
    assert.equal(
      Number(linea.cantidad_plan),
      Number(linea.cantidad_unitaria) * 10 * (1 + Number(linea.desperdicio ?? 0)),
    )
  } finally {
    await c.query('rollback')
    c.release()
  }
})

test('sobre los datos reales, el traspaso presupuesto → obra no pierde ningún concepto', { skip: !hayBase }, async () => {
  const pool = getPool()
  const { rows: partidas } = await pool.query(`
    select distinct p.id, p.descripcion, p.rubro, p.unidad, p.cantidad, p.tarea_tipo_id, p.analisis_id,
           p.subcontratada, coalesce(p.hs_unitarias, ac.hs_unitarias) as hs_unitarias
      from public.cotizacion_partida p
      left join public.analisis_costo ac on ac.analisis_id = p.analisis_id
     where exists (select 1 from public.obra_actividad a where a.cotizacion_partida_id = p.id)`)
  assert.ok(partidas.length > 0, 'ninguna partida se convirtió todavía: esta prueba no mide nada')

  const auditorias = []
  for (const partida of partidas) {
    const [act, comp, plan, cuad] = await Promise.all([
      pool.query(`select id, tipo, rol_estructura, nombre, tarea_tipo_id, unidad, cantidad_objetivo, hh_plan,
                         dotacion_prevista, fin_plan, cotizacion_partida_id, partida_codigo, fuente
                    from public.obra_actividad where cotizacion_partida_id = $1`, [partida.id]),
      pool.query('select orden, recurso_codigo, recurso_nombre, tipo, cantidad from public.cotizacion_partida_composicion where partida_id = $1', [partida.id]),
      pool.query('select tipo, recurso_codigo, cantidad_plan from public.obra_actividad_insumo_plan where cotizacion_partida_id = $1', [partida.id]),
      pool.query('select sum(cantidad) as n from public.analisis_cuadrilla where analisis_id = $1', [partida.analisis_id]),
    ])
    auditorias.push(auditarPartida({
      partida, actividades: act.rows, composicion: comp.rows, insumosPlan: plan.rows,
      cuadrillaTipo: cuad.rows[0]?.n ?? null,
    }))
  }

  const r = resumirTraspaso(auditorias)
  const rotos = r.porConcepto.filter((f) => f.perdido > 0)
    .map((f) => `${f.concepto}: ${f.perdido} de ${r.partidas} partidas — ${f.rompe}`)
  assert.deepEqual(rotos, [], `el puente pierde información:\n  ${rotos.join('\n  ')}`)
  assert.equal(r.puenteIntacto, true)
})

test('el material de una partida no se cuenta dos veces: la suma de las actividades con plan es la cantidad de la partida', { skip: !hayBase }, async () => {
  const { rows } = await getPool().query(`
    select p.id, p.descripcion, p.cantidad::numeric as partida,
           sum(a.cantidad_objetivo)::numeric as con_plan
      from public.cotizacion_partida p
      join (select distinct actividad_id, cotizacion_partida_id from public.obra_actividad_insumo_plan) i
        on i.cotizacion_partida_id = p.id
      join public.obra_actividad a on a.id = i.actividad_id
     where p.cantidad is not null
     group by p.id, p.descripcion, p.cantidad`)
  assert.ok(rows.length > 0, 'sin plan sembrado esta prueba no mide nada')
  const desiguales = rows.filter((r) => Math.abs(Number(r.partida) - Number(r.con_plan)) > 1e-4)
    .map((r) => `${r.descripcion}: partida ${r.partida} vs actividades con plan ${r.con_plan}`)
  assert.deepEqual(desiguales, [], `el plan de materiales se cuenta de más o de menos:\n  ${desiguales.join('\n  ')}`)
})

test('ninguna línea del plan físico lleva precio: el costo de la oferta vive en un solo lugar', { skip: !hayBase }, async () => {
  const { rows } = await getPool().query(`
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'obra_actividad_insumo_plan'
       and (column_name ilike '%costo%' or column_name ilike '%precio%' or column_name ilike '%importe%')`)
  assert.deepEqual(rows, [], 'el plan físico incorporó una columna de plata: sería la segunda versión del costo de la oferta')
})

test('el plan físico está al alcance de quien ve la obra — RLS no es GRANT', { skip: !hayBase }, async () => {
  const { rows } = await getPool().query(`
    select privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'obra_actividad_insumo_plan'
       and grantee = 'authenticated' and privilege_type = 'SELECT'`)
  assert.equal(rows.length, 1, 'sin GRANT SELECT la política más generosa devuelve denied, y Next lo muestra como un 404 mudo')
  const { rows: pol } = await getPool().query(`
    select policyname from pg_policies where schemaname = 'public' and tablename = 'obra_actividad_insumo_plan'`)
  assert.ok(pol.length >= 2, 'faltan políticas de lectura y de escritura')
})

test('el auditor sabe de qué veredictos habla', { skip: !hayBase }, () => {
  assert.deepEqual(Object.values(VEREDICTO), ['CONSERVADO', 'PERDIDO', 'NO_LO_SABIA'])
})
