import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quincenaDe } from './quincena.ts'
import {
  horasDeQuincena, horasEsperadasDeQuincena, liquidarLinea, tarifaVigenteAl, tarjetaDeQuincena, totalesDeCuadro,
  type EntradaDeLinea, type TarifaVigente,
} from './liquidacionQuincena.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN, uno por uno:
//
//  1. Que una persona SIN TARIFA cargada se liquide en $ 0 en vez de decir «sin tarifa». Es el
//     mismo defecto que el repo ya pagó con «recibo sin liquidación nunca es $ 0», y acá la plata
//     se entrega en mano: nadie la reclama después.
//  2. Que el ADELANTO o el YA TRANSFERIDO no se resten, y se le pague dos veces a la misma persona.
//  3. Que un RECIBO SIN GIRO en el extracto se cuente como «por banco». El estudio liquidó, el banco
//     no movió: contarlo como girado le paga de menos a la persona ese mismo día.
//  4. Que una AUSENCIA SIN MOTIVO vuelva a pagar la jornada (regla del dueño del 08/09/2026), o que
//     una CON motivo que paga deje de pagarla.
//  5. Que POR BANCO + EN EFECTIVO deje de dar TOTAL — la promesa de la tarjeta de arriba.

const Q = quincenaDe('2026-09-05')          // 1ª quincena de septiembre 2026: 01 al 15
const TARIFA: TarifaVigente = {
  valorHora: 5000, netoMensual: null, desde: '2026-01-01', origen: 'sheet:_J_OBREROS',
}

const base: EntradaDeLinea = {
  personaId: 'p1', nombre: 'PRUEBA', horas: 100, tarifa: TARIFA,
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}

// ═══════════════════════════════ HORAS ═══════════════════════════════

test('horas trabajadas: se suman los días de la quincena, sin domingos', () => {
  const r = horasDeQuincena(Q, [
    { fecha: '2026-09-01', tipo_hora: 'normal', horas: 9, notas: null },
    { fecha: '2026-09-02', tipo_hora: 'normal', horas: '8.5', notas: null },
    // Domingo 06/09: el dueño lo sacó de la consideración el 08/09/2026. Si alguien devuelve el
    // domingo a la ventana, este test se pone rojo con 9 horas de más.
    { fecha: '2026-09-06', tipo_hora: 'normal', horas: 9, notas: null },
  ])
  assert.equal(r.horas, 17.5)
  assert.equal(r.dias, 2)
})

test('ausencia SIN motivo: cero horas, y no rompe el resto de la quincena', () => {
  const r = horasDeQuincena(Q, [
    { fecha: '2026-09-01', tipo_hora: 'normal', horas: 9, notas: null },
    { fecha: '2026-09-02', tipo_hora: 'ausencia', horas: 9, notas: null },
  ])
  assert.equal(r.horas, 9, 'la ausencia sin motivo no suma aunque tenga 9 horas GUARDADAS')
  assert.equal(r.dias, 1)
})

test('ausencia CON motivo que paga, declarada en asistencia_dia y sin registro de horas', () => {
  // Jueves 10/09 → 9 h · viernes 11/09 → 8 h. La jornada sale del DÍA DE LA SEMANA, no de la obra.
  const r = horasDeQuincena(Q, [], [
    { fecha: '2026-09-10', estado: 'licencia', motivo: 'enfermedad' },
    { fecha: '2026-09-11', estado: 'licencia', motivo: 'enfermedad' },
    { fecha: '2026-09-09', estado: 'ausente', motivo: 'falta' },
  ])
  assert.equal(r.horas, 17, '9 del jueves + 8 del viernes; la falta sin justificar vale 0')
  assert.equal(r.dias, 2)
})

test('lo trabajado gana sobre la ausencia declarada el mismo día: nunca suma dos veces', () => {
  const r = horasDeQuincena(
    Q,
    [{ fecha: '2026-09-09', tipo_hora: 'normal', horas: 8, notas: null }],
    [{ fecha: '2026-09-09', estado: 'ausente', motivo: 'enfermedad' }],
  )
  assert.equal(r.horas, 8, 'no 8 + 9')
})

