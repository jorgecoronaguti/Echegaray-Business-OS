// EL PARSEO DEL EXTRACTO ES LO ÚNICO DE ESTE CAMINO QUE PUEDE FALLAR EN SILENCIO.
//
// Un importe mal leído no rompe nada: deja un saldo equivocado. "1.234,56" interpretado como número
// inglés da 1.23456 — un número perfectamente plausible. Por eso cada caso de abajo es un modo de
// falla real de un extracto del Santander, no un ejercicio.

import test from 'node:test'
import assert from 'node:assert/strict'
import { importe, fecha, campos, parsearExtracto, novedades, verificarCadena, clave, deduplicarPorCadena, completarSaldoIntradia } from './banco-importar.mjs'

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

// ── EL CSV DESCARGADO DEL SANTANDER ("descargaUltimosMovimientos") ──────────────────────────────────
// Formato distinto del pegado: 8 columnas con Suc/Desc/Cod/Referencia entre fecha y concepto, débitos
// entre paréntesis, y filas en orden del MÁS NUEVO al más viejo. Cada uno rompía la carga en silencio.

test('paréntesis = débito negativo (formato del CSV del banco)', () => {
  assert.equal(importe('(500.000,00)'), -500000)
  assert.equal(importe('(1.282.810,54)'), -1282810.54)
  assert.equal(importe('(6.356.623,39)'), -6356623.39)
})

test('CSV del banco: el concepto sale de su columna, no arrastra Suc/Cod/Referencia', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '07/07/2026;0179;San Juan;0557;01464204;Prestamos prendarios - 0179-039101464204;(1.282.810,54);(6.356.623,39)',
  ].join('\n')
  const { movimientos } = parsearExtracto(txt)
  assert.equal(movimientos.length, 1)
  assert.equal(movimientos[0].concepto, 'Prestamos prendarios - 0179-039101464204')
  assert.equal(movimientos[0].importe, -1282810.54)
  assert.equal(movimientos[0].saldo, -6356623.39)
})

test('CSV del banco: un concepto con espacios largos adentro no se parte en columnas', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '17/07/2026;0179;San Juan;1862;33983818;Pago haberes - 260717507                     260717507;(217.100,00);12.729.540,85',
  ].join('\n')
  const { movimientos } = parsearExtracto(txt)
  assert.equal(movimientos[0].concepto, 'Pago haberes - 260717507 260717507')
  assert.equal(movimientos[0].importe, -217100)
})

test('CSV del banco: viene del más nuevo al más viejo → se endereza a orden cronológico', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '08/07/2026;0179;San Juan;3043;299;Echeq clearing;(1.000,00);(2.000,00)',
    '07/07/2026;0179;San Juan;3043;298;Deposito;3.000,00;(1.000,00)',
  ].join('\n')
  const { movimientos } = parsearExtracto(txt)
  assert.equal(movimientos[0].fecha, '2026-07-07') // el más viejo primero
  assert.equal(movimientos[1].fecha, '2026-07-08')
  // y así la cadena propia cierra: -4.000 + 3.000 = -1.000 ; -1.000 + (-1.000) = -2.000
  const { ok } = verificarCadena(movimientos, movimientos[0].saldo - movimientos[0].importe)
  assert.equal(ok, true)
})

test('CSV del banco: una fila de "Movimientos del Día" sin saldo entra con saldo null, no 0', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '24/07/2026;0179;San Juan;0133;000000315;Cheque debitado;(500.000,00);',
  ].join('\n')
  const { movimientos } = parsearExtracto(txt)
  assert.equal(movimientos[0].importe, -500000)
  assert.equal(movimientos[0].saldo, null)
})

// ── DEDUP DE FANTASMAS POR CADENA DE SALDOS (deduplicarPorCadena) ────────────────────────────────
// El dedup por clave (fecha|concepto|importe|saldo) se le escapan duplicados reales del Santander: el
// concepto trae un id que varía, y a veces la copia viene con saldo null. La cadena de saldos los caza.

