import test from 'node:test'
import assert from 'node:assert/strict'
import { C, leerCobro, repasar, porMes, esPendiente, esCobrado } from './cobranzas-en-cashflow.mjs'

// El serial de Sheets de una fecha ISO, para escribir fixtures legibles.
const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000)
const HOY = new Date('2026-08-04T00:00:00Z')

/** Arma una fila de la grilla de Cobranzas con sólo las columnas que importan. */
function fila({ total, unidad = 'Civil', cliente = 'X', estado = 'Pendiente', cobro = null, venta = null, comprobante = '', banco = '' }) {
  const f = []
  const set = (j, valor, numero = null) => { f[j] = { valor, numero, formula: null, formato: null, derivada: false } }
  set(C.total, String(total), total)
  set(C.unidad, unidad); set(C.cliente, cliente); set(C.estado, estado); set(C.comprobante, comprobante)
  set(C.banco, banco)
  if (cobro) set(C.fechaCobro, cobro, serial(cobro))
  if (venta) set(C.fechaVenta, venta, serial(venta))
  return f
}

// ── LOS CASOS REALES DEL ARCHIVO al 04/08/2026 ────────────────────────────────────────────────────
// La fila 37: $10.000.000 de LA ESTRELLA fechada el 31/07/2026 y todavía Pendiente. Es el caso que
// destapó el hueco: no está en la línea de cobrado (no entró) y la de esperadas apaga su columna
// porque julio ya cerró. Diez millones que la empresa espera y el cuadro no muestra en ningún lado.
const F37 = fila({ total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', cobro: '2026-07-31', comprobante: '01_00000213' })
// La fila 43: mismo cliente, marcada Cobrado con fecha 15/08 — once días DESPUÉS de hoy.
const F43 = fila({ total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', estado: 'Cobrado', cobro: '2026-08-15' })
// Un pendiente sano de agosto y uno de septiembre.
const F60 = fila({ total: 5000000, cliente: 'San Francisco', cobro: '2026-08-19' })
const F80 = fila({ total: 19662500, cliente: 'MESSINA', cobro: '2026-09-09' })

const cobros = [F37, F43, F60, F80].map((f, i) => leerCobro(f, i + 5))

test('un pendiente fechado ANTES del mes en curso no aparece en ninguna línea del cuadro', () => {
  const r = repasar(cobros, { hoy: HOY })
  assert.equal(r.invisiblesAlCuadro.length, 1)
  assert.equal(r.invisiblesAlCuadro[0].fila, 5, 'es la fila 37 del archivo real')
  assert.equal(r.montos.invisiblesAlCuadro, 10000000)
  // Y la contraprueba: la reconstrucción mes a mes NO lo suma a julio, igual que la fórmula.
  const m = porMes(cobros, { hoy: HOY })
  assert.equal(m.get('2026-07').esperado, 0, 'la fórmula apaga la columna de un mes cerrado')
  assert.equal(m.get('2026-07').cobrado, 0)
})

test('el mismo pendiente SÍ cuenta como vencido: el hueco existe aunque el cuadro no lo muestre', () => {
  const r = repasar(cobros, { hoy: HOY })
  assert.equal(r.montos.vencidos, 10000000)
  assert.deepEqual(r.vencidos.map((c) => c.fila), [5])
})

test('percibido: no se puede haber cobrado algo con fecha de cobro futura', () => {
  const r = repasar(cobros, { hoy: HOY })
  assert.equal(r.cobradosAFuturo.length, 1)
  assert.equal(r.montos.cobradosAFuturo, 10000000)
  assert.equal(r.cobradosAFuturo[0].fila, 6)
})

test('un pendiente sin fecha de cobro ni de venta no cae en ninguna semana ni en ningún mes', () => {
  const sin = leerCobro(fila({ total: 777000, cliente: 'SIN FECHA' }), 99)
  const r = repasar([...cobros, sin], { hoy: HOY })
  assert.equal(r.sinFecha.length, 1)
  assert.equal(r.montos.sinFecha, 777000)
  // No aparece en ningún mes: si apareciera, estaría en una ventana que nadie eligió.
  const m = porMes([...cobros, sin], { hoy: HOY })
  for (const v of m.values()) assert.ok(!String(v.esperado).includes('777'))
  assert.equal([...m.values()].reduce((s, v) => s + v.esperado, 0), 24662500, 'sólo los de agosto y septiembre')
})

test('la reconstrucción mes a mes reproduce las dos líneas del cuadro, separadas', () => {
  const m = porMes(cobros, { hoy: HOY })
  assert.equal(m.get('2026-08').cobrado, 10000000, 'fila 43: cobrada, aunque su fecha sea futura')
  assert.equal(m.get('2026-08').esperado, 5000000)
  assert.equal(m.get('2026-09').esperado, 19662500)
  // Cobrado y esperado NUNCA suman el mismo cobro: agosto tiene los dos y ninguno vale $15.000.000.
  assert.notEqual(m.get('2026-08').cobrado, m.get('2026-08').esperado)
  const total = [...m.values()].reduce((s, v) => s + v.cobrado + v.esperado, 0)
  assert.equal(total, 34662500, 'los 4 cobros menos los $10M invisibles de julio')
})

test('un valor endosado no es plata de la empresa y no entra por ninguna de las dos líneas', () => {
  const end = leerCobro(fila({ total: 3000000, cliente: 'X', cobro: '2026-09-01', banco: 'ENDOSADO a proveedor' }), 200)
  assert.equal(esPendiente(end), false)
  const m = porMes([end], { hoy: HOY })
  assert.equal(m.size, 0)
})

test('esCobrado / esPendiente parten el universo sin superponerse', () => {
  for (const estado of ['Cobrado', 'Pendiente', 'Proyectado', 'Facturado', '']) {
    const c = leerCobro(fila({ total: 1, estado, cobro: '2026-09-01' }), 1)
    assert.ok(!(esCobrado(c) && esPendiente(c)), `"${estado}" no puede ser las dos cosas`)
  }
  // "Facturado" y "Proyectado" son estados REALES del archivo y cuentan como esperados: si el repaso
  // los ignorara, la línea de esperadas del cuadro no se podría reconstruir.
  assert.equal(esPendiente(leerCobro(fila({ total: 1, estado: 'Facturado', cobro: '2026-09-01' }), 1)), true)
  assert.equal(esPendiente(leerCobro(fila({ total: 1, estado: 'Proyectado', cobro: '2026-09-01' }), 1)), true)
})

test('una fila sin monto no es un cobro vacío: no es un cobro', () => {
  assert.equal(leerCobro(fila({ total: 0 }), 1), null)
  assert.equal(leerCobro([], 1), null)
})
