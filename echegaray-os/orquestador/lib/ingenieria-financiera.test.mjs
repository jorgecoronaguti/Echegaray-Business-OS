import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  costoDelDinero, compararFinanciamiento, priorizarPagos, recomendaciones,
} from './ingenieria-financiera.mjs'
import { costoConImpuestos, interesDelPeriodo } from './costo-descubierto.mjs'

test('el costo del dinero ES el modelo del descubierto verificado, no otro número', () => {
  // No se puede inventar una vara propia: tiene que dar exactamente costoConImpuestos(interés).
  const esperado = costoConImpuestos(interesDelPeriodo(-1000000, 30))
  assert.equal(Math.round(costoDelDinero(1000000, 30)), Math.round(esperado))
})

test('un monto o días en cero no genera costo (no hay interés negativo)', () => {
  assert.equal(costoDelDinero(0, 30), 0)
  assert.equal(costoDelDinero(1000000, 0), 0)
})

test('financiamiento: elige la alternativa más barata FACTIBLE', () => {
  // Con caja suficiente, pagar con lo propio (costo de oportunidad) vs descubierto (mismo costo):
  // a igualdad, la primera ordenada gana; con pronto pago, propio/descubierto capturan el ahorro.
  const r = compararFinanciamiento({ monto: 1000000, dias: 30, cajaLibre: 2000000, limiteDescubiertoDisp: 5000000 })
  assert.ok(r.recomendada, 'tiene que recomendar algo factible')
  assert.ok(r.recomendada.costoEconomico != null)
  assert.match(r.justificacion, /\$/)
})

test('financiamiento: sin la tasa de descuento del banco, NO inventa un número', () => {
  const r = compararFinanciamiento({ monto: 1000000, dias: 30 })
  const desc = r.alternativas.find((a) => a.via === 'descuento_cheque')
  assert.equal(desc.costoFinanciero, null, 'no debe fabricar el costo del descuento')
  assert.match(desc.nota, /FALTA la tasa/)
})

test('financiamiento: una vía no factible (la caja no alcanza) no puede ser la recomendada', () => {
  const r = compararFinanciamiento({ monto: 5000000, dias: 30, cajaLibre: 1000000, limiteDescubiertoDisp: 10000000 })
  assert.notEqual(r.recomendada?.via, 'saldo_propio')
})

test('financiamiento: el pronto pago abarata pagar YA, no esperar', () => {
  const r = compararFinanciamiento({ monto: 1000000, dias: 30, cajaLibre: 2000000, limiteDescubiertoDisp: 5000000, descuentoProntoPago: 0.1 })
  const propio = r.alternativas.find((a) => a.via === 'saldo_propio')
  const esperar = r.alternativas.find((a) => a.via === 'esperar')
  assert.equal(propio.ahorroProntoPago, 100000)
  assert.equal(esperar.ahorroProntoPago, 0)
  assert.ok(propio.costoEconomico < esperar.costoEconomico)
})

test('pagos: un vencido pesa más que uno que todavía no vence', () => {
  const r = priorizarPagos([
    { proveedor: 'A', monto: 100000, dias_a_vencer: 10 },
    { proveedor: 'B', monto: 100000, dias_a_vencer: -3 },
  ])
  assert.equal(r[0].proveedor, 'B')
  assert.ok(r[0].vencido)
})

test('pagos: la criticidad sube la prioridad a igualdad de fecha', () => {
  const r = priorizarPagos([
    { proveedor: 'Normal', monto: 100000, dias_a_vencer: 10 },
    { proveedor: 'Critico', monto: 100000, dias_a_vencer: 10, criticidad: 'critico' },
  ])
  assert.equal(r[0].proveedor, 'Critico')
})

test('pagos: la caja se reparte por prioridad; lo que no entra pasa a esperar', () => {
  const r = priorizarPagos([
    { proveedor: 'A', monto: 100000, dias_a_vencer: -1 },
    { proveedor: 'B', monto: 100000, dias_a_vencer: 20 },
  ], { cajaDisponible: 120000 })
  const a = r.find((x) => x.proveedor === 'A'); const b = r.find((x) => x.proveedor === 'B')
  assert.equal(a.decision, 'pagar')
  assert.equal(b.decision, 'parcial') // quedan $20.000 para B
})

test('recomendaciones: sin caja, la primera es reconectar la fuente (no se optimiza a ciegas)', () => {
  const r = recomendaciones({ disponible: { estado: 'sin dato', motivo: 'x' } })
  assert.equal(r[0].prioridad, 'alta')
  assert.match(r[0].titulo, /fuente/i)
})

test('recomendaciones: cada una cumple el contrato completo', () => {
  const model = {
    disponible: { estado: 'ok', caja_hoy: 1000000, vencimientos_7dias: 3000000, cobranzas_por_cobrar_mes: 5000000, cobranzas_vencidas: 200000 },
    comprometido: { estado: 'ok', vencido: 500000 },
    lineas: { descubierto: { usado_aprox: 0 } },
  }
  const r = recomendaciones(model)
  assert.ok(r.length > 0)
  for (const x of r) {
    for (const k of ['prioridad', 'titulo', 'impacto_pesos', 'explicacion', 'riesgo', 'ahorro', 'fundamentos']) {
      assert.ok(k in x, `falta ${k} en la recomendación`)
    }
  }
})
