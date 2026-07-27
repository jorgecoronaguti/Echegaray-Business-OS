import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirFuente, registrarSincronizacion, asegurarFuente, registrarIngesta, FUENTES_INGESTA } from './registrar-sincronizacion.mjs'

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

// ── asegurarFuente: declarar la fuente para que la alerta la cubra ──

test('asegurarFuente: inserta como actualizado (recalcular NO rescata fuente_no_disponible)', async () => {
  let sql = ''
  const query = async (q, params) => { sql = q.replace(/\s+/g, ' ').trim(); return { rowCount: 1, rows: [{ id: 9 }] , params } }
  const r = await asegurarFuente({ query }, FUENTES_INGESTA.banco)
  assert.equal(r.ok, true); assert.equal(r.creada, true)
  // Nace fresca: si naciera 'fuente_no_disponible' la frescura no la movería nunca.
  assert.match(sql, /'actualizado', now\(\)/)
  assert.match(sql, /on conflict \(nombre\) do nothing/)
})

test('asegurarFuente: si la fila ya existe NO la pisa (creada=false)', async () => {
  const query = async () => ({ rowCount: 0, rows: [] })   // ON CONFLICT DO NOTHING no devuelve fila
  const r = await asegurarFuente({ query }, FUENTES_INGESTA.arcaCompras)
  assert.equal(r.ok, true); assert.equal(r.creada, false)
})

test('asegurarFuente: sin nombre se niega (no inventa una fuente anónima)', async () => {
  const r = await asegurarFuente({ query: async () => ({ rowCount: 0, rows: [] }) }, { area: 'X' })
  assert.equal(r.ok, false); assert.match(r.motivo, /falta nombre/)
})

test('asegurarFuente: un error de DB no rompe al ingester', async () => {
  const query = async () => { throw new Error('tabla bloqueada') }
  const r = await asegurarFuente({ query }, FUENTES_INGESTA.banco)
  assert.equal(r.ok, false); assert.match(r.motivo, /tabla bloqueada/)
})

// ── registrarIngesta: asegurar + registrar en un paso ──

test('registrarIngesta: asegura la fuente y después registra su sincronización', async () => {
  const qs = []
  const query = async (q, params) => {
    const norm = q.replace(/\s+/g, ' ').trim()
    qs.push(norm)
    if (/^insert into public\.fuentes_datos/.test(norm)) return { rowCount: 1, rows: [{ id: 5 }] }
    if (/from public\.fuentes_datos$/.test(norm)) return { rows: [{ id: 5, nombre: FUENTES_INGESTA.banco.nombre, drive_file_id: null }] }
    if (/select estado/.test(norm)) return { rows: [{ estado: 'actualizado' }] }
    return { rows: [], params }
  }
  const r = await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.banco, coberturaHasta: '2026-07-25' })
  assert.equal(r.ok, true); assert.equal(r.estado, 'actualizado'); assert.equal(r.creada, true)
  // Orden: primero el insert idempotente, después el recalculador de frescura.
  assert.ok(qs.some((q) => /^insert into public\.fuentes_datos/.test(q)))
  assert.ok(qs.some((q) => /recalcular_frescura_fuentes/.test(q)))
})

test('registrarIngesta: si asegurar falla, no intenta registrar', async () => {
  const query = async () => { throw new Error('sin conexión') }
  const r = await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.arcaCompras })
  assert.equal(r.ok, false); assert.match(r.motivo, /sin conexión/)
})

test('FUENTES_INGESTA: las declaraciones usan valores válidos de los CHECK de fuentes_datos', () => {
  const frecuencias = ['diaria', 'semanal', 'quincenal', 'mensual', 'por_evento', 'esporadica', 'desconocida']
  const criticidades = ['alta', 'media', 'baja']
  for (const f of Object.values(FUENTES_INGESTA)) {
    assert.ok(f.nombre && f.nombre.length > 0)
    assert.ok(frecuencias.includes(f.frecuencia_actualizacion), `frecuencia inválida: ${f.frecuencia_actualizacion}`)
    assert.ok(criticidades.includes(f.criticidad), `criticidad inválida: ${f.criticidad}`)
  }
  // El banco es diario (alertable): un feed diario que se congela se debe gritar.
  assert.equal(FUENTES_INGESTA.banco.frecuencia_actualizacion, 'diaria')
  assert.equal(FUENTES_INGESTA.arcaCompras.frecuencia_actualizacion, 'mensual')
})
