// LOS EXTRACTORES, EN FRÍO — filas armadas a mano, con los casos que ya costaron plata.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deCompras, deCobranzas, deChequesEmitidos, deBancoCargos,
  deTarjetaSinFactura, deImpuestosCalendario, deCartera,
} from './libro-extractores.mjs'
import { ENTRA, SALE } from './libro-movimientos.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { INSTRUMENTOS } from './cash-flow-lineas.mjs'
import { serialDe, isoDeSerial } from './libro-extractores-fechas.mjs'

// ── Compras: título, agrupador, encabezado, datos ─────────────────────────────────────────────────
// Los nombres del encabezado REAL de la fila 3 del archivo, verificados el 05/08.
// 'Estado' es la columna INPUT (X, contrato del cargador: Pagado/Pendiente); 'Estado pago' es el
// SEMÁFORO derivado ("✅ Pagado" / "🟡 Por vencer"). El extractor tiene que decidir por la primera:
// contra el semáforo, /pagado/ no matcheaba nunca y toda compra pagada quedaba PROYECTADO.
// 'Cliente / Asignación' (la J del archivo) es la que dice de qué CLIENTE es el egreso; 'Detalles /
// Obra' (la K) es texto libre —"combustible", "Cuota 18", "46381"— y no sirve para eso.
// 'Monto Pagado' y 'Cliente / Asignación' van ÚLTIMAS a propósito: las filas de abajo tienen 9 celdas
// y las dejan vacías, que es el caso normal (nada pagado a cuenta, sin cliente asignado). Las pruebas
// del saldo parcial y las del cliente las completan explícitamente.
const ENC_COMPRAS = ['Proveedor', 'CUIT (OS)', 'N° Comprobante', 'Total', 'Estado',
  'Tipo pago', 'Rubro de caja', 'Fecha de caja', 'Detalles / Obra', 'Estado pago', 'Monto Pagado',
  'Cliente / Asignación']
const compras = (extra = []) => [[], [], ENC_COMPRAS,
  ['Mariana SA', '30-71037035-0', '0002-00000683', 100000, 'Pagado', 'Transferencia', 'Materiales Civil', 46000, 'ARCOR'],
  ['Nota SA', '30-71037035-0', '0002-00000683', -21359, 'Pagado', 'Transferencia', 'Materiales Civil', 46001, ''],
  ['Cheq SA', '20-11111111-1', '0001-00000001', 50000, 'Pagado', 'Cheque', 'Materiales Civil', 46002, ''],
  ['Prov SRL', '', '', 70000, 'Pendiente', 'Transferencia', 'Estructura', 45990, ''],
  ...extra]

test('COMPRAS: la factura pagada con CHEQUE también sale por acá — el calendario no filtra el tipo', () => {
  // CAMBIO DE CONTRATO (05/08): antes se salteaba "para que no la contara dos veces", y el resultado
  // era que no la contaba NINGUNA vez. El calendario de CAJA suma Compras con un SUMIFS por rubro y
  // fecha sin mirar el tipo de pago, y del lado de los cheques suma sólo los marcados "FALTA la
  // factura". Las dos puertas se separan por la MARCA, no por el tipo de pago.
  const ms = deCompras(compras(), 46000)
  const conCheque = ms.find((m) => m.concepto === 'Cheq SA')
  assert.ok(conCheque, 'sin esta fila, esa plata no estaba en el libro por ninguna puerta')
  assert.equal(conCheque.instrumento, 'cheque')
  // Y su clave es la del comprobante, no la del cheque: no puede colisionar con "Cheques Emitidos".
  assert.ok(conCheque.clave.startsWith('comp:'), conCheque.clave)
})

test('COMPRAS: la NÓMINA no sale de Compras — la planilla es la fuente y acá duplicaría $30,5M', () => {
  const conNomina = compras([
    ['Jornales', '', '', 8000000, 'Pagado', 'Transferencia', 'Nómina · Jornales de obra', 46000, ''],
    ['Jorge Corona', '', '', 3000000, 'Pagado', 'Transferencia', 'Nómina · Sueldos administración', 46000, ''],
  ])
  const ms = deCompras(conNomina, 46000)
  assert.ok(!ms.some((m) => /Nómina/.test(m.rubro)), 'la nómina entra por libro-extractores-nomina.mjs')
})

