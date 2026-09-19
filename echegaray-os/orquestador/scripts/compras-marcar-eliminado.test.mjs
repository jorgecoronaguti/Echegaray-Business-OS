// EL BISTURÍ DE ELIMINADO NO PUEDE MARCAR LA FILA EQUIVOCADA.
import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeEliminacion, requestsDe, huella, MARCA, COL, colDe, ROTULOS } from './compras-marcar-eliminado.mjs'
import { COMPRAS_1809 } from '../lib/comprobantes/encabezado-vivo-compras.mjs'
import { COMPRAS_2508 } from '../lib/encabezados-referencia.mjs'

const fila = ({ id, fecha, prov, cli, neto = '', iva = '', total, pagado = '', estado = 'Pagado' }) => {
  const f = new Array(COL.estado + 1).fill('')
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
    // El límite es la primera ARRAYFORMULA del layout (el 1.º «Rubro de caja»), no una letra fija: con
    // «Obra» insertada en L el bisturí escribe hasta Y (24) y la ARRAYFORMULA empieza en AC (28).
    assert.ok(r.updateCells.range.startColumnIndex < COMPRAS_1809.indexOf('Rubro de caja'), 'nunca toca una ARRAYFORMULA')
  }
})

test('la huella lee fecha serial como ISO y el id como número', () => {
  assert.deepEqual(huella(V[0]), { id: 1, fecha: '2026-01-10', proveedor: 'Sueldos', cliente: 'Administracion', total: 4500000 })
})

// ═══ DESDE EL 14/09/2026 LA PESTAÑA TIENE «Obra» EN L: TODO LO QUE ESTÁ A LA DERECHA SE CORRIÓ UNA LETRA ═══
//
// El bisturí nació con índices fijos anteriores a la inserción (estado = 23 = X). Con la fila de
// rótulos viva del 18/09 «Estado» es Y (24): escribir en 23 pondría «ELIMINADO» en «Monto Parcial 2» y
// el cero en «Concepto»/«Importe» en vez de en «Importe»/«IVA»/«Total». Estos tests lo cazan.

test('las columnas salen de la fila de rótulos VIVA: con «Obra» en L, Estado es Y (24) y Total es P (15)', () => {
  const c = colDe(COMPRAS_1809)
  assert.deepEqual(c, { id: 0, fecha: 2, proveedor: 4, cliente: 9, neto: 13, iva: 14, total: 15, pagado: 20, estado: 24 })
  // Y el mismo resolvedor, contra el layout anterior a la inserción, da los índices con los que nació el bisturí.
  assert.deepEqual(colDe(COMPRAS_2508), { id: 0, fecha: 2, proveedor: 4, cliente: 9, neto: 12, iva: 13, total: 14, pagado: 19, estado: 23 })
  // El COL exportado es el del 18/09, no el viejo.
  assert.deepEqual(COL, c)
})

test('un rótulo que falta aborta con su nombre: nunca una letra de respaldo', () => {
  const sinEstado = COMPRAS_1809.filter((r) => r !== 'Estado')
  assert.throws(() => colDe(sinEstado), /falta la columna «Estado»/)
  assert.ok(Object.values(ROTULOS).includes('Estado'))
})

test('las requests van a la columna resuelta: X → Y después de la inserción, y M/N → N/O', () => {
  const cols = (req) => req.map((r) => r.updateCells.range.startColumnIndex)
  const c = colDe(COMPRAS_1809)
  assert.deepEqual(cols(requestsDe({ fila: 423, oEsFormula: false }, 7, c)), [24, 15])
  assert.deepEqual(cols(requestsDe({ fila: 5, oEsFormula: true, nTieneNumero: true }, 7, c)), [24, 13, 14])
  // Y con el layout viejo, lo de siempre: para que la prueba distinga los dos.
  const v = colDe(COMPRAS_2508)
  assert.deepEqual(cols(requestsDe({ fila: 423, oEsFormula: false }, 7, v)), [23, 14])
})

test('el plan lee la huella y el importe por las columnas resueltas (la fila del 18/09 con «Obra» en L)', () => {
  const c = colDe(COMPRAS_1809)
  const f = new Array(30).fill('')
  f[c.id] = 419; f[c.fecha] = 46153; f[c.proveedor] = 'FCL'; f[c.cliente] = 'FCL'; f[c.total] = 1137000; f[c.estado] = 'Pagado'
  f[11] = 'ES-ADM · Estructura – Administración'; f[12] = ''
  const pedida = { fila: 423, id: 419, fecha: '2026-05-11', proveedor: 'FCL', cliente: 'FCL', total: 1137000 }
  const { aEscribir, problemas } = planDeEliminacion([f], [f.slice()], 423, [pedida], c)
  assert.equal(problemas.length, 0)
  assert.deepEqual(aEscribir.map((e) => [e.fila, e.oEsFormula, e.antes.O, e.antes.X]), [[423, false, 1137000, 'Pagado']])
  // Con los índices viejos la misma fila NO coincide (el total caería en «IVA»): el plan la rechaza en vez de escribir a ciegas.
  const viejo = planDeEliminacion([f], [f.slice()], 423, [pedida], colDe(COMPRAS_2508))
  assert.equal(viejo.problemas.length, 1)
})
