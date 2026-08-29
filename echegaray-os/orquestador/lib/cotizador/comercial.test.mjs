// LA CASCADA ES LA DEL LIBRO, EL COEFICIENTE ES DERIVADO, Y EL CALCULADO NO SE PIERDE.
//
// El caso de referencia es el verificado en la migración 20260821T4300 contra el XLSM real:
// coeficiente 1,68197 sin IVA y 2,03518 con IVA con los ocho parámetros vigentes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  politicaComercial, overrideDeQuote, indirectos, cascada, coeficienteDe,
  rechazarEscrituraDeCoeficiente, PARAMETROS, esNormativo,
} from './comercial.mjs'
import { ESTADO, TIPO_ISSUE } from './contrato.mjs'

const VIGENTE = politicaComercial({
  version: 1, origen: 'GLOBAL',
  fuente: 'Planilla para Cotizar (2).xlsm · hoja Presupuesto B62:H89',
  pctGastosGenerales: 0.27, pctBeneficio: 0.22, pctFinanciero: 0.07, factorFinanciero: 0.5,
  pctIibb: 0.024, pctGanancias: 0.02, pctCheque: 0.012, pctIva: 0.21,
})

test('el coeficiente de la empresa es 1,681968 sin IVA y 2,035181 con IVA', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `cascada`, aplicar el beneficio sobre el costo directo en vez de
  // sobre el costo industrial. Es la cascada «razonable» que publicaba 1,4287 y regalaba 18 puntos.
  //
  // El valor NO se copió de la salida del código: se rehízo a mano desde el libro, escalón por
  // escalón, y por eso este test puede decir que el código está mal.
  //   (1+0,22) × (1+0,024+0,02) = 1,22 × 1,044       = 1,27368
  //   + 0,07 × 0,5 (financiero, medio período)       = 1,30868
  //   × (1+0,27) gastos generales                    = 1,6620236
  //   × (1+0,012) impuesto al cheque                 = 1,681967883 → 1,681968
  //   × 1,21 IVA                                     = 2,035181138 → 2,035181
  // La migración 20260821T4300 lo escribe como «1,68197»: es el mismo número a 5 decimales.
  const c = cascada({ costoDirecto: 100_000_000, politica: VIGENTE })
  assert.equal(c.coeficienteSinIva, 1.681968)
  assert.equal(c.coeficienteConIva, 2.035181)
  assert.equal(coeficienteDe(VIGENTE), 1.681968, 'la forma cerrada da lo mismo que la cascada')
  assert.equal(c.ventaSinIva, 168_196_788.32, 'y sobre $100 M de costo directo, la venta sin IVA')
})

test('los porcentajes NO se suman linealmente: hay tres bases distintas', () => {
  const suma = 0.27 + 0.22 + 0.07 * 0.5 + 0.024 + 0.02 + 0.012
  assert.notEqual(Math.round((1 + suma) * 100000) / 100000, coeficienteDe(VIGENTE))
  assert.ok(coeficienteDe(VIGENTE) > 1 + suma, 'la composición en cascada da MÁS que la suma')
})

test('BENEFICIO ≠ MARGEN: el markup sobre costo y el margen sobre precio son dos números', () => {
  const c = cascada({ costoDirecto: 100_000_000, politica: VIGENTE })
  assert.equal(VIGENTE.pctBeneficio * 100, 22)
  assert.ok(c.margenSobrePrecioPct < 22, 'el margen sobre precio siempre da menos que el markup')
  assert.equal(c.margenSobrePrecioPct, 16.61)
})

test('COST ≠ PRICE — y sin costo directo NO hay cascada de ceros', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `cascada`, `const cd = Number(costoDirecto) || 0`.
  const c = cascada({ costoDirecto: null, politica: VIGENTE })
  assert.equal(c.ventaFinal, null)
  assert.notEqual(c.ventaFinal, 0, '«vale $0» y «no se puede calcular» son cosas distintas en una pantalla')
  assert.equal(c.coeficienteSinIva, null)
  assert.equal(c.estado, ESTADO.FALTA_DATO)
  assert.match(c.porQue, /NO es cero: es desconocido/)
})

test('EL COEFICIENTE ES DERIVADO: no existe campo que escribir, y el rechazo dice qué sí se puede', () => {
  const c = cascada({ costoDirecto: 1_000_000, politica: VIGENTE })
  assert.equal(Object.isFrozen(c), true)
  assert.throws(() => { c.coeficienteSinIva = 2.5 }, TypeError)
  const r = rechazarEscrituraDeCoeficiente('coeficiente')
  assert.equal(r.ok, false)
  assert.ok(r.componentes.includes('pctBeneficio'))
  assert.equal(r.componentes.includes('pctIva'), false, 'el IVA es normativo: no está entre lo que se negocia')
  assert.equal(rechazarEscrituraDeCoeficiente('pctBeneficio'), null)
})

