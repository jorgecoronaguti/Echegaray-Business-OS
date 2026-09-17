import test from 'node:test'
import assert from 'node:assert/strict'
import type { PosicionImpuesto } from './impuestos.ts'
import { cargasSociales, f931PorPeriodo, pendientesDeCargas, planesDePago } from './impuestosCargas.ts'

const fila = (x: Partial<PosicionImpuesto>): PosicionImpuesto => ({
  impuesto: 'cargas_sociales', periodo: '2026-08', concepto: 'ddjj', fuente: 'ddjj_contador', estado: 'pagado',
  vencimiento: null, vencimiento_confianza: 'supuesto', determinado: null, creditos: null, a_pagar: null,
  saldo_a_favor: null, pagado: 0, pendiente: 0, datos_al: null, detalle: null, ...x,
})

// Lo que había en producción el 17/09/2026, recortado a lo que distingue cada regla.
const PROD = [
  fila({ periodo: '2026-08', vencimiento: '2026-09-10', determinado: 8331697.69, a_pagar: 8331697.69, pagado: 8331697.69 }),
  fila({ periodo: '2026-09', fuente: 'calculo', estado: 'estimado', vencimiento: '2026-10-10', determinado: 8166095.05, a_pagar: 8166095.05, pendiente: 8166095.05 }),
  fila({ periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 2/3', fuente: 'manual', vencimiento: '2026-09-16', a_pagar: 2494875.65, pagado: 2494875.65 }),
  fila({ periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 3/3', fuente: 'manual', estado: 'estimado', vencimiento: '2026-10-16', a_pagar: 2494875.65, pendiente: 2494875.65 }),
  fila({ periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 1/3', fuente: 'manual', vencimiento: '2026-08-16', a_pagar: 2494875.65, pagado: 2494875.65 }),
  fila({ periodo: '2026-01', concepto: 'Deuda previsional ene-26 · cuota 6/6', fuente: 'manual', vencimiento: '2026-08-16', a_pagar: 473767.08, pagado: 473767.08 }),
  fila({ impuesto: 'iibb', periodo: '2026-08', vencimiento: '2026-09-20', estado: 'presentado', pendiente: 99 }),
]

test('a pagar 30 días de cargas sociales: el F931 estimado y la cuota 3/3 — $10.660.970,70 — y nada de otro impuesto', () => {
  const c = cargasSociales(PROD, '2026-09-17')
  assert.deepEqual(c.proximos.lista.map((f) => f.concepto), ['ddjj', 'Plan F931 W303094 · cuota 3/3'])
  assert.equal(Math.round(c.proximos.total * 100), 1066097070)
  assert.equal(c.pendienteTotal, 8166095.05 + 2494875.65)
})

test('un plan se arma por el nombre del concepto, con sus cuotas en orden y las pagadas contadas', () => {
  const [w, ene] = planesDePago(PROD)
  assert.equal(w.nombre, 'Plan F931 W303094', 'el plan con saldo va primero')
  assert.deepEqual(w.cuotas.map((q) => [q.n, q.de, q.pagada]), [[1, 3, true], [2, 3, true], [3, 3, false]])
  assert.equal(w.pagadas, 2)
  assert.equal(w.saldo, 2494875.65)
  assert.equal(ene.nombre, 'Deuda previsional ene-26')
  assert.equal(ene.saldo, 0)
})

test('una cuota sin importe no es cero ni está pagada: cuenta aparte', () => {
  const [p] = planesDePago([fila({ concepto: 'Plan X · cuota 1/2', estado: 'estimado', pendiente: null })])
  assert.equal(p.pagadas, 0)
  assert.equal(p.saldo, 0)
  assert.equal(p.sinImporte, 1)
  assert.equal(pendientesDeCargas([fila({ concepto: 'Plan X · cuota 1/2', estado: 'estimado', pendiente: null })]).length, 1)
})

test('el F931 por período excluye las cuotas y conserva el concepto que no calza la forma de plan', () => {
  const p = f931PorPeriodo([...PROD, fila({ periodo: '2026-07', concepto: 'intereses resarcitorios' })])
  assert.deepEqual(p.map((f) => `${f.periodo}·${f.concepto}`), ['2026-09·ddjj', '2026-08·ddjj', '2026-07·intereses resarcitorios'])
})

test('pendientes sin ventana: incluye lo que vence lejos y lo vencido, ordenado por vencimiento', () => {
  const p = pendientesDeCargas([
    ...PROD,
    fila({ periodo: '2026-12', estado: 'estimado', vencimiento: '2027-01-10', pendiente: 5 }),
    fila({ periodo: '2026-03', estado: 'presentado', vencimiento: '2026-04-10', pendiente: 7 }),
  ])
  assert.deepEqual(p.map((f) => f.vencimiento), ['2026-04-10', '2026-10-10', '2026-10-16', '2027-01-10'])
})
