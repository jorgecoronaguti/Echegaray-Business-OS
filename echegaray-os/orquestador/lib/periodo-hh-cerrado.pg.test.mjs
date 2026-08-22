// EL CIERRE DEL PERÍODO DE HH — contra la base real, con la migración aplicada ADENTRO.
//
// La migración `20260821T5800_el_periodo_de_hh_se_cierra` NO está aplicada en la base viva y no la
// aplica este test: la lee del repo, la corre dentro de una transacción y termina en ROLLBACK. No
// queda ni una tabla, ni un trigger, ni una fila. Aplicarla a la base la decide quien integra.
//
// Lo que se prueba es lo que le da sentido al cierre —si esto no vale, «Cerrado» es una etiqueta—:
//
//   1 · cerrar sin permiso ECONÓMICO falla. Un jefe de obra administra personas desde el 19/08 pero
//       no declara con qué número se liquida.
//   2 · cerrar con correcciones de asistencia PENDIENTES falla: una hora que todavía puede cambiar
//       no puede estar dentro de un total firmado.
//   3 · el efecto se relee: la fila queda `cerrado` con quién y cuándo. No se le cree a la función.
//   4 · un mes cerrado RECHAZA horas de ese mes, y no toca los demás.
//   5 · el orquestador (sin sesión, `service_role`) SIGUE pudiendo escribir: su fuente es externa y
//       hacerla rebotar rompería el sync entero.
//   6 · la única puerta es la función: `authenticated` no tiene grant para escribir `periodo_hh` a
//       mano, ni siquiera con permiso económico — por ahí se saltearía la validación de 2.
//
// Sin base, se salta. No se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = join(
  import.meta.dirname, '..', '..',
  'supabase/migrations/20260821T5800_el_periodo_de_hh_se_cierra.sql',
)

