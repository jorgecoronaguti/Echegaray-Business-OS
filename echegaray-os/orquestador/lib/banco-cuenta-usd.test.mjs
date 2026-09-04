// EL CASO REAL: el saldo en dólares estuvo 29 días viejo y el extracto ya tenía con qué corregirlo.
//
// El dueño mandó el 03/09 la captura del homebanking —U$S 507,53— y el OS siguió publicando
// U$S 981,39 del 05/08 hasta que él lo reclamó al día siguiente. Estas líneas del extracto EN PESOS
// son las del 01/09/2026, copiadas tal cual: bastaban para saberlo sin la captura.

import test from 'node:test'
import assert from 'node:assert/strict'
import { operacionesUsdDelExtracto, saldoUsdDerivado, desvioDelSaldoUsd, CUENTA_USD } from './banco-cuenta-usd.mjs'

const EXTRACTO = [
  { fecha: '2026-08-28', concepto: 'Comision servicio cuenta dolares' },
  { fecha: '2026-09-01', concepto: 'Impuesto ley 25.413 credito 0,6% - Cta orig: 179-091384/3 - base impo. usd            71,13' },
  { fecha: '2026-09-01', concepto: 'Impuesto ley 25.413 debito 0,6% - Cta orig: 179-091384/3 - base impo. usd           544,99' },
  { fecha: '2026-09-02', concepto: 'Transferencia recibida - Manufacturas' },
]

test('el extracto de pesos delata las operaciones de la cuenta en dólares', () => {
  const ops = operacionesUsdDelExtracto(EXTRACTO)
  assert.equal(ops.length, 2, 'sólo las dos del 25.413; la comisión de servicio no declara base en usd')
  assert.deepEqual(ops.map((o) => [o.signo, o.usd]), [[1, 71.13], [-1, 544.99]])
})

test('deriva el saldo del 03/09 partiendo del declarado del 05/08 — y da el de la captura', () => {
  // 981,39 − 544,99 + 71,13 = 507,53. Es el número exacto que el dueño leyó en el homebanking.
  const r = saldoUsdDerivado({ saldo: 981.39, corte: '2026-08-05' }, EXTRACTO)
  assert.equal(r.saldo, 507.53)
  assert.equal(r.corte, '2026-09-01')
})

test('no vuelve a aplicar lo que ya está adentro del saldo declarado', () => {
  // El doble conteo es el modo de falla caro acá: aplicar dos veces el débito de U$S 544,99 deja la
  // cuenta en 37,46 y CAJA publicaría $1,4M menos sin un solo error a la vista.
  const r = saldoUsdDerivado({ saldo: 507.53, corte: '2026-09-01' }, EXTRACTO)
  assert.equal(r.saldo, 507.53, 'con el corte al día no hay nada que aplicar')
})

test('los miles con punto no se comen los decimales (es_AR)', () => {
  const r = operacionesUsdDelExtracto([
    { fecha: '2026-08-05', concepto: 'Impuesto ley 25.413 debito 0,6% - Cta orig: 179-091384/3 - base impo. usd        15.000,00' },
  ])
  assert.equal(r[0].usd, 15000, 'leerlo como 15,00 pondría la cuenta mil veces por debajo')
})

test('el control PUEDE dar rojo: un saldo que dejó de cerrar se ve', () => {
  // Sin este lado, el control sería una constante que siempre dice que sí.
  const ok = desvioDelSaldoUsd({ saldo: 981.39, corte: '2026-08-05' }, 507.53, EXTRACTO)
  assert.equal(ok.desvio, 0)
  const mal = desvioDelSaldoUsd({ saldo: 981.39, corte: '2026-08-05' }, 981.39, EXTRACTO)
  assert.equal(mal.desvio, -473.86, 'exactamente lo que el saldo viejo tenía de más')
})

test('una operación de OTRA cuenta no toca la de dólares', () => {
  assert.deepEqual(operacionesUsdDelExtracto([
    { fecha: '2026-09-01', concepto: 'Impuesto ley 25.413 debito 0,6% - Cta orig: 179-091383/6 - base impo. usd 100,00' },
  ]), [], `sólo la ${CUENTA_USD}`)
})
