import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aplicarOverrides, camposGuardables, desgloseSinAfirmar, sinOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea, type EntradaDeLinea } from './liquidacionQuincena.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que pisar HORAS deje COBRA en el valor viejo: la fila publicaría un importe que no sale de
//     sus propias horas, y es el número que se paga en mano.
//  2. Que un override corte la cadena y los eslabones de abajo NO se recalculen (R5 del handoff).
//  3. Que un CERO escrito a mano se lea como «no hay override» y vuelva la cuenta: «no le doy nada
//     por banco» es una afirmación del dueño, y su edición manda.
//  4. Que una celda vaciada quede pisada para siempre.
//  5. Que las seis celdas sin columna `*_manual` en la base se dibujen editables y guarden un 0
//     indistinguible de «vacío».

const entrada: EntradaDeLinea = {
  personaId: 'p1', nombre: 'Pérez', horas: 100,
  tarifa: { valorHora: 1000, netoMensual: null, desde: '2026-09-01', origen: 'sheet:_J_OBREROS' },
  adelanto: 0, yaTransferido: 20_000, reciboNeto: 30_000, giroEnElLote: true,
}
const linea = liquidarLinea(entrada, 'obreros', null)

test('la línea de partida cumple R5 antes de tocar nada', () => {
  assert.equal(linea.cobra, 100_000)
  assert.equal(linea.porBanco, 30_000)
  assert.equal(linea.enEfectivo, 50_000)
  assert.equal(linea.total, 80_000)
})

test('pisar HORAS mueve COBRA, EN EFECTIVO y TOTAL — la cadena se rehace entera', () => {
  const r = aplicarOverrides(linea, { horas: 120 }, 'obreros')
  assert.equal(r.horas, 120)
  assert.equal(r.cobra, 120_000, 'COBRA sale de las horas pisadas × $/h')
  assert.equal(r.enEfectivo, 70_000)
  assert.equal(r.total, 100_000)
  assert.equal(r.manual.horas, true)
  assert.equal(r.manual.cobra, false, 'COBRA sigue siendo calculada: se movió, no se escribió')
})

test('pisar COBRA gana sobre horas × $/h, y EN EFECTIVO y TOTAL lo siguen', () => {
  const r = aplicarOverrides(linea, { cobra: 90_000 }, 'obreros')
  assert.equal(r.cobra, 90_000)
  assert.equal(r.enEfectivo, 40_000)
  assert.equal(r.total, 70_000)
  assert.equal(r.manual.cobra, true)
})

test('pisar EN EFECTIVO gana sobre la resta, y TOTAL se recalcula sobre lo pisado', () => {
  const r = aplicarOverrides(linea, { enEfectivo: 55_000 }, 'obreros')
  assert.equal(r.enEfectivo, 55_000)
  assert.equal(r.total, 85_000, 'TOTAL = POR BANCO + EN EFECTIVO pisado')
  assert.equal(r.manual.enEfectivo, true)
  assert.equal(r.manual.total, false)
})

test('pisar TOTAL manda aunque no cierre con la suma: su edición es la verdad definitiva', () => {
  const r = aplicarOverrides(linea, { total: 81_000 }, 'obreros')
  assert.equal(r.total, 81_000)
  assert.equal(r.enEfectivo, 50_000, 'el eslabón de arriba no se toca')
  assert.equal(r.manual.total, true)
})

test('UN CERO ESCRITO A MANO ES UN OVERRIDE, no una ausencia', () => {
  // EL DEFECTO: tratar 0 como «vacío» devolvería POR BANCO a $30.000 y le pagaría de menos en mano
  // a alguien a quien el dueño decidió no girarle nada.
  const r = aplicarOverrides(linea, { porBanco: 0 }, 'obreros')
  assert.equal(r.porBanco, 0)
  assert.equal(r.manual.porBanco, true)
  assert.equal(r.enEfectivo, 80_000)
  assert.equal(r.total, 80_000)
})

