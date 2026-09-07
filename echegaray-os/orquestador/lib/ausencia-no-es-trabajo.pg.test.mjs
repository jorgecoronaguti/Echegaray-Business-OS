// UNA AUSENCIA NO PUEDE SUMAR HORAS TRABAJADAS A UNA OBRA — contra la base real, en transacción.
//
// ═══ POR QUÉ ESTE TEST TIENE QUE EXISTIR ═══
//
// `registros_hh.horas` tiene `CHECK (horas > 0)`, así que una ausencia NO se guarda como cero: se
// guarda con las horas de la jornada y `tipo_hora = 'ausencia'`. Eso hace que la regla «una
// ausencia tiene horas y no es trabajo» sea IMPOSIBLE de sostener desde TypeScript: la decide cada
// consulta SQL que suma `horas`, y basta con que una se olvide del filtro para que el consumo de HH
// de una obra crezca con los días que la gente faltó.
//
// La auditoría del 07/09/2026 encontró tres vistas sin el filtro, y `obra_plan_vs_real.hh_real` —el
// insumo del plan contra real y del margen forecast— era una de ellas. Un test unitario no podía
// verlo: el defecto no estaba en ninguna función, estaba en la definición de la vista.
//
// ═══ NO ESCRIBE NADA ═══
//
// Todo corre dentro de `begin … rollback`. Es la única forma honesta de probar esto: para observar
// el efecto hay que insertar una ausencia REAL en una obra REAL, y dejarla ahí sería fabricar un día
// que nadie faltó — exactamente lo que este trabajo ya rompió una vez.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const TRABAJADAS = ['normal', 'extra_50', 'extra_100']

test('una ausencia no entra en las HH reales de la obra', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const uno = async (sql, params) => (await c.query(sql, params)).rows[0]

  try {
    await c.query('begin')
    // El mismo advisory lock que el resto de los pg-tests que tocan las tablas calientes: sin él,
    // dos corridas en paralelo sobre `registros_hh` se traban entre sí. Se libera con el rollback.
    await c.query('select pg_advisory_xact_lock(20260822)')

    const obra = await uno(`select id from public.obra_canonica where estado = 'activa' order by id limit 1`)
    const persona = await uno(`select persona_id from public.obra_asignacion where hasta is null order by persona_id limit 1`)
    if (!obra || !persona) {
      t.skip('La base no tiene una obra activa con alguien asignado: no hay dónde observar el efecto.')
      return
    }

    // Una fecha lejana y sin datos: así lo que se mide es la fila de este test y no una de producción.
    const FECHA = '2031-03-05'

    const antes = await uno(
      'select coalesce(hh_real, 0) hh from public.obra_plan_vs_real where obra_id = $1', [obra.id])

    const insertar = (tipo, horas) => c.query(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora, fuente_legacy)
       values ($1, $2, $3::date, $3::date, $4, $5, 'pg-test:ausencia')`,
      [obra.id, persona.persona_id, FECHA, horas, tipo])

    // ── 1 · LA AUSENCIA NO MUEVE `hh_real` ──────────────────────────────────────────────────────
    await insertar('ausencia', 8.8)
    const conAusencia = await uno(
      'select coalesce(hh_real, 0) hh from public.obra_plan_vs_real where obra_id = $1', [obra.id])
    assert.equal(
      Number(conAusencia.hh), Number(antes?.hh ?? 0),
      'una ausencia de 8,8 hs subió las HH reales de la obra: el plan contra real y el margen '
      + 'forecast están contando como trabajo un día que la persona no vino',
    )

    // ── 2 · Y UNA HORA TRABAJADA SÍ LA MUEVE ────────────────────────────────────────────────────
    // Sin esta mitad, la de arriba pasaría también con una vista que devuelve siempre cero: un
    // control que no puede dar rojo no es un control.
    await insertar('normal', 5)
    const conTrabajo = await uno(
      'select coalesce(hh_real, 0) hh from public.obra_plan_vs_real where obra_id = $1', [obra.id])
    assert.equal(
      Number(conTrabajo.hh) - Number(antes?.hh ?? 0), 5,
      'la vista tiene que seguir sumando las horas trabajadas: si no, el filtro las apagó todas',
    )

    // ── 3 · NINGUNA VISTA QUE TOTALICE HH DE OBRA PUEDE OLVIDARSE DEL FILTRO ────────────────────
    // El control estructural: no depende de que alguien se acuerde de escribir un test por vista.
    // `subcontrato_*` quedan fuera a propósito y con motivo: no totalizan la obra, leen la fila que
    // una persona eligió al crear el aporte (`r.id = a.registros_hh_id`).
    const sinFiltro = await c.query(
      `select c.relname
         from pg_depend d
         join pg_rewrite rw on rw.oid = d.objid
         join pg_class c on c.oid = rw.ev_class
         join pg_class t on t.oid = d.refobjid
        where t.relname = 'registros_hh'
          and c.relname <> 'registros_hh'
          and c.relname not in ('subcontrato_costo', 'subcontrato_aporte_detalle')
          and pg_get_viewdef(c.oid, true) not like '%tipo_hora%'
        group by c.relname order by c.relname`)
    assert.deepEqual(
      sinFiltro.rows.map((r) => r.relname), [],
      'estas vistas leen registros_hh y no miran tipo_hora: están sumando ausencias como trabajo',
    )

    // ── 4 · Y EL FILTRO ES EL DE `tipoHora.ts`, no uno inventado por vista ──────────────────────
    const def = await uno(`select pg_get_viewdef('public.obra_plan_vs_real'::regclass, true) d`)
    for (const t of TRABAJADAS) {
      assert.ok(def.d.includes(`'${t}'`), `el filtro de obra_plan_vs_real no incluye ${t}`)
    }
    assert.ok(!/'ausencia'/.test(def.d.split('registros_hh r')[1]?.slice(0, 400) ?? ''),
      'la ausencia no puede estar en la lista de lo que se cuenta como trabajo')
  } finally {
    // ROLLBACK SIEMPRE. Este test inserta horas en una obra viva para poder ver el efecto; dejarlas
    // sería fabricar una jornada que nadie trabajó.
    await c.query('rollback')
    c.release()
  }
})
