// XSAS NO PUEDE VOLVER A TENER SU PROPIA IDEA DEL AVANCE — el test que lo impide.
//
// La razón de ser de `xsas_actividad` es NO recalcular nada: leer avance, HH, fechas y cierre de
// `obra_actividad_control`, que es la definición que usa la app. Eso no tenía ninguna prueba, así
// que alguien podía reintroducir un `max(e.avance_pct)` en la vista y los 9.365 tests seguían
// verdes — que fue exactamente cómo apareció el defecto la primera vez.
//
// Esta prueba compara las dos vistas fila por fila sobre la base viva. No inventa datos: mide lo que
// haya cargado. Si no hay base, se saltea.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('xsas_actividad es una LECTURA de obra_actividad_control, no un segundo cálculo', { skip: !hayBase }, async () => {
  const { rows } = await getPool().query(`
    select
      count(*)::int filas,
      count(*) filter (where x.avance_pct     is distinct from c.avance_pct)::int      dif_avance,
      count(*) filter (where x.hh_real        is distinct from c.hh_real)::int         dif_hh,
      count(*) filter (where x.hh_improductivas is distinct from c.hh_improductivas)::int dif_improd,
      count(*) filter (where x.inicio_real    is distinct from c.inicio_real)::int     dif_inicio,
      count(*) filter (where x.fin_real       is distinct from c.fin_real)::int        dif_fin,
      count(*) filter (where x.cantidad_real  is distinct from c.cantidad_ejecutada)::int dif_cantidad,
      count(*) filter (where x.terminada      is distinct from (c.estado_fecha = 'terminada'))::int dif_terminada,
      count(*) filter (where x.plan_hh        is distinct from c.hh_plan)::int         dif_plan_hh
    from public.xsas_actividad x
    join public.obra_actividad_control c on c.actividad_id = x.actividad_id`)
  const r = rows[0]
  assert.ok(r.filas > 0, 'sin filas esta prueba no mide nada')
  for (const [k, v] of Object.entries(r)) {
    if (k === 'filas') continue
    assert.equal(v, 0, `${k}: ${v} de ${r.filas} filas no coinciden con la vista canónica`)
  }
})

test('un fin real nunca aparece sin cierre, y un cierre sumado queda marcado', { skip: !hayBase }, async () => {
  const { rows } = await getPool().query(`
    select count(*) filter (where fin_real is not null and not terminada)::int fin_sin_cierre,
           count(*) filter (where avance_sumado)::int con_avance_sumado
      from public.xsas_actividad`)
  assert.equal(rows[0].fin_sin_cierre, 0, 'hay actividades con fecha de fin sin estar terminadas')
  // No se afirma cuántas hay —cambia con los datos—: se afirma que la columna existe y se puede
  // consultar, que es lo que el ciclo necesita para no inventarles la cantidad.
  assert.ok(Number.isInteger(rows[0].con_avance_sumado))
})