test('vaciar la celda (null) restablece el cálculo y borra la marca', () => {
  const r = aplicarOverrides(linea, { cobra: null, horas: null }, 'obreros')
  assert.equal(r.cobra, 100_000)
  assert.equal(r.horas, 100)
  assert.equal(r.manual.cobra, false)
  assert.equal(r.manual.horas, false)
})

test('oficina y final NO recalculan COBRA desde las horas: su sueldo no sale de una tarifa horaria', () => {
  const ofi = liquidarLinea({
    ...entrada, horas: null, reciboNeto: null, giroEnElLote: false,
    tarifa: { valorHora: null, netoMensual: 1_800_000, desde: '2026-09-01', origen: 'manual' },
  }, 'oficina', null)
  const r = aplicarOverrides(ofi, { horas: 54 }, 'oficina')
  assert.equal(r.cobra, 1_800_000, 'el neto mensual no se multiplica por horas')
  assert.equal(r.horas, 54)
})

test('pisar COBRA resuelve «sin tarifa»: ya no hay nada pendiente que buscar', () => {
  const sin = liquidarLinea({ ...entrada, tarifa: null }, 'obreros', null)
  assert.equal(sin.sinTarifa, true)
  assert.equal(sin.cobra, null)
  const r = aplicarOverrides(sin, { cobra: 70_000 }, 'obreros')
  assert.equal(r.sinTarifa, false)
  assert.equal(r.cobra, 70_000)
  assert.equal(r.enEfectivo, 20_000)
  assert.equal(r.total, 50_000)
})

test('sin overrides, la línea queda idéntica y sin ninguna marca', () => {
  const r = sinOverrides(linea)
  // `origen` y `discrepancia` se excluyen igual que `manual`: son las TRES marcas de procedencia, y
  // lo que este test afirma es que los IMPORTES no cambian. Una quincena cerrada se dibuja con esta
  // función y sus cifras son la foto del cierre.
  const sinMarcas = {
    manual: undefined, origen: undefined, discrepancia: undefined, referenciaJornales: undefined,
    sueldo: undefined, sinNeto: undefined, horasRecibo: undefined, valorHoraRecibo: undefined, negro: undefined,
    horasNegro: undefined, horasDeLosDias: undefined,
    // `presentismo` (15/09/2026) es la cuarta marca: la foto cerrada lo trae del sello, no de un cálculo.
    presentismo: undefined,
    // LOS SALDOS (15/09/2026) SON UNA PUBLICACIÓN NUEVA, NO UN CAMBIO DE LA CADENA: se comprueban aparte,
    // abajo. Acá se excluyen igual que las marcas para que este test siga afirmando lo único que afirma —que
    // los importes de la cadena no se mueven—.
    pago: undefined, pagadoBanco: undefined, pagadoEfectivo: undefined, formulas: undefined,
    // `sello` (17/09/2026) es la quinta marca: el $/h y el piso de ESA quincena, para que la cerrada deje de decir
    // «—». Tampoco es un importe de la cadena — se comprueba abajo.
    sello: undefined,
    // `sinDesglose` (17/09/2026) es la sexta marca — «nadie afirmó el banco» — y se comprueba en sus propios tests.
    sinDesglose: undefined,
  }
  assert.deepEqual({ ...r, ...sinMarcas }, { ...linea, ...sinMarcas })
  // SIN SELLO, NULL: nadie lo inventa. Con sello, viaja tal cual — la cerrada no lo recalcula, sólo lo muestra.
  assert.equal(r.sello, null)
  // `conLinea` (18/09/2026): la foto dice además si esta persona TIENE línea sellada. Sin ella, la pantalla escribe
  // «sin línea sellada» en vez de dibujar el cálculo de hoy sobre una quincena ya pagada.
  const foto = { valorHora: 5400, conLinea: true, piso: 5703, pisoDesde: '2026-05-01', hasta: '2026-06-15' }
  assert.deepEqual(sinOverrides(linea, null, {}, foto).sello, foto)
  // LA FOTO CERRADA TAMBIÉN DICE CUÁNTO FALTA: lo pagado son los adelantos de la foto, y el saldo, la resta.
  assert.equal(r.pagadoBanco, linea.yaTransferido)
  assert.equal(r.pagadoEfectivo, linea.adelanto)
  assert.equal(r.pago.saldoBanco, linea.porBanco - linea.yaTransferido)
  assert.deepEqual(r.formulas, {})
  assert.equal(r.presentismo, null)
  // LA FOTO CERRADA NO RECALCULA BLANCO + NEGRO (dueño, 14/09/2026).
  assert.equal(r.sueldo, null)
  assert.equal(r.sinNeto, false)
  assert.equal(Object.values(r.manual).some(Boolean), false)
  assert.equal(Object.values(r.origen).every((o) => o === 'calculado'), true)
  assert.deepEqual(r.discrepancia, {})
})

