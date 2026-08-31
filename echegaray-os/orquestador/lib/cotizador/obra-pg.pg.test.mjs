// LA CÁSCARA POSTGRES DE §16/§17/§18, CONTRA LA BASE REAL.
//
// ═══ TODO ADENTRO DE begin/rollback ═══
//
// La base es la misma que usa producción. Cada test abre una transacción, escribe, LEE EL EFECTO EN
// SU DESTINO —no confía en que el insert respondió— y hace rollback. La base queda igual.
//
// ═══ QUÉ PRUEBA, Y QUÉ NO PROBARÍA UN `has_table_privilege` ═══
//
//   · la genealogía NO acepta una versión sin congelar (el CHECK de la base, no el del JS);
//   · una obra NO puede tener dos orígenes ORIGINAL;
//   · FROZEN ≠ MUTABLE: el trigger rechaza reescribir el plan y deja pasar sólo `actividad_id`;
//   · un costo real sin partida entra igual y se puede leer;
//   · las observaciones son append-only también para `authenticated`, con `set local role` y un JWT
//     real — un GRANT no prueba una POLICY, y este repo ya pagó la lección al revés.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPool } from '../db.mjs'
import {
  leerGenealogia, leerPlanDeObra, leerEjecucionReal, guardarGenealogia, guardarPlan,
  enlazarActividad, imputarCostoReal, guardarObservaciones,
} from './obra-pg.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

// La cotización congelada REAL de Quattropani. No se inventa un fixture: si estas filas cambian, el
// test tiene que enterarse.
const COT_V1 = 'bde2c7b2-3fdb-414f-821e-9e20ba64d439'   // COT-2026-001 v1, congelada
const COT_V3 = 'a6426117-7dde-4506-94be-3870aa6a1637'   // COT-2026-001 v3, adjudicada SIN congelar
const OBRA = 'quattropani'

