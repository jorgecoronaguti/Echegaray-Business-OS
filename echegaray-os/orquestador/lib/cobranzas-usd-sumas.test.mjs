// LOS DÓLARES DE COBRANZAS NO SE SUMAN COMO PESOS — evaluado, no leído (24/09/2026).
//
// El dueño: «estás mezclando dólares con pesos y puede estar impactando mal todo el Sheet», por las
// filas de Quattropani con Moneda = USD: el anticipo de U$S 15.400 (fila 62) y las certificaciones 2/9,
// 3/9 y 4/9 de U$S 3.500 cada una (filas 79–81), las cuatro «Efectivo» y «Cobrado». El libro, CAJA,
// OBRAS y el Calendario ya las valuaban; tres familias de fórmulas no:
//
//   1. el cuadro «COBRANZAS POR CLIENTE» (SUMIF sobre el total, sin mirar la moneda);
//   2. el control de Cobranzas (BE: total bruto, lo que toma el Cash Flow, sin fecha, sin cliente,
//      plata en juego, facturado, proyectado, cobrado sin respaldo);
//   3. `_CAJA_ANEXO` A7 (el efectivo cobrado de la identidad del cajón en PESOS, y su «cargado dos
//      veces») y A6 (la cartera vencida).
//
// Las fórmulas NO se copian acá: se toman las que escribe cada generador y se EVALÚAN sobre filas con
// la forma de las reales. Con la fórmula anterior, cada aserción de abajo da otro número: U$S 25.900
// entrando como $25.900.

import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
import { columnasCobranzas } from './cobranzas-columnas.mjs'
import { COBRANZAS_1409 } from './encabezados-referencia.mjs'
import { COLUMNAS_CUADRO, filaCliente, formulaControlTotal } from './cobranzas-por-cliente.mjs'
import { COLUMNAS_CONTROL, bloque } from '../scripts/cobranzas-control.mjs'
import { COLUMNAS_HOY } from './columnas-caja.fixture.mjs'
import { bloqueTrazabilidad, bloqueVencido } from './caja-anexo-controles.mjs'

const TC = 1500
const QP = 'Quattropani - Melisa García SAS'
const HOY = new Date(Date.UTC(2026, 8, 24))
const D = (m, d) => new Date(Date.UTC(2026, m - 1, d))

/**
 * Cobranzas con el encabezado del 14/09 (G cliente · M total · N forma · O estado · Q fecha de cobro ·
 * AA moneda): un cobro en pesos de otro cliente, las cuatro filas en dólares de Quattropani, una
 * certificación de Quattropani en pesos todavía pendiente, y un pendiente EN DÓLARES ya vencido.
 */
function cobranzas() {
  const h = {}
  const fila = (n, cliente, monto, forma, estado, fecha, moneda = '') => {
    h[`G${n}`] = cliente; h[`M${n}`] = monto; h[`N${n}`] = forma; h[`O${n}`] = estado; h[`Q${n}`] = fecha
    if (moneda !== '') h[`AA${n}`] = moneda
  }
  fila(5, 'ARCOR', 1_000_000, 'Transferencia', 'Cobrado', D(7, 20))
  fila(6, QP, 15_400, 'Efectivo', 'Cobrado', D(7, 31), 'USD')
  fila(7, QP, 3_500, 'Efectivo', 'Cobrado', D(9, 24), 'USD')
  fila(8, QP, 3_500, 'Efectivo', 'Cobrado', D(9, 24), 'USD')
  fila(9, QP, 3_500, 'Efectivo', 'Cobrado', D(9, 24), 'USD')
  fila(10, QP, 6_564_250, 'Transferencia', 'Pendiente', D(10, 1))
  fila(11, 'MESSINA', 2_000, 'Efectivo', 'Pendiente', D(9, 1), 'USD')
  // La celda de moneda con un 0 —así están las filas 39 y 40 del archivo— es pesos.
  fila(12, 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 10_000_000, 'Efectivo', 'Cobrado', D(6, 13), 0)
  h.G400 = ''
  return h
}
const PESOS_QP_COBRADO = (15_400 + 3 * 3_500) * TC
const TOTAL_EN_PESOS = 1_000_000 + PESOS_QP_COBRADO + 6_564_250 + 2_000 * TC + 10_000_000

const evaluar = (formula, hoja, extra = {}) => evaluarFormula(formula, {
  hoja, hojas: { Cobranzas: hoja }, nombres: { TIPO_CAMBIO_USD: TC }, hoy: HOY, ...extra,
})

// ══ 1 · EL CUADRO «COBRANZAS POR CLIENTE» ═══════════════════════════════════════════════════════════

test('cuadro por cliente: Quattropani factura y cobra sus dólares VALUADOS, no como pesos', () => {
  const cob = columnasCobranzas(COBRANZAS_1409, COLUMNAS_CUADRO)
  const hoja = { ...cobranzas(), AC65: QP }
  const f = filaCliente('$AC65', '$AF$90', { facturado: '$AF', cobrado: '$AG' }, 65, cob)
  assert.equal(evaluar(f.facturado, hoja), PESOS_QP_COBRADO + 6_564_250,
    'facturado = U$S 25.900 × TC + la certificación en pesos (con SUMIF daba 25.900 + 6.564.250)')
  assert.equal(evaluar(f.cobrado, hoja), PESOS_QP_COBRADO, 'cobrado = U$S 25.900 × TC (con SUMIFS daba $25.900)')
})

