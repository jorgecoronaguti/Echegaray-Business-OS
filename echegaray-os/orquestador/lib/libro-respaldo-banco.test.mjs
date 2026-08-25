// EL EXTRACTO COMO TESTIGO, EN FRÍO — con las filas REALES de `_BANCO_RAW` del 06/08/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  debitosDelExtracto, corteDelExtracto, pagosDeResumen, cubiertaPorResumen,
  respaldoEnLote, PARTES_MAXIMAS, HOLGURA_LOTE, chequesCubiertosPorBanco, AVISO_CASI,
} from './libro-respaldo-banco.mjs'
import { cuotasEnCheque } from './libro-extractores-compras.mjs'
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

// ── D · EL CHEQUE QUE PAGA VARIAS FACTURAS: EL BANCO LO DEBITA UNA VEZ, POR EL TOTAL ──────────────

/** Las tres cuotas vivas del echeq 365 de Con-Sec, medidas en `_MOVIMIENTOS` el 25/08/2026: mismo
 *  papel, tres filas de Compras (f668, f703, f720), las tres VENCIDO al 24/08 (serial 46258). */
const CUOTAS_365 = [
  { i: 0, importe: 1191295, filaCompras: 668 },
  { i: 1, importe: 436295, filaCompras: 703 },
  { i: 2, importe: 72410, filaCompras: 720 },
]
const cuota365 = ({ importe, filaCompras }, extra = {}) => ({
  signo: -1, instrumento: 'echeq', estado: 'VENCIDO', importe, fecha: 46258,
  concepto: 'Con-Sec - Lopez Claudia Alejandra · echeq 365',
  origen: { pestana: 'Compras', fila: `${filaCompras} · cheque 40` },
  ...extra,
})
const ECHEQ_365 = CUOTAS_365.map((c) => cuota365(c))
/** El débito real de `_BANCO_RAW` del 25/08/2026: −1.700.000, saldo 6.311.573,19. */
const CLEARING = { fecha: 46259, concepto: 'Echeq clearing recibido 48hs', importe: 1700000, fila: 300 }

test('MULTIFACTURA (25/08): el echeq 365 partido en tres cuotas lo cubre UN débito por la suma', () => {
  // EL DEFECTO MEDIDO: la tarjeta "DEUDA ATRASADA Y DEL MES" publicaba $29.038.270 con $1.700.000
  // adentro que ya habían salido del banco. Ningún importe individual (1.191.295 / 436.295 / 72.410)
  // coincide con el débito de 1.700.000, así que el cruce por importe exacto no cubría ninguna cuota
  // y la deuda sobrevivía a su propio pago.
  const { cubiertos, avisos } = chequesCubiertosPorBanco(ECHEQ_365, [CLEARING])
  assert.equal(cubiertos.size, 3, 'las tres cuotas del mismo papel se cubren juntas o no se cubre ninguna')
  for (const c of CUOTAS_365) {
    assert.equal(cubiertos.get(c.i)?.fecha, 46259, `f${c.filaCompras} queda REAL a la fecha del débito`)
    assert.equal(cubiertos.get(c.i)?.fila, 300)
  }
  assert.equal(avisos.length, 0)
})

test('MULTIFACTURA: con $1.699.999 no se cubre ninguna — el peso sigue siendo señal', () => {
  // La agrupación no trae ninguna tolerancia nueva: la suma del grupo se compara EXACTA contra el
  // débito, igual que el importe individual. El $1 ya probó ser señal (el cheque 313 del 06/08).
  const { cubiertos } = chequesCubiertosPorBanco(ECHEQ_365, [{ ...CLEARING, importe: 1699999 }])
  assert.equal(cubiertos.size, 0)
})

test('MULTIFACTURA: dos echeqs distintos que suman lo mismo y UN débito = ambiguo, no cubro ninguno', () => {
  // Es la misma prudencia del conteo por importe, un nivel más arriba: con dos papeles candidatos al
  // mismo débito, decir cuál se pagó es adivinar — y decir "pagado" de más rompe una tesorería.
  const otro = [
    cuota365({ importe: 1000000, filaCompras: 801 }, { concepto: 'Otro proveedor · echeq 999', origen: { pestana: 'Compras', fila: '801 · cheque 55' } }),
    cuota365({ importe: 700000, filaCompras: 802 }, { concepto: 'Otro proveedor · echeq 999', origen: { pestana: 'Compras', fila: '802 · cheque 55' } }),
  ]
  const { cubiertos, avisos } = chequesCubiertosPorBanco([...ECHEQ_365, ...otro], [CLEARING])
  assert.equal(cubiertos.size, 0, 'ni las del 365 ni las del 999')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /ambiguo/)
})

test('MULTIFACTURA: un cheque de UNA sola factura cruza como siempre — el camino viejo no cambia', () => {
  const sola = [cuota365({ importe: 1700000, filaCompras: 900 }, { concepto: 'Con-Sec · echeq 366', origen: { pestana: 'Compras', fila: '900 · cheque 41' } })]
  const { cubiertos, avisos } = chequesCubiertosPorBanco(sola, [CLEARING])
  assert.equal(cubiertos.size, 1, 'un grupo de una cuota vale su propio importe')
  assert.equal(cubiertos.get(0).fecha, 46259)
  assert.equal(avisos.length, 0)
})

