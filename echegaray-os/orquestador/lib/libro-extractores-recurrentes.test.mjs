// La provisión de recurrentes: lo esperado del mes, neto de lo materializado, que se consume solo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deRecurrentes, RUBRO_RECURRENTES } from './libro-extractores-recurrentes.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

// Compras de juguete: encabezado real en la fila 3 (índice 2), como la planilla.
const CAB = ['id', 'Categoría', 'Fecha', 'Mes', 'Proveedor', 'CUIT (OS)', 'Tipo', 'N° Comprobante', 'Unidad', 'Cliente / Asignación', 'Detalles / Obra', 'Concepto', 'Importe', 'IVA', 'Total', 'Tipo pago', '', '', '', 'Monto Pagado', '', '', 'Monto Parcial 2', 'Estado', '', '', '', '', 'Rubro de caja', 'Fecha de caja']
const col = Object.fromEntries(CAB.map((n, i) => [n, i]))
const fila = ({ prov, total, fechaCaja, rubro = RUBRO_RECURRENTES, estado = 'Pagado' }) => {
  const f = Array.from({ length: CAB.length }, () => '')
  f[col.Proveedor] = prov
  f[col.Total] = total
  f[col['Fecha de caja']] = fechaCaja
  f[col['Rubro de caja']] = rubro
  f[col.Estado] = estado
  return f
}
const HOY = serialDe(2026, 8, 7)
const armar = (...movs) => [['x'], ['x'], CAB, ...movs]

test('LA PROVISIÓN ES LA MEDIANA DE LOS MESES CERRADOS, Y EL MATERIALIZADO DEL MES LA CONSUME', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'Movistar', total: 300000, fechaCaja: serialDe(2026, 5, 5) }),
    fila({ prov: 'Movistar', total: 400000, fechaCaja: serialDe(2026, 6, 5) }),
    fila({ prov: 'Movistar', total: 350000, fechaCaja: serialDe(2026, 7, 5) }),
    // agosto: ya llegó una factura por 290.754 — pagada o pendiente, da igual: su fila real ya viaja
    fila({ prov: 'Movistar', total: 290754, fechaCaja: serialDe(2026, 8, 7) }),
  ), HOY)
  const ago = out.find((m) => m.fecha >= serialDe(2026, 8, 1) && m.fecha <= serialDe(2026, 8, 31))
  assert.ok(ago, 'el mes en curso lleva provisión')
  assert.equal(ago.importe, 350000 - 290754, 'esperado (mediana 350k) − materializado (290.754)')
  assert.equal(ago.estado, 'PROYECTADO')
  assert.equal(ago.signo, -1)
  assert.equal(ago.rubro, RUBRO_RECURRENTES)
})

test('MES COMPLETO → PROVISIÓN CERO: la factura real reemplaza a la expectativa, nunca se suman', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'RSV', total: 60000, fechaCaja: serialDe(2026, 6, 10) }),
    fila({ prov: 'RSV', total: 60000, fechaCaja: serialDe(2026, 7, 10) }),
    fila({ prov: 'RSV', total: 70000, fechaCaja: serialDe(2026, 8, 5) }),
  ), HOY)
  assert.ok(!out.some((m) => m.fecha <= serialDe(2026, 8, 31)), 'agosto ya se materializó entero: sin provisión')
})

test('LOS MESES FUTUROS LLEVAN LA EXPECTATIVA ENTERA, hasta diciembre', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'Robles', total: 500000, fechaCaja: serialDe(2026, 6, 17) }),
    fila({ prov: 'Robles', total: 480000, fechaCaja: serialDe(2026, 7, 17) }),
  ), HOY)
  const futuros = out.filter((m) => m.fecha >= serialDe(2026, 9, 1))
  assert.equal(futuros.length, 4, 'sept · oct · nov · dic')
  for (const m of futuros) assert.equal(m.importe, 490000, 'la mediana, entera')
})

test('UN SOLO MES DE HISTORIA NO ES UN RECURRENTE: sin expectativa no hay provisión', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'Nuevo SRL', total: 100000, fechaCaja: serialDe(2026, 7, 3) }),
  ), HOY)
  assert.equal(out.length, 0)
})

test('OTRO RUBRO NO ENTRA: la provisión es sólo del rubro Servicios recurrentes', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'Corralon', total: 200000, fechaCaja: serialDe(2026, 6, 1), rubro: 'Materiales Civil' }),
    fila({ prov: 'Corralon', total: 200000, fechaCaja: serialDe(2026, 7, 1), rubro: 'Materiales Civil' }),
  ), HOY)
  assert.equal(out.length, 0)
})

test('LA FECHA DEL MES EN CURSO NUNCA QUEDA EN EL PASADO: una expectativa no puede decir VENCIDO', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'Movistar', total: 300000, fechaCaja: serialDe(2026, 6, 2) }),
    fila({ prov: 'Movistar', total: 300000, fechaCaja: serialDe(2026, 7, 2) }),
  ), HOY)
  const ago = out.find((m) => m.fecha <= serialDe(2026, 8, 31))
  assert.ok(ago.fecha > HOY, `día típico 2 ya pasó: la provisión corre a mañana (fecha ${ago.fecha})`)
})

test('LA NOTA DE CRÉDITO RESTA DEL MES EN QUE CAYÓ: el materializado es neto', () => {
  const out = deRecurrentes(armar(
    fila({ prov: 'Movistar', total: 300000, fechaCaja: serialDe(2026, 6, 5) }),
    fila({ prov: 'Movistar', total: 300000, fechaCaja: serialDe(2026, 7, 5) }),
    fila({ prov: 'Movistar', total: 350000, fechaCaja: serialDe(2026, 8, 5) }),
    fila({ prov: 'Movistar', total: -100000, fechaCaja: serialDe(2026, 8, 6) }),
  ), HOY)
  const ago = out.find((m) => m.fecha <= serialDe(2026, 8, 31))
  assert.equal(ago.importe, 300000 - 250000, 'materializado neto de la nota: 350k − 100k')
})
