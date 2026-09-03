// `public.cotizacion_encolar_lectura` (20260903T1200) NUNCA CORRIÓ EN RUNTIME.
//
// plpgsql no valida las columnas ni los tipos que referencia hasta la primera ejecución real — la
// migración se aplicó (existe como objeto: `to_regprocedure` la encuentra), pero nadie la había
// invocado. Un error de columna (`orq.xsas_adjunto` con otro nombre, un tipo que no castea) recién
// aparecería la primera vez que un usuario real cotizara un plano.
//
// Esta prueba la ejecuta DE VERDAD (`select * from public.cotizacion_encolar_lectura(...)`, no un
// doble simulado) contra la base productiva, PERO nunca llega a `orq.enqueue_task`: en los tres
// casos se dispara un `raise exception` propio de la función ANTES de encolar nada, así que ninguna
// tarea paga se crea. Todo corre en una transacción que termina en ROLLBACK — ni la fila de
// `cotizacion_lectura` que el primer camino llega a insertar sobrevive. Sin base, se salta.
//
// Conexión directa a Postgres (`orquestador/lib/db.mjs`), sin sesión de PostgREST: por eso
// `auth.uid()` no resuelve solo — se simula con `set_config('request.jwt.claims', ...)` + `set
// local role authenticated`, el mismo patrón que ya usan `escritura-economica.pg.test.mjs` y
// `presupuesto-congelado-avance.pg.test.mjs`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const jwt = (id) => JSON.stringify({ sub: id, role: 'authenticated' })

test('cotizacion_encolar_lectura corre de verdad y nunca llega a encolar — contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]

  /** La sonda que DEBE fallar va en su propio savepoint: el error aborta la transacción hasta ahí,
   *  y sin este `rollback to savepoint` los chequeos siguientes se llevarían puesto el resto. */
  const esperaError = async (sql, params, re, mensaje) => {
    await c.query('savepoint sonda')
    await assert.rejects(() => c.query(sql, params), re, mensaje)
    await c.query('rollback to savepoint sonda')
  }

  try {
    await c.query('begin')
    // Serializa contra cualquier otro pg-test que toque `cotizacion_lectura` en paralelo — mismo
    // motivo que el resto de la suite (deadlock de filas del 22/08).
    await c.query('select pg_advisory_xact_lock(20260903)')

    const dir = await uno(`select id from perfiles where rol='direccion' limit 1`)
    assert.ok(dir?.id, 'no hay un perfil direccion en la base para impersonar')

    await t.test('sin actor (auth.uid() null): "no autorizado" — la función exige sesión', async () => {
      await esperaError(
        `select * from public.cotizacion_encolar_lectura($1, $2)`,
        [null, JSON.stringify([{ nombre: 'zz.pdf', hash: 'x', contenido_base64: 'AAAA' }])],
        /no autorizado/,
        'llamó sin sesión y no rechazó',
      )
    })

    // A partir de acá el actor está seteado para el resto de la transacción: los tres subtests
    // siguientes comparten sesión impersonada, cada uno en su propio savepoint.
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [jwt(dir.id)])
    await c.query('set local role authenticated')

    await t.test('sin adjuntos: "necesito al menos un plano adjunto"', async () => {
      await esperaError(
        `select * from public.cotizacion_encolar_lectura($1, $2)`,
        [null, JSON.stringify([])],
        /necesito al menos un plano adjunto/,
        'un array vacío no fue rechazado',
      )
    })

    await t.test('11 adjuntos: "como máximo 10 adjuntos por cotización"', async () => {
      const once = Array.from({ length: 11 }, (_, i) => ({ nombre: `zz-${i}.pdf`, hash: 'x', contenido_base64: 'AAAA' }))
      await esperaError(
        `select * from public.cotizacion_encolar_lectura($1, $2)`,
        [null, JSON.stringify(once)],
        /como máximo 10 adjuntos/,
        'once adjuntos no fue rechazado',
      )
    })

    await t.test('adjunto con contenido_base64 vacío: descartado con "continue", y sin ninguno legible se rechaza ANTES de encolar', async () => {
      // La función `continue`a el adjunto de contenido vacío (length(v_bytes)=0) y sólo después,
      // con el array de hashes vacío, dispara este `raise` — el mismo camino que el auditor pidió
      // probar. Si esto se dispara limpio, el cuerpo entero corrió sin error de columna/tipo hasta
      // acá SIN tocar `orq.enqueue_task`.
      const antes = await uno(`select count(*)::int as n from public.cotizacion_lectura where actor_id=$1`, [dir.id])
      await esperaError(
        `select * from public.cotizacion_encolar_lectura($1, $2)`,
        ['zz-prueba-rpc', JSON.stringify([{ nombre: 'zz-vacio.pdf', hash: '', contenido_base64: '' }])],
        /ningún adjunto tenía contenido legible/,
        'un adjunto con contenido_base64 vacío no fue rechazado',
      )
      // El savepoint de `esperaError` deshizo también el INSERT en `cotizacion_lectura` que la
      // función alcanzó a hacer antes del raise: no queda fila huérfana ni con el rollback general.
      const despues = await uno(`select count(*)::int as n from public.cotizacion_lectura where actor_id=$1`, [dir.id])
      assert.equal(despues.n, antes.n, 'el rollback al savepoint no deshizo el INSERT intermedio')
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
