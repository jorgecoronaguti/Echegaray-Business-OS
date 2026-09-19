// LOS DEFECTOS QUE ESTE ARCHIVO ATRAPA
//
// Cada test de acá corresponde a una forma concreta en que un estado de cuenta le miente al
// cliente. No prueban que la función devuelva algo: prueban el NÚMERO, contra la fila del Sheet de
// la que sale, para que revertir el arreglo ponga uno rojo.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COL, aging, armarEstadoDeCuenta, carteraDeCuadro2, controles, equivalenciaUsd, esFechaEstimada,
  faltanteDeContrato, fechaAR, filasDelCliente, montoAR, movimientosCobrados, obrasDeCuadro3, pesos,
  serialDeISO, tcDelCalendario, tcPorComprobante, vencimientosPendientes,
} from './estado-de-cuenta.mjs'
import { contratoDeclarado, cotizacionDeObra } from './estado-de-cuenta-contratos.mjs'
import {
  CALENDARIO_A2, FILAS_COBRANZAS, FILAS_OBRAS, FILAS_QUATTROPANI, FILAS_SAN_FRANCISCO,
} from './estado-de-cuenta-fixture.mjs'

const CORTE = serialDeISO('2026-08-24')
const Q = 'Quattropani - Melisa García SAS'
const SF = 'San Francisco'

test('el corte del documento entra como AAAA-MM-DD y sale como 24/08/2026', () => {
  assert.equal(fechaAR(CORTE), '24/08/2026')
  // Sin fecha no se inventa una: la celda vacía se imprime vacía.
  assert.equal(fechaAR(''), '')
  assert.equal(fechaAR(0), '')
})

test('los pesos salen en es-AR y sin centavos — "$ 17.553.946", no "$17553946.00"', () => {
  assert.equal(pesos(17553946), '$ 17.553.946')
  assert.equal(pesos(1932063.5), '$ 1.932.064')
})

test('un importe que la pestaña escribe entre paréntesis es NEGATIVO, y el guion largo es cero', () => {
  assert.equal(montoAR('$47.590.272'), 47590272)
  assert.equal(montoAR('($20.000.000)'), -20000000)
  assert.equal(montoAR('—'), 0)
  // Lo que no se supo leer NO es cero: cero afirmaría que el cliente no debe nada.
  assert.equal(montoAR('15/09 · Efectivo'), null)
})

test('el cliente con DOS rótulos en la columna G trae sus dos grupos de filas', () => {
  // Si el documento filtrara por igualdad de cadena, las 9 cobranzas de "IMOTOR/San Francisco/JAVI
  // SANCHEZ" ($104,8M ya cobrados) quedarían afuera y el estado de cuenta arrancaría en cero.
  const propias = filasDelCliente(FILAS_COBRANZAS, SF)
  assert.equal(propias.length, FILAS_SAN_FRANCISCO.length)
  assert.ok(propias.some((f) => f[COL.cliente] === 'IMOTOR/San Francisco/JAVI SANCHEZ'))
  assert.ok(propias.some((f) => f[COL.cliente] === 'San Francisco'))
  assert.equal(filasDelCliente(FILAS_COBRANZAS, Q).length, FILAS_QUATTROPANI.length)
})

test('una fila en estado CANCELAR no se imprime como un cobro de $0', () => {
  const movs = movimientosCobrados(FILAS_SAN_FRANCISCO, { desde: serialDeISO('2026-01-01'), hasta: CORTE })
  assert.equal(movs.length, 10, 'las 11 filas en estado de cobro menos la 54, que está anulada')
  assert.ok(!movs.some((m) => /NO CONSIDERAR/i.test(m.concepto)))
})

test('los cobros de San Francisco suman exactamente lo que publica OBRAS cuadro 2', () => {
  const movs = movimientosCobrados(filasDelCliente(FILAS_COBRANZAS, SF), {
    desde: serialDeISO('2026-01-01'), hasta: CORTE,
  })
  const suma = movs.reduce((a, m) => a + m.total, 0)
  assert.equal(suma, 119765646, 'OBRAS!fila 11, columna "Cobrado (total)"')
  assert.equal(carteraDeCuadro2(FILAS_OBRAS, SF).cobradoTotal, suma)
})

