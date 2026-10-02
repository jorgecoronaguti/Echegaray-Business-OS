// LA COLUMNA DE SALDO CIERRA A LA VISTA — dueño, 02/10/2026, pagando la 2ª quincena de septiembre: «toda la columna
// de saldo en liq hs me la hiciste mal, calcula mal y me hiciste equivocar».
//
// Números REALES de la 2ª quincena de septiembre 2026 (leídos de la base el 02/10 con las funciones de la pantalla).
// En cada fila, lo que se ve tiene que cerrar: Importe − Pagado = Saldo por lado (tras la compensación), y
// Saldo banco + Saldo efectivo = Saldo total.
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · restar del efectivo la resta del recibo Q1 (Agüero: saldo 203.689,52 en vez de 333.270 − 75.000 = 258.270).
//   · que `restaDelEfectivo` devuelva null con banco 0 a mano (Tello: la celda volvería a 384.054).
//   · recortar los dos lados en 0 cuando en total cobró de más (Maldonado «0 · 0 · −446,92»).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pagoDeLaLinea, totalesDePago, type PagoDeLaLinea } from './pagoDeLaQuincena.ts'
import { conArrastre, restaDelEfectivo } from './liquidacionArrastre.ts'
import { negroDeLaFila } from './sueldoBlancoNegro.ts'
import { pagoDelMensual } from './liquidacionPorTipo.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

const pesos = (n: number | null) => n == null ? '—' : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** El importe del efectivo que DIBUJA la celda: el resultado de la resta si hay traslado, si no el negro del modelo. */
const importeEfectivoQueSeVe = (l: Pick<LineaConOverrides, 'pago' | 'sueldo'>): number | null =>
  restaDelEfectivo(l, pesos)?.resultado ?? l.sueldo?.negro ?? l.pago.negro

/** La fila cierra a la vista: por lado (con la compensación) y en total. */
function cierraALaVista(p: PagoDeLaLinea, importeEfectivo: number | null): void {
  assert.ok(p.banco != null && importeEfectivo != null && p.saldoBanco != null && p.saldoEfectivo != null && p.saldoTotal != null)
  const r2 = (n: number) => Math.round(n * 100) / 100
  assert.equal(r2(p.saldoBanco + p.saldoEfectivo), p.saldoTotal, 'saldo banco + saldo efectivo = saldo total')
  assert.equal(r2(p.banco + importeEfectivo), p.total, 'banco + importe efectivo que se ve = total')
  assert.equal(r2(p.banco - p.pagadoBanco + importeEfectivo - p.pagadoEfectivo), p.saldoTotal, 'importes − pagados = saldo total')
}

/** Una línea mínima con lo que `conArrastre` y la celda leen. */
function linea(e: { neto: number; negro: number; pagadoBanco: number; pagadoEfectivo: number; bancoManual?: boolean; cobra?: number }) {
  const porBanco = e.bancoManual ? 0 : e.neto
  const cobra = e.cobra ?? Math.round((e.neto + e.negro) * 100) / 100
  const sueldo = { negro: e.negro } as LineaConOverrides['sueldo']
  const manual = { porBanco: e.bancoManual === true } as LineaConOverrides['manual']
  const negro = negroDeLaFila({ netoMensual: null, cobra, porBanco, sueldo, manual })
  return {
    personaId: 'p', porBanco, enEfectivo: negro, cobra, manual, sueldo,
    pago: pagoDeLaLinea({ banco: porBanco, negro, pagadoBanco: e.pagadoBanco, pagadoEfectivo: e.pagadoEfectivo }),
  } as unknown as LineaConOverrides
}

// EL NEGRO NO SE MEZCLA CON LA QUINCENA ANTERIOR (dueño, 02/10/2026, sobre esta misma fila: «no me mezcles lo de la
// quincena pasada con esta en el negro … es valor hora por total de hs»; «la suma de q1 y q2 es solo del blanco»).
test('AGÜERO, CON RESTA DEL RECIBO Q1: el efectivo es 52,5 h × $6.348 = 333.270 y el saldo es 333.270 − 75.000 = 258.270', () => {
  const l = conArrastre(linea({ neto: 234963.32, negro: 333270, pagadoBanco: 289543.8, pagadoEfectivo: 75000 }),
    { importe: 54580.48, motivo: 'Resta recibo Q1', periodoOrigen: 'Q1-09/2026' })
  assert.equal(l.pago.banco, 289543.8, 'banco = neto del estudio + resta arrastrada: la suma es sólo del blanco')
  assert.equal(l.pago.saldoBanco, 0, 'pagar la resta por banco NO es un exceso')
  assert.equal(restaDelEfectivo(l, pesos), null, 'MUTACIÓN: restar la resta del efectivo vuelve a mezclar la quincena anterior en el negro')
  assert.equal(importeEfectivoQueSeVe(l), 333270)
  assert.equal(l.pago.negro, 333270)
  assert.equal(l.pago.saldoEfectivo, 258270, 'MUTACIÓN: 203.689,52 es el saldo que el dueño marcó como mal calculado')
  assert.equal(l.pago.total, 622813.8, 'banco con la resta + negro entero')
  cierraALaVista(l.pago, importeEfectivoQueSeVe(l))
})

