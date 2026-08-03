// EL PARSEO DEL EXTRACTO ES LO ÚNICO DE ESTE CAMINO QUE PUEDE FALLAR EN SILENCIO.
//
// Un importe mal leído no rompe nada: deja un saldo equivocado. "1.234,56" interpretado como número
// inglés da 1.23456 — un número perfectamente plausible. Por eso cada caso de abajo es un modo de
// falla real de un extracto del Santander, no un ejercicio.

import test from 'node:test'
import assert from 'node:assert/strict'
import { importe, fecha, campos, parsearExtracto, novedades, verificarCadena, clave, dryRun, normalizarReferencia } from './banco-importar.mjs'

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
    // Un pegado no trae la columna Referencia del CSV: el campo existe y vale null. Se declara en el
    // objeto —y no se omite— porque quien deduplica pregunta por él en TODOS los movimientos.
    referencia: null,
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA CLAVE DEL MOVIMIENTO ES LA REFERENCIA DEL BANCO, NUNCA EL SALDO
//
// Medido el 03/08 con el extracto real 04/06→03/08: "239 nuevo(s) · 0 ya estaban" contra una base
// que tenía 170 movimientos y ventanas superpuestas casi enteras. Cargarlo metía ~170 duplicados y
// ninguno grita: un duplicado no da error, infla las sumas.
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: el mismo movimiento con SALDO distinto en dos descargas dedupea', () => {
  // El caso está medido sobre el dato real: el echeq 306 de $317.000 del 07/07 quedó con saldo
  // -3.397.612,85 en la descarga del 22/07 y -3.541.112,85 en el CSV del 30/07. El saldo corrido no
  // es una propiedad del movimiento — depende de la ventana con la que el banco arma la descarga—,
  // así que con el saldo en la clave cada descarga superpuesta reinyecta todo lo que ya estaba.
  const enLaBase = [{ fecha: '2026-07-07', concepto: 'Echeq clearing recibido', importe: -317000, saldo: -3397612.85, referencia: '306' }]
  const enLaDescargaNueva = [{ fecha: '2026-07-07', concepto: 'Echeq clearing recibido', importe: -317000, saldo: -3541112.85, referencia: '000000306' }]
  assert.deepEqual(novedades(enLaDescargaNueva, enLaBase), [])
})

test('"000008689" y "8689" son la misma referencia', () => {
  // El banco escribe la referencia con relleno y la base la guarda sin él (verificado: 8689, 8687).
  // Comparadas crudas son dos claves distintas y el movimiento se vuelve a cargar en cada descarga.
  assert.equal(normalizarReferencia('000008689'), '8689')
  assert.equal(normalizarReferencia(' 8689 '), '8689')
  assert.equal(normalizarReferencia('16862006'), '16862006')
  // Una referencia vacía NO es una referencia: si fuera '', todos los movimientos sin referencia
  // chocarían entre sí contra el índice único como si fueran el mismo.
  assert.equal(normalizarReferencia(''), null)
  assert.equal(normalizarReferencia(null), null)
  assert.equal(normalizarReferencia('0000'), null)

  const base = [{ fecha: '2026-07-30', concepto: 'Comision servicio cuenta dolares', importe: -14960, saldo: 88316639.82, referencia: '8689' }]
  const nueva = [{ fecha: '2026-07-30', concepto: 'Comision servicio cuenta dolares', importe: -14960, saldo: 1, referencia: '000008689' }]
  assert.deepEqual(novedades(nueva, base), [])
})

test('misma fecha y mismo importe con REFERENCIA distinta son dos movimientos, y no se fusionan', () => {
  // Dato real del extracto del 31/07: dos compras con débito de $15.092,62 el mismo día, mismo
  // concepto, referencias 16996641 y 16999189. Son dos consumos reales. Fusionarlos por "fecha +
  // importe + concepto" borraría plata de verdad, que es el error opuesto al que estamos arreglando.
  const base = [{ fecha: '2026-07-31', concepto: 'Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077', importe: -15092.62, saldo: 87928931.89, referencia: '16996641' }]
  const nueva = [{ fecha: '2026-07-31', concepto: 'Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077', importe: -15092.62, saldo: 87913839.27, referencia: '16999189' }]
  const n = novedades(nueva, base)
  assert.equal(n.length, 1)
  assert.equal(n[0].referencia, '16999189')
})

