import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirFuente, registrarSincronizacion } from './registrar-sincronizacion.mjs'

const FUENTES = [
  { id: 1, nombre: 'Flujo de Caja - Cash Flow (Sheet)', drive_file_id: '1SR6HY5' },
  { id: 2, nombre: 'Avances de Obra', drive_file_id: '1AV4NC3' },
  { id: 3, nombre: 'Duplicada', drive_file_id: '1SR6HY5' }, // mismo file_id a propósito
]

test('elige la fuente por drive_file_id exacto', () => {
  const r = elegirFuente(FUENTES.slice(0, 2), { driveFileId: '1SR6HY5' })
  assert.equal(r.ok, true); assert.equal(r.id, 1)
})

test('elige la fuente por nombre exacto (sin coincidencias parciales)', () => {
  const r = elegirFuente(FUENTES, { nombre: 'Avances de Obra' })
  assert.equal(r.ok, true); assert.equal(r.id, 2)
})

test('no marca nada si el identificador no existe: no inventa una fuente', () => {
  const r = elegirFuente(FUENTES, { driveFileId: 'NO_EXISTE' })
  assert.equal(r.ok, false); assert.match(r.motivo, /ninguna fuente/)
})

test('ante ambigüedad NO elige: marcar la equivocada esconde un atraso real', () => {
  const r = elegirFuente(FUENTES, { driveFileId: '1SR6HY5' })
  assert.equal(r.ok, false); assert.match(r.motivo, /ambiguo/)
})

test('sin identificador, se niega', () => {
  const r = elegirFuente(FUENTES, {})
  assert.equal(r.ok, false)
})

test('registrar: escribe la fecha, recalcula y devuelve el estado nuevo', async () => {
  const sql = []
  const query = async (q, params) => {
    sql.push({ q: q.replace(/\s+/g, ' ').trim(), params })
    if (/from public\.fuentes_datos$/.test(q.replace(/\s+/g, ' ').trim())) return { rows: [{ id: 1, nombre: 'Cash Flow', drive_file_id: '1SR6HY5' }] }
    if (/select estado/.test(q)) return { rows: [{ estado: 'actualizado' }] }
    return { rows: [] }
  }
  const r = await registrarSincronizacion({ query }, { driveFileId: '1SR6HY5' })
  assert.equal(r.ok, true); assert.equal(r.estado, 'actualizado')
  // No escribió cobertura_hasta (no se pasó): NUNCA se inventa hasta dónde llega el dato.
  assert.ok(!sql.some((s) => /cobertura_hasta =/.test(s.q)))
  // Llamó al recalculador: el estado lo decide una sola fuente de verdad.
  assert.ok(sql.some((s) => /recalcular_frescura_fuentes/.test(s.q)))
})

test('registrar: escribe cobertura_hasta SÓLO si se pasa explícita', async () => {
  const sql = []
  const query = async (q) => {
    sql.push(q.replace(/\s+/g, ' ').trim())
    if (/from public\.fuentes_datos$/.test(q.replace(/\s+/g, ' ').trim())) return { rows: [{ id: 1, nombre: 'X', drive_file_id: 'A' }] }
    if (/select estado/.test(q)) return { rows: [{ estado: 'actualizado' }] }
    return { rows: [] }
  }
  await registrarSincronizacion({ query }, { driveFileId: 'A', coberturaHasta: '2026-06-30' })
  assert.ok(sql.some((s) => /cobertura_hasta = \$2/.test(s)))
})

test('registrar: NO rompe el proceso que llama si la fuente no existe', async () => {
  const query = async (q) => {
    if (/from public\.fuentes_datos$/.test(q.replace(/\s+/g, ' ').trim())) return { rows: [] }
    return { rows: [] }
  }
  const r = await registrarSincronizacion({ query }, { driveFileId: 'FANTASMA' })
  assert.equal(r.ok, false); assert.match(r.motivo, /ninguna fuente/)
})

test('registrar: un error de DB se devuelve, no se propaga', async () => {
  const query = async () => { throw new Error('conexión caída') }
  const r = await registrarSincronizacion({ query }, { nombre: 'X' })
  assert.equal(r.ok, false); assert.match(r.motivo, /conexión caída/)
})