test('día declarado PRESENTE sin una sola hora cargada: vale cero y se cuenta', () => {
  // No se derivan 9 horas de un «vino»: presencia y horas imputadas son dos cosas distintas. Pero
  // el cero se dice, porque ahí es donde se esconde el que trabajó y nadie cargó.
  const r = horasDeQuincena(Q, [], [{ fecha: '2026-09-09', estado: 'presente', motivo: null }])
  assert.equal(r.horas, 0)
  assert.equal(r.presentesSinHoras, 1)
})

// ═══════════════════════════════ PLATA ═══════════════════════════════

test('obrero sin adelantos: COBRA = horas × $/hora y todo sale en efectivo', () => {
  const l = liquidarLinea(base, 'obreros')
  assert.equal(l.cobra, 500000)
  assert.equal(l.porBanco, 0)
  assert.equal(l.enEfectivo, 500000)
  assert.equal(l.total, 500000)
  assert.equal(l.sinTarifa, false)
})

test('SIN TARIFA: COBRA es null, no $ 0 — y la fila lo declara', () => {
  const l = liquidarLinea({ ...base, tarifa: null }, 'obreros')
  assert.equal(l.cobra, null)
  assert.equal(l.enEfectivo, null)
  assert.equal(l.total, null)
  assert.equal(l.sinTarifa, true)
  assert.equal(l.valorHora, null)
})

test('sin horas calculables tampoco se inventa un importe', () => {
  const l = liquidarLinea({ ...base, horas: null }, 'obreros')
  assert.equal(l.cobra, null)
  assert.equal(l.sinTarifa, false, 'la tarifa está; lo que falta son las horas')
})

test('ADELANTO y YA TRANSFERIDO se restan del efectivo, no del total', () => {
  const l = liquidarLinea({ ...base, adelanto: 120000, yaTransferido: 94796 }, 'obreros')
  assert.equal(l.cobra, 500000)
  assert.equal(l.enEfectivo, 285204, '500.000 − 120.000 − 94.796')
  assert.equal(l.total, 285204, 'el total es lo que FALTA pagar: banco + efectivo')
})

test('el adelanto puede superar lo que cobra, y el efectivo queda en negativo a la vista', () => {
  const l = liquidarLinea({ ...base, horas: 10, adelanto: 140000 }, 'obreros')
  assert.equal(l.cobra, 50000)
  assert.equal(l.enEfectivo, -90000, 'se debe: taparlo con un cero perdería la deuda')
})

test('RECIBO SIN GIRO en el extracto NO es «por banco»', () => {
  const l = liquidarLinea({ ...base, reciboNeto: 215564.62, giroEnElLote: false }, 'obreros')
  assert.equal(l.porBanco, 0, 'el estudio liquidó; el banco no movió')
  assert.equal(l.reciboSinGiro, true)
  assert.equal(l.enEfectivo, 500000)
})

test('recibo CON giro confirmado: sale por banco y el efectivo completa hasta el total', () => {
  const l = liquidarLinea({ ...base, reciboNeto: 215564.62, giroEnElLote: true }, 'obreros')
  assert.equal(l.porBanco, 215564.62)
  assert.equal(l.enEfectivo, 284435.38)
  assert.equal(l.total, 500000, 'POR BANCO + EN EFECTIVO = TOTAL')
  assert.equal(l.reciboSinGiro, false)
})

test('oficina cobra el neto mensual acordado, no horas por tarifa', () => {
  const l = liquidarLinea({
    ...base,
    horas: null,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-09-01', origen: 'acuerdo' },
  }, 'oficina')
  assert.equal(l.cobra, 1800000)
  assert.equal(l.valorHora, null)
})

test('liquidación final: la mitad blanca por dos; sin recibo final no hay total', () => {
  const conRecibo = liquidarLinea(
    { ...base, tarifa: null, horas: null, mitadBlanca: 330431 }, 'final',
  )
  assert.equal(conRecibo.cobra, 660862)
  assert.equal(conRecibo.sinTarifa, false, 'una liquidación final no necesita $/hora')

  const sinRecibo = liquidarLinea({ ...base, tarifa: null, horas: null }, 'final')
  assert.equal(sinRecibo.cobra, null)
})

