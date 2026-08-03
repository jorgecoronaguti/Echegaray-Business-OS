// LOS TESTS DE LAS DOS DECISIONES. Cada uno atrapa un defecto que ya se pagó en producción: el
// tesorero publicó cuatro tablas y CERO propuestas tres corridas seguidas, porque medía toda
// colocación contra el 62,78% del descubierto.
//
// Si se revierte el arreglo —volver a usar el CFT como piso de colocación, o dejar de descontar la
// deuda del excedente, o dejar de nombrar el motivo de cada bloque sin propuesta— acá se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cancelarDescubierto, colocarExcedente, decidirTesoreria, varaDeColocacion,
  diasBreakEvenCheque, rendimientoPeriodo, MOTIVO,
} from './decision.mjs'
import { tasaDeReferencia, MODO } from './costo-liquidez.mjs'
import { impuestosDeColocacion, parametrosFiscales } from './impuestos-colocacion.mjs'

const CFT = 0.6278 // el acuerdo N°00007, verificado contra el cargo real del banco

/** Un candidato con sus impuestos REALES: el break-even tiene que salir de la carga medida, no de un literal. */
function candidato(nombre, tea, dias, monto, categoria = 'money_market') {
  const bruto = rendimientoPeriodo(tea, dias)
  const impuestos = impuestosDeColocacion({
    capital: monto, rendimientoBrutoPeriodo: bruto, categoria, parametros: parametrosFiscales({}),
  })
  return {
    instrumento_id: nombre, instrumento: nombre, categoria, tea,
    rendimiento_neto_periodo: impuestos.rendimiento_neto_periodo, impuestos,
  }
}

/** Un calendario plano: sin egresos no hay riesgo de empujar la caja al rojo. */
const calendarioPlano = (n) => Array.from({ length: n + 1 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: 0 }))

// ════════════════════════════════════════════════════════════════════════════
// DECISIÓN 1 · CANCELAR DESCUBIERTO
// ════════════════════════════════════════════════════════════════════════════

test('con descubierto abierto la propuesta es CANCELAR y no colocar', () => {
  const dias = 30
  const referencia = tasaDeReferencia({
    dias, monto: 10_000_000, deuda: 10_000_000, cft: CFT,
    dias_calendario: calendarioPlano(dias), cajaInicial: 10_000_000, interesDia: () => 0,
  })
  const d = decidirTesoreria({
    deuda: 10_000_000, disponible: 10_000_000, reserva: 0, cftAnual: CFT,
    ventanas: [{
      bloque: 'C', titulo: '8 a 30 días', dias, monto_maximo: 10_000_000, referencia,
      candidatos: [candidato('FCI Money Market', 0.40, dias, 10_000_000)],
    }],
  })
  assert.equal(d.cancelacion.hay_propuesta, true)
  assert.equal(d.cancelacion.monto_a_cancelar, 10_000_000)
  assert.equal(d.cancelacion.prioridad, 1, 'cancelar va primero: le gana a cualquier colocación')
  // No queda un peso que colocar, y el motivo lo dice con nombre propio.
  assert.equal(d.colocaciones[0].hay_propuesta, false)
  assert.equal(d.colocaciones[0].codigo, MOTIVO.TODO_A_DESCUBIERTO)
  assert.match(d.colocaciones[0].motivo, /van enteros a cancelar descubierto/)
  assert.equal(d.n_propuestas, 1, 'la única propuesta es la cancelación')
})

test('cancelar el descubierto rinde más que la mejor colocación del mercado, al mismo monto y plazo', () => {
  const dias = 30
  const monto = 10_000_000
  const c = cancelarDescubierto({ deuda: monto, disponible: monto, cftAnual: CFT, dias })
  // El mejor instrumento realista de caja operativa, sin impuestos siquiera, no llega.
  const mejorColocacion = monto * rendimientoPeriodo(0.45, dias)
  assert.ok(c.ahorro_periodo > mejorColocacion,
    `cancelar deja $${c.ahorro_periodo} y colocar al 45% bruto deja $${Math.round(mejorColocacion)}`)
  assert.equal(c.evidencia, 'hecho', 'el CFT está verificado contra el cargo real del banco')
})

test('la cancelación NO perfora la reserva aprobada', () => {
  const c = cancelarDescubierto({ deuda: 8_000_000, disponible: 10_000_000, reserva: 6_000_000, cftAnual: CFT })
  assert.equal(c.monto_a_cancelar, 4_000_000, 'sólo se cancela con lo que sobra por encima de la reserva')
  assert.equal(c.deuda_remanente, 4_000_000)
  assert.equal(c.remanente_disponible, 0)
})

