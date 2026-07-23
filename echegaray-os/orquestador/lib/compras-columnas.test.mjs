import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverColumnas, letra, rango } from './compras-columnas.mjs'

const CAB = ['ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo',
  'N° Comprobante', 'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Concepto', 'Importe',
  'IVA', 'Total', 'Tipo pago', 'Fecha prevista de pago (día)', 'Fecha prevista de pago (mes)',
  'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1', 'Fecha prevista de pago 2', 'Monto Parcial 2',
  'Estado', 'Tipo de Costo', 'Estado pago', 'Estado Carga', 'Rubro de caja', 'Rubro de caja',
  'Fecha de caja', 'Familia de material']

test('letra traduce índice a columna, también más allá de la Z', () => {
  assert.equal(letra(0), 'A')
  assert.equal(letra(25), 'Z')
  assert.equal(letra(26), 'AA')
  assert.equal(letra(29), 'AD')
})

test('resuelve cada columna por su nombre, no por su posición', () => {
  const { col, idx, faltan } = resolverColumnas(CAB, {
    total: 'Total', cliente: 'Cliente / Asignación', fecha: 'Fecha de caja', rubro: 'Rubro de caja',
  })
  assert.deepEqual(faltan, [])
  assert.equal(col.total, 'O')
  assert.equal(col.cliente, 'J')
  assert.equal(col.fecha, 'AD')
  assert.equal(idx.fecha, 29)
})

test('si alguien inserta una columna, la referencia sigue apuntando al mismo dato', () => {
  const conNueva = ['ID', 'Nueva columna del dueño', ...CAB.slice(1)]
  const { col } = resolverColumnas(conNueva, { fecha: 'Fecha de caja', total: 'Total' })
  assert.equal(col.fecha, 'AE')
  assert.equal(col.total, 'P')
})

test('una columna que no está se DENUNCIA, no se completa con un default', () => {
  const { col, faltan } = resolverColumnas(CAB, { inventada: 'Columna que no existe' })
  assert.deepEqual(faltan, ['Columna que no existe'])
  assert.equal(col.inventada, undefined)
})

test('el rango arranca en la fila 4: arriba hay título, agrupador y encabezado', () => {
  assert.equal(rango('AD'), 'Compras!$AD$4:$AD')
})
