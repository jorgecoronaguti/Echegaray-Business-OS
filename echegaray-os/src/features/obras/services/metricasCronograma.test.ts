// LO QUE ATRAPAN: que el pie de la 07 diga «en fecha» sobre una obra sin línea base sellada, que
// publique un conteo de atrasadas sin decir sobre cuántas miró, y que cuente las cabeceras de frente
// como si fueran actividades.

import test from 'node:test'
import assert from 'node:assert/strict'
import { metricasDelPlazo, type FilaConBase } from './metricasCronograma.ts'

const crono = (p: Partial<Parameters<typeof metricasDelPlazo>[1]> = {}) => ({
  finObra: '2026-09-21', sinSecuencia: false, criticas: ['a'], ...p,
})

/** El calendario de la obra, simulado: 5 días de trabajo por cada 7 corridos. */
const desvioDe = (finBase: string, fin: string) =>
  Math.round(((Date.parse(fin) - Date.parse(finBase)) / 86_400_000) * (5 / 7))

const de = (m: ReturnType<typeof metricasDelPlazo>, etiqueta: string) =>
  m.find((x) => x.etiqueta.startsWith(etiqueta))!

test('SIN LÍNEA BASE SELLADA no se publica «en fecha»: se dice que no hay base', () => {
  const filas: FilaConBase[] = [{ nivel: 1, finBase: null, desvio: null }]
  const m = metricasDelPlazo(filas, crono(), false, desvioDe)
  assert.equal(de(m, 'Fin de línea base').valor, 'sin sellar')
  assert.equal(de(m, 'Contra la base').valor, 'sin base')
  assert.equal(de(m, 'Contra la base').tono, undefined, 'sin base no se pinta ni de verde ni de rojo')
  assert.equal(de(m, 'Atrasadas').valor, 'sin base')
})

test('el desvío contra la base va en días de TRABAJO y con signo', () => {
  const filas: FilaConBase[] = [{ nivel: 1, finBase: '2026-09-05', desvio: 11 }]
  const m = metricasDelPlazo(filas, crono(), false, desvioDe)
  assert.equal(de(m, 'Fin de línea base').valor, '05/09')
  assert.equal(de(m, 'Contra la base').valor, '+11 d')
  assert.equal(de(m, 'Contra la base').contexto, 'días de trabajo')
  assert.equal(de(m, 'Contra la base').tono, 'neg')
})

test('adelantar contra la base va en pos, no en rojo', () => {
  const filas: FilaConBase[] = [{ nivel: 1, finBase: '2026-10-05', desvio: -10 }]
  const m = metricasDelPlazo(filas, crono(), false, desvioDe)
  assert.equal(de(m, 'Contra la base').tono, 'pos')
  assert.equal(de(m, 'Fin calculado').tono, undefined)
})

test('ATRASADAS DICE SOBRE CUÁNTAS MIRÓ: «0» a secas es otra obra', () => {
  const filas: FilaConBase[] = [
    { nivel: 1, finBase: '2026-09-05', desvio: 3 },
    { nivel: 1, finBase: '2026-09-05', desvio: 0 },
    { nivel: 1, finBase: null, desvio: null },
  ]
  const m = metricasDelPlazo(filas, crono(), false, desvioDe)
  assert.equal(de(m, 'Atrasadas').valor, '1')
  assert.equal(de(m, 'Atrasadas').contexto, 'de 2 con base', 'la que no tiene base no entra al total')
})

test('la cabecera de frente no se cuenta como actividad atrasada: duplicaría a sus hijas', () => {
  const filas: FilaConBase[] = [
    { nivel: 0, finBase: '2026-09-05', desvio: 15 },
    { nivel: 1, finBase: '2026-09-05', desvio: 15 },
  ]
  const m = metricasDelPlazo(filas, crono(), false, desvioDe)
  assert.equal(de(m, 'Atrasadas').valor, '1')
  assert.equal(de(m, 'Atrasadas').contexto, 'de 1 con base')
})

test('sin secuencia no hay fin de obra ni camino crítico, y se dicen con la misma palabra', () => {
  const m = metricasDelPlazo([], { finObra: null, sinSecuencia: true, criticas: [] }, false, desvioDe)
  assert.equal(de(m, 'Fin calculado').valor, 'sin secuencia')
  assert.equal(de(m, 'Camino crítico').valor, 'sin secuencia')
  assert.equal(de(m, 'Camino crítico').tono, undefined, 'un aviso naranja sobre algo que no se calculó')
})

test('el rótulo del fin distingue proyectado de calculado: no son la misma afirmación', () => {
  assert.equal(metricasDelPlazo([], crono(), true, desvioDe)[1].etiqueta, 'Fin proyectado')
  assert.equal(metricasDelPlazo([], crono(), false, desvioDe)[1].etiqueta, 'Fin calculado')
})
