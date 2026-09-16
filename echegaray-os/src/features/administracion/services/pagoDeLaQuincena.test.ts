// LOS SALDOS DE LA QUINCENA, CON TRES PERSONAS REALES DE LA 1ª DE SEPTIEMBRE DE 2026.
//
// Dueño, 15/09/2026: «no considera adelantos en efectivo y resta del efectivo total; está pésimo».
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · tratar el adelanto en efectivo como un descuento del total en vez de como un pago.
//   · dejar el exceso de un lado encerrado ahí (a González Tobares le seguiría faltando el banco entero).
//   · netear el exceso y esconder el saldo negativo del lado que cobró de más.
//   · sumar como 0 una fila sin negro en el pie.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoDeExcedente, pagoDeLaLinea, totalesDePago } from './pagoDeLaQuincena.ts'

// Las tres filas de la 1–15/09/2026 que el dueño usa para verificar.
const AGUERO = { banco: 249857.28, negro: 341971 }
const GONZALEZ = { banco: 212504.63, negro: 133650 }
const ZOGBE = { banco: 249857.28, negro: 284352 }

test('SIN UN PESO PAGADO, LO QUE HAY QUE PAGAR ES EL BANCO Y EL NEGRO', () => {
  const p = pagoDeLaLinea(AGUERO)
  assert.equal(p.total, 591828.28)
  assert.equal(p.pagado, 0)
  assert.equal(p.saldoBanco, 249857.28)
  assert.equal(p.saldoEfectivo, 341971)
  assert.equal(p.saldoTotal, 591828.28)
  assert.equal(p.aPagarBanco, 249857.28)
  assert.equal(p.aPagarEfectivo, 341971)
  assert.equal(p.excedente, null)
})

test('EL ADELANTO EN EFECTIVO ES UN PAGO, Y LO COBRADO DE MÁS PASA AL BANCO', () => {
  // González Tobares Emiliano: adelanto en efectivo 140.000 contra un negro de 133.650.
  const p = pagoDeLaLinea({ ...GONZALEZ, pagadoEfectivo: 140000 })
  assert.equal(p.pagadoEfectivo, 140000)
  // Dueño 16/09: «si digo que se le pagó el 100 % por un lado me marca que debo del otro»: el saldo por lado ya
  // viene COMPENSADO. El bruto (−6.350) sigue publicado aparte, para explicar de dónde sale la resta.
  assert.equal(p.saldoEfectivoBruto, -6350, 'el bruto del lado que cobró de más se PUBLICA, no se esconde')
  assert.equal(p.saldoEfectivo, 0, 'MUTACIÓN: mostrar el bruto negativo como saldo del lado')
  assert.equal(p.saldoBanco, 206154.63, 'MUTACIÓN: no descontar el exceso del efectivo del saldo del banco')
  assert.equal(p.saldoTotal, 206154.63, 'MUTACIÓN: restar el adelanto del total dos veces')
  assert.equal(p.aPagarEfectivo, 0, 'no se le entrega nada en mano: ya cobró de más')
  assert.equal(p.aPagarBanco, 206154.63, 'MUTACIÓN: dejar el exceso encerrado en el efectivo daría 212.504,63')
  assert.equal(p.excedente, null, 'no cobró de más en TOTAL: no hay ámbar')
  assert.deepEqual(p.absorbido, { lado: 'efectivo', importe: 6350 })
  assert.equal(avisoDeExcedente(p), 'pagado de más por efectivo: $6.350 se descuentan del banco')
})

test('PAGADO EL 100 % POR UN SOLO LADO: los dos saldos en 0, nada en ámbar (dueño 16/09)', () => {
  // Agüero cobra todo en mano: 591.828,28 en efectivo.
  const p = pagoDeLaLinea({ ...AGUERO, pagadoEfectivo: 591828.28 })
  assert.equal(p.saldoEfectivo, 0)
  assert.equal(p.saldoBanco, 0, 'MUTACIÓN: dejar «debe 249.857,28 por banco» con el total ya pagado')
  assert.equal(p.saldoTotal, 0)
  assert.equal(p.excedente, null)
  assert.deepEqual(p.absorbido, { lado: 'efectivo', importe: 249857.28 })
  // Todo por transferencia.
  const q = pagoDeLaLinea({ ...AGUERO, pagadoBanco: 591828.28 })
  assert.equal(q.saldoBanco, 0); assert.equal(q.saldoEfectivo, 0); assert.equal(q.saldoTotal, 0); assert.equal(q.excedente, null)
})

