// EL PUENTE RECIBO ↔ PLANILLA: SI NO SABE, TIENE QUE DECIR QUE NO SABE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CUIL_POR_PERSONA_DE_PLANILLA, SIN_RECIBO_EN_LA_QUINCENA, COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA,
  bancoDeLaPersona, reparto50DeLiquidacionFinal,
} from './nomina-banco-recibo.mjs'

const recibos = new Map([['20294271067', { neto: 215564.62, etiqueta: 'SEGUNDA QUINCENA 08/2026' }]])

test('banco · con recibo, el banco ES el neto del recibo', () => {
  const r = bancoDeLaPersona('Aguero Cristian', recibos)
  assert.equal(r.banco, 215564.62)
  assert.match(r.fuente, /recibo/)
})

test('banco · sin recibo es null, NUNCA el 50% ni cero', () => {
  // El defecto que este módulo viene a impedir: que la falta de recibo se resuelva sola volviendo
  // al cálculo viejo. Un cero le paga de menos; el 50% le paga lo que el recibo no dice.
  const r = bancoDeLaPersona('Rosales Diego', recibos)
  assert.equal(r.banco, null)
  assert.match(r.fuente, /sin recibo confirmado/)
})

test('banco · una persona que no está en el puente se declara, no se adivina', () => {
  const r = bancoDeLaPersona('Alguien Nuevo', recibos)
  assert.equal(r.banco, null)
  assert.match(r.fuente, /nadie declaró el CUIL/)
})

test('banco · quien salió por liquidación final dice POR QUÉ no cobra la quincena', () => {
  for (const n of ['Jofre Ismael', 'Sosa Raul']) {
    const r = bancoDeLaPersona(n, recibos)
    assert.equal(r.banco, null)
    assert.match(r.fuente, /liquidación final/)
  }
})

test('banco · Castillo queda como FALTA_DATO, que no es lo mismo que una baja', () => {
  // «No tiene recibo porque se fue» y «no tiene recibo y no sabemos por qué» son dos cosas, y la
  // segunda es un hueco que alguien tiene que mirar antes de pagar.
  const r = bancoDeLaPersona('Castillo Carlos', recibos)
  assert.equal(r.banco, null)
  assert.match(r.fuente, /FALTA_DATO/)
})

test('banco · un recibo con neto 0 o negativo no es un banco válido', () => {
  const raros = new Map([['20294271067', { neto: 0 }], ['x', { neto: -5 }]])
  assert.equal(bancoDeLaPersona('Aguero Cristian', raros).banco, null)
})

test('el puente cubre a TODOS los de la planilla: o mapea, o declara por qué no', () => {
  // El invariante que impide que alguien desaparezca del cuadro en silencio.
  const enPlanilla = [
    'Aguero Cristian', 'Emanuel Alaniz', 'Gonzalez Carlos', 'Gonzalez Emiliano', 'Gonzalez Juan',
    'Jofre Ismael', 'Ochoa Eduardo', 'Pastran Marcelo', 'Petina Jairo', 'Quiroga Alexander',
    'Quiroga Sebastian', 'Reta Sebastian', 'Rosales Diego', 'Sosa Raul', 'Tello Juan',
    'Zogber Leonardo', 'Castillo Carlos',
  ]
  for (const n of enPlanilla) {
    const conocido = n in CUIL_POR_PERSONA_DE_PLANILLA || n in SIN_RECIBO_EN_LA_QUINCENA
    assert.ok(conocido, `«${n}» no está ni mapeado ni declarado: se caería del cuadro sin que nadie lo note`)
  }
})

test('los tres que cobran y no están en la planilla están declarados', () => {
  // Tienen recibo pero no horas: su total no se puede calcular y su efectivo queda en nulo.
  assert.equal(COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA.length, 3)
  for (const p of COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA) assert.ok(p.legajo && p.nombre)
})

test('liquidación final · el recibo es la MITAD, así que el total es el doble', () => {
  // Leerlo al revés —tomar el recibo como el total y pagar la mitad en efectivo— le paga a Sosa
  // $165.215 en negro en vez de $330.431. Es la mitad de su plata.
  const r = reparto50DeLiquidacionFinal(330430.68)
  assert.deepEqual(r, { blanco: 330430.68, negro: 330430.68, total: 660861.36 })
})

test('liquidación final · sin neto no se inventa un reparto', () => {
  for (const malo of [null, undefined, 0, -1, 'nada', NaN]) {
    assert.deepEqual(reparto50DeLiquidacionFinal(malo), { blanco: null, negro: null, total: null })
  }
})
