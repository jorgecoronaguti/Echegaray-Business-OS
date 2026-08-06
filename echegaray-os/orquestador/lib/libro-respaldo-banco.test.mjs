// EL EXTRACTO COMO TESTIGO, EN FRÍO — con las filas REALES de `_BANCO_RAW` del 06/08/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  debitosDelExtracto, corteDelExtracto, pagosDeResumen, cubiertaPorResumen,
  respaldoEnLote, PARTES_MAXIMAS, HOLGURA_LOTE, chequesCubiertosPorBanco,
} from './libro-respaldo-banco.mjs'
import { NAT } from './banco-santander.mjs'

// Las filas son las del archivo vivo, copiadas tal cual (A fecha · B concepto · C importe · D saldo ·
// E entra/sale · F naturaleza). 46237 = 03/08/2026, 46209 = 06/07/2026, 46174 = 01/06/2026.
const BANCO = [
  ['_BANCO_RAW — extracto del Banco Santander'],
  ['356 movimientos…'],
  ['Fecha', 'Concepto', 'Importe', 'Saldo después', 'Entra o sale', 'Naturaleza'],
  [46174, 'Pago de honorarios - 260601507 260601507', -3000000, 0, 'sale', NAT.transferencias],
  [46174, 'Pago tarjeta de credito visa - Deb. automatico 01/06/2026', -357119.31, 0, 'sale', NAT.tarjeta],
  [46209, 'Pago tarjeta de credito visa - Deb. automatico 06/07/2026', -1264991.58, 0, 'sale', NAT.tarjeta],
  [46223, 'Transferencia realizada - A herrajes san juan / -', -750000, 0, 'sale', NAT.transferencias],
  [46237, 'Debito transf. online banking emp - A ana laura echegaray ovi', -3000000, 0, 'sale', NAT.transferencias],
  [46237, 'Pago tarjeta de credito visa', -1384664.47, 0, 'sale', NAT.tarjeta],
  [46237, 'Pago de honorarios - 260803507', -3000000, 0, 'sale', NAT.transferencias],
  [46238, 'Deposito de efectivo - Tarj nro. 5892…', 3000000, 0, 'entra', NAT.traslados],
  [46240, 'Cheque debitado', -470945, 0, 'sale', NAT.cheques],
]

test('los débitos salen en MAGNITUD y el depósito no es un débito', () => {
  const d = debitosDelExtracto(BANCO)
  assert.equal(d.length, 8, 'ocho salidas; el depósito de $3.000.000 del 46238 no cuenta')
  assert.ok(d.every((x) => x.importe > 0), 'el sentido lo da el nombre de la función, no el signo del dato')
  assert.ok(!d.some((x) => x.fecha === 46238), 'un ingreso no respalda un pago')
})

test('el corte del extracto se DERIVA del dato: la última fecha publicada', () => {
  assert.equal(corteDelExtracto(BANCO), 46240)
  assert.equal(corteDelExtracto([]), null, 'sin extracto no hay corte que inventar')
})

// ── B · LA CUOTA DE TARJETA QUE EL RESUMEN YA PAGÓ ────────────────────────────────────────────────

test('TARJETA: "Compra con tarjeta de débito" NO es un pago de resumen', () => {
  // Se parecen en el texto y son cosas opuestas: el débito sale en el momento y no cancela ninguna
  // cuota. Por eso el filtro es por naturaleza exacta y no por un /tarjeta/ sobre el concepto.
  const conDebito = [...BANCO,
    [46239, 'Compra con tarjeta de debito - Ypf san juan', -176581.09, 0, 'sale', NAT.tarjetaDebito]]
  const pagos = pagosDeResumen(conDebito)
  assert.equal(pagos.length, 3, 'sólo los tres pagos de resumen')
  assert.ok(!pagos.some((p) => p.naturaleza === NAT.tarjetaDebito))
})

test('TARJETA: la cuota que vence el 02/08 la contiene el débito del 03/08 — el caso real', () => {
  // MEDIDO EN VIVO (06/08): "Tarjeta de Credito" f46, Pinturería Córdoba, cuota 1/3, $263.813,91,
  // fecha de pago 46236 (02/08), sin la marca DEBITADO. El resumen se debitó el 46237 (03/08) por
  // $1.384.664,47. Sin esta regla la cuota seguía COMPROMETIDA y el tramo "Vencido" de la escalera
  // decía −$487.814 cuando el vencido real son los $224.000 de PEDRO TELLO.
  const pagos = pagosDeResumen(BANCO)
  assert.equal(cubiertaPorResumen(46236, pagos), 46237, 'el primer débito en o después del vencimiento')
})

