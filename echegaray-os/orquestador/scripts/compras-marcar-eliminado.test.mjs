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
    { fila: 6, id: 3, fecha: '2026-01-10', proveedor: 'ARCA', cliente: 'F931', total: 0 },
    { fila: 7, id: 4, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Obras', total: 100 },   // f7 coincide por fila declarada
    { fila: 20, id: 4, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Obras', total: 100 },  // sin fila válida y huella doble
    { fila: 4, id: 1, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Administracion', total: 4500001 }, // importe distinto
  ]
  const { aEscribir, yaEstaban, problemas } = planDeEliminacion(V, F, 4, pedidas)
  assert.deepEqual(aEscribir.map((e) => [e.fila, e.oEsFormula]), [[4, false], [5, true], [7, false]])
  assert.deepEqual(yaEstaban.map((y) => y.fila), [6])
  assert.deepEqual(problemas.map((p) => [p.fila, p.cuantas]), [[20, 2], [4, 0]])
  assert.equal(aEscribir[1].antes.O, '=N5+M5', 'el respaldo guarda la fórmula, no el valor')
})

test('X=ELIMINADO con importe distinto de cero NO cuenta como ya marcada: se vuelve a poner en cero', () => {
  const v = [fila({ id: 9, fecha: 46032, prov: 'Sueldos', cli: 'Obras', total: 500, estado: MARCA })]
  const { aEscribir, yaEstaban } = planDeEliminacion(v, v, 4, [{ fila: 4, id: 9, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Obras', total: 500 }])
  assert.equal(yaEstaban.length, 0); assert.equal(aEscribir.length, 1)
})

test('las requests: X siempre; O→0 si es número, M/N vacíos si O es fórmula; nada más', () => {
  const cols = (req) => req.map((r) => [r.updateCells.range.startColumnIndex, r.updateCells.rows[0].values[0].userEnteredValue ?? null])
  assert.deepEqual(cols(requestsDe({ fila: 4, oEsFormula: false }, 7)), [[COL.estado, { stringValue: MARCA }], [COL.total, { numberValue: 0 }]])
  assert.deepEqual(cols(requestsDe({ fila: 5, oEsFormula: true }, 7)), [[COL.estado, { stringValue: MARCA }], [COL.neto, null], [COL.iva, null]])
  for (const r of requestsDe({ fila: 5, oEsFormula: true }, 7)) {
    assert.equal(r.updateCells.range.startRowIndex, 4); assert.equal(r.updateCells.range.endRowIndex, 5)
    assert.ok(r.updateCells.range.startColumnIndex < 24, 'nunca toca AB en adelante')
  }
})

test('la huella lee fecha serial como ISO y el id como número', () => {
  assert.deepEqual(huella(V[0]), { id: 1, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Administracion', total: 4500000 })
})
