// LA GUARDA DE LA PASADA ÚNICA — si una RPC de pantalla vuelve a recorrer dos veces su vista cara,
// este test se pone rojo (auditor de cierre, 11/09/2026: «el efecto del trabajo no tenía guarda»).
//
// Mide `shared hit` (buffers) con EXPLAIN ANALYZE en una transacción revertida, como usuario de
// dirección con RLS puesta. Los techos son cómodos sobre lo medido tras 20260911T1030
// (pantalla_clientes 13.087, campanita_atencion 353) y muy por debajo de lo anterior (17.777 / 417).
// Buffers y no ms: los ms dependen de la carga de la VM y no replican.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPool } from './db.mjs'

const UID_DIRECCION = 'ede1fa51-517b-4f27-b6d9-09ce8a704aca'
const TECHO = { pantalla_clientes: 13_500, campanita_atencion: 400 }

async function buffersDe(c, fn) {
  const { rows } = await c.query(`explain (analyze, buffers, format json) select public.${fn}()`)
  const plan = rows[0]['QUERY PLAN'][0].Plan
  return plan['Shared Hit Blocks'] + plan['Shared Read Blocks']
}

test('cada RPC de pantalla recorre su vista cara UNA vez: los buffers no vuelven a la doble pasada', async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: UID_DIRECCION, role: 'authenticated' })])
    await c.query('set local role authenticated')
    for (const [fn, techo] of Object.entries(TECHO)) {
      const medido = await buffersDe(c, fn)
      assert.ok(medido > 0, `${fn}: no se midió nada`)
      assert.ok(medido <= techo, `${fn}: ${medido} buffers supera el techo ${techo} — ¿volvió la doble pasada?`)
    }
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
    await getPool().end().catch(() => {})
  }
})