test('COMPRAS: "Pagado" con echeq y fecha POSTERIOR al corte es COMPROMETIDO, no REAL', () => {
  // EL DEFECTO MEDIDO EN VIVO (06/08). Cuatro filas por $2.569.676 netos —Alumetal, FEMENIA, DUPEC,
  // Hormiserv— marcadas "Pagado" con echeq/cheque y fecha de caja posterior al corte del extracto
  // salían de acá como REAL. Un REAL no lo mira NINGUNA de las tres vistas de proyección (CAJA
  // COMPROMETIDA, CAJA PROYECTADA 30 DÍAS, la escalera de vencimientos), que filtran por
  // COMPROMETIDO/PROYECTADO/VENCIDO — y tampoco lo restaba ningún saldo: el extracto termina en el
  // corte y la línea de posteriores mira sólo Transferencia y Débito. Esa plata no existía en el cuadro.
  const ms = deCompras(compras([
    ['FEMENIA', '30-11111111-1', '00002-00001071', 1839200, 'Pagado', 'Echeq', 'Materiales Civil', 46264, ''],
    ['Barcelo', '30-22222222-2', '00131-00016807', 203132, 'Pagado', 'Débito', 'Materiales Civil', 46246, ''],
  ]), 46240)
  const echeq = ms.find((m) => m.concepto === 'FEMENIA')
  assert.equal(echeq.estado, 'COMPROMETIDO', 'el cheque sale de tus manos, no de tu cuenta: hasta el débito es un compromiso')
  // Y la otra mitad NO se toca: un débito posterior al corte SÍ lo resta la línea de posteriores, así
  // que degradarlo lo contaría dos veces —restado del saldo y proyectado en la escalera—.
  assert.equal(ms.find((m) => m.concepto === 'Barcelo').estado, 'REAL')
  // El cheque de la fila base tiene fecha 46002, muy anterior al corte: ya está en el extracto.
  assert.equal(ms.find((m) => m.concepto === 'Cheq SA').estado, 'REAL')
})

test('COMPRAS: una fila con pago PARCIAL entra por el SALDO, no por el total', () => {
  // EL DEFECTO MEDIDO EN VIVO (06/08) contra el archivo real. Dos filas abiertas de Compras con plata
  // ya entregada a cuenta —Gerson Castro $2.300.000 con $1.000.000 pagado, PEDRO TELLO $524.000 con
  // $300.000 pagado— entraban al libro por su TOTAL. CAJA COMPROMETIDA las sumaba enteras y decía que
  // había que cubrir $1.300.000 que ya habían salido de la caja. La parte pagada no está en el libro
  // como REAL por ningún lado, así que no era doble conteo: era el número equivocado, una sola vez.
  const ms = deCompras(compras([
    ['Gerson Castro', '', '', 2300000, 'Pendiente', 'Efectivo', 'Materiales Civil', 46257, 'MESSINA', '', 1000000],
    ['PEDRO TELLO', '', '', 524000, 'Pendiente', 'Efectivo', 'Materiales Civil', 46247, 'LA ESTRELLA', '', 300000],
  ]), 46240)
  assert.equal(ms.find((m) => m.concepto === 'Gerson Castro').importe, 1300000)
  assert.equal(ms.find((m) => m.concepto === 'PEDRO TELLO').importe, 224000)
  // Y la fila SIN pago parcial no se mueve un peso: el saldo sólo aplica donde hay plata entregada.
  assert.equal(ms.find((m) => m.concepto === 'Prov SRL').importe, 70000)
})

