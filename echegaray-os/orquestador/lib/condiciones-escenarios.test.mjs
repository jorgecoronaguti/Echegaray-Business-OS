// LOS 8 ESCENARIOS REALES de decisión financiera (spec del dueño, 24/07). Prueban el motor puro
// (compararFinanciamiento/priorizarPagos) alimentado con los PARÁMETROS que produce la capa de
// condiciones (paramsParaMotor). No tocan la DB: usan condiciones fijas que replican la fuente única,
// para que el test sea determinístico. La integración con la DB real se verifica en la corrida en vivo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararFinanciamiento, priorizarPagos } from './ingenieria-financiera.mjs'
import { paramsParaMotor } from './condiciones-financieras.mjs'

// Réplica de la fuente única sembrada (valores reales verificados).
const CONDICIONES = [
  { entidad: 'Banco Santander', producto: 'Acuerdo N°00007', tipo_financiacion: 'descubierto', tna: 0.55, iva_sobre_intereses: 0.12, limite_disponible: 18200000, saldo_utilizado: 0 },
  // Prendario REAL: tasa verificada 38,9% pero YA DESEMBOLSADO (limite_disponible 0) → se registra,
  // no se ofrece como línea nueva.
  { entidad: 'Banco Santander', producto: 'Préstamo prendario', tipo_financiacion: 'prestamo', tna: 0.389, limite_disponible: 0, observaciones: 'obligación en curso, no una línea disponible' },
  { entidad: 'Banco Santander', producto: 'Tarjeta', tipo_financiacion: 'tarjeta', tna: null, observaciones: 'TNA de cuotas en el resumen' },
]
const base = () => paramsParaMotor(CONDICIONES).params

test('1 · bache de pocos días: el descubierto cubre y es la vía factible con costo conocido', () => {
  const r = compararFinanciamiento({ ...base(), monto: 3000000, dias: 5, cajaLibre: 0 })
  const desc = r.alternativas.find((a) => a.via === 'descubierto')
  assert.equal(desc.factible, true) // 3M < 18,2M disponible
  assert.ok(desc.costoFinanciero > 0)
  assert.ok(['descubierto', 'esperar'].includes(r.recomendada.via))
})

test('2 · descubierto vs descuento de cheque: sin la tasa del cheque, gana el descubierto y se pide la tasa', () => {
  const { params, faltan } = paramsParaMotor(CONDICIONES)
  const r = compararFinanciamiento({ ...params, monto: 2000000, dias: 20, cajaLibre: 0 })
  const chq = r.alternativas.find((a) => a.via === 'descuento_cheque')
  assert.equal(chq.costoFinanciero, null) // no se inventa
  assert.match(chq.nota, /FALTA la tasa/)
  // la capa además declara los productos que SÍ existen pero no tienen tasa (préstamo, tarjeta),
  // cada uno con de dónde sacarla — no se inventan.
  assert.ok(faltan.length >= 1 && faltan.every((f) => f.para_conseguirlo))
})

test('2b · con la tasa del cheque cargada, el motor la compara de verdad', () => {
  const conTasa = [...CONDICIONES, { entidad: 'Santander', producto: 'Descuento', tipo_financiacion: 'descuento_cheque', tna: 0.45 }]
  // El pago vence: no se puede esperar gratis (multa alta). Así la comparación es entre las dos vías
  // de financiación, que es el punto del escenario.
  const r = compararFinanciamiento({ ...paramsParaMotor(conTasa).params, monto: 2000000, dias: 20, cajaLibre: 0, multaEspera: 1000000 })
  const chq = r.alternativas.find((a) => a.via === 'descuento_cheque')
  assert.ok(chq.costoFinanciero > 0)
  // el descuento al 45% es más barato que el descubierto al 55%+IVA → debería ganar
  assert.equal(r.recomendada.via, 'descuento_cheque')
})

test('3 · préstamo vs descubierto para un bache breve: el prendario está desembolsado, no se ofrece', () => {
  const r = compararFinanciamiento({ ...base(), monto: 5000000, dias: 7, cajaLibre: 0 })
  // el único préstamo es una obligación en curso (sin línea disponible) → no es alternativa para el bache
  assert.notEqual(r.recomendada?.via, 'prestamo')
})

test('4 · proveedor con descuento por pronto pago: pagar ya puede convenir', () => {
  const r = compararFinanciamiento({ ...base(), monto: 1000000, dias: 30, cajaLibre: 5000000, descuentoProntoPago: 0.10 })
  // el ahorro (10% = 100k) supera el costo de oportunidad → conviene pagar con caja (costo económico negativo)
  assert.equal(r.recomendada.via, 'saldo_propio')
  assert.ok(r.recomendada.costoEconomico < 0)
})

test('5 · proveedor crítico que admite pago parcial: priorizar reparte la caja y no paga a ciegas', () => {
  const pagos = priorizarPagos([
    { proveedor: 'Crítico obra', monto: 3000000, dias_a_vencer: 2, criticidad: 'critico' },
    { proveedor: 'Normal', monto: 3000000, dias_a_vencer: 20, criticidad: 'normal' },
  ], { cajaDisponible: 3500000 })
  const critico = pagos.find((p) => p.proveedor === 'Crítico obra')
  assert.equal(critico.decision, 'pagar') // el crítico entra primero
  const normal = pagos.find((p) => p.proveedor === 'Normal')
  assert.ok(['parcial', 'esperar'].includes(normal.decision)) // lo que sobra o nada
})

test('6 · alternativa sin tasa: se compara lo que sí tiene dato y se declara lo que falta', () => {
  const { faltan } = paramsParaMotor(CONDICIONES)
  assert.ok(faltan.length >= 1) // la tarjeta sigue sin TNA de cuotas
  assert.ok(faltan.some((f) => f.tipo === 'tarjeta'))
  for (const f of faltan) assert.ok(f.para_conseguirlo, 'cada faltante dice de dónde sacarlo')
})

test('7 · cobranza esperada que se demora: esperar tiene costo si hay multa/mora', () => {
  const r = compararFinanciamiento({ ...base(), monto: 2000000, dias: 15, cajaLibre: 0, multaEspera: 500000 })
  const esperar = r.alternativas.find((a) => a.via === 'esperar')
  assert.equal(esperar.costoFinanciero, 500000)
  // con una multa alta, esperar no debería ser la recomendada frente al descubierto
  assert.notEqual(r.recomendada.via, 'esperar')
})

test('8 · línea insuficiente: el descubierto se marca NO factible si el monto supera el disponible', () => {
  const chico = [{ ...CONDICIONES[0], limite_disponible: 1000000 }]
  const r = compararFinanciamiento({ ...paramsParaMotor(chico).params, monto: 5000000, dias: 10, cajaLibre: 0 })
  const desc = r.alternativas.find((a) => a.via === 'descubierto')
  assert.equal(desc.factible, false) // 5M > 1M disponible
})
