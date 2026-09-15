// EL CRUCE ARCA ↔ COMPRAS LEE COMPRAS POR RÓTULO (14/09/2026, «Obra» insertada en Compras L).
//
// Leía índices tipeados y abortaba entero si una columna se movía. El defecto que esto atrapa es el
// otro: volver a un índice fijo lee, con la columna nueva, «IVA» donde va «Total» y el cruce publica
// discrepancias fabricadas por un corrimiento.
import test from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_COMPRAS, filasDeCompras } from './cruce-arca-pestana.mjs'
import { conEncabezado } from '../lib/columnas-lectura.mjs'
import { COMPRAS, ubicarColumna } from '../lib/columnas-por-encabezado.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'

/** Una fila escrita POR RÓTULO sobre un encabezado; el resto de las celdas lleva texto que no se debe leer. */
function filaPorRotulo(encabezado, valores) {
  const f = encabezado.map((_, i) => `no-se-lee-${i}`)
  for (const [clave, v] of Object.entries(valores)) {
    const col = ubicarColumna(encabezado, COMPRAS[clave], 'Compras')
    if (col) f[col.indice] = v
  }
  return f
}

// 46270 = 05/09/2026 como serial de Sheets.
const VALORES = {
  fecha: 46270, proveedor: 'ALUMETAL', comprobante: '0003-00001234', importe: 1000, total: 1210,
  rubroFosil: 'FÓSIL', rubro: 'Materiales', familia: 'Aluminio', subRubro: 'Aberturas', obra: 'OBRA NUEVA',
}

const leer = (encabezado) => {
  const l = conEncabezado([encabezado, filaPorRotulo(encabezado, VALORES)], 'Compras', COLUMNAS_COMPRAS)
  return filasDeCompras(l.datos, l.idx)
}

test('«Obra» insertada: el cruce lee exactamente las mismas filas de Compras', () => {
  const hoy = leer(COMPRAS_2508)
  assert.deepEqual(leer(COMPRAS_CON_OBRA), hoy)
  assert.equal(hoy.length, 1)
  assert.deepEqual(
    { prov: hoy[0].prov, total: hoy[0].total, rubro: hoy[0].rubro, familia: hoy[0].familia, sub: hoy[0].sub, periodo: hoy[0].periodo, fila: hoy[0].fila },
    { prov: 'ALUMETAL', total: 1210, rubro: 'Materiales', familia: 'Aluminio', sub: 'Aberturas', periodo: '2026-09', fila: 4 },
  )
})

test('sin columnas resueltas por rótulo el cruce no lee por posición', () => {
  assert.throws(() => filasDeCompras([[1, 2, 3]]), /resueltas por rótulo/)
  assert.throws(
    () => conEncabezado([COMPRAS_2508.filter((r) => r !== 'Total'), []], 'Compras', COLUMNAS_COMPRAS),
    /falta la columna «Total»/,
  )
})