test('COMPRAS: una fila "Pagado" NO se descuenta — ahí el instrumento vale por el total', () => {
  // El guarda que impide que el arreglo del saldo parcial reabra el agujero del cheque diferido: una
  // fila "Pagado" trae "Monto Pagado" = Total por construcción. Sin el guarda, el echeq de FEMENIA
  // por $1.839.200 que todavía no debitó daría importe 0 y desaparecería de CAJA COMPROMETIDA.
  const ms = deCompras(compras([
    ['FEMENIA', '30-11111111-1', '00002-00001071', 1839200, 'Pagado', 'Echeq', 'Materiales Civil', 46264, '', '', 1839200],
  ]), 46240)
  const echeq = ms.find((m) => m.concepto === 'FEMENIA')
  assert.equal(echeq.estado, 'COMPROMETIDO')
  assert.equal(echeq.importe, 1839200, 'el cheque entregado compromete el total, no un saldo cero')
})

test('COMPRAS: "Monto Pagado" ≥ Total sin estado Pagado avisa y manda el TOTAL', () => {
  // El caso real de la fila 457 (FCL Junio): $800.000 de Total, $800.000 de "Monto Pagado" y
  // Estado="Proyectado". Las dos columnas se contradicen. Devolver cero borraría el movimiento del
  // libro por una celda mal cargada; el libro no fabrica un saldo, avisa y arrastra el total.
  const avisos = []
  const ms = deCompras(compras([
    ['FCL', '', '', 800000, 'Proyectado', 'Transferencia', 'Nómina · Gremiales', 46213, '', '', 800000],
  ]), 46240, { aviso: (m) => avisos.push(m) })
  assert.equal(ms.find((m) => m.concepto === 'FCL').importe, 800000)
  assert.equal(avisos.length, 1, avisos.join(' / '))
  assert.match(avisos[0], /Monto Pagado/)
})

test('COMPRAS: pagado=REAL, pendiente vencido=VENCIDO', () => {
  const ms = deCompras(compras(), 46000)
  const pagado = ms.find((m) => m.concepto === 'Mariana SA')
  assert.equal(pagado.estado, 'REAL')
  assert.equal(pagado.signo, SALE)
  const pendiente = ms.find((m) => m.concepto === 'Prov SRL')
  assert.equal(pendiente.estado, 'VENCIDO', 'proyectado con fecha pasada = vencido, no proyectado')
})

test('COMPRAS: decide la columna Estado, no el semáforo — y una decoración no rompe el match', () => {
  // El caso real del 05/08: la fila 791 de Alumetal decía Estado="Pagado" y "Estado pago"="✅ Pagado".
  // Con el contrato apuntando al semáforo, /^pagado$/ contra "✅ Pagado" da false: REAL imposible.
  const ms = deCompras(compras([
    ['Decorada SA', '30-00000000-0', '0009-00000009', 123456, '✅ Pagado', 'Transferencia', 'Materiales Civil', 46003, '', '🟡 Por vencer'],
  ]), 46000)
  const dec = ms.find((m) => m.concepto === 'Decorada SA')
  assert.equal(dec.estado, 'REAL', 'la palabra manda aunque venga decorada; el semáforo no decide')
})

test('COMPRAS: una nota de crédito ENTRA — plata que vuelve, no un egreso negativo', () => {
  const nota = deCompras(compras(), 46000).find((m) => m.concepto === 'Nota SA')
  assert.equal(nota.signo, ENTRA)
  assert.equal(nota.importe, 21359, 'la magnitud queda positiva; el signo manda')
})

test('COMPRAS: sin la columna "Rubro de caja" en el encabezado, ROMPE nombrándola', () => {
  // Leer por posición produciría movimientos plausibles y equivocados.
  const sinRubro = [[], [], ENC_COMPRAS.filter((c) => c !== 'Rubro de caja')]
  assert.throws(() => deCompras(sinRubro, 46000), /Rubro de caja/)
})