test('los vencimientos de Quattropani suman los $59.078.250 de OBRAS, y ninguno está vencido', () => {
  const vencs = vencimientosPendientes(FILAS_QUATTROPANI, { hasta: CORTE })
  assert.equal(vencs.length, 9)
  assert.equal(vencs.reduce((a, v) => a + v.total, 0), 59078250)
  const a = aging(vencs, CORTE)
  assert.equal(a.vencido, 0)
  assert.equal(a.bandas['Por vencer'], 59078250)
  assert.equal(a.sinFecha, 0)
})

test('un vencimiento sin fecha de cobro NO cae en "Por vencer": se ve aparte', () => {
  // Sin fecha no está programado en ningún mes. Meterlo en "Por vencer" haría creer que sí.
  const a = aging([{ fechaCobro: 0, total: 5000000 }, { fechaCobro: CORTE + 10, total: 1000000 }], CORTE)
  assert.equal(a.sinFecha, 5000000)
  assert.equal(a.bandas['Por vencer'], 1000000)
})

test('el aging manda cada atraso a su banda contando desde el corte', () => {
  const v = (dias, total) => ({ fechaCobro: CORTE - dias, total })
  const a = aging([v(0, 100), v(1, 200), v(30, 400), v(31, 800), v(60, 1600), v(91, 3200)], CORTE)
  assert.deepEqual(a.bandas, { 'Por vencer': 100, '1–30': 600, '31–60': 2400, '61–90': 0, '+90': 3200 })
  assert.equal(a.vencido, 6200)
})

test('la fecha que la fila declara ESTIMADA viaja marcada — es la fila 99 de Pisos', () => {
  // "fecha estimada 15/09, confirmar". Imprimirla como acordada le regala al cliente una promesa
  // que Administración todavía no cerró.
  const vencs = vencimientosPendientes(filasDelCliente(FILAS_COBRANZAS, SF), { hasta: CORTE })
  const saldo = vencs.find((v) => v.total === 17553946)
  assert.equal(saldo.fechaEstimada, true)
  assert.equal(fechaAR(saldo.fechaCobro), '15/09/2026')
  // Las otras no llevan la marca.
  assert.equal(vencs.filter((v) => v.fechaEstimada).length, 1)
  assert.equal(esFechaEstimada(FILAS_QUATTROPANI[4]), false)
})

test('el TC de la factura sale del concepto de OTRA fila del mismo comprobante', () => {
  // La fila 62 (U$S 15.400) no dice a qué dólar se cerró; lo dice la 63, que es la otra mitad de la
  // misma FA 220. Sin este cruce el documento no puede valuar el billete sin inventar un dólar.
  const tcs = tcPorComprobante(FILAS_QUATTROPANI)
  assert.equal(tcs.get('FA 220'), 1550)
  assert.equal(tcs.get('FA 219'), undefined)
})

test('el cobro en dólares se muestra al TC de la factura, no al del día', () => {
  // OBRAS revalúa esos U$S 15.400 al dólar del Calendario ($1.509,186 → $23.241.464). Para la
  // cartera está bien; para la cuenta corriente del cliente está mal: la FA 220 se pagó a 1.550 y
  // quedó saldada. Decisión del dueño, 24/08/2026.
  const movs = movimientosCobrados(FILAS_QUATTROPANI, { desde: serialDeISO('2026-01-01'), hasta: CORTE })
  const billete = movs.find((m) => m.moneda === 'USD')
  assert.equal(billete.total, 15400)
  assert.equal(billete.tcFactura, 1550)
  assert.equal(billete.pesosAlTcFactura, 23870000)
  // La FA 220 completa: U$S 20.000 = 15.400 × 1.550 + 7.130.000 = $31.000.000.
  const fa220 = movs.filter((m) => m.comprobante === 'FA 220' && m.iva === 0)
  assert.equal(fa220.reduce((a, m) => a + m.pesosAlTcFactura, 0), 31000000)
})

