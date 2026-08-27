// XSAS v1 CONTRA LA BASE REAL — lo que ninguna función pura puede probar.
//
// Acá no se afirma el estado del mundo («hay 116 duraciones»): eso cambia solo y el test se pondría
// rojo sin que se rompa nada. Se prueban INVARIANTES: que la vista diga lo mismo que la estructura,
// que correr dos veces no duplique, que el permiso exista, y que el efecto de la migración esté en
// su destino y no en la pantalla que dijo que sí.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aprenderDotacion } from './xsas-dotacion.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Corre `fn` con una conexión propia dentro de una transacción que SIEMPRE se deshace. */
async function enTransaccion(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await fn(c)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

test('es_trabajo dice lo mismo que la estructura: agrupa o es hito', { skip: !hayBase }, async () => {
  // El rótulo `tipo` lo puso una importación y puede mentir; tener hijas no. La vista tiene que
  // coincidir con la estructura fila por fila, no aproximadamente.
  const { rows } = await getPool().query(`
    select count(*)::int discrepancias
      from public.xsas_actividad v
      join public.obra_actividad a on a.id = v.actividad_id
     where v.es_trabajo is distinct from (
             a.tipo is distinct from 'hito'
             and not exists (select 1 from public.obra_actividad h where h.actividad_padre_id = a.id))`)
  assert.equal(rows[0].discrepancias, 0)
})

test('dotacion_por_hh cuenta personas que IMPUTARON, no asignadas', { skip: !hayBase }, async () => {
  // El defecto que esta columna existe para evitar: `dotacion_real` cae a `obra_asignacion` cuando
  // nadie imputó, y aprender de ahí sería aprender de una planilla en vez de la obra.
  const { rows } = await getPool().query(`
    select count(*)::int discrepancias
      from public.xsas_actividad v
     where v.dotacion_por_hh is distinct from (
             select count(distinct h.persona_id)::int from public.registros_hh h
              where h.actividad_id = v.actividad_id)`)
  assert.equal(rows[0].discrepancias, 0)
})

test('ninguna duración aprendida sale de una fila que no es trabajo', { skip: !hayBase }, async () => {
  // El efecto se lee en su destino. La migración borró las que había y el filtro impide que vuelvan:
  // sin las dos mitades, la capa fósil sobrevive al arreglo.
  const { rows } = await getPool().query(`
    select count(*)::int n from public.duracion_historica d
      join public.xsas_actividad v on v.actividad_id = d.actividad_id
     where v.es_trabajo is false`)
  assert.equal(rows[0].n, 0)
})

test('dotacion_historica se puede leer con el rol de la app: policy MÁS grant', { skip: !hayBase }, async () => {
  // Una policy sin GRANT es un permiso denegado, y Next lo muestra como un 404 vacío. Se prueba
  // como `authenticated`, que es quien lo va a pedir de verdad.
  await enTransaccion(async (c) => {
    await c.query("set local role authenticated")
    const { rows } = await c.query('select count(*)::int n from public.dotacion_historica')
    assert.ok(Number.isInteger(rows[0].n))
  })
})

test('reutilizable pide DOS obras: con una hay un dato, no una referencia', { skip: !hayBase }, async () => {
  await enTransaccion(async (c) => {
    const { rows: [t] } = await c.query('select id from public.tarea_tipo where activo is not false limit 1')
    const { rows: acts } = await c.query(
      `select id, obra_id from public.obra_actividad where archivada is not true limit 2`)
    if (acts.length < 2) return
    await c.query('delete from public.duracion_historica where tarea_tipo_id = $1', [t.id])

    const meter = (a, obra, clave) => c.query(
      `insert into public.duracion_historica
         (actividad_id, obra_id, tarea_tipo_id, actividad_nombre, dias_plan, dias_real,
          estado, confianza, clave)
       values ($1,$2,$3,'X',5,6,'CANDIDATO','alta',$4)`, [a, obra, t.id, clave])

    await meter(acts[0].id, 'obra-uno', 'test:dur:1')
    const { rows: [una] } = await c.query(
      'select duracion_reutilizable from public.experiencia_por_tarea where tarea_tipo_id = $1', [t.id])
    assert.equal(una.duracion_reutilizable, false, 'una obra no alcanza')

    await meter(acts[1].id, 'obra-dos', 'test:dur:2')
    const { rows: [dos] } = await c.query(
      'select duracion_reutilizable, casos_duracion from public.experiencia_por_tarea where tarea_tipo_id = $1', [t.id])
    assert.equal(dos.duracion_reutilizable, true)
    assert.equal(dos.casos_duracion, 2)
  })
})

test('el aprendizaje de dotación es idempotente: dos corridas, las mismas filas', { skip: !hayBase }, async () => {
  await enTransaccion(async (c) => {
    const query = (sql, params) => c.query(sql, params)
    const antes = await c.query('select count(*)::int n from public.dotacion_historica')
    const uno = await aprenderDotacion({ query })
    const medio = await c.query('select count(*)::int n from public.dotacion_historica')
    const dos = await aprenderDotacion({ query })
    const fin = await c.query('select count(*)::int n from public.dotacion_historica')
    assert.equal(uno.medidas, dos.medidas)
    assert.equal(medio.rows[0].n, fin.rows[0].n, 'la segunda corrida no agregó filas')
    assert.ok(fin.rows[0].n >= antes.rows[0].n)
  })
})

test('el costo por tarea se declara no disponible, no sale NULL', { skip: !hayBase }, async () => {
  // NULL se lee como «todavía no se midió». Acá no es que falte el dato: es que no hay de dónde
  // sacarlo, y son dos cosas distintas que producen dos decisiones distintas.
  const { rows } = await getPool().query(
    'select count(*)::int n from public.experiencia_por_tarea where costo_por_tarea is null')
  assert.equal(rows[0].n, 0)
})
