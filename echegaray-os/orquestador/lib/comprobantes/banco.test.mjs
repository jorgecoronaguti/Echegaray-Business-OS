// EL CRUCE CONTRA EL EXTRACTO — con el caso real que lo creó (Trielec, 20-21/08).
import test from 'node:test'
import assert from 'node:assert/strict'
import { cruceBancario, dicePagadaPorBanco, movimientoDelProveedor } from './banco.mjs'

// El débito REAL del extracto del 20/08: una sola transferencia paga las dos facturas.
const DEBITO_TRIELEC = {
  fecha: '2026-08-20', concepto: 'Transferencia inmediata - A trielec s a / - var / 30558640355',
  importe: -323149.37, referencia: '71767731',
}
const item = (c) => ({ comprobante: c })
const trielec = (total, numero) => ({
  proveedor: 'Trielec', cuit: '30558640355', numero, total, fecha: '20/08/2026',
  formaPago: 'Transferencia',
})

test('declara pago bancario por la forma de pago o por el detalle', () => {
  assert.equal(dicePagadaPorBanco({ formaPago: 'Transferencia' }), true)
  assert.equal(dicePagadaPorBanco({ detalleObra: 'Pagada con acreditación bancaria · sello' }), true)
  assert.equal(dicePagadaPorBanco({ formaPago: 'Efectivo' }), false)
  assert.equal(dicePagadaPorBanco({}), false)
})

test('el movimiento se vincula al proveedor por nombre o por CUIT', () => {
  assert.equal(movimientoDelProveedor(DEBITO_TRIELEC, { proveedor: 'Trielec' }), true)
  assert.equal(movimientoDelProveedor(DEBITO_TRIELEC, { proveedor: 'Otro', cuit: '30558640355' }), true)
  assert.equal(movimientoDelProveedor(DEBITO_TRIELEC, { proveedor: 'Corralon Progreso' }), false)
})

test('el caso Trielec: UNA transferencia de $323.149,37 cruza las DOS facturas del envío', () => {
  const items = [item(trielec(95277.07, '0038-00002973')), item(trielec(227872.31, '0038-00002972'))]
  cruceBancario(items, [DEBITO_TRIELEC])
  for (const it of items) {
    assert.equal(it.banco?.estado, 'cruza', `${it.comprobante.numero} no cruzó`)
    assert.equal(it.banco.agrupado, 2)
    assert.equal(it.banco.referencia, '71767731')
  }
})

test('la lectura ×100 NO cruza: $9.527.707 no tiene ningún débito que la respalde', () => {
  const items = [item(trielec(9527707, '0038-00002973'))]
  cruceBancario(items, [DEBITO_TRIELEC])
  assert.equal(items[0].banco?.estado, 'sin_debito')
  assert.equal(items[0].banco.candidatos, 1, 'el débito real del proveedor existía — y no coincidía')
})

test('un débito exacto cruza individual, sin agrupar', () => {
  const items = [item(trielec(95277.07, '0038-00002973'))]
  cruceBancario(items, [{ ...DEBITO_TRIELEC, importe: -95277.07 }])
  assert.equal(items[0].banco?.estado, 'cruza')
  assert.equal(items[0].banco.agrupado, undefined)
})

test('sin extracto (la consulta falló) queda no_verificable, nunca un veredicto', () => {
  const items = [item(trielec(95277.07, '0038-00002973'))]
  cruceBancario(items, null)
  assert.equal(items[0].banco?.estado, 'no_verificable')
})

test('el pago en efectivo no se cruza: no hay débito que buscar', () => {
  const items = [item({ proveedor: 'Trielec', total: 100, fecha: '20/08/2026', formaPago: 'Efectivo' })]
  cruceBancario(items, [DEBITO_TRIELEC])
  assert.equal(items[0].banco, undefined)
})

test('un débito de otro proveedor o lejos en fecha no se ofrece como respaldo', () => {
  const items = [item(trielec(323149.37, '0038-00002999'))]
  cruceBancario(items, [{ ...DEBITO_TRIELEC, concepto: 'Transferencia a corralon progreso srl' }])
  assert.equal(items[0].banco?.estado, 'sin_debito')
  const lejos = [item({ ...trielec(323149.37, '0038-00002999'), fecha: '01/07/2026' })]
  cruceBancario(lejos, [DEBITO_TRIELEC])
  assert.equal(lejos[0].banco?.estado, 'sin_debito')
})

test('lo ya cargado no se vuelve a cruzar', () => {
  const items = [{ ...item(trielec(95277.07, '0038-00002973')), yaCargado: { fila: 871 } }]
  cruceBancario(items, [DEBITO_TRIELEC])
  assert.equal(items[0].banco, undefined)
})

// ─── Los dos contraejemplos de la auditoría de cierre (21/08) ───

test('un débito NO puede «verificar» dos facturas del mismo importe: se consume', () => {
  const items = [item(trielec(95277.07, '0038-00002973')), item(trielec(95277.07, '0038-00002999'))]
  cruceBancario(items, [{ ...DEBITO_TRIELEC, importe: -95277.07 }])
  const estados = items.map((it) => it.banco?.estado).sort()
  assert.deepEqual(estados, ['cruza', 'sin_debito'], 'el mismo débito respaldó dos pagos')
})

test('una palabra genérica compartida no es identidad: CONSTRUCCIONES DEL VALLE no cruza con ECHEGARAY CONSTRUCCIONES', () => {
  assert.equal(movimientoDelProveedor(
    { concepto: 'PAGO PROVEEDOR ECHEGARAY CONSTRUCCIONES SA', importe: -100000 },
    { proveedor: 'CONSTRUCCIONES DEL VALLE SRL' },
  ), false)
  const items = [item({ proveedor: 'CONSTRUCCIONES DEL VALLE SRL', total: 100000, fecha: '20/08/2026', formaPago: 'Transferencia' })]
  cruceBancario(items, [{ fecha: '2026-08-20', concepto: 'PAGO PROVEEDOR ECHEGARAY CONSTRUCCIONES SA', importe: -100000, referencia: 'R9' }])
  assert.equal(items[0].banco?.estado, 'sin_debito', 'declaró «verificada» sobre una palabra de media plaza')
})

test('un proveedor cuyo nombre es TODO genérico no cruza nunca por nombre (sólo por CUIT)', () => {
  assert.equal(movimientoDelProveedor({ concepto: 'algo con servicios y construcciones' }, { proveedor: 'Servicios y Construcciones SRL' }), false)
  assert.equal(movimientoDelProveedor({ concepto: 'x 30558640355 x' }, { proveedor: 'Servicios y Construcciones SRL', cuit: '30558640355' }), true)
})

test('con dos o más palabras identificatorias hacen falta al menos dos coincidencias', () => {
  assert.equal(movimientoDelProveedor({ concepto: 'Transferencia a corralon del centro' }, { proveedor: 'Corralon Progreso' }), false)
  assert.equal(movimientoDelProveedor({ concepto: 'Transferencia a corralon progreso' }, { proveedor: 'Corralon Progreso' }), true)
})
