import test from 'node:test'
import assert from 'node:assert/strict'
import {
  corto, estadoDePago, proximoPago, resumenDeCobro, loQueSigue, pesos, diaMes, ROTULO_ESTADO, type Pago,
} from './cronograma.ts'

const HOY = '2026-08-26'
const p = (x: Partial<Pago>): Pago => ({
  id: x.id ?? 'x', orden: x.orden ?? 1, tipo: x.tipo ?? 'certificado', rotulo: x.rotulo ?? 'C',
  monto: x.monto === undefined ? 100 : x.monto, neto: x.neto === undefined ? null : x.neto,
  iva: x.iva === undefined ? null : x.iva, historico: x.historico ?? false, moneda: x.moneda ?? 'ARS', fechaPrevista: x.fechaPrevista ?? null, fechaPago: x.fechaPago ?? null,
  facturaNumero: x.facturaNumero ?? null, reciboNumero: x.reciboNumero ?? null,
  devolucionEn: null, devueltoEn: null, estadoFijado: x.estadoFijado ?? null,
})

test('pagado gana sobre todo: una factura pagada tarde no es «vencida»', () => {
  assert.equal(estadoDePago(p({ fechaPrevista: '2026-01-01', fechaPago: '2026-08-01' }), HOY), 'pagado')
})

test('sin factura y sin fecha es «sin factura», no «programado»', () => {
  // Un pago sin comprobante no se puede reclamar aunque figure en el plan.
  assert.equal(estadoDePago(p({}), HOY), 'sin_factura')
  assert.equal(estadoDePago(p({ facturaNumero: 'A 0004-140' }), HOY), 'programado')
})

test('vencido es fecha anterior a hoy; el mismo día NO está vencido', () => {
  assert.equal(estadoDePago(p({ fechaPrevista: '2026-08-25' }), HOY), 'vencido')
  assert.equal(estadoDePago(p({ fechaPrevista: HOY }), HOY), 'programado', 'vence hoy, todavía no venció')
  assert.equal(estadoDePago(p({ fechaPrevista: '2026-08-27' }), HOY), 'programado')
})

test('el estado que fija la base gana sobre la fecha: el Sheet no se contradice con la pantalla', () => {
  // «Proyectado» en la columna O de Cobranzas llega acá como `sin_factura`. Con la fecha ya pasada,
  // derivar habría escrito «vencido» sobre un cobro que todavía no facturamos.
  assert.equal(estadoDePago(p({ fechaPrevista: '2026-01-01', estadoFijado: 'sin_factura' }), HOY), 'sin_factura')
})

test('las palabras del portal son las del Sheet: «Pendiente», no «programado»', () => {
  assert.equal(ROTULO_ESTADO.programado, 'pendiente')
  assert.equal(ROTULO_ESTADO.vencido, 'vencido')
  assert.equal(ROTULO_ESTADO.pagado, 'pagado')
})

test('la hora no corre la fecha', () => {
  assert.equal(estadoDePago(p({ fechaPrevista: '2026-08-26T23:59:00Z' }), '2026-08-26T00:01:00Z'), 'programado')
})

test('el próximo pago incluye lo VENCIDO — es lo próximo que hay que pagar', () => {
  const pagos = [
    p({ id: 'v', orden: 4, fechaPrevista: '2026-08-08' }),
    p({ id: 'n', orden: 5, fechaPrevista: '2026-08-29' }),
  ]
  // Saltear el vencido mostraría como «próximo» algo que vence después de una deuda ya vencida.
  assert.equal(proximoPago(pagos)?.id, 'v')
})

test('el fondo de reparo no es el próximo pago: no se paga, se retiene', () => {
  const pagos = [p({ id: 'f', tipo: 'fondo_reparo', orden: 1, fechaPrevista: '2026-08-01' }),
    p({ id: 'c', orden: 2, fechaPrevista: '2026-09-01' })]
  assert.equal(proximoPago(pagos)?.id, 'c')
})

test('dos pagos con la misma fecha desempatan SIEMPRE igual', () => {
  const pagos = [p({ id: 'b', orden: 7, fechaPrevista: '2026-09-01' }), p({ id: 'a', orden: 3, fechaPrevista: '2026-09-01' })]
  assert.equal(proximoPago(pagos)?.id, 'a')
  assert.equal(proximoPago([...pagos].reverse())?.id, 'a', 'no depende del orden en que llegaron')
})

test('sin nada por pagar no hay próximo — y eso no es un error', () => {
  assert.equal(proximoPago([p({ fechaPago: '2026-08-01' })]), null)
  assert.equal(proximoPago([]), null)
})

