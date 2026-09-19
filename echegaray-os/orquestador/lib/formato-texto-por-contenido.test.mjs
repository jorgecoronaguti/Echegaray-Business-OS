import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tramosDeTexto, requestsTextoPorContenido } from './formato-texto-por-contenido.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const grilla = () => [
  ['Proveedor', 'Próximo pago', 'Comprobante', 'Importe'],   // 1 · encabezado: texto en B, C, D
  ['Gruas San Blas', '=fecha', '=1 fac.', '=neta'],          // 2 · fórmulas: no se tocan
  [VACIO, 45000, '00060-1275', 5124412],                     // 3 · número en B, texto en C
  [VACIO, VACIO, '826666', 3640067],                         // 4 · texto en C (contiguo con la 3)
  ['TOTAL', '', '', '=SUM(D2:D4)'],                          // 5 · nada en B/C
  ['Nota al pie', VACIO, VACIO, 'ninguno llega al 1%'],       // 6 · texto en D
]

test('sólo el TEXTO entra: ni fórmulas, ni números, ni el centinela', () => {
  const t = tramosDeTexto(grilla())
  const enB = t.filter((x) => x.col === 1)
  assert.deepEqual(enB, [{ col: 1, desde: 1, hasta: 1 }], 'en B sólo el encabezado (45000 es un número)')
  const enD = t.filter((x) => x.col === 3).map((x) => `${x.desde}-${x.hasta}`)
  assert.deepEqual(enD, ['1-1', '6-6'], 'en D el encabezado y la nota; los importes y la fórmula no')
})

test('las celdas contiguas se agrupan en UN tramo, y una fórmula en el medio CORTA el tramo', () => {
  const enC = tramosDeTexto(grilla()).filter((x) => x.col === 2)
  assert.deepEqual(enC, [{ col: 2, desde: 1, hasta: 1 }],
    'la fila 2 es una fórmula: corta el tramo, y las filas 3-4 no son rótulos (ver el test de abajo)')
})

test('LO QUE ESTA CURA NO ALCANZA: un comprobante se lee como número y queda afuera', () => {
  // "00060-1275" y "826666" son dígitos y guiones: `esRotulo` los descarta, y con razón —es la misma
  // función que decide qué edita una persona, y ahí un número NO es un rótulo—. Consecuencia honesta:
  // las columnas de COMPROBANTE siguen dependiendo de la declaración de su bloque, no de esta pasada.
  // Se deja escrito para que nadie la crea una solución total.
  const t = tramosDeTexto(grilla()).filter((x) => x.col === 2 && x.desde >= 3)
  assert.deepEqual(t, [], 'los comprobantes no entran por contenido')
})

test('la columna A no se toca: es texto por diseño y ya tiene su formato', () => {
  assert.equal(tramosDeTexto(grilla()).some((t) => t.col === 0), false)
})

test('los requests piden TEXT y sólo tocan numberFormat y alineación', () => {
  const { requests, celdas } = requestsTextoPorContenido(7, grilla())
  assert.ok(requests.length >= 3)
  assert.equal(celdas, 4, 'cuatro: los tres encabezados y la nota al pie (los comprobantes se leen como números)')
  for (const r of requests) {
    assert.equal(r.repeatCell.cell.userEnteredFormat.numberFormat.type, 'TEXT')
    assert.equal(r.repeatCell.range.sheetId, 7)
    assert.equal(r.repeatCell.fields, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      'no pisa color, negrita ni bordes: sólo el formato de número y la alineación')
  }
})

test('una grilla vacía no produce pedidos (no se pinta la hoja entera por error)', () => {
  assert.deepEqual(requestsTextoPorContenido(1, []).requests, [])
  assert.deepEqual(requestsTextoPorContenido(1, [[], []]).requests, [])
})