// ── Cobranzas: los datos arrancan en la fila 5 ────────────────────────────────────────────────────
// Ídem: el encabezado real de la fila 4 de Cobranzas. El importe es el NETO de retenciones.
const ENC_COB = ['x', 'Obra / Cliente', 'Estado', 'TOTAL a cobrar (neto de retenciones)', 'Fecha cobro', 'Fecha cobro', 'Forma de Cobro', 'Valor banco']
const cob = [[], [], [], ENC_COB,
  ['', 'MESSINA', 'Cobrado', 500000, 46005, 46005, 'Transferencia', ''],
  ['', 'ARCOR', 'Pendiente', 300000, 45990, 45990, 'eCheq', ''],
  ['', 'ANULADA', 'CANCELAR', 999999, 46000, 46000, '', ''],
  ['', 'LA ESTRELLA', 'Pendiente', 10000000, 46060, 46060, 'eCheq', 'ENDOSADO A ALUMETAL'],
]

test('COBRANZAS: un valor ENDOSADO no va a entrar nunca — son los $20M de LA ESTRELLA', () => {
  // El echeq se entregó a Alumetal para pagarle: Cobranzas hace bien en registrarlo, pero esa plata
  // no va a pasar por la cuenta corriente. Sin el filtro, el cuadro esperaba $20.000.000 en agosto.
  const ms = deCobranzas(cob, 46000)
  assert.ok(!ms.some((m) => m.concepto === 'LA ESTRELLA'), 'el endoso no es un cobro futuro')
  // Y el filtro es por PREFIJO, como el LEFT() de la fórmula: la celda dice "ENDOSADO A ALUMETAL".
  assert.equal(deCobranzas(cob, 46000, { colValorBanco: 7 }).length, 2)
})

test('COBRANZAS: un cobro NEGATIVO es plata que vuelve — el error valía el doble del monto', () => {
  // MEDIDO EN VIVO (06/08): Cobranzas f58, MACRO CONSTRUCCIONES, −$96.800, Transferencia, 7/08.
  // `movimiento()` guarda la magnitud y el signo aparte, así que con `signo: ENTRA` fijo el ajuste
  // entraba como +$96.800. La semana del 3/08 mostraba "Ingresos reales · Cobranzas $329.120"
  // donde la fuente dice $232.320−$96.800 = $135.520. Diferencia: $193.600, el DOBLE del monto.
  const conAjuste = [...cob, ['', 'MACRO CONSTRUCCIONES', 'Cobrado', -96800, 46241, 46241, 'Transferencia', '']]
  const m = deCobranzas(conAjuste, 46240).find((x) => x.concepto === 'MACRO CONSTRUCCIONES')
  assert.equal(m.signo, SALE, 'un importe negativo invierte el signo, igual que la nota de crédito de Compras')
  assert.equal(m.importe, 96800, 'la magnitud queda positiva; el signo manda')
  // Lo que decide es el NETO de la ventana, que es lo que la columna del cuadro suma.
  const ventana = deCobranzas(conAjuste, 46240)
    .filter((x) => x.fecha === 46241)
    .reduce((a, x) => a + x.signo * x.importe, 0)
  assert.equal(ventana, -96800, 'el neto de la ventana, no la suma de magnitudes')
})

test('COBRANZAS: cobrado usa la fecha REAL, pendiente la esperada, CANCELAR no existe', () => {
  const ms = deCobranzas(cob, 46000)
  assert.ok(!ms.some((m) => m.concepto === 'ANULADA'), 'una fila anulada no es un movimiento')
  const cobrado = ms.find((m) => m.concepto === 'MESSINA')
  assert.equal(cobrado.fecha, 46005, 'manda la fecha en que la plata ENTRÓ')
  assert.equal(cobrado.estado, 'REAL')
  const pendiente = ms.find((m) => m.concepto === 'ARCOR')
  assert.equal(pendiente.estado, 'VENCIDO', 'esperado para una fecha que pasó y nadie marcó')
  assert.equal(pendiente.instrumento, 'echeq')
})

