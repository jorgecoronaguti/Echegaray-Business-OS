// EFECTIVO · RECIBO FIRMADO DEL GASTO MANUAL (migración 20261001T0900) — contra la base real, adentro de una
// transacción que se deshace: no queda ninguna firma ni ningún dato de prueba en la app viva.
//
// Lo que prueba: la función firma un gasto MANUAL con el usuario que rinde, copia monto y entrega del gasto,
// no firma dos veces, no firma un ticket, valida trazo/aclaración/DNI, la fila no se modifica ni se borra, y
// nadie escribe la tabla directo. Sin base o sin un gasto manual cargado, se saltea diciéndolo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = '20261001T0900_efectivo_recibo_firmado.sql'
const TRAZO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220"><path d="M10 10 L50 60 L90 20" fill="none" stroke="#111"/></svg>'
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

async function preparar(c) {
  await c.query('begin')
  await c.query(`set local lock_timeout = '5s'`)
  if (!(await c.query(`select to_regclass('public.efectivo_recibo_firma') f`)).rows[0].f) {
    await c.query(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', MIGRACION), 'utf8'))
  }
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const como = (uid) => c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
  const manual = (await q(`select r.id, r.entrega_id, r.monto::text monto from efectivo_rendicion r
    where r.origen = 'manual' and not exists (select 1 from efectivo_recibo_firma f where f.rendicion_id = r.id) limit 1`))[0]
  const ticket = (await q(`select id from efectivo_rendicion where origen = 'ticket' limit 1`))[0]
  const direccion = (await q(`select id from perfiles where rol = 'direccion' order by id limit 1`))[0]
  const campo = (await q(`select id from perfiles where rol = 'campo' order by id limit 1`))[0]
  return { q, como, manual, ticket, direccion, campo }
}

test('firmar el recibo de un gasto manual: se guarda una vez, con los datos del gasto, y no se toca más', { skip: !hayBase && 'sin base' }, async (t) => {
  const c = await getPool().connect()
  try {
    const { q, como, manual, ticket, direccion, campo } = await preparar(c)
    if (!manual || !direccion) return t.skip('no hay un gasto manual sin firmar (o un usuario de Dirección) con qué probar')
    const firmar = (id, trazo, acl, dni) => q(`select public.firmar_recibo_gasto_manual($1, $2, $3, $4) en`, [id, trazo, acl, dni])
    const falla = async (promesa, patron, que) => {
      await q('savepoint s')
      await assert.rejects(promesa(), patron, que)
      await q('rollback to savepoint s')
    }

    await c.query(`select set_config('request.jwt.claims', '', true)`)
    await falla(() => firmar(manual.id, TRAZO, 'Juan Pérez', null), /usuario logueado/, 'sin sesión no firma')

    await como(direccion.id)
    await falla(() => firmar(manual.id, '<svg></svg>', 'Juan Pérez', null), /falta la firma/, 'un trazo vacío no es una firma')
    await falla(() => firmar(manual.id, TRAZO, 'JP', null), /aclaración/, 'la aclaración de dos letras no alcanza')
    await falla(() => firmar(manual.id, TRAZO, 'Juan Pérez', '12'), /DNI/, 'un DNI de dos cifras no pasa')
    if (ticket) await falla(() => firmar(ticket.id, TRAZO, 'Juan Pérez', null), /cargados a mano/, 'un ticket no lleva recibo firmado')
    if (campo) {
      await como(campo.id)
      await falla(() => firmar(manual.id, TRAZO, 'Juan Pérez', null), /quien rinde esta entrega/, 'no firma quien no rinde esa entrega')
      await como(direccion.id)
    }

    const [{ en }] = await firmar(manual.id, TRAZO, '  Juan   Pérez ', '30.111.222')
    assert.ok(en, 'devuelve cuándo quedó firmado')
    const fila = (await q(`select entrega_id, monto::text monto, aclaracion, dni, registrado_por from efectivo_recibo_firma where rendicion_id = $1`, [manual.id]))[0]
    assert.deepEqual(fila, { entrega_id: manual.entrega_id, monto: manual.monto, aclaracion: 'Juan Pérez', dni: '30111222', registrado_por: direccion.id },
      'el monto y la entrega salen del gasto, no de quien llama; la aclaración y el DNI quedan limpios')

    await falla(() => firmar(manual.id, TRAZO, 'Juan Pérez', null), /ya está firmado/, 'no se firma dos veces')
    await falla(() => q(`update efectivo_recibo_firma set monto = monto + 1 where rendicion_id = $1`, [manual.id]), /no se modifica ni se borra/, 'la firma no se edita')
    await falla(() => q(`delete from efectivo_recibo_firma where rendicion_id = $1`, [manual.id]), /no se modifica ni se borra/, 'la firma no se borra')

    await q('savepoint d')
    await q(`set local role authenticated`)
    await assert.rejects(q(`insert into efectivo_recibo_firma (rendicion_id, entrega_id, monto, fecha, trazo, aclaracion, registrado_por)
      values (gen_random_uuid(), $1, 1, current_date, $2, 'directo', $3)`, [manual.entrega_id, TRAZO, direccion.id]), /permission denied|row-level security/)
    await q('rollback to savepoint d')
    await q('savepoint a')
    await q(`set local role anon`)
    await assert.rejects(q(`select 1 from efectivo_recibo_firma limit 1`), /permission denied/)
    await assert.rejects(q(`select public.firmar_recibo_gasto_manual($1, $2, 'Juan Pérez', null)`, [manual.id, TRAZO]), /permission denied/)
    await q('rollback to savepoint a')
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