test('un dólar sin TC declarado no se valúa en cero: se informa aparte', () => {
  const sinTc = FILAS_QUATTROPANI.filter((f) => f[COL.comprobante] === 220 && f[COL.moneda] === 'USD')
  const movs = movimientosCobrados(sinTc, { desde: serialDeISO('2026-01-01'), hasta: CORTE })
  assert.equal(movs[0].pesosAlTcFactura, null)
  assert.equal(movs[0].total, 15400)
})

test('OBRAS cuadro 3 se transcribe obra por obra, con la fila de la que salió cada número', () => {
  const obras = obrasDeCuadro3(FILAS_OBRAS, SF)
  assert.equal(obras.length, 4)
  const pisos = obras[0]
  assert.equal(pisos.fila, 22)
  assert.equal(pisos.nombre, 'PISOS INDUSTRIALES')
  assert.equal(pisos.plazo, '05/08 → 30/09')
  assert.equal(pisos.contratado, 47590272)
  assert.equal(pisos.cobrado, 6241190)
  assert.equal(pisos.porCobrar, 41349082)
  assert.equal(pisos.proximoCobro, '15/09 · Efectivo')
  // El "▲" del rótulo es una marca del cuadro, no parte del nombre ni del plazo de la obra.
  assert.equal(obras[2].nombre, 'ENTREPISO Y ESCALERA')
  assert.equal(obras[2].plazo, '10/08 → 21/08')
  assert.equal(obrasDeCuadro3(FILAS_OBRAS, Q).length, 1)
})

test('EL DEFECTO: el cuadro 4 se parece al 3 y publica COSTOS, no cobranzas', () => {
  // "4.7 · Quattropani — SALÓN COMERCIAL · 18/08 → 30/12" tiene la forma exacta de una fila del
  // cuadro 3. Un lector que busque el patrón en toda la pestaña le agrega al cliente una segunda
  // obra con $39.151.133 de costo proyectado disfrazados de certificación.
  const obras = obrasDeCuadro3(FILAS_OBRAS, Q)
  assert.equal(obras.length, 1)
  assert.equal(obras[0].fila, 28)
  assert.equal(obras[0].certificado, 97650000)
  // Y las cuatro de San Francisco tampoco se duplican con las del cuadro de costos.
  assert.deepEqual(obrasDeCuadro3(FILAS_OBRAS, SF).map((o) => o.fila), [22, 23, 24, 25])
})

test('EL DEFECTO: plata del contrato sin fila con fecha no aparece en ningún lado', () => {
  // Al 24/08 la fila 99 cierra Pisos Industriales: 6.241.190 + 41.349.082 = 47.590.272.
  const pisos = obrasDeCuadro3(FILAS_OBRAS, SF)[0]
  assert.equal(faltanteDeContrato(pisos), null)

  // Si esa fila no estuviera —que es como estuvo hasta hoy—, OBRAS publicaría $23.795.136 por
  // cobrar y el 36,9 % del contrato no estaría en ningún mes del Calendario, ni en el Cash Flow, ni
  // en este documento. El control lo tiene que ver.
  const sinLaFila = { ...pisos, porCobrar: 23795136 }
  assert.equal(faltanteDeContrato(sinLaFila), 17553946)
})

test('un EXCEDENTE sobre el contrato no dispara el control: no prueba nada', () => {
  // Quattropani cobró $102.559.884 contra un contrato de $97.650.000 porque ahí adentro están el
  // IVA y los $44,1M del fondo de materiales del Anexo II, que no son el contrato de mano de obra.
  // Un aviso permanente enseña a ignorar la banda.
  const salon = obrasDeCuadro3(FILAS_OBRAS, Q)[0]
  assert.ok(salon.contratado - salon.cobrado - salon.porCobrar < 0)
  assert.equal(faltanteDeContrato(salon), null)
})

