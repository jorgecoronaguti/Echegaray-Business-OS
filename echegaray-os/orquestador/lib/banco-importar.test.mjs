// EL PARSEO DEL EXTRACTO ES LO ÚNICO DE ESTE CAMINO QUE PUEDE FALLAR EN SILENCIO.
//
// Un importe mal leído no rompe nada: deja un saldo equivocado. "1.234,56" interpretado como número
// inglés da 1.23456 — un número perfectamente plausible. Por eso cada caso de abajo es un modo de
// falla real de un extracto del Santander, no un ejercicio.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  importe, fecha, campos, parsearExtracto, novedades, verificarCadena, clave,
  encabezado, emparejar, saldosACorregir, saldoAperturaSegun, sinDuplicadosDelDia,
} from './banco-importar.mjs'

test('el importe se lee a la argentina: punto de miles, coma decimal', () => {
  assert.equal(importe('1.234,56'), 1234.56)
  assert.equal(importe('-1.234,56'), -1234.56)
  assert.equal(importe('$ 5.595.130,74'), 5595130.74)
  // El signo al final, como lo exportan varios homebanking.
  assert.equal(importe('1.234,56-'), -1234.56)
  assert.equal(importe('230000'), 230000)
})

test('un importe con punto decimal NO se lee como si fuera es-AR al revés', () => {
  // Es el error que no da error: leído mal, "1.234" pasaría a ser 1,234 y el total cerraría por poco.
  assert.equal(importe('1.234'), 1234)
})

test('lo que no es un número devuelve null, no cero', () => {
  // Un cero inventado entra en la suma; un null se puede rechazar y avisar.
  assert.equal(importe(''), null)
  assert.equal(importe('saldo'), null)
  assert.equal(importe(null), null)
})

test('la fecha es DD/MM, nunca MM/DD', () => {
  // Todo el Drive es es-AR. Leerla al revés da el día equivocado sin avisar: 07/05 puede ser 7 de
  // mayo o 5 de julio y el error es invisible hasta que algo no cierra.
  assert.equal(fecha('07/05/2026'), '2026-05-07')
  assert.equal(fecha('22/07/26'), '2026-07-22')
  assert.equal(fecha('2026-07-22'), '2026-07-22')
  assert.equal(fecha('22/07', 2026), '2026-07-22')
  assert.equal(fecha('no es fecha'), null)
  assert.equal(fecha('35/07/2026'), null)
})

test('los campos se parten por tab, por punto y coma o por dos espacios — nunca por uno', () => {
  // El concepto del Santander tiene espacios adentro: partir por UN espacio lo haría pedazos.
  assert.deepEqual(campos('22/07/2026\tTransferencia realizada - A gisela\t-230.000'),
    ['22/07/2026', 'Transferencia realizada - A gisela', '-230.000'])
  assert.deepEqual(campos('22/07/2026;Transferencia realizada;-230.000'),
    ['22/07/2026', 'Transferencia realizada', '-230.000'])
  assert.deepEqual(campos('22/07/2026   Transferencia realizada - A gisela   -230.000'),
    ['22/07/2026', 'Transferencia realizada - A gisela', '-230.000'])
})

