// LA RLS DE LA LIQUIDACIÓN, MEDIDA ASUMIENDO CADA ROL Y CON FILAS DE VERDAD.
//
// ═══ POR QUÉ CON FILAS, Y POR QUÉ ESTE TEST TIENE QUE EXISTIR ═══
//
// `auditar-permiso-economico.mjs` ya pregunta por estas tres tablas, pero mientras estén VACÍAS su
// veredicto para el jefe de obra es «no le llega nada (y la tabla está vacía igual)»: un control que
// no puede dar rojo. Con la primera quincena cargada el auditor sirve; hasta entonces, y para que no
// dependa de que haya datos, este test escribe una fila real, la mide y la deshace.
//
// ═══ LO QUE SE PRUEBA ES EL EFECTO, NO LA POLICY ═══
//
// Con superusuario la RLS ni se evalúa: una prueba hecha así da verde siempre. Acá se pone
// `request.jwt.claims` con el `sub` de un perfil real y `set local role authenticated`, que es lo
// único que mide lo que va a pasar por PostgREST.
//
// ═══ LOS CUATRO DEFECTOS QUE ATRAPA ═══
//
//  1. Que el JEFE DE OBRA vea sueldos. Entra a la misma pantalla a cargar asistencia, así que la
//     fuga no necesita que nadie escriba una URL rara.
//  2. Que ADMINISTRACIÓN no los vea. Es la mitad de quien tiene que verlos, y en esta base no hay
//     ningún perfil con ese rol: se fabrica dentro de la transacción, porque no medirlo es no saber.
//  3. Que el UPDATE de `authenticated` alcance a `cobra` o `total`. La policy dice qué filas; el
//     GRANT por columna dice qué columnas, y sin él quien corrige el redondeo reescribe la
//     liquidación entera.
//  4. Que una quincena CERRADA se pueda seguir editando. El congelado no puede depender de que la
//     pantalla se acuerde.
//
// Todo dentro de una transacción que termina en ROLLBACK: la base queda como estaba.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** La persona de prueba del repo (`es_prueba`). Nada de esto sobrevive al rollback igual. */
const PRUEBA = 'e2e00000-0000-4000-8000-000000000001'
const VENTANA = ['2031-03-01', '2031-03-15']

async function comoRol(c, sub, sql, params = []) {
  await c.query('savepoint p')
  try {
    await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)", [sub])
    await c.query('set local role authenticated')
    const r = await c.query(sql, params)
    await c.query('reset role')
    await c.query('release savepoint p')
    return { ok: true, filas: r.rowCount, n: r.rows[0]?.n }
  } catch (e) {
    await c.query('rollback to savepoint p')
    await c.query('reset role')
    return { ok: false, error: e.message.split('\n')[0] }
  }
}

