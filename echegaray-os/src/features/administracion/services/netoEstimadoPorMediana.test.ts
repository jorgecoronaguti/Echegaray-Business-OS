// EL NETO ESTIMADO SALE DE UNA MEDIANA, NO DEL ÚLTIMO RECIBO (coordinador, 14/09/2026).
//
// El defecto medido: Zogbe, quincena del 01/09, neto estimado $28.860 porque su recibo Q2-08 trae
// $276.751 de descuentos (embargo o adelanto) y el cociente salía de ese único recibo. Castillo, sin
// ningún recibo, quedaba «sin neto».
//
// LA MUTACIÓN QUE TIENE QUE PONER ESTO ROJO: volver a usar el cociente del último recibo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COCIENTE_MAXIMO, COCIENTE_MINIMO, entradaDeBlanco, mediana, proporcionDelNeto, tituloDelNetoEstimado,
  type ReciboDeSueldo,
} from './sueldoBlancoNegro.ts'

const recibo = (personaId: string, periodo: string, neto: number, bruto = 100000): ReciboDeSueldo => ({
  personaId, cuil: null, periodo, categoria: 'OFICIAL', valorHora: 6348, horasBlanco: 50, bruto, neto, driveFileId: null,
})

/** Zogbe: cinco recibos normales y el último anómalo (descuentos de un embargo). */
const ZOGBE = [
  recibo('zogbe', 'Q1-06/2026', 70000), recibo('zogbe', 'Q2-06/2026', 72000), recibo('zogbe', 'Q1-07/2026', 74000),
  recibo('zogbe', 'Q2-07/2026', 76000), recibo('zogbe', 'Q1-08/2026', 78000),
  recibo('zogbe', 'Q2-08/2026', 12810), // 12,81 %: el recibo anómalo, el más nuevo
]
/** El resto del plantel: cocientes 0,75 · 0,80 · 0,85, y uno fuera de rango (0,30) que no entra. */
const PLANTEL = [
  recibo('a', 'Q1-08/2026', 75000), recibo('b', 'Q1-08/2026', 80000), recibo('c', 'Q2-08/2026', 85000),
  recibo('d', 'Q2-08/2026', 30000),
  // Ni una final ni un recibo de otro año entran a ninguna mediana.
  { ...recibo('a', 'FINAL-08/2026', 10000) }, recibo('b', 'Q2-12/2025', 10000),
]
const TODOS = [...ZOGBE, ...PLANTEL]

test('ZOGBE: un recibo anómalo entre normales no decide — se usa la mediana de sus 6 recibos', () => {
  const p = proporcionDelNeto({ personaId: 'zogbe', cuil: null, periodo: 'Q1-09/2026', recibos: TODOS })
  assert.equal(p?.origen, 'persona')
  assert.equal(p?.recibos, 6)
  // Ordenados: 0,1281 · 0,70 · 0,72 · 0,74 · 0,76 · 0,78 → mediana (0,72 + 0,74) / 2.
  assert.ok(Math.abs((p?.cociente ?? 0) - 0.73) < 1e-9, `cociente ${p?.cociente}: MUTACIÓN — el último recibo daría 0,1281`)
  assert.equal(tituloDelNetoEstimado(p!), 'est. con la mediana de sus 6 recibos (73,0 %)')
})

test('HASTA LOS ÚLTIMOS 6: un recibo viejo no entra', () => {
  const viejo = recibo('zogbe', 'Q1-01/2026', 10000)
  const p = proporcionDelNeto({ personaId: 'zogbe', cuil: null, periodo: 'Q1-09/2026', recibos: [viejo, ...TODOS] })
  assert.equal(p?.recibos, 6)
  assert.ok(Math.abs((p?.cociente ?? 0) - 0.73) < 1e-9)
})

test('CASTILLO SIN RECIBOS: la mediana del plantel, sólo con cocientes dentro de [0,60 ; 0,90]', () => {
  const p = proporcionDelNeto({ personaId: 'castillo', cuil: null, periodo: 'Q1-09/2026', recibos: TODOS })
  assert.equal(p?.origen, 'plantel')
  // En rango: 0,70 · 0,72 · 0,74 · 0,76 · 0,78 (Zogbe) y 0,75 · 0,80 · 0,85. Afuera: 0,1281 y 0,30.
  assert.equal(p?.recibos, 8)
  assert.ok(Math.abs((p?.cociente ?? 0) - 0.755) < 1e-9, `cociente ${p?.cociente}`)
  assert.equal(tituloDelNetoEstimado(p!), 'est. con la mediana del plantel (75,5 %)')
  // Y con eso Castillo deja de quedar sin neto.
  const e = entradaDeBlanco({ personaId: 'castillo', cuil: null, periodo: 'Q1-09/2026', recibos: TODOS, pisoCategoria: 6348, netoDeNomina: null })
  assert.equal(e.proporcion?.origen, 'plantel')
})

test('UN SOLO RECIBO NO ALCANZA: con menos de 2 se usa el plantel, aunque el cociente sea normal', () => {
  const p = proporcionDelNeto({ personaId: 'nuevo', cuil: null, periodo: 'Q1-09/2026', recibos: [recibo('nuevo', 'Q2-08/2026', 88000), ...PLANTEL] })
  assert.equal(p?.origen, 'plantel')
  // En rango del plantel: 0,75 · 0,80 · 0,85 y el 0,88 de su único recibo (0,30 afuera) → (0,80 + 0,85) / 2.
  assert.ok(Math.abs((p?.cociente ?? 0) - 0.825) < 1e-9, `cociente ${p?.cociente}`)
})

test('UNA MEDIANA PROPIA FUERA DE RANGO TAMBIÉN VA AL PLANTEL', () => {
  const embargado = [recibo('e', 'Q1-08/2026', 40000), recibo('e', 'Q2-08/2026', 45000)]
  const p = proporcionDelNeto({ personaId: 'e', cuil: null, periodo: 'Q1-09/2026', recibos: [...embargado, ...PLANTEL] })
  assert.equal(p?.origen, 'plantel')
  assert.ok((p?.cociente ?? 0) >= COCIENTE_MINIMO && (p?.cociente ?? 1) <= COCIENTE_MAXIMO)
})

test('SÓLO RECIBOS ANTERIORES AL PERÍODO, Y SIN NADA NO HAY COCIENTE', () => {
  assert.equal(proporcionDelNeto({ personaId: 'x', cuil: null, periodo: 'Q1-06/2026', recibos: TODOS }), null,
    'antes de todos los recibos de 2026 no hay de dónde sacar la mediana')
  assert.equal(mediana([]), null)
  assert.equal(mediana([3, 1, 2]), 2)
})