test('sin saldo deudor no hay propuesta de cancelación, y se dice por qué', () => {
  const c = cancelarDescubierto({ deuda: 0, disponible: 50_000_000, cftAnual: CFT })
  assert.equal(c.hay_propuesta, false)
  assert.match(c.motivo, /no hay saldo deudor/)
})

// ════════════════════════════════════════════════════════════════════════════
// DECISIÓN 2 · COLOCAR EL EXCEDENTE
// ════════════════════════════════════════════════════════════════════════════

test('SIN descubierto, un instrumento con neto positivo SÍ se propone aunque rinda menos que el 62,78%', () => {
  // EL DEFECTO CENTRAL. Un 30% anual sobre plata que iba a estar parada es ganancia pura; medirlo
  // contra el costo de estar corto lo rechazaba, y así nunca hubo una sola propuesta.
  const dias = 90
  const monto = 20_000_000
  const referencia = tasaDeReferencia({
    dias, monto, deuda: 0, cft: CFT, cajaInicial: 60_000_000, reserva: 0,
    dias_calendario: calendarioPlano(dias), interesDia: () => 0,
  })
  assert.equal(referencia.modo, MODO.COSTO_OPORTUNIDAD)
  const r = colocarExcedente({
    excedente: monto, dias, referencia,
    candidatos: [candidato('Plazo fijo 30%', 0.30, dias, monto, 'caucion')],
  })
  assert.ok(0.30 < CFT, 'el instrumento rinde MENOS que el costo del descubierto, a propósito')
  assert.equal(r.hay_propuesta, true, 'rendir menos que el descubierto no invalida una colocación')
  assert.equal(r.vara.periodo, 0, 'la vara es cero neto, NO el CFT del descubierto')
  assert.ok(r.propuestas[0].rendimiento_neto_periodo > 0)
  assert.ok(r.propuestas[0].gana_en_pesos > 0)
})

test('la vara de colocación NUNCA es el CFT, ni siquiera cuando la referencia habla de deuda', () => {
  // Guarda de regresión directa: si alguien vuelve a leer el tramo de cancelación de deuda como vara
  // de colocación, este assert se pone rojo.
  const dias = 30
  const referencia = tasaDeReferencia({
    dias, monto: 5_000_000, deuda: 5_000_000, cft: CFT,
    dias_calendario: calendarioPlano(dias), cajaInicial: 5_000_000, interesDia: () => 0,
  })
  assert.ok(referencia.hurdle_periodo > 0.03, 'la referencia global sí trae el CFT del período')
  const vara = varaDeColocacion(referencia)
  assert.equal(vara.periodo, 0)
  assert.equal(vara.modo, MODO.COSTO_OPORTUNIDAD)
})

test('el costo del descubierto SÍ entra si inmovilizar empuja la caja al rojo antes del vencimiento', () => {
  const dias = 30
  const cal = Array.from({ length: dias + 1 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: i === 10 ? 9_000_000 : 0 }))
  const referencia = tasaDeReferencia({
    dias, monto: 8_000_000, deuda: 0, cft: CFT, cajaInicial: 10_000_000, reserva: 0,
    dias_calendario: cal, factorIngresos: 1, interesDia: (s) => Math.abs(s) * CFT / 365,
  })
  const vara = varaDeColocacion(referencia)
  assert.equal(vara.modo, MODO.CONTINGENCIA)
  assert.ok(vara.periodo > 0, 'el riesgo de quedar corto es la ÚNICA puerta por la que vuelve el descubierto')
})

test('un plazo por debajo del break-even del impuesto al cheque no se propone, y se dice cuántos días faltan', () => {
  const dias = 12
  const monto = 20_000_000
  const referencia = tasaDeReferencia({
    dias, monto, deuda: 0, cft: CFT, cajaInicial: 60_000_000, reserva: 0,
    dias_calendario: calendarioPlano(dias), interesDia: () => 0,
  })
  const r = colocarExcedente({
    excedente: monto, dias, referencia,
    candidatos: [candidato('FCI Money Market', 0.30, dias, monto)],
  })
  assert.equal(r.hay_propuesta, false)
  assert.equal(r.codigo, MOTIVO.BREAK_EVEN_CHEQUE)
  assert.match(r.descartados[0].motivo, /impuesto al cheque/)
  assert.ok(r.descartados[0].dias_break_even_cheque > dias)
})

