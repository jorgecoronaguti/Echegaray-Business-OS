// EL ACUERDO 50/50, Y LA LÍNEA QUE NO SE MUEVE POR MOSTRARLO.
//
// El dueño (10/09/2026): «el acuerdo con todos los empleados es 50% en blanco y 50% en efectivo, no
// me lo está mostrando actualmente».
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que POR BANCO vuelva a calcularse como el 50% del acuerdo. Es el defecto que
//     `nomina-banco-recibo.mjs` corrigió el 31/08/2026 (Aguero: acuerdo $294.000, recibo
//     $215.564,62). Mostrar el acuerdo no puede reescribir la cadena real de pago.
//  2. Que se le invente un 50/50 a Oficina, cuyo recibo del 01/09 fue $1.326.667,64 sobre
//     $1.800.000 — no es la mitad, y qué es sigue siendo una pregunta abierta al dueño.
//  3. Que se le invente un 50/50 a un subcontratista del grupo de Gerson Castro (cuadro `final`),
//     que no es personal en relación de dependencia.
//  4. Que una mitad de un importe impar deje un centavo colgando: blanco + efectivo debe dar COBRA.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  liquidarLinea, repartoDelAcuerdo, totalesDeCuadro,
  type EntradaDeLinea, type TarifaVigente,
} from './liquidacionQuincena.ts'
import { aplicarOverrides } from './liquidacionOverrides.ts'

const TARIFA: TarifaVigente = {
  valorHora: 6000, netoMensual: null, desde: '2026-01-01', origen: 'persona_tarifa',
}

const base: EntradaDeLinea = {
  personaId: 'p1', nombre: 'AGUERO CRISTIAN', horas: 100, tarifa: TARIFA,
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}

test('EL REPARTO ES LA MITAD Y LA MITAD, Y LAS DOS DAN COBRA', () => {
  assert.deepEqual(repartoDelAcuerdo(600000, 'hora'), { blanco: 300000, efectivo: 300000 })
  // Un importe impar: la segunda mitad sale por resta, así que la suma cierra exacta.
  const r = repartoDelAcuerdo(294001.11, 'hora')
  assert.equal((r.blanco ?? 0) + (r.efectivo ?? 0), 294001.11)
})

test('SIN COBRA NO HAY MITADES: null, nunca $ 0', () => {
  assert.deepEqual(repartoDelAcuerdo(null, 'hora'), { blanco: null, efectivo: null })
})

test('OFICINA Y SUBCONTRATISTAS NO LLEVAN 50/50: null, y la pantalla escribe «—»', () => {
  // EL DEFECTO QUE ATRAPA: escribirle a Oficina una mitad que nadie acordó. El recibo del 01/09 de
  // Maldonado/Nievas fue $1.326.667,64 sobre $1.800.000 — 73,7 %, no 50 %.
  assert.deepEqual(repartoDelAcuerdo(1800000, 'mensual'), { blanco: null, efectivo: null })
  assert.deepEqual(repartoDelAcuerdo(1800000, 'ninguna'), { blanco: null, efectivo: null })
  const oficina = liquidarLinea({
    ...base, personaId: 'p2', nombre: 'NIEVAS', horas: null,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-01-01', origen: 'persona_tarifa' },
  }, 'oficina')
  assert.equal(oficina.cobra, 1800000)
  assert.equal(oficina.blancoAcuerdo, null)
  assert.equal(oficina.efectivoAcuerdo, null)
})

test('LA LÍNEA DEL OBRERO PUBLICA LAS DOS MITADES Y NO CAMBIA LA CADENA REAL DE PAGO', () => {
  const l = liquidarLinea({ ...base, reciboNeto: 215564.62, giroEnElLote: true }, 'obreros')
  assert.equal(l.cobra, 600000)
  assert.equal(l.blancoAcuerdo, 300000)
  assert.equal(l.efectivoAcuerdo, 300000)
  // EL DEFECTO QUE ATRAPA: que POR BANCO vuelva a ser el 50 %. Sale del recibo girado, y la
  // diferencia contra el acuerdo ($84.435,38) es la que termina en efectivo.
  assert.equal(l.porBanco, 215564.62)
  assert.notEqual(l.porBanco, l.blancoAcuerdo)
  assert.equal(l.enEfectivo, 384435.38)
  assert.equal(l.total, 600000)
})

test('PISAR COBRA A MANO MUEVE LAS DOS MITADES: son mitades de lo que se va a pagar', () => {
  const l = aplicarOverrides(liquidarLinea(base, 'obreros'), { cobra: 700000 }, 'obreros')
  assert.equal(l.cobra, 700000)
  assert.equal(l.blancoAcuerdo, 350000)
  assert.equal(l.efectivoAcuerdo, 350000)
})

test('EL PIE SUMA LAS MITADES Y CUENTA APARTE A QUIEN NO TIENE REPARTO', () => {
  const obrero = liquidarLinea(base, 'obreros')
  const oficina = liquidarLinea({
    ...base, personaId: 'p2', horas: null,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-01-01', origen: 'persona_tarifa' },
  }, 'oficina')
  const t = totalesDeCuadro([obrero, oficina])
  // EL DEFECTO QUE ATRAPA: sumar los null como 0 y publicar dos mitades a las que les falta gente.
  assert.equal(t.blancoAcuerdo, 300000)
  assert.equal(t.efectivoAcuerdo, 300000)
  assert.equal(t.sinReparto, 1)
  assert.equal(t.cobra, 2400000, 'el total de COBRA sí incluye a Oficina')
})