// El mes de prueba es uno SIN horas reales cargadas (los datos vivos arrancan el 22/06/2026): así
// el bloqueo que se observa es el de las filas de este test y no el de una fila de producción.
const CERRADO = '2026-05-01'
const OTRO = '2026-04-01'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('el período de HH se cierra, y cerrado bloquea de verdad', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const sesion = async (id) =>
    c.query(`select set_config('request.jwt.claims', $1, true)`, [
      id ? JSON.stringify({ sub: id, role: 'authenticated' }) : '',
    ])

  try {
    await c.query('begin')
    await c.query(readFileSync(MIGRACION, 'utf8'))

    const dir = await uno(`select id from perfiles where rol='direccion' limit 1`)
    const jefe = await uno(`select id from perfiles where rol='jefe_obra' limit 1`)
    const persona = await uno(`select id from personas limit 1`)
    const OBRA = 'zz-test-periodo-hh'
    await q(`insert into obra_canonica (id, nombre) values ($1, 'ZZ Test período HH')`, [OBRA])

    const cargarHoras = (fecha) => q(
      `insert into registros_hh (obra_canonica_id, persona_id, fecha, horas, tipo_hora, fuente_legacy)
       values ($1, $2, $3, 8, 'normal', 'zz-test')`,
      [OBRA, persona.id, fecha],
    )

    await t.test('cerrar sin permiso económico falla — el jefe de obra administra, no liquida', async () => {
      await sesion(jefe.id)
      assert.equal((await uno(`select public.es_administracion() as x`)).x, true, 'el jefe SÍ administra')
      assert.equal((await uno(`select public.ve_economia() as x`)).x, false, 'el jefe NO ve economía')
      await c.query('savepoint sin_permiso')
      await assert.rejects(
        () => c.query(`select cerrar_periodo_hh($1)`, [CERRADO]),
        /económico|Dirección o Administración/i,
        'un rol sin permiso económico pudo cerrar el período',
      )
      await c.query('rollback to savepoint sin_permiso')
      assert.equal(
        (await q(`select 1 from periodo_hh where periodo=$1`, [CERRADO])).length, 0,
        'el intento rechazado dejó igual la fila del período',
      )
    })

    await t.test('con correcciones pendientes NO se cierra: el total todavía puede cambiar', async () => {
      await sesion(dir.id)
      const s = await uno(
        `insert into solicitud_correccion_asistencia (persona_id, fecha, tipo, hora_propuesta, motivo)
         values ($1, '2026-05-15', 'salida', '18:20', 'me olvide de marcar la salida') returning id`,
        [persona.id],
      )
      await c.query('savepoint con_pendientes')
      await assert.rejects(
        () => c.query(`select cerrar_periodo_hh($1)`, [CERRADO]),
        /pendientes/i,
        'cerró un mes con una corrección de asistencia sin resolver',
      )
      await c.query('rollback to savepoint con_pendientes')

      // Resuelta —rechazada también es resuelta— el mismo cierre pasa. Lo que bloquea es lo que
      // sigue abierto, no la existencia del pedido: agosto tiene 3 correcciones y se cierra igual.
      await q(`update solicitud_correccion_asistencia set estado='rechazada', resuelta_en=now() where id=$1`, [s.id])
      const id = await uno(`select cerrar_periodo_hh($1) as id`, [CERRADO])
      assert.ok(id.id, 'la función no devolvió el id de la fila sellada')
    })

    await t.test('el efecto se relee: la fila queda cerrada, con quién y cuándo', async () => {
      const p = await uno(`select estado, cerrado_por, cerrado_en from periodo_hh where periodo=$1`, [CERRADO])
      assert.equal(p.estado, 'cerrado')
      assert.equal(p.cerrado_por, dir.id, 'el sello no dice quién cerró')
      assert.ok(p.cerrado_en, 'el sello no dice cuándo')
      // Y el panel que lee la pantalla publica ese mismo estado — no un segundo cálculo.
      const panel = await uno(`select estado, correcciones, correcciones_pendientes from periodo_hh_panel where periodo=$1`, [CERRADO])
      assert.equal(panel.estado, 'cerrado')
      assert.equal(Number(panel.correcciones), 1, 'la corrección resuelta desapareció del panel')
      assert.equal(Number(panel.correcciones_pendientes), 0)
    })

    await t.test('cerrado bloquea las horas de ESE mes y no toca los demás', async () => {
      await sesion(dir.id)
      await c.query('savepoint carga_bloqueada')
      await assert.rejects(
        () => cargarHoras('2026-05-20'),
        /cerrado/i,
        'entraron horas a un mes cerrado: el cierre no bloquea nada',
      )
      await c.query('rollback to savepoint carga_bloqueada')

      await cargarHoras('2026-04-14')
      assert.equal(
        (await q(`select 1 from registros_hh where obra_canonica_id=$1 and fecha='2026-04-14'`, [OBRA])).length, 1,
        `el bloqueo de ${CERRADO} se llevó puesto a ${OTRO}`,
      )

      // Mover una fila DESDE un mes abierto HACIA el cerrado también cambia el total firmado.
      await c.query('savepoint mudanza')
      await assert.rejects(
        () => c.query(`update registros_hh set fecha='2026-05-05' where obra_canonica_id=$1 and fecha='2026-04-14'`, [OBRA]),
        /cerrado/i,
        'un update mudó horas a un mes cerrado',
      )
      await c.query('rollback to savepoint mudanza')
    })

    await t.test('el sync del orquestador (sin sesión) sigue escribiendo el mes cerrado', async () => {
      await sesion(null)
      assert.equal((await uno(`select auth.uid() as u`)).u, null, 'la sonda no quedó sin sesión')
      await cargarHoras('2026-05-21')
      assert.equal(
        (await q(`select 1 from registros_hh where obra_canonica_id=$1 and fecha='2026-05-21'`, [OBRA])).length, 1,
        'el cierre rompió el sync del orquestador',
      )
    })

    await t.test('la única puerta es la función: authenticated no escribe periodo_hh a mano', async () => {
      await c.query('savepoint como_authenticated')
      await sesion(dir.id)
      await c.query(`set local role authenticated`)
      assert.equal(
        (await q(`select 1 from periodo_hh where periodo=$1`, [CERRADO])).length, 1,
        'Dirección dejó de LEER el estado del período (grant select)',
      )
      await c.query('savepoint intento_escritura')
      await assert.rejects(
        () => c.query(`insert into periodo_hh (periodo, estado, cerrado_en) values ('2026-03-01','cerrado', now())`),
        /permission denied|permiso/i,
        'se pudo sellar un período por PostgREST, salteando la validación de correcciones pendientes',
      )
      await c.query('rollback to savepoint intento_escritura')
      await c.query('rollback to savepoint como_authenticated')
    })

    await t.test('reabrir borra el sello y devuelve el mes a la carga', async () => {
      await sesion(dir.id)
      await q(`select reabrir_periodo_hh($1)`, [CERRADO])
      const p = await uno(`select estado, cerrado_por, cerrado_en from periodo_hh where periodo=$1`, [CERRADO])
      assert.equal(p.estado, 'abierto')
      assert.equal(p.cerrado_por, null, 'el período reabierto sigue mostrando quién lo firmó')
      assert.equal(p.cerrado_en, null)
      await cargarHoras('2026-05-22')
      assert.equal(
        (await q(`select 1 from registros_hh where obra_canonica_id=$1 and fecha='2026-05-22'`, [OBRA])).length, 1,
        'reabrir no liberó la carga de horas',
      )
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