test('un override de quote guarda el valor anterior y quién lo autorizó', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `overrideDeQuote`, sacar la llave `sustituye`.
  const nueva = overrideDeQuote({ base: VIGENTE, parametro: 'pctBeneficio', valor: 0.19, autorizadoPor: 'jorge', motivo: 'para ganar la licitación' })
  assert.equal(nueva.pctBeneficio, 0.19)
  assert.equal(nueva.origen, 'QUOTE')
  assert.equal(nueva.version, 2)
  assert.equal(nueva.sustituye.valorAnterior, 0.22)
  assert.equal(nueva.sustituye.autorizadoPor, 'jorge')
  assert.equal(VIGENTE.pctBeneficio, 0.22, 'y la política GLOBAL no se movió (§17)')
})

test('el IVA no se negocia por cotización', () => {
  assert.equal(esNormativo('pctIva'), true)
  assert.throws(() => overrideDeQuote({ base: VIGENTE, parametro: 'pctIva', valor: 0.105, autorizadoPor: 'jorge' }), /NORMATIVO/)
})

test('un override sin quién lo autorizó, o sobre un parámetro inventado, no se construye', () => {
  assert.throws(() => overrideDeQuote({ base: VIGENTE, parametro: 'pctBeneficio', valor: 0.19 }), /sin quién lo autorizó/)
  assert.throws(() => overrideDeQuote({ base: VIGENTE, parametro: 'pctSuerte', valor: 1, autorizadoPor: 'x' }), /no es un parámetro/)
  assert.throws(() => overrideDeQuote({ base: VIGENTE, parametro: 'pctBeneficio', valor: -0.1, autorizadoPor: 'x' }), /no es un porcentaje/)
})

test('una política sin fuente, o con un porcentaje que no es número, no se construye', () => {
  assert.throws(() => politicaComercial({ ...VIGENTE, fuente: null }), /sin fuente/)
  assert.throws(() => politicaComercial({ ...VIGENTE, pctBeneficio: 'mucho' }), /no es un porcentaje/)
  assert.equal(PARAMETROS.length, 8)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INDIRECTOS (§16)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el CALCULADO no se pierde cuando alguien aplica otro número', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `indirectos`, `override: null` en la rama con `aplicado`.
  const i = indirectos({
    conceptos: [{ concepto: 'sueldos de oficina', montoAnual: 240_000_000 }, { concepto: 'alquiler', montoAnual: 30_000_000 }],
    costoDirectoAnual: 1_000_000_000,
    aplicado: 0.27, motivoOverride: 'redondeo a mano del 26,98 % que calcula la hoja GG',
  })
  assert.equal(i.calculado, 0.27)
  assert.equal(i.aplicado, 0.27)
  assert.equal(i.override.valorCalculado, 0.27)
  assert.equal(i.estado, ESTADO.CONFIRMADO)
})

test('«GG = 27 %» a secas no dice si se calculó o se tipeó — y acá se distingue', () => {
  const tipeado = indirectos({ aplicado: 0.27 })
  assert.equal(tipeado.calculado, null)
  assert.equal(tipeado.aplicado, 0.27)
  assert.match(tipeado.porQue, /es una decisión, no un cálculo/)

  const calculado = indirectos({ conceptos: [{ concepto: 'estructura', montoAnual: 100 }], costoDirectoAnual: 500 })
  assert.equal(calculado.calculado, 0.2)
  assert.equal(calculado.override, null, 'sin override no se inventa uno')
  assert.equal(calculado.estado, ESTADO.CALCULADO)
})

test('sin estructura declarada el indirecto calculado es NULL, nunca cero', () => {
  // MUTACIÓN QUE LO PONE ROJO: `const calculado = hayEstructura ? ... : 0`.
  const i = indirectos({})
  assert.equal(i.calculado, null)
  assert.notEqual(i.calculado, 0, 'un indirecto de cero significaría que la empresa no tiene estructura')
  assert.equal(i.estado, ESTADO.FALTA_DATO)
  assert.equal(i.issues[0].type, TIPO_ISSUE.FALTA_DATO)
})

test('un concepto de indirectos SIN MONTO no vale cero: baja el GG 5 puntos sin avisar', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `indirectos`, volver a `(Number(c.montoAnual) || 0)`.
  //
  // Medido por la auditoría adversarial: la estructura declaraba seis conceptos, uno sin monto, y
  // el porcentaje se calculaba sobre cinco. Cinco puntos menos de gastos generales, sin un issue.
  const i = indirectos({
    conceptos: [
      { concepto: 'sueldos de oficina', montoAnual: 240_000_000 },
      { concepto: 'alquiler', montoAnual: null },
    ],
    costoDirectoAnual: 1_000_000_000,
  })
  assert.equal(i.calculado, null, 'el porcentaje NO se calcula sobre los que sí declaran')
  assert.notEqual(i.calculado, 0.24)
  assert.equal(i.estado, ESTADO.FALTA_DATO)
  assert.equal(i.issues.length, 1)
  assert.match(i.issues[0].detalle, /conceptos sin monto anual: alquiler/)
  assert.match(i.porQue, /NO se calcula sobre los que sí lo declaran/)
})
