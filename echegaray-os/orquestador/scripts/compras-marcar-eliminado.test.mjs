// EL BISTURÍ DE ELIMINADO NO PUEDE MARCAR LA FILA EQUIVOCADA.
import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeEliminacion, requestsDe, huella, MARCA, COL } from './compras-marcar-eliminado.mjs'

const fila = ({ id, fecha, prov, cli, neto = '', iva = '', total, pagado = '', estado = 'Pagado' }) => {
  const f = new Array(24).fill('')
  f[COL.id] = id; f[COL.fecha] = fecha; f[COL.proveedor] = prov; f[COL.cliente] = cli
  f[COL.neto] = neto; f[COL.iva] = iva; f[COL.total] = total; f[COL.pagado] = pagado; f[COL.estado] = estado
  return f
}
// 46032 = 2026-01-10
const V = [
  fila({ id: 1, fecha: 46032, prov: 'Sueldos', cli: 'Administracion', total: 4500000 }),        // f4, O tipeado
  fila({ id: 2, fecha: 46032, prov: 'DUPEC', cli: 'BSA', neto: 1000, iva: 210, total: 1210 }),  // f5, O fórmula
  fila({ id: 3, fecha: 46032, prov: 'ARCA', cli: 'F931', total: 0, estado: MARCA }),            // f6, ya marcada
  fila({ id: 4, fecha: 46032, prov: 'Sueldos', cli: 'Obras', total: 100 }),                     // f7
  fila({ id: 4, fecha: 46032, prov: 'Sueldos', cli: 'Obras', total: 100 }),                     // f8, huella repetida
]
const F = V.map((f) => f.slice())
F[1][COL.total] = '=N5+M5'; F[1][COL.pagado] = '=IF(F5="pago";O5;0)'