test('SÓLO SE GUARDA DONDE LA BASE PUEDE DECIR «VACÍO»', () => {
  // EL DEFECTO: dibujar editables las seis celdas cuya columna NOT NULL DEFAULT 0 no distingue un
  // cero escrito de un «no hay override».
  // CAMBIÓ EL 15/09/2026: las horas van a `horas_manual`. `horas` sola (la sellada del cierre) ya no alcanza.
  assert.deepEqual(camposGuardables(['horas', 'cobra', 'total']), [])
  assert.deepEqual(camposGuardables(['horas_manual', 'cobra', 'total']), ['horas'])
  assert.deepEqual(
    camposGuardables(['horas_manual', 'cobra_manual', 'adelanto_manual', 'ya_transferido_manual',
      'por_banco_manual', 'en_efectivo_manual', 'total_manual']),
    ['horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total'],
  )
})

// ═══ PRESENTISMO EN LA CADENA (15/09/2026) ═══ Lo que estos tests atrapan: que el descuento no baje
// COBRA, EN EFECTIVO y TOTAL; que baje cuando NO se perdió (plata nueva al revés); que en blanco + negro
// salga del neto (que es del estudio) en vez del negro; y que se evalúe con las horas que QUEDARON.

const PRESENTISMO = {
  categoria: 'oficial', basico: 6348, quincenaDesde: '2026-09-16', modalidad: 'hora' as const, esJefe: false, cerrada: false,
}
const CON_MARCA = { ...PRESENTISMO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }

test('presentismo perdido: COBRA baja el importe y EN EFECTIVO y TOTAL lo siguen', () => {
  const r = aplicarOverrides(linea, {}, 'obreros', null, null, CON_MARCA)
  // 20 % × (100 ÷ 2) × 6.348 = 63.480
  assert.equal(r.presentismo?.estado, 'perdido')
  assert.equal(r.presentismo?.importe, 63_480)
  assert.equal(r.cobra, 100_000 - 63_480)
  assert.equal(r.enEfectivo, 100_000 - 63_480 - 20_000 - 30_000)
  assert.equal(r.total, r.porBanco + (r.enEfectivo as number))
})

test('sin marca cobra lo mismo que hoy; el presentismo se publica como parte del cobra, no se suma', () => {
  const r = aplicarOverrides(linea, {}, 'obreros', null, null, { ...PRESENTISMO, tardanzas: [] })
  assert.equal(r.presentismo?.estado, 'aplica')
  assert.equal(r.presentismo?.importe, 63_480)
  assert.equal(r.cobra, 100_000)
})

test('se evalúa con las horas que quedaron: 120 h pisadas → 20 % × 60 × 6.348', () => {
  const r = aplicarOverrides(linea, { horas: 120 }, 'obreros', null, null, CON_MARCA)
  assert.equal(r.presentismo?.importe, 76_176)
  assert.equal(r.cobra, 120_000 - 76_176)
})

test('un COBRA escrito a mano gana también sobre el presentismo (manual > todo), y la marca se sigue viendo', () => {
  const r = aplicarOverrides(linea, { cobra: 90_000 }, 'obreros', null, null, CON_MARCA)
  assert.equal(r.cobra, 90_000)
  assert.equal(r.presentismo?.estado, 'perdido')
})

