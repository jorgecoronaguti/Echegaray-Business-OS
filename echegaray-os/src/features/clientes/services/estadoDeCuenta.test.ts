import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoConPlazo, papelDelRenglon } from './estadoDeCuenta.ts'
import type { FilaCobranza } from './cobranzasCliente.ts'

const fila = (x: Partial<FilaCobranza>): FilaCobranza => ({
  cobranza_id: 'c', obra_id: null, imputacion: null, fila: '1', categoria: 'B', fecha_emision: null,
  factura: null, numero_comprobante: null, concepto: null, orden_compra: null, monto_neto: null,
  iva: null, retenciones: null, total_bruto: null, estado: 'Pendiente', esta_cobrada: false,
  esta_cancelada: false, esta_vencida: false, fecha_cobro: null, forma_cobro: null, ...x,
})

test('lo que falta cobrar dice su plazo: cuántos días faltan, que vence hoy, o hace cuánto venció', () => {
  assert.deepEqual(estadoConPlazo(fila({ dias_cobro: 29 })), { clave: 'a_vencer', texto: 'a vencer · 29 d' })
  assert.deepEqual(estadoConPlazo(fila({ dias_cobro: 0 })), { clave: 'a_vencer', texto: 'vence hoy' })
  assert.deepEqual(estadoConPlazo(fila({ esta_vencida: true, dias_cobro: -12 })), { clave: 'vencido', texto: 'vencido · 12 d' })
})

test('sin días medidos por la base el estado se dice sin plazo: no se inventa un cero', () => {
  assert.equal(estadoConPlazo(fila({})).texto, 'a vencer')
  assert.equal(estadoConPlazo(fila({ dias_cobro: null })).texto, 'a vencer')
  assert.equal(estadoConPlazo(fila({ esta_vencida: true })).texto, 'vencido')
})

test('lo cobrado y lo anulado no llevan plazo, y la anulación manda sobre todo lo demás', () => {
  assert.deepEqual(estadoConPlazo(fila({ esta_cobrada: true, dias_cobro: -28 })), { clave: 'cobrado', texto: 'cobrado' })
  assert.deepEqual(
    estadoConPlazo(fila({ esta_cancelada: true, esta_cobrada: true, esta_vencida: true, dias_cobro: -3 })),
    { clave: 'anulado', texto: 'anulada' },
  )
})

test('el papel del renglón: el número si lo hay, y si no la palabra que corresponde a su circuito', () => {
  assert.deepEqual(papelDelRenglon(fila({ factura: 'FA', numero_comprobante: '01-00000229' })), { clase: 'comprobante', texto: 'FA 01-00000229' })
  assert.deepEqual(papelDelRenglon(fila({ categoria: 'B' })), { clase: 'a_facturar', texto: 'a facturar' })
  assert.deepEqual(papelDelRenglon(fila({ categoria: 'N' })), { clase: 'sin_factura', texto: 'sin factura' })
  assert.deepEqual(papelDelRenglon(fila({ categoria: null })), { clase: 'sin_factura', texto: 'sin factura' })
  assert.deepEqual(
    papelDelRenglon(fila({ categoria: 'N', respaldo_drive_id: 'x', respaldo_titulo: 'Nota firmada' })),
    { clase: 'respaldo', texto: 'Nota firmada' },
  )
})
