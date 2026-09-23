// EL PARTE DIARIO DEL DISEÑO 06 CONTRA LA BASE VIVA — lo que `guardarParteDiario` escribe y lo que
// `parte_tarea`, `actividad_partes_resumen` y `planilla_obra` devuelven de eso.
//
// No hay migración nueva en este frente: las tablas y vistas son las de H2 (20260923T2310). Lo que
// este archivo mide es el CONTRATO que la acción asume sobre ellas, con las mismas formas de fila:
//
//   · un parte por cantidad (cantidad, sin fracción) → la fracción la deduce la vista (25/100 = 0,25);
//   · un parte manual (fraccion + declarada) → la vista la respeta tal cual;
//   · la gente del parte (`obra_ejecucion_persona`) y el activo (`obra_ejecucion_equipo.activo_id`)
//     salen en `parte_tarea.personas` / `.activos` y en `planilla_obra`;
//   · el % del ítem (`actividad_partes_resumen.fraccion_acumulada`) suma los partes y no pasa de 1;
//   · `dias_habiles` con la semana por defecto cuenta cinco de lunes a viernes.
//
// Todo corre en UNA transacción que termina en ROLLBACK: la base viva no se toca. Sin base, se salta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const OBRA = 'zz-test-parte-06'

async function enTransaccion(fn) {
  const cliente = await getPool().connect()
  try {
    await cliente.query('begin')
    const q = async (sql, params = []) => (await cliente.query(sql, params)).rows
    await fn(q)
  } finally {
    await cliente.query('rollback').catch(() => {})
    cliente.release()
  }
}

async function sembrar(q) {
  await q(`insert into obra_canonica (id, nombre, codigo, estado) values ($1, 'ZZ Parte 06', 'ZZ-P06', 'activa')`, [OBRA])
  const [porCantidad] = await q(
    `insert into obra_actividad (obra_id, nombre, clave, tipo, orden, metodo_avance, unidad, cantidad_objetivo, fuente)
     values ($1, 'ZZ Relleno', 'zz/relleno', 'tarea', 1, 'cantidad', 'm³', 100, 'web') returning id`, [OBRA])
  const [manual] = await q(
    `insert into obra_actividad (obra_id, nombre, clave, tipo, orden, metodo_avance, fuente)
     values ($1, 'ZZ Llaneado', 'zz/llaneado', 'tarea', 2, 'manual', 'web') returning id`, [OBRA])
  const [persona] = await q(`insert into personas (nombre_completo) values ('ZZ QUIROGA Rodolfo') returning id`)
  const [ubic] = await q(`insert into ubicacion (tipo, obra_id) values ('obra', $1) returning id`, [OBRA])
  const [activo] = await q(
    `insert into activo (codigo, clase, nombre, ubicacion_id) values ('ZZZ-9906', 'equipo', 'ZZ Hormigonera', $1) returning id`, [ubic.id])
  await q(`insert into activo_existencia (activo_id, ubicacion_id, cantidad) values ($1, $2, 1)`, [activo.id, ubic.id])
  return { porCantidad: porCantidad.id, manual: manual.id, persona: persona.id, activo: activo.id, ubicacion: ubic.id }
}

