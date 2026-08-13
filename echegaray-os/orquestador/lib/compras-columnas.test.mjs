import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverColumnas, letra, rango, normalizarRotulo } from './compras-columnas.mjs'

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

// ── EL RÓTULO CON ESPACIOS DE MÁS — la trampa que ya costó "ORDEN DE  COMPRA" ──────────────────────
// El dueño edita los encabezados a mano: un doble espacio o un NBSP pegado desde el navegador no se
// ven en la planilla y hacían que la columna quedara SIN RESOLVER. Si `normalizarRotulo` vuelve a ser
// `trim().toLowerCase()`, estos dos tests se ponen rojos.
test('un rótulo con espacios de más resuelve igual: los espacios no son parte del nombre', () => {
  const conRuido = CAB.map((n) => (n === 'Monto Pagado' ? '  Monto   Pagado ' : n))
  const { col, faltan } = resolverColumnas(conRuido, { pagado: 'Monto Pagado' })
  assert.deepEqual(faltan, [])
  assert.equal(col.pagado, 'T')
})

test('el NBSP de un copiar/pegar cuenta como espacio, y el salto de línea también', () => {
  assert.equal(normalizarRotulo('Fecha\u00a0factura'), 'fecha factura')
  assert.equal(normalizarRotulo('Cliente /\nAsignación'), 'cliente / asignación')
  const conNbsp = CAB.map((n) => (n === 'Fecha factura' ? 'Fecha\u00a0\u00a0factura' : n))
  assert.equal(resolverColumnas(conNbsp, { fecha: 'Fecha factura' }).col.fecha, 'C')
})

test('normalizar espacios NO afloja el match: los rótulos parecidos siguen siendo distintos', () => {
  // La garantía que sostiene todo lo anterior. "Fecha factura" convive con "Fecha factura (mes)" y
  // "Fecha de caja": si la comparación dejara de ser por el texto COMPLETO, el neteo de obras se
  // colgaría de la columna de al lado sin un solo error a la vista.
  const { col, faltan } = resolverColumnas(CAB, { f: 'Fecha factura', mes: 'Fecha factura (mes)', caja: 'Fecha de caja' })
  assert.deepEqual(faltan, [])
  assert.deepEqual([col.f, col.mes, col.caja], ['C', 'D', 'AD'])
  assert.deepEqual(resolverColumnas(CAB, { x: 'Fecha' }).faltan, ['Fecha'],
    'un rótulo que es PREFIJO de otro no matchea: el match es por el texto entero')
  assert.deepEqual(resolverColumnas(CAB, { x: 'Cliente / Asignacion' }).faltan, ['Cliente / Asignacion'],
    'los acentos SÍ cuentan — decisión declarada: relajar la comparación acerca un match equivocado')
})

test('el rango arranca en la fila 4: arriba hay título, agrupador y encabezado', () => {
  assert.equal(rango('AD'), 'Compras!$AD$4:$AD')
})
