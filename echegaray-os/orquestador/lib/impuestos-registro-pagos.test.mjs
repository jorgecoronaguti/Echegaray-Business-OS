import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pagosDelBanco, pagosDeCompras, pagosDeCobranzas, sinPagosRepetidos, creditosPorPeriodo, conEstadoDePago,
  periodoF931PorImporte, fechaISO, obligacionesDeDebitosBancarios, declaradasCubiertasPorBanco, COBRADORES_DEBIN,
} from './impuestos-registro-pagos.mjs'

const F931 = new Map([['2026-07', 8235741.96], ['2026-08', 8331697.69]])
const mov = (x) => ({ id: 1, fecha: '2026-08-11', importe: -8235741.96, concepto: 'Pago de servicios - Imp.afip: 3071630464311793242 - tarj nro. 3537', ...x })

test('un VEP que coincide al centavo con un F931 se imputa por importe; uno que no, queda sin imputar', () => {
  const [a, b] = pagosDelBanco([mov({}), mov({ id: 2, importe: -4859763.28 })], { f931: F931 })
  assert.deepEqual([a.impuesto, a.periodo, a.imputacion, a.importe], ['cargas_sociales', '2026-07', 'importe', 8235741.96])
  assert.deepEqual([b.impuesto, b.periodo, b.imputacion], [null, null, 'sin_imputar'])
})

test('dos períodos con el mismo total no imputan: la coincidencia tiene que ser única', () => {
  assert.equal(periodoF931PorImporte(100, new Map([['2026-01', 100], ['2026-02', 100]])), null)
})

test('la cuota de un plan se reconoce aunque su fila de Compras esté ELIMINADO — pero esa fila no es un pago', () => {
  const compras = [{
    proveedor: 'ARCA', concepto: 'Plan F931 W303094', detalle_obra: 'JUNIO Financiación - Cuota 1', total: 0, monto_pagado: 2494875.65,
    estado_pago: 'ELIMINADO', fecha: '2026-08-16',
  }]
  const { pagos, cuotasPlan } = pagosDeCompras(compras)
  assert.equal(pagos.length, 0)
  const [p] = pagosDelBanco([mov({ concepto: 'Debito automatico - Afip -30716304643', importe: -2494875.65, fecha: '2026-08-18' })], { cuotasPlan })
  assert.deepEqual([p.impuesto, p.concepto, p.imputacion], ['cargas_sociales', 'plan de pago', 'importe'])
})

test('el banco clasifica por texto: percepción de IVA, impuesto al cheque con su anulación, DGR sin imputar', () => {
  const pagos = pagosDelBanco([
    mov({ id: 3, concepto: 'Iva percepcion rg 2408', importe: -2070 }),
    mov({ id: 4, concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -500 }),
    mov({ id: 5, concepto: 'Anul imp ley 25.413 debito 0,6%', importe: 120 }),
    mov({ id: 6, concepto: 'Compra con tarjeta de debito - Dgr san juan - tarj nro. 6077', importe: -2928.96 }),
    mov({ id: 7, concepto: 'Iva 21% reg de transfisc ley27743', importe: -50 }),
  ])
  assert.deepEqual(pagos.map((p) => [p.impuesto, p.tipo, p.importe]), [
    ['iva', 'percepcion', 2070], ['impuesto_cheque', 'debito_bancario', 500], ['impuesto_cheque', 'debito_bancario', -120],
    [null, 'debito_bancario', 2928.96],
  ], 'el IVA de las comisiones no es un pago al fisco y no entra')
})

