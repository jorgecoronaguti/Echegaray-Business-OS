// UNA SOLA FUENTE DEL TRABAJO DE UNA OBRA.
//
// Gantt, Lista, Tablero, Próximos, Ejecución y Plan vs Real leen `obra_actividad_control`. Estos
// tests miden que esa vista siga siendo lo que dice ser: la MISMA lista de actividades que la tabla,
// ni una de más ni una de menos, con el avance calculado al lado.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { query } from './db.mjs'

const SIN_BASE = !process.env.DATABASE_URL

test('la vista devuelve EXACTAMENTE las actividades de la tabla', { skip: SIN_BASE }, async () => {
  // ═══ EL DEFECTO QUE ESTE TEST HABRÍA CAZADO ═══
  //
  // La vista devolvía 359 filas contra 350 de la tabla: el nombre del rubro se traía con un join por
  // `(obra_id, codigo)` y en Messina hay tres códigos de resumen repetidos, así que nueve
  // actividades salían DOS VECES. El Gantt las habría dibujado dos veces y el avance promedio de la
  // obra las habría contado dos veces.
  const { rows } = await query(
    `select (select count(*) from obra_actividad)::int as tabla,
            (select count(*) from obra_actividad_control)::int as vista,
            (select count(distinct actividad_id) from obra_actividad_control)::int as distintas`)
  assert.equal(rows[0].vista, rows[0].tabla, 'la vista multiplica o pierde filas')
  assert.equal(rows[0].distintas, rows[0].tabla, 'la vista repite actividades')
})

test('la vista publica todo lo que la tabla tiene y la aplicación usa', { skip: SIN_BASE }, async () => {
  // Sólo las cuatro columnas de bookkeeping del sincronizador pueden faltar: la aplicación no las
  // lee y publicarlas sería exponer el mecanismo del import en la pantalla.
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'obra_actividad'
        and column_name not in (
          select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'obra_actividad_control')`)
  assert.deepEqual(rows.map((r) => r.column_name).sort(),
    ['creado_en', 'fuente', 'fuente_fila', 'sincronizado_en'])
})

test('el avance calculado nunca se pasa de 100 ni sale de la nada', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select count(*) filter (where avance_pct > 100)::int as pasados,
            count(*) filter (where avance_pct is not null and origen_avance is null)::int as huerfanos
       from obra_actividad_control`)
  assert.equal(rows[0].pasados, 0)
  // Un avance sin origen sería un número que la pantalla no puede explicar de dónde salió.
  assert.equal(rows[0].huerfanos, 0)
})

test('un parte de ejecución dice algo: cantidad o avance, nunca los dos en blanco', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    'select count(*)::int as n from obra_ejecucion where cantidad is null and avance_pct is null')
  assert.equal(rows[0].n, 0)
})

test('LAS HORAS NO SE GUARDAN DOS VECES: `obra_ejecucion` no tiene columna de horas', { skip: SIN_BASE }, async () => {
  // Un parte con sus propias horas al lado de `registros_hh` sería la misma hora cargada dos veces,
  // y la liquidación futura no sabría cuál contar. La fuente canónica de tiempo es una sola.
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'obra_ejecucion'
        and column_name ~* 'hora|hh|persona|cuadrilla'`)
  assert.deepEqual(rows, [])
})