test('un parte por cantidad deduce la fracción; uno manual la declara; gente y activo salen en parte_tarea', { skip: !hayBase && 'sin base' }, async () => {
  await enTransaccion(async (q) => {
    const s = await sembrar(q)
    // Lo que escribe guardarParteDiario, fila por fila (filaDeEjecucion + persona + equipo.activo_id).
    const [p1] = await q(
      `insert into obra_ejecucion (obra_id, actividad_id, fecha, fuente, cantidad, avance_pct, fraccion, declarada)
       values ($1, $2, '2026-09-07', 'web', 25, null, null, false) returning id`, [OBRA, s.porCantidad])
    await q(`insert into obra_ejecucion_persona (ejecucion_id, obra_id, persona_id, horas) values ($1, $2, $3, 9)`, [p1.id, OBRA, s.persona])
    await q(`insert into obra_ejecucion_equipo (ejecucion_id, obra_id, activo_id, equipo, horas) values ($1, $2, $3, 'ZZ Hormigonera', null)`, [p1.id, OBRA, s.activo])
    await q(
      `insert into obra_ejecucion (obra_id, actividad_id, fecha, fuente, cantidad, avance_pct, fraccion, declarada)
       values ($1, $2, '2026-09-07', 'web', null, 30, 0.3, true)`, [OBRA, s.manual])

    const partes = await q(`select actividad_id, fraccion, declarada, personas, activos from parte_tarea where obra_id = $1 order by actividad_id`, [OBRA])
    const deCantidad = partes.find((p) => p.actividad_id === s.porCantidad)
    const deManual = partes.find((p) => p.actividad_id === s.manual)
    assert.equal(Number(deCantidad.fraccion), 0.25, 'la fracción se deduce de cantidad / cantidad_objetivo')
    assert.equal(deCantidad.declarada, false)
    assert.deepEqual(deCantidad.personas, [s.persona])
    assert.deepEqual(deCantidad.activos, [s.activo])
    assert.equal(Number(deManual.fraccion), 0.3)
    assert.equal(deManual.declarada, true)
  })
})

test('el % del ítem suma los partes y no pasa de 1; la planilla trae la celda con quién y con qué', { skip: !hayBase && 'sin base' }, async () => {
  await enTransaccion(async (q) => {
    const s = await sembrar(q)
    for (const [fecha, cantidad] of [['2026-09-07', 60], ['2026-09-08', 60]]) {
      const [p] = await q(
        `insert into obra_ejecucion (obra_id, actividad_id, fecha, fuente, cantidad) values ($1, $2, $3, 'web', $4) returning id`,
        [OBRA, s.porCantidad, fecha, cantidad])
      await q(`insert into obra_ejecucion_persona (ejecucion_id, obra_id, persona_id) values ($1, $2, $3)`, [p.id, OBRA, s.persona])
    }
    const [resumen] = await q(`select fraccion_acumulada, dias_reales from actividad_partes_resumen where actividad_id = $1`, [s.porCantidad])
    assert.equal(Number(resumen.fraccion_acumulada), 1, '60 + 60 sobre 100 se corta en 1')
    assert.equal(resumen.dias_reales, 2)

    const celdas = await q(`select actividad_id, fecha::text, fraccion, cantidad, personas, activos, n_partes from planilla_obra($1, '2026-09-01', '2026-09-30') order by fecha`, [OBRA])
    assert.equal(celdas.length, 2)
    assert.equal(celdas[0].fecha, '2026-09-07')
    assert.equal(Number(celdas[0].fraccion), 0.6)
    assert.equal(Number(celdas[0].cantidad), 60)
    assert.deepEqual(celdas[0].personas, [s.persona])
    assert.equal(celdas[0].n_partes, 1)
  })
})

test('el activo ubicado en la obra se encuentra por ubicacion → activo_existencia → activo (nunca por herramientas)', { skip: !hayBase && 'sin base' }, async () => {
  await enTransaccion(async (q) => {
    const s = await sembrar(q)
    const filas = await q(
      `select a.id, a.nombre, a.clase from ubicacion u
         join activo_existencia e on e.ubicacion_id = u.id
         join activo a on a.id = e.activo_id
        where u.tipo = 'obra' and u.obra_id = $1`, [OBRA])
    assert.deepEqual(filas.map((f) => [f.id, f.nombre, f.clase]), [[s.activo, 'ZZ Hormigonera', 'equipo']])
  })
})

test('dias_habiles cuenta cinco de lunes a viernes con la semana por defecto de la obra', { skip: !hayBase && 'sin base' }, async () => {
  await enTransaccion(async (q) => {
    await sembrar(q)
    const [r] = await q(`select dias_habiles($1, '2026-08-24', '2026-08-28') as n, dias_habiles($1, '2026-08-24', '2026-08-30') as n2`, [OBRA])
    assert.equal(r.n, 5)
    assert.equal(r.n2, 5, 'el sábado y el domingo no cuentan')
  })
})