test('SEÑAL 1 · dos créditos que terminan en el MISMO saldo: el segundo no movió la cuenta → fantasma', () => {
  // Caso real 16/07: dos "+$11.913.568,24" que terminan los dos en $7.874.504,8. Matemáticamente el
  // segundo no sumó nada a la cuenta: es el mismo evento reimpreso. La clave natural NO lo caza si el
  // concepto cambió (id de debin distinto), pero la cadena sí.
  const movs = [
    { fecha: '2026-07-16', concepto: 'Transferencia recibida - credin - Id debin cu', importe: 11913568.24, saldo: 7874504.8 },
    { fecha: '2026-07-16', concepto: 'Transferencia recibida - credin - Id debin z0', importe: 11913568.24, saldo: 7874504.8 },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs, { saldoInicial: -4039063.44 })
  assert.equal(conservados.length, 1)
  assert.equal(descartados.length, 1)
  assert.match(descartados[0].motivo, /no movió la cuenta/)
})

test('SEÑAL 2 · copia sin saldo cuyo gemelo idéntico en fecha+importe SÍ trae saldo → fantasma', () => {
  // Caso real 23/07: un "Deposito e-cheq $3.940.000" aparece dos veces, una con saldo y otra en null.
  const movs = [
    { fecha: '2026-07-23', concepto: 'Deposito e-cheq', importe: 3940000, saldo: 8714485.73 },
    { fecha: '2026-07-23', concepto: 'Deposito e-cheq', importe: 3940000, saldo: null },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs)
  assert.equal(conservados.length, 1)
  assert.equal(conservados[0].saldo, 8714485.73)
  assert.equal(descartados.length, 1)
  assert.match(descartados[0].motivo, /ya trae saldo/)
})

test('un duplicado EXACTO (todos los campos iguales) también lo caza la cadena', () => {
  const movs = [
    { fecha: '2026-07-20', concepto: 'Pago A', importe: -100, saldo: 900 },
    { fecha: '2026-07-20', concepto: 'Pago A', importe: -100, saldo: 900 },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs, { saldoInicial: 1000 })
  assert.equal(conservados.length, 1)
  assert.equal(descartados.length, 1)
})

test('BORDE · dos movimientos legítimos del mismo importe el mismo día con saldos DISTINTOS NO son duplicados', () => {
  // Cada uno avanza el saldo de forma consistente con la cadena: los dos se conservan.
  const movs = [
    { fecha: '2026-07-20', concepto: 'Transf a Juan', importe: -100, saldo: 900 },
    { fecha: '2026-07-20', concepto: 'Transf a Juan', importe: -100, saldo: 800 },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs, { saldoInicial: 1000 })
  assert.equal(conservados.length, 2)
  assert.equal(descartados.length, 0)
})

test('BORDE · dos cheques del día sin saldo (ambos null, sin gemelo con saldo) NO se descartan', () => {
  // Es el caso legítimo de dos "Cheque debitado" del mismo importe hoy: ninguno tiene saldo todavía y
  // ninguno tiene un gemelo posteado. Los dos son reales.
  const movs = [
    { fecha: '2026-07-24', concepto: 'Deposito', importe: 1000, saldo: 5000 },
    { fecha: '2026-07-24', concepto: 'Cheque debitado', importe: -500, saldo: null },
    { fecha: '2026-07-24', concepto: 'Cheque debitado', importe: -500, saldo: null },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs)
  assert.equal(conservados.length, 3)
  assert.equal(descartados.length, 0)
})

test('BORDE · un typo (saldo avanza a un valor inesperado) NO se descarta: lo audita verificarCadena', () => {
  // El dedup es conservador: sólo tira lo inequívoco. Un saldo que avanza mal es un typo o un faltante,
  // no un fantasma — tirarlo en silencio sería peor. Se conserva y lo marca la cadena.
  const movs = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-21', concepto: 'b', importe: -50, saldo: 850 },  // ok
    { fecha: '2026-07-22', concepto: 'c', importe: -100, saldo: 700 },  // debería ser 750: typo
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs, { saldoInicial: 1000 })
  assert.equal(conservados.length, 3)
  assert.equal(descartados.length, 0)
  // y la cadena lo delata sobre lo conservado
  assert.equal(verificarCadena(conservados, 1000).ok, false)
})

