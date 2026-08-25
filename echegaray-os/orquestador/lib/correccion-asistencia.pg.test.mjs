// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ESTE ARCHIVO EXIGE LA MIGRACIÓN `20260821T3500_la_salida_que_falta_se_pide_y_la_aprueba_
// administracion.sql` APLICADA EN LA BASE. Todavía NO lo está: la aplica el coordinador de forma
// centralizada, no este trabajo. Hasta que la aplique, el primer assert falla con ese nombre — y esa
// es la respuesta correcta, no un falso verde: sin la tabla no hay nada que probar.
//
// Sin base accesible se SALTA (mismo criterio que el resto de los `.pg.test.mjs`): saltar por falta
// de base es honesto; inventar un verde no.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// M05 · LO QUE ESTE TEST VIGILA, Y POR QUÉ CADA COSA
//
// 1. EL EMPLEADO PIDE, NO CORRIGE. Puede insertar un pedido a nombre propio y nada más: ni a nombre
//    de otro, ni ya aprobado, ni ejecutando la aprobación. Si cualquiera de las tres se abriera, la
//    hora de salida pasaría a ser lo que cada uno declara de sí mismo — y esas horas se liquidan.
//
// 2. APROBAR ESCRIBE LA ASISTENCIA. El efecto NO es el estado del pedido: es la fila en
//    `asistencia_marca` y el día que pasa de `falta_salida` a `completo` con sus minutos. Un test
//    que sólo mirara `estado = 'aprobada'` se validaría contra la misma información que produce.
//
// 3. LA HORA ES LA QUE SE ESCRIBIÓ, EN SAN JUAN. La base corre en UTC: sin el `at time zone`
//    explícito de la función, una salida de las 18:20 quedaría guardada tres horas antes.
//
// 4. RECHAZAR NO TOCA LA ASISTENCIA, y un pedido ya resuelto no se resuelve dos veces.
//
// Todo corre en una transacción que termina en ROLLBACK: no queda ni una fila en la base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const MIGRACION = '20260821T5460_la_salida_que_falta_se_pide_y_la_aprueba_administracion.sql'
const FECHA = '2019-03-05' // un día viejo cualquiera: nadie tiene marcas ahí

