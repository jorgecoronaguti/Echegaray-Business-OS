// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ESTE ARCHIVO EXIGE LA MIGRACIÓN `20260908T1900_asistencia_dia.sql` APLICADA EN LA BASE.
// Todavía NO lo está: la aplica el dueño de forma centralizada, no este trabajo. Hasta que la
// aplique, el primer assert falla con ese nombre — y ésa es la respuesta correcta, no un falso
// verde: sin la tabla no hay nada que probar.
//
// Sin base accesible se SALTA (mismo criterio que el resto de los `.pg.test.mjs`): saltar por falta
// de base es honesto; inventar un verde no.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ VIGILA, Y POR QUÉ CADA COSA
//
// 1. EL GRANT, MEDIDO COMO `authenticated` DE VERDAD. Es la trampa que ya rompió dos pantallas en
//    producción (20260907T1900 y 20260908T1530): una policy que permite no es un privilegio que
//    otorga, y una tabla nueva nace sin permiso. Probarlo como dueño de la base no prueba nada,
//    porque el dueño saltea RLS y tiene todos los privilegios. Por eso cada bloque hace
//    `set local role authenticated` con un `sub` real.
//
// 2. EL UPSERT ES IDEMPOTENTE. Reabrir el día y corregir «no vino» por «está» es el caso NORMAL de
//    esta pantalla. Sin el único por (persona, fecha) quedarían dos verdades del mismo día y la
//    lectura elegiría una al azar.
//
// 3. QUIÉN MARCÓ LO ESCRIBE LA BASE. El cliente no tiene GRANT sobre `marcado_por`: si pudiera
//    mandarlo, «quién dijo que Juan estaba» sería lo que el cliente quiera decir. Y el trigger
//    tiene que volver a sellarlo en el UPDATE, porque un `default` no se re-aplica ahí.
//
// 4. UNA PRESENCIA NO TIENE MOTIVO. El check impide que una corrección de «no vino» a «está» deje
//    el motivo viejo pegado y arruine para siempre los conteos por causa.
//
// 5. `campo` NO DECLARA PRESENCIA, NI LA PROPIA. La declara quien la constata.
//
// Todo corre en una transacción que termina en ROLLBACK: no queda ni una fila en la base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const MIGRACION = '20260908T1900_asistencia_dia.sql'
const FECHA = '2019-03-06' // un día viejo cualquiera: nadie tiene nada ahí

/** El error de Postgres, sin depender del texto en castellano/inglés del servidor. */
const codigoDe = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e.code ?? 'sin_codigo'
  }
}