test('EL DEFECTO: el detalle impreso tiene que sumar lo que publica OBRAS', () => {
  const vencs = vencimientosPendientes(filasDelCliente(FILAS_COBRANZAS, SF), { hasta: CORTE })
  const cartera = carteraDeCuadro2(FILAS_OBRAS, SF)
  const movs = movimientosCobrados(filasDelCliente(FILAS_COBRANZAS, SF), {
    desde: serialDeISO('2026-01-01'), hasta: CORTE,
  })
  assert.deepEqual(controles({ obras: [], vencimientos: vencs, cartera, movimientos: movs }), [])

  // Si se pierde una fila del detalle, el control lo canta con los dos importes exactos.
  const mutilado = vencs.filter((v) => v.total !== 17553946)
  const avisos = controles({ obras: [], vencimientos: mutilado, cartera, movimientos: movs })
  assert.deepEqual(avisos, [
    'El detalle de vencimientos suma $ 71.523.390 y OBRAS cuadro 2 publica $ 89.077.336 de resta (fila 11).',
  ])

  // Y sin dólares de por medio, el aviso no habla de dólares.
  const sinCobros = controles({ obras: [], vencimientos: vencs, cartera, movimientos: [] })
  assert.deepEqual(sinCobros, [
    'El detalle de cobros suma $ 0 y OBRAS cuadro 2 publica $ 119.765.646 (fila 11).',
  ])
})

test('EL DEFECTO: valuar el dólar con otro TC descuadra $23M sin un solo error a la vista', () => {
  const movs = movimientosCobrados(filasDelCliente(FILAS_COBRANZAS, Q), {
    desde: serialDeISO('2026-01-01'), hasta: CORTE,
  })
  const vencs = vencimientosPendientes(filasDelCliente(FILAS_COBRANZAS, Q), { hasta: CORTE })
  const cartera = carteraDeCuadro2(FILAS_OBRAS, Q)
  const tc = tcDelCalendario(CALENDARIO_A2)
  // Con el dólar del Calendario el detalle cierra contra OBRAS al centavo.
  assert.deepEqual(controles({ obras: [], vencimientos: vencs, cartera, movimientos: movs, tipoCambio: tc }), [])
  // Con el dólar de la factura NO cierra: son $628.535 de diferencia, y el control la ve.
  const conTcFactura = controles({ obras: [], vencimientos: vencs, cartera, movimientos: movs, tipoCambio: 1550 })
  assert.equal(conTcFactura.length, 1)
  assert.ok(conTcFactura[0].includes('$ 103.188.419'), conTcFactura[0])
})

test('el tipo de cambio se lee de la frase de Calendario!A2, no se pasa a mano', () => {
  assert.equal(tcDelCalendario(CALENDARIO_A2), 1509.186)
  assert.equal(tcDelCalendario('sin la frase'), null)
})

test('la equivalencia en dólares sale del rótulo de la fila, no de una cuenta inventada', () => {
  // "Resto 50 % s/ contrato 97.650.000 — certificación quincenal 1/9" + U$S 63.000 del contrato.
  const vencs = vencimientosPendientes(FILAS_QUATTROPANI, { hasta: CORTE })
  const eq = equivalenciaUsd({ usdTotal: 63000, contratadoPesos: 97650000, vencimientos: vencs })
  assert.equal(eq.fraccionSaldo, 0.5)
  assert.equal(eq.cuotas, 9)
  assert.equal(eq.usdPorCuota, 3500)
  assert.equal(eq.usdSaldo, 31500)
  assert.equal(eq.tcImplicito, 1550, '97.650.000 ÷ 63.000: el dólar al que se cargaron las filas')
})

test('sin contrato en dólares no hay equivalencia — San Francisco no muestra USD', () => {
  const vencs = vencimientosPendientes(filasDelCliente(FILAS_COBRANZAS, SF), { hasta: CORTE })
  assert.equal(equivalenciaUsd({ usdTotal: null, contratadoPesos: 47590272, vencimientos: vencs }), null)
})

test('el contrato de un cliente NUNCA se hereda del de al lado', () => {
  const q = contratoDeclarado(Q)
  assert.equal(q.moneda, 'USD')
  assert.ok(q.anteAtraso.includes('suspender los trabajos'))
  assert.ok(!/punitorio/i.test(q.anteAtraso.replace(/no pacta interés punitorio/i, '')))
  const sf = contratoDeclarado(SF)
  assert.ok(sf.anteAtraso.includes('no existe cláusula de mora ni interés punitorio'))
  // Un cliente sin contrato declarado no recibe el de Quattropani.
  const otro = contratoDeclarado('MESSINA')
  assert.equal(otro.formaPago, 'A confirmar por Administración')
  assert.equal(otro.usdTotal, null)
})