test('COBRÓ DE MÁS EN TOTAL: el excedente se publica en ámbar sobre el lado que más se pasó', () => {
  const p = pagoDeLaLinea({ ...AGUERO, pagadoEfectivo: 600000 })
  assert.equal(p.saldoTotal, -8171.72)
  assert.equal(p.saldoEfectivo, 0); assert.equal(p.saldoBanco, 0)
  assert.deepEqual(p.excedente, { lado: 'efectivo', importe: 8171.72 })
  assert.equal(p.absorbido, null)
})

test('LO YA TRANSFERIDO ES PAGADO POR BANCO Y BAJA SÓLO ESE SALDO', () => {
  // Zogbe: 94.795,50 girados antes del lote.
  const p = pagoDeLaLinea({ ...ZOGBE, pagadoBanco: 94795.5 })
  assert.equal(p.saldoBanco, 155061.78)
  assert.equal(p.saldoEfectivo, 284352)
  assert.equal(p.aPagarBanco, 155061.78)
  assert.equal(p.aPagarEfectivo, 284352, 'el banco pagado no toca el efectivo mientras no haya exceso')
  assert.equal(p.saldoTotal, 439413.78)
})

test('EL EXCESO DEL BANCO TAMBIÉN PASA AL EFECTIVO', () => {
  const p = pagoDeLaLinea({ banco: 100000, negro: 50000, pagadoBanco: 130000 })
  assert.equal(p.saldoBancoBruto, -30000)
  assert.equal(p.saldoBanco, 0, 'compensado: el lado pagado de más no «debe»')
  assert.equal(p.aPagarBanco, 0)
  assert.equal(p.saldoEfectivo, 20000)
  assert.equal(p.aPagarEfectivo, 20000)
  assert.equal(p.excedente, null, 'en total no cobró de más')
  assert.deepEqual(p.absorbido, { lado: 'banco', importe: 30000 })
  assert.equal(avisoDeExcedente(p), 'pagado de más por banco: $30.000 se descuentan del efectivo')
})

test('PAGADO DE MÁS EN TOTAL: NO HAY NADA QUE PAGAR Y EL SALDO QUEDA NEGATIVO', () => {
  const p = pagoDeLaLinea({ banco: 100000, negro: 50000, pagadoBanco: 120000, pagadoEfectivo: 60000 })
  assert.equal(p.saldoTotal, -30000)
  assert.equal(p.aPagarBanco, 0)
  assert.equal(p.aPagarEfectivo, 0)
})

test('SIN NEGRO NO HAY SALDO QUE AFIRMAR: NULL, NUNCA CERO', () => {
  const p = pagoDeLaLinea({ banco: 200000, negro: null, pagadoBanco: 50000 })
  assert.equal(p.negro, null)
  assert.equal(p.total, null)
  assert.equal(p.saldoTotal, null)
  assert.equal(p.saldoEfectivo, null)
  assert.equal(p.aPagarEfectivo, null, 'MUTACIÓN: un 0 acá diría «no le falta nada»')
  assert.equal(p.saldoBanco, 150000, 'el lado que SÍ se puede afirmar se afirma')
})

test('EL PIE SUMA COLUMNA POR COLUMNA Y CUENTA LO QUE NO PUDO SUMAR', () => {
  const t = totalesDePago([
    pagoDeLaLinea(AGUERO),
    pagoDeLaLinea({ ...GONZALEZ, pagadoEfectivo: 140000 }),
    pagoDeLaLinea({ ...ZOGBE, pagadoBanco: 94795.5 }),
    pagoDeLaLinea({ banco: 300000, negro: null }),
  ])
  assert.equal(t.banco, 712219.19)
  assert.equal(t.negro, 759973)
  assert.equal(t.total, 1472192.19)
  assert.equal(t.pagadoBanco, 94795.5)
  assert.equal(t.pagadoEfectivo, 140000)
  assert.equal(t.pagado, 234795.5)
  assert.equal(t.saldoTotal, 1237396.69)
  assert.equal(t.saldoBanco + t.saldoEfectivo, t.saldoTotal)
  assert.equal(t.aPagarEfectivo, 626323)
  assert.equal(t.aPagarBanco, 611073.69)
  assert.equal(t.sinSaldo, 1, 'MUTACIÓN: sumar la fila sin negro como 0 daría un pie que parece completo')
  assert.equal(t.aPagarEfectivo + t.aPagarBanco, t.saldoTotal,
    'lo que se pide pagar hoy es exactamente el saldo: ni un peso de más ni de menos')
})
