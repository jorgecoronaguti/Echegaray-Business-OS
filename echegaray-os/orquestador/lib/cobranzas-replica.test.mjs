// La réplica `public.cobranza` se borra y se reinserta: un índice fijo después de insertar «Obra»
// en H no da error, guarda las retenciones como total. La misma fila, con los dos encabezados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_REPLICA, mapearCobranzas } from './cobranzas-replica.mjs'
import { columnasCobranzas } from './cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

const filaSegun = (encabezado, valores) => encabezado.map((r) => valores[r] ?? '')
const V = {
  'Fecha de Venta': '03/02/2026', 'N° Comprobante': '01-000048', Unidad: 'Civil', 'Obra / Cliente': 'ARCOR',
  Concepto: 'Certificado 3', 'Retenciones / descuentos': '350.000', 'TOTAL a cobrar (neto de retenciones)': '11.169.200',
  Estado: 'Pendiente', 'Fecha de Factura': '06/01/2026', 'Fecha cobro': '10/02/2026', 'Probabilidad %': '80%',
}

test('la réplica lee cada campo de su rótulo: mismo registro antes y después de «Obra»', () => {
  const antes = mapearCobranzas([filaSegun(COBRANZAS_1409, V)], columnasCobranzas(COBRANZAS_1409, COLUMNAS_REPLICA))
  const despues = mapearCobranzas([filaSegun(COBRANZAS_CON_OBRA, { ...V, Obra: 'OB-0001' })], columnasCobranzas(COBRANZAS_CON_OBRA, COLUMNAS_REPLICA))
  assert.deepEqual(despues, antes)
  assert.equal(antes.length, 1)
  assert.equal(antes[0].total, 11169200, 'el total, no las retenciones de la columna de al lado')
  assert.equal(antes[0].estado, 'Pendiente')
  assert.equal(antes[0].concepto, 'Certificado 3')
  assert.equal(antes[0].probabilidad, 0.8)
  assert.ok(antes[0].fecha_cobro, 'la fecha de cobro se lee de «Fecha cobro», no de «Mes cobro (auto)»')
})

test('sin columnas resueltas no se mapea nada: no hay índice por defecto', () => {
  assert.throws(() => mapearCobranzas([[]]), /faltan columnas de Cobranzas/)
})
