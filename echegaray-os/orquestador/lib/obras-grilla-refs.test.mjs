// REFS_OBRAS SALE DE LOS RÓTULOS (14/09/2026, inserción de «Obra» en Compras L y Cobranzas H).
// Las letras de abajo son el oráculo del layout de hoy: si el derivado cambia sin que cambie el
// encabezado de referencia, la grilla en seco y sus tests estarían mirando otra columna.
import test from 'node:test'
import assert from 'node:assert/strict'
import { REFS_OBRAS, refsDeEncabezados } from './obras-grilla.mjs'
import { COBRANZAS_CON_OBRA, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'

test('REFS_OBRAS derivada del encabezado de referencia da las letras de siempre', () => {
  assert.deepEqual({ ...REFS_OBRAS.cob }, { hoja: 'Cobranzas', cliente: 'G', concepto: 'I', neto: 'J', total: 'M', retenciones: 'L', estado: 'O', fechaCobro: 'Q', fechaVenta: 'P', fechaEmision: 'C', forma: 'N', categoria: 'B', oc: 'H', moneda: 'AA', desde: 5 })
  assert.deepEqual({ ...REFS_OBRAS.cmp }, { hoja: 'Compras', fecha: 'C', proveedor: 'E', cliente: 'J', obra: 'K', neto: 'M', iva: 'N', total: 'O', familia: 'AE', desde: 4 })
})

test('con «Obra» insertada, las mismas claves se corren por rótulo y lo de la izquierda queda', () => {
  const r = refsDeEncabezados({ cobranzas: COBRANZAS_CON_OBRA, compras: COMPRAS_CON_OBRA })
  assert.deepEqual([r.cob.cliente, r.cob.oc, r.cob.total, r.cob.moneda], ['G', 'I', 'N', 'AB'])
  assert.deepEqual([r.cmp.cliente, r.cmp.obra, r.cmp.neto, r.cmp.total, r.cmp.familia], ['J', 'K', 'N', 'P', 'AF'])
  assert.throws(() => refsDeEncabezados({ cobranzas: ['ID'], compras: COMPRAS_CON_OBRA }), /falta la columna/)
})
