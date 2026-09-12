import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pasoTotalmenteBloqueado, filtrarBloqueadas, pestanasBloqueadas, bloquear, desbloquear,
} from './pestana-bloqueada.mjs'
import { olvidarVerificaciones } from './tabla-asegurada.mjs'

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

// ═══ EL CANDADO NO LE CUESTA UNA RECARGA DE ESQUEMA A CADA PANTALLA (12/09/2026) ═══
//
// `asegurarTabla()` corría `create table if not exists` en las CINCO puertas de este módulo: 394
// sentencias de DDL en 27 horas medidas en producción, y cada una despertaba el event trigger
// `pgrst_ddl_watch` → `NOTIFY pgrst, 'reload schema'` → PostgREST releyendo su esquema entero
// (`SELECT name FROM pg_timezone_names`, 773 ms de media en esta instancia). Ésa era la fuente de los
// picos de 17-19 s que sentía el dueño mientras corría el timer del Flujo de Caja.
//
// Este test mide LO QUE SALIÓ A LA BASE, no que la tabla exista. Revertir el cambio lo pone rojo.
test('con la tabla ya creada, el candado NO manda una sola sentencia de DDL', async () => {
  olvidarVerificaciones()
  const sentencias = []
  const deps = {
    query: async (sql) => {
      sentencias.push(sql.trim())
      if (sql.includes('pg_attribute')) {
        return { rows: ['file_id', 'pestana', 'motivo', 'bloqueada_por', 'bloqueada_en'].map((col) => ({ col })) }
      }
      return { rows: [] }
    },
  }
  await pestanasBloqueadas(deps, 'FILE')
  await bloquear(deps, 'FILE', 'CAJA', { motivo: 'mía' })
  await desbloquear(deps, 'FILE', 'CAJA')
  const ddl = sentencias.filter((s) => /^\s*(create|alter|drop|comment|grant|revoke)/i.test(s))
  assert.deepEqual(ddl, [], `el candado emitió DDL en caliente: ${ddl.join(' | ')}`)
  // Y la verificación de catálogo se hace UNA vez para las tres puertas, no tres.
  assert.equal(sentencias.filter((s) => s.includes('pg_attribute')).length, 1)
})

test('si la tabla del candado falta, el DDL sí corre — la garantía vieja sigue en pie', async () => {
  olvidarVerificaciones()
  const sentencias = []
  const deps = { query: async (sql) => { sentencias.push(sql.trim()); return { rows: [] } } }
  await pestanasBloqueadas(deps, 'FILE')
  assert.ok(
    sentencias.some((s) => /create table if not exists public\.sheet_pestanas_bloqueadas/.test(s)),
    'sobre una base sin la tabla, el candado tiene que crearla igual que antes',
  )
})