test('marca por huella: la fila declarada corrida se encuentra igual, y la repetida no se toca', () => {
  const pedidas = [
    { fila: 4, id: 1, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Administracion', total: 4500000 },
    { fila: 9, id: 2, fecha: '2026-01-10', proveedor: 'DUPEC', cliente: 'BSA', total: 1210 },       // declarada mal: está en f5
    { fila: 6, id: 3, fecha: '2026-01-10', proveedor: 'ARCA', cliente: 'F931', total: 4859763 }, // ya en cero: se reconoce sin el importe
    { fila: 7, id: 4, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Obras', total: 100 },   // f7 coincide por fila declarada
    { fila: 20, id: 4, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Obras', total: 100 },  // sin fila válida y huella doble
    { fila: 4, id: 1, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Administracion', total: 4500001 }, // importe distinto
  ]
  const { aEscribir, yaEstaban, problemas } = planDeEliminacion(V, F, 4, pedidas)
  assert.deepEqual(aEscribir.map((e) => [e.fila, e.oEsFormula, e.nTieneNumero]), [[4, false, false], [5, true, true], [7, false, false]])
  assert.deepEqual(yaEstaban.map((y) => y.fila), [6])
  assert.deepEqual(problemas.map((p) => [p.fila, p.cuantas]), [[20, 2], [4, 0]])
  assert.equal(aEscribir[1].antes.O, '=N5+M5', 'el respaldo guarda la fórmula, no el valor')
})

test('X=ELIMINADO con importe distinto de cero NO cuenta como ya marcada: se vuelve a poner en cero', () => {
  const v = [fila({ id: 9, fecha: 46032, prov: 'Sueldos', cli: 'Obras', total: 500, estado: MARCA })]
  const { aEscribir, yaEstaban } = planDeEliminacion(v, v, 4, [{ fila: 4, id: 9, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Obras', total: 500 }])
  assert.equal(yaEstaban.length, 0); assert.equal(aEscribir.length, 1)
})

test('las requests: X siempre; O→0 si es número, M→0 (y N→0 si tenía número) si O es fórmula; nunca una celda vacía', () => {
  const cols = (req) => req.map((r) => [r.updateCells.range.startColumnIndex, r.updateCells.rows[0].values[0].userEnteredValue ?? null])
  assert.deepEqual(cols(requestsDe({ fila: 4, oEsFormula: false }, 7)), [[COL.estado, { stringValue: MARCA }], [COL.total, { numberValue: 0 }]])
  assert.deepEqual(cols(requestsDe({ fila: 5, oEsFormula: true, nTieneNumero: false }, 7)), [[COL.estado, { stringValue: MARCA }], [COL.neto, { numberValue: 0 }]])
  assert.deepEqual(cols(requestsDe({ fila: 5, oEsFormula: true, nTieneNumero: true }, 7)), [[COL.estado, { stringValue: MARCA }], [COL.neto, { numberValue: 0 }], [COL.iva, { numberValue: 0 }]])
  // La guarda anti-borrado descarta una celda vaciada sobre un valor: ninguna request puede ir vacía.
  for (const r of requestsDe({ fila: 5, oEsFormula: true, nTieneNumero: true }, 7)) assert.ok(r.updateCells.rows[0].values[0].userEnteredValue, 'request vacía')
  for (const r of requestsDe({ fila: 5, oEsFormula: true }, 7)) {
    assert.equal(r.updateCells.range.startRowIndex, 4); assert.equal(r.updateCells.range.endRowIndex, 5)
    assert.ok(r.updateCells.range.startColumnIndex < 24, 'nunca toca AB en adelante')
  }
})

test('la huella lee fecha serial como ISO y el id como número', () => {
  assert.deepEqual(huella(V[0]), { id: 1, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Administracion', total: 4500000 })
})

test('columnas por encabezado: con «Obra» insertada en la L (17/09) el importe es N, el total P, Monto Pagado U y Estado Y', async () => {
  const { columnasDe } = await import('./compras-marcar-eliminado.mjs')
  // Encabezado REAL de Compras, fila 3, leído el 18/09/2026.
  const cab = ['ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo', 'N° Comprobante',
    'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Obra', 'Concepto', 'Importe', 'IVA', 'Total', 'Tipo pago',
    'Fecha prevista de pago (día)', 'Fecha prevista de pago (mes)', 'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1',
    'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado', 'Tipo de Costo', 'Estado pago', 'Estado Carga']
  assert.deepEqual(columnasDe(cab), { id: 0, fecha: 2, proveedor: 4, cliente: 9, neto: 13, iva: 14, total: 15, pagado: 20, estado: 24 })
  // Un rótulo que falta o se repite no deja escribir nada.
  assert.throws(() => columnasDe(cab.filter((c) => c !== 'Monto Pagado')), /Monto Pagado/)
  assert.throws(() => columnasDe([...cab, 'Estado']), /Estado/)
})

test('CON EL ENCABEZADO NUEVO LAS CELDAS CAEN EN N/P/U/Y, nunca en «Tipo de Costo» ni «Estado pago»', async () => {
  // EL DEFECTO QUE ESTE CONTROL FIJA (19/09/2026, pedido de la revisión independiente): con las letras
  // fijas del layout viejo, «Estado» caía en el índice 25 —«Tipo de Costo»— y el importe en «Estado pago».
  // El test de arriba prueba el MAPEO; éste prueba lo que de verdad se escribe con ese mapeo.
  const { columnasDe } = await import('./compras-marcar-eliminado.mjs')
  const cab = ['ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo', 'N° Comprobante',
    'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Obra', 'Concepto', 'Importe', 'IVA', 'Total', 'Tipo pago',
    'Fecha prevista de pago (día)', 'Fecha prevista de pago (mes)', 'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1',
    'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado', 'Tipo de Costo', 'Estado pago', 'Estado Carga']
  const cols = columnasDe(cab)
  const indices = (req) => req.map((r) => r.updateCells.range.startColumnIndex)
  // N = Importe (13) · P = Total (15) · Y = Estado (24). «Tipo de Costo» (25) y «Estado pago» (26) quedan afuera.
  assert.deepEqual(indices(requestsDe({ fila: 4, oEsFormula: false }, 7, cols)), [24, 15])
  assert.deepEqual(indices(requestsDe({ fila: 5, oEsFormula: true, nTieneNumero: true }, 7, cols)), [24, 13, 14])
  for (const r of [...requestsDe({ fila: 4, oEsFormula: false }, 7, cols), ...requestsDe({ fila: 5, oEsFormula: true, nTieneNumero: true }, 7, cols)]) {
    const c = r.updateCells.range.startColumnIndex
    assert.ok(c !== 25 && c !== 26, `escribió en ${cab[c]}: es una columna que el dueño maneja, no del script`)
  }
})