test('asistencia_dia: la presencia declarada se guarda, se corrige y nadie la firma por otro',
  { skip: !hayBase }, async (t) => {
    const c = await getPool().connect()
    const q = async (sql, params) => (await c.query(sql, params)).rows
    const uno = async (sql, params) => (await q(sql, params))[0] ?? null
    const comoQuien = (id) =>
      c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: id, role: 'authenticated' })])

    try {
      await c.query('begin')

      // ── ¿EXISTE LO QUE HAY QUE PROBAR? ───────────────────────────────────────────────────────
      const objetos = await uno(`
        select to_regclass('public.asistencia_dia')                as tabla,
               to_regproc('public.asistencia_dia_sella_quien')     as sella`)
      for (const [nombre, valor] of Object.entries(objetos)) {
        assert.ok(valor, `FALTA APLICAR LA MIGRACIÓN ${MIGRACION}: no existe «${nombre}» en la base. `
          + 'La aplica el dueño; este test no la aplica ni la simula.')
      }

      // ── EL PLANTEL DE PRUEBA SALE DE LA BASE, NO SE FABRICA ──────────────────────────────────
      const admin = await uno(
        `select id from perfiles where rol in ('direccion', 'administracion', 'jefe_obra') limit 1`)
      const persona = await uno(`select id from personas limit 1`)
      const obra = await uno(`select id from obra_canonica limit 1`)
      assert.ok(admin, 'no hay ninguna cuenta de Administración/jefe en la base')
      assert.ok(persona, 'no hay ni una persona en la base')

      await t.test('el jefe declara la presencia y la puede LEER (el grant, no la policy)', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')

        await q(`insert into asistencia_dia (persona_id, fecha, obra_canonica_id, estado)
                 values ($1, $2, $3, 'presente')`, [persona.id, FECHA, obra?.id ?? null])

        // LEER es la mitad que la policy sola no prueba: sin `grant select` esto responde
        // «permission denied for table asistencia_dia» aunque la fila exista y la policy la permita.
        const fila = await uno(
          `select estado, motivo, marcado_por from asistencia_dia where persona_id = $1 and fecha = $2`,
          [persona.id, FECHA])
        assert.ok(fila, 'el jefe no pudo leer la presencia que acaba de declarar (¿falta el GRANT?)')
        assert.equal(fila.estado, 'presente')
        assert.equal(fila.marcado_por, admin.id, 'la base no selló quién marcó')

        await c.query('reset role')
      })

      await t.test('corregir el día no crea una segunda verdad, y vuelve a sellar quién', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')

        await q(`insert into asistencia_dia (persona_id, fecha, obra_canonica_id, estado, motivo)
                 values ($1, $2, $3, 'ausente', 'lluvia')
                 on conflict (persona_id, fecha) do update
                 set estado = excluded.estado, motivo = excluded.motivo,
                     obra_canonica_id = excluded.obra_canonica_id`,
          [persona.id, FECHA, obra?.id ?? null])

        const filas = await q(
          `select estado, motivo, marcado_en from asistencia_dia where persona_id = $1 and fecha = $2`,
          [persona.id, FECHA])
        assert.equal(filas.length, 1, 'el mismo día quedó guardado dos veces: falta el único (persona, fecha)')
        assert.equal(filas[0].estado, 'ausente')
        assert.equal(filas[0].motivo, 'lluvia')
        assert.ok(filas[0].marcado_en, 'el update no re-selló marcado_en')

        await c.query('reset role')
      })

      await t.test('el cliente NO puede firmar la presencia con el nombre de otro', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')
        await c.query('savepoint s_firma')

        // Sin GRANT sobre `marcado_por`, esto es 42501 (insufficient_privilege). Si algún día
        // alguien "arregla" el grant a nivel tabla, este test se pone rojo y avisa por qué.
        const codigo = await codigoDe(() => c.query(
          `insert into asistencia_dia (persona_id, fecha, estado, marcado_por)
           values ($1, $2, 'presente', $3)`, [persona.id, '2019-03-07', persona.id]))
        assert.equal(codigo, '42501',
          'el cliente pudo escribir marcado_por: la firma de la presencia dejó de ser un hecho')

        await c.query('rollback to savepoint s_firma')
        await c.query('reset role')
      })

      await t.test('«está» no lleva motivo: el check lo impide', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')
        await c.query('savepoint s_motivo')

        const codigo = await codigoDe(() => c.query(
          `insert into asistencia_dia (persona_id, fecha, estado, motivo)
           values ($1, $2, 'presente', 'lluvia')`, [persona.id, '2019-03-08']))
        assert.equal(codigo, '23514',
          'se pudo guardar una presencia CON motivo: los conteos por causa van a mentir')

        await c.query('rollback to savepoint s_motivo')
        await c.query('reset role')
      })

      await t.test('un estado inventado no entra', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')
        await c.query('savepoint s_estado')

        const codigo = await codigoDe(() => c.query(
          `insert into asistencia_dia (persona_id, fecha, estado)
           values ($1, $2, 'quizas')`, [persona.id, '2019-03-09']))
        assert.equal(codigo, '23514', 'la tabla aceptó un estado que la pantalla no sabe dibujar')

        await c.query('rollback to savepoint s_estado')
        await c.query('reset role')
      })

      const empleado = await uno(
        `select id, persona_id from perfiles where rol = 'campo' and persona_id is not null limit 1`)

      await t.test('campo no declara presencia, ni la propia', { skip: !empleado }, async () => {
        await comoQuien(empleado.id)
        await c.query('set local role authenticated')
        await c.query('savepoint s_campo')

        // 42501: la RLS rechaza el insert. Declararse presente uno mismo es fabricar el hecho que
        // el jefe tiene que constatar.
        const codigo = await codigoDe(() => c.query(
          `insert into asistencia_dia (persona_id, fecha, estado)
           values ($1, $2, 'presente')`, [empleado.persona_id, '2019-03-10']))
        assert.equal(codigo, '42501', 'un usuario de campo pudo declararse presente solo')

        await c.query('rollback to savepoint s_campo')

        // …pero SÍ lee lo suyo, que es lo que hace que la pantalla del empleado pueda existir.
        await c.query(`set local role postgres`)
        await q(`insert into asistencia_dia (persona_id, fecha, estado) values ($1, $2, 'presente')
                 on conflict (persona_id, fecha) do nothing`, [empleado.persona_id, '2019-03-11'])
        await c.query('set local role authenticated')
        const mio = await uno(
          `select estado from asistencia_dia where persona_id = $1 and fecha = '2019-03-11'`,
          [empleado.persona_id])
        assert.ok(mio, 'el empleado no puede leer su propia presencia declarada')

        await c.query('reset role')
      })
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
    }
  })
