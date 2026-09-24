import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  obligacionesIibbDDJJ, obligacionesIvaDDJJ, obligacionesF931, libroPorPeriodo, obligacionesIvaCalculadas,
  obligacionesIibbEstimadas, finDeMes,
} from './impuestos-registro.mjs'

// LA DDJJ DE IIBB DE AGOSTO 2026 TAL COMO LA DEVUELVE `parsearDDJJ` (medido el 16/09/2026 sobre el PDF
// presentado el 15/09): el formulario dice «Subtotal Impuesto $ 432.764,90» y el parser trae
// `a_ingresar: 0, a_favor: true`. Si el registro vuelve a creerle al parser, agosto sale «nada que pagar».
const IIBB_AGO = {
  periodo: '2026-08', impuesto_determinado: 684885.63, retenciones: 233047.54, saldo_favor_anterior: 19073.19,
  a_ingresar: 0, a_favor: true, base_total: 34244281.67, alicuota: 0.02, fecha_presentacion: '15/09/2026',
  nro_control: '13200510681', fuente: '08-2026.pdf', actividades: [{ codigo: '429090', alicuota: 0.02, base_imponible: 34244281.67, impuesto: 684885.63 }],
}
const IIBB_JUL = {
  periodo: '2026-07', impuesto_determinado: 2249820.17, retenciones: 1345581.45, saldo_favor_anterior: 923311.91,
  a_ingresar: 19073.19, a_favor: true, base_total: 112491008.67, fecha_presentacion: '14/08/2026', fuente: '07-2026.pdf',
  actividades: [{ codigo: '410021', alicuota: 0.02, base_imponible: 112491008.67, impuesto: 2249820.17 }],
}

test('IIBB: el a pagar sale de los campos del formulario, no del «a ingresar» del parser', () => {
  const [jul, ago] = obligacionesIibbDDJJ([IIBB_JUL, IIBB_AGO])
  assert.equal(ago.a_pagar, 432764.9)
  assert.equal(ago.saldo_a_favor, 0)
  // Julio: el parser decía «a ingresar 19.073,19» y era SALDO A FAVOR.
  assert.equal(jul.a_pagar, 0)
  assert.equal(jul.saldo_a_favor, 19073.19)
  assert.equal(ago.presentada_el, '2026-09-15')
  assert.equal(ago.vencimiento_confianza, 'supuesto', 'el vencimiento de IIBB no está verificado y tiene que decirlo')
})

test('IVA DDJJ: el saldo a favor es la libre disponibilidad; el técnico viaja aparte', () => {
  const [o] = obligacionesIvaDDJJ([{
    periodo: '2026-07', debito: 23759067.09, credito: 12614646.14, libre_disp_anterior: 19344911, retenciones_percep: 34062,
    libre_disp: 9856370.42, a_pagar_efectivo: 0, saldo_contrib: 0, saldo_arca: 11144420.95, fecha_presentacion: '18/08/2026', nro_transaccion: '1189625475',
  }])
  assert.equal(o.saldo_a_favor, 9856370.42)
  assert.equal(o.determinado, 11144420.95)
  assert.equal(o.vencimiento, '2026-08-20')
  assert.equal(o.vencimiento_confianza, 'verificado')
  assert.equal(o.comprobante, '1189625475')
})

test('F931: se suma por período, con los códigos en el detalle y sin vencimiento inventado', () => {
  const filas = [['2026-08', '301', 'Aportes', 1893065.78, 25, 12903936.8], ["'2026-08", '351', 'Contrib', 3115555.03, 25, 12903936.8], ['basura', '1', 'x', 5]]
  const [o] = obligacionesF931(filas)
  assert.equal(o.determinado, 5008620.81)
  assert.equal(o.vencimiento, null)
  assert.deepEqual(Object.keys(o.detalle.codigos), ['301', '351'])
})

