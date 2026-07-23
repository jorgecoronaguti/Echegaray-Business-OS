// EL PARSEO DEL EXTRACTO ES LO ÚNICO DE ESTE CAMINO QUE PUEDE FALLAR EN SILENCIO.
//
// Un importe mal leído no rompe nada: deja un saldo equivocado. "1.234,56" interpretado como número
// inglés da 1.23456 — un número perfectamente plausible. Por eso cada caso de abajo es un modo de
// falla real de un extracto del Santander, no un ejercicio.

import test from 'node:test'
import assert from 'node:assert/strict'
import { importe, fecha, campos, parsearExtracto, novedades, verificarCadena, clave } from './banco-importar.mjs'

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

test('los movimientos sin saldo no cortan la cadena: arrastran el último conocido', () => {
  const m = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-21', concepto: 'del día', importe: -50, saldo: null },
    { fecha: '2026-07-21', concepto: 'c', importe: -100, saldo: 800 },
  ]
  assert.equal(verificarCadena(m, 1000).ok, true)
})
