import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pasoTotalmenteBloqueado, filtrarBloqueadas, pestanasBloqueadas, bloquear, desbloquear,
} from './pestana-bloqueada.mjs'

test('un paso se saltea sólo si TODAS sus pestañas están bloqueadas', () => {
  const bloq = new Set(['Cash Flow Semanal'])
  assert.equal(pasoTotalmenteBloqueado(['Cash Flow Semanal'], bloq), true)
  // escribe dos, sólo una bloqueada → NO se saltea (la otra hay que rehacerla)
  assert.equal(pasoTotalmenteBloqueado(['Cash Flow Semanal', 'Cash Flow Mensual'], bloq), false)
})

test('un paso sin pestañas declaradas nunca se saltea (no posee ninguna)', () => {
  assert.equal(pasoTotalmenteBloqueado([], new Set(['CAJA'])), false)
})

test('un paso con pestañas todas libres corre normal', () => {
  assert.equal(pasoTotalmenteBloqueado(['Impuestos y Financieros'], new Set(['Cash Flow Semanal'])), false)
})

test('filtrarBloqueadas separa libres de bloqueadas para el escritor multi-pestaña', () => {
  const { libres, bloqueadas } = filtrarBloqueadas(
    ['Cash Flow Semanal', 'Cash Flow Mensual'], new Set(['Cash Flow Semanal']))
  assert.deepEqual(libres, ['Cash Flow Mensual'])
  assert.deepEqual(bloqueadas, ['Cash Flow Semanal'])
})

test('sin base, la consulta del candado no rompe: devuelve conjunto vacío', async () => {
  // query inyectado que falla → el candado degrada a "nada bloqueado", nunca tumba la corrida.
  const deps = { query: async () => { throw new Error('sin base') } }
  const set = await pestanasBloqueadas(deps, 'FILE')
  assert.equal(set.size, 0)
})

test('bloquear y desbloquear usan upsert por (file_id, pestana) — no duplican', async () => {
  const capturas = []
  const deps = { query: async (sql, params) => { capturas.push({ sql, params }); return { rows: [] } } }
  await bloquear(deps, 'FILE', 'Cash Flow Semanal', { motivo: 'mía' })
  const ins = capturas.find((c) => /insert into public\.sheet_pestanas_bloqueadas/.test(c.sql))
  assert.ok(ins, 'debe hacer insert')
  assert.match(ins.sql, /on conflict \(file_id, pestana\) do update/)
  assert.deepEqual(ins.params.slice(0, 2), ['FILE', 'Cash Flow Semanal'])

  capturas.length = 0
  await desbloquear(deps, 'FILE', 'Cash Flow Semanal')
  const del = capturas.find((c) => /delete from public\.sheet_pestanas_bloqueadas/.test(c.sql))
  assert.ok(del, 'debe borrar la fila del candado')
  assert.deepEqual(del.params, ['FILE', 'Cash Flow Semanal'])
})