const comp = (x) => ({ tipo_libro: 'R', tipo_comprobante: '1', emisor_cuit: '30-1', punto_venta: '1', numero: '1', imp_total: 121, total_iva: 21, neto_gravado: 100, periodo: '2026-08', ...x })

test('el libro se deduplica ANTES de sumar y la nota de crédito resta', () => {
  const libro = libroPorPeriodo([
    comp({}), comp({}), // la misma factura en dos descargas
    comp({ tipo_comprobante: '3', numero: '2', total_iva: 5 }), // nota de crédito A
    comp({ tipo_libro: 'E', emisor_cuit: null, total_iva: 210, neto_gravado: 1000 }),
    comp({ tipo_comprobante: '999', numero: '3' }), // tipo sin signo conocido: se aparta
  ])
  const a = libro.get('2026-08')
  assert.equal(a.credito, 16)
  assert.equal(a.debito, 210)
  assert.equal(a.neto_ventas, 1000)
  assert.equal(a.apartados, 1)
})

test('IVA calculado: sin DDJJ previa el a pagar es NULL, no cero', () => {
  const libro = libroPorPeriodo([comp({ tipo_libro: 'E', emisor_cuit: null, total_iva: 500 })])
  const [o] = obligacionesIvaCalculadas({ libro, ddjjs: [], datosAl: '2026-09-04' })
  assert.equal(o.a_pagar, null)
  assert.equal(o.saldo_a_favor, null)
  assert.equal(o.estado, 'estimado')
})

test('IVA calculado: arranca de la libre disponibilidad de la última DDJJ, resta créditos y marca el mes parcial', () => {
  const libro = libroPorPeriodo([
    comp({ periodo: '2026-08', tipo_libro: 'E', emisor_cuit: null, total_iva: 7191299.15 }),
    comp({ periodo: '2026-08', total_iva: 3504360 }),
    comp({ periodo: '2026-09', tipo_libro: 'E', emisor_cuit: null, total_iva: 20000000, numero: '9' }),
  ])
  const ddjjs = [{ periodo: '2026-07', libre_disp: 9856370.42 }]
  const [ago, sep] = obligacionesIvaCalculadas({ libro, ddjjs, creditos: { '2026-08': 11982 }, datosAl: '2026-09-04' })
  assert.equal(ago.saldo_favor_anterior, 9856370.42)
  assert.equal(ago.saldo_a_favor, 6181413.27)
  assert.equal(ago.a_pagar, 0)
  assert.equal(ago.detalle.parcial, false)
  assert.equal(sep.a_pagar, 13818586.73)
  assert.equal(sep.detalle.parcial, true)
  // Un mes con DDJJ no genera fila de cálculo.
  assert.equal(obligacionesIvaCalculadas({ libro, ddjjs: [{ periodo: '2026-08', libre_disp: 1 }, ...ddjjs] }).some((o) => o.periodo === '2026-08'), false)
})

test('IIBB estimado: base de ARCA × alícuota de la última DDJJ con base, desde su saldo', () => {
  const libro = libroPorPeriodo([comp({ periodo: '2026-09', tipo_libro: 'E', emisor_cuit: null, neto_gravado: 32500000 })])
  const [o] = obligacionesIibbEstimadas({ libro, ddjjs: [IIBB_JUL, IIBB_AGO], datosAl: '2026-09-04' })
  assert.equal(o.periodo, '2026-09')
  assert.equal(o.determinado, 650000)
  assert.equal(o.saldo_favor_anterior, 0)
  assert.equal(o.detalle.creditos_parciales, true)
  assert.deepEqual(obligacionesIibbEstimadas({ libro, ddjjs: [] }), [], 'sin DDJJ no hay alícuota declarada: no se estima')
})

test('finDeMes no corre la fecha por zona horaria', () => {
  assert.equal(finDeMes('2026-02'), '2026-02-28')
  assert.equal(finDeMes('2026-12'), '2026-12-31')
})

