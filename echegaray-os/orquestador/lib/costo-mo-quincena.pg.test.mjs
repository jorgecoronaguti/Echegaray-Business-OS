// PARIDAD SQL ↔ JS DEL COSTO DE MANO DE OBRA, SOBRE LOS DATOS REALES — SÓLO LECTURA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Que `costo_mo_quincena_calculo` (SQL, la definición que leen las pantallas) y
// `costoManoDeObraDeLaQuincena` (JS, la que prueban los tests sin base) se separen. Son dos
// implementaciones de la misma regla del dueño; sin esta comparación, el primer cambio en una sola
// publica un costo por obra que los tests siguen dando por bueno.
//
// ═══ POR QUÉ NO TOCA LA BASE ═══
//
// No crea la función: toma su CUERPO de la migración 20260915T0800 y lo corre como SELECT dentro de una
// transacción READ ONLY. No hay DDL, así que no dispara la recarga de esquema de PostgREST, y funciona
// antes de aplicar la migración. Medido el 14/09/2026: 0 diferencias en 37, 37 y 39 filas (01/08, 16/08 y
// 01/09). Se habilita a propósito:
//
//     ORQ_PG_LECTURA=1 node --test orquestador/lib/costo-mo-quincena.pg.test.mjs

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closePool, getPool } from './db.mjs'
import { costoManoDeObraDeLaQuincena } from './costo-mo-quincena.mjs'

const MIG = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20260915T0800_costo_mo_por_obra.sql'), 'utf8')
const inicio = MIG.indexOf('create or replace function public.costo_mo_quincena_calculo')
const desde = MIG.indexOf('$function$', inicio) + '$function$'.length
const CALCULO = MIG.slice(desde, MIG.indexOf('$function$;', desde))
  .replaceAll('p_desde', '$1::date').replaceAll('p_obras', '$2::text[]')

const PERMITIDO = process.env.ORQ_PG_LECTURA === '1'
const hayBase = PERMITIDO && await getPool().query('select 1').then(() => true).catch(() => false)
after(() => closePool())

/** Las filas crudas de las MISMAS tablas que lee la función, para el espejo JS. */
async function entrada(c, q) {
  const filas = async (sql, p = []) => (await c.query(sql, p)).rows
  return {
    personas: await filas(`select id, cuil, puesto, categoria, convenio_colectivo as convenio, fecha_ingreso::text,
                                  fecha_egreso::text, es_prueba from public.personas`),
    registros: await filas(`select persona_id, fecha::text, obra_canonica_id, horas::float8 as horas, tipo_hora, notas
                              from public.registros_hh where fecha between $1 and $2`, [q.desde, q.hasta]),
    tarifas: await filas('select persona_id, desde::text, valor_hora::float8, neto_mensual::float8 from public.persona_tarifa'),
    recibos: await filas(`select persona_id, cuil, periodo, horas_blanco::float8, bruto::float8, neto::float8,
                                 costo_total_empleador::float8 from public.recibo_sueldo_linea`),
    lineas: await filas(`select l.persona_id, l.valor_hora::float8, l.horas_recibo_manual::float8,
                                l.valor_hora_recibo_manual::float8, l.negro_manual::float8, l.horas_manual::float8,
                                l.horas_negro_manual::float8
                           from public.liquidacion_linea l join public.liquidacion_quincena lq on lq.id = l.liquidacion_id
                          where lq.desde = $1 order by l.sellado_en desc nulls last`, [q.desde]),
    asignaciones: await filas('select persona_id, obra_id, desde::text, hasta::text from public.obra_asignacion'),
    escalas: await filas('select convenio, categoria, desde::text, valor_hora::float8 from public.convenio_escala'),
    obras: await filas('select id, tipo from public.obra_canonica'),
  }
}

/** El SELECT suelto devuelve los alias internos: se renombran a las columnas de RETURNS TABLE. */
const deSql = (f) => ({
  obra_canonica_id: f.obra, persona_id: f.persona, horas: f.horas_, costo_blanco: f.blanco,
  costo_negro: f.negro, costo_total: f.total, estado: f.estado_, destino: f.destino_,
})
const clave = (f) => `${f.persona_id}|${f.obra_canonica_id}|${f.destino}`
const igual = (a, b) => (a == null || b == null ? a == null && b == null : Math.abs(Number(a) - Number(b)) < 0.01)

test('el cálculo SQL y el espejo JS dan lo mismo, fila por fila, en las dos últimas quincenas cerradas', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin transaction read only')
    const quincenas = (await c.query(`select desde::text, hasta::text from public.liquidacion_quincena
                                       group by 1, 2 having bool_and(estado = 'cerrada') order by 1 desc limit 2`)).rows
    assert.ok(quincenas.length > 0, 'no hay quincenas cerradas contra las que comparar')
    for (const q of quincenas) {
      const sql = (await c.query(CALCULO, [q.desde, null])).rows.map(deSql)
      const js = costoManoDeObraDeLaQuincena({ quincena: q, ...(await entrada(c, q)) })
      assert.equal(sql.length, js.filas.length, `${q.desde}: SQL publica ${sql.length} filas y JS ${js.filas.length}`)
      const porClave = new Map(js.filas.map((f) => [clave(f), f]))
      for (const f of sql) {
        const j = porClave.get(clave(f))
        assert.ok(j, `${q.desde}: SQL tiene ${clave(f)} y JS no`)
        assert.equal(f.estado, j.estado, `${q.desde} ${clave(f)}: estado`)
        for (const k of ['horas', 'costo_blanco', 'costo_negro', 'costo_total']) {
          assert.ok(igual(f[k], j[k]), `${q.desde} ${clave(f)}: ${k} SQL ${f[k]} ≠ JS ${j[k]}`)
        }
      }
    }
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
