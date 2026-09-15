// El sync borra y reinserta `public.cobranzas` en cada corrida: un campo leído de la columna de al
// lado no da error, reemplaza la réplica entera. Estos tests arman la misma fila con el encabezado de
// hoy y con «Obra» insertada en H, y exigen el MISMO registro.
import test from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_SYNC, diferenciasConReplica, filaACobranza } from './sync-cobranzas.mjs'
import { columnasCobranzas } from '../lib/cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'

/** Una fila alineada a un encabezado, escrita por rótulo: así el fixture no depende de ninguna letra. */
const filaSegun = (encabezado, valores) => encabezado.map((r) => valores[r] ?? '')
const V = {
  ID: '12', 'Categoría': 'Civil', 'Fecha de Venta': '03/02/2026', Factura: 'A', 'N° Comprobante': '01-000048',
  Unidad: 'Civil', 'Obra / Cliente': 'ARCOR', 'ORDEN DE  COMPRA': 'OC 55', Concepto: 'Certificado 3',
  'Monto neto': '9.520.000', IVA: '1.999.200', 'Retenciones / descuentos': '350.000',
  'TOTAL a cobrar (neto de retenciones)': '11.169.200', 'Forma de Cobro': 'Transferencia', Estado: 'Cobrado',
  'Fecha de Factura': '06/01/2026', 'Fecha cobro': '10/02/2026', 'Mes cobro (auto)': 'feb-2026', Moneda: '',
  'Ret Ganancias': '120.000',
}
const COLS = columnasCobranzas(COBRANZAS_1409, COLUMNAS_SYNC)
const COLS_OBRA = columnasCobranzas(COBRANZAS_CON_OBRA, COLUMNAS_SYNC)

test('la misma fila da el MISMO registro antes y después de insertar «Obra» en H', () => {
  const antes = filaACobranza(filaSegun(COBRANZAS_1409, V), COLS, null)
  const despues = filaACobranza(filaSegun(COBRANZAS_CON_OBRA, { ...V, Obra: 'OB-0001' }), COLS_OBRA, null)
  assert.deepEqual(despues, antes)
  const c = antes.cobranza
  assert.equal(c.total_bruto, 11169200)
  assert.equal(c.retenciones, 350000)
  assert.equal(c.estado, 'Cobrado')
  assert.equal(c.forma_cobro, 'Transferencia')
  assert.equal(c.orden_compra, 'OC 55')
  assert.equal(c.fecha_cobro, '2026-02-10')
  assert.equal(c.mes_cobro, 'feb-2026')
  // El cruce de nombres que el sync ya tenía por posición se conserva: no cambia lo que leen las caras.
  assert.equal(c.fecha_emision, '2026-02-03', '«Fecha de Venta» → fecha_emision, como antes')
  assert.equal(c.fecha_venta, '2026-01-06', '«Fecha de Factura» → fecha_venta, como antes')
})

test('con «Obra» insertada, la moneda se lee de su rótulo (AB) y no de «Ret IIBB» (la AA vieja)', () => {
  const fila = filaSegun(COBRANZAS_CON_OBRA, { ...V, Moneda: 'USD', 'Retención 2,5%/3,5% del neto ▲ rótulo original perdido': '0' })
  assert.equal(COLS_OBRA.moneda.letra, 'AB')
  const r = filaACobranza(fila, COLS_OBRA, 1000)
  assert.equal(r.cobranza.moneda, 'USD')
  assert.equal(r.cobranza.total_bruto_origen, 11169200)
  assert.equal(r.cobranza.total_bruto, 11169200 * 1000)
})

test('filas sin ID o sin cliente no son cobranzas; un rótulo faltante aborta ANTES de tocar la tabla', () => {
  assert.equal(filaACobranza(filaSegun(COBRANZAS_1409, { ...V, ID: '' }), COLS, null), null)
  assert.equal(filaACobranza(filaSegun(COBRANZAS_1409, { ...V, 'Obra / Cliente': '' }), COLS, null), null)
  assert.throws(() => columnasCobranzas(COBRANZAS_1409.filter((r) => r !== 'Fecha cobro'), COLUMNAS_SYNC), /falta la columna «Fecha cobro»/)
  assert.throws(() => filaACobranza([], {}, null), /faltan columnas de Cobranzas/)
  assert.equal(COLS.obra, null, 'sin «Obra» en la pestaña la columna es opcional, no un error')
})

test('la comparación con la réplica: importes por número, fechas por día, y nombra el campo distinto', () => {
  const nuevas = [
    { sheet_id: '1', total_bruto: 100, fecha_cobro: '2026-02-10', estado: 'Cobrado' },
    { sheet_id: '2', total_bruto: 50.5, fecha_cobro: null, estado: 'Pendiente' },
  ]
  const replica = [
    { sheet_id: '1', total_bruto: '100.00', fecha_cobro: new Date(2026, 1, 10), estado: 'Cobrado' },
    { sheet_id: '2', total_bruto: '50.50', fecha_cobro: null, estado: 'Facturado' },
    { sheet_id: '9', total_bruto: '1', fecha_cobro: null, estado: 'x' },
  ]
  const d = diferenciasConReplica(nuevas, replica, ['total_bruto', 'fecha_cobro', 'estado'])
  assert.deepEqual(d.conteo, { sheet: 2, replica: 3 })
  assert.deepEqual(d.sumas.total_bruto, { sheet: 150.5, replica: 151.5 })
  assert.deepEqual(d.soloEnReplica, ['9'])
  assert.deepEqual(d.campos, [{ sheet_id: '2', campo: 'estado', sheet: 'Pendiente', replica: 'Facturado' }])
})
