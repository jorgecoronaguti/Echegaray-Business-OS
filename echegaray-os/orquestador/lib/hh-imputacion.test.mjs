// LA IMPUTACIÓN DE HORAS, MEDIDA CONTRA LA BASE REAL.
//
// ═══ POR QUÉ ESTE ARCHIVO NO PRUEBA LA PANTALLA ═══
//
// Las reglas que este módulo necesita que se cumplan SIEMPRE —la semana derivada del día, la
// actividad que tiene que ser de la misma obra, y la clave que impide cargar dos veces las mismas
// horas— no pueden vivir en el formulario: el sincronizador del Sheet, un script y cualquier cliente
// de PostgREST las esquivarían. Viven en Postgres, y por eso se miden en Postgres.
//
// TODO LO QUE ESTE ARCHIVO ESCRIBE LLEVA `ZZ-E2E` Y SE BORRA EN EL `finally`. Escribe sobre datos
// productivos reales: si algo queda, queda a la vista y con nombre.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

const SIN_BASE = !process.env.DATABASE_URL
const MARCA = 'ZZ-E2E hh-imputacion'

/** Crea una persona de prueba y una obra donde imputar; devuelve los ids y cómo limpiar. */
async function escenario() {
  const { rows: [p] } = await query(
    `insert into public.personas (nombre_completo) values ($1) returning id`, [MARCA])
  const { rows: [o] } = await query(
    `select id from public.obra_canonica order by orden limit 1`)
  const { rows: [a] } = await query(
    `select id, obra_id from public.obra_actividad where obra_id = $1 and not archivada limit 1`, [o.id])
  const { rows: [otra] } = await query(
    `select id from public.obra_actividad where obra_id <> $1 and not archivada limit 1`, [o.id])
  return { personaId: p.id, obraId: o.id, actividadId: a?.id ?? null, actividadAjena: otra?.id ?? null }
}

async function limpiar(personaId) {
  await query(`delete from public.registros_hh where persona_id = $1`, [personaId])
  await query(`delete from public.personas where id = $1`, [personaId])
}

test('la semana se DERIVA del día: un miércoles se guarda con su lunes', { skip: SIN_BASE }, async () => {
  // Si la calculara la web, Postgres y TypeScript podrían decir lunes distintos y la clave única
  // dejaría entrar las mismas horas dos veces. La deriva el trigger `registros_hh_normalizar`.
  const e = await escenario()
  try {
    const { rows: [r] } = await query(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
       values ($1, $2, '2026-08-12', '2026-08-12', 8, $3)
       returning fecha_inicio_semana`, [e.obraId, e.personaId, MARCA])
    assert.equal(r.fecha_inicio_semana.toISOString().slice(0, 10), '2026-08-10',
      'la semana no se derivó al lunes: dos cargas de la misma semana entrarían por separado')
  } finally { await limpiar(e.personaId) }
})

test('la misma persona, el mismo día y la misma actividad NO entran dos veces', { skip: SIN_BASE }, async () => {
  const e = await escenario()
  try {
    const alta = () => query(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
       values ($1, $2, $3, '2026-08-19', '2026-08-19', 8, $4)`,
      [e.obraId, e.personaId, e.actividadId, MARCA])
    await alta()
    await assert.rejects(alta, /duplicate key|unique/i,
      'la clave única no impidió cargar dos veces las mismas horas: el HH real infla y nada grita')
  } finally { await limpiar(e.personaId) }
})

