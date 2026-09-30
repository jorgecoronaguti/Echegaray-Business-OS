// ACOPIO EN EL TALLER PARA UNA OBRA, CONTRA LA BASE REAL (migración 20260930T2300).
//
//   1 · Ingreso con destino: queda en el Taller, acopiado para esa obra (y libre lo que no lo es).
//   2 · Mover a la obra destino consume PRIMERO el acopio de esa obra, después lo libre; un remito.
//   3 · Mover acopio de A a otra obra B exige confirmación; confirmado, se reasigna con rastro.
//   4 · Reasignar/liberar deja quién y cuándo; acopiar fuera del Taller o para una obra inexistente se rechaza.
//   5 · Suma: material_control_libro() no devuelve filas (cada fila se explica con el libro).
//   6 · RLS: dirección, administración y jefe ven el acopio como el resto de Materiales; campo sólo el de SU obra
//       y no opera.
//
// Todo dentro de una transacción que termina en ROLLBACK. Sin base, se salta.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260930T2300_material_acopio_en_taller_para_obra.sql'), 'utf8')
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('acopio en el Taller para una obra', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const claims = (sub) => c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
  // Un error dentro de la transacción la aborta: cada rechazo esperado va en su savepoint.
  const rechaza = async (sql, params, re) => {
    await c.query('savepoint sp')
    await assert.rejects(() => c.query(sql, params), re)
    await c.query('rollback to savepoint sp')
  }
  try {
    await c.query('begin')
    // Una migración sobre la base COMPARTIDA: sin el lock, dos corridas se traban entre sí.
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query(MIGRACION)

    const perf = async (rol, n = 0) => (await q('select id from perfiles where rol = $1 order by id offset $2 limit 1', [rol, n]))[0]?.id
    const dir = await perf('direccion'); const jefe = await perf('jefe_obra'); const campo = await perf('campo')
    const adm = await perf('direccion', 1)
    assert.ok(dir && jefe && campo && adm, 'faltan perfiles para probar los niveles')
    // No hay un perfil «administracion» real: se convierte uno dentro de la transacción (el rollback lo deshace).
    await c.query(`update perfiles set rol = 'administracion' where id = $1`, [adm])

    const [A, B] = (await q(`select id from obra_canonica where estado = 'activa' order by id limit 2`)).map((r) => r.id)
    const ub = async (obra) => (await q(`select id from ubicacion where tipo = 'obra' and obra_id = $1 and not archivada`, [obra]))[0]?.id
    const uA = await ub(A); const uB = await ub(B)
    const taller = (await q(`select id from ubicacion where tipo = 'taller' and not archivada limit 1`))[0]?.id
    assert.ok(A && B && uA && uB && taller, 'faltan obras activas con ubicación, o el Taller, en la base')
    // El campo ve la obra A (asignación dentro de la transacción).
    await c.query('insert into usuario_obra (usuario_id, obra_canonica_id) values ($1, $2)', [campo, A])

    await c.query('set local role authenticated')
    await claims(dir)
    const nombre = `ZZ-acopio-${Date.now()}`
    const total = async (mat) => Number((await q('select coalesce(sum(cantidad), 0) s from material_existencia where material_id = $1', [mat]))[0].s)
    // «lugar:destino=cantidad», ordenado: la forma legible de comparar el estado completo.
    const filas = async (mat) => (await q(`select ubicacion_id u, destino_obra_id d, cantidad::float8 c from material_existencia where material_id = $1`, [mat]))
      .map((r) => `${r.u === taller ? 'taller' : r.u === uA ? 'obraA' : 'obraB'}:${r.d ?? 'libre'}=${r.c}`).sort()
    const esperado = (...x) => [...x].sort()

    const mat = (await q(`select public.ingresar_material($1, 'u', $2, 10, 'compra directa', $3) id`, [nombre, taller, A]))[0].id
    await q(`select public.ingresar_material($1, 'u', $2, 4, 'stock inicial', null)`, [nombre, taller])

    await t.test('ingreso con destino: queda en el Taller acopiado para la obra', async () => {
      assert.deepEqual(await filas(mat), esperado('taller:libre=4', `taller:${A}=10`))
    })

    await t.test('acopiar fuera del Taller o para una obra inexistente se rechaza', async () => {
      await rechaza(`select public.ingresar_material($1, 'u', $2, 1, 'xxx', $3)`, [nombre, uA, A], /sólo el Taller acopia/)
      await rechaza(`select public.ingresar_material($1, 'u', $2, 1, 'xxx', 'no-existe')`, [nombre, taller], /no existe o no está activa/)
    })

    await t.test('mover a la obra destino consume primero su acopio y después lo libre, en un remito', async () => {
      const antes = await total(mat)
      const rem = (await q(`select public.mover_material($1::jsonb, $2, $3, 'Pérez', null) r`, [JSON.stringify([{ material: mat, cantidad: 12 }]), taller, uA]))[0].r
      assert.deepEqual(await filas(mat), esperado('taller:libre=2', 'obraA:libre=12'))
      assert.equal(await total(mat), antes, 'la suma cambió al mover')
      const movs = await q(`select acopio_id a, cantidad::float8 c from material_movimiento where remito_id = $1 order by cantidad desc`, [rem])
      assert.deepEqual(movs.map((m) => [m.a, m.c]), [[A, 10], [null, 2]])
      assert.equal((await q('select count(*)::int n from remito_item where remito_id = $1', [rem]))[0].n, 1)
    })

    await t.test('mover acopio de A a la obra B pide confirmación y, confirmado, reasigna con rastro', async () => {
      await q(`select public.ingresar_material($1, 'u', $2, 5, 'compra', $3)`, [nombre, taller, A])
      const item = (extra) => JSON.stringify([{ material: mat, cantidad: 3, acopio: A, ...extra }])
      await rechaza(`select public.mover_material($1::jsonb, $2, $3, null, null)`, [item({}), taller, uB], /confirmá la reasignación/)
      assert.equal(await total(mat), 19, 'el rechazo no debió mover nada')
      await q(`select public.mover_material($1::jsonb, $2, $3, null, null)`, [item({ reasignar: true }), taller, uB])
      const r = await q(`select acopio_id a, acopio_a_id p, usuario_id u, creado_en from material_movimiento where material_id = $1 and tipo = 'reasignacion'`, [mat])
      assert.equal(r.length, 1)
      assert.deepEqual([r[0].a, r[0].p, r[0].u], [A, B, dir])
      assert.ok(r[0].creado_en)
      assert.deepEqual(await filas(mat), esperado('taller:libre=2', `taller:${A}=2`, 'obraA:libre=12', 'obraB:libre=3'))
    })

    await t.test('reasignar / liberar desde la ficha deja quién y cuándo', async () => {
      await q(`select public.reasignar_acopio($1, $2, $3, null, 1, 'ya no es para esa obra')`, [mat, taller, A])
      await q(`select public.reasignar_acopio($1, $2, null, $3, 2, null)`, [mat, taller, B])
      assert.deepEqual(await filas(mat), esperado(`taller:${A}=1`, `taller:${B}=2`, 'taller:libre=1', 'obraA:libre=12', 'obraB:libre=3'))
      await rechaza(`select public.reasignar_acopio($1, $2, $3, $3, 1, null)`, [mat, taller, A], /nada que cambiar/)
      await rechaza(`select public.reasignar_acopio($1, $2, null, $3, 1, null)`, [mat, uA, A], /sólo en el Taller/)
      const n = Number((await q(`select count(*) n from material_movimiento where material_id = $1 and tipo = 'reasignacion' and usuario_id = $2 and creado_en is not null`, [mat, dir]))[0].n)
      assert.equal(n, 3)
    })

    await t.test('el libro explica cada fila: material_control_libro() vacío', async () => {
      // Es de auditoría (sin grant a authenticated): se corre como dueño de la base, no como un usuario.
      await c.query('reset role')
      assert.deepEqual(await q('select * from material_control_libro()'), [])
    })

    await t.test('RLS por nivel', async () => {
      const visibles = async (quien) => {
        await c.query('reset role'); await claims(quien); await c.query('set local role authenticated')
        return Number((await q(`select count(*) n from material_existencia where material_id = $1 and destino_obra_id is not null`, [mat]))[0].n)
      }
      // Dos filas acopiadas: para A y para B.
      assert.equal(await visibles(dir), 2)
      assert.equal(await visibles(adm), 2)
      assert.equal(await visibles(jefe), 2, 'el jefe entra por es_administracion(): mismo alcance que el resto de Materiales')
      assert.equal(await visibles(campo), 1, 'campo ve sólo el acopio de SU obra')
      await rechaza(`select public.reasignar_acopio($1, $2, $3, null, 1, null)`, [mat, taller, A], /./)
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