test('TARJETA: sin débito posterior al vencimiento, la cuota SIGUE comprometida', () => {
  // Es la mitad conservadora y es la que importa: sin evidencia de que la plata salió, darla por
  // pagada sacaría de la escalera un compromiso vivo.
  const pagos = pagosDeResumen(BANCO)
  assert.equal(cubiertaPorResumen(46267, pagos), null, 'la cuota de 02/09 todavía no se debitó')
  assert.equal(cubiertaPorResumen(0, pagos), null, 'una cuota sin fecha no tiene vencimiento que medir')
  assert.equal(cubiertaPorResumen(46236, []), null, 'sin extracto no hay testigo')
})

test('TARJETA: se elige el PRIMER débito que la contiene, no el último', () => {
  // Una cuota vieja pertenece al resumen de SU ciclo. Tomar el último débito la fecharía meses
  // después de que salió, y el cash flow mostraría el egreso en el mes equivocado.
  assert.equal(cubiertaPorResumen(46100, pagosDeResumen(BANCO)), 46174)
})

// ── C · EL PAGO "HECHO" CON FECHA FUTURA, PARTIDO CONTRA EL EXTRACTO ──────────────────────────────

test('LOTE: los $9.000.000 de Dirección se respaldan con los 2×$3.000.000 del 03/08 — el caso real', () => {
  const d = debitosDelExtracto(BANCO)
  const r = respaldoEnLote(9000000, 46244, d, { corte: 46240 })
  assert.equal(r.cubierto, 6000000, 'dos de los tres socios ya cobraron')
  assert.equal(r.fecha, 46237, 'REAL a la fecha del débito, no a la fecha prevista')
  assert.equal(r.filas.length, 2)
})

test('LOTE: un débito SUELTO que divide el importe no es un lote — la trampa de los $750.000', () => {
  // La transferencia a Herrajes San Juan es de $750.000 y 9.000.000/750.000 = 12: divide exacto y no
  // tiene absolutamente nada que ver. Lo que hace a un lote es que sean VARIOS del MISMO monto el
  // MISMO día — la firma de una distribución, no una coincidencia aritmética.
  const soloSuelto = debitosDelExtracto(BANCO).filter((x) => x.importe === 750000)
  const r = respaldoEnLote(9000000, 46244, soloSuelto, { corte: 46240 })
  assert.equal(r.cubierto, 0)
  assert.match(r.motivo, /ningún lote/)
})

test('LOTE: dos lotes candidatos = NO se empareja, y se dice cuál es el problema', () => {
  // Ante la duda el compromiso sigue vivo. Los dos errores no valen lo mismo: decir que se debe de
  // más cuesta oportunidad; decir que se debe de menos planifica un pago que no se puede hacer.
  const conOtroLote = [...debitosDelExtracto(BANCO),
    { fecha: 46235, concepto: 'x', importe: 4500000, naturaleza: '', fila: 900 },
    { fecha: 46235, concepto: 'y', importe: 4500000, naturaleza: '', fila: 901 }]
  const r = respaldoEnLote(9000000, 46244, conOtroLote, { corte: 46240 })
  assert.equal(r.cubierto, 0, 'no adivina cuál de los dos es')
  assert.match(r.motivo, /2 lotes/)
})

test(`LOTE: un lote de más de ${PARTES_MAXIMAS} partes no explica un bloque mensual`, () => {
  // Dos débitos de $200.000 "dividen" $9.000.000 en 45 partes. Un bloque de nómina tiene tres socios
  // o cinco sueldos, no cuarenta y cinco: sin este límite cualquier par de débitos chicos explica
  // cualquier total. Medido en vivo, el 46198 tenía tres débitos de $200.000.
  const chicos = [
    { fecha: 46230, concepto: 'a', importe: 200000, naturaleza: '', fila: 800 },
    { fecha: 46230, concepto: 'b', importe: 200000, naturaleza: '', fila: 801 },
  ]
  assert.equal(respaldoEnLote(9000000, 46244, chicos, { corte: 46240 }).cubierto, 0)
})

test('LOTE: un débito posterior al corte no respalda nada, y uno ya usado tampoco', () => {
  const d = debitosDelExtracto(BANCO)
  assert.equal(respaldoEnLote(9000000, 46244, d, { corte: 46236 }).cubierto, 0,
    'con el corte antes del 03/08 el banco todavía no publicó esos débitos')
  const usados = new Set(d.filter((x) => x.importe === 3000000 && x.fecha === 46237).map((x) => x.fila))
  assert.equal(respaldoEnLote(9000000, 46244, d, { corte: 46240, usados }).cubierto, 0,
    'un débito respalda a UN solo movimiento: reclamado dos veces daría por pagada plata que salió una vez')
})

