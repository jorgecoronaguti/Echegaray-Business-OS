// LA RLS Y EL GRANT POR COLUMNA DE `obra_economia_sheet`, PROBADOS COMO `authenticated`.
//
// Corre en una transacción: si la migración todavía no está aplicada, la aplica ADENTRO y hace
// rollback al final — la base queda como estaba. Así el test vale antes y después de que el dueño la
// aplique. Lo que prueba: el jefe de obra ve los costos y NO el contratado ni el margen; dirección ve
// todo; y nadie con rol `authenticated` puede leer `contratado` de la tabla directa.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const MIGRACION = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations', '20260908T1800_obra_economia_sheet.sql')

test('obra_economia: el jefe ve costos y no precio; dirección ve todo; la tabla no entrega contratado a authenticated', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params).then((r) => r.rows)
  try {
    await c.query('begin')
    const existe = (await q(`select to_regclass('public.obra_economia_sheet') t`))[0].t
    if (!existe) await c.query(await readFile(MIGRACION, 'utf8'))
    const OBRA = 'zz-eco-test'
    await q(`insert into obra_canonica (id, nombre) values ($1, 'ZZ Economía') on conflict (id) do nothing`, [OBRA])
    await q(`insert into obra_economia_sheet (obra_canonica_id, obra_clave, contratado, costo_mo, costo_materiales, margen, origen, origen_fuente, leido_en)
             values ($1, 'zz', 100, 60, 10, 30, 'oc-pesos', 'test', now())
             on conflict (obra_canonica_id) do update set contratado = 100, costo_mo = 60, costo_materiales = 10, margen = 30`, [OBRA])

    const como = async (rol) => {
      const p = (await q(`select id from perfiles where rol = $1 limit 1`, [rol]))[0]
      assert.ok(p, `no hay un perfil con rol ${rol} para probar`)
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
    }
    const salir = () => c.query('reset role')

    await como('jefe_obra')
    const jefe = (await q(`select contratado, margen, costo_mo, costo_materiales from obra_economia_cartera where obra_canonica_id = $1`, [OBRA]))[0]
    assert.deepEqual(jefe, { contratado: null, margen: null, costo_mo: '60.00', costo_materiales: '10.00' },
      'el jefe de obra no ve montos de venta (decisión 19/08) pero sí los costos')
    // El error esperado aborta la transacción: va entre savepoints para que lo que sigue pueda correr.
    await c.query('savepoint perm')
    await assert.rejects(() => q(`select contratado from obra_economia_sheet where obra_canonica_id = $1`, [OBRA]),
      /permission denied/, 'la tabla directa NO puede entregar contratado a authenticated')
    await c.query('rollback to savepoint perm')
    const costoDirecto = await q(`select costo_mo from obra_economia_sheet where obra_canonica_id = $1`, [OBRA])
    assert.equal(costoDirecto[0]?.costo_mo, '60.00', 'los costos sí se leen de la tabla (grant por columna)')
    await salir()

    await como('direccion')
    const dir = (await q(`select contratado, margen from obra_economia_cartera where obra_canonica_id = $1`, [OBRA]))[0]
    assert.deepEqual(dir, { contratado: '100.00', margen: '30.00' }, 'dirección ve el precio y el margen')
    await salir()

    // EL CHECK DEL MARGEN: un margen con un costo desconocido no entra.
    await c.query('savepoint s')
    await assert.rejects(() => q(`insert into obra_economia_sheet (obra_canonica_id, obra_clave, contratado, margen, origen_fuente, leido_en)
                                  values ('zz-eco-test-2', 'zz2', 100, 30, 'test', now())`), /margen_ck/)
    await c.query('rollback to savepoint s')
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