test('Compras: anticipo de Ganancias es pago Y obligación manual pagada; lo no pagado no entra', () => {
  const { pagos, obligaciones } = pagosDeCompras([
    { proveedor: 'ARCA', detalle_obra: 'Anticipo de Ganancias E6', total: 144427.46, estado_pago: '✓ Pagado', fecha: '2026-03-16' },
    { proveedor: 'ARCA', detalle_obra: 'Anticipo de Ganancias E6', total: 144427.46, estado_pago: 'Pendiente', fecha: '2026-04-16' },
    { proveedor: 'Corralón', detalle_obra: 'Anticipo de Ganancias', total: 1, estado_pago: '✓ Pagado', fecha: '2026-04-16' },
  ])
  assert.equal(pagos.length, 1)
  assert.deepEqual([pagos[0].impuesto, pagos[0].periodo, pagos[0].concepto], ['ganancias', '2026-03', 'anticipo'])
  assert.deepEqual([obligaciones[0].fuente, obligaciones[0].estado, obligaciones[0].a_pagar], ['manual', 'pagado', 144427.46])
})

const COLS = {
  cliente: { indice: 0 }, fechaCobro: { indice: 1 }, neto: { indice: 2 }, iva: { indice: 3 },
  retIva: { indice: 4 }, retGanancias: { indice: 5 }, retIibb: { indice: 6 }, comprobante: { indice: 7 },
}
for (const k of Object.keys(COLS)) COLS[k].letra = 'X'

test('Cobranzas: una retención que no encaja con su alícuota se registra SIN IMPUTAR, no como crédito', () => {
  const pagos = pagosDeCobranzas([
    ['Cliente', '10/03/2026', '$1.000.000,00', '$210.000,00', '$168.000,00', '$20.000,00', '', 'A-1'],
    ['Cliente', '11/03/2026', '$1.000.000,00', '$210.000,00', '$5.000,00', '', '', 'A-2'],
  ], COLS)
  assert.deepEqual(pagos.map((p) => [p.impuesto, p.imputacion, p.periodo]), [
    ['iva', 'documento', '2026-03'], ['ganancias', 'documento', '2026-03'], [null, 'sin_imputar', null],
  ])
  assert.deepEqual(creditosPorPeriodo(pagos, 'iva'), { '2026-03': 168000 })
})

test('el mismo pago en Compras y en el banco se registra una vez: manda el banco', () => {
  const b = { fuente: 'banco', importe: 1034931.85, fecha: '2026-06-16' }
  const c = { fuente: 'compras', importe: 1034931.82, fecha: '2026-06-16' }
  const lejos = { fuente: 'compras', importe: 1034931.82, fecha: '2026-05-16' }
  assert.deepEqual(sinPagosRepetidos([b, c, lejos]), [b, lejos])
})

test('el estado pagado lo da la plata que salió, no una retención', () => {
  const o = { impuesto: 'iibb', periodo: '2026-08', concepto: 'ddjj', estado: 'presentado', a_pagar: 432764.9 }
  const ret = { impuesto: 'iibb', periodo: '2026-08', concepto: 'ddjj', tipo: 'retencion', importe: 500000 }
  assert.equal(conEstadoDePago([o], [ret])[0].estado, 'presentado')
  const vep = { ...ret, tipo: 'vep', importe: 432764.9 }
  assert.equal(conEstadoDePago([o], [vep])[0].estado, 'pagado')
})

test('fechaISO entiende las tres formas y no inventa', () => {
  assert.equal(fechaISO('07/09/26'), '2026-09-07')
  assert.equal(fechaISO('2026-09-07T03:00:00Z'), '2026-09-07')
  assert.equal(fechaISO(new Date(Date.UTC(2026, 8, 7))), '2026-09-07')
  assert.equal(fechaISO(46272), '2026-09-07', 'serial de Sheets (lectura sin formato)')
  assert.equal(fechaISO(5), null)
  assert.equal(fechaISO('septiembre'), null)
})

test('impuesto al cheque: la obligación del mes es la suma neta de lo debitado, anulaciones incluidas', () => {
  const pagos = pagosDelBanco([
    mov({ id: 8, fecha: '2026-08-03', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -600 }),
    mov({ id: 9, fecha: '2026-08-04', concepto: 'Anul imp ley 25.413 debito 0,6%', importe: 100 }),
    mov({ id: 10, fecha: '2026-08-05', concepto: 'Iva percepcion rg 2408', importe: -50 }),
  ])
  const [o, ...resto] = obligacionesDeDebitosBancarios(pagos, { datosAl: '2026-09-14' })
  assert.equal(resto.length, 0, 'una percepción no es un impuesto al cheque')
  assert.deepEqual([o.impuesto, o.periodo, o.a_pagar, o.estado], ['impuesto_cheque', '2026-08', 500, 'pagado'])
})

