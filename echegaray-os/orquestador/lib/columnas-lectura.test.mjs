// El helper de lectura por encabezado: el índice sale de la MISMA foto que los datos, antes y después
// de insertar «Obra».
import test from 'node:test'
import assert from 'node:assert/strict'
import { conEncabezado, leerConEncabezado } from './columnas-lectura.mjs'
import { COMPRAS, COBRANZAS } from './columnas-por-encabezado.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA, COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

/** Una fila de datos donde cada celda dice su propio rótulo: el valor leído ES la columna leída. */
const filaEspejo = (cab) => cab.map((r) => `<${r}>`)

for (const [nombre, cab] of [['antes', COMPRAS_2508], ['después', COMPRAS_CON_OBRA]]) {
  test(`Compras ${nombre} de «Obra»: Total, Fecha de caja y el 2.º «Rubro de caja» se leen por rótulo`, () => {
    const { idx, datos, primeraFila } = conEncabezado([cab, filaEspejo(cab)], 'Compras',
      { total: COMPRAS.total, fechaCaja: COMPRAS.fechaCaja, rubro: COMPRAS.rubro, concepto: COMPRAS.concepto })
    assert.equal(datos[0][idx.total], '<Total>')
    assert.equal(datos[0][idx.fechaCaja], '<Fecha de caja>')
    assert.equal(datos[0][idx.concepto], '<Concepto>')
    assert.equal(idx.rubro, cab.lastIndexOf('Rubro de caja'))
    assert.equal(primeraFila, 4)
  })
}

for (const [nombre, cab] of [['antes', COBRANZAS_1409], ['después', COBRANZAS_CON_OBRA]]) {
  test(`Cobranzas ${nombre} de «Obra»: Estado, TOTAL y Fecha cobro se leen por rótulo`, () => {
    const { idx, datos, primeraFila } = conEncabezado([cab, filaEspejo(cab)], 'Cobranzas',
      { estado: COBRANZAS.estado, total: COBRANZAS.total, fechaCobro: COBRANZAS.fechaCobro })
    assert.equal(datos[0][idx.estado], '<Estado>')
    assert.equal(datos[0][idx.total], `<${COBRANZAS.total}>`)
    assert.equal(datos[0][idx.fechaCobro], '<Fecha cobro>')
    assert.equal(primeraFila, 5)
  })
}

test('con «Obra» insertada el índice de Total se corre uno: no hay posición fija escondida', () => {
  const a = conEncabezado([COMPRAS_2508], 'Compras', { total: COMPRAS.total }).idx.total
  const d = conEncabezado([COMPRAS_CON_OBRA], 'Compras', { total: COMPRAS.total }).idx.total
  assert.deepEqual([a, d], [14, 15])
})

test('un rótulo que falta rompe con su nombre, y la lectura arranca en la fila de rótulos', async () => {
  assert.throws(() => conEncabezado([['ID']], 'Compras', { total: COMPRAS.total }), /falta la columna «Total»/)
  const pedidos = []
  const google = { readSheetValues: async (id, r, o) => { pedidos.push([r, o?.render]); return [COBRANZAS_1409] } }
  await leerConEncabezado(google, 'X', 'Cobranzas', { estado: COBRANZAS.estado }, { hasta: 400, render: 'UNFORMATTED_VALUE' })
  await leerConEncabezado(google, 'X', 'Compras', {}, {}).catch(() => {})
  assert.deepEqual(pedidos, [['Cobranzas!A4:BZ400', 'UNFORMATTED_VALUE'], ['Compras!A3:BZ', undefined]])
})
