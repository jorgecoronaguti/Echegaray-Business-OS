// RODADOS · LIBRO DE VIDA (migración 20260930T2300) — contra la base real, todo adentro de una transacción
// que se deshace: nada queda en la app viva.
//
// Lo que prueba:
//   1 · cambiar el estado MUEVE el lugar: «hay que llevarlo» no mueve; «en el mecánico» lleva el rodado al lugar
//       del taller (y lo que carga se queda); al cerrar vuelve a donde estaba y queda operativo.
//   2 · un evento con próximo service por fecha aparece en los vencimientos (activo_revision_vigente, el mismo
//       semáforo que la RTO) con los días que faltan calculados ACÁ con aritmética de fechas, no con la vista.
//   3 · los permisos son los mismos para todos los niveles: cada rol que existe en `perfiles` puede registrar y
//       avanzar, y NADIE escribe la tabla directo.
//
// Si la migración no está aplicada, se aplica dentro de la transacción y se deshace al final. Sin base, se saltea.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { semaforo } from '../../src/features/herramientas/logica/revision.ts'

const MIGRACION = '20260930T2300_rodados_libro_de_vida.sql'
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const iso = (d) => d.toISOString().slice(0, 10)
const enDias = (n) => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d }

async function preparar(c) {
  await c.query('begin')
  await c.query('select pg_advisory_xact_lock(20260930)')
  await c.query(`set local lock_timeout = '5s'`)
  // La firma de las funciones cambió con 20261001T0800 (arreglos): se mira la tabla, no la firma, para no
  // reaplicar la migración vieja encima de la nueva y dejar dos sobrecargas.
  if (!(await c.query(`select to_regclass('public.activo_evento') f`)).rows[0].f) {
    await c.query(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', MIGRACION), 'utf8'))
  }
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const origen = (await q(`insert into ubicacion (tipo, nombre) values ('tercero', 'zz-origen-rodado') returning id`))[0].id
  const rodado = (await q(
    `insert into activo (codigo, clase, nombre, patente, ubicacion_id) values ('ZZZ-9901', 'rodado', 'zz camioneta', 'ZZ999ZZ', $1) returning id`, [origen]))[0].id
  await q(`insert into activo_existencia (activo_id, ubicacion_id, cantidad) values ($1, $2, 1)`, [rodado, origen])
  const como = (uid) => c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
  const roles = await q(`select distinct on (rol) id, rol from perfiles order by rol, id`)
  assert.ok(roles.length > 0, 'no hay perfiles: no se puede probar con un usuario')
  await como(roles[0].id)
  const estado = async () => (await q(`select estado, ubicacion_id from activo where id = $1`, [rodado]))[0]
  const lugares = async () => (await q(`select ubicacion_id from activo_existencia where activo_id = $1 and cantidad > 0`, [rodado])).map((r) => r.ubicacion_id)
  return { c, q, origen, rodado, como, roles, estado, lugares }
}

test('estado operativo del rodado: cada paso mueve (o no) el lugar y vuelve a donde estaba', { skip: !hayBase && 'sin base' }, async () => {
  const c = await getPool().connect()
  try {
    const { q, origen, rodado, estado, lugares } = await preparar(c)
    const hoy = iso(enDias(0))
    const ev = (await q(`select public.registrar_evento_activo($1, 'reparacion', 'pendiente', $2, 'pierde aceite', 84320) id`, [rodado, hoy]))[0].id
    let e = await estado()
    assert.equal(e.estado, 'requiere_mantenimiento', 'hay que llevarlo → requiere mantenimiento')
    assert.equal(e.ubicacion_id, origen, 'hay que llevarlo NO mueve el rodado')

    await q(`select public.avanzar_evento_activo($1, 'en_taller', null, null, null, 'zz Taller Pérez')`, [ev])
    e = await estado()
    assert.equal(e.estado, 'reparacion_externa')
    const taller = (await q(`select id, tipo, nombre from ubicacion where id = $1`, [e.ubicacion_id]))[0]
    assert.notEqual(e.ubicacion_id, origen, 'en el mecánico: el rodado cambió de lugar')
    assert.equal(taller.nombre, 'zz Taller Pérez')
    assert.deepEqual(await lugares(), [e.ubicacion_id], 'la existencia por lugar acompaña (el lugar es uno solo)')
    assert.equal((await q(`select ubicacion_origen from activo_evento where id = $1`, [ev]))[0].ubicacion_origen, origen, 'guarda de dónde salió')

    await assert.rejects(q(`select public.avanzar_evento_activo($1, 'hecho', null, 84400, null, null, 185000.5)`, [ev]), /qué se le hizo/,
      'cerrar un arreglo sin decir qué se le hizo no pasa')
    await q(`select public.avanzar_evento_activo($1, 'hecho', null, 84400, null, null, 185000.5, p_trabajo => 'zz cambio de embrague')`, [ev])
    e = await estado()
    assert.equal(e.estado, 'operativo', 'cerrado y sin otro abierto → operativo')
    assert.equal(e.ubicacion_id, origen, 'vuelve a donde estaba')
    assert.deepEqual(await lugares(), [origen])
    const fila = (await q(`select situacion, costo::text, km::text, cerrado_en is not null cerrado from activo_evento where id = $1`, [ev]))[0]
    assert.deepEqual(fila, { situacion: 'hecho', costo: '185000.50', km: '84400.0', cerrado: true })
    await assert.rejects(q(`select public.avanzar_evento_activo($1, 'hecho')`, [ev]), /ya está cerrado/)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('un evento con próximo service entra al semáforo de vencimientos como la RTO', { skip: !hayBase && 'sin base' }, async () => {
  const c = await getPool().connect()
  try {
    const { q, rodado } = await preparar(c)
    const hoy = iso(enDias(0))
    const proximo = iso(enDias(12))
    await q(`select public.registrar_evento_activo($1, 'service', 'hecho', $2, 'service 90.000 km', 90000, null, 'zz Taller Pérez', 95000, 'FA-0001-123', 100000, $3)`,
      [rodado, hoy, proximo])
    const v = (await q(`select tipo, vencimiento::text v, lectura::text l, costo, dias from activo_revision_vigente where activo_id = $1 and tipo = 'service'`, [rodado]))[0]
    assert.ok(v, 'el próximo service no apareció en los vencimientos')
    assert.equal(v.v, proximo)
    assert.equal(v.l, '90000.0')
    assert.equal(v.costo, null, 'el costo vive en el evento, una sola vez')
    assert.equal(Number(v.dias), 12, 'días que faltan: 12 (contados acá: hoy + 12)')
    const s = semaforo({ vencimiento: v.v, resultado: null, dias: Number(v.dias) })
    assert.equal(s.tono, 'warn', 'a 12 días el semáforo avisa (por vencer)')
    assert.equal(s.alerta, true)
    // Sin próximo service no hay vencimiento inventado.
    const otro = (await q(`select count(*)::int n from activo_revision where activo_id = $1`, [rodado]))[0].n
    await q(`select public.registrar_evento_activo($1, 'neumaticos', 'hecho', $2, 'cuatro cubiertas', null, null, 'zz Gomería')`, [rodado, hoy])
    assert.equal((await q(`select count(*)::int n from activo_revision where activo_id = $1`, [rodado]))[0].n, otro)
    // El km próximo queda en el evento (la pantalla lo compara con el último km).
    assert.equal((await q(`select proximo_km::text p from activo_evento where activo_id = $1 and tipo = 'service'`, [rodado]))[0].p, '100000.0')
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('los permisos son los mismos para todos los niveles y nadie escribe la tabla directo', { skip: !hayBase && 'sin base' }, async () => {
  const c = await getPool().connect()
  try {
    const { q, rodado, como, roles } = await preparar(c)
    const hoy = iso(enDias(0))
    for (const r of roles) {
      await como(r.id)
      await q('savepoint s')
      const id = (await q(`select public.registrar_evento_activo($1, 'otro', 'pendiente', $2, $3) id`, [rodado, hoy, `novedad de ${r.rol}`]))[0].id
      await q(`select public.avanzar_evento_activo($1, 'hecho', null, null, null, 'propio', p_trabajo => 'zz novedad resuelta')`, [id])
      const fila = (await q(`select creado_por, cerrado_por from activo_evento where id = $1`, [id]))[0]
      assert.deepEqual([fila.creado_por, fila.cerrado_por], [r.id, r.id], `rol ${r.rol}: registra y cierra con su usuario`)
      await q('release savepoint s')
    }
    // Directo a la tabla: ni insertar ni borrar, con sesión de la app.
    await q('savepoint d')
    await q(`set local role authenticated`)
    await assert.rejects(q(`insert into activo_evento (activo_id, tipo, situacion, fecha, descripcion) values ($1, 'otro', 'pendiente', current_date, 'directo')`, [rodado]),
      /permission denied|row-level security/)
    await q('rollback to savepoint d')
    await q('savepoint a')
    await q(`set local role anon`)
    await assert.rejects(q(`select 1 from activo_evento limit 1`), /permission denied/)
    await q('rollback to savepoint a')
    // Sin usuario logueado, la función dice que no.
    await c.query(`select set_config('request.jwt.claims', '', true)`)
    await assert.rejects(q(`select public.registrar_evento_activo($1, 'otro', 'pendiente', $2, 'sin login')`, [rodado, hoy]), /usuario logueado/)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