test('EFECTIVO redondeado viaja tal cual y no entra en ninguna cuenta', () => {
  const l = liquidarLinea(base, 'obreros', 412000)
  assert.equal(l.efectivoRedondeado, 412000)
  assert.equal(l.enEfectivo, 500000, 'el redondeo del dueño no toca el calculado')
  assert.equal(l.total, 500000)
})

// ═══════════════════════════════ TOTALES ═══════════════════════════════

test('los totales excluyen las líneas sin tarifa y las CUENTAN', () => {
  const lineas = [
    liquidarLinea(base, 'obreros'),
    liquidarLinea({ ...base, personaId: 'p2', adelanto: 100000 }, 'obreros'),
    liquidarLinea({ ...base, personaId: 'p3', tarifa: null }, 'obreros'),
  ]
  const t = totalesDeCuadro(lineas)
  assert.equal(t.personas, 3)
  assert.equal(t.cobra, 1000000, 'el que no se pudo liquidar NO suma cero: no suma')
  assert.equal(t.adelanto, 100000)
  assert.equal(t.enEfectivo, 900000)
  assert.equal(t.sinTarifa, 1)
})

test('la tarjeta cierra: POR BANCO + EN EFECTIVO = TOTAL', () => {
  const obreros = totalesDeCuadro([
    liquidarLinea({ ...base, reciboNeto: 200000, giroEnElLote: true }, 'obreros'),
  ])
  const oficina = totalesDeCuadro([
    liquidarLinea({
      ...base, personaId: 'o1', horas: null,
      tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-09-01', origen: 'acuerdo' },
    }, 'oficina'),
  ])
  const tarjeta = tarjetaDeQuincena([obreros, oficina])
  assert.equal(tarjeta.porBanco, 200000)
  assert.equal(tarjeta.enEfectivo, 2100000)
  assert.equal(tarjeta.total, 2300000)
  assert.equal(tarjeta.cierra, true)
})

// ═══════════════════════════════ VIGENCIA ═══════════════════════════════

test('la tarifa vigente es la de la FECHA, no la última cargada', () => {
  const tarifas: TarifaVigente[] = [
    { valorHora: 4000, netoMensual: null, desde: '2026-01-01', origen: 'sheet:_J_OBREROS' },
    { valorHora: 5250, netoMensual: null, desde: '2026-09-01', origen: 'sheet:_J_OBREROS' },
  ]
  assert.equal(tarifaVigenteAl(tarifas, '2026-03-15')?.valorHora, 4000, 'marzo se liquida a marzo')
  assert.equal(tarifaVigenteAl(tarifas, '2026-09-15')?.valorHora, 5250)
  assert.equal(tarifaVigenteAl(tarifas, '2025-12-31'), null, 'antes de la primera no hay tarifa')
})

test('R2 · LAS HORAS ESPERADAS DE LA 1ª DE SEPTIEMBRE SON 97, NO 61,6', () => {
  // EL DEFECTO QUE ATRAPA: el denominador de «cargadas / esperadas» salía de multiplicar los días
  // hábiles por una jornada uniforme (8,8 h × 7 = 61,6 h). El dueño fijó 9 h de L a J y 8 los V el
  // 08/09/2026, así que la cuenta es día por día: 9 días de L a J y 2 viernes.
  assert.equal(horasEsperadasDeQuincena(quincenaDe('2026-09-08')), 97)

  // Otra quincena da otro número: clavar 97 sería una constante, no una regla. La 1ª de febrero de
  // 2026 arranca domingo y tiene un día hábil menos — 8 días de L a J y 2 viernes.
  assert.equal(horasEsperadasDeQuincena(quincenaDe('2026-02-10')), 88, '8×9 + 2×8')

  // Y el sábado no aporta: es la mitad de la regla que un promedio uniforme borra.
  assert.equal(horasEsperadasDeQuincena({ desde: '2026-09-05', hasta: '2026-09-05' }), 0)
})