test('la referencia con el MISMO número y distinto importe son dos movimientos (la operación y su percepción)', () => {
  // El 01/07 la compra en el exterior de Google Workspace ($-37.926) y su percepción RG 5617
  // ($-11.203,92) comparten la referencia 00114824 y sólo las separa el Código Operativo, que el
  // parser no captura. Con la referencia SOLA, la percepción se descartaba como "ya vista": un
  // impuesto menos y cero errores a la vista. Por eso la clave es (referencia, importe).
  const base = [{ fecha: '2026-07-01', concepto: 'Compra en el exterior - Google workspace', importe: -37926, saldo: 100, referencia: '114824' }]
  const nueva = [{ fecha: '2026-07-01', concepto: 'Percep perc rg 5617 30% o suj - Google w', importe: -11203.92, saldo: 90, referencia: '00114824' }]
  assert.equal(novedades(nueva, base).length, 1)
})

test('un movimiento SIN referencia dedupea por el respaldo, y el respaldo tampoco mira el saldo', () => {
  // 32 filas de la base no tienen referencia: entraron por captura de pantalla o por la semilla del
  // extracto verificado. Para ésas la referencia no puede ser la clave, y el respaldo es
  // (fecha, concepto, importe) — nunca el saldo, que es justamente el campo que cambia entre
  // descargas. Acá el saldo difiere en $143.500 y aun así es el mismo movimiento.
  const base = [{ fecha: '2026-07-07', concepto: 'Pago haberes - 260701507', importe: -1250000, saldo: -3397612.85, referencia: null }]
  const nueva = [{ fecha: '2026-07-07', concepto: 'Pago haberes - 260701507', importe: -1250000, saldo: -3541112.85, referencia: null }]
  assert.deepEqual(novedades(nueva, base), [])
})

test('el respaldo aguanta que el concepto venga recortado o en otras mayúsculas', () => {
  // Las dos descargas escriben el mismo concepto distinto: la semilla guardó "Pago haberes -
  // 260701507" y el CSV repite el número al final; y el depósito de $16.807.425,92 apareció en
  // mayúsculas en una descarga y en minúsculas en la otra. Comparado exacto, $16,8M contaban dos veces.
  const base = [
    { fecha: '2026-07-07', concepto: 'Pago haberes - 260701507', importe: -1250000, saldo: 10, referencia: null },
    { fecha: '2026-07-29', concepto: 'Deposito E-cheq 48hs Presencia Bsr', importe: 16807425.92, saldo: 20, referencia: null },
  ]
  const nueva = [
    { fecha: '2026-07-07', concepto: 'Pago haberes - 260701507        260701507', importe: -1250000, saldo: 11, referencia: null },
    { fecha: '2026-07-29', concepto: 'deposito e-cheq 48hs presencia bsr', importe: 16807425.92, saldo: 21, referencia: null },
  ]
  assert.deepEqual(novedades(nueva, base), [])
})

test('una fila vieja SIN referencia reconoce al mismo movimiento cuando vuelve CON referencia', () => {
  // Es el día del cambio: lo que ya estaba cargado no tiene referencia y el CSV nuevo sí la trae. Si
  // sólo se comparara por referencia, la base entera se duplicaría de una sola vez.
  const base = [{ fecha: '2026-07-30', concepto: 'Comision por servicio de cuenta', importe: -69000, saldo: 88366015.82, referencia: null }]
  const nueva = [{ fecha: '2026-07-30', concepto: 'Comision por servicio de cuenta', importe: -69000, saldo: 1, referencia: '8683' }]
  assert.deepEqual(novedades(nueva, base), [])
})

test('el respaldo empareja UNO A UNO: si la base tiene una y el extracto trae dos, entra una', () => {
  // La base dice CUÁNTAS hay, no si hay. Dos cheques de $383.175 el mismo día son dos movimientos
  // reales: preguntando "¿existe?" se descartarían los dos y se borraría plata; emparejando, el
  // primero se reconoce como ya cargado y el segundo entra.
  const base = [{ fecha: '2026-07-15', concepto: 'Cheque debitado', importe: -383175, saldo: 500, referencia: null }]
  const nueva = [
    { fecha: '2026-07-15', concepto: 'Cheque debitado', importe: -383175, saldo: 500, referencia: null },
    { fecha: '2026-07-15', concepto: 'Cheque debitado', importe: -383175, saldo: 116.825, referencia: null },
  ]
  assert.equal(novedades(nueva, base).length, 1)
})