// ── Cheques Emitidos: registro con encabezado en la fila 18, datos desde la 20 ───────────────────
// El encabezado real de la fila 20 del archivo: 'Nro', 'Monto', y la fecha en minúscula.
const ENC_CH = ['Tipo', 'Nro', 'Proveedor', 'Monto', 'fecha de pago', 'DEBITADO']
const M = INSTRUMENTOS.cheques.colMarca
/** Una fila del registro, con la marca del cruce en su columna real (la 12 = M). */
const chq = (celdas, marca) => { const f = celdas.slice(); f[M] = marca; return f }
const cheques = () => {
  const filas = Array.from({ length: 24 }, () => [])
  // El registro real: encabezado en la fila 19 (índice 18), datos desde la 20 — igual que $K$20:$K.
  filas[18] = ENC_CH
  filas[19] = chq(['FISICO', '313', 'Corralón', 750000, 46010, ''], MARCAS.falta)
  filas[20] = chq(['ECHEQ', '313', 'Otro SA', 200000, 46012, ''], MARCAS.falta)
  filas[21] = chq(['FISICO', '200', 'Debitado SA', 99999, 45980, 'SI'], MARCAS.falta)
  filas[22] = chq(['FISICO', '', 'Sin número SA', 10000, 46011, ''], MARCAS.falta)
  filas[23] = chq(['FISICO', '999', 'Con factura SA', 43380472, 46013, ''], MARCAS.ok)
  return filas
}

test('CHEQUES: el no debitado es COMPROMETIDO; el debitado NO se emite — ya está en el saldo', () => {
  const ms = deChequesEmitidos(cheques(), { fila0: 20 })
  assert.equal(ms.length, 3)
  assert.ok(ms.every((m) => m.estado === 'COMPROMETIDO'))
  assert.ok(!ms.some((m) => m.concepto === 'Debitado SA'), 'restarlo otra vez fue el error de los $12,19M')
  // Y las claves distinguen FISICO 313 de ECHEQ 313.
  assert.notEqual(ms[0].clave, ms[1].clave)
  // El cheque SIN número no desaparece: su identidad es el origen (pestaña, fila).
  const sinNum = ms.find((m) => m.concepto === 'Sin número SA')
  assert.ok(sinNum.clave.startsWith('origen:'), 'sin número, la fila es la identidad')
})

test('CHEQUES: el que YA tiene factura en Compras no se emite — sumarlo contaba $43,4M dos veces', () => {
  const ms = deChequesEmitidos(cheques(), { fila0: 20 })
  assert.ok(!ms.some((m) => m.concepto === 'Con factura SA'), 'esa plata ya viaja por la puerta de Compras')
  // Y la marca se lee de la columna del contrato, no de un rótulo: su encabezado lleva la fecha.
  const sinMarcar = cheques().map((f) => { const g = f.slice(); g[M] = ''; return g })
  assert.equal(deChequesEmitidos(sinMarcar, { fila0: 20 }).length, 0,
    'lo que el OS todavía no cruzó no se puede afirmar que falte')
})

// ── Banco: sólo los cargos sin factura ────────────────────────────────────────────────────────────
test('BANCO: sólo emite los cargos del banco — el resto ya está en el saldo', () => {
  const filas = [[], [], [],
    [46000, 'IMPUESTO LEY 25413', -6000, '', -1, 'Impuesto al cheque'],
    [46000, 'ACREDITACION MESSINA', 500000, '', 1, 'cobranza'],
    [46001, 'INTERESES DESCUBIERTO', -1507, '', -1, 'Costo financiero del descubierto'],
  ]
  const ms = deBancoCargos(filas, { fila0: 4 })
  assert.equal(ms.length, 2, 'la acreditación NO se emite: duplicarla inventó $9,9M una vez')
  assert.ok(ms.every((m) => m.estado === 'REAL' && m.signo === SALE))
  assert.ok(ms.every((m) => m.rubro === 'Financiero'))
})

// ── Tarjeta de Crédito: registro con encabezado en la fila 31 ────────────────────────────────────
const T = INSTRUMENTOS.tarjeta
/** Una fila del registro de la tarjeta: monto E(4), fecha H(7), debitado J(9), marca L(11). */
const cuota = (monto, fecha, debitado, marca) => {
  const f = []
  f[4] = monto; f[7] = fecha; f[9] = debitado; f[11] = marca; f[6] = 'COMPRA VISA'
  return f
}

