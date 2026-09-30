// EL BÁSICO DEL PRESENTISMO ES EL $/H DEL BLANCO (dueño, 30/09/2026).
//
// *«corregí los valores hora de la segunda quincena en blanco según lo que indica el valor de los recibos de la
// primera quincena, según categoría y persona»*. El 0401 del estimado ya tomaba el $/h del último recibo real (Q1-09:
// oficial $6.468), pero el bloque «Presentismo» seguía con el piso de la categoría de plataforma ($6.348): Zogbe
// mostraba en la misma pantalla 0425 a $6.468/h y el presentismo a $6.348/h. El importe de ese bloque es el que se
// suma en el pie («en juego», «perdido»), así que eran dos cifras distintas del mismo concepto.
//
// MUTACIÓN: volver a pasar `entradaPresentismo` sin reemplazar `basico` en `aplicarOverrides` → rojo en el primer y
// el segundo test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ReciboParaReglas } from './reglasDelRecibo.ts'
import { reglasDelRecibo } from './reglasDelRecibo.ts'
import { valorHoraDelBlanco, type BaseDelEstimado, type EntradaDeBlanco } from './sueldoBlancoNegro.ts'
import { aplicarOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'

const RECIBOS: ReciboParaReglas[] = [
  { persona: 'Z', periodo: 'Q1-09/2026', valorHora: 6468, horasNormales: 50, horasFeriado: 0, horasOtras: 0, conceptos: [] },
]
const BASE: BaseDelEstimado = { periodo: 'Q2-09/2026', reglas: reglasDelRecibo(RECIBOS, 'Q2-09/2026'), feriados: 0, recibos: RECIBOS, presentismoPropio: true }
const blanco = (persona: string | null): EntradaDeBlanco => ({
  recibo: null, netoDeNomina: null, pisoCategoria: 6348,
  proporcion: { cociente: 0.73, origen: 'persona', recibos: 6 }, estimacion: { base: BASE, persona },
})
// El piso de plataforma viaja en la entrada del presentismo, como lo arma el servicio (`pisoDe`).
const CUMPLE = { categoria: 'oficial', basico: 6348, quincenaDesde: '2026-09-16', modalidad: 'hora' as const, esJefe: false, cerrada: false, tardanzas: [] }
const obrero = liquidarLinea({
  personaId: 'p', nombre: 'N', nombreOrden: 'N', horas: 100, tarifa: { valorHora: 7000, netoMensual: null, desde: '2026-09-01', origen: 'x' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'obreros', null)

test('con recibo Q1-09 el presentismo corre sobre su $/h, no sobre el piso de plataforma', () => {
  const r = aplicarOverrides(obrero, {}, 'obreros', null, blanco('Z'), CUMPLE)
  assert.equal(r.presentismo?.basico, 6468)
  // 20 % × (100 h × $6.468 × 50 %) = $64.680. Con el piso daba $63.480.
  assert.equal(r.presentismo?.importe, 64680)
  assert.equal(r.sueldo?.valorHoraCategoria, 6468, 'el mismo $/h que el 0401')
})

test('el $/h escrito a mano en el blanco manda también en el presentismo', () => {
  const r = aplicarOverrides(obrero, { valorHoraRecibo: 7000 }, 'obreros', null, blanco('Z'), CUMPLE)
  assert.equal(r.presentismo?.basico, 7000)
})

test('sin recibo real queda el piso de plataforma (Castillo en Q2-09)', () => {
  const r = aplicarOverrides(obrero, {}, 'obreros', null, blanco('SIN'), CUMPLE)
  assert.equal(r.presentismo?.basico, 6348)
  assert.equal(valorHoraDelBlanco(blanco(null)), 6348)
})

test('el negro y el $/h de plataforma no se tocan', () => {
  const r = aplicarOverrides(obrero, {}, 'obreros', null, blanco('Z'), CUMPLE)
  assert.equal(r.valorHora, 7000)
  assert.equal(r.sueldo?.negro, 350000, '50 h negras × $7.000')
})
