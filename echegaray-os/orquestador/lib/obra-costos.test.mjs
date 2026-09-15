// EL COSTO POR OBRA SE IMPUTA POR obra_id — hermético, 0 DB.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `costoRealObra` resolvía la obra por `obra_texto` contra `obra_alias`: «LA ESTRELLA» en la J mandaba
// la compra a la obra madre aunque la columna Obra dijera el comedor. Acá una fila con la J de la
// madre y el obra_id de la hija tiene que pesar en la hija; y las consultas que van a la base tienen
// que filtrar por `obra_id`, nunca por texto ni alias.
import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarPorObraId, bucketDeFila, costoRealObra, resumenCostos } from './obra-costos.mjs'

const filas = [
  { obra_texto: 'LA ESTRELLA', obra_id: 'le-comedor', destino: 'obra', categoria: 'Materiales', proveedor: 'Hormiserv', total: 100 },
  { obra_texto: 'La Estrella', obra_id: 'le-comedor', destino: 'obra', categoria: 'Materiales', proveedor: 'Hormiserv', total: 50 },
  { obra_texto: 'Estrella', obra_id: 'le-galpon-9', destino: 'obra', categoria: 'Mano de obra', proveedor: 'Subcontrato X', total: 30 },
  { obra_texto: 'San Francisco', obra_id: null, destino: 'obra', categoria: 'Materiales', proveedor: 'Acme', total: 200 },
  { obra_texto: 'Administracion', obra_id: null, destino: 'estructura_admin', categoria: 'Sueldos', proveedor: null, total: 999 },
  { obra_texto: 'Taller', obra_id: null, destino: 'estructura_taller', categoria: 'x', proveedor: null, total: 1 },
  { obra_texto: 'Obra Nueva', obra_id: null, destino: null, categoria: 'x', proveedor: null, total: 5 },
]

test('la J «LA ESTRELLA» pesa en la obra de su obra_id, no en la obra madre', () => {
  const { porObra } = agregarPorObraId(filas)
  assert.equal(porObra.has('la-estrella'), false, 'la obra madre recibió compras por el texto de la J')
  assert.equal(porObra.get('le-comedor').total, 150)
  assert.equal(porObra.get('le-comedor').n, 2)
  assert.equal(porObra.get('le-comedor').proveedores.get('Hormiserv'), 150)
  assert.equal(porObra.get('le-galpon-9').total, 30)
  assert.equal(porObra.size, 2)
})

test('lo que no tiene obra_id no pesa en ninguna obra, y se dice por qué', () => {
  const { buckets } = agregarPorObraId(filas)
  assert.deepEqual(buckets, { estructura: 1000, sin_obra: 200, sin_imputar: 5 })
  assert.equal(bucketDeFila({ obra_id: 'x', destino: 'obra' }), null)
  assert.equal(bucketDeFila({ obra_id: null, destino: 'obra' }), 'sin_obra')
  assert.equal(bucketDeFila({ obra_id: null, destino: 'estructura_admin' }), 'estructura')
  assert.equal(bucketDeFila({ obra_id: null, destino: null }), 'sin_imputar')
})

/** Una base de mentira que registra el SQL y contesta por tabla. */
function baseFalsa(respuestas) {
  const consultas = []
  const query = async (sql, params) => {
    consultas.push({ sql, params })
    if (sql.includes('public.obra_costo_real')) return { rows: respuestas.vista }
    if (sql.includes('public.costos_obra')) return { rows: respuestas.costos }
    throw new Error(`consulta inesperada: ${sql}`)
  }
  return { query, consultas }
}

test('costoRealObra toma el total de obra_costo_real y el desglose de costos_obra por obra_id', async () => {
  const base = baseFalsa({
    vista: [{ total: 150, n: 2 }],
    costos: filas.filter((f) => f.obra_id === 'le-comedor'),
  })
  const r = await costoRealObra('le-comedor', { query: base.query })
  assert.deepEqual(r, {
    obra_id: 'le-comedor', total: 150, n: 2,
    por_categoria: [{ nombre: 'Materiales', total: 150 }],
    por_proveedor: [{ nombre: 'Hormiserv', total: 150 }],
  })
  assert.equal(base.consultas.length, 2)
  for (const c of base.consultas) {
    assert.match(c.sql, /obra_id = \$1/, 'una consulta no filtra por obra_id')
    assert.deepEqual(c.params, ['le-comedor'])
    assert.doesNotMatch(c.sql, /obra_alias|norm_obra|obra_texto/, 'volvió el puente por texto')
  }
  // Una obra sin filas: total 0, n 0, sin desglose — no un error ni un texto de relleno.
  const vacia = await costoRealObra('otra', { query: baseFalsa({ vista: [], costos: [] }).query })
  assert.deepEqual(vacia, { obra_id: 'otra', total: 0, n: 0, por_categoria: [], por_proveedor: [] })
})

test('resumenCostos lista las obras de la vista y separa lo que no pesa en ninguna por motivo', async () => {
  const base = baseFalsa({
    vista: [{ obra_id: 'le-comedor', obra_nombre: 'LE - COMEDOR', estado: 'activa', tipo: 'obra', total: 150, n: 2 }],
    costos: filas.filter((f) => !f.obra_id),
  })
  const r = await resumenCostos({ query: base.query })
  assert.deepEqual(r, {
    obras: [{ obra_id: 'le-comedor', nombre: 'LE - COMEDOR', estado: 'activa', tipo: 'obra', total: 150, n: 2 }],
    estructura: 1000, sin_obra: 200, sin_imputar: 5,
  })
  assert.match(base.consultas[1].sql, /c\.obra_id is null/)
  for (const c of base.consultas) assert.doesNotMatch(c.sql, /obra_alias|norm_obra|obra_texto/)
})
