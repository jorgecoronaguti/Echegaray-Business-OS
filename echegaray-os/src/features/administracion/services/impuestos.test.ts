import test from 'node:test'
import assert from 'node:assert/strict'
import { aPagarProximos, frescura, hoyAR, porPeriodo, saldosAFavor, rotuloPeriodo, type PosicionImpuesto } from './impuestos.ts'

const fila = (x: Partial<PosicionImpuesto>): PosicionImpuesto => ({
  impuesto: 'iva', periodo: '2026-08', concepto: 'ddjj', fuente: 'ddjj_contador', estado: 'presentado',
  vencimiento: null, vencimiento_confianza: null, determinado: null, creditos: null, a_pagar: null,
  saldo_a_favor: null, pagado: 0, pendiente: null, datos_al: null, detalle: null, ...x,
})

test('a pagar en 30 días: entra lo vencido sin pago y lo de importe desconocido; no entra lo pagado ni lo lejano', () => {
  const r = aPagarProximos([
    fila({ impuesto: 'iibb', vencimiento: '2026-09-16', pendiente: 432764.9 }),
    fila({ impuesto: 'iibb', periodo: '2026-09', vencimiento: '2026-10-16', pendiente: null, estado: 'estimado' }),
    fila({ periodo: '2026-07', vencimiento: '2026-08-20', pendiente: 1000 }),
    fila({ vencimiento: '2026-09-21', pendiente: 0 }),
    fila({ vencimiento: '2026-09-20', pendiente: 5, estado: 'pagado' }),
    fila({ vencimiento: '2026-11-20', pendiente: 7 }),
    fila({ vencimiento: '2026-06-01', pendiente: 9 }),
  ], '2026-09-16')
  assert.deepEqual(r.lista.map((f) => [f.periodo, f.dias]), [['2026-07', -27], ['2026-08', 0], ['2026-09', 30]])
  assert.equal(r.total, 433764.9, 'el importe desconocido no se suma como cero ni se inventa')
  assert.equal(r.sinImporte, 1)
  assert.equal(r.vencidos, 1)
})

test('el saldo a favor es el del último período CERRADO de cada impuesto, no la suma ni el mes parcial', () => {
  const s = saldosAFavor([
    fila({ periodo: '2026-07', saldo_a_favor: 9856370.42 }),
    fila({ periodo: '2026-08', saldo_a_favor: 6181413.24, fuente: 'calculo' }),
    fila({ periodo: '2026-09', saldo_a_favor: 265832, fuente: 'calculo', detalle: { parcial: true } }),
    fila({ impuesto: 'iibb', periodo: '2026-08', saldo_a_favor: 0 }),
    fila({ impuesto: 'ganancias', concepto: 'anticipo', saldo_a_favor: 99 }),
    fila({ impuesto: 'cargas_sociales', saldo_a_favor: null }),
  ])
  assert.deepEqual(s.map((f) => [f.impuesto, f.saldo_a_favor]), [['iva', 6181413.24], ['iibb', 0]])
})

test('frescura: cada fuente con su vara, y la fuente sin dato es vieja', () => {
  const f = frescura({
    corrio_en: '2026-09-16T21:40:00Z',
    lectores: {
      arca: { ok: true, datos_al: '2026-09-04' }, ddjj_iibb_pdf: { ok: true, datos_al: '2026-08-31' },
      banco: { ok: false, error: 'x', datos_al: '2026-09-14' },
    },
  }, new Date('2026-09-16T23:00:00Z'))
  const por = Object.fromEntries(f.fuentes.map((x) => [x.nombre, x]))
  assert.equal(por.ARCA.vieja, true, 'ARCA a 12 días ya no es de esta semana')
  assert.equal(por['DDJJ IIBB'].vieja, false, 'la DDJJ de agosto es la última que puede existir el 16/09')
  assert.equal(por['DDJJ IVA'].vieja, true)
  assert.equal(por.banco.fallo, true)
  assert.equal(f.sincronizacionVieja, false)
  assert.equal(frescura(null, new Date()).sincronizacionVieja, true)
})

test('por período: del más nuevo al más viejo, IVA antes que IIBB', () => {
  const o = porPeriodo([fila({ impuesto: 'iibb' }), fila({ periodo: '2026-01' }), fila({})])
  assert.deepEqual(o.map((f) => `${f.periodo}·${f.impuesto}`), ['2026-08·iva', '2026-08·iibb', '2026-01·iva'])
  assert.equal(rotuloPeriodo('2026-08'), 'ago-26')
})

test('hoy es el día de San Juan, no el de UTC: a las 22 h del 16/09 sigue siendo 16/09', () => {
  assert.equal(hoyAR(new Date('2026-09-17T01:00:00Z')), '2026-09-16')
  assert.equal(hoyAR(new Date('2026-09-17T03:00:00Z')), '2026-09-17')
})