test('lee un extracto pegado, con su saldo corrido', () => {
  const txt = [
    'Fecha\tConcepto\tImporte\tSaldo',
    '22/06/2026\tTransferencia realizada - A gisela agostina d amico\t-230.000,00\t-399.586,65',
    '22/06/2026\tImpuesto ley 25.413 debito 0,6%\t-5.245,82\t-404.832,47',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(rechazos.length, 0)
  assert.equal(movimientos.length, 2)
  assert.deepEqual(movimientos[0], {
    fecha: '2026-06-22',
    concepto: 'Transferencia realizada - A gisela agostina d amico',
    importe: -230000,
    saldo: -399586.65,
  })
})

test('un número adentro del concepto no se confunde con el importe', () => {
  // "tarj nro. 6077" y los CUIT están llenos de dígitos: tomarlos como importe es el error clásico.
  const { movimientos } = parsearExtracto('23/06/2026\tCompra con tarjeta de debito - Merpago*cpcesj - tarj nro. 6077\t-865.000,00\t-1.914.135,69')
  assert.equal(movimientos.length, 1)
  assert.equal(movimientos[0].importe, -865000)
  assert.ok(movimientos[0].concepto.includes('6077'), 'el nº de tarjeta queda en el concepto')
})

test('un movimiento del día no trae saldo, y eso NO es un saldo cero', () => {
  // Un cero inventado rompería la cadena de saldos y haría gritar al control sin motivo.
  const { movimientos } = parsearExtracto('22/07/2026\tTransferencia a Katsuda Gustavo\t-270.000,00')
  assert.equal(movimientos[0].saldo, null)
})

test('la línea que no se entiende se DEVUELVE, no se descarta', () => {
  // Un importador que come 80 filas de 100 y no lo dice es peor que uno que falla.
  const { movimientos, rechazos } = parsearExtracto('22/07/2026\tAlgo\t-100,00\nesto no es un movimiento')
  assert.equal(movimientos.length, 1)
  assert.equal(rechazos.length, 1)
  assert.match(rechazos[0].motivo, /fecha|importe|concepto/)
})

test('los encabezados y los totales no son movimientos', () => {
  const txt = ['Banco Santander', 'Cuenta 179-091383/6', 'Fecha Concepto Importe',
    'Saldo inicial\t-169.586,65', '22/06/2026\tAlgo\t-100,00\t-169.686,65', 'Total\t-100,00'].join('\n')
  const { movimientos } = parsearExtracto(txt)
  assert.equal(movimientos.length, 1)
})

test('DEDUPLICAR: las ventanas del extracto se superponen', () => {
  // Se baja 22/06→22/07 y después 15/07→23/07: el tramo común entra dos veces. Duplicar un débito
  // no da error, da un saldo equivocado.
  const viejos = [{ fecha: '2026-07-20', concepto: 'Pago A', importe: -100, saldo: 900 }]
  const nuevos = [
    { fecha: '2026-07-20', concepto: 'Pago A', importe: -100, saldo: 900 },
    { fecha: '2026-07-23', concepto: 'Pago B', importe: -50, saldo: 850 },
  ]
  const n = novedades(nuevos, viejos)
  assert.equal(n.length, 1)
  assert.equal(n[0].concepto, 'Pago B')
})

test('dos movimientos IGUALES el mismo día son dos movimientos, y el saldo los separa', () => {
  // Si el saldo no entrara en la clave, el segundo se descartaría como duplicado y la cadena se
  // rompería — que es justo el control que después detectaría el error.
  const nuevos = [
    { fecha: '2026-07-20', concepto: 'Transf a Juan', importe: -100, saldo: 900 },
    { fecha: '2026-07-20', concepto: 'Transf a Juan', importe: -100, saldo: 800 },
  ]
  assert.equal(novedades(nuevos, []).length, 2)
  assert.notEqual(clave(nuevos[0]), clave(nuevos[1]))
})

test('el mismo extracto pegado dos veces no se duplica contra sí mismo', () => {
  const m = { fecha: '2026-07-20', concepto: 'Pago A', importe: -100, saldo: 900 }
  assert.equal(novedades([m, m], []).length, 1)
})

test('LA CADENA DE SALDOS: saldo(n) = saldo(n-1) + importe(n)', () => {
  const ok = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-21', concepto: 'b', importe: -50, saldo: 850 },
  ]
  assert.equal(verificarCadena(ok, 1000).ok, true)
})

test('un typo en un importe se ve porque la cadena deja de cerrar', () => {
  const conTypo = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-21', concepto: 'b', importe: -500, saldo: 850 }, // debería ser -50
  ]
  const r = verificarCadena(conTypo, 1000)
  assert.equal(r.ok, false)
  assert.equal(r.cortes.length, 1)
  assert.equal(r.cortes[0].concepto, 'b')
  assert.equal(r.cortes[0].diferencia, -450)
})