test('DOS DESCARGAS SUPERPUESTAS DEL EXTRACTO REAL: el resultado es la unión, sin duplicados', () => {
  // Filas textuales del CSV que bajó el dueño del homebanking (Últimos Movimientos, cuenta
  // 179-091383/6). La descarga vieja llega hasta el 30/07 y la nueva la incluye entera y agrega el
  // 31/07 — que es cómo se piden: con ventanas que se superponen.
  //
  // Lo ÚNICO alterado a propósito son los saldos del lado "ya cargado": se desplazan para reproducir
  // el modo de falla medido (el mismo movimiento con distinto saldo corrido en dos descargas). Las
  // fechas, referencias, conceptos e importes son los del extracto.
  const CABECERA = 'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo'
  const COMUNES = [
    '30/07/2026;0179;San Juan;4637;000008697;Impuesto ley 25.413 credito 0,6%;(813,12);87.944.024,51',
    '30/07/2026;0179;San Juan;4633;000008696;Impuesto ley 25.413 debito 0,6%;(3.731,79);87.944.837,63',
    '30/07/2026;0179;San Juan;3489;000008689;Comision servicio cuenta dolares;(14.960,00);88.316.639,82',
    '30/07/2026;0179;San Juan;3254;000008687;Iva 21% reg de transfisc ley27743;(3.024,00);88.332.031,82',
    '29/07/2026;0179;San Juan;1304;16862006;Compra con tarjeta de debito - Esso servicentro media - tarj nro. 6077;(58.000,00);88.541.781,68',
    '29/07/2026;0179;San Juan;3036;000008676;Deposito e-cheq 48hs presencia bsr;16.807.425,92;88.745.670,12',
  ]
  const SOLO_EN_LA_NUEVA = [
    '31/07/2026;0179;San Juan;1304;16996641;Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077;(15.092,62);87.913.839,27',
    '31/07/2026;0179;San Juan;1304;16999189;Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077;(15.092,62);87.928.931,89',
  ]

  const { movimientos: vieja } = parsearExtracto([CABECERA, ...COMUNES].join('\n'))
  const { movimientos: nueva } = parsearExtracto([CABECERA, ...SOLO_EN_LA_NUEVA, ...COMUNES].join('\n'))
  assert.equal(vieja.length, 6)
  assert.equal(nueva.length, 8)

  // Así queda lo ya cargado en la base: la referencia SIN los ceros de relleno (verificado: 8689,
  // 8687) y el saldo corrido de aquella descarga, distinto del de hoy.
  const enLaBase = vieja.map((m) => ({ ...m, referencia: m.referencia, saldo: m.saldo - 143500 }))

  const n = novedades(nueva, enLaBase)
  assert.equal(n.length, 2, 'sólo los dos movimientos del 31/07 son nuevos')
  assert.deepEqual(n.map((m) => m.referencia).sort(), ['16996641', '16999189'])
  // La unión: 6 que ya estaban + 2 nuevos = los 8 del extracto, ni uno más.
  assert.equal(enLaBase.length + n.length, nueva.length)
  // Y volver a correr la MISMA descarga contra la base ya completa no agrega nada.
  assert.deepEqual(novedades(nueva, [...enLaBase, ...n]), [])
})