test('sueldos: dirección y administración sí, jefe de obra no', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const persona = (await c.query('select id from public.personas where id = $1', [PRUEBA])).rows[0]
    if (!persona) { t.skip('sin la persona de prueba'); return }
    const perfiles = (await c.query(
      `select rol, min(id::text) id from public.perfiles where rol in ('direccion','jefe_obra') group by rol`)).rows
    const porRol = Object.fromEntries(perfiles.map((p) => [p.rol, p.id]))
    if (!porRol.direccion || !porRol.jefe_obra) { t.skip('sin perfiles de dirección y jefe de obra'); return }
    // ADMINISTRACIÓN NO EXISTE EN ESTA BASE. Se fabrica acá adentro: sin medirlo, la mitad de
    // quienes deben ver sueldos queda sin probar y el test sólo diría que el jefe no ve.
    const otro = (await c.query(
      `select id::text from public.perfiles where rol='direccion' and id::text <> $1 limit 1`, [porRol.direccion])).rows[0]
    if (!otro) { t.skip('sin un segundo perfil para convertir en administración'); return }
    await c.query(`update public.perfiles set rol='administracion' where id=$1`, [otro.id])
    porRol.administracion = otro.id

    const liq = (await c.query(
      `insert into public.liquidacion_quincena (desde, hasta, grupo) values ($1,$2,'obreros') returning id`,
      VENTANA)).rows[0].id
    await c.query(
      `insert into public.liquidacion_linea (liquidacion_id, persona_id, horas, valor_hora, cobra,
         adelanto, ya_transferido, por_banco, en_efectivo, total)
       values ($1,$2, 10, 5000, 50000, 0, 0, 20000, 30000, 50000)`, [liq, PRUEBA])
    await c.query(
      `insert into public.persona_tarifa (persona_id, desde, valor_hora, origen)
       values ($1,$2, 5000, 'prueba') on conflict (persona_id, desde) do nothing`, [PRUEBA, VENTANA[0]])

    for (const rol of ['direccion', 'administracion']) {
      assert.ok((await comoRol(c, porRol[rol], 'select count(*)::int n from public.persona_tarifa')).n > 0, `${rol} ve las tarifas`)
      assert.ok((await comoRol(c, porRol[rol], 'select count(*)::int n from public.liquidacion_linea')).n > 0, `${rol} ve las líneas`)
      const upd = await comoRol(c, porRol[rol],
        'update public.liquidacion_linea set efectivo_redondeado=41000 where liquidacion_id=$1', [liq])
      assert.equal(upd.filas, 1, `${rol} escribe el redondeo`)
    }

    // EL JEFE DE OBRA: cero filas en las tres, y su UPDATE no alcanza ninguna. Un cero de la
    // consulta y un cero del update: si la policy se afloja, los dos se ponen en uno.
    for (const tabla of ['persona_tarifa', 'liquidacion_quincena', 'liquidacion_linea']) {
      const r = await comoRol(c, porRol.jefe_obra, `select count(*)::int n from public.${tabla}`)
      assert.equal(r.n, 0, `jefe_obra NO ve ${tabla}`)
    }
    const updJefe = await comoRol(c, porRol.jefe_obra,
      'update public.liquidacion_linea set efectivo_redondeado=1 where liquidacion_id=$1', [liq])
    assert.equal(updJefe.filas, 0, 'jefe_obra no escribe el redondeo de nadie')

    // EL GRANT POR COLUMNA: ni dirección puede tocar `cobra` desde `authenticated`.
    const fuga = await comoRol(c, porRol.direccion,
      'update public.liquidacion_linea set cobra=999 where liquidacion_id=$1', [liq])
    assert.equal(fuga.ok, false, 'reescribir COBRA tiene que fallar por permiso de columna')
    assert.match(fuga.error, /permission denied/i)

    // UNA QUINCENA CERRADA NO SE EDITA, y lo decide la policy.
    await c.query(`update public.liquidacion_quincena set estado='cerrada', cerrada_en=now() where id=$1`, [liq])
    const cerrada = await comoRol(c, porRol.direccion,
      'update public.liquidacion_linea set efectivo_redondeado=1 where liquidacion_id=$1', [liq])
    assert.equal(cerrada.filas, 0, 'la quincena cerrada queda congelada')
  } finally {
    await c.query('rollback')
    c.release()
  }
})

test('total = por banco + en efectivo lo impone la base, no la pantalla', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const persona = (await c.query('select id from public.personas where id = $1', [PRUEBA])).rows[0]
    if (!persona) { t.skip('sin la persona de prueba'); return }
    const liq = (await c.query(
      `insert into public.liquidacion_quincena (desde, hasta, grupo) values ($1,$2,'final') returning id`,
      VENTANA)).rows[0].id
    await assert.rejects(
      c.query(
        `insert into public.liquidacion_linea (liquidacion_id, persona_id, cobra, por_banco, en_efectivo, total)
         values ($1,$2, 50000, 20000, 30000, 999)`, [liq, PRUEBA]),
      /liquidacion_linea_cierra/,
      'una línea que no cuadra no entra',
    )
  } finally {
    await c.query('rollback')
    c.release()
  }
})