// CAMBIÓ EL 17/09/2026 (dueño: el presentismo no aplica a mensuales). Antes Oficina salía `null`, que la celda
// dibujaba «—» igual que «todavía no rige». MUTACIÓN: volver a `null`, o descontarle el importe → rojo.
test('Oficina (mensual) no lleva presentismo: «no aplica · mensual», aunque tenga marcas, y el cobra no se toca', () => {
  const oficina = liquidarLinea({ ...entrada, tarifa: { valorHora: null, netoMensual: 1_800_000, desde: '2026-09-01', origen: 'x' } }, 'oficina', null)
  const r = aplicarOverrides(oficina, {}, 'oficina', null, null, CON_MARCA)
  assert.equal(r.presentismo?.estado, 'no_aplica')
  assert.equal(r.presentismo?.motivoNoAplica, 'mensual')
  assert.equal(r.presentismo?.importe, null)
  assert.equal(r.cobra, 1_800_000)
  assert.equal(r.total, oficina.total, 'la cadena de pago queda igual')
  // LA QUINCENA CERRADA NO SE RECALCULA: el sello manda, aunque sea de un mensual.
  assert.equal(sinOverrides(oficina).presentismo, null)
})

test('sin entrada (llamador viejo) la línea sigue igual que siempre', () => {
  const r = aplicarOverrides(linea, {}, 'obreros')
  assert.equal(r.presentismo, null)
  assert.equal(r.cobra, 100_000)
})

// ═══ LO PAGADO DE VERDAD (dueño, 15/09/2026) ═══
//
// DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  6. Que «Pagado» nazca en cero y el cuadro pida pagar de nuevo lo que ya se entregó como adelanto.
//  7. Que escribir «Pagado» no le gane al adelanto calculado.
//  8. Que el saldo se calcule sobre un negro distinto del que muestra la columna.
//  9. Que la cuenta escrita con `=` no llegue a la celda y se pierda al reabrirla.

test('PAGADO ARRANCA EN LOS ADELANTOS: lo ya entregado no se vuelve a pedir', () => {
  const r = aplicarOverrides(linea, {}, 'obreros')
  assert.equal(r.pagadoBanco, 20_000, 'MUTACIÓN: arrancar en 0 pediría girar los 20.000 otra vez')
  assert.equal(r.pagadoEfectivo, 0)
  assert.equal(r.origen.pagadoBanco, 'calculado')
  assert.equal(r.pago.saldoBanco, 10_000)
  assert.equal(r.pago.saldoEfectivo, 70_000, 'el negro de la fila es cobra − banco = 70.000')
  assert.equal(r.pago.saldoTotal, 80_000)
})

test('UN PAGO ESCRITO A MANO LE GANA AL ADELANTO CALCULADO, Y SE MARCA', () => {
  const r = aplicarOverrides(linea, { pagadoEfectivo: 140_000 }, 'obreros')
  assert.equal(r.pagadoEfectivo, 140_000)
  assert.equal(r.manual.pagadoEfectivo, true)
  assert.equal(r.origen.pagadoEfectivo, 'manual')
  assert.equal(r.pago.saldoEfectivoBruto, -70_000)
  assert.equal(r.pago.saldoEfectivo, 0, 'compensado (dueño 16/09)')
  assert.equal(r.pago.aPagarEfectivo, 0)
  assert.equal(r.pago.aPagarBanco, 0, 'el exceso del efectivo se come los 10.000 que faltaban por banco')
  assert.equal(r.pago.saldoTotal, -60_000, 'y el resto queda como cobrado de más, a la vista')
})

test('VACIAR «PAGADO» DEVUELVE EL ADELANTO, NO UN CERO', () => {
  const r = aplicarOverrides(linea, { pagadoBanco: null }, 'obreros')
  assert.equal(r.pagadoBanco, 20_000)
  assert.equal(r.manual.pagadoBanco, false)
})

