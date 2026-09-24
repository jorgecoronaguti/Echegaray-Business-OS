// LO COBRADO EN BLANCO Y EN NEGRO, EN SU MONEDA (dueño, 24/09/2026). Caso real: Quattropani pagó U$S 10.500 en
// efectivo, sin factura (Cobranzas f79–f81, N, USD), y el anticipo de julio fue U$S 15.400 con factura (f62, B).
import test from 'node:test'
import assert from 'node:assert/strict'
import { totalesDeCobranzas, type FilaCobranza } from './cobranzasCliente.ts'

const fila = (o: Partial<FilaCobranza>): FilaCobranza => ({
  cobranza_id: Math.random().toString(), obra_id: null, imputacion: null, fila: null, categoria: 'B', fecha_emision: null,
  factura: null, numero_comprobante: null, concepto: null, orden_compra: null, monto_neto: null, iva: null, retenciones: null,
  total_bruto: 0, estado: 'Cobrado', esta_cobrada: true, esta_cancelada: false, esta_vencida: false, fecha_cobro: null,
  forma_cobro: null, moneda: 'ARS', total_bruto_origen: null, ...o,
})

test('blanco y negro por separado; el negro todo en dólares se dice en dólares', () => {
  const t = totalesDeCobranzas([
    fila({ categoria: 'B', total_bruto: 84581019 }),
    fila({ categoria: 'B', moneda: 'USD', total_bruto: 23404366, total_bruto_origen: 15400 }),
    ...[1, 2, 3].map(() => fila({ categoria: 'N', moneda: 'USD', total_bruto: 5319174, total_bruto_origen: 3500 })),
    fila({ categoria: 'B', estado: 'Pendiente', esta_cobrada: false, total_bruto: 33286149 }),
  ])
  assert.equal(t.cobradoBlanco.pesos, 84581019 + 23404366)
  assert.equal(t.cobradoBlanco.usd, 15400)
  assert.equal(t.cobradoBlanco.ars, 84581019, 'lo que entró en pesos, sin los dólares valuados')
  assert.equal(t.cobradoBlanco.soloUsd, false)
  assert.equal(t.cobradoNegro.pesos, 3 * 5319174)
  assert.equal(t.cobradoNegro.usd, 10500)
  assert.equal(t.cobradoNegro.soloUsd, true)
  assert.equal(t.cobradoNegro.ars, null)
  assert.equal(t.pendienteEnSuMoneda.pesos, 33286149)
  assert.equal(t.pendienteEnSuMoneda.usd, null)
})

test('una fila anulada no cuenta en ninguna de las cuatro', () => {
  const t = totalesDeCobranzas([fila({ categoria: 'N', esta_cancelada: true, total_bruto: 999 })])
  assert.equal(t.cobradoNegro.pesos, null)
})