test('IIBB: el vencimiento impreso en la DDJJ manda y queda verificado (agosto vence 21/09, no 16/09)', () => {
  const [ago] = obligacionesIibbDDJJ([{ ...IIBB_AGO, fecha_vencimiento: '21/09/2026' }])
  assert.equal(ago.vencimiento, '2026-09-21')
  assert.equal(ago.vencimiento_confianza, 'verificado')
  const [sinFecha] = obligacionesIibbDDJJ([IIBB_AGO])
  assert.equal(sinFecha.vencimiento_confianza, 'supuesto', 'sin fecha impresa sigue la regla, y dice que es supuesta')
})

test('la cuota del prendario: importe del ÚLTIMO débito real, sólo cuotas futuras, día del cronograma', async () => {
  const { obligacionesPrendario } = await import('./impuestos-registro.mjs')
  const plan = { dia_de_debito: 7, ultima_cuota: { periodo: '2026-12' }, concepto_en_el_extracto: 'Prestamos prendarios - 0179-039101464204' }
  const banco = [
    { fecha: '2026-08-07', concepto: 'Prestamos prendarios - 0179-039101464204', importe: '-1281778.38' },
    { fecha: '2026-09-07', concepto: 'Prestamos prendarios - 0179-039101464204', importe: '-1280712.77' },
    { fecha: '2026-09-08', concepto: 'Transferencia a terceros', importe: '-5000' },
  ]
  const o = obligacionesPrendario(banco, plan, { datosAl: '2026-09-23' })
  assert.deepEqual(o.map((x) => [x.periodo, x.vencimiento, x.a_pagar]), [
    ['2026-10', '2026-10-07', 1280712.77], ['2026-11', '2026-11-07', 1280712.77], ['2026-12', '2026-12-07', 1280712.77],
  ])
  assert.ok(o.every((x) => x.impuesto === 'prendario' && x.estado === 'estimado' && x.vencimiento_confianza === 'supuesto'))
  assert.deepEqual(obligacionesPrendario([], plan), [], 'sin débito real no se inventa la cuota')
  assert.deepEqual(obligacionesPrendario(banco, null), [], 'sin cronograma no se proyecta')
})

test('la proyección a fin de mes se COPIA de la pestaña, del mes en curso, sin vencimiento', async () => {
  const { obligacionesProyeccion, CONCEPTO_PROYECCION } = await import('./impuestos-registro.mjs')
  const rot = { iva: '⇒ IVA a pagar en efectivo', iibb: '⇒ IIBB a pagar en el mes', cheque: 'Impuesto al cheque (Ley 25.413)' }
  const filas = [['Impuestos y Financieros']]
  filas[54] = [rot.iva, 0, 0, 0, 0, 0, 0, 0, 0, 8327269.4, 5575035, 0, 0]
  filas[58] = [rot.iibb, 0, 0, 0, 0, 0, 0, 0, 432764.9, 1643148.2, 0, 0, 0]
  filas[60] = [rot.cheque, 0, 0, 0, 0, 0, 0, 0, 0, 3356206.1, 0, 0, 0]
  const o = obligacionesProyeccion(filas, rot, '2026-09-24')
  assert.deepEqual(o.map((x) => [x.impuesto, x.periodo, x.a_pagar, x.detalle.celda]), [
    ['iva', '2026-09', 8327269.4, 'J55'], ['iibb', '2026-09', 1643148.2, 'J59'], ['impuesto_cheque', '2026-09', 3356206.1, 'J61'],
  ])
  assert.ok(o.every((x) => x.concepto === CONCEPTO_PROYECCION && x.vencimiento === null && x.estado === 'estimado'))
  assert.throws(() => obligacionesProyeccion([['Otra pestaña']], rot, '2026-09-24'), /no es «Impuestos y Financieros»/)
  assert.throws(() => obligacionesProyeccion([['Impuestos y Financieros']], rot, '2026-09-24'), /no encontré la fila/)
})
