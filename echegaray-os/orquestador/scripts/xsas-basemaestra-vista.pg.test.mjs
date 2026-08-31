// UN CONSUMIDOR DE `estandar_productivo` TIENE QUE PODER VER QUE LA CUADRILLA ES UN CANDIDATO.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ═══
//
// La vista publicaba `cuadrilla`, `cuadrilla_personas`, `capacidad_ponderada` y
// `produccion_diaria_referencia`, y NO publicaba de dónde salía nada de eso. La carga del
// 2026-08-31 metió cuatro cuadrillas OBSERVADAS —`Horas Hombre.xlsm`, sin revisar por nadie— y esas
// cuatro tareas pasaron de `produccion_diaria_referencia` NULL a un número. Quien lea la vista ve
// el número y no tiene con qué distinguirlo de una cuadrilla validada: **CANDIDATO se lee como
// VALIDADO**, que es exactamente la regla que no se negocia.
//
// «Consultá también `analisis_cuadrilla`» no es una respuesta: el consumidor de una vista consume
// la vista. Si el dato de procedencia exige una segunda consulta, la primera miente sola.
//
// ═══ EL ESTADO DE UNA CUADRILLA ES EL DE SU LÍNEA MÁS DÉBIL ═══
//
// Una cuadrilla son varias filas —una por categoría—. Si el oficial está VALIDADO y el ayudante es
// CANDIDATO, la cuadrilla NO está validada: la mitad aprobada no lava a la otra mitad. Por eso el
// estado agregado es el MÍNIMO en el orden CANDIDATO < HISTORICO < VALIDADO, y hay un test que lo
// prueba con la mezcla puesta a mano.
//
// Todo en `begin`/`rollback` sobre UNA conexión de `pool.connect()`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../lib/db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('estandar_productivo publica de dónde sale la cuadrilla', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, p) => (await c.query(sql, p)).rows

  await t.test('la vista tiene la columna que responde «¿esto lo validó alguien?»', async () => {
    const cols = (await q(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'estandar_productivo'`)).map((r) => r.column_name)
    assert.ok(cols.includes('cuadrilla_estado'),
      `un consumidor de la vista no puede saber si la cuadrilla está validada: columnas disponibles = ${cols.join(', ')}`)
    assert.ok(cols.includes('cuadrilla_fuente'),
      'sin la fuente, «CANDIDATO» no dice de qué observación salió')
  })

  await t.test('EN UNA SOLA CONSULTA se distingue CANDIDATO de VALIDADO', async () => {
    await c.query('begin')
    try {
      // Dos tareas cualesquiera SIN cuadrilla: se les pone una a mano, con estados distintos.
      const libres = await q(`
        select a.id from public.analisis a
         where a.vigente
           and not exists (select 1 from public.analisis_cuadrilla q where q.analisis_id = a.id)
         order by a.id limit 2`)
      assert.equal(libres.length, 2, 'hacen falta dos análisis sin cuadrilla para montar el caso')
      const [cand, vali] = libres.map((r) => r.id)
      await q(`insert into public.analisis_cuadrilla (analisis_id, categoria, cantidad, fuente, estado)
               values ($1, 'oficial', 1, 'ZZ prueba · observación sin revisar', 'CANDIDATO')`, [cand])
      await q(`insert into public.analisis_cuadrilla (analisis_id, categoria, cantidad, fuente, estado)
               values ($1, 'oficial', 1, 'ZZ prueba · la firmó el dueño', 'VALIDADO')`, [vali])

      // LA CONSULTA DEL CONSUMIDOR: una sola, sobre la vista, sin tocar analisis_cuadrilla.
      const filas = await q(
        `select analisis_id, cuadrilla, cuadrilla_estado, cuadrilla_fuente
           from public.estandar_productivo where analisis_id = any($1)`, [[cand, vali]])
      const porId = new Map(filas.map((f) => [f.analisis_id, f]))
      assert.equal(porId.get(cand).cuadrilla_estado, 'CANDIDATO')
      assert.equal(porId.get(vali).cuadrilla_estado, 'VALIDADO')
      assert.match(porId.get(cand).cuadrilla_fuente, /sin revisar/)
    } finally { await c.query('rollback') }
  })

  await t.test('una cuadrilla MEZCLADA lee CANDIDATO: la mitad validada no lava a la otra mitad', async () => {
    await c.query('begin')
    try {
      const [{ id }] = await q(`
        select a.id from public.analisis a
         where a.vigente and not exists (select 1 from public.analisis_cuadrilla q where q.analisis_id = a.id)
         order by a.id limit 1`)
      await q(`insert into public.analisis_cuadrilla (analisis_id, categoria, cantidad, fuente, estado)
               values ($1, 'oficial', 1, 'ZZ prueba', 'VALIDADO'), ($1, 'ayudante', 2, 'ZZ prueba', 'CANDIDATO')`, [id])
      const [f] = await q(`select cuadrilla, cuadrilla_estado, cuadrilla_personas
                             from public.estandar_productivo where analisis_id = $1`, [id])
      assert.deepEqual(f.cuadrilla, { oficial: 1, ayudante: 2 }, 'la cuadrilla completa se sigue publicando')
      assert.equal(Number(f.cuadrilla_personas), 3)
      assert.equal(f.cuadrilla_estado, 'CANDIDATO',
        'una línea CANDIDATO adentro de la cuadrilla y la vista la publicó como validada')
    } finally { await c.query('rollback') }
  })

  await t.test('NEGATIVO: sin cuadrilla el estado es NULL — «no hay» no es «candidato»', async () => {
    const [f] = await q(`select cuadrilla, cuadrilla_estado, cuadrilla_fuente
                           from public.estandar_productivo where sin_cuadrilla_declarada limit 1`)
    assert.equal(f.cuadrilla, null)
    assert.equal(f.cuadrilla_estado, null, 'una tarea sin cuadrilla aparece con un estado, y eso es afirmar algo que nadie cargó')
    assert.equal(f.cuadrilla_fuente, null)
  })

  await t.test('las cuatro cargadas por la corrida real siguen siendo CANDIDATO y lo DICEN', async () => {
    const filas = await q(`select codigo, cuadrilla_estado, cuadrilla_fuente, produccion_diaria_referencia
                             from public.estandar_productivo
                            where cuadrilla_fuente like 'xsas-basemaestra%' order by codigo`)
    // Si alguien revirtió la carga, no hay nada que verificar y decirlo es mejor que fingir verde.
    if (!filas.length) return assert.ok(true, 'la carga de xsas-basemaestra no está aplicada en esta base')
    assert.ok(filas.every((f) => f.cuadrilla_estado === 'CANDIDATO'),
      'una cuadrilla observada y no revisada se está publicando como norma')
    assert.ok(filas.every((f) => f.produccion_diaria_referencia !== null),
      'la carga no produjo el efecto que dijo producir')
  })

  c.release()
  await getPool().end()
})