test('cuadro por cliente: el control «¿ve TODA la pestaña?» valúa igual que las filas', () => {
  const cob = columnasCobranzas(COBRANZAS_1409, COLUMNAS_CUADRO)
  const hoja = { ...cobranzas(), AF90: TOTAL_EN_PESOS }
  assert.equal(evaluar(formulaControlTotal(cob, 'AF90'), hoja), 0,
    'si el cuadro suma en pesos y el control no, el control da distinto de cero sin que falte nada')
})

// ══ 2 · EL CONTROL DE COBRANZAS (columna BE) ════════════════════════════════════════════════════════

/** Las líneas del control por su rótulo, evaluadas. */
function control() {
  const cols = columnasCobranzas(COBRANZAS_1409, [...COLUMNAS_CONTROL, 'formaCobro'])
  const b = bloque(cols, { flag: 52, valor: 53, ctrl: 54 })
  const hoja = cobranzas()
  const linea = (prefijo) => {
    const l = b.find(([rot]) => String(rot).startsWith(prefijo))
    assert.ok(l, `el control tiene la línea «${prefijo}»`)
    return evaluar(l[1], hoja)
  }
  return { linea }
}

test('control de Cobranzas: el total bruto y lo que toma el Cash Flow son PESOS, y siguen cuadrando', () => {
  const { linea } = control()
  assert.equal(linea('Total bruto cargado'), TOTAL_EN_PESOS, 'con SUM(M) pelado, U$S 27.900 entraban como $27.900')
  assert.equal(linea('Lo que toma el Cash Flow'), TOTAL_EN_PESOS, 'el libro valúa los dólares: el control tiene que decir lo mismo')
})

test('control de Cobranzas: la plata en juego del trío indistinguible de Quattropani es plata en pesos', () => {
  // Las filas 7, 8 y 9 comparten cliente, monto, forma, estado y día: son indistinguibles por los datos
  // duros (el concepto no entra en la clave). Su plata en juego es (3 × U$S 3.500 × TC) / 2.
  const { linea } = control()
  assert.equal(linea('Plata en juego'), (3 * 3_500 * TC) / 2, 'antes: $5.250')
})

test('control de Cobranzas: un pendiente en dólares no se muestra como pesos en ninguna línea de plata', () => {
  // La fila 11 (MESSINA, U$S 2.000, Pendiente) no cae en «Facturado» ni en «Proyectado»; se cambia de
  // estado para ver que cada línea la valúa.
  const cols = columnasCobranzas(COBRANZAS_1409, [...COLUMNAS_CONTROL, 'formaCobro'])
  const b = bloque(cols, { flag: 52, valor: 53, ctrl: 54 })
  for (const [estado, prefijo] of [['Facturado', 'Facturado y todavía'], ['Proyectado', 'Proyectado (todavía']]) {
    const hoja = { ...cobranzas(), O11: estado }
    const l = b.find(([rot]) => String(rot).startsWith(prefijo))
    assert.equal(evaluar(l[1], hoja), 2_000 * TC, `«${prefijo}» valúa la fila en dólares`)
  }
  const sinFecha = { ...cobranzas(), Q11: '' }
  assert.equal(evaluar(b.find(([rot]) => rot === 'Cobros sin fecha de cobro')[1], sinFecha), 2_000 * TC)
})

// ══ 3 · `_CAJA_ANEXO` — la identidad del cajón en PESOS y la cartera vencida ══════════════════════════

function anexo(fn) {
  const rows = []
  const h = { rows, ch: 'Cheques Emitidos', refs: { columnas: COLUMNAS_HOY }, get n() { return rows.length }, push(r) { rows.push(r); return rows.length } }
  fn(h)
  return rows
}

test('A7: el efectivo cobrado del cajón en pesos NO incluye los dólares (van a la caja en dólares)', () => {
  const rows = anexo((h) => bloqueTrazabilidad(h, { yaRevisados: [] }))
  const cobrado = rows.find((r) => String(r[0]).startsWith('Cobrado en EFECTIVO'))
  const dosVeces = rows.find((r) => String(r[0]).includes('DOS VECES'))
  const hoja = cobranzas()
  assert.equal(evaluar(cobrado[4], hoja), 10_000_000, 'sólo el efectivo en pesos (antes: + $25.900 de dólares como pesos)')
  assert.equal(evaluar(dosVeces[4], hoja), 0, 'el trío en dólares no le resta $5.250 al efectivo en pesos')
})

test('A6: la cartera vencida valúa un pendiente en dólares', () => {
  const rows = anexo((h) => bloqueVencido(h))
  const pend = rows.find((r) => String(r[0]).startsWith('Cobros en "Pendiente"'))
  assert.equal(evaluar(pend[2], cobranzas()), 2_000 * TC, 'U$S 2.000 vencidos son pesos al TC, no $2.000')
})