test('el MISMO día en DOS actividades distintas sí entra: son horas distintas', { skip: SIN_BASE }, async () => {
  // La clave vieja era `(obra, trabajador_texto, SEMANA)`. Con el grano diario habría rechazado el
  // segundo día de la misma semana — el defecto opuesto, y también silencioso para quien carga.
  const e = await escenario()
  if (!e.actividadId) return
  try {
    await query(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
       values ($1, $2, $3, '2026-08-19', '2026-08-19', 4, $4),
              ($1, $2, null, '2026-08-20', '2026-08-20', 4, $4)`,
      [e.obraId, e.personaId, e.actividadId, MARCA])
    const { rows: [c] } = await query(
      `select count(*)::int as n from public.registros_hh where persona_id = $1`, [e.personaId])
    assert.equal(c.n, 2, 'dos días distintos de la misma semana no pudieron cargarse')
  } finally { await limpiar(e.personaId) }
})

test('no se pueden imputar horas a la actividad de OTRA obra', { skip: SIN_BASE }, async () => {
  // Un CHECK no puede consultar otra tabla, así que lo hace un trigger. Sin él, el plan contra real
  // de las DOS obras queda mal y ninguna de las dos pantallas puede notarlo.
  const e = await escenario()
  if (!e.actividadAjena) return
  try {
    await assert.rejects(
      () => query(
        `insert into public.registros_hh
           (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
         values ($1, $2, $3, '2026-08-19', '2026-08-19', 8, $4)`,
        [e.obraId, e.personaId, e.actividadAjena, MARCA]),
      /pertenece a la obra/i,
      'se pudieron imputar horas a una actividad de otra obra')
  } finally { await limpiar(e.personaId) }
})

test('una imputación con persona SIEMPRE tiene su día', { skip: SIN_BASE }, async () => {
  const e = await escenario()
  try {
    await assert.rejects(
      () => query(
        `insert into public.registros_hh
           (obra_canonica_id, persona_id, fecha_inicio_semana, horas, fuente_legacy)
         values ($1, $2, '2026-08-17', 8, $3)`, [e.obraId, e.personaId, MARCA]),
      /registros_hh_persona_con_fecha/,
      'se pudo cargar «8 horas, esta semana» sin decir qué día')
  } finally { await limpiar(e.personaId) }
})

test('las HH reales de la actividad son la SUMA de sus imputaciones, no una columna', { skip: SIN_BASE }, async () => {
  // `obra_actividad.hh_real` era un campo que se cargaba a mano al lado de las horas imputadas: dos
  // números para el mismo hecho. Se borró. Este test falla si alguien la vuelve a crear y la usa.
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'obra_actividad' and column_name = 'hh_real'`)
  assert.equal(rows.length, 0,
    'volvió `obra_actividad.hh_real`: hay dos versiones de las horas reales de una actividad')

  const e = await escenario()
  if (!e.actividadId) return
  try {
    await query(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
       values ($1, $2, $3, '2026-08-19', '2026-08-19', 6.5, $4)`,
      [e.obraId, e.personaId, e.actividadId, MARCA])
    const { rows: [v] } = await query(
      `select hh_real from public.obra_actividad_hh where actividad_id = $1`, [e.actividadId])
    assert.equal(Number(v.hh_real), 6.5, '`obra_actividad_hh` no refleja la imputación recién hecha')
  } finally { await limpiar(e.personaId) }
})

test('una persona no puede estar en dos cuadrillas al mismo tiempo', { skip: SIN_BASE }, async () => {
  // Es lo que hace que CUADRILLA pueda ser UNA columna del listado. Sin esta única, la pantalla
  // tendría que elegir una de las dos, y elegiría la que devuelva primero el planificador.
  const e = await escenario()
  const nombres = [`${MARCA} A`, `${MARCA} B`]
  try {
    const ids = []
    for (const n of nombres) {
      const { rows: [c] } = await query(
        `insert into public.cuadrilla (nombre) values ($1) returning id`, [n])
      ids.push(c.id)
    }
    await query(
      `insert into public.cuadrilla_integrante (cuadrilla_id, persona_id) values ($1, $2)`,
      [ids[0], e.personaId])
    await assert.rejects(
      () => query(
        `insert into public.cuadrilla_integrante (cuadrilla_id, persona_id) values ($1, $2)`,
        [ids[1], e.personaId]),
      /duplicate key|unique/i,
      'la misma persona quedó abierta en dos cuadrillas a la vez')
  } finally {
    await query(`delete from public.cuadrilla where nombre = any($1)`, [nombres])
    await limpiar(e.personaId)
  }
})