test('UN MOVIMIENTO SIN SALDO IGUAL MUEVE LA PLATA: se arrastra, no se saltea', () => {
  // Los "Movimientos del Día" todavía no traen saldo corrido, pero el dinero ya salió. Salteándolos,
  // el siguiente movimiento CON saldo parece no cerrar. Contra el extracto real eso exageraba el
  // corte a $-609.232,51 (el pendiente de conciliar entero) cuando la parte que el banco no explica
  // es sólo $-143.500.
  const m = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-21', concepto: 'del día', importe: -50, saldo: null },
    { fecha: '2026-07-21', concepto: 'c', importe: -100, saldo: 750 },
  ]
  assert.equal(verificarCadena(m, 1000).ok, true, '900 − 50 − 100 = 750')
})

test('saltear el movimiento sin saldo sería un falso positivo', () => {
  // El mismo caso pero con el saldo que tendría si el del día NO existiera: ahora SÍ tiene que
  // gritar, porque faltan $50 de verdad.
  const m = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-21', concepto: 'del día', importe: -50, saldo: null },
    { fecha: '2026-07-21', concepto: 'c', importe: -100, saldo: 800 },
  ]
  const r = verificarCadena(m, 1000)
  assert.equal(r.ok, false)
  assert.equal(r.cortes[0].diferencia, -50)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE ENSEÑÓ LA DESCARGA REAL DEL 23/07. Los casos de abajo son errores que ESTABAN pasando, no
// hipótesis: se vieron comparando el CSV del Santander contra los 127 movimientos ya cargados.
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('EL PARÉNTESIS ES UN SIGNO MENOS: el Santander no usa el guión', () => {
  // El modo de falla más caro de todos: sin esto CADA DÉBITO entraba como crédito. No da error —
  // da una cuenta que sube cuando en realidad baja.
  assert.equal(importe('(168.730,09)'), -168730.09)
  assert.equal(importe('(7.462.120,94)'), -7462120.94)
  assert.equal(importe('3.940.000,00'), 3940000)
})

test('el encabezado del export dice dónde está cada columna, y entonces no se adivina', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '22/07/2026;0179;San Juan;4633;000008654;Impuesto ley 25.413 debito 0,6%;(3.681,00);4.982.217,23',
    '23/07/2026;0179;San Juan;3058;000008656;Deposito e-cheq int ots plazas;3.940.000,00;',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(rechazos.length, 0)
  // Sin el encabezado, el concepto se armaba pegando el código operativo y la referencia
  // ("0179 San Juan 4633 000008654 Impuesto…") y la deduplicación no reconocía el movimiento.
  assert.deepEqual(movimientos[0], {
    fecha: '2026-07-22', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -3681, saldo: 4982217.23,
  })
  // La columna Saldo vacía es null, nunca cero: el movimiento del día todavía no se liquidó.
  assert.equal(movimientos[1].saldo, null)
  assert.equal(movimientos[1].importe, 3940000)
})

test('encabezado() sólo reconoce el que tiene fecha, concepto e importe', () => {
  assert.equal(encabezado(['Fecha', 'Concepto', 'Importe', 'Saldo']).importe, 2)
  assert.equal(encabezado(['Fecha', 'Suc. Origen', 'Concepto', 'Importe']).concepto, 2)
  assert.equal(encabezado(['Fecha', 'Saldo']), null)
})