test('los totales: vencido es SUBCONJUNTO de pendiente, no un sumando aparte', () => {
  const pagos = [
    p({ orden: 1, monto: 1_300_000, fechaPago: '2026-06-06' }),
    p({ orden: 2, monto: 2_800_000, fechaPago: '2026-08-14' }),
    p({ orden: 3, monto: 1_100_000, fechaPrevista: '2026-08-08' }),
    p({ orden: 4, monto: 3_100_000, fechaPrevista: '2026-08-29' }),
    p({ orden: 5, monto: 2_400_000, fechaPrevista: '2026-09-17' }),
    p({ orden: 6, monto: 1_600_000 }),
    p({ orden: 7, tipo: 'fondo_reparo', monto: 640_000 }),
  ]
  const r = resumenDeCobro(pagos, 26_400_000, HOY)
  assert.equal(r.pagado, 4_100_000)
  assert.equal(r.pendiente, 8_200_000, 'el fondo de reparo no es deuda a cobrar')
  assert.equal(r.vencido, 1_100_000)
  assert.ok(r.vencido <= r.pendiente, 'si se sumaran aparte, el total contaría el vencido dos veces')
  assert.equal(r.faltaCertificar, 26_400_000 - 12_300_000)
})

test('un pago SIN MONTO no suma cero: se cuenta aparte y se dice', () => {
  const r = resumenDeCobro([p({ monto: null, fechaPrevista: '2026-09-01' }), p({ monto: 500 })], 1000, HOY)
  assert.equal(r.pendiente, 500, 'el null no entró como 0')
  assert.equal(r.sinMonto, 1, 'y la pantalla puede decir que hay uno sin cargar')
})

test('sin contrato cargado, «falta certificar» es null y no el contrato entero', () => {
  assert.equal(resumenDeCobro([p({ monto: 100 })], null, HOY).faltaCertificar, null)
})

test('«lo que sigue» son los dos primeros del mismo orden que el próximo', () => {
  const pagos = [p({ id: 'c', orden: 3, fechaPrevista: '2026-09-17' }), p({ id: 'a', orden: 1, fechaPrevista: '2026-08-08' }),
    p({ id: 'b', orden: 2, fechaPrevista: '2026-08-29' })]
  assert.deepEqual(loQueSigue(pagos).map((x) => x.id), ['a', 'b'])
  assert.equal(loQueSigue(pagos)[0].id, proximoPago(pagos)!.id, 'el primero de «lo que sigue» ES el próximo')
})

test('null se escribe, no se inventa', () => {
  assert.equal(pesos(null), 'sin cargar')
  assert.equal(pesos(3_100_000), '$ 3.100.000')
  assert.equal(diaMes(null), 'sin fecha')
  assert.equal(diaMes('2026-08-29'), '29/08')
})

test('SIN PLAN CARGADO no se publica «$ 0» — cero afirma que no debe nada', () => {
  const r = resumenDeCobro([], 26_400_000, HOY)
  assert.equal(r.hayPlan, false, 'la pantalla necesita saberlo para escribir «sin cargar»')
  // Y «falta certificar» tampoco es el contrato entero: sería cierto por aritmética y falso como
  // afirmación — no es que no se certificó nada, es que no cargamos el plan.
  assert.equal(r.faltaCertificar, null)
})

test('con una sola línea cargada, el plan existe y los totales son reales', () => {
  const r = resumenDeCobro([p({ monto: 5_726_423.6, fechaPago: '2026-08-21' })], 47_590_271.5, HOY)
  assert.equal(r.hayPlan, true)
  assert.equal(r.pagado, 5_726_423.6)
})

test('las monedas NO se suman — una línea en dólares no entra al total en pesos', () => {
  // Sumarla arruina el total sin dar error: U$S 15.400 y $15.400 son el mismo número.
  const r = resumenDeCobro([
    p({ monto: 1_000_000, fechaPago: '2026-08-01' }),
    p({ monto: 15_400, moneda: 'USD', fechaPago: '2026-08-01' }),
  ], 5_000_000, HOY)
  assert.equal(r.pagado, 1_000_000)
  // La línea en dólares queda contada APARTE de las que no tienen importe: el pie le dedica su
  // propia columna, así que llamarla «no entra en estos totales» era falso.
  assert.equal(r.enOtraMoneda, 1)
  assert.equal(r.sinMonto, 0)
})

// ── EL PIE CUENTA EN NETO, PORQUE EL CONTRATO ES NETO ────────────────────────────────────────
//
// `obra_canonica.monto_contratado` guarda el neto sin IVA y el pie sumaba los importes CON IVA: no
// cerraba en ningún cliente. Los tres casos de abajo salen de datos reales del 26/08/2026.

test('el neto cierra contra el contrato donde el bruto no cerraba nunca', () => {
  // Messina · Limpieza de Escombros: un solo cobro pendiente. Contrato 5.008.661, importe 6.060.479.
  const r = resumenDeCobro([p({ monto: 6_060_479, neto: 5_008_661, iva: 1_051_818 })], 5_008_661, HOY)
  assert.equal(r.netoPendiente, 5_008_661, 'el neto ES el contrato: no falta certificar nada')
  assert.equal(r.pendiente, 6_060_479, 'y el total con IVA sigue publicado, aparte')
  assert.equal(r.faltaCertificar, 0)
  assert.equal(r.ivaPendiente, 1_051_818)
})