test('el break-even sale de la carga MEDIDA, y con la ida y vuelta de la Ley 25.413 cae cerca de los 19 días', () => {
  // 1,2% del capital contra una TNA del orden del 23,5%: el break-even del comentario histórico. No
  // se fija un literal — se invierte la misma función de rendimiento que usa el motor.
  const d = diasBreakEvenCheque({ tea: 0.235, cargaSobreCapital: 0.012 })
  assert.ok(d > 15 && d < 25, `break-even ${d.toFixed(1)} días, fuera del orden esperado`)
  // Coherencia dura: al break-even exacto, el rendimiento del período iguala la carga.
  assert.ok(Math.abs(rendimientoPeriodo(0.235, d) - 0.012) < 1e-12)
  // Una tasa nula nunca cubre un costo fijo: no se devuelve un número tranquilizador.
  assert.equal(diasBreakEvenCheque({ tea: 0, cargaSobreCapital: 0.012 }), Infinity)
  assert.equal(diasBreakEvenCheque({ tea: 0.30, cargaSobreCapital: 0 }), null, 'sin carga no hay break-even que calcular')
})

test('el neto publicado declara qué impuestos contempla y cuáles NO', () => {
  const dias = 90
  const monto = 20_000_000
  const r = colocarExcedente({
    excedente: monto, dias, referencia: null,
    candidatos: [candidato('Caución 30%', 0.30, dias, monto, 'caucion')],
  })
  const n = r.propuestas[0].neto_declarado
  assert.ok(n.contempla.some((x) => /25\.413/.test(x)), 'contempla el impuesto al cheque, que está medido')
  assert.deepEqual(n.no_contempla, ['Ingresos Brutos (San Juan) sobre el resultado financiero', 'Impuesto a las Ganancias'])
  assert.equal(n.es_techo, true, 'con impuestos DESCONOCIDOS el neto es un techo, no un resultado')
  assert.match(r.propuestas[0].advertencias[0], /el resultado real es menor/)
})

// ════════════════════════════════════════════════════════════════════════════
// POR QUÉ NO HAY PROPUESTA — la mitad de la respuesta que nunca se escribía
// ════════════════════════════════════════════════════════════════════════════

test('cada bloque sin propuesta dice POR QUÉ, con un código distinto por causa', () => {
  const dias = 90
  const referencia = tasaDeReferencia({
    dias, monto: 1_000_000, deuda: 0, cft: CFT, cajaInicial: 50_000_000, reserva: 0,
    dias_calendario: calendarioPlano(dias), interesDia: () => 0,
  })
  // El bloque E inmoviliza plata que hace falta: ahí el costo de quedar corto sube la vara por encima
  // de lo que paga el instrumento. Es el único caso en que una colocación con neto positivo se rechaza.
  const calConEgreso = Array.from({ length: dias + 1 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: i === 10 ? 6_000_000 : 0 }))
  const refContingencia = tasaDeReferencia({
    dias, monto: 5_000_000, deuda: 0, cft: CFT, cajaInicial: 6_000_000, reserva: 0,
    dias_calendario: calConEgreso, factorIngresos: 1, interesDia: (s) => Math.abs(s) * CFT / 365,
  })
  const d = decidirTesoreria({
    deuda: 0, disponible: 50_000_000, reserva: 0, cftAnual: CFT,
    ventanas: [
      { bloque: 'A', titulo: 'hoy', dias: 1, monto_maximo: 0, referencia: null, candidatos: [] },
      { bloque: 'D', titulo: '31 a 90 días', dias, monto_maximo: 5_000_000, referencia, candidatos: [] },
      {
        bloque: 'E', titulo: 'más de 90 días', dias, monto_maximo: 5_000_000, referencia: refContingencia,
        candidatos: [candidato('FCI Money Market', 0.30, dias, 5_000_000)],
      },
    ],
  })
  const por = Object.fromEntries(d.sin_propuesta.map((s) => [s.bloque, s]))
  assert.equal(por.A.codigo, MOTIVO.SIN_EXCEDENTE)
  assert.match(por.A.motivo, /no hay excedente colocable/)
  assert.equal(por.D.codigo, MOTIVO.SIN_INSTRUMENTO)
  assert.match(por.D.motivo, /ningún instrumento con cotización vigente/)
  assert.equal(por.E.codigo, MOTIVO.NO_SUPERA_VARA)
  assert.ok(d.colocaciones[2].descartados[0].rendimiento_neto_periodo > 0,
    'rinde en positivo y aun así se rechaza: lo que lo mata es el costo de quedar corto, no el CFT')
  assert.equal(d.n_propuestas, 0)
  // Y ninguno queda sin explicación: eso es exactamente lo que se rechazó tres veces.
  assert.equal(d.sin_propuesta.filter((s) => !s.codigo || !s.motivo).length, 0)
})
