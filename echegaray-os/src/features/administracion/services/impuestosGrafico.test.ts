import test from 'node:test'
import assert from 'node:assert/strict'
import type { PosicionImpuesto } from './impuestos.ts'
import { escala, etiquetaMes, porMesDePago, porPeriodoDeImpuesto, ventana } from './impuestosGrafico.ts'

const fila = (x: Partial<PosicionImpuesto>): PosicionImpuesto => ({
  impuesto: 'iva', periodo: '2026-08', concepto: 'ddjj', fuente: 'ddjj_contador', estado: 'presentado',
  vencimiento: null, vencimiento_confianza: null, determinado: null, creditos: null, a_pagar: null,
  saldo_a_favor: null, pagado: 0, pendiente: null, datos_al: null, detalle: null, ...x,
})
const HOY = '2026-09-17'

test('la ventana: 12 meses atrás hasta 2 adelante, cruzando el año sin correrse', () => {
  const v = ventana(HOY, 11, 2)
  assert.equal(v.length, 14)
  assert.equal(v[0], '2025-10')
  assert.equal(v[11], '2026-09')
  assert.equal(v[13], '2026-11')
  assert.deepEqual(ventana('2026-01-31', 1, 1), ['2025-12', '2026-01', '2026-02'])
  assert.equal(etiquetaMes('2026-01', true), 'ene 26')
})

test('resumen por mes de VENCIMIENTO: el F931 de agosto cae en septiembre, lo sin fecha en su período', () => {
  const m = porMesDePago([
    fila({ impuesto: 'cargas_sociales', periodo: '2026-08', vencimiento: '2026-09-10', estado: 'pagado', pagado: 8331698, pendiente: 0 }),
    fila({ impuesto: 'cargas_sociales', periodo: '2026-09', vencimiento: '2026-10-10', estado: 'estimado', pendiente: 8166095 }),
    fila({ impuesto: 'impuesto_cheque', periodo: '2026-09', concepto: 'debitos y creditos', estado: 'pagado', pagado: 607804, pendiente: 0 }),
    fila({ impuesto: 'iibb', periodo: '2026-08', vencimiento: '2026-09-14', pendiente: 1000 }),
    fila({ impuesto: 'iibb', periodo: '2026-09', vencimiento: '2026-10-16', estado: 'estimado', pendiente: null }),
    fila({ impuesto: 'ganancias', periodo: '2026-06', concepto: 'anticipo', estado: 'pagado', pagado: 100, pendiente: 5000, vencimiento: '2026-07-10' }),
  ], HOY)
  const sep = m.find((x) => x.mes === '2026-09')!
  const oct = m.find((x) => x.mes === '2026-10')!
  assert.equal(sep.actual, true)
  assert.equal(sep.capas.find((c) => c.vista === 'cargas')!.pagado, 8331698)
  assert.equal(sep.capas.find((c) => c.vista === 'otros')!.pagado, 607804, 'sin vencimiento: el mes de su período')
  assert.equal(sep.capas.find((c) => c.vista === 'iibb')!.falta, 1000)
  assert.equal(sep.falta, 1000)
  const cargasOct = oct.capas.find((c) => c.vista === 'cargas')!
  assert.deepEqual([cargasOct.falta, cargasOct.faltaEstimada], [8166095, 8166095])
  assert.equal(oct.capas.find((c) => c.vista === 'iibb')!.sinImporte, 1, 'el importe desconocido se cuenta, no se suma')
  const jul = m.find((x) => x.mes === '2026-07')!.capas.find((c) => c.vista === 'ganancias')!
  assert.deepEqual([jul.pagado, jul.falta], [100, 0], 'pagado con saldo en la base: no falta (manda el estado)')
})

test('solapa por PERÍODO: sin cuotas de planes ni DDJJ anual; sin dato no es barra en cero', () => {
  const p = porPeriodoDeImpuesto([
    fila({ periodo: '2026-07', determinado: 11144421, saldo_a_favor: 9856370 }),
    fila({ periodo: '2026-08', estado: 'estimado', determinado: 3174949, saldo_a_favor: 6693403 }),
    fila({ impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 3/3', determinado: 2494876, pagado: 2494876 }),
    fila({ impuesto: 'ganancias', periodo: '2025-10', concepto: 'ddjj anual', determinado: 7310162, saldo_a_favor: 5726887 }),
    fila({ periodo: '2026-04', determinado: -6735708, saldo_a_favor: 18757047 }),
    fila({ periodo: '2026-09', estado: 'estimado', determinado: 7324196, saldo_a_favor: 0, detalle: { parcial: true } }),
  ], 'iva', HOY)
  assert.equal(p.length, 14)
  assert.equal(p.at(-1)!.mes, '2026-09')
  assert.equal(p.find((x) => x.mes === '2026-08')!.estimado, true)
  assert.equal(p.find((x) => x.mes === '2026-04')!.determinado, -6735708, 'un determinado negativo se dibuja negativo')
  assert.equal(p.find((x) => x.mes === '2026-05')!.determinado, null)
  assert.equal(p.find((x) => x.mes === '2026-05')!.aFavor, null)
  assert.equal(p.find((x) => x.mes === '2026-09')!.aFavor, null, 'el mes parcial no baja la línea a cero')
  assert.equal(p.find((x) => x.mes === '2026-09')!.determinado, 7324196)
  const cargas = porPeriodoDeImpuesto([fila({ impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 3/3', determinado: 2494876, pagado: 2494876 })], 'cargas', HOY)
  assert.equal(cargas.find((x) => x.mes === '2026-06')!.pagado, 0, 'la cuota no infla el período financiado')
  const gan = porPeriodoDeImpuesto([fila({ impuesto: 'ganancias', periodo: '2025-10', concepto: 'ddjj anual', determinado: 7310162, saldo_a_favor: 5726887 })], 'ganancias', HOY)
  assert.equal(gan.find((x) => x.mes === '2025-10')!.determinado, null, 'la anual no es un mes')
})

test('la escala arranca en cero, cubre el máximo con escalones redondos y baja si hay negativos', () => {
  const e = escala(0, 11531405)
  assert.equal(e.desde, 0)
  assert.ok(e.hasta >= 11531405)
  assert.ok(e.marcas.length >= 3 && e.marcas.length <= 6, `marcas: ${e.marcas}`)
  assert.ok(e.marcas.every((m) => m % 1000000 === 0 || m % 500000 === 0))
  const n = escala(-6735708, 25836241)
  assert.ok(n.desde < 0 && n.desde <= -6735708)
  assert.ok(n.marcas.includes(0))
  assert.deepEqual(escala(0, 0).marcas.slice(0, 1), [0])
})
