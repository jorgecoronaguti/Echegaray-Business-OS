import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  entraEnRango, fechaValida, filtrarPorFechas, hayFechasActivas, leerFiltroDeFechas, SIN_FECHAS,
} from './filtroDeFechasCobranza.ts'
import { recortar, totalDeFilas, type FilaCobranza } from './cobranzasCliente.ts'

const fila = (o: Partial<FilaCobranza>): FilaCobranza => ({
  cobranza_id: 'x', obra_id: null, imputacion: null, fila: null, categoria: 'B', fecha_emision: null,
  factura: null, numero_comprobante: null, concepto: null, orden_compra: null, monto_neto: 0, iva: 0,
  retenciones: 0, total_bruto: 100, estado: 'Pendiente', esta_cobrada: false, esta_cancelada: false,
  esta_vencida: false, fecha_cobro: null, forma_cobro: null, ...o,
} as FilaCobranza)

const FILAS = [
  fila({ cobranza_id: 'a', categoria: 'B', fecha_venta: '2026-08-10', fecha_cobro: '2026-09-10', esta_cobrada: true, total_bruto: 100 }),
  fila({ cobranza_id: 'b', categoria: 'N', fecha_venta: '2026-09-01', fecha_cobro: '2026-10-15', total_bruto: 200 }),
  fila({ cobranza_id: 'c', categoria: 'B', fecha_venta: '2026-09-30', fecha_cobro: null, total_bruto: 400 }),
  fila({ cobranza_id: 'd', categoria: 'B', fecha_venta: null, fecha_cobro: '2026-09-20', total_bruto: 800 }),
]
const ids = (fs: FilaCobranza[]) => fs.map((f) => f.cobranza_id).join('')

test('rango inclusivo en los dos extremos', () => {
  const r = { desde: '2026-09-01', hasta: '2026-09-30' }
  assert.equal(entraEnRango('2026-09-01', r), true)
  assert.equal(entraEnRango('2026-09-30', r), true)
  assert.equal(entraEnRango('2026-08-31', r), false)
  assert.equal(entraEnRango('2026-10-01', r), false)
})

test('sólo desde y sólo hasta', () => {
  assert.equal(entraEnRango('2026-12-31', { desde: '2026-09-01', hasta: null }), true)
  assert.equal(entraEnRango('2026-08-31', { desde: '2026-09-01', hasta: null }), false)
  assert.equal(entraEnRango('2020-01-01', { desde: null, hasta: '2026-09-01' }), true)
  assert.equal(entraEnRango('2026-09-02', { desde: null, hasta: '2026-09-01' }), false)
})

test('una fila sin esa fecha NO pasa un filtro activo de esa fecha, y sí pasa si no hay filtro', () => {
  const f = leerFiltroDeFechas({ cdesde: '2026-09-01' })
  assert.equal(ids(filtrarPorFechas(FILAS, f)), 'abd') // c no tiene fecha de cobro
  assert.equal(ids(filtrarPorFechas(FILAS, SIN_FECHAS)), 'abcd')
})

test('la fecha de factura lee `fecha_venta` (col. Q), no `fecha_emision` (col. C)', () => {
  const trampa = [fila({ cobranza_id: 'q', fecha_venta: '2026-09-15', fecha_emision: '2026-01-01' })]
  assert.equal(filtrarPorFechas(trampa, leerFiltroDeFechas({ fdesde: '2026-09-01', fhasta: '2026-09-30' })).length, 1)
  assert.equal(filtrarPorFechas(trampa, leerFiltroDeFechas({ fdesde: '2026-01-01', fhasta: '2026-01-31' })).length, 0)
})

test('factura y cobro se combinan con Y, y con el recorte', () => {
  const f = leerFiltroDeFechas({ fdesde: '2026-08-01', fhasta: '2026-09-15', cdesde: '2026-10-01' })
  assert.equal(ids(filtrarPorFechas(FILAS, f)), 'b')
  const soloSep = filtrarPorFechas(FILAS, leerFiltroDeFechas({ fdesde: '2026-09-01' }))
  assert.equal(ids(recortar(soloSep, 'b')), 'c')
  assert.equal(ids(recortar(soloSep, 'n')), 'b')
})

test('fecha inválida en la URL se ignora, no rompe ni filtra', () => {
  for (const mala of ['hoy', '2026-02-30', '31/12/2026', '', '2026-9-1']) assert.equal(fechaValida(mala), null, mala)
  const f = leerFiltroDeFechas({ fdesde: 'basura', chasta: '2026-13-01' })
  assert.equal(hayFechasActivas(f), false)
  assert.equal(ids(filtrarPorFechas(FILAS, f)), 'abcd')
})

test('las cuentas de las opciones y el total salen de lo filtrado por fecha y cierran con las filas', () => {
  const f = leerFiltroDeFechas({ fdesde: '2026-09-01' })
  const enFechas = filtrarPorFechas(FILAS, f) // b, c
  assert.equal(recortar(enFechas, 'pendiente').length, 2)
  assert.equal(recortar(enFechas, 'cobrado').length, 0)
  assert.equal(recortar(enFechas, 'b').length, 1)
  const visibles = recortar(enFechas, 'todo')
  assert.equal(totalDeFilas(visibles), 600) // 200 + 400, ni la fila a ni la d
})

test('la solapa filtra ANTES de recortar y mide las cifras sobre lo mismo', () => {
  const ruta = fileURLToPath(new URL('../components/cobranzas/SolapaCobranzas.tsx', import.meta.url))
  const fuente = readFileSync(ruta, 'utf8')
  assert.match(fuente, /const enFechas = filtrarPorFechas\(filas, fechas\)[\s\S]*recortar\(enFechas, recorte\)/)
  assert.match(fuente, /recortar\(enFechas, '(pendiente|cobrado|b|n)'\)/)
})
