import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedidos, ARCA, pareceSospechoso, publicar } from './rangos-nombrados.mjs'

// ═══ UN NOMBRE QUE APUNTA A OTRA CELDA (05/08) ═══
//
// `ARCA_FALTAN_MONTO` devolvió "0001-00000211" en el Sheet real: un N° de comprobante donde tenía que
// haber un importe. Los DOCE nombres ARCA_* apuntaban 22 filas más abajo de su bloque, dentro de la
// lista de faltantes, y `ARCA_FALTAN_N` devolvía un CUIT. Nadie lo notó porque publicar un nombre
// siempre "funciona": la API acepta cualquier rango.
test('un importe que devuelve un N° de comprobante o un CUIT se marca sospechoso', () => {
  assert.match(pareceSospechoso('ARCA_FALTAN_MONTO', '0001-00000211'), /comprobante/)
  assert.match(pareceSospechoso('ARCA_FALTAN_N', '30-71647696-7'), /CUIT/)
  assert.match(pareceSospechoso('ARCA_COMPRAS_TOTAL', '0001-00000204'), /comprobante/)
})

test('un valor legítimo NO se marca — un control que grita siempre se deja de mirar', () => {
  assert.equal(pareceSospechoso('ARCA_FALTAN_MONTO', 13090051), null)
  assert.equal(pareceSospechoso('ARCA_FALTAN_MONTO', '$13.090.051'), null)
  assert.equal(pareceSospechoso('ARCA_FALTAN_N', 57), null)
  assert.equal(pareceSospechoso('ARCA_NOTAS_MONTO', '-21359123,26'), null)
  assert.equal(pareceSospechoso('ARCA_FALTAN_MONTO', ''), null, 'una celda vacía no es otra especie')
})

test('un monto que no tiene un solo dígito es sospechoso', () => {
  assert.match(pareceSospechoso('ARCA_COMPRAS_TOTAL', 'Comprobantes de compra'), /dígito/)
})

test('publicar RELEE cada nombre y devuelve los que resuelven mal', async () => {
  const leidos = { ARCA_FALTAN_MONTO: [['0001-00000211']], ARCA_FALTAN_N: [[57]] }
  const google = {
    getNamedRanges: async () => [],
    spreadsheetBatchUpdate: async () => ({}),
    readSheetValues: async (_id, name) => leidos[name],
  }
  const r = await publicar(google, 'id', 1, [
    { name: 'ARCA_FALTAN_MONTO', fila: 203, col: 3 },
    { name: 'ARCA_FALTAN_N', fila: 203, col: 2 },
  ])
  assert.equal(r.nombres, 2)
  assert.equal(r.sospechosos.length, 1)
  assert.match(r.sospechosos[0], /ARCA_FALTAN_MONTO/)
})

test('una relectura que falla se declara, no se toma por buena', async () => {
  const google = {
    getNamedRanges: async () => [],
    spreadsheetBatchUpdate: async () => ({}),
    readSheetValues: async () => { throw new Error('429') },
  }
  const r = await publicar(google, 'id', 1, [{ name: 'ARCA_FALTAN_MONTO', fila: 1, col: 1 }])
  assert.match(r.sospechosos[0], /no pude releerlo/)
})

test('crea el nombre cuando no existe', () => {
  const [p] = pedidos(7, [{ name: 'ARCA_COMPRAS_N', fila: 10, col: 4 }], [])
  assert.ok(p.addNamedRange)
  assert.deepEqual(p.addNamedRange.namedRange.range, {
    sheetId: 7, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 3, endColumnIndex: 4,
  })
})

test('ACTUALIZA el que ya existe en vez de duplicarlo', () => {
  // La API no falla al repetir un nombre: se queda con dos rangos homónimos y las fórmulas empiezan
  // a leer el equivocado, sin ningún error visible.
  const [p] = pedidos(7, [{ name: 'ARCA_COMPRAS_N', fila: 20, col: 4 }], [{ name: 'ARCA_COMPRAS_N', namedRangeId: 'abc' }])
  assert.ok(p.updateNamedRange)
  assert.equal(p.updateNamedRange.namedRange.namedRangeId, 'abc')
  assert.equal(p.updateNamedRange.namedRange.range.startRowIndex, 19, 'apunta a la fila nueva')
})

test('cada nombre apunta a UNA sola celda', () => {
  for (const p of pedidos(1, Object.values(ARCA).map((name, i) => ({ name, fila: i + 2, col: 3 })), [])) {
    const r = p.addNamedRange.namedRange.range
    assert.equal(r.endRowIndex - r.startRowIndex, 1)
    assert.equal(r.endColumnIndex - r.startColumnIndex, 1)
  }
})

test('los nombres del contrato son únicos', () => {
  const v = Object.values(ARCA)
  assert.equal(v.length, new Set(v).size)
})

test('sin destinos no manda ningún pedido', () => {
  assert.deepEqual(pedidos(1, [], []), [])
})

// ═══ UN NOMBRE PUEDE CUBRIR UN BLOQUE ABIERTO (31/07) ═══
//
// La libreta de proveedores —la tabla proveedor → comentario que el dueño extiende hacia abajo— tiene
// que quedar cubierta por su nombre AUNQUE él agregue una fila. Un rango con fila final la dejaría
// afuera y el VLOOKUP que la mira devolvería vacío: la nota desaparece de la tabla de deuda sin que nada
// dé error. Es el mismo defecto que este archivo evita en las fórmulas, un nivel más abajo.

test('con `abierto` el rango NO lleva fila final: en la API eso significa hasta el final de la hoja', () => {
  const [p] = pedidos(7, [{ name: 'PROV_LIBRETA', fila: 120, col: 1, cols: 2, abierto: true }], [])
  const r = p.addNamedRange.namedRange.range
  assert.equal(r.startRowIndex, 119)
  assert.equal(r.endRowIndex, undefined, 'sin endRowIndex el rango sigue creciendo con la hoja')
  assert.equal(r.startColumnIndex, 0)
  assert.equal(r.endColumnIndex, 2, 'dos columnas: proveedor y comentario')
})

test('sin `abierto` el comportamiento no cambia: una celda, como los doce nombres de ARCA', () => {
  const [p] = pedidos(7, [{ name: 'X', fila: 10, col: 4 }], [])
  const r = p.addNamedRange.namedRange.range
  assert.equal(r.endRowIndex - r.startRowIndex, 1)
  assert.equal(r.endColumnIndex - r.startColumnIndex, 1)
})

test('un nombre abierto que YA existe se ACTUALIZA, no se duplica', () => {
  const [p] = pedidos(7, [{ name: 'PROV_LIBRETA', fila: 130, col: 1, cols: 2, abierto: true }],
    [{ name: 'PROV_LIBRETA', namedRangeId: 'zz' }])
  assert.ok(p.updateNamedRange, 'la API no falla al duplicar un nombre: se queda con dos y las fórmulas leen el equivocado')
  assert.equal(p.updateNamedRange.namedRange.range.startRowIndex, 129)
  assert.equal(p.updateNamedRange.namedRange.range.endRowIndex, undefined)
})
