// EL GATE DE CONGELAR, CONTRA LA BASE — la regresión del defecto que encontró el QA visual.
//
// ═══ EL CASO, TAL COMO PASÓ (29/08/2026) ═══
//
// La pantalla 15 dibujaba «NO se congela: 1 bloqueo(s)» —el gate de `freeze.mjs`, correcto— y al
// lado el botón «Congelar» habilitado. `puedeCongelar()` sólo miraba `n_partidas === 0` y
// `congelada_en`, y la server action llamaba a `congelar_presupuesto`, que informa a posteriori qué
// quedó sin respaldo, cuando ya no se puede deshacer. El QA apretó el botón: quedó una versión
// marcada como salida, con un bloqueante vivo y `precio_venta = $0`.
//
// ═══ POR QUÉ ESTE TEST VA CONTRA LA BASE Y NO CONTRA UN OBJETO ═══
//
// El defecto NO estaba en el gate: estaba en que nadie lo consultaba antes de mutar. Un test sobre
// `gateDeCongelado()` habría estado verde todo el tiempo —de hecho lo estaba—. Lo único que prueba
// que esto no vuelve a pasar es intentar congelar de verdad y leer `congelada_en` EN SU DESTINO.
//
// Toda la escritura vive dentro de un `begin`/`rollback`: la base queda como estaba.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { gateDeCongelado } from './freeze.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('congelar exige el gate ANTES de mutar, y la base lo hace cumplir', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows

  /**
   * El uuid de una persona con rol `direccion`. `cot_permiso('FREEZE')` mira el PERFIL de quien
   * pregunta, así que un pool sin identidad rebota por permiso ANTES de llegar al gate — y ahí el
   * test estaría probando el RBAC, no el gate. Se toma un perfil REAL: `perfiles.id` referencia
   * `auth.users` y crear usuarios de Supabase para un test es un efecto lateral sobre una base
   * compartida con producción.
   */
  const [quienCongela] = await q("select id from public.perfiles where rol = 'direccion' limit 1")

  await t.test('un presupuesto con un bloqueante vivo NO se congela, y la fila lo prueba', { skip: !quienCongela && 'no hay ningún perfil de dirección en esta base' }, async () => {
    // ═══ SAVEPOINT, Y POR QUÉ NO SE COMMITEA ═══
    //
    // La excepción del gate aborta la transacción que la contiene, así que sin un savepoint no se
    // puede leer nada después del rebote. Y commitear para leer en limpio está PROHIBIDO por la
    // guarda del repo —«ESCRITURA COMMITEADA DESDE UN TEST SOBRE LA BASE PRODUCTIVA»—, que tiene
    // razón: un test no deja rastro en la base del dueño.
    //
    // Consecuencia declarada: acá se prueba que la función REBOTA y que la fila NO quedó marcada
    // dentro de la transacción. Que un rebote no pueda dejar escritura a medias es la semántica de
    // plpgsql, no algo que este test verifique — y la fixture del QA, que sí está commiteada porque
    // la escribió una persona, cubre el otro lado.
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-GATE-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Prueba del gate')
        returning id`)

      // Una partida SIN análisis y SIN subcontrato: no aporta costo y el gate la marca bloqueante.
      // Es exactamente la forma del presupuesto que el QA logró congelar.
      await q(`insert into public.cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
        values ($1, 1, 'Partida sin analisis', 100, 'm2')`, [cot.id])

      const [{ cot_gate_congelado: gate }] = await q('select public.cot_gate_congelado($1)', [cot.id])
      assert.equal(gate.ready, false, 'el gate de la base dejó pasar un presupuesto sin composición')
      assert.ok(gate.blocking_issues.length > 0, 'el gate dice que no y no dice por qué')

      // Se actúa COMO LA PERSONA: `cot_permiso('FREEZE')` mira el perfil de quien pregunta, y sin
      // identidad el rebote que se mediría sería el del RBAC y no el del gate.
      await c.query('savepoint antes_de_congelar')
      await c.query('set local role authenticated')
      await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [quienCongela.id])

      let rebotó = false
      try {
        await c.query(`select public.cot_congelar_con_gate($1, 'sha-de-prueba', '{}'::jsonb, 'prueba')`, [cot.id])
      } catch (err) {
        rebotó = true
        assert.match(err.message, /no se puede congelar/, `rebotó por otro motivo: ${err.message}`)
      }
      await c.query('rollback to savepoint antes_de_congelar')
      await c.query('reset role')
      assert.equal(rebotó, true, 'congeló un presupuesto con un bloqueante vivo')

      // LA FILA, no el mensaje: se lee sin el rol de la persona para que ninguna policy la esconda.
      const [fila] = await q('select congelada_en from public.cotizaciones where id = $1', [cot.id])
      assert.equal(fila.congelada_en, null, 'la excepción salió pero la fila quedó marcada como congelada')
    } finally {
      await c.query('rollback')
    }
  })

  await t.test('sin partidas tampoco: un precio de $0 no es un precio', async () => {
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-GATE-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Prueba vacia')
        returning id`)
      const [{ cot_gate_congelado: gate }] = await q('select public.cot_gate_congelado($1)', [cot.id])
      assert.equal(gate.ready, false, 'un presupuesto de cero partidas se declaró listo para congelar')

      // Y el gate de JS —el que dibuja la pantalla— tiene que decir LO MISMO. Que difieran es el
      // defecto original: la pantalla decía una cosa y el botón hacía otra.
      const enJs = gateDeCongelado({ cascada: { ventaSinIva: 0 }, cola: { bloqueantes: [], noBloqueantes: [] } })
      assert.equal(enJs.ready, false, 'el gate de la pantalla dice que sí donde la base dice que no')
    } finally {
      await c.query('rollback')
    }
  })

  // ═══ LA FIXTURE VIVA: lo que el QA dejó congelado a propósito ═══
  //
  // `COT-2026-003` v1 quedó congelada CON el defecto adentro. No se toca: se le pregunta al gate de
  // hoy qué habría dicho. Mientras esa fila exista, este test es la prueba de que el sistema de hoy
  // no habría dejado pasar lo que el de ayer dejó.
  await t.test('la versión que el QA congeló con el defecto: el gate de hoy la rechaza', async () => {
    const filas = await q(`select id, congelada_en, venta_sin_iva from public.cotizacion_cascada
      where numero = 'COT-2026-003' and version = 1`)
    if (filas.length === 0) {
      // La fixture es un dato de una base concreta. Si alguien la limpió, este control no puede
      // decir nada — y decirlo es mejor que pasar en verde sin haber mirado.
      t.diagnostic('no está COT-2026-003 v1 en esta base: el control de la fixture no corrió')
      return
    }
    const [f] = filas
    assert.notEqual(f.congelada_en, null, 'la fixture dejó de estar congelada: ya no prueba el defecto')
    const [{ cot_gate_congelado: gate }] = await q('select public.cot_gate_congelado($1)', [f.id])
    assert.equal(gate.ready, false, 'el gate de hoy dejaría pasar lo mismo que el QA congeló mal')
    assert.ok(gate.blocking_issues.length > 0, 'el gate dice que no y no dice por qué')
  })

  c.release()
})