test('BORDE · un importe 0 que deja el saldo igual NO es fantasma (no movió la cuenta a propósito)', () => {
  const movs = [
    { fecha: '2026-07-20', concepto: 'a', importe: -100, saldo: 900 },
    { fecha: '2026-07-20', concepto: 'ajuste', importe: 0, saldo: 900 },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs, { saldoInicial: 1000 })
  assert.equal(conservados.length, 2)
  assert.equal(descartados.length, 0)
})

test('BORDE · una reversión (+X y −X que vuelve al saldo previo) NO es fantasma: el saldo se movió y volvió', () => {
  const movs = [
    { fecha: '2026-07-20', concepto: 'debito X', importe: -100, saldo: 900 },
    { fecha: '2026-07-20', concepto: 'reverso X', importe: 100, saldo: 1000 },
  ]
  const { conservados, descartados } = deduplicarPorCadena(movs, { saldoInicial: 1000 })
  assert.equal(conservados.length, 2)
  assert.equal(descartados.length, 0)
})

test('el primer movimiento nunca se descarta: fija el ancla de la cadena', () => {
  const movs = [{ fecha: '2026-07-20', concepto: 'a', importe: 500, saldo: 500 }]
  const { conservados, descartados } = deduplicarPorCadena(movs)  // sin saldoInicial
  assert.equal(conservados.length, 1)
  assert.equal(descartados.length, 0)
})

test('parsearExtracto integra el dedup: el fantasma sale por `duplicados`, no por `movimientos`', () => {
  // El mismo evento reimpreso con el saldo en null dentro de un pegado real: la copia se va a
  // `duplicados` y NO llega a la base ni a _BANCO_RAW (de donde cuelgan tarjeta, cheques e impuestos).
  const txt = [
    'Fecha\tConcepto\tImporte\tSaldo',
    '2026-07-23\tDeposito e-cheq\t3.940.000,00\t8.714.485,73',
    '2026-07-23\tDeposito e-cheq\t3.940.000,00\t',
    '2026-07-24\tCheque debitado\t-500.000,00\t8.214.485,73',
  ].join('\n')
  const { movimientos, duplicados } = parsearExtracto(txt)
  assert.equal(movimientos.length, 2)
  assert.equal(duplicados.length, 1)
  assert.match(duplicados[0].motivo, /ya trae saldo/)
  // y la cadena de lo conservado cierra
  assert.equal(verificarCadena(movimientos, 8714485.73 - 3940000).ok, true)
})

test('completarSaldoIntradia deduce el saldo del movimiento del día por arrastre, y respeta el null inicial', () => {
  const movs = [
    { fecha: '2026-07-24', concepto: 'del día sin ancla', importe: -100, saldo: null }, // arranca en null → se respeta
    { fecha: '2026-07-24', concepto: 'posteado', importe: 1000, saldo: 5000 },
    { fecha: '2026-07-24', concepto: 'cheque del día', importe: -500, saldo: null },     // 5000 − 500
  ]
  completarSaldoIntradia(movs)
  assert.equal(movs[0].saldo, null)
  assert.equal(movs[2].saldo, 4500)
})

test('CSV del banco: el saldo intradía se DEDUCE de la cadena (no queda inflado en el saldo de ayer)', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '24/07/2026;0179;San Juan;0133;315;Cheque debitado;(500.000,00);',
    '24/07/2026;0179;San Juan;0133;314;Cheque debitado;(500.000,00);',
    '23/07/2026;0179;San Juan;3058;8656;Deposito e-cheq;3.940.000,00;8.714.485,73',
  ].join('\n')
  const { movimientos } = parsearExtracto(txt)
  // cronológico: [23/07 depósito 8.714.485,73] → [cheque -500k → 8.214.485,73] → [cheque -500k → 7.714.485,73]
  assert.equal(movimientos.at(-1).saldo, 7714485.73)
  assert.equal(movimientos.at(-2).saldo, 8214485.73)
})