test('la corrección de asistencia: se pide, se aprueba y el efecto está en la asistencia',
  { skip: !hayBase }, async (t) => {
    const c = await getPool().connect()
    const q = async (sql, params) => (await c.query(sql, params)).rows
    const uno = async (sql, params) => (await q(sql, params))[0]
    const comoQuien = (id) =>
      c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: id, role: 'authenticated' })])

    try {
      await c.query('begin')

      // ── LO PRIMERO: ¿EXISTE LO QUE HAY QUE PROBAR? ─────────────────────────────────────────────
      const objetos = await uno(`
        select to_regclass('public.solicitud_correccion_asistencia')            as tabla,
               to_regclass('public.mi_correccion_asistencia')                   as vista_mia,
               to_regclass('public.correccion_asistencia_bandeja')              as bandeja,
               to_regproc('public.aprobar_correccion_asistencia')               as aprobar,
               to_regproc('public.rechazar_correccion_asistencia')              as rechazar`)
      for (const [nombre, valor] of Object.entries(objetos)) {
        assert.ok(valor, `FALTA APLICAR LA MIGRACIÓN ${MIGRACION}: no existe «${nombre}» en la base. `
          + 'La aplica el coordinador; este test no la aplica ni la simula.')
      }

      // ── EL PLANTEL DE PRUEBA SALE DE LA BASE, NO SE FABRICA ────────────────────────────────────
      const empleado = await uno(
        `select id, persona_id from perfiles where rol = 'campo' and persona_id is not null limit 1`)
      const admin = await uno(
        `select id from perfiles where rol in ('direccion', 'administracion') limit 1`)
      const otra = await uno(
        `select id from personas where id <> $1 limit 1`, [empleado?.persona_id ?? null])
      assert.ok(empleado, 'no hay ninguna cuenta de nivel campo vinculada a una persona: sin eso M05 no se puede probar')
      assert.ok(admin, 'no hay ninguna cuenta de Administración en la base')

      // La entrada del día viejo, cargada como dueño de la tabla (esto es armado, no lo que se prueba).
      await q(`insert into asistencia_marca (persona_id, fecha, tipo, momento, origen)
               values ($1, $2, 'entrada', ($2::date + time '08:00') at time zone 'America/Argentina/San_Juan', 'zz_test')`,
        [empleado.persona_id, FECHA])

      let solicitud = null

      await t.test('el empleado pide a nombre propio, y sólo a nombre propio', async () => {
        await comoQuien(empleado.id)
        await c.query('set local role authenticated')

        solicitud = await uno(`
          insert into solicitud_correccion_asistencia (persona_id, fecha, tipo, hora_propuesta, motivo)
          values ($1, $2, 'salida', '18:20', 'Me quedé sin batería') returning id`,
          [empleado.persona_id, FECHA])
        assert.ok(solicitud?.id, 'el empleado no pudo pedir la corrección de su propio día')

        // A nombre de otro: la policy lo tiene que rechazar. Va en su propio savepoint porque el
        // error aborta la transacción y se llevaría puesto todo lo que sigue.
        if (otra?.id) {
          await c.query('savepoint intento_ajeno')
          await assert.rejects(
            () => c.query(`insert into solicitud_correccion_asistencia (persona_id, fecha, hora_propuesta, motivo)
                           values ($1, $2, '18:20', 'la de otro')`, [otra.id, FECHA]),
            /row-level security|permission denied/i,
            'un empleado pudo pedir una corrección a nombre de OTRA persona',
          )
          await c.query('rollback to savepoint intento_ajeno')
        }

        // Nacer aprobada: el `estado = 'pendiente'` del with check es lo que lo impide.
        await c.query('savepoint intento_autoaprobado')
        await assert.rejects(
          () => c.query(`insert into solicitud_correccion_asistencia (persona_id, fecha, hora_propuesta, motivo, estado)
                         values ($1, $2, '18:20', 'me autoapruebo', 'aprobada')`, [empleado.persona_id, '2019-03-06']),
          /row-level security|permission denied/i,
          'un empleado pudo crear una corrección YA APROBADA por PostgREST',
        )
        await c.query('rollback to savepoint intento_autoaprobado')

        // Y tampoco puede ejecutar la aprobación.
        await c.query('savepoint intento_aprobar')
        await assert.rejects(
          () => c.query(`select aprobar_correccion_asistencia($1)`, [solicitud.id]),
          /Sólo Administración|permission denied/i,
          'un empleado pudo aprobar su propia corrección de asistencia',
        )
        await c.query('rollback to savepoint intento_aprobar')

        // Una sola pendiente por día: el segundo pedido idéntico rebota.
        await c.query('savepoint intento_duplicado')
        await assert.rejects(
          () => c.query(`insert into solicitud_correccion_asistencia (persona_id, fecha, hora_propuesta, motivo)
                         values ($1, $2, '19:00', 'otra vez')`, [empleado.persona_id, FECHA]),
          /duplicate key|unique/i,
          'se pudieron acumular dos pedidos pendientes del mismo día',
        )
        await c.query('rollback to savepoint intento_duplicado')

        // Lo suyo lo ve; y la vista `mi_*` no le trae lo de nadie más.
        const mias = await q(`select fecha, estado from mi_correccion_asistencia`)
        assert.ok(mias.some((m) => m.estado === 'pendiente'),
          'el empleado no ve su propio pedido en mi_correccion_asistencia')

        await c.query('reset role')
      })

      await t.test('la bandeja se puede LEER, no sólo existe', async () => {
        // «RLS NO ES GRANT», y con `security_invoker = true` se agrava: la vista corre con los
        // permisos de quien consulta, así que basta con que nombre UNA columna sin grant —
        // `personas` los tiene POR COLUMNA y `legajo`, `dni` y `cuil` no están— para que la vista
        // entera devuelva «permission denied» a todo el mundo. Next lo publica como un 404 y se
        // pierde media jornada buscando una ruta que en realidad era un permiso. Que la vista
        // exista no prueba nada: hay que leerla asumiendo el rol.
        await comoQuien(admin.id)
        await c.query('set local role authenticated')
        const filas = await q(`select nombre_completo, fecha, estado from correccion_asistencia_bandeja where id = $1`,
          [solicitud.id])
        await c.query('reset role')
        assert.equal(filas.length, 1, 'Administración no pudo leer la bandeja')
        assert.ok(filas[0].nombre_completo, 'la bandeja no trae el nombre de la persona')
      })

      await t.test('aprobar ESCRIBE la salida en la asistencia real', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')

        const r = await uno(`select aprobar_correccion_asistencia($1, 'ok, avisó ese día') as marca`,
          [solicitud.id])
        assert.ok(r.marca, 'la aprobación no devolvió ninguna marca: no llegó a la asistencia')
        await c.query('reset role')

        const marca = await uno(`
          select tipo, origen, (momento at time zone 'America/Argentina/San_Juan')::time as hora_local
            from asistencia_marca where id = $1`, [r.marca])
        assert.equal(marca.tipo, 'salida')
        assert.equal(marca.origen, 'correccion_aprobada')
        assert.equal(String(marca.hora_local), '18:20:00',
          'la salida quedó guardada a otra hora que la aprobada: la base corre en UTC y hay que convertir desde San Juan')

        const s = await uno(`select estado, marca_id, resuelto_por, resuelta_en
                               from solicitud_correccion_asistencia where id = $1`, [solicitud.id])
        assert.equal(s.estado, 'aprobada')
        assert.equal(s.marca_id, r.marca, 'la solicitud no apunta a la marca que se escribió')
        assert.equal(s.resuelto_por, admin.id)
        assert.ok(s.resuelta_en)
      })

      await t.test('el día del empleado dejó de estar sin salida', async () => {
        // EL EFECTO SE MIRA DONDE LO MIRA LA PERSONA: su propia vista del día, no la tabla.
        await comoQuien(empleado.id)
        await c.query('set local role authenticated')
        const d = await uno(`select estado, minutos from mi_asistencia_dia where fecha = $1`, [FECHA])
        await c.query('reset role')

        assert.equal(d.estado, 'completo', 'el día siguió marcado sin salida después de aprobar la corrección')
        assert.equal(Number(d.minutos), 620, '08:00 → 18:20 son 620 minutos')
      })

      await t.test('aprobar dos veces el mismo pedido no escribe una segunda marca', async () => {
        await comoQuien(admin.id)
        await c.query('set local role authenticated')
        await c.query('savepoint intento_doble')
        await assert.rejects(
          () => c.query(`select aprobar_correccion_asistencia($1)`, [solicitud.id]),
          /ya estaba aprobada/i,
          'un pedido ya resuelto se pudo volver a aprobar',
        )
        await c.query('rollback to savepoint intento_doble')
        await c.query('reset role')
      })

      await t.test('rechazar NO toca la asistencia', async () => {
        const OTRO_DIA = '2019-03-07'
        await q(`insert into asistencia_marca (persona_id, fecha, tipo, momento, origen)
                 values ($1, $2, 'entrada', ($2::date + time '08:00') at time zone 'America/Argentina/San_Juan', 'zz_test')`,
          [empleado.persona_id, OTRO_DIA])

        await comoQuien(empleado.id)
        await c.query('set local role authenticated')
        const s = await uno(`
          insert into solicitud_correccion_asistencia (persona_id, fecha, hora_propuesta, motivo)
          values ($1, $2, '23:59', 'me fui a las doce de la noche') returning id`,
          [empleado.persona_id, OTRO_DIA])
        await c.query('reset role')

        await comoQuien(admin.id)
        await c.query('set local role authenticated')
        await q(`select rechazar_correccion_asistencia($1, 'esa hora no coincide con el parte de obra')`, [s.id])
        await c.query('reset role')

        const estado = await uno(`select estado, marca_id from solicitud_correccion_asistencia where id = $1`, [s.id])
        assert.equal(estado.estado, 'rechazada')
        assert.equal(estado.marca_id, null, 'un rechazo dejó una marca apuntada')

        const salidas = await q(`select id from asistencia_marca
                                  where persona_id = $1 and fecha = $2 and tipo = 'salida'`,
          [empleado.persona_id, OTRO_DIA])
        assert.equal(salidas.length, 0, 'rechazar escribió igual la salida en la asistencia')
      })
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
    }
  })