test('el parser saca la referencia de la columna Referencia del CSV, normalizada', () => {
  // Sin esto, la clave correcta no tiene de dónde salir: es el primero de los tres defectos
  // encadenados (parser que la tira · SELECT que no la trae · clave que usa el saldo).
  const txt = ['Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '30/07/2026;0179;San Juan;3489;000008689;Comision servicio cuenta dolares;(14.960,00);88.316.639,82'].join('\n')
  const { movimientos } = parsearExtracto(txt)
  assert.equal(movimientos[0].referencia, '8689')
  assert.equal(movimientos[0].importe, -14960)
  // Un pegado de pantalla no trae la columna: referencia null explícito, nunca undefined.
  const pegado = parsearExtracto('22/07/2026\tAlgo\t-100,00\t-169.686,65')
  assert.equal(pegado.movimientos[0].referencia, null)
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

// ── FILA ENVUELTA POR UN SALTO DE LÍNEA (el pegado del dueño del 28/07) ──────────────────────────────
// La banca online envuelve el concepto largo ("Transferencia recibida - credin - Id debin <id> cuit
// <cuit>") y el copiar/pegar mete un `\n` en medio del concepto. La primera mitad arranca con fecha
// pero su último campo es TEXTO, no un importe → antes se descartaba y el cobro de Quattropani del
// 28/07 ($30M y $35M, cuit 30716699648) nunca entraba: banco_movimientos cortaba el 24/07.

test('fila credin ENVUELTA en 2 líneas se re-une a un solo movimiento con importe y saldo correctos', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '28/07/2026;0179;San Juan;3058;8700;Transferencia recibida - credin - Id debin 987654321',
    'cuit 30716699648;30.000.000,00;42.000.000,00',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(rechazos.length, 0, 'la fila envuelta no se rechaza')
  assert.equal(movimientos.length, 1, 'las dos líneas son UN movimiento, no dos')
  assert.equal(movimientos[0].concepto, 'Transferencia recibida - credin - Id debin 987654321 cuit 30716699648')
  assert.equal(movimientos[0].importe, 30000000)
  assert.equal(movimientos[0].saldo, 42000000)
})

test('la fila envuelta encadena: saldo(n) = saldo(n-1) + importe(n)', () => {
  // El extracto real del 28/07 trae los dos credin de Quattropani seguidos. Re-unidos, la cadena cierra.
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '28/07/2026;0179;San Juan;3058;8700;Transferencia recibida - credin - Id debin 111',
    'cuit 30716699648;30.000.000,00;42.000.000,00',
    '28/07/2026;0179;San Juan;3058;8701;Transferencia recibida - credin - Id debin 222',
    'cuit 30716699648;35.000.000,00;77.000.000,00',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(rechazos.length, 0)
  assert.equal(movimientos.length, 2)
  assert.equal(movimientos[1].importe, 35000000)
  // saldo inicial = 42.000.000 − 30.000.000 = 12.000.000
  assert.equal(verificarCadena(movimientos, 12000000).ok, true)
})

test('re-unir NO rompe las filas normales de una sola línea (ni CSV ni pegado)', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '07/07/2026;0179;San Juan;0557;01464204;Prestamos prendarios - 0179-039101464204;(1.282.810,54);(6.356.623,39)',
    '08/07/2026;0179;San Juan;3058;299;Deposito e-cheq;3.000.000,00;(3.356.623,39)',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(rechazos.length, 0)
  assert.equal(movimientos.length, 2)
  assert.equal(movimientos[0].importe, -1282810.54)
  assert.equal(movimientos[0].saldo, -6356623.39)
  assert.equal(movimientos[1].importe, 3000000)
})

test('una fila envuelta de DÉBITO (importe entre paréntesis) se interpreta negativa', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '28/07/2026;0179;San Juan;3058;900;Transferencia realizada - A un proveedor con nombre',
    'muy largo que la pantalla envolvió;(1.500.000,00);(2.000.000,00)',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(rechazos.length, 0)
  assert.equal(movimientos.length, 1)
  assert.equal(movimientos[0].importe, -1500000, 'los paréntesis = débito negativo')
  assert.equal(movimientos[0].saldo, -2000000)
  assert.ok(movimientos[0].concepto.includes('muy largo que la pantalla envolvió'))
})

test('una fila envuelta que igual no cierra se DEVUELVE una sola vez, no desaparece', () => {
  // Si la continuación nunca trae un importe, la fila unida cae en rechazos (visible), no en silencio.
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '28/07/2026;0179;San Juan;3058;901;Transferencia recibida - concepto',
    'que sigue sin importe ni saldo',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(movimientos.length, 0)
  assert.equal(rechazos.length, 1, 'una sola línea de rechazo para la fila unida entera')
  assert.equal(rechazos[0].linea, 2, 'apunta a la línea donde ARRANCA la fila')
})

test('la fila siguiente (con su propia fecha) NO se traga al re-unir la anterior', () => {
  // El re-unir corta antes de una línea que abre su propia fila: no se comen movimientos válidos.
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '28/07/2026;0179;San Juan;3058;902;Transferencia recibida - concepto sin cierre',
    '27/07/2026;0179;San Juan;3058;903;Deposito;5.000.000,00;10.000.000,00',
  ].join('\n')
  const { movimientos, rechazos } = parsearExtracto(txt)
  assert.equal(movimientos.length, 1, 'la fila del 27/07 se parsea entera')
  assert.equal(movimientos[0].fecha, '2026-07-27')
  assert.equal(movimientos[0].importe, 5000000)
  assert.equal(rechazos.length, 1, 'sólo la fila incompleta del 28/07 se rechaza')
})

test('DRY-RUN: parsea + verifica la cadena en una sola pasada (fila envuelta real)', () => {
  const txt = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '28/07/2026;0179;San Juan;3058;8700;Transferencia recibida - credin - Id debin 111',
    'cuit 30716699648;30.000.000,00;42.000.000,00',
  ].join('\n')
  const { movimientos, rechazos, cadena } = dryRun(txt, { saldoInicial: 12000000 })
  assert.equal(movimientos.length, 1)
  assert.equal(rechazos.length, 0)
  assert.equal(cadena.ok, true)
})