test('UN 0 ESCRITO EN «PAGADO» SÍ MANDA: «todavía no le giré nada» es una afirmación', () => {
  const r = aplicarOverrides(linea, { pagadoBanco: 0 }, 'obreros')
  assert.equal(r.pagadoBanco, 0, 'MUTACIÓN: leer el 0 como «sin override» devolvería 20.000')
  assert.equal(r.manual.pagadoBanco, true)
  assert.equal(r.pago.saldoBanco, 30_000)
})

test('LA CUENTA ESCRITA CON `=` VIAJA CON LA LÍNEA', () => {
  const r = aplicarOverrides(linea, { pagadoEfectivo: 140_000 }, 'obreros', null, null, null,
    { pagadoEfectivo: '=100000+40000' })
  assert.deepEqual(r.formulas, { pagadoEfectivo: '=100000+40000' })
  assert.equal(r.pagadoEfectivo, 140_000, 'lo que se paga es el VALOR; la cuenta sólo lo explica')
})

test('LA QUINCENA CERRADA CONSERVA EL PAGO REGISTRADO — y no lo marca como escrito a mano', () => {
  // EL DEFECTO QUE ATRAPA: cerrar la quincena y que el cuadro vuelva a decir que se le pagó el adelanto
  // calculado, borrando de la pantalla el pago que alguien registró. Y el de la vuelta: sellar esa columna,
  // que al reabrir haría aparecer como «manual» un número que no escribió nadie.
  const r = sinOverrides(linea, null, { pagadoBanco: 94_795.5 })
  assert.equal(r.pagadoBanco, 94_795.5)
  assert.equal(r.pago.saldoBancoBruto, linea.porBanco - 94_795.5)
  assert.equal(r.manual.pagadoBanco, false, 'la fila cerrada no dibuja marcas: es una foto')
  assert.equal(r.origen.pagadoBanco, 'calculado')
  // Sin registro, vuelven los adelantos de la foto.
  assert.equal(sinOverrides(linea).pagadoBanco, linea.yaTransferido)
})

test('EL CIERRE NO ESCRIBE LAS COLUMNAS DE PAGO', () => {
  // EL DEFECTO QUE ATRAPA: agregarlas a la foto de `escribirFoto`. Es el mismo que `horas_manual` ya pagó.
  const CIERRE = readFileSync(new URL('./liquidacionCierreActions.ts', import.meta.url), 'utf8')
  const foto = CIERRE.slice(CIERRE.indexOf('async function escribirFoto('), CIERRE.indexOf('function fotoDelPresentismo('))
  assert.ok(!/pagado_banco|pagado_efectivo/.test(foto), 'la foto del cierre no sella lo pagado')
})

// ═══ NULL NO ES CERO: «SIN DESGLOSE» (17/09/2026) ═══
//
// Ocho bloques de JORNALES de 2026 tienen la columna BANCO vacía en TODAS sus filas. La app leía ese NULL como 0 y
// el legajo decía «$0 por banco, todo en efectivo» de plata que nadie repartió. Estos tests fijan la diferencia entre
// un bloque donde nadie anotó BANCO (sin desglose) y uno donde la planilla escribió 0 (medido).
//
// MUTACIONES QUE PONEN ESTO EN ROJO: tratar `porBanco: null` del espejo igual que `porBanco: 0`; contar el 0 que
// el cargador escribe en `pagado_banco` como una afirmación; o que el flag mueva un importe de la cadena.

const entradaSinRecibo: EntradaDeLinea = {
  personaId: 'p2', nombre: 'Quiroga', horas: 100,
  tarifa: { valorHora: 6014.6, netoMensual: null, desde: '2026-01-01', origen: 'sheet:_J_OBREROS' },
  adelanto: 178_644, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}
const sinRecibo = liquidarLinea(entradaSinRecibo, 'obreros', null)

