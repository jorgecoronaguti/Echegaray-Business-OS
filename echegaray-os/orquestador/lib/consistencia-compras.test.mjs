import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pagadasSinMonto, pagadasIncompletas, segundaCuotaFueraDeMes, mes, resumen } from './consistencia-compras.mjs'

test('detecta la fila que dice Pagado y no dice cuánto', () => {
  // El caso masivo: 128 filas reales así. Si el cash flow leyera "Monto Pagado" en vez del total,
  // esas compras desaparecerían del cuadro.
  const f = [{ fila: 215, total: 1031799, pagado: 0, estado: 'Pagado' }]
  assert.equal(pagadasSinMonto(f).length, 1)
  assert.equal(pagadasIncompletas(f).length, 0, 'no hay monto que contradiga: falta el monto')
})

test('separa "falta el dato" de "el dato contradice"', () => {
  // Fila 741 real: facturado $1.000.000, pagado $500.000, marcada Pagado.
  const f = [{ fila: 741, total: 1000000, pagado: 500000, estado: 'Pagado' }]
  assert.equal(pagadasSinMonto(f).length, 0)
  assert.equal(pagadasIncompletas(f).length, 1)
  assert.equal(resumen(f).faltaPorPagar, 500000)
})

test('una compra pagada entera no es un hallazgo', () => {
  const f = [{ fila: 10, total: 500, pagado: 500, estado: 'Pagado' }]
  assert.equal(resumen(f).sinMonto, 0)
  assert.equal(resumen(f).incompletas, 0)
})

test('una compra que NO dice Pagado no se controla por monto', () => {
  // Una compra pendiente sin monto pagado es exactamente lo esperable.
  const f = [{ fila: 11, total: 900, pagado: 0, estado: 'Pendiente' }]
  assert.equal(pagadasSinMonto(f).length, 0)
})

test('la segunda cuota sólo es un error si cae en OTRO mes', () => {
  const mismoMes = [{ fila: 5, tipoPago: 'Parcial', cuota2: 300, fechaCaja: '05/03/2026', fecha2: '20/03/2026' }]
  assert.equal(segundaCuotaFueraDeMes(mismoMes).length, 0, 'el cuadro es mensual: no se equivoca')
  const otroMes = [{ fila: 6, tipoPago: 'Parcial', cuota2: 300, fechaCaja: '05/03/2026', fecha2: '20/04/2026' }]
  assert.equal(segundaCuotaFueraDeMes(otroMes).length, 1)
  assert.equal(resumen(otroMes).montoCuota2, 300)
})

test('un parcial sin segunda cuota cargada no se cuenta', () => {
  const f = [{ fila: 7, tipoPago: 'Parcial', cuota2: 0, fechaCaja: '05/03/2026', fecha2: '20/04/2026' }]
  assert.equal(segundaCuotaFueraDeMes(f).length, 0)
})

test('mes lee los formatos que llegan del Sheet es-AR', () => {
  assert.equal(mes('7/4/2026'), '2026-04', 'dd/mm: el 7/4 es abril, no julio')
  assert.equal(mes('07/04/26'), '2026-04')
  assert.equal(mes(new Date('2026-04-07T00:00:00Z')), '2026-04')
  assert.equal(mes('2026-04-07'), '2026-04')
  assert.equal(mes(''), '')
  assert.equal(mes('Pendiente'), '', 'la columna a veces trae texto, no una fecha')
})