test('obra · genealogía, plan congelado, costo real y observaciones contra la base', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const puerta = { query: q }
  await c.query('begin')

  const cotizacion = (await q('select id, numero, version, congelada_en, costo_estimado, monto_venta from public.cotizaciones where id = $1', [COT_V1]))[0]
  const gBase = {
    obraId: OBRA, cotizacionId: COT_V1, alcance: 'ORIGINAL', version: cotizacion.version,
    congeladaEn: cotizacion.congelada_en, huellaSha256: null, adjudicadaEn: new Date().toISOString(),
    adjudicadaPor: null, costoEstimado: cotizacion.costo_estimado, metaIngreso: cotizacion.monto_venta,
    nota: 'ZZ-test',
  }

  await t.test('la versión CONGELADA existe y la v3 sigue sin congelar — el conflicto es real', async () => {
    assert.ok(cotizacion.congelada_en, 'la v1 dejó de estar congelada: el fixture ya no representa la base')
    const v3 = (await q('select congelada_en from public.cotizaciones where id = $1', [COT_V3]))[0]
    assert.equal(v3.congelada_en, null, 'la v3 se congeló: revisar cuál es el origen correcto de la obra')
  })

  await t.test('FROZEN ≠ MUTABLE: la base rechaza una genealogía sin congelada_en', async () => {
    // MUTACIÓN CORRIDA: quitar `not null` de congelada_en en la migración → el insert pasó y la
    // genealogía quedó apuntando a la v3 editable. Revertida.
    await q('savepoint s1')
    await assert.rejects(
      () => guardarGenealogia(puerta, { ...gBase, cotizacionId: COT_V3, version: 3, congeladaEn: null }),
      /null value in column "congelada_en"|violates not-null/,
    )
    await q('rollback to savepoint s1')
  })

  const origen = await guardarGenealogia(puerta, gBase)

  await t.test('la genealogía se lee EN SU DESTINO, no en la respuesta del insert', async () => {
    const leida = await leerGenealogia(puerta, OBRA)
    assert.equal(leida.cotizacion_id, COT_V1)
    assert.equal(leida.version, 1)
    assert.equal(leida.numero, 'COT-2026-001')
    assert.equal(Number(leida.meta_ingreso ?? 0), Number(cotizacion.monto_venta ?? 0), 'el precio vive en la obra')
  })

  await t.test('UNA sola ORIGINAL por obra: la segunda no entra', async () => {
    await q('savepoint s2')
    await assert.rejects(
      () => guardarGenealogia(puerta, { ...gBase, cotizacionId: COT_V3, version: 3, congeladaEn: new Date().toISOString() }),
      /obra_origen_una_original_por_obra/,
    )
    await q('rollback to savepoint s2')
  })

  await t.test('un ADICIONAL sí entra: el índice parcial no bloquea de más', async () => {
    await q('savepoint s3')
    const ad = await guardarGenealogia(puerta, { ...gBase, cotizacionId: COT_V3, alcance: 'ADICIONAL', version: 3, congeladaEn: new Date().toISOString() })
    assert.equal(ad.alcance, 'ADICIONAL')
    await q('rollback to savepoint s3')
  })

  // ── el plan heredado, con las partidas REALES de la v1
  const partidas = await q(
    `select partida_id, codigo, descripcion, unidad, cantidad, hs_unitarias, costo_unitario, subtotal, subcontratada
       from public.cotizacion_partida_valorizada where cotizacion_id = $1 order by orden`, [COT_V1])

  const filasPlan = partidas.map((p) => ({
    cotizacionPartidaId: p.partida_id, codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad,
    cantidadPlan: p.cantidad === null ? null : Number(p.cantidad),
    hsUnitariasPlan: p.hs_unitarias === null ? null : Number(p.hs_unitarias),
    hhPlan: p.subcontratada ? 0 : (p.hs_unitarias !== null && p.cantidad !== null ? Number(p.hs_unitarias) * Number(p.cantidad) : null),
    costoUnitarioPlan: p.costo_unitario === null ? null : Number(p.costo_unitario),
    costoPlan: p.subtotal === null ? null : Number(p.subtotal),
    diasPlan: null, subcontratada: p.subcontratada,
  }))
  await guardarPlan(puerta, { origenId: origen.id, obraId: OBRA, filas: filasPlan })

  await t.test('el plan heredado se lee entero y NULL sigue siendo NULL', async () => {
    const plan = await leerPlanDeObra(puerta, OBRA)
    assert.equal(plan.length, partidas.length, `se heredaron ${plan.length} de ${partidas.length} partidas`)
    assert.ok(plan.length >= 26, 'Quattropani v1 tiene 26 partidas')
    const luz = plan.find((p) => p.codigo === 'T1078')   // sin hs_unitarias en la base real
    if (luz) assert.equal(luz.hhPlan, null, 'T1078 sin horas unitarias heredó un número: 0 sería productividad infinita')
    assert.ok(plan.every((p) => p.costoPlan === null || p.costoPlan > 0))
  })

  await t.test('FROZEN ≠ MUTABLE: el trigger rechaza reescribir la cantidad del plan', async () => {
    // MUTACIÓN CORRIDA: `drop trigger obra_partida_plan_congelado` dentro de la transacción → el
    // update pasó y la cantidad del plan quedó en 9999. Revertida por el rollback del savepoint.
    await q('savepoint s4')
    await assert.rejects(
      () => q(`update public.obra_partida_plan set cantidad_plan = 9999 where obra_id = $1`, [OBRA]),
      /plan CONGELADO/,
    )
    await q('rollback to savepoint s4')
  })

  await t.test('…y deja pasar el ÚNICO update legítimo: enlazar la actividad', async () => {
    const act = (await q(`select id, cotizacion_partida_id from public.obra_actividad where obra_id = $1 and cotizacion_partida_id is not null limit 1`, [OBRA]))[0]
    assert.ok(act, 'no hay ninguna actividad de Quattropani enganchada a una partida')
    const r = await enlazarActividad(puerta, { obraId: OBRA, cotizacionPartidaId: act.cotizacion_partida_id, actividadId: act.id })
    assert.equal(r.actividad_id, act.id)
    const leido = (await leerPlanDeObra(puerta, OBRA)).find((p) => p.cotizacionPartidaId === act.cotizacion_partida_id)
    assert.equal(leido.actividadId, act.id, 'el enlace no quedó en su destino')
  })

  await t.test('guardarPlan es idempotente: correrlo dos veces no duplica ni pisa', async () => {
    const antes = (await q('select count(*)::int n, sum(cantidad_plan) s from public.obra_partida_plan where obra_id = $1', [OBRA]))[0]
    await guardarPlan(puerta, { origenId: origen.id, obraId: OBRA, filas: filasPlan.map((f) => ({ ...f, cantidadPlan: 1 })) })
    const despues = (await q('select count(*)::int n, sum(cantidad_plan) s from public.obra_partida_plan where obra_id = $1', [OBRA]))[0]
    assert.equal(despues.n, antes.n, 'la segunda corrida duplicó filas')
    assert.equal(String(despues.s), String(antes.s), 'la segunda corrida pisó las cantidades del plan congelado')
  })

  await t.test('un costo real SIN partida entra igual — rechazarlo lo borraría del costo de la obra', async () => {
    const conPartida = filasPlan[0].cotizacionPartidaId
    await imputarCostoReal(puerta, { obraId: OBRA, cotizacionPartidaId: conPartida, tipo: 'MATERIAL', recursoNombre: 'ZZ hormigón', cantidad: 10, precioUnitario: 130_000, monto: 1_300_000, fecha: '2026-08-22', fuente: 'ZZ-test', fuenteId: 'zz-1' })
    await imputarCostoReal(puerta, { obraId: OBRA, cotizacionPartidaId: null, tipo: 'OTRO', recursoNombre: 'ZZ flete sin imputar', monto: 410_000, fecha: '2026-08-23', fuente: 'ZZ-test', fuenteId: 'zz-2' })
    const { costos } = await leerEjecucionReal(puerta, OBRA)
    const huerfano = costos.find((x) => x.recurso_nombre === 'ZZ flete sin imputar')
    assert.ok(huerfano, 'el costo sin partida no quedó en la base')
    assert.equal(huerfano.cotizacion_partida_id, null)
    assert.equal(Number(huerfano.monto), 410_000)
  })

  await t.test('la puerta del costo no admite el mismo comprobante dos veces', async () => {
    const antes = (await q(`select count(*)::int n from public.obra_partida_costo_real where fuente = 'ZZ-test'`))[0].n
    await imputarCostoReal(puerta, { obraId: OBRA, cotizacionPartidaId: null, tipo: 'OTRO', recursoNombre: 'ZZ flete sin imputar', monto: 410_000, fecha: '2026-08-23', fuente: 'ZZ-test', fuenteId: 'zz-2' })
    const despues = (await q(`select count(*)::int n from public.obra_partida_costo_real where fuente = 'ZZ-test'`))[0].n
    assert.equal(despues, antes, 'el mismo comprobante entró dos veces y el costo real quedó inflado')
  })

  await t.test('leerEjecucionReal trae las cinco fuentes en cinco consultas', async () => {
    const r = await leerEjecucionReal(puerta, OBRA, { partidaIds: filasPlan.slice(0, 3).map((f) => f.cotizacionPartidaId) })
    assert.ok(Array.isArray(r.ejecuciones) && r.ejecuciones.length >= 6, `obra_ejecucion de Quattropani trajo ${r.ejecuciones.length}`)
    for (const k of ['horas', 'equipos', 'costos', 'composicion']) assert.ok(Array.isArray(r[k]), `${k} no llegó como lista`)
    assert.ok(r.composicion.length > 0, 'la composición de la versión congelada no llegó')
  })

  await t.test('las observaciones se guardan con su evidencia jsonb entera', async () => {
    const corrida = randomUUID()
    const n = await guardarObservaciones(puerta, {
      obraId: OBRA, corridaId: corrida,
      observaciones: [
        { cotizacionPartidaId: filasPlan[0].cotizacionPartidaId, concepto: 'CANTIDAD', unidad: 'm2', plan: 258.77, real: 258.77, desvio: 0, desvioPct: 0, comparable: true, motivoNoComparable: null, causa: 'SIN_CAUSA', evidencia: null, estado: 'CALCULADO' },
        { cotizacionPartidaId: filasPlan[1].cotizacionPartidaId, concepto: 'HH', unidad: 'HH', plan: 158.9, real: null, desvio: null, desvioPct: null, comparable: false, motivoNoComparable: 'SIN_HH_REALES', causa: 'ROCA, IMPREVISTA {x}', evidencia: { incidencias: [{ causa: 'ROCA_IMPREVISTA', texto: 'roca a 1,2 m, con {llaves}' }] }, estado: 'FALTA_DATO' },
      ],
    })
    assert.equal(n, 2)
    const filas = await q('select * from public.obra_plan_real_observacion where corrida_id = $1 order by concepto', [corrida])
    assert.equal(filas.length, 2, 'las observaciones no quedaron en su destino')
    const hh = filas.find((f) => f.concepto === 'HH')
    assert.equal(hh.comparable, false)
    assert.equal(hh.real_medido, null, 'un real nulo se guardó como 0')
    assert.equal(hh.evidencia.incidencias[0].texto, 'roca a 1,2 m, con {llaves}', 'la evidencia jsonb llegó rota: llaves y comas rompen el literal de array')
    assert.equal(hh.motor_version, 'plan-vs-real/1.0.0')
  })

  await t.test('append-only para `authenticated`: la policy no deja UPDATE ni DELETE', async () => {
    // RLS NO ES GRANT: acá se prueba la POLICY, con el rol puesto de verdad.
    const corrida = randomUUID()
    await guardarObservaciones(puerta, { obraId: OBRA, corridaId: corrida, observaciones: [{ cotizacionPartidaId: null, concepto: 'COSTO', unidad: '$', plan: 1, real: 2, desvio: 1, desvioPct: 100, comparable: true, motivoNoComparable: null, causa: 'SIN_CAUSA', evidencia: null, estado: 'CALCULADO' }] })
    // Un savepoint POR intento: el primer «permission denied» aborta la transacción entera, y sin
    // el rollback intermedio el segundo intento falla con «transaction is aborted» — que NO prueba
    // que la policy lo haya bloqueado. Un test que se conforma con «falló» prueba menos de lo que
    // dice: hay que ver el motivo exacto de cada uno.
    for (const [sql, params] of [
      ['update public.obra_plan_real_observacion set causa = $1 where corrida_id = $2', ['INVENTADA', corrida]],
      ['delete from public.obra_plan_real_observacion where corrida_id = $1', [corrida]],
    ]) {
      await q('savepoint s5')
      await c.query('set local role authenticated')
      await assert.rejects(() => c.query(sql, params), /permission denied/, `«${sql.split(' ')[0]}» no fue rechazado por la policy`)
      await c.query('rollback to savepoint s5')
      await c.query('reset role')
    }
    // Y el control PUEDE decir que sí: como service_role el mismo UPDATE pasa, así que el rechazo
    // de arriba es de la policy y no de una tabla rota.
    await q('savepoint s6')
    const upd = await q('update public.obra_plan_real_observacion set causa = $1 where corrida_id = $2 returning id', ['ZZ', corrida])
    assert.equal(upd.length, 1, 'la fila no existía: el rechazo anterior podía ser por eso y no por la policy')
    await q('rollback to savepoint s6')
  })

  await c.query('rollback')
  await t.test('el rollback dejó la base como estaba', async () => {
    const n = (await getPool().query(`select count(*)::int n from public.obra_partida_costo_real where fuente = 'ZZ-test'`)).rows[0].n
    assert.equal(n, 0, 'quedaron filas ZZ-test en la base')
    const g = (await getPool().query(`select count(*)::int n from public.obra_origen_cotizacion where nota = 'ZZ-test'`)).rows[0].n
    assert.equal(g, 0, 'quedó una genealogía de prueba en la base')
  })
  c.release()
})