test('cada obra engancha su cotización por el rótulo que publica OBRAS', () => {
  const sf = contratoDeclarado(SF)
  const obras = obrasDeCuadro3(FILAS_OBRAS, SF)
  assert.equal(cotizacionDeObra(sf, obras[0].rotulo).documento, 'PRESUPUESTO - PISOS TOTALES 9:6:26.pdf')
  assert.equal(cotizacionDeObra(sf, obras[1].rotulo).fecha, '21/07/2026')
  // Quattropani tiene un contrato solo: no hay desglose por obra que colgar.
  assert.equal(cotizacionDeObra(contratoDeclarado(Q), obrasDeCuadro3(FILAS_OBRAS, Q)[0].rotulo), null)
})

test('el modelo completo de Quattropani, número por número', () => {
  const m = armarEstadoDeCuenta({
    cliente: Q, corte: CORTE, filasCobranzas: FILAS_COBRANZAS, filasObras: FILAS_OBRAS,
    calendarioA2: CALENDARIO_A2,
  })
  assert.equal(fechaAR(m.periodo.desde), '01/01/2026')
  assert.equal(m.movimientos.length, 4)
  // $65.678.419 + $23.870.000 (U$S 15.400 a 1.550) + $7.130.000 + $6.510.000
  assert.equal(Math.round(m.cobradoDelPeriodo), 103188419)
  assert.equal(m.cobradoSinValuar, 0)
  assert.equal(m.vencimientos.length, 9)
  assert.equal(m.aging.total, 59078250)
  assert.equal(m.equivalencia.usdPorCuota, 3500)
  assert.equal(m.tipoCambio.valor, 1509.186)
  assert.deepEqual(m.controles, [], 'el documento de Quattropani sale limpio')
})

test('el modelo completo de San Francisco, número por número', () => {
  const m = armarEstadoDeCuenta({
    cliente: SF, corte: CORTE, filasCobranzas: FILAS_COBRANZAS, filasObras: FILAS_OBRAS,
    calendarioA2: CALENDARIO_A2,
  })
  assert.equal(m.obras.length, 4)
  assert.equal(m.movimientos.length, 10)
  assert.equal(m.cobradoDelPeriodo, 119765646)
  assert.equal(m.vencimientos.length, 14)
  assert.equal(m.aging.bandas['Por vencer'], 89077336)
  assert.equal(m.aging.vencido, 0)
  assert.equal(m.equivalencia, null, 'contrato en pesos: no se muestra ninguna equivalencia')
  assert.deepEqual(m.controles, [], 'con la fila 99 cargada, ya no falta nada del contrato')
})

test('EL FRENO: sin la fila 99, el modelo de San Francisco no sale limpio', () => {
  // Es el estado en que estuvo la pestaña hasta el 24/08. Mandar ese documento le habría dicho al
  // cliente que su deuda por Pisos era $23.795.136 cuando el contrato pedía $41.349.082.
  const sinLa99 = FILAS_COBRANZAS.map((f, i) => (i === 98 ? [] : f))
  const obrasViejas = FILAS_OBRAS.map((f, i) => (i === 21
    ? f.map((c, k) => (k === 4 ? '$23.795.136' : c)) : f))
  const cuadro2Viejo = obrasViejas.map((f, i) => (i === 10
    ? f.map((c, k) => (k === 4 ? '71.523.390' : c)) : f))
  const m = armarEstadoDeCuenta({
    cliente: SF, corte: CORTE, filasCobranzas: sinLa99, filasObras: cuadro2Viejo,
    calendarioA2: CALENDARIO_A2,
  })
  assert.equal(m.controles.length, 1)
  assert.ok(m.controles[0].includes('PISOS INDUSTRIALES'))
  assert.ok(m.controles[0].includes('$ 17.553.946'))
  assert.ok(m.controles[0].includes('OBRAS fila 22'))
})