test('EMPAREJAR: el concepto cargado a mano no es el del banco palabra por palabra', () => {
  // Exigir el texto idéntico dejaba 33 movimientos sin pareja y los reinsertaba: el mismo débito
  // dos veces. La segunda pasada empareja por fecha+importe.
  const base = [
    { id: 1, fecha: '2026-07-22', concepto: 'Cheque debitado - Nº 221', importe: -200000, saldo: 5129398.23 },
    { id: 2, fecha: '2026-07-22', concepto: 'Transferencia realizada - A katsuda gustavo', importe: -270000, saldo: 5329398.23 },
  ]
  const banco = [
    { fecha: '2026-07-22', concepto: 'Cheque debitado', importe: -200000, saldo: 5251630.74 },
    { fecha: '2026-07-22', concepto: 'Transferencia realizada - A katsuda gustavo al / - fac / 20085634179', importe: -270000, saldo: 4981630.74 },
  ]
  const { pares, soloBase, soloExtracto } = emparejar(base, banco)
  assert.equal(pares.length, 2)
  assert.equal(soloBase.length, 0)
  assert.equal(soloExtracto.length, 0, 'ninguno se reinserta')
})

test('EMPAREJAR: lo que el banco no lista queda señalado, no se empareja de prepo', () => {
  // La fila inventada "Diferencia sin detalle del banco (hold intradía)" de −$143.500 tenía que
  // salir a la luz sola: el extracto real no la lista en ningún lado.
  const base = [
    { id: 1, fecha: '2026-07-22', concepto: 'Compra con tarjeta de debito - Vono', importe: -143500, saldo: 5595130.74 },
    { id: 2, fecha: '2026-07-22', concepto: 'Diferencia sin detalle del banco (hold intradia)', importe: -143500, saldo: 4985898.23 },
  ]
  const banco = [{ fecha: '2026-07-22', concepto: 'Compra con tarjeta de debito - Vono - tarj nro. 6077', importe: -143500, saldo: 5451630.74 }]
  const { pares, soloBase } = emparejar(base, banco)
  assert.equal(pares.length, 1)
  assert.equal(soloBase.length, 1)
  assert.equal(soloBase[0].id, 2)
})

test('SOBRE EL SALDO GANA EL BANCO — pero sólo cuando el banco lo declara', () => {
  const pares = [
    // Los 126 movimientos que tenían el saldo $143.500 más alto que el del extracto.
    { base: { id: 1, saldo: -399586.65 }, banco: { saldo: -543086.65 } },
    { base: { id: 2, saldo: 100 }, banco: { saldo: 100 } },
    // Un movimiento del día no trae saldo: no es motivo para borrar el que ya estaba.
    { base: { id: 3, saldo: 900 }, banco: { saldo: null } },
  ]
  const r = saldosACorregir(pares)
  assert.equal(r.length, 1)
  assert.equal(r[0].base.id, 1)
  assert.equal(r[0].saldoBanco, -543086.65)
})

test('el saldo de apertura se DERIVA del extracto, no de una constante escrita a mano', () => {
  // La constante decía −$169.586,65 y el banco dice −$313.086,65. Una constante equivocada no se
  // puede detectar; un saldo derivado del documento sí.
  assert.equal(saldoAperturaSegun([{ importe: -230000, saldo: -543086.65 }]), -313086.65)
  // Si la serie arranca con movimientos sin saldo, sus importes también se descuentan.
  assert.equal(saldoAperturaSegun([{ importe: -100, saldo: null }, { importe: -50, saldo: 850 }]), 1000)
  assert.equal(saldoAperturaSegun([]), null)
})

test('el movimiento que viene en los DOS bloques del archivo entra una sola vez', () => {
  const m = [
    { fecha: '2026-07-23', concepto: 'Deposito e-cheq', importe: 3940000, saldo: null },
    { fecha: '2026-07-23', concepto: 'Deposito e-cheq', importe: 3940000, saldo: 8753461.54 },
  ]
  const r = sinDuplicadosDelDia(m)
  assert.equal(r.length, 1)
  assert.equal(r[0].saldo, 8753461.54, 'se queda el que el banco ya confirmó')
})

test('sinDuplicadosDelDia NO colapsa repeticiones legítimas', () => {
  // Tres cheques de $200.000 el mismo día son tres cheques, y vienen los tres con saldo distinto.
  const m = [
    { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -2921608.07 },
    { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -3121608.07 },
    { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -3321608.07 },
  ]
  assert.equal(sinDuplicadosDelDia(m).length, 3)
})
