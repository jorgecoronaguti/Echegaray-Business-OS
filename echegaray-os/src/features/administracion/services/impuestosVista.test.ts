import test from 'node:test'
import assert from 'node:assert/strict'
import type { PosicionImpuesto } from './impuestos.ts'
import { agenda, columnasConDato, decision, enDias, estadoLlano, nombreLlano, porImpuesto, urgenciaDe, vistaDe } from './impuestosVista.ts'

const fila = (x: Partial<PosicionImpuesto>): PosicionImpuesto => ({
  impuesto: 'iva', periodo: '2026-08', concepto: 'ddjj', fuente: 'ddjj_contador', estado: 'presentado',
  vencimiento: null, vencimiento_confianza: null, determinado: null, creditos: null, a_pagar: null,
  saldo_a_favor: null, pagado: 0, pendiente: null, datos_al: null, detalle: null, ...x,
})

// Lo que había en producción el 17/09/2026 (captura `antes-1440`), más un vencido que hoy no existe.
const HOY = '2026-09-17'
const PROD = [
  fila({ impuesto: 'cargas_sociales', periodo: '2026-09', fuente: 'calculo', estado: 'estimado', vencimiento: '2026-10-10', pendiente: 8166095 }),
  fila({ impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 3/3', fuente: 'manual', estado: 'estimado', vencimiento: '2026-10-16', pendiente: 2494876 }),
  fila({ impuesto: 'iibb', periodo: '2026-09', fuente: 'calculo', estado: 'estimado', vencimiento: '2026-10-16', pendiente: 870434, detalle: { parcial: true } }),
  fila({ impuesto: 'iibb', periodo: '2026-08', vencimiento: '2026-09-14', pendiente: 1000 }),
  fila({ periodo: '2026-08', fuente: 'calculo', estado: 'estimado', saldo_a_favor: 6693403, pendiente: 0 }),
  fila({ periodo: '2026-09', fuente: 'calculo', estado: 'estimado', saldo_a_favor: 0, pendiente: 625446, vencimiento: '2026-10-20', detalle: { parcial: true } }),
  fila({ impuesto: 'ganancias', periodo: '2026-04', concepto: 'anticipo', fuente: 'manual', estado: 'pagado', pagado: 144427, pendiente: 0 }),
]

test('la decisión de arriba: cargas y vencido son PARTE del total, no se suman al lado', () => {
  const d = decision(PROD, HOY)
  assert.equal(d.total, 8166095 + 2494876 + 870434 + 1000)
  assert.equal(d.cargas.total, 8166095 + 2494876)
  assert.ok(d.cargas.total < d.total, 'la versión vieja las mostraba como dos cifras hermanas')
  assert.deepEqual(d.vencido, { total: 1000, cantidad: 1 })
  assert.equal(d.proximo?.periodo, '2026-09', 'lo próximo es lo primero que todavía NO venció')
  assert.equal(d.proximo?.impuesto, 'cargas_sociales')
})

test('la agenda parte por urgencia en orden, sin grupos vacíos, y el borde de 7 días es «esta semana»', () => {
  const g = agenda(decision(PROD, HOY).lista)
  assert.deepEqual(g.map((x) => [x.urgencia, x.filas.length, x.total]), [['vencido', 1, 1000], ['mes', 3, 8166095 + 2494876 + 870434]])
  assert.equal(urgenciaDe(-1), 'vencido')
  assert.equal(urgenciaDe(0), 'semana')
  assert.equal(urgenciaDe(7), 'semana')
  assert.equal(urgenciaDe(8), 'mes')
})

test('un vencimiento sin importe se cuenta en su grupo y no suma cero escondido', () => {
  const g = agenda(decision([fila({ impuesto: 'iibb', estado: 'estimado', vencimiento: '2026-09-20', pendiente: null })], HOY).lista)
  assert.deepEqual(g.map((x) => [x.urgencia, x.total, x.sinImporte]), [['semana', 0, 1]])
})

test('por impuesto: falta pagar sin ventana, a favor del último cerrado, sólo vistas con filas', () => {
  const r = porImpuesto(PROD, HOY)
  assert.deepEqual(r.map((x) => x.vista), ['iva', 'iibb', 'cargas', 'ganancias'], 'Otros no tiene filas: no aparece')
  const iva = r.find((x) => x.vista === 'iva')!
  assert.equal(iva.faltaPagar, 625446, 'el IVA de septiembre vence fuera de 30 días y igual falta pagarlo')
  assert.equal(iva.estimados, 1)
  assert.equal(iva.proximo, null, 'vence el 20/10: fuera de la ventana de próximos')
  assert.deepEqual(iva.aFavor.map((s) => [s.periodo, s.saldo_a_favor]), [['2026-08', 6693403]], 'el mes parcial no pisa el saldo a favor')
  const iibb = r.find((x) => x.vista === 'iibb')!
  assert.equal(iibb.vencidas, 1)
  assert.equal(r.find((x) => x.vista === 'ganancias')!.faltaPagar, 0, 'lo pagado no falta pagar')
})

test('el estado se dice como lo diría quien paga, y el color sólo va donde hay que actuar', () => {
  assert.deepEqual(estadoLlano(fila({ pendiente: 1000 }), -2), { tono: 'neg', texto: 'Vencido sin pago' })
  assert.deepEqual(estadoLlano(fila({ pendiente: 1000 })), { tono: 'warn', texto: 'Declarado, falta pagar' })
  assert.deepEqual(estadoLlano(fila({ pendiente: 0 })), { tono: 'neutro', texto: 'Declarado' })
  assert.deepEqual(estadoLlano(fila({ estado: 'estimado', pendiente: 5 })), { tono: 'neutro', texto: 'Estimado, sin declarar' })
  assert.equal(estadoLlano(fila({ estado: 'estimado', detalle: { parcial: true } })).texto, 'Estimado · mes en curso')
  assert.equal(estadoLlano(fila({ estado: 'estimado', concepto: 'Plan F931 W303094 · cuota 3/3' })).texto, 'Estimado', 'una cuota no se declara')
  assert.deepEqual(estadoLlano(fila({ estado: 'pagado', pendiente: 0 })), { tono: 'pos', texto: 'Pagado' })
})

test('los nombres: la cuota se nombra por su plan, no por el período financiado', () => {
  assert.equal(nombreLlano({ impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 3/3' }), 'Plan F931 W303094 · cuota 3 de 3')
  assert.equal(nombreLlano({ impuesto: 'iibb', periodo: '2026-09', concepto: 'ddjj' }), 'Ingresos Brutos San Juan · septiembre 2026')
  assert.equal(nombreLlano({ impuesto: 'ganancias', periodo: '2026-04', concepto: 'anticipo' }), 'Ganancias · abril 2026 · anticipo')
  assert.deepEqual([enDias(0), enDias(1), enDias(23), enDias(-1), enDias(-3)], ['vence hoy', 'vence mañana', 'en 23 días', 'venció ayer', 'venció hace 3 días'])
})

test('las columnas vacías no se dibujan; pagado en 0 cuenta como vacío', () => {
  assert.deepEqual(columnasConDato([fila({ determinado: 5, a_pagar: 5 }), fila({ determinado: 1, a_pagar: 0, pagado: 0 })]), ['determinado', 'a_pagar'])
  assert.deepEqual(columnasConDato([fila({ creditos: 0, pagado: 3, saldo_a_favor: 0 })]), ['creditos', 'pagado', 'saldo_a_favor'], 'un cero real es dato')
})

test('?ver= es entrada del usuario: lo desconocido abre el resumen', () => {
  assert.equal(vistaDe('iva'), 'iva')
  assert.equal(vistaDe('historial'), 'historial')
  assert.equal(vistaDe(undefined), 'resumen')
  assert.equal(vistaDe('<script>'), 'resumen')
  assert.equal(vistaDe(['iva', 'iibb']), 'resumen')
})
