// UN SERVICIO TÉCNICO ES UN PROVEEDOR (20260923T2400) — probado contra la base en una transacción
// que se revierte. El proveedor `zz-st-test` existe sólo dentro del `begin … rollback`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

async function conTransaccion(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    // Las funciones piden un usuario logueado (`_activo_usuario`): se simula uno del JWT.
    const u = await c.query(`select p.id from public.perfiles p join auth.users u on u.id = p.id order by u.created_at limit 1`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: u.rows[0].id, email: 'test@zz', role: 'authenticated' })])
    await fn(c)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

test('el lugar de un proveedor se crea una sola vez, lo clasifica como Servicio técnico y el nombre no se duplica', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    const p = await c.query(`insert into public.proveedores (nombre, es_prueba) values ('zz-st-test', true) returning id`)
    // Un proveedor de prueba no se puede usar (la app viva no ve datos de prueba).
    await c.query('savepoint sp')
    await assert.rejects(c.query(`select public.ubicacion_de_proveedor($1)`, [p.rows[0].id]), /no existe/)
    await c.query('rollback to savepoint sp')
    await c.query(`update public.proveedores set es_prueba = false where id = $1`, [p.rows[0].id])
    const a = await c.query(`select public.ubicacion_de_proveedor($1) id`, [p.rows[0].id])
    const b = await c.query(`select public.ubicacion_de_proveedor($1) id`, [p.rows[0].id])
    assert.equal(a.rows[0].id, b.rows[0].id, 'uno por proveedor')
    const u = await c.query(`select tipo, nombre, proveedor_id, archivada from public.ubicacion where id = $1`, [a.rows[0].id])
    assert.deepEqual(u.rows[0], { tipo: 'servicio_tecnico', nombre: null, proveedor_id: p.rows[0].id, archivada: false })
    const r = await c.query(`select rubro, rubro_declarado_por from public.proveedores where id = $1`, [p.rows[0].id])
    assert.deepEqual(r.rows[0], { rubro: 'Servicio técnico', rubro_declarado_por: 'test@zz' })
  })
})

test('un rubro declarado por una persona no se pisa, y el lugar archivado vuelve', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    const p = await c.query(`insert into public.proveedores (nombre, rubro, rubro_declarado_por, rubro_declarado_en) values ('zz-st-test-2', 'Equipos', 'alguien', now()) returning id`)
    const a = await c.query(`select public.ubicacion_de_proveedor($1) id`, [p.rows[0].id])
    await c.query(`update public.ubicacion set archivada = true where id = $1`, [a.rows[0].id])
    const b = await c.query(`select public.ubicacion_de_proveedor($1) id`, [p.rows[0].id])
    assert.equal(a.rows[0].id, b.rows[0].id)
    const u = await c.query(`select archivada from public.ubicacion where id = $1`, [a.rows[0].id])
    assert.equal(u.rows[0].archivada, false)
    const r = await c.query(`select rubro from public.proveedores where id = $1`, [p.rows[0].id])
    assert.equal(r.rows[0].rubro, 'Equipos', 'lo declarado por una persona gana')
  })
})

test('crear_ubicacion ya no acepta servicio_tecnico y sigue creando terceros sueltos', { skip: !hayBase }, async () => {
  await conTransaccion(async (c) => {
    await c.query('savepoint sp')
    await assert.rejects(c.query(`select public.crear_ubicacion('servicio_tecnico', 'Taller Pepe')`), /es un proveedor/)
    await c.query('rollback to savepoint sp')
    const t = await c.query(`select public.crear_ubicacion('tercero', 'Vecino', null) id`)
    const u = await c.query(`select tipo, nombre, proveedor_id from public.ubicacion where id = $1`, [t.rows[0].id])
    assert.deepEqual(u.rows[0], { tipo: 'tercero', nombre: 'Vecino', proveedor_id: null })
  })
})

test('el lugar semilla «Servicio técnico sin identificar» quedó archivado y sin nada adentro', { skip: !hayBase }, async () => {
  const r = await getPool().query(`select archivada, (select count(*)::int from public.activo a where a.ubicacion_id = u.id and a.estado <> 'baja') n
    from public.ubicacion u where tipo = 'servicio_tecnico' and proveedor_id is null and nombre = 'Servicio técnico sin identificar'`)
  for (const f of r.rows) { assert.equal(f.archivada, true); assert.equal(f.n, 0) }
})

test.after(() => getPool().end())