test('MULTIFACTURA: si un REAL ya consumió el débito, el grupo NO se cubre', () => {
  // El mismo papel no paga dos veces: lo REAL consume primero, y lo que queda libre es lo único que
  // puede respaldar un pendiente.
  const movs = [
    { signo: -1, instrumento: 'echeq', estado: 'REAL', importe: 1700000, fecha: 46259, concepto: 'otro echeq ya contado' },
    ...ECHEQ_365,
  ]
  const { cubiertos } = chequesCubiertosPorBanco(movs, [CLEARING])
  assert.equal(cubiertos.size, 0, 'el único débito de $1.700.000 ya estaba tomado')
})

test('MULTIFACTURA: una cuota REAL del mismo papel NO entra en la suma del grupo pendiente', () => {
  // Lo REAL ya está adentro del saldo del banco: sumarlo al grupo pediría un débito por el total del
  // papel que el extracto nunca va a tener dos veces, y el grupo pendiente quedaría vivo para siempre.
  const movs = [
    cuota365(CUOTAS_365[0], { estado: 'REAL' }),
    cuota365(CUOTAS_365[1]),
    cuota365(CUOTAS_365[2]),
  ]
  const debitos = [
    { fecha: 46256, concepto: 'Echeq clearing recibido 48hs', importe: 1191295, fila: 290 },
    { fecha: 46259, concepto: 'Echeq clearing recibido 48hs', importe: 508705, fila: 300 },
  ]
  const { cubiertos } = chequesCubiertosPorBanco(movs, debitos)
  assert.equal(cubiertos.size, 2, '436.295 + 72.410 = 508.705, sin la cuota REAL')
  assert.equal(cubiertos.get(1).fila, 300)
  assert.equal(cubiertos.get(2).fila, 300)
})

test('CONTRATO con cuotasEnCheque: el número del papel viaja en la frase que ese archivo arma', () => {
  // El número del cheque NO sobrevive a `movimiento()` (sólo alimenta `clave`), así que la única
  // huella del papel en una cuota es el texto que escribe `cuotasEnCheque`. Este test llama a la
  // función REAL: si mañana cambia la frase o el formato del origen, el agrupador deja de agrupar y
  // los $1.700.000 vuelven a la deuda sin que nada dé error. Que falle acá.
  const base = { signo: -1, concepto: 'Con-Sec - Lopez Claudia Alejandra', contraparte: 'Con-Sec', instrumento: 'echeq', rubro: 'Materiales' }
  const movs = CUOTAS_365.flatMap((c) => cuotasEnCheque(
    base,
    [{ filaCheque: 40, numero: '365', instrumento: 'echeq', importe: c.importe, fechaPago: 46258 }],
    46259,
    { fila: c.filaCompras, comprobante: `A-0001-0000${c.filaCompras}` },
  ))
  assert.equal(movs.length, 3)
  assert.ok(movs.every((m) => m.estado === 'VENCIDO'), 'las tres vencidas al 24/08, como en el Sheet vivo')
  const { cubiertos } = chequesCubiertosPorBanco(movs, [CLEARING])
  assert.equal(cubiertos.size, 3, 'el agrupador reconoce el papel en lo que cuotasEnCheque escribe')
})

test('MULTIFACTURA: el grupo que casi coincide NO se cubre, pero deja de ser mudo — el caso vivo', () => {
  // LEÍDO DEL SHEET VIVO EL 25/08/2026 (sólo lectura): las tres cuotas del echeq 365 son
  // $1.191.294,61 + $436.294,54 + $72.410,03 = $1.699.999,18, y el débito f473 del extracto es
  // $1.700.000,00. Los 82 centavos son el redondeo con que se libró el papel: `repartirPorCompra` le
  // da a cada factura SU total, así que el valor nominal del cheque no existe en el libro. La regla
  // es exacta y no lo cubre — pero lo dice, que es la diferencia entre un límite y un agujero.
  const reales = [
    cuota365({ importe: 1191294.61, filaCompras: 668 }),
    cuota365({ importe: 436294.54, filaCompras: 703 }),
    cuota365({ importe: 72410.03, filaCompras: 720 }),
  ]
  const { cubiertos, avisos } = chequesCubiertosPorBanco(reales, [{ ...CLEARING, fila: 473 }])
  assert.equal(cubiertos.size, 0, 'exacto es exacto: los 82 centavos no se regalan')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /1699999\.18/)
  assert.match(avisos[0], /f473/)
  assert.match(avisos[0], /NO lo cubro/)
})

test(`MULTIFACTURA: a $${AVISO_CASI} de diferencia no hay aviso — el peso sigue siendo señal, no redondeo`, () => {
  const { cubiertos, avisos } = chequesCubiertosPorBanco(ECHEQ_365, [{ ...CLEARING, importe: 1700001 }])
  assert.equal(cubiertos.size, 0)
  assert.equal(avisos.length, 0, 'un peso de diferencia es otro cheque, no el redondeo de éste')
})

test('MULTIFACTURA: una cuota SOLA que casi coincide no avisa — no arrastra el redondeo de ningún papel', () => {
  const sola = [cuota365({ importe: 1699999.18, filaCompras: 900 }, { concepto: 'X · echeq 400', origen: { pestana: 'Compras', fila: '900 · cheque 60' } })]
  const { avisos } = chequesCubiertosPorBanco(sola, [CLEARING])
  assert.equal(avisos.length, 0)
})