test('TELLO JUAN, BANCO 0 A MANO Y $619.200 EN EFECTIVO: el importe del efectivo es el total y cobró de más $182,68 en efectivo', () => {
  const l = linea({ neto: 234963.32, negro: 384054, pagadoBanco: 0, pagadoEfectivo: 619200, bancoManual: true, cobra: 619017.32 })
  const r = restaDelEfectivo(l, pesos)
  assert.ok(r, 'MUTACIÓN: la celda volvería a 384.054 con un saldo calculado sobre 619.017,32')
  assert.equal(r.resultado, 619017.32)
  assert.equal(r.operandos, '384.054 + 234.963,32')
  assert.equal(l.pago.saldoBanco, 0)
  assert.equal(l.pago.saldoEfectivo, -182.68, 'MUTACIÓN: recortar en 0 esconde lo cobrado de más')
  assert.equal(l.pago.saldoTotal, -182.68)
  assert.deepEqual(l.pago.excedente, { lado: 'efectivo', importe: 182.68 })
  assert.equal(l.pago.aPagarEfectivo, 0, 'lo cobrado de más no se entrega')
  cierraALaVista(l.pago, importeEfectivoQueSeVe(l))
})

test('CASTILLO, EXCESO CHICO EN EFECTIVO (redondeo): el sobrante queda en el lado que lo cobró, no desaparece', () => {
  const p = pagoDeLaLinea({ banco: 243158.36, negro: 399924, pagadoBanco: 243158.36, pagadoEfectivo: 400200 })
  assert.equal(p.saldoBanco, 0)
  assert.equal(p.saldoEfectivo, -276, 'MUTACIÓN: «Saldo 0» con un total de −276 no cierra')
  assert.equal(p.saldoTotal, -276)
  cierraALaVista(p, p.negro)
})

test('ZOGBE, EXCESO EN EFECTIVO QUE EL BANCO ABSORBE: el banco baja de 45.371,41 a 45.031,41 y el efectivo queda en 0', () => {
  const p = pagoDeLaLinea({ banco: 234963.32, negro: 285660, pagadoBanco: 189591.91, pagadoEfectivo: 286000 })
  assert.equal(p.saldoBanco, 45031.41)
  assert.equal(p.saldoEfectivo, 0)
  assert.equal(p.aPagarBanco, 45031.41)
  cierraALaVista(p, p.negro)
})

test('MALDONADO, MENSUAL: banco pagado $1.391.446,92 y efectivo $1.109.000 → cobró de más $446,92 en efectivo', () => {
  const p = pagoDelMensual({
    cobra: 2500000, porBanco: 0, reciboNeto: 1391446.92, pagadoBanco: 1391446.92, pagadoEfectivo: 1109000,
    manual: { porBanco: false }, sello: null,
  })
  assert.equal(p.banco, 1391446.92)
  assert.equal(p.negro, 1108553.08)
  assert.equal(p.saldoBanco, 0)
  assert.equal(p.saldoEfectivo, -446.92, 'MUTACIÓN: recortar en 0 dejaba «0 · 0 · −446,92»')
  assert.equal(p.saldoTotal, -446.92)
  cierraALaVista(p, p.negro)
})

test('EL PIE SUMA LO QUE SE VE: saldo banco + saldo efectivo = saldo total también con quien cobró de más', () => {
  const filas = [
    pagoDeLaLinea({ banco: 243158.36, negro: 399924, pagadoBanco: 243158.36, pagadoEfectivo: 400200 }),
    pagoDeLaLinea({ banco: 234963.32, negro: 285660, pagadoBanco: 189591.91, pagadoEfectivo: 286000 }),
    conArrastre(linea({ neto: 234963.32, negro: 333270, pagadoBanco: 289543.8, pagadoEfectivo: 75000 }),
      { importe: 54580.48, motivo: 'Resta recibo Q1', periodoOrigen: 'Q1-09/2026' }).pago,
  ]
  const t = totalesDePago(filas)
  assert.equal(Math.round((t.saldoBanco + t.saldoEfectivo) * 100) / 100, t.saldoTotal)
  assert.equal(t.saldoTotal, Math.round((-276 + 45031.41 + 258270) * 100) / 100)
})