test('un cobro sin IVA discriminado aporta su importe al neto, no un cero', () => {
  // Los pagos en efectivo de San Francisco llegan con iva = 0 y neto = total. Tratar el neto ausente
  // como cero sacaría del pie plata realmente cobrada.
  const r = resumenDeCobro([p({ monto: 16_200_000, neto: null, iva: 0, fechaPago: '2026-07-10' })], null, HOY)
  assert.equal(r.netoPagado, 16_200_000)
  assert.equal(r.pagado, 16_200_000)
  assert.equal(r.ivaPagado, 0)
})

test('cada cifra del pie dice de cuántos cobros sale', () => {
  // «Los filtros de la sección Pagos deben indicar qué es lo que muestra cada concepto del footer.»
  const r = resumenDeCobro([
    p({ monto: 100, neto: 100, fechaPago: '2026-08-01' }),
    p({ monto: 200, neto: 200, fechaPago: '2026-08-02' }),
    p({ monto: 300, neto: 300 }),
    // El fondo de reparo no es deuda del cliente: no suma ni se cuenta como pendiente.
    p({ monto: 900, neto: 900, tipo: 'fondo_reparo' }),
  ], null, HOY)
  assert.equal(r.nPagado, 2)
  assert.equal(r.nPendiente, 1)
  assert.equal(r.netoPagado, 300)
  assert.equal(r.netoPendiente, 300)
})

test('«falta certificar» nunca se publica en negativo', () => {
  // Pasó de verdad: el cronograma de Quattropani suma $138 M contra un contrato de $97,6 M porque
  // incluye los materiales, que el contrato cuenta aparte. «−$40.762.069» no significa nada para el
  // cliente.
  const r = resumenDeCobro([p({ monto: 138_000_000, fechaPago: '2026-08-01' })], 97_650_000, HOY)
  assert.equal(r.faltaCertificar, null)
})

test('el signo de la moneda sale en el importe', () => {
  assert.equal(pesos(15_400, 'USD'), 'U$S 15.400')
  assert.equal(pesos(15_400), '$ 15.400')
  assert.equal(pesos(null, 'USD'), 'sin cargar')
})

test('cero real y «sin cargar» no son lo mismo', () => {
  // Messina · Limpieza de Escombros: un cobro en pesos, todavía sin pagar. PAGADO es CERO —es un
  // hecho: no pagó nada de esa obra— y el pie escribía «sin cargar», que se lee como que falta el
  // dato. La ausencia corresponde cuando no hay NINGUNA línea de esa moneda, no cuando hay cero.
  const conPlan = resumenDeCobro([p({ monto: 6_060_479, neto: 5_008_661 })], 5_008_661, HOY)
  assert.equal(conPlan.pagado, 0)
  assert.equal(conPlan.netoPagado, 0)
  assert.equal(conPlan.nPagado, 0)

  // Quattropani: el cronograma entero en dólares. En la columna de PESOS no hay nada que decir, y
  // «$ 0» ahí afirmaría que no debe nada — teniendo nueve certificados por delante.
  const otraMoneda = resumenDeCobro([p({ monto: 15_400, moneda: 'USD' })], null, HOY)
  assert.equal(otraMoneda.pagado, null)
  assert.equal(otraMoneda.pendiente, null)
})

test('la abreviatura no redondea lo que entra entero', () => {
  // La pastilla del filtro escribe el MISMO importe que su columna del pie: «U$S 32k» al lado de
  // «U$S 31.500» hace dudar de cuál de los dos es el bueno.
  assert.equal(corto(31_500, 'USD'), 'U$S 31.500')
  assert.equal(corto(1_200_000, 'USD'), 'U$S 1,2 M')
  assert.equal(corto(109_592_878), '$ 109,6 M')
  assert.equal(corto(852_300), '$ 852k')
  assert.equal(corto(null), '', 'sin dato no se dibuja un cero')
})

test('una línea que es toda IVA no suma al neto cobrado', () => {
  // «IVA de Factura 220»: $6.510.000 donde el importe entero es el impuesto del anticipo en dólares.
  // Dar el total por neto le sumaba $6,5 M de obra facturada que no existe.
  const r = resumenDeCobro([p({ monto: 6_510_000, neto: null, iva: 6_510_000, fechaPago: '2026-08-19' })], null, HOY)
  assert.equal(r.netoPagado, 0)
  assert.equal(r.ivaPagado, 6_510_000)
  assert.equal(r.pagado, 6_510_000, 'el cobro sigue estando: lo que cambia es cómo se reparte')
})
