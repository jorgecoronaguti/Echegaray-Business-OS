// CONTROL INDEPENDIENTE DE LAS QUINCENAS CERRADAS — lo pagado real (dueño, 14/09/2026). SÓLO LECTURA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Que una quincena cerrada vuelva a costearse con el modelo blanco + negro. El auditor midió que el
// modelo da menos que lo pagado (Q2-08: 3,94 M contra 5,16 M). Este test NO usa la fórmula: suma por
// separado `liquidacion_linea` (lo que se pagó) y `recibo_sueldo_linea` (costo empleador y neto) y exige
// que el cálculo de la migración dé ese número, en total y para Reta.
//
//   Σ costo = Σ cobra de las líneas + Σ (costo empleador − neto) de quien tiene línea y recibo
//           + Σ costo empleador de quien tiene recibo y no línea
//           + Σ (medio neto mensual − neto) de los jefes sin línea (1,8 M del dueño)
//
// Corre el cuerpo de la función como SELECT dentro de una transacción READ ONLY: no crea nada.
//
//     ORQ_PG_LECTURA=1 node --test orquestador/lib/costo-cerradas-control.pg.test.mjs

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closePool, getPool } from './db.mjs'

const MIG = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20260915T0800_costo_mo_por_obra.sql'), 'utf8')
const inicio = MIG.indexOf('create or replace function public.costo_mo_quincena_calculo')
const desde = MIG.indexOf('$function$', inicio) + '$function$'.length
const CALCULO = MIG.slice(desde, MIG.indexOf('$function$;', desde)).replaceAll('p_desde', '$1::date').replaceAll('p_obras', '$2::text[]')

const PERMITIDO = process.env.ORQ_PG_LECTURA === '1'
const hayBase = PERMITIDO && await getPool().query('select 1').then(() => true).catch(() => false)
after(() => closePool())

/** Lo que dicen las dos tablas, sumado sin la función. */
const ESPERADO = `
with l as (select l.persona_id, coalesce(l.cobra_manual, l.cobra) as cobra
             from public.liquidacion_linea l join public.liquidacion_quincena lq on lq.id = l.liquidacion_id
            where lq.desde = $1::date),
     r as (select persona_id, neto, costo_total_empleador as cte from public.recibo_sueldo_linea where periodo = $2),
     jefe as (select distinct on (persona_id) persona_id, neto_mensual from public.persona_tarifa
               where neto_mensual is not null order by persona_id, desde)
select (select coalesce(sum(cobra), 0) from l)
     + (select coalesce(sum(r.cte - r.neto), 0) from r join l using (persona_id))
     + (select coalesce(sum(r.cte), 0) from r where not exists (select 1 from l where l.persona_id = r.persona_id))
     + (select coalesce(sum(j.neto_mensual / 2 - r.neto), 0) from r join jefe j using (persona_id)
         where not exists (select 1 from l where l.persona_id = r.persona_id)) as total,
       (select l.cobra + r.cte - r.neto from l join r using (persona_id) join public.personas p on p.id = l.persona_id
         where p.nombre_completo ilike 'RETA RAMON%') as reta`

test('agosto cerrado: el costo es lo pagado + contribuciones, contra las tablas leídas por separado', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin transaction read only')
    for (const [q, periodo] of [['2026-08-01', 'Q1-08/2026'], ['2026-08-16', 'Q2-08/2026']]) {
      const cerrada = (await c.query("select coalesce(bool_and(estado = 'cerrada'), false) as c from public.liquidacion_quincena where desde = $1", [q])).rows[0].c
      assert.equal(cerrada, true, `${q} no está cerrada: el control no aplica`)
      const esperado = (await c.query(ESPERADO, [q, periodo])).rows[0]
      const filas = (await c.query(CALCULO, [q, null])).rows
      const total = filas.reduce((s, f) => s + Number(f.total ?? 0), 0)
      assert.ok(Math.abs(total - Number(esperado.total)) < 0.05, `${q}: la función da ${total} y las tablas ${esperado.total}`)
      if (periodo === 'Q2-08/2026') {
        const reta = (await c.query("select id from public.personas where nombre_completo ilike 'RETA RAMON%'")).rows[0].id
        const suyo = filas.filter((f) => f.persona === reta).reduce((s, f) => s + Number(f.total ?? 0), 0)
        assert.ok(Math.abs(suyo - Number(esperado.reta)) < 0.05, `Reta Q2-08: ${suyo} ≠ ${esperado.reta}`)
        assert.ok(Math.abs(suyo - 898709.58) < 0.05, `Reta Q2-08 medido el 14/09: 898.709,58 y dio ${suyo}`)
      }
    }
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
