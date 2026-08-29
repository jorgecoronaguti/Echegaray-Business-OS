// DOS PERSONAS HABLÁNDOLE AL MISMO PRESUPUESTO — contra la base real.
//
// ═══ EL DEFECTO (auditoría delta, 29/08/2026) ═══
//
// La escritura era `.update(...).eq('id', ...)` a secas. El auditor corrió la carrera: A lee 480,
// B escribe 1200, A aplica «520». El UPDATE por `id` pisa a B sin ruido. Y lo grave no es sólo que
// se pierda el 1200:
//
//   · el evento de auditoría registra `antes: 480`, que a esa altura era FALSO;
//   · el outlier midió +8 % cuando el cambio real, contra el estado vivo, era −57 %. La guarda del
//     §20 corrió contra un estado muerto y dijo que sí a un cambio que habría preguntado.
//
// El predicado de concurrencia lo convierte en un UPDATE de CERO filas, y cero filas es la señal.
//
// Todo dentro de `begin`/`rollback`: la base queda como estaba.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('un cambio calculado sobre un valor viejo NO se aplica', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows

  await t.test('el UPDATE con predicado afecta CERO filas si otro ya la movió', async () => {
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-CONC-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Carrera')
        returning id`)
      const [p] = await q(`insert into public.cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
        values ($1, 1, 'Mamposteria', 480, 'm2') returning id`, [cot.id])

      // A LEE 480. (En la app, esto es `estadoDesdeFilas` al abrir la pantalla.)
      const leidoPorA = 480

      // B ESCRIBE 1200 mientras A escribe su frase.
      await q('update public.cotizacion_partida set cantidad = 1200 where id = $1', [p.id])

      // A APLICA «son 520», con el predicado de lo que ÉL leyó.
      const r = await c.query(
        'update public.cotizacion_partida set cantidad = 520 where id = $1 and cantidad = $2',
        [p.id, leidoPorA],
      )
      assert.equal(r.rowCount, 0, 'A pisó el cambio de B: el predicado de concurrencia no frenó nada')

      // ═══ LA EVIDENCIA ES DEL EFECTO ═══
      const [fila] = await q('select cantidad from public.cotizacion_partida where id = $1', [p.id])
      assert.equal(Number(fila.cantidad), 1200, 'el valor de B no sobrevivió')
    } finally {
      await c.query('rollback')
    }
  })

  await t.test('sin el predicado, el mismo caso pisa a B en silencio — el control puede dar rojo', async () => {
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-CONC-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Carrera')
        returning id`)
      const [p] = await q(`insert into public.cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
        values ($1, 1, 'Mamposteria', 480, 'm2') returning id`, [cot.id])
      await q('update public.cotizacion_partida set cantidad = 1200 where id = $1', [p.id])

      // El UPDATE VIEJO, sin predicado. Si esto NO pisara a B, el test de arriba no probaría nada.
      const r = await c.query('update public.cotizacion_partida set cantidad = 520 where id = $1', [p.id])
      assert.equal(r.rowCount, 1)
      const [fila] = await q('select cantidad from public.cotizacion_partida where id = $1', [p.id])
      assert.equal(Number(fila.cantidad), 520, 'el caso ya no reproduce el defecto: revisar este test')
    } finally {
      await c.query('rollback')
    }
  })

  await t.test('un valor previo NULL se defiende con IS NULL, no con `= null`', async () => {
    // `precio_subcontrato = NULL` nunca es cierto en SQL, así que un predicado con `=` dejaría el
    // UPDATE en cero filas SIEMPRE y una carga de subcontrato nunca se podría aplicar.
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-CONC-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Nulos')
        returning id`)
      const [p] = await q(`insert into public.cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
        values ($1, 1, 'Sanitaria', 1, 'gl') returning id`, [cot.id])

      const conIgual = await c.query(
        'update public.cotizacion_partida set precio_subcontrato = 8500000 where id = $1 and precio_subcontrato = $2',
        [p.id, null],
      )
      assert.equal(conIgual.rowCount, 0, '`= NULL` matcheó: SQL cambió de semántica')

      const conIs = await c.query(
        'update public.cotizacion_partida set precio_subcontrato = 8500000 where id = $1 and precio_subcontrato is null',
        [p.id],
      )
      assert.equal(conIs.rowCount, 1, 'con IS NULL tampoco se pudo cargar un subcontrato nuevo')
    } finally {
      await c.query('rollback')
    }
  })

  c.release()
})
