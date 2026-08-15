// EL ANCLA SE REPONE CUANDO LA CELDA SE PIERDE — el defecto que dejó el automático apagado.
//
// EL CASO REAL: el rescate por rótulo del sello estuvo roto desde que existe (comparaba un rótulo
// recortado contra una constante con seis espacios de sangría), así que cada regeneración perdía el
// ancla. Y como sólo se re-estampaba al RENOVARSE el sello, el ancla no volvía nunca: con el sello
// vigente y la celda vacía, `IF(NOT(ISNUMBER(ancla));0;…)` deja el neto en 0 y la pestaña publica el
// conteo pelado. El automático apagado, sin un solo error a la vista.
//
// SIN RED: el cliente de Google es un doble que anota lo que le piden escribir. No toca el Sheet real.

import test from 'node:test'
import assert from 'node:assert/strict'
import { reanclar } from './caja-anexo-pestana.mjs'
import { instanteDelSello } from '../lib/caja-ancla-por-instante.mjs'

const dobleGoogle = () => {
  const escrituras = []
  return { escrituras, batchUpdateValues: async (_id, rangos) => escrituras.push(...rangos) }
}
const G = { fSello: 42 }
const ANCLA = instanteDelSello(new Date(2026, 7, 14, 16, 30, 0))

test('la celda vacía se repone con el ancla del centinela', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, NaN, ANCLA)
  assert.equal(g.escrituras.length, 1)
  assert.match(g.escrituras[0].range, /!F42$/)
  assert.equal(g.escrituras[0].values[0][0], ANCLA)
})

test('la celda en cero también: un 0 con formato de fecha se dibuja "30/12/1899"', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, 0, ANCLA)
  assert.equal(g.escrituras.length, 1, 'un 0 no es un instante, es una celda vacía con formato')
})

test('una celda que dice OTRO instante se corrige: manda el centinela, no la copia', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, ANCLA - 3, ANCLA)
  assert.equal(g.escrituras.length, 1)
  assert.equal(g.escrituras[0].values[0][0], ANCLA)
})

test('NO REESCRIBE CUANDO YA COINCIDE — el serial viaja como flotante', async () => {
  // Una comparación exacta reescribiría la celda en cada corrida: doce escrituras por día sobre una
  // pestaña, cada una con su chance de 429, para no cambiar nada.
  const g = dobleGoogle()
  await reanclar(g, G, ANCLA, ANCLA)
  await reanclar(g, G, ANCLA + 1e-9, ANCLA)
  assert.equal(g.escrituras.length, 0)
})

test('medio minuto de diferencia SÍ se corrige: la tolerancia es de un segundo, no de un rato', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, ANCLA + 30 / 86400, ANCLA)
  assert.equal(g.escrituras.length, 1)
})
