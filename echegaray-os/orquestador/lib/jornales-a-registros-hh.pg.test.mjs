// El UPSERT de JORNALES → registros_hh contra la base REAL, dentro de una transacción que se deshace.
//
// Lo que se prueba es el EFECTO: que el `on conflict` cae en el índice único real
// (`registros_hh_persona_unico`), que correr dos veces no duplica ni toca nada, que una fila de otra
// fuente en la misma clave NO se pisa, que `obra_plan_vs_real.hh_real` sube con las horas normales y
// no con la ausencia, y que la consulta que hace la grilla semanal de Administración devuelve lo
// importado. Todo con rollback: la base queda como estaba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { SQL_UPSERT, SQL_MOVER, columnasParaUpsert, FUENTE } from './jornales-a-registros-hh.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const FECHA = '2031-03-10' // lejana y vacía: lo que se mide es lo de este test
const SEMANA = ['2031-03-10', '2031-03-16']

test('el UPSERT es idempotente, no pisa a otra fuente, mueve sólo lo propio y la web lo ve', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const uno = async (sql, p) => (await c.query(sql, p)).rows[0]
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    const obras = (await c.query(`select id from public.obra_canonica where estado = 'activa' and id <> 'prueba-e2e' order by id limit 2`)).rows
    const persona = await uno(`select id from public.personas where not es_prueba order by id limit 1`)
    if (obras.length < 2 || !persona) { t.skip('sin dos obras activas y una persona'); return }
    const [obra, otra] = obras.map((o) => o.id)
    const fila = (tipo, horas, notas, o = obra) => ({ persona_id: persona.id, obra_canonica_id: o, fecha: FECHA, tipo_hora: tipo, horas, notas })
    const hhReal = async () => Number((await uno('select coalesce(hh_real, 0) hh from public.obra_plan_vs_real where obra_id = $1', [obra]))?.hh ?? 0)

    const antes = await hhReal()
    const plan = [fila('normal', 9, 'JORNALES test f1'), fila('extra_50', 2, 'JORNALES test f1 · extras'), fila('ausencia', 8.8, null)]
    const r1 = await c.query(SQL_UPSERT, columnasParaUpsert(plan))
    assert.equal(r1.rows.length, 3); assert.ok(r1.rows.every((r) => r.insertada), 'la primera corrida inserta las tres')
    assert.equal(await hhReal(), antes + 11, 'hh_real suma normal + extra y NO la ausencia')

    const r2 = await c.query(SQL_UPSERT, columnasParaUpsert(plan))
    assert.equal(r2.rows.length, 0, 'la segunda corrida idéntica no toca nada')
    const r3 = await c.query(SQL_UPSERT, columnasParaUpsert([fila('normal', 8, 'JORNALES test f1 corregido')]))
    assert.equal(r3.rows.length, 1); assert.equal(r3.rows[0].insertada, false, 'cambiar las horas actualiza la fila propia')
    assert.equal(await hhReal(), antes + 10)

    // Una fila AJENA en la misma clave (persona, fecha, obra, tipo) no se pisa: la web cargó 15 y queda 15.
    await c.query(`update public.registros_hh set fuente_legacy = 'web:obra', horas = 15 where persona_id = $1 and fecha = $2 and tipo_hora = 'normal'`, [persona.id, FECHA])
    const r4 = await c.query(SQL_UPSERT, columnasParaUpsert([fila('normal', 9, 'JORNALES otra vez')]))
    assert.equal(r4.rows.length, 0, 'sobre una fila de otra fuente el UPSERT no hace nada')
    const ajena = await uno(`select horas, fuente_legacy from public.registros_hh where persona_id = $1 and fecha = $2 and tipo_hora = 'normal'`, [persona.id, FECHA])
    assert.equal(Number(ajena.horas), 15); assert.equal(ajena.fuente_legacy, 'web:obra')

    // MOVER de obra: la propia se mueve; la ajena, no.
    const propia = await uno(`select id from public.registros_hh where persona_id = $1 and fecha = $2 and tipo_hora = 'extra_50'`, [persona.id, FECHA])
    const m1 = await c.query(SQL_MOVER, [propia.id, otra, 2, 'movida'])
    assert.equal(m1.rowCount, 1)
    assert.equal((await uno('select obra_canonica_id o from public.registros_hh where id = $1', [propia.id])).o, otra)
    const ajenaId = await uno(`select id from public.registros_hh where persona_id = $1 and fecha = $2 and tipo_hora = 'normal'`, [persona.id, FECHA])
    assert.equal((await c.query(SQL_MOVER, [ajenaId.id, otra, 1, 'x'])).rowCount, 0, 'una fila ajena no se mueve')

    // Lo que consulta `getSemanaPorObra` (jornadaPorObraService.ts) para la grilla de esa semana.
    const grilla = (await c.query(
      `select persona_id, obra_canonica_id, fecha, horas, tipo_hora from public.registros_hh
        where fecha between $1 and $2 and persona_id is not null and obra_canonica_id is not null and fuente_legacy = $3 order by tipo_hora`,
      [...SEMANA, FUENTE])).rows
    assert.deepEqual(grilla.map((g) => [g.obra_canonica_id, g.tipo_hora, Number(g.horas)]), [[obra, 'ausencia', 8.8], [otra, 'extra_50', 2]])
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test.after(async () => { await getPool().end().catch(() => {}) })