test('TARJETA: sólo la cuota SIN factura y NO debitada — la marca manda, no el rótulo', () => {
  const filas = Array.from({ length: 31 }, () => [])
  filas[31] = cuota(556899, 46010, '', MARCAS.falta)
  filas[32] = cuota(300000, 46011, 'SI', MARCAS.falta) // ya salió de la cuenta
  filas[33] = cuota(400000, 46012, '', MARCAS.ok) // su factura está en Compras
  filas[34] = cuota(100000, null, '', MARCAS.falta) // sin fecha: pesa YA
  const ms = deTarjetaSinFactura(filas, { filaCab: T.filaCab })
  assert.equal(ms.length, 2)
  assert.ok(ms.every((m) => m.instrumento === 'tarjeta' && m.estado === 'COMPROMETIDO' && m.signo === SALE))
  assert.deepEqual(ms.map((m) => m.importe), [556899, 100000])
  assert.equal(ms[1].fecha, 0, 'un compromiso sin fecha no es uno que no vence')
})

// ── Impuestos y Financieros: el calendario fiscal ─────────────────────────────────────────────────
const impuestos = () => {
  const filas = Array.from({ length: 20 }, () => [])
  filas[17] = ['⇒ IVA a pagar en efectivo', 1000, 0, '', 3000] // enero, febrero(0), marzo(vacío), abril
  filas[17][12] = 5000 // diciembre = columna M = índice 12
  filas[18] = ['⇒ IIBB a pagar en el mes', 200]
  return filas
}

test('IMPUESTOS: el vencimiento es fin de mes del período + 20 días — enero vence el 20/02', () => {
  const ms = deImpuestosCalendario(impuestos(), { filaIva: 18, filaIibb: 19 }, 2026, serialDe(2026, 8, 5))
  const enero = ms.find((m) => /IVA.*01\/2026/.test(m.concepto))
  assert.equal(isoDeSerial(enero.fecha), '2026-02-20')
  // Y diciembre vence en ENERO DEL AÑO SIGUIENTE, que es el caso que un mes+1 ingenuo rompe.
  const dic = ms.find((m) => /IVA.*12\/2026/.test(m.concepto))
  assert.equal(isoDeSerial(dic.fecha), '2027-01-20')
  assert.equal(dic.estado, 'PROYECTADO')
  assert.equal(enero.estado, 'VENCIDO', 'venció antes del corte y nadie lo marcó')
})

test('IMPUESTOS: un mes en cero no es un movimiento, y los doce meses no colapsan en uno', () => {
  const ms = deImpuestosCalendario(impuestos(), { filaIva: 18, filaIibb: 19 }, 2026, null)
  assert.equal(ms.length, 4, 'IVA enero, abril y diciembre + IIBB enero')
  // Los doce meses viven en la MISMA fila: sin la celda en la clave, la dedup los deja en uno.
  assert.equal(new Set(ms.map((m) => m.clave)).size, 4)
  assert.ok(ms.every((m) => m.rubro === 'Impuestos' && m.signo === SALE))
})

test('IMPUESTOS: sin las filas ubicadas por rótulo, ROMPE — una fila muerta devuelve $0 callada', () => {
  assert.throws(() => deImpuestosCalendario(impuestos(), { filaIva: 18 }, 2026), /IVA y del IIBB/)
})

// ── _CHEQUES_RAW: la cartera ──────────────────────────────────────────────────────────────────────
// Columnas de la réplica: A tipo · B número · C banco · D librador · F fecha de pago · G importe · H estado.
const raw = (tipo, numero, fecha, importe, estado) => {
  const f = ['', '', '', 'Mineral Del Río', '', '', '', '']
  f[0] = tipo; f[1] = numero; f[5] = fecha; f[6] = importe; f[7] = estado
  return f
}

