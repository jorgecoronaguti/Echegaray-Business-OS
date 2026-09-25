// LOS DÉBITOS DE ARCA QUE NINGUNA OBLIGACIÓN RECLAMÓ ENTRAN AL LIBRO — con los tres del 25/09/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { arcaSinConciliar, esDebitoArca, RUBRO_AFIP_SIN_IMPUTAR } from './libro-extractores-banco-obligaciones.mjs'
import { RUBRO_CARGAS, RUBRO_PLANES } from './libro-extractores-cargas.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
import { movimiento, SALE } from './libro-movimientos.mjs'

const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
const VEP = 'Pago de servicios - Imp.afip: 3071630464311793242 - tarj nro. 3537'
// Filas reales de `_BANCO_RAW` (lectura del 25/09/2026).
const F247 = { fecha: S('2026-07-20'), concepto: VEP, importe: 4859763.28, naturaleza: 'AFIP', fila: 247 }
const F490 = { fecha: S('2026-08-28'), concepto: VEP, importe: 69722.68, naturaleza: 'AFIP', fila: 490 }
const F636 = { fecha: S('2026-09-16'), concepto: 'Debito automatico - Arca -30716304643', importe: 242519.6, naturaleza: 'Débitos automáticos (seguros)', fila: 636 }
const F372 = { fecha: S('2026-08-11'), concepto: VEP, importe: 8235741.96, naturaleza: 'AFIP', fila: 372 }
const SEGURO = { fecha: S('2026-09-16'), concepto: 'Debito automatico - La Segunda Seguros', importe: 90000, naturaleza: 'Débitos automáticos (seguros)', fila: 637 }

test('los tres débitos de ARCA fuera del libro entran REAL, con su mejor clasificación', () => {
  const r = arcaSinConciliar({ debitos: [F247, F490, F636, SEGURO], usados: new Set(), libro: [] })
  const por = Object.fromEntries(r.movimientos.map((m) => [m.origen.fila, m]))
  assert.equal(r.movimientos.length, 3, 'el seguro no es ARCA')
  assert.equal(por[247].rubro, RUBRO_CARGAS)
  assert.match(por[247].concepto, /F931 · nómina de 2026-06 .*inferido/)
  assert.equal(por[636].rubro, RUBRO_PLANES)
  assert.match(por[636].concepto, /inferido/)
  assert.equal(por[490].rubro, RUBRO_AFIP_SIN_IMPUTAR)
  assert.match(por[490].concepto, /^AFIP sin imputar/)
  assert.ok(r.movimientos.every((m) => m.estado === 'REAL' && m.signo === SALE))
  assert.equal(Math.round(r.movimientos.reduce((a, m) => a + m.importe, 0) * 100) / 100, 5172005.56)
})

test('«Arca» con el CUIT de la empresa es ARCA aunque el banco lo rotule «seguros»', () => {
  assert.equal(esDebitoArca(F636), true)
  assert.equal(esDebitoArca(SEGURO), false)
})

test('NO se cuenta dos veces: lo reclamado por el cruce, lo ya emitido y lo que Compras lleva quedan afuera', () => {
  const yaEmitido = movimiento({ fecha: F372.fecha, signo: SALE, importe: F372.importe, concepto: 'F931 · nómina de 2026-07',
    rubro: RUBRO_CARGAS, estado: 'REAL', origen: { pestana: '_BANCO_RAW', fila: 372 } })
  const deCompras = movimiento({ fecha: S('2026-09-15'), signo: SALE, importe: 242519.6, concepto: 'Plan X cuota',
    rubro: RUBRO_PLANES, estado: 'REAL', origen: { pestana: 'Compras', fila: 900 } })
  const r = arcaSinConciliar({ debitos: [F247, F372, F636], usados: new Set([247]), libro: [yaEmitido, deCompras] })
  assert.deepEqual(r.movimientos, [])
  assert.equal(r.avisos.length, 1, 'el que explica Compras se nombra')
})