// ═══ 18/09/2026: EL DEBIN A PLUSPAGOS Y EL DÉBITO AUTOMÁTICO QUE AHORA DICE «Arca» ═══

const IIBB = new Map([['2026-07', 0], ['2026-08', 432764.9]])

test('un DEBIN al CUIT de PlusPagos (Administradora San Juan S.A.) que coincide al centavo con el «a pagar» de una DDJJ de IIBB es ese pago', () => {
  const [p] = pagosDelBanco([mov({ id: 1103, fecha: '2026-09-17', importe: -432764.9, concepto: 'Debito debin - id debin lmorzp90ged80oyynegj46 cuit 30707743987' })], { iibb: IIBB })
  assert.deepEqual([p.impuesto, p.periodo, p.tipo, p.concepto, p.imputacion, p.importe, p.referencia], ['iibb', '2026-08', 'debin', 'ddjj', 'importe', 432764.9, 'banco:1103'])
  assert.match(p.contraparte, /DGR San Juan/)
  assert.match(p.detalle.cobrador, /PlusPagos/)
  assert.equal(COBRADORES_DEBIN[0].cuit, '30707743987')
})

test('un DEBIN al mismo cobrador que NO coincide con ninguna DDJJ de IIBB no es un impuesto por evidencia: no se registra (la boleta de UOCRA también viaja por ahí)', () => {
  const pagos = pagosDelBanco([
    mov({ id: 801, fecha: '2026-08-19', importe: -649940.06, concepto: 'Debito debin - id debin 7l8gyknx4k0y0rqpnmprz5 cuit 30707743987' }),
    mov({ id: 1037, fecha: '2026-09-10', importe: -994941.26, concepto: 'Debito debin - id debin rd06zo9w4lqdwjv325gp7x cuit 30503049097' }),
  ], { iibb: IIBB })
  assert.deepEqual(pagos, [])
})

test('«Debito automatico - Arca» (el banco cambió AFIP por ARCA) entra como débito automático sin imputar, igual que «Afip»', () => {
  const [p] = pagosDelBanco([mov({ id: 1091, fecha: '2026-09-16', importe: -242519.6, concepto: 'Debito automatico - Arca -30716304643' })])
  assert.deepEqual([p.tipo, p.impuesto, p.imputacion, p.importe, p.referencia], ['debito_automatico', null, 'sin_imputar', 242519.6, 'banco:1091'])
})

test('una declaración a mano del dueño queda cubierta cuando el banco trae el mismo impuesto, período e importe: el débito le gana a la declaración', () => {
  const existentes = [
    { fuente: 'manual', referencia: 'iibb-2026-08-declarado', lector: 'dueño', imputacion: 'declarada', impuesto: 'iibb', periodo: '2026-08', importe: '432764.90' },
    { fuente: 'manual', referencia: 'iibb-2026-09-declarado', lector: 'dueño', imputacion: 'declarada', impuesto: 'iibb', periodo: '2026-09', importe: '870434.04' },
    { fuente: 'banco', referencia: 'banco:1090', lector: 'banco', imputacion: 'importe', impuesto: 'cargas_sociales', periodo: '2026-06', importe: '2494875.65' },
  ]
  const pagos = pagosDelBanco([mov({ id: 1103, fecha: '2026-09-17', importe: -432764.9, concepto: 'Debito debin - id debin x cuit 30707743987' })], { iibb: IIBB })
  assert.deepEqual(declaradasCubiertasPorBanco(existentes, pagos), ['manual|iibb-2026-08-declarado'])
  // Sin el débito del banco no se toca ninguna declaración.
  assert.deepEqual(declaradasCubiertasPorBanco(existentes, []), [])
})
