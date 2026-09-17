// LA COMPARACIÓN DEL ESPEJO CONTRA POSTGRES DE VERDAD — sin tocar un dato.
//
// Todo pasa en tablas TEMPORALES con la forma de `public.compra_sheet`, dentro de una transacción que
// se deshace. Lo que se prueba es lo que un doble no puede probar: que `to_jsonb(fila) - sellos`
// compara bien `numeric`, `date` y `null`, y que un `sincronizado_en` distinto no se lee como cambio.
// Sin base se salta: no se inventa un verde.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool, closePool } from './db.mjs'
import { sqlDelConteo } from './espejo-aviso.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Corre `fn` en una transacción que SIEMPRE se deshace. */
async function enEnsayo(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query('create temp table ea_antes (like public.compra_sheet including defaults) on commit drop')
    await c.query('create temp table ea_despues (like public.compra_sheet including defaults) on commit drop')
    return await fn(c)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

const FILA = "(fila, proveedor, importe, total, fecha, anulada, sincronizado_en) values (4, 'Hormiserv', 100.50, 121.605, '2026-09-17', false, "
const contar = (c) => c.query(sqlDelConteo({ antes: 'pg_temp.ea_antes', despues: 'pg_temp.ea_despues', clave: 'fila' })).then((r) => r.rows[0])

test('recarga idéntica (sólo cambia sincronizado_en) → cero; importe cambiado → un cambio', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    await c.query(`insert into ea_antes ${FILA} now() - interval '10 minutes')`)
    await c.query(`insert into ea_despues ${FILA} now())`)
    assert.deepEqual(await contar(c), { altas: 0, bajas: 0, cambios: 0 })

    await c.query('update ea_despues set importe = 100.51 where fila = 4')
    assert.deepEqual(await contar(c), { altas: 0, bajas: 0, cambios: 1 })
  })
})

test('una fila que aparece o desaparece se cuenta como alta o baja', { skip: !hayBase && 'sin base' }, async () => {
  await enEnsayo(async (c) => {
    await c.query(`insert into ea_antes ${FILA} now())`)
    await c.query(`insert into ea_despues (fila, proveedor) values (5, 'Nuevo')`)
    assert.deepEqual(await contar(c), { altas: 1, bajas: 1, cambios: 0 })
  })
})

test.after(async () => { await closePool().catch(() => {}) })