test(`LOTE: la holgura es de ${HOLGURA_LOTE} días — un lote viejo no respalda un pago de hoy`, () => {
  const d = debitosDelExtracto(BANCO)
  const r = respaldoEnLote(9000000, 46244, d, { corte: 46240, holgura: 3 })
  assert.equal(r.cubierto, 0, 'con tres días de holgura el lote del 03/08 queda fuera de la ventana')
})

test('LOTE: sin corte no se decide nada — el motivo lo dice', () => {
  const r = respaldoEnLote(9000000, 46244, debitosDelExtracto(BANCO), { corte: null })
  assert.equal(r.cubierto, 0)
  assert.match(r.motivo, /sin corte/)
})

test('CHEQUES YA DEBITADOS (06/08): la cuota de Diesel cubierta, la de $1 de diferencia NO', () => {
  // El caso real: el banco debitó 2 cheques de $500.000 (24/07, refs 314/315) y el libro contaba la
  // cuota de Diesel como COMPROMETIDA al 12/08. Y la contraprueba del $1: el débito de $470.945 no
  // cubre la cuota de $470.944 — ese débito es el cheque 313, que el libro ya tiene como REAL.
  const debitos = [
    { fecha: 46237, concepto: 'Cheque debitado', importe: 500000, fila: 10 },
    { fecha: 46237, concepto: 'Cheque debitado', importe: 500000, fila: 11 },
    { fecha: 46240, concepto: 'Cheque debitado', importe: 470945, fila: 12 },
    { fecha: 46240, concepto: 'Debito transf. online banking emp', importe: 500000, fila: 13 },
  ]
  const movs = [
    { signo: -1, instrumento: 'cheque', estado: 'COMPROMETIDO', importe: 500000, fecha: 46246, concepto: 'Diesel · cheque 316' },
    { signo: -1, instrumento: 'cheque', estado: 'COMPROMETIDO', importe: 510000, fecha: 46246, concepto: 'Diesel · cheque 316b' },
    { signo: -1, instrumento: 'cheque', estado: 'COMPROMETIDO', importe: 470944, fecha: 46251, concepto: 'Corralón · cheque 312' },
    { signo: -1, instrumento: 'cheque', estado: 'REAL', importe: 470945, fecha: 46240, concepto: 'Corralón · cheque 313' },
  ]
  const { cubiertos, avisos } = chequesCubiertosPorBanco(movs, debitos)
  assert.equal(cubiertos.size, 1, 'sólo la cuota con débito exacto no consumido')
  assert.ok(cubiertos.has(0), 'la cuota de $500.000 queda cubierta')
  assert.equal(cubiertos.get(0).fecha, 46237)
  assert.ok(!cubiertos.has(1), 'la de $510.000 no tiene débito exacto: sigue comprometida')
  assert.ok(!cubiertos.has(2), 'el $1 de diferencia es señal: 470.944 ≠ 470.945')
  assert.equal(avisos.length, 0)
})

test('un REAL consume su débito primero: el mismo papel no paga dos veces', () => {
  const debitos = [{ fecha: 46240, concepto: 'Cheque debitado', importe: 470945, fila: 12 }]
  const movs = [
    { signo: -1, instrumento: 'cheque', estado: 'REAL', importe: 470945, fecha: 46240, concepto: 'ya contado' },
    { signo: -1, instrumento: 'cheque', estado: 'COMPROMETIDO', importe: 470945, fecha: 46251, concepto: 'otro papel igual' },
  ]
  const { cubiertos } = chequesCubiertosPorBanco(movs, debitos)
  assert.equal(cubiertos.size, 0, 'el débito ya lo consumió el REAL: el pendiente sigue pendiente')
})

test('más pendientes que débitos del mismo importe = ambiguo: no se cubre ninguno y se avisa', () => {
  const debitos = [{ fecha: 46237, concepto: 'Echeq canje interno recibido 24hs', importe: 200000, fila: 9 }]
  const movs = [
    { signo: -1, instrumento: 'echeq', estado: 'COMPROMETIDO', importe: 200000, fecha: 46250, concepto: 'a' },
    { signo: -1, instrumento: 'echeq', estado: 'COMPROMETIDO', importe: 200000, fecha: 46260, concepto: 'b' },
  ]
  const { cubiertos, avisos } = chequesCubiertosPorBanco(movs, debitos)
  assert.equal(cubiertos.size, 0)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /ambiguo/)
})