test('CARTERA: recibido Y en custodia — depositado o emitido no son cartera', () => {
  const filas = [[], [], [],
    raw('recibido', '00000514', 46030, 290000, 'En custodia'),
    raw('recibido', '00000515', 46035, 10000000, 'Depositado'),
    raw('emitido', '00000313', 46040, 750000, 'En custodia'),
    raw('recibido', '00000516', null, 500000, 'En custodia'),
  ]
  const ms = deCartera(filas)
  assert.equal(ms.length, 1)
  assert.equal(ms[0].importe, 290000)
  assert.equal(ms[0].signo, ENTRA)
  assert.equal(ms[0].estado, 'COMPROMETIDO', 'el valor está en la mano; la plata no está en la cuenta')
  assert.equal(ms[0].rubro, 'Valores en cartera')
})

test('CARTERA: el 514 que me dieron no es el 514 que libré — el signo está en la clave', () => {
  const recibido = deCartera([[], [], [], raw('recibido', '514', 46030, 290000, 'En custodia')])[0]
  const emitido = deChequesEmitidos((() => {
    const filas = Array.from({ length: 20 }, () => [])
    filas[18] = ENC_CH
    filas[19] = chq(['FISICO', '514', 'Corralón', 750000, 46010, ''], MARCAS.falta)
    return filas
  })(), { fila0: 20 })[0]
  assert.notEqual(recibido.clave, emitido.clave, 'sin el signo, uno de los dos desaparece del libro')
})

test('COMPRAS: el CLIENTE del egreso sale de la J y viene canonizado, no de "Detalles / Obra"', () => {
  // EL DEFECTO QUE ESTO ATRAPA. La columna `obra` del libro sale de "Detalles / Obra" (la K), que es
  // texto libre: su inventario vivo tiene 130 valores del tipo "combustible", "Cuota 18" y "46381".
  // Si la sección POR CLIENTE del cash flow colgara de ahí, mostraría "combustible" como cliente y a
  // LA ESTRELLA en ningún lado. El cliente es la J, y llega al libro con el nombre canónico.
  const ms = deCompras(compras([
    // K dice "Galpon 9" y J dice "LA ESTRELLA": las dos cosas se guardan, cada una en su campo.
    ['Alumetal', '30-11111111-1', '0007-00000007', 250000, 'Pendiente', 'Transferencia',
      'Materiales Civil', 46300, 'Galpon 9', '', '', 'LA ESTRELLA'],
    // Una asignación INTERNA no es un cliente: cae en el residuo, no le cuelga gasto a nadie.
    ['Papelera', '30-22222222-2', '0008-00000008', 30000, 'Pendiente', 'Transferencia',
      'Estructura', 46300, 'oficina', '', '', 'Administracion'],
  ]), 46000)
  const conCliente = ms.find((m) => m.concepto === 'Alumetal')
  assert.equal(conCliente.cliente, 'LA ESTRELLA')
  assert.equal(conCliente.obra, 'Galpon 9', 'la K se sigue guardando: es el detalle, no el cliente')
  assert.equal(ms.find((m) => m.concepto === 'Papelera').cliente, '', 'Administracion es un centro de costo')
  // Y una fila sin la J cargada —305 de las 996 del archivo— no inventa un cliente.
  assert.equal(ms.find((m) => m.concepto === 'Prov SRL').cliente, '')
})

test('COBRANZAS: el cliente del cobro es el mismo canónico que el del egreso', () => {
  // Es la condición de la que depende la sección entera: si el ingreso dijera "LA ESTRELLA /ALIMENTOS
  // DEL SUR SAS" y el egreso "LA ESTRELLA", serían dos filas distintas del cuadro para un solo cliente.
  const ms = deCobranzas([[], [], [], ENC_COB,
    ['', 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'Cobrado', 5000000, 46000, 46000, 'Transferencia', ''],
    ['', 'IMOTOR/San Francisco/JAVI SANCHEZ', 'Pendiente', 3000000, 46300, 46300, 'Transferencia', ''],
  ], 46100)
  assert.equal(ms[0].cliente, 'LA ESTRELLA')
  assert.equal(ms[0].contraparte, 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'el texto crudo no se pierde al canonizar')
  assert.equal(ms[1].cliente, 'San Francisco')
})