test('CERRADA sin recibo, sin espejo y sin un peso por banco: nadie afirmó el desglose, y lo pagado no cambia', () => {
  const r = sinOverrides(sinRecibo)
  assert.equal(r.sinDesglose, true)
  assert.equal(r.pago.pagado, 178_644)
  assert.equal(r.pago.pagadoEfectivo, 178_644, 'la cuenta es la de siempre: cambia cómo se DICE el reparto')
  // El cargador de JORNALES escribe pagado_banco = 0 justo cuando BANCO estaba vacío: ese 0 tampoco afirma nada.
  assert.equal(sinOverrides(sinRecibo, null, { pagadoBanco: 0, pagadoEfectivo: 178_644 }).sinDesglose, true)
})

test('la planilla con BANCO = 0 afirma; con la columna vacía en todo el bloque, no; vacía en un bloque medido, sí', () => {
  assert.equal(sinOverrides(sinRecibo, null, {}, null, { porBanco: 0 }).sinDesglose, false, 'un 0 escrito en la planilla es un dato')
  assert.equal(sinOverrides(sinRecibo, null, {}, null, { porBanco: null, bancoMedido: false }).sinDesglose, true, 'NULL en todo el bloque no es un dato')
  assert.equal(sinOverrides(sinRecibo, null, {}, null, { porBanco: null, bancoMedido: true }).sinDesglose, false, 'la celda vacía de un bloque medido es «nada por banco»')
})

test('un recibo, un giro registrado o un peso transferido afirman el desglose aunque la planilla calle', () => {
  assert.equal(sinOverrides(linea).sinDesglose, false, 'la línea de partida tiene recibo')
  assert.equal(sinOverrides(sinRecibo, null, { pagadoBanco: 94_795.5 }).sinDesglose, false)
  const conGiro = liquidarLinea({ ...entradaSinRecibo, yaTransferido: 60_000 }, 'obreros', null)
  assert.equal(sinOverrides(conGiro).sinDesglose, false, 'ADELANTO BANCO en la planilla es plata que salió por banco')
})

test('ABIERTA: lo escrito a mano afirma (aun un 0); sin nada, sin desglose; y el flag no mueve la cadena', () => {
  assert.equal(aplicarOverrides(sinRecibo, {}, 'obreros').sinDesglose, true)
  assert.equal(aplicarOverrides(sinRecibo, { porBanco: 0 }, 'obreros').sinDesglose, false)
  assert.equal(aplicarOverrides(sinRecibo, { pagadoBanco: 0 }, 'obreros').sinDesglose, false, '«todavía no le giré nada» es una afirmación')
  assert.equal(aplicarOverrides(sinRecibo, { pagadoEfectivo: 178_644 }, 'obreros').sinDesglose, false)
  assert.equal(aplicarOverrides(sinRecibo, {}, 'obreros', { porBanco: null, bancoMedido: false }).sinDesglose, true)
  assert.equal(aplicarOverrides(sinRecibo, {}, 'obreros', { porBanco: 230_240.12 }).sinDesglose, false)
  const r = aplicarOverrides(sinRecibo, {}, 'obreros')
  assert.deepEqual(
    [r.cobra, r.adelanto, r.porBanco, r.enEfectivo, r.total, r.pago.pagado],
    [sinRecibo.cobra, sinRecibo.adelanto, sinRecibo.porBanco, sinRecibo.enEfectivo, sinRecibo.total, 178_644],
  )
})

test('desgloseSinAfirmar, la regla sola', () => {
  const nada = { escritoAMano: false, neto: null, reciboNeto: null, jornales: null, pagadoBanco: 0 }
  assert.equal(desgloseSinAfirmar(nada), true)
  assert.equal(desgloseSinAfirmar({ ...nada, escritoAMano: true }), false)
  assert.equal(desgloseSinAfirmar({ ...nada, neto: 215_564.62 }), false)
  assert.equal(desgloseSinAfirmar({ ...nada, reciboNeto: 1 }), false)
  assert.equal(desgloseSinAfirmar({ ...nada, pagadoBanco: 1 }), false)
  assert.equal(desgloseSinAfirmar({ ...nada, jornales: {} }), true, 'un espejo que no habla del banco no afirma')
  assert.equal(desgloseSinAfirmar({ ...nada, jornales: { porBanco: 0 } }), false)
})
